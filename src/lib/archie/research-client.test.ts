import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// The research client talks to the owner-gated archie-research
// edge function via the shared supabase client — mock the
// functions.invoke surface and assert the honest mapping
// (vocabulary_error → vocabularyError, checked_at → checkedAt).

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import {
  listResearchRegister,
  decideResearchFinding,
} from "@/lib/archie/research-client";

beforeEach(() => invoke.mockReset());
afterEach(() => vi.clearAllMocks());

const registerBody = {
  findings: [
    {
      id: "f1",
      query: "opus caementicium",
      title: "Roman concrete",
      snippet: "Volcanic ash mortar.",
      url: "https://example.org/roman-concrete",
      confidence: 0.55,
      status: "candidate",
      provenanceNote: "DDG",
      verifiedBy: [],
      updatedAt: "2026-10-19T00:00:00Z",
    },
  ],
  vocabulary: [
    {
      term: "screed",
      meaning: "A leveled mortar layer.",
      provenance: "research",
      confidence: 0.5,
      timesSeen: 3,
      updatedAt: "2026-10-19T00:00:00Z",
    },
  ],
  vocabulary_error: "lexicon unavailable",
  counts: { total: 1, candidate: 1, validated: 0, uncertain: 0 },
  checked_at: "2026-10-19T01:00:00Z",
};

describe("research-client (coverage batch 2026-10-19)", () => {
  it("maps the function's snake_case body to the honest register shape", async () => {
    invoke.mockResolvedValueOnce({ data: registerBody, error: null });
    const reg = await listResearchRegister();
    expect(reg.findings).toHaveLength(1);
    expect(reg.findings[0].status).toBe("candidate");
    expect(reg.vocabulary[0].term).toBe("screed");
    expect(reg.vocabularyError).toBe("lexicon unavailable");
    expect(reg.checkedAt).toBe("2026-10-19T01:00:00Z");
    expect(reg.counts.total).toBe(1);
  });

  it("degrades honestly when the register body is sparse", async () => {
    invoke.mockResolvedValueOnce({
      data: { counts: {}, checked_at: "" },
      error: null,
    });
    const reg = await listResearchRegister();
    expect(reg.findings).toEqual([]);
    expect(reg.vocabulary).toEqual([]);
  });

  it("surfaces function errors instead of swallowing them", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "owner gate refused" },
    });
    await expect(listResearchRegister()).rejects.toThrow(
      "owner gate refused",
    );
  });

  it("sends the owner's verdict as a POST with fact_id + action", async () => {
    invoke.mockResolvedValueOnce({
      data: { ok: true, status: "validated" },
      error: null,
    });
    const res = await decideResearchFinding("f1", "validate");
    expect(res).toEqual({ ok: true, status: "validated" });
    expect(invoke).toHaveBeenCalledWith("archie-research", {
      method: "POST",
      body: { fact_id: "f1", action: "validate" },
    });
  });

  it("throws when the verdict is refused (ok:false)", async () => {
    invoke.mockResolvedValueOnce({
      data: { ok: false, error: "already terminal" },
      error: null,
    });
    await expect(decideResearchFinding("f1", "reject")).rejects.toThrow(
      "already terminal",
    );
  });
});
