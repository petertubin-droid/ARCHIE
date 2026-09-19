// =========================================================
// ARCHIE NATIVE ENGINE — CONNECTED DEVICE AUTHORITY — TESTS
// supabase/functions/_shared/archie-ai/native-engine/connections.test.ts
//
// Evidence for the owner directive "Trusted Device, Household
// & Connected Account Intelligence": the explicit pairing
// lifecycle (a reachable device is NEVER authorized),
// permission/scope evaluation with typed honest denials, the
// maintenance/update gate (never install unverified code),
// and audit shaping (denials recorded like successes).
// =========================================================
import { describe, expect, it } from "vitest";
import {
  authorizeDeviceAction,
  connectivityIsAuthorization,
  maintenanceDecision,
  normalizePermissions,
  pairingTransition,
  shapeAuditRow,
  withinWindow,
  type Actor,
  type ConnectionRecord,
  type DevicePermission,
  type DeviceUpdate,
} from "./connections.ts";

function connection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: "conn-1",
    owner_id: "owner-user-id",
    person_id: null,
    transport: "bluetooth",
    device_name: "Living Room Speaker",
    device_kind: "speaker",
    manufacturer: null,
    model: null,
    status: "CONNECTED",
    transport_address: { deviceId: "real-address" },
    permissions: ["volume", "monitoring"],
    access_scope: { actions: ["volume"] },
    last_seen_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

const OWNER: Actor = { type: "owner", userId: "owner-user-id" };
const ARCHIE: Actor = { type: "archie", userId: "owner-user-id" };
const AT = new Date("2026-09-16T12:00:00.000Z");

describe("pairing state machine — explicit, no implicit skips", () => {
  it("walks the full happy path: DISCOVERED → CONNECTED → PAIRED → REVOKED", () => {
    let { to } = pairingTransition("DISCOVERED", "pair-initiated");
    expect(to).toBe("PAIRING");
    ({ to } = pairingTransition(to, "pair-confirmed"));
    expect(to).toBe("PAIRED");
    ({ to } = pairingTransition(to, "connect"));
    expect(to).toBe("CONNECTED");
    ({ to } = pairingTransition(to, "disconnect"));
    expect(to).toBe("PAIRED");
    ({ to } = pairingTransition(to, "revoke"));
    expect(to).toBe("REVOKED");
  });

  it("supports suspend/resume", () => {
    expect(pairingTransition("CONNECTED", "suspend").to).toBe("SUSPENDED");
    expect(pairingTransition("SUSPENDED", "resume").to).toBe("PAIRED");
  });

  it("REVOKED is terminal — no event ever revives it", () => {
    for (const event of [
      "pair-initiated",
      "pair-confirmed",
      "connect",
      "resume",
    ] as const) {
      const r = pairingTransition("REVOKED", event);
      expect(r.ok).toBe(false);
      expect(r.to).toBe("REVOKED");
    }
  });

  it("a merely-REACHABLE device can never jump straight to CONNECTED", () => {
    const r = pairingTransition("DISCOVERED", "connect");
    expect(r.ok).toBe(false);
    expect(r.to).toBe("DISCOVERED");
    const direct = pairingTransition("DISCOVERED", "pair-confirmed");
    expect(direct.ok).toBe(true); // but only via explicit confirmation
  });

  it("failed pairing returns the device to DISCOVERED", () => {
    expect(pairingTransition("PAIRING", "pair-failed").to).toBe("DISCOVERED");
  });

  it("connectivity is NEVER authorization — by construction", () => {
    expect(connectivityIsAuthorization()).toBe(false);
  });
});

