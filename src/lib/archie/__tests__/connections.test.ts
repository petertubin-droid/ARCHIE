// =========================================================
// FRELUX ARCHIE — CONNECTED DEVICE, HOUSEHOLD & ACCOUNT
// INTELLIGENCE TESTS
//
// Hermetic: no real devices, no real browser transports. The
// core is pure and deterministic; the client is tested with
// the Supabase client + platform APIs mocked. These tests lock
// in the owner-directive invariants:
//   * connectivity is NEVER authorization
//   * pairing lifecycle is explicit — no implicit skips
//   * family members never inherit Owner privileges
//   * maintenance never installs unverified/incompatible/
//     malicious/unauthorized updates
//   * every action (success, failure, denial) is audited
//   * capabilities are reported honestly — a transport the
//     browser does not have is never claimed
//   * no fake integrations, no simulated device control
// =========================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------
// Supabase mock — chainable, records every write
// ---------------------------------------------------------
type Row = Record<string, unknown>;
const writes: Record<string, Row[]> = {};
const readRows: Record<string, Row[]> = {};

function makeQuery(table: string) {
  // A chainable-thenable builder: every method returns a fresh
  // callable that is BOTH chainable and awaitable, resolving
  // to the result captured at that point of the chain.
  const make = (result: () => unknown): unknown => {
    const fn = (() => make(result)) as unknown as Record<string, unknown>;
    fn.insert = (row: Row | Row[]) => {
      const rows = Array.isArray(row) ? row : [row];
      writes[table] = [...(writes[table] ?? []), ...rows];
      return make(() => ({ data: rows[0] ?? null, error: null }));
    };
    fn.update = (patch: Row) => {
      writes[table] = [...(writes[table] ?? []), patch];
      return make(result);
    };
    fn.select = () => make(result);
    fn.eq = () => make(result);
    fn.order = () => make(result);
    fn.limit = () => make(() => ({ data: readRows[table] ?? [], error: null }));
    fn.single = () =>
      make(() => ({
        // insert().select().single() returns the just-inserted row
        data:
          writes[table]?.[writes[table].length - 1] ??
          readRows[table]?.[0] ??
          null,
        error: null,
      }));
    fn.then = (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return fn;
  };
  return make(() => ({ data: readRows[table] ?? [], error: null }));
}

const getUserMock = vi.fn(async () => ({ data: { user: { id: "owner-1" } } }));

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => makeQuery(table),
  }),
}));

// ---- core imports (pure — no mocks needed) ----
import {
  authorizeDeviceAction,
  connectivityIsAuthorization,
  maintenanceDecision,
  normalizePermissions,
  pairingTransition,
  shapeAuditRow,
  withinWindow,
  CONNECTED_DEVICE_AUTHORITY,
  LEARNING_AUTHORITY,
  CODE_PRODUCTION_AUTHORITY,
  CONNECTION_TRANSPORTS,
  DEVICE_PERMISSIONS,
  type AccessScope,
  type ConnectionRecord,
  type DeviceUpdate,
} from "@studio-shared/archie-ai/native-engine/connections.ts";

// ---- client imports ----
import {
  detectConnectivityCapabilities,
  probeNetworkEndpoint,
  evaluateDeviceAction,
  ConnectionFailure,
  listConnections,
  saveConnection,
  transitionConnection,
  type ConnectedDeviceRow,
} from "@/lib/archie/connections";

const ROOT = resolve(__dirname, "../../../..");
const connRecord = (
  over: Partial<ConnectionRecord> = {},
): ConnectionRecord => ({
  id: "c1",
  owner_id: "owner-1",
  person_id: null,
  transport: "bluetooth",
  device_name: "Living-room speaker",
  device_kind: "speaker",
  manufacturer: "Acme",
  model: "S-1",
  status: "CONNECTED",
  transport_address: { ble_device_id: "xx" },
  permissions: ["media", "volume"],
  access_scope: {},
  last_seen_at: "2026-09-10T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(writes)) delete writes[k];
  for (const k of Object.keys(readRows)) delete readRows[k];
  getUserMock.mockClear();
});

