// =========================================================
// ARCHIE MIGRATION — INSTALLATION IDENTITY TESTS (spec §9)
//
// ARCHIE's identity is a LOGICAL id on the server, not the
// browser. Pinned:
//   * first use → registers a NEW environment + logical id,
//     stores only the environment id in localStorage
//   * returning environment (known id) → read, no re-register
//   * stale local id (server row gone) → re-registers under
//     the EXISTING logical identity
//   * a RESTORED environment is UNTRUSTED:
//     PENDING_OWNER_APPROVAL until the owner decides
// =========================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  ENVIRONMENT_STORAGE_KEY,
  getOrCreateInstallation,
  registerRestoredEnvironment,
} from "@/lib/archie/migration/identity";

type Row = Record<string, unknown>;

const ROW = {
  id: "env-1",
  logical_id: "logical-1",
  environment_label: "test env",
  platform: "desktop-browser",
  status: "ACTIVE",
  registered_at: "2026-01-01T00:00:00Z",
};

function fakeClient(opts: {
  byId?: Row | null; // row returned for .eq("id", envId).maybeSingle()
  existing?: Row[]; // rows returned for the oldest-installation lookup
  insertResult?: Row | null;
}) {
  const inserts: Row[] = [];
  const client = {
    from() {
      const q: Record<string, unknown> = {
        __kind: "select",
        select: () => q,
        eq: (_c: string, _v: unknown) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: opts.byId !== undefined ? opts.byId : null,
              error: null,
            }),
        }),
        order: () => q,
        limit: () => ({ data: opts.existing ?? [], error: null }),
        insert: (row: Row) => {
          inserts.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: opts.insertResult ?? ROW,
                  error: null,
                }),
            }),
          };
        },
      };
      return q;
    },
    __inserts: inserts,
  };
  return client as never;
}

beforeEach(() => {
  localStorage.clear();
});

describe("getOrCreateInstallation", () => {
  it("first use: registers a new environment + logical id, stores only the env id locally", async () => {
    const client = fakeClient({ existing: [], insertResult: ROW });
    const inst = await getOrCreateInstallation(client);
    expect(inst.logicalId).toBe("logical-1");
    expect(inst.status).toBe("ACTIVE");
    const inserted = (client as { __inserts: Row[] }).__inserts[0];
    expect(inserted.status).toBe("ACTIVE");
    expect(typeof inserted.id).toBe("string");
    expect(typeof inserted.logical_id).toBe("string");
    // localStorage holds ONLY the environment id — losing the device
    // never loses ARCHIE's logical identity
    const stored = localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
    expect(stored).toBe(inserted.id);
  });

  it("reuses the EXISTING logical id when other environments already registered", async () => {
    const client = fakeClient({
      existing: [{ ...ROW, id: "env-old", logical_id: "logical-9" }],
    });
    await getOrCreateInstallation(client);
    const inserted = (client as { __inserts: Row[] }).__inserts[0];
    expect(inserted.logical_id).toBe("logical-9");
  });

  it("known returning environment: read, never re-registered", async () => {
    localStorage.setItem(ENVIRONMENT_STORAGE_KEY, "env-1");
    const client = fakeClient({ byId: ROW });
    const inst = await getOrCreateInstallation(client);
    expect(inst.id).toBe("env-1");
    expect((client as { __inserts: Row[] }).__inserts).toHaveLength(0);
  });

  it("stale local id (server row deleted): re-registers a NEW environment", async () => {
    localStorage.setItem(ENVIRONMENT_STORAGE_KEY, "env-gone");
    const client = fakeClient({ byId: null, existing: [ROW] });
    const inst = await getOrCreateInstallation(client);
    expect((client as { __inserts: Row[] }).__inserts).toHaveLength(1);
    expect(inst.status).toBe("ACTIVE");
  });
});

describe("registerRestoredEnvironment", () => {
  it("same logical identity, NEW environment, UNTRUSTED until owner approval", async () => {
    const client = fakeClient({
      insertResult: {
        ...ROW,
        id: "env-new",
        logical_id: "logical-1",
        status: "PENDING_OWNER_APPROVAL",
        environment_label: "x — restored from migration package",
      },
    });
    const inst = await registerRestoredEnvironment(client, "logical-1");
    const inserted = (client as { __inserts: Row[] }).__inserts[0];
    expect(inserted.logical_id).toBe("logical-1"); // same ARCHIE
    expect(inserted.status).toBe("PENDING_OWNER_APPROVAL"); // new machine ≠ trusted
    expect(inserted.environment_label).toContain(
      "restored from migration package",
    );
    expect(inst.id).toBe("env-new");
    expect(localStorage.getItem(ENVIRONMENT_STORAGE_KEY)).toBe(inserted.id);
  });

  it("reports registration failures honestly", async () => {
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: null, error: { message: "denied" } }),
          }),
        }),
      }),
    };
    await expect(
      registerRestoredEnvironment(client as never, "logical-1"),
    ).rejects.toThrow("denied"); // server message propagates verbatim
  });
});
