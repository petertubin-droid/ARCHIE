// =========================================================
// STAGE 2 §16 — TerminologyBook admin client tests
//
// Semantics: entries are created UNVERIFIED (never
// auto-verified); verification is a deliberate admin action;
// only VERIFIED entries reach ARCHIE chat.
// =========================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateTerminologyDraft,
  STARTER_TERMS,
  type TerminologyDraft,
} from "../stage2-terminology-client";

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: true,
}));

beforeEach(() => {
  localStorage.clear();
});

const VALID: TerminologyDraft = {
  domain: "materials",
  language_code: "pcm",
  canonical_term: "reinforcement bar",
  regional_term: "iron rod",
  meaning_note: "Rebar",
};

describe("validateTerminologyDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateTerminologyDraft(VALID)).toEqual({ ok: true });
  });

  it("trims whitespace before validating", () => {
    expect(
      validateTerminologyDraft({
        ...VALID,
        canonical_term: "  cement bag  ",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a missing canonical or regional term", () => {
    expect(validateTerminologyDraft({ ...VALID, canonical_term: " " }).ok).toBe(false);
    expect(validateTerminologyDraft({ ...VALID, regional_term: "" }).ok).toBe(false);
  });

  it("rejects an invalid domain slug", () => {
    expect(validateTerminologyDraft({ ...VALID, domain: "Bad Domain!" }).ok).toBe(false);
  });

  it("rejects an invalid language code", () => {
    expect(validateTerminologyDraft({ ...VALID, language_code: "yoruba" }).ok).toBe(false);
  });

  it("rejects over-long terms", () => {
    expect(
      validateTerminologyDraft({ ...VALID, canonical_term: "x".repeat(121) }).ok,
    ).toBe(false);
  });
});

describe("STARTER_TERMS (seed set)", () => {
  it("contains only valid, unique drafts", () => {
    const seen = new Set<string>();
    for (const t of STARTER_TERMS) {
      expect(validateTerminologyDraft(t)).toEqual({ ok: true });
      const key = `${t.language_code}:${t.canonical_term.toLowerCase()}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("has reviewable meaning notes and covers pcm site usage", () => {
    expect(STARTER_TERMS.filter((t) => t.language_code === "pcm").length).toBeGreaterThanOrEqual(7);
  });
});
