// =========================================================
// LANGUAGE-INTELLIGENCE TESTS (batch 24, fix 93)
// User selection is authoritative and validated; location is
// only a suggestion; terminology follows LEARN→VERIFY→
// VERSION→USE with verified-only authority.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  archieLanguages,
  resolveLanguage,
  suggestLanguage,
  TerminologyBook,
} from "@/lib/archie/language-intelligence";
import type {
  RegionalProfile,
  TerminologyEntry,
} from "@/lib/archie/phase9-types";

function profile(cc: string | null, suggested: string[] = []): RegionalProfile {
  return {
    country_code: cc,
    country: null,
    region: null,
    city: null,
    currency: "NGN",
    units: "metric",
    suggested_languages: suggested,
    market_context_keys: [],
    climate_zone: null,
  } as RegionalProfile;
}

function term(
  over: Partial<TerminologyEntry> = {},
): Omit<TerminologyEntry, "version" | "verification_status"> {
  return {
    domain: "architecture",
    language_code: "pcm",
    canonical_term: "screed",
    regional_term: "screed flo",
    provenance: { learned_at: "2026-09-15T00:00:00Z" },
    ...over,
  } as never;
}

describe("suggestLanguage", () => {
  it("prefers the profile's suggested languages when active", () => {
    expect(suggestLanguage(profile("NG", ["yo", "en"]))).toBe("yo");
  });

  it("falls back to a common region language, then English", () => {
    expect(suggestLanguage(profile("NG"))).toBe("en"); // first NG match in registry order
    expect(suggestLanguage(profile(null))).toBe("en");
  });

  it("never suggests an inactive or unknown suggested code", () => {
    expect(suggestLanguage(profile("GB", ["klingon"]))).toBe("en");
  });
});

describe("resolveLanguage (spec §4, §18.4)", () => {
  it("treats the user's selection as authoritative", () => {
    const r = resolveLanguage({ user_selection: "yo", profile: profile("US") });
    expect(r).toMatchObject({
      language_code: "yo",
      source: "USER_SELECTION",
      authoritative: true,
    });
  });

  it("refuses unregistered/inactive selections loudly", () => {
    expect(() =>
      resolveLanguage({ user_selection: "xx", profile: profile("NG") }),
    ).toThrow(/not registered\/active/i);
  });

  it("uses the location suggestion only when the user has not chosen", () => {
    const r = resolveLanguage({
      user_selection: null,
      profile: profile("NG", ["ha"]),
    });
    expect(r).toMatchObject({
      language_code: "ha",
      source: "LOCATION_SUGGESTION",
      authoritative: false,
    });
  });

  it("seeds a multilingual registry with Nigerian and global languages", () => {
    const codes = archieLanguages.list().map((l) => l.code);
    expect(codes).toContain("pcm");
    expect(codes).toContain("yo");
    expect(codes).toContain("en");
    expect(archieLanguages.isActive("pcm")).toBe(true);
  });
});

describe("TerminologyBook — LEARN → VERIFY → VERSION → USE", () => {
  it("learns as UNVERIFIED v1 and versions on re-learn (never overwrites)", () => {
    const book = new TerminologyBook();
    const v1 = book.learn(term());
    expect(v1.version).toBe(1);
    expect(v1.verification_status).toBe("UNVERIFIED");
    const v2 = book.learn(term({ regional_term: "flo screed" }));
    expect(v2.version).toBe(2);
  });

  it("verification is explicit; unverified terms are never authoritative", () => {
    const book = new TerminologyBook();
    book.learn(term());
    const unverified = book.lookup("architecture", "pcm", "screed");
    expect(unverified?.authoritative).toBe(false);
    book.verify("architecture", "pcm", "screed");
    const verified = book.lookup("architecture", "pcm", "screed");
    expect(verified?.authoritative).toBe(true);
    expect(verified?.entry.verification_status).toBe("VERIFIED");
  });

  it("cannot verify unknown entries and never returns rejected terms", () => {
    const book = new TerminologyBook();
    expect(() => book.verify("x", "y", "z")).toThrow(
      /unknown terminology entry/i,
    );
    expect(book.lookup("none", "en", "nothing")).toBeNull();
  });
});