describe("permission & scope evaluation", () => {
  it("normalizes permissions: filters unknown, dedupes, canonical order", () => {
    const out = normalizePermissions([
      "monitoring",
      "not-a-permission",
      "volume",
      "monitoring",
    ]);
    expect(out).toEqual(["volume", "monitoring"]);
  });

  it("accepts any time within an explicit window and rejects outside it", () => {
    const scope = { windows: [{ start: "09:00", end: "17:00" }] };
    expect(withinWindow(scope, new Date("2026-09-16T09:30:00Z"))).toBe(true);
    expect(withinWindow(scope, new Date("2026-09-16T18:30:00Z"))).toBe(false);
  });

  it("wraps windows over midnight", () => {
    const scope = { windows: [{ start: "22:00", end: "06:00" }] };
    expect(withinWindow(scope, new Date("2026-09-16T23:59:00Z"))).toBe(true);
    expect(withinWindow(scope, new Date("2026-09-16T12:00:00Z"))).toBe(false);
  });

  it("no window means always allowed; invalid windows are skipped honestly", () => {
    expect(withinWindow({}, AT)).toBe(true);
    // a malformed window is skipped; with no valid window left,
    // the gate denies rather than guessing
    expect(
      withinWindow({ windows: [{ start: "25:99", end: "06:00" }] }, AT),
    ).toBe(false);
  });
});

describe("authorizeDeviceAction — the core authorization gate", () => {
  it("authorizes the owner for a granted permission within scope", () => {
    expect(
      authorizeDeviceAction(connection(), OWNER, "volume", { action: "volume", at: AT }),
    ).toEqual({ authorized: true, reason: "ok" });
  });

  it("denies with typed reasons across the lifecycle", () => {
    const cases: Array<[ConnectionRecord["status"], string]> = [
      ["REVOKED", "connection-revoked"],
      ["SUSPENDED", "connection-suspended"],
      ["DISCOVERED", "connection-not-paired"],
      ["PAIRING", "connection-not-paired"],
    ];
    for (const [status, reason] of cases) {
      const d = authorizeDeviceAction(
        connection({ status }),
        OWNER,
        "volume",
        { action: "volume", at: AT },
      );
      expect(d).toEqual({ authorized: false, reason });
    }
  });

  it("family members act ONLY on connections bound to their own person", () => {
    const family: Actor = {
      type: "family",
      userId: "family-user-id",
      personId: "person-7",
    };
    // own person-bound connection → allowed
    expect(
      authorizeDeviceAction(
        connection({ person_id: "person-7" }),
        family,
        "volume",
        { action: "volume", at: AT },
      ).authorized,
    ).toBe(true);
    // owner's connection (person_id null) → never inherited
    expect(
      authorizeDeviceAction(connection(), family, "volume", {
        action: "volume",
        at: AT,
      }),
    ).toEqual({ authorized: false, reason: "family-not-authorized" });
    // another family member's connection → never inherited
    expect(
      authorizeDeviceAction(
        connection({ person_id: "person-9" }),
        family,
        "volume",
        { action: "volume", at: AT },
      ).reason,
    ).toBe("family-not-authorized");
  });

  it("ARCHIE acts only on the Owner's connections", () => {
    expect(
      authorizeDeviceAction(connection(), ARCHIE, "volume", {
        action: "volume",
        at: AT,
      }).authorized,
    ).toBe(true);
    expect(
      authorizeDeviceAction(connection({ owner_id: "other-owner" }), ARCHIE, "volume", {
        action: "volume",
        at: AT,
      }),
    ).toEqual({ authorized: false, reason: "actor-not-owner" });
  });

  it("denies ungranted permissions and out-of-scope actions and closed windows", () => {
    const granted = connection(); // permissions: volume, monitoring
    const denied: DevicePermission = "maintenance";
    expect(
      authorizeDeviceAction(granted, OWNER, denied, { action: "volume", at: AT }).reason,
    ).toBe("permission-not-granted");

    expect(
      authorizeDeviceAction(granted, OWNER, "volume", { action: "channel", at: AT }).reason,
    ).toBe("action-out-of-scope");

    const windowed = connection({
      access_scope: { windows: [{ start: "01:00", end: "02:00" }] },
    });
    expect(
      authorizeDeviceAction(windowed, OWNER, "volume", {
        action: "volume",
        at: new Date("2026-09-16T12:00:00Z"),
      }).reason,
    ).toBe("scope-window-closed");
  });

  it("never silently falls back to allow — every denial is typed", () => {
    const results = [
      authorizeDeviceAction(connection({ status: "REVOKED" }), OWNER, "volume", {}),
      authorizeDeviceAction(connection(), { type: "family" as never, userId: "x" }, "volume", {}),
    ];
    expect(results.every((r) => r.authorized === false)).toBe(true);
  });
});