// ---------------------------------------------------------
// VOCABULARY
// ---------------------------------------------------------
describe("canonical vocabulary", () => {
  it("covers every transport from the owner directive", () => {
    expect([...CONNECTION_TRANSPORTS]).toEqual([
      "bluetooth",
      "wifi",
      "hotspot",
      "usb",
      "local-network",
      "internet",
      "api",
    ]);
  });

  it("covers the canonical device permissions", () => {
    expect([...DEVICE_PERMISSIONS]).toEqual([
      "power",
      "media",
      "volume",
      "settings",
      "routines",
      "automation",
      "monitoring",
      "maintenance",
    ]);
  });

  it("normalizes away unknown permissions (never grants extras)", () => {
    expect(
      normalizePermissions(["media", "sudo-root", "volume", "settings"]),
    ).toEqual(["media", "volume", "settings"]);
    expect(normalizePermissions([])).toEqual([]);
  });
});

// ---------------------------------------------------------
// PAIRING STATE MACHINE
// ---------------------------------------------------------
describe("pairing lifecycle", () => {
  it("walks the explicit path discovered → pairing → paired → connected", () => {
    expect(pairingTransition("DISCOVERED", "pair-initiated")).toEqual({
      ok: true,
      to: "PAIRING",
    });
    expect(pairingTransition("PAIRING", "pair-confirmed")).toEqual({
      ok: true,
      to: "PAIRED",
    });
    expect(pairingTransition("PAIRED", "connect")).toEqual({
      ok: true,
      to: "CONNECTED",
    });
    expect(pairingTransition("CONNECTED", "disconnect")).toEqual({
      ok: true,
      to: "PAIRED",
    });
    expect(pairingTransition("CONNECTED", "suspend")).toEqual({
      ok: true,
      to: "SUSPENDED",
    });
    expect(pairingTransition("SUSPENDED", "resume")).toEqual({
      ok: true,
      to: "PAIRED",
    });
  });

  it("never lets a merely-discovered device become connected", () => {
    // the core honesty rule: connectivity is NOT authorization
    expect(connectivityIsAuthorization()).toBe(false);
    expect(pairingTransition("DISCOVERED", "connect").ok).toBe(false);
    expect(pairingTransition("DISCOVERED", "connect").to).toBe("DISCOVERED");
  });

  it("refuses invalid transitions without changing state", () => {
    expect(pairingTransition("PAIRED", "pair-initiated").ok).toBe(false);
    expect(pairingTransition("SUSPENDED", "connect").ok).toBe(false);
  });

  it("makes REVOKED terminal — a revoked connection never revives", () => {
    for (const event of [
      "pair-initiated",
      "pair-confirmed",
      "connect",
      "resume",
    ] as const) {
      expect(pairingTransition("REVOKED", event).ok).toBe(false);
    }
    expect(pairingTransition("CONNECTED", "revoke")).toEqual({
      ok: true,
      to: "REVOKED",
    });
  });
});

// ---------------------------------------------------------
// PERMISSION / SCOPE GATE
// ---------------------------------------------------------
describe("authorizeDeviceAction", () => {
  const owner = { type: "owner" as const, userId: "owner-1" };
  const at = new Date("2026-09-10T15:30:00.000Z");

  it("authorizes a granted permission on a connected device", () => {
    expect(authorizeDeviceAction(connRecord(), owner, "media", { at })).toEqual(
      { authorized: true, reason: "ok" },
    );
  });

  it("denies a permission that was never granted", () => {
    expect(authorizeDeviceAction(connRecord(), owner, "power", { at })).toEqual(
      { authorized: false, reason: "permission-not-granted" },
    );
  });

  it("denies suspended, revoked and unpaired connections", () => {
    expect(
      authorizeDeviceAction(
        connRecord({ status: "SUSPENDED" }),
        owner,
        "media",
        {
          at,
        },
      ),
    ).toEqual({ authorized: false, reason: "connection-suspended" });
    expect(
      authorizeDeviceAction(connRecord({ status: "REVOKED" }), owner, "media", {
        at,
      }),
    ).toEqual({ authorized: false, reason: "connection-revoked" });
    expect(
      authorizeDeviceAction(
        connRecord({ status: "DISCOVERED" }),
        owner,
        "media",
        {
          at,
        },
      ),
    ).toEqual({ authorized: false, reason: "connection-not-paired" });
  });

  it("family members never inherit Owner privileges", () => {
    const family = {
      type: "family" as const,
      userId: "fam-1",
      personId: "p-2",
    };
    // connection bound to ANOTHER person
    expect(
      authorizeDeviceAction(
        connRecord({ person_id: "p-1", permissions: ["media"] }),
        family,
        "media",
        { at },
      ),
    ).toEqual({ authorized: false, reason: "family-not-authorized" });
    // family on an Owner-bound connection (person_id null)
    expect(
      authorizeDeviceAction(
        connRecord({ person_id: null, permissions: ["media"] }),
        family,
        "media",
        { at },
      ),
    ).toEqual({ authorized: false, reason: "family-not-authorized" });
    // family acts ONLY on their own bound connection
    expect(
      authorizeDeviceAction(
        connRecord({ person_id: "p-2", permissions: ["media"] }),
        family,
        "media",
        { at },
      ),
    ).toEqual({ authorized: true, reason: "ok" });
  });

  it("respects access-scope time windows (wrap-over-midnight included)", () => {
    const scope: AccessScope = { windows: [{ start: "22:00", end: "06:00" }] };
    expect(withinWindow(scope, new Date("2026-09-10T23:30:00"))).toBe(true);
    expect(withinWindow(scope, new Date("2026-09-10T03:30:00"))).toBe(true);
    expect(withinWindow(scope, new Date("2026-09-10T12:00:00"))).toBe(false);
    expect(
      authorizeDeviceAction(
        connRecord({ access_scope: scope }),
        owner,
        "media",
        { at: new Date("2026-09-10T12:00:00") },
      ),
    ).toEqual({ authorized: false, reason: "scope-window-closed" });
  });

  it("no windows means no time restriction; bad window formats are ignored", () => {
    expect(withinWindow({}, at)).toBe(true);
    const bad: AccessScope = { windows: [{ start: "25:99", end: "soon" }] };
    expect(withinWindow(bad, at)).toBe(false); // invalid window = closed
  });

  it("enforces an explicit action list when present", () => {
    const conn = connRecord({
      access_scope: { actions: ["play", "pause"] },
    });
    expect(
      authorizeDeviceAction(conn, owner, "media", { action: "play", at }),
    ).toEqual({ authorized: true, reason: "ok" });
    expect(
      authorizeDeviceAction(conn, owner, "media", { action: "eject", at }),
    ).toEqual({ authorized: false, reason: "action-out-of-scope" });
  });
});

