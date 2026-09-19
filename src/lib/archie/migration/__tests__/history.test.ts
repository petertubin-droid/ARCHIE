// =========================================================
// ARCHIE MIGRATION — HISTORY TESTS (spec §23)
//
// The append-only migration audit trail:
//   * every record maps camelCase input → snake_case row
//   * errors are THROWN honestly (evidence never silently lost)
//   * history reads newest-first with the documented bound
//   * rowToRecord round-trips, including the created_date
//     fallback for legacy rows
// =========================================================
import { describe, it, expect } from "vitest";
import {
  recordMigration,
  fetchMigrationHistory,
  rowToRecord,
} from "@/lib/archie/migration/history";

type Row = Record<string, unknown>;

function fakeSupabase(
  tables: Record<string, Row[]>,
  insertResult?: { id: string } | null,
  fail?: string,
) {
  const inserted: Row[] = [];
  const client = {
    from(t: string) {
      const rows = tables[t] ?? (tables[t] = []);
      const q: Record<string, unknown> = {
        insert: (row: Row) => {
          inserted.push(row);
          return {
            select: () => ({
              single: () =>
                fail
                  ? Promise.resolve({ data: null, error: { message: fail } })
                  : Promise.resolve({
                      data: insertResult ?? { id: "rec-1" },
                      error: null,
                    }),
            }),
          };
        },
        select: () => q,
        order: (_c: string, o: { ascending?: boolean }) => {
          (q as { __asc?: boolean }).__asc = o?.ascending !== false;
          return q;
        },
        limit: (n: number) => ({ data: rows.slice(0, n), error: null }),
      };
      return q;
    },
    __inserted: inserted,
  };
  return client as never;
}

const INPUT = {
  packageId: "pkg-1",
  mode: "FULL" as never,
  status: "COMPLETED" as never,
  sourceEnvironment: "phone",
  destinationEnvironment: "vps",
  archieVersion: "1.0.0",
  ownerAuthorizationRecordId: "rec-auth",
  events: ["verified", "restored"],
  verificationResult: "PASS",
  restorationResult: "ok",
  componentsIncluded: ["lexicon"],
  componentsExcluded: ["ads"],
  errors: [],
};

describe("recordMigration", () => {
  it("appends a complete snake_case audit row and returns the record id", async () => {
    const client = fakeSupabase({}, { id: "rec-42" });
    const id = await recordMigration({ supabase: client, ...INPUT });
    expect(id).toBe("rec-42");
    const row = (client as { __inserted: Row[] }).__inserted[0];
    expect(row.package_id).toBe("pkg-1");
    expect(row.source_environment).toBe("phone");
    expect(row.destination_environment).toBe("vps");
    expect(row.owner_authorization_record_id).toBe("rec-auth");
    expect(row.components_included).toEqual(["lexicon"]);
    expect(row.components_excluded).toEqual(["ads"]);
    expect(row.verification_result).toBe("PASS");
    expect(row.events).toEqual(["verified", "restored"]);
  });

  it("defaults empty arrays for optional fields", async () => {
    const client = fakeSupabase({}, { id: "rec-1" });
    await recordMigration({
      supabase: client,
      packageId: "p",
      mode: "RESTORE" as never,
      status: "FAILED" as never,
      sourceEnvironment: "a",
      destinationEnvironment: "b",
      archieVersion: "1",
      ownerAuthorizationRecordId: null,
    });
    const row = (client as { __inserted: Row[] }).__inserted[0];
    expect(row.events).toEqual([]);
    expect(row.errors).toEqual([]);
    expect(row.components_included).toEqual([]);
    expect(row.components_excluded).toEqual([]);
    expect(row.verification_result).toBeNull();
  });

  it("THROWS when the audit write fails — evidence is never silently lost", async () => {
    const client = fakeSupabase({}, null, "RLS denied");
    await expect(
      recordMigration({ supabase: client, ...INPUT }),
    ).rejects.toThrow("Could not record migration history: RLS denied");
  });
});

describe("fetchMigrationHistory", () => {
  it("reads newest-first with the documented default bound of 50", async () => {
    const tables = {
      archie_migration_history: [
        { id: "r2", package_id: "p2", created_at: "2026-09-18T00:00:00Z" },
        { id: "r1", package_id: "p1", created_at: "2026-09-17T00:00:00Z" },
      ],
    };
    const client = fakeSupabase(tables);
    const recs = await fetchMigrationHistory(client as never);
    expect(recs).toHaveLength(2);
    expect(recs[0].packageId).toBe("p2");
    expect(recs[1].packageId).toBe("p1");
  });

  it("propagates database errors honestly", async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    await expect(fetchMigrationHistory(client as never)).rejects.toThrow(
      "boom",
    );
  });
});

describe("rowToRecord", () => {
  it("maps a full row", () => {
    const rec = rowToRecord({
      id: "r1",
      package_id: "p1",
      mode: "FULL",
      status: "COMPLETED",
      source_environment: "a",
      destination_environment: "b",
      archie_version: "1",
      owner_authorization_record_id: "auth-1",
      created_at: "2026-09-18T00:00:00Z",
      events: ["e"],
      components_included: ["x"],
      components_excluded: ["y"],
      verification_result: "PASS",
      restoration_result: null,
      errors: ["err"],
    });
    expect(rec.packageId).toBe("p1");
    expect(rec.ownerAuthorizationRecordId).toBe("auth-1");
    expect(rec.createdAt).toBe("2026-09-18T00:00:00Z");
    expect(rec.errors).toEqual(["err"]);
  });

  it("falls back to created_date for legacy rows, nulls stay null", () => {
    const rec = rowToRecord({
      id: "r1",
      package_id: "p",
      mode: "RESTORE",
      status: "FAILED",
      source_environment: "a",
      destination_environment: "b",
      archie_version: "1",
      created_date: "2026-01-01T00:00:00Z",
    });
    expect(rec.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(rec.ownerAuthorizationRecordId).toBeNull();
    expect(rec.events).toEqual([]);
    expect(rec.verificationResult).toBeNull();
  });
});