describe("maintenance & update gate — never install unverified code", () => {
  const GOOD_UPDATE: DeviceUpdate = {
    version: "2.1.0",
    compatible: true,
    verified: true,
    ownerAuthorized: true,
  };

  it("installs only verified, compatible, owner-authorized updates", () => {
    const conn = connection({ permissions: ["volume", "monitoring", "maintenance"] });
    const d = maintenanceDecision(conn, "install-update", GOOD_UPDATE);
    expect(d.action).toBe("install-update");
    expect(d.reason).toContain("authorized");
  });

  it("denies on every failure mode, each with an honest reason", () => {
    const conn = connection({ permissions: ["volume", "monitoring", "maintenance"] });
    const cases: Array<[ReturnType<typeof connection> | ConnectionRecord, DeviceUpdate | null, string]> = [
      [connection({ status: "DISCOVERED" }), GOOD_UPDATE, "not paired/connected"],
      [connection(), GOOD_UPDATE, "maintenance permission not granted"],
      [conn, null, "no update provided"],
      [conn, { ...GOOD_UPDATE, flaggedMalicious: true }, "flagged malicious"],
      [conn, { ...GOOD_UPDATE, verified: false }, "not verified"],
      [conn, { ...GOOD_UPDATE, compatible: false }, "incompatible"],
      [conn, { ...GOOD_UPDATE, ownerAuthorized: false }, "not owner-authorized"],
    ];
    for (const [c, u, reasonPart] of cases) {
      const d = maintenanceDecision(c, "install-update", u);
      expect(d.action).toBe("deny");
      expect(d.reason).toContain(reasonPart);
    }
  });

  it("permits read-only maintenance under monitoring or maintenance grants", () => {
    expect(
      maintenanceDecision(connection(), "diagnose", null).action,
    ).toBe("recommend");
    expect(
      maintenanceDecision(connection({ permissions: ["monitoring"] }), "check-version", null)
        .action,
    ).toBe("recommend");
    expect(
      maintenanceDecision(connection({ permissions: ["volume"] }), "diagnose", null).action,
    ).toBe("deny");
    expect(
      maintenanceDecision(connection({ status: "PAIRING" }), "diagnose", null).action,
    ).toBe("deny");
  });

  it("treats rollback as recovery under the maintenance grant", () => {
    const d = maintenanceDecision(
      connection({ permissions: ["maintenance"] }),
      "rollback",
      null,
    );
    expect(d.action).toBe("recommend");
    expect(d.reason).toContain("maintenance grant");
  });
});

describe("audit shaping — denials are recorded exactly like successes", () => {
  it("shapes every field of an audit row", () => {
    const row = shapeAuditRow({
      connectionId: "conn-1",
      ownerId: "owner-user-id",
      actor: OWNER,
      action: "volume",
      request: { level: 20 },
      result: "success",
      detail: { verified: true },
      verified: true,
    });
    expect(row).toEqual({
      connection_id: "conn-1",
      owner_id: "owner-user-id",
      actor_type: "owner",
      action: "volume",
      request: { level: 20 },
      result: "success",
      detail: { verified: true },
      verified: true,
    });
  });

  it("records a DENIAL with the same fidelity as a success", () => {
    const row = shapeAuditRow({
      connectionId: "conn-1",
      ownerId: "owner-user-id",
      actor: OWNER,
      action: "channel",
      request: {},
      result: "denied",
      detail: { reason: "action-out-of-scope" },
      verified: false,
    });
    expect(row.result).toBe("denied");
    expect(row.verified).toBe(false);
  });

  it("refuses anonymous family actors — unauditable access is never shaped", () => {
    expect(() =>
      shapeAuditRow({
        connectionId: "conn-1",
        ownerId: "owner-user-id",
        actor: { type: "family", userId: "u" },
        action: "x",
        request: {},
        result: "denied",
        detail: {},
        verified: false,
      }),
    ).toThrow("personId");
  });
});