// ---------------------------------------------------------
// MAINTENANCE / UPGRADE GATE
// ---------------------------------------------------------
describe("maintenanceDecision", () => {
  const update = (over: Partial<DeviceUpdate> = {}): DeviceUpdate => ({
    version: "2.1.0",
    compatible: true,
    verified: true,
    ownerAuthorized: true,
    ...over,
  });
  const conn = () => connRecord({ permissions: ["maintenance"] });

  it("installs only verified, compatible, owner-authorized updates", () => {
    expect(maintenanceDecision(conn(), "install-update", update()).action).toBe(
      "install-update",
    );
  });

  it("never installs unverified updates", () => {
    expect(
      maintenanceDecision(conn(), "install-update", update({ verified: false }))
        .reason,
    ).toBe("update not verified");
  });

  it("never installs incompatible updates", () => {
    expect(
      maintenanceDecision(
        conn(),
        "install-update",
        update({ compatible: false }),
      ).reason,
    ).toBe("update incompatible with device");
  });

  it("never installs unauthorized updates", () => {
    expect(
      maintenanceDecision(
        conn(),
        "install-update",
        update({ ownerAuthorized: false }),
      ).reason,
    ).toBe("update not owner-authorized");
  });

  it("never installs flagged-malicious updates", () => {
    expect(
      maintenanceDecision(
        conn(),
        "install-update",
        update({ flaggedMalicious: true }),
      ).reason,
    ).toBe("update flagged malicious");
  });

  it("refuses installs without the maintenance permission", () => {
    expect(
      maintenanceDecision(
        connRecord({ permissions: ["media"] }),
        "install-update",
        update(),
      ).reason,
    ).toBe("maintenance permission not granted");
  });

  it("permits read-only maintenance under monitoring OR maintenance", () => {
    expect(
      maintenanceDecision(
        connRecord({ permissions: ["monitoring"] }),
        "diagnose",
        null,
      ).action,
    ).toBe("recommend");
    expect(maintenanceDecision(conn(), "check-version", null).action).toBe(
      "recommend",
    );
    expect(
      maintenanceDecision(
        connRecord({ permissions: ["media"] }),
        "diagnose",
        null,
      ).action,
    ).toBe("deny");
  });

  it("refuses maintenance on unpaired devices", () => {
    expect(
      maintenanceDecision(
        connRecord({ status: "DISCOVERED" }),
        "diagnose",
        null,
      ).action,
    ).toBe("deny");
  });
});

