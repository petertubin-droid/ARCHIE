// =========================================================
// ARCHIE INTELLIGENCE CLIENT TESTS (Phase 8 P3)
//
// Browser-facing persistence with pipeline guards BEFORE any
// write. Pinned:
//   * a knowledge link without a provenance reason never
//     reaches the database
//   * empty batches are no-ops, not errors
//   * domain gaps are stored OPEN (never silently resolved)
//   * inserts map to snake_case rows; failures are honest
//   * change-request updates are keyed by id
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import {
  persistKnowledgeLink,
  persistContradictions,
  persistDomainGaps,
  upsertProfessionalProfile,
  createChangeRequestRow,
  updateChangeRequestRow,
} from "@/lib/archie/intelligence-client";

const from = supabase.from as ReturnType<typeof vi.fn>;

function chain(
  result: { data?: unknown; error?: { message: string } | null } = {},
) {
  const rows: Record<string, unknown>[] = [];
  const q: Record<string, unknown> = {
    __rows: rows,
    insert: (row: Record<string, unknown>) => {
      rows.push(row);
      return {
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
        }),
      };
    },
    upsert: (row: Record<string, unknown>) => {
      rows.push(row);
      return {
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
        }),
      };
    },
    update: (row: Record<string, unknown>) => {
      rows.push(row);
      return { eq: () => Promise.resolve({ error: result.error ?? null }) };
    },
  };
  return q;
}

beforeEach(() => {
  from.mockReset();
});

describe("persistKnowledgeLink", () => {
  it("refuses a link without a provenance reason — nothing reaches the database", async () => {
    const res = await persistKnowledgeLink({
      from_id: "a",
      to_id: "b",
      relation: "supports",
      created_by: "owner",
      reason: "   ",
    } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provenance reason");
    expect(from).not.toHaveBeenCalled();
  });

  it("persists a sanitized link and returns the id", async () => {
    from.mockReturnValue(chain({ data: { id: "link-1" } }));
    const res = await persistKnowledgeLink({
      from_id: "a",
      to_id: "b",
      relation: "supports",
      created_by: "owner",
      reason: "cited from stage report",
    } as never);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("link-1");
    const q = from.mock.results[0].value as never as {
      __rows: Record<string, unknown>[];
    };
    expect(q.__rows[0]).toMatchObject({
      from_item: "a",
      to_item: "b",
      relation: "supports",
    });
  });

  it("database failure → honest error", async () => {
    from.mockReturnValue(chain({ error: { message: "RLS denied" } }));
    const res = await persistKnowledgeLink({
      from_id: "a",
      to_id: "b",
      relation: "r",
      created_by: "o",
      reason: "ok",
    } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("RLS denied");
  });
});

describe("persistContradictions / persistDomainGaps", () => {
  it("empty batches are successful no-ops", async () => {
    expect(await persistContradictions([])).toEqual({ ok: true, inserted: 0 });
    expect(await persistDomainGaps([])).toEqual({ ok: true, inserted: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it("contradictions map to snake_case and count inserts", async () => {
    from.mockReturnValue(chain());
    const res = await persistContradictions([
      {
        item_a_id: "a",
        item_b_id: "b",
        topic: "t",
        domain: "d",
        detail: "clash",
        status: "OPEN",
        detected_at: "2026-09-18T00:00:00Z",
      },
    ] as never);
    expect(res).toEqual({ ok: true, inserted: 1 });
    const q = from.mock.results[0].value as never as { __rows: unknown[] };
    // batch insert: one call carrying the mapped rows
    expect(q.__rows[0]).toMatchObject([
      { item_a: "a", item_b: "b", topic: "t", detail: "clash" },
    ]);
  });

  it("domain gaps are stored OPEN — never silently resolved", async () => {
    from.mockReturnValue(chain());
    await persistDomainGaps([
      { domain: "roofing", gap_type: "missing", summary: "s" },
    ] as never);
    const q = from.mock.results[0].value as never as {
      __rows: Array<Array<Record<string, unknown>>>;
    };
    expect(q.__rows[0][0].status).toBe("OPEN");
  });
});

describe("upsertProfessionalProfile", () => {
  const base = {
    role: "engineer",
    display_name: "Ada",
    verification_state: "verified",
    verified_by: null,
    verified_at: null,
    credential_refs: [],
    regional_scope: ["NG"],
    active: true,
  };

  it("upserts without an id (server assigns)", async () => {
    from.mockReturnValue(chain({ data: { id: "prof-1" } }));
    const res = await upsertProfessionalProfile(base as never);
    expect(res.ok).toBe(true);
    const q = from.mock.results[0].value as never as {
      __rows: Record<string, unknown>[];
    };
    expect(q.__rows[0].id).toBeUndefined();
    expect(q.__rows[0].role).toBe("engineer");
  });

  it("includes the id for an existing profile", async () => {
    from.mockReturnValue(chain({ data: { id: "prof-9" } }));
    await upsertProfessionalProfile({ ...base, id: "prof-9" } as never);
    const q = from.mock.results[0].value as never as {
      __rows: Record<string, unknown>[];
    };
    expect(q.__rows[0].id).toBe("prof-9");
  });
});

describe("change requests", () => {
  const cr = {
    id: "cr-1",
    title: "Fix roof math",
    areas: ["roof"],
    stage: "NEW",
    created_by: "owner",
    requires_engineering_review: true,
    flags: [],
  };

  it("create inserts the row and returns its id", async () => {
    from.mockReturnValue(chain({ data: { id: "cr-1" } }));
    const res = await createChangeRequestRow(cr as never);
    expect(res.ok).toBe(true);
    const q = from.mock.results[0].value as never as {
      __rows: Record<string, unknown>[];
    };
    expect(q.__rows[0]).toMatchObject({
      id: "cr-1",
      stage: "NEW",
      requires_engineering_review: true,
    });
  });

  it("update writes the stage/summaries keyed by id, with a fresh updated_date", async () => {
    const q = chain();
    from.mockReturnValue(q);
    const res = await updateChangeRequestRow({
      ...cr,
      stage: "TESTED",
      test_evidence: "suite green",
    } as never);
    expect(res.ok).toBe(true);
    const row = (q as never as { __rows: Record<string, unknown>[] }).__rows[0];
    expect(row.stage).toBe("TESTED");
    expect(row.test_evidence).toBe("suite green");
    expect(typeof row.updated_date).toBe("string");
  });
});