// ---------------------------------------------------------
// AUDIT SHAPING
// ---------------------------------------------------------
describe("audit trail", () => {
  it("records denials exactly like successes", () => {
    const row = shapeAuditRow({
      connectionId: "c1",
      ownerId: "owner-1",
      actor: { type: "owner", userId: "owner-1" },
      action: "power",
      request: { permission: "power" },
      result: "denied",
      detail: { reason: "permission-not-granted" },
      verified: false,
    });
    expect(row.result).toBe("denied");
    expect(row.verified).toBe(false);
  });

  it("refuses anonymous family access — it is never auditable", () => {
    expect(() =>
      shapeAuditRow({
        connectionId: "c1",
        ownerId: "owner-1",
        actor: { type: "family", userId: "fam-1" },
        action: "media",
        request: {},
        result: "denied",
        detail: {},
        verified: false,
      }),
    ).toThrow(/personId/);
  });
});

// ---------------------------------------------------------
// PRINCIPLES — the owner directive is encoded
// ---------------------------------------------------------
describe("permanent principles", () => {
  it("encodes the connected-device authority chain and honesty rule", () => {
    expect(CONNECTED_DEVICE_AUTHORITY.chain).toEqual([
      "IDENTITY",
      "DEVICE",
      "ACCOUNT",
      "PERMISSIONS",
      "ACCESS SCOPE",
      "AUDIT HISTORY",
    ]);
    expect(CONNECTED_DEVICE_AUTHORITY.rule).toContain(
      "Connectivity alone never constitutes authorization",
    );
    expect(CONNECTED_DEVICE_AUTHORITY.honestyRule).toContain(
      "No fake integrations",
    );
    expect(CONNECTED_DEVICE_AUTHORITY.familyRule).toContain(
      "never automatically inherit",
    );
  });

  it("encodes the learning authority and its production limit", () => {
    expect(LEARNING_AUTHORITY.rule).toContain(
      "without requiring Owner approval for every learning activity",
    );
    expect(LEARNING_AUTHORITY.limit).toContain(
      "does NOT grant permission to modify production code",
    );
    expect(LEARNING_AUTHORITY.architecture).toContain("VERIFY");
  });

  it("encodes the code/production approval chain", () => {
    expect(CODE_PRODUCTION_AUTHORITY.changeChain).toEqual([
      "DISCOVER",
      "ANALYZE",
      "PROPOSE",
      "OWNER APPROVAL",
      "STAGE",
      "TEST",
      "VERIFY",
      "OWNER APPROVAL",
      "PRODUCTION",
    ]);
    expect(CODE_PRODUCTION_AUTHORITY.finalAuthority).toContain(
      "The Owner remains the final authority",
    );
  });
});

// ---------------------------------------------------------
// CLIENT RUNTIME — honest capabilities + persistence
// ---------------------------------------------------------
describe("capability detection (honest)", () => {
  it("reports a transport the environment lacks as unavailable — never claimed", () => {
    const caps = detectConnectivityCapabilities();
    expect(caps.bluetooth).toBe(false); // no navigator.bluetooth here
    expect(caps.usb).toBe(false);
    expect(caps.systemVolume).toBe(false); // browsers cannot do this
  });

  it("detects real transports when present", () => {
    const original = navigator as unknown as Record<string, unknown>;
    (navigator as unknown as Record<string, unknown>).bluetooth = {
      requestDevice: () => Promise.resolve({}),
    };
    (navigator as unknown as Record<string, unknown>).usb = {
      requestDevice: () => Promise.resolve({}),
    };
    const caps = detectConnectivityCapabilities();
    expect(caps.bluetooth).toBe(true);
    expect(caps.usb).toBe(true);
    delete (navigator as unknown as Record<string, unknown>).bluetooth;
    delete (navigator as unknown as Record<string, unknown>).usb;
    void original;
  });
});

describe("network probe (honest)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a reachable endpoint without fabricating content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ type: "opaque", status: 0 })),
    );
    const res = await probeNetworkEndpoint("http://192.168.1.40:8080/");
    expect(res).toEqual({ reachable: true, status: 0 });
  });

  it("reports unreachable endpoints honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = await probeNetworkEndpoint("http://10.0.0.99/");
    expect(res.reachable).toBe(false);
    if (!res.reachable) {
      expect(res.reason).toBe("network-unreachable");
      expect(res.message).toContain("Failed to fetch");
    }
  });
});

describe("registry persistence (owner-scoped)", () => {
  it("saves a paired candidate WITHOUT granting more than asked", async () => {
    const row = await saveConnection({
      candidate: {
        transport: "usb",
        device_name: "Desk lamp",
        device_kind: "smarthome",
        manufacturer: "Acme",
        model: "L-1",
        transport_address: { usb_vendor_id: 1234, usb_product_id: 5678 },
        battery_pct: null,
        capabilities: ["usb"],
      },
      permissions: ["power", "power-all", "settings"], // power-all is not canonical
    });
    // pairing + audit were both written
    expect(writes["frelux_archie_connections"]?.length).toBe(1);
    expect(writes["frelux_archie_connection_events"]?.length).toBe(1);
    // unknown permission silently dropped — never granted
    expect(row.permissions).toEqual(["power", "settings"]);
    // a saved connection starts PAIRED — never auto-CONNECTED
    expect(row.status).toBe("PAIRED");
  });

  it("lists connections through the owner-scoped query", async () => {
    readRows["frelux_archie_connections"] = [connRecord() as unknown as Row];
    const list = await listConnections();
    expect(list.length).toBe(1);
    expect(list[0].device_name).toBe("Living-room speaker");
  });

  it("refuses invalid lifecycle transitions and audits the denial", async () => {
    const conn: ConnectedDeviceRow = {
      id: "c1",
      owner_id: "owner-1",
      person_id: null,
      trusted_device_id: null,
      transport: "bluetooth",
      device_name: "Living-room speaker",
      device_kind: "speaker",
      manufacturer: "Acme",
      model: "S-1",
      status: "DISCOVERED",
      transport_address: {},
      permissions: ["media"],
      access_scope: {},
      last_seen_at: "2026-09-10T10:00:00.000Z",
      created_date: "2026-09-10T10:00:00.000Z",
      updated_date: "2026-09-10T10:00:00.000Z",
    };
    await expect(transitionConnection(conn, "connect")).rejects.toThrow(
      ConnectionFailure,
    );
    // the refused transition is audited as a denial
    const events = writes["frelux_archie_connection_events"] ?? [];
    expect(events.length).toBe(1);
    expect(events[0].result).toBe("denied");
  });

  it("evaluates actions through the core gate and audits the decision", async () => {
    const conn: ConnectedDeviceRow = {
      id: "c1",
      owner_id: "owner-1",
      person_id: null,
      trusted_device_id: null,
      transport: "bluetooth",
      device_name: "Living-room speaker",
      device_kind: "speaker",
      manufacturer: "Acme",
      model: "S-1",
      status: "CONNECTED",
      transport_address: {},
      permissions: ["media"],
      access_scope: {},
      last_seen_at: "2026-09-10T10:00:00.000Z",
      created_date: "2026-09-10T10:00:00.000Z",
      updated_date: "2026-09-10T10:00:00.000Z",
    };
    const allowed = await evaluateDeviceAction(
      conn,
      { type: "owner", userId: "owner-1" },
      "media",
      { action: "play" },
    );
    expect(allowed.authorized).toBe(true);
    const denied = await evaluateDeviceAction(
      conn,
      { type: "owner", userId: "owner-1" },
      "power",
    );
    expect(denied.authorized).toBe(false);
    // success AND denial both audited
    const events = writes["frelux_archie_connection_events"] ?? [];
    expect(events.map((e) => e.result)).toEqual(["success", "denied"]);
  });
});

// ---------------------------------------------------------
// NO FABRICATION — static integrity of the real modules
// ---------------------------------------------------------
describe("no fake integrations (static integrity)", () => {
  const core = readFileSync(
    resolve(
      ROOT,
      "supabase/functions/_shared/archie-ai/native-engine/connections.ts",
    ),
    "utf8",
  );
  const runtime = readFileSync(
    resolve(ROOT, "src/lib/archie/connections.ts"),
    "utf8",
  );
  const codeOf = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, " ") // /* */ block comments
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");

  it("the engine core is deterministic — no randomness, no hidden clock", () => {
    expect(codeOf(core)).not.toMatch(/Math\.random|Date\.now/);
  });

  it("the runtime uses the REAL platform APIs, not simulations", () => {
    const code = codeOf(runtime);
    expect(code).toContain("navigator.bluetooth.requestDevice");
    expect(code).toContain("navigator.usb.requestDevice");
    expect(code).toMatch(/await fetch\(|fetch\(/);
    // the browser's own pairing prompt is the pairing requirement
    expect(code).toContain("requestDevice");
    expect(code).not.toMatch(/simulat/);
  });

  it("both modules re-state the honesty rule", () => {
    expect(core).toContain("Connectivity is NEVER authorization");
    expect(runtime).toContain("no fake integrations");
  });
});
