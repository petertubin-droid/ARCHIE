// =========================================================
// STAGE2-LANGUAGE-CLIENT TESTS (batch 27, fix 118)
// The user's selection is AUTHORITATIVE while active in the
// registry; a stale selection is cleared, not silently
// honored; the timezone suggestion is advisory only; English
// is the honest fallback; the server still validates finally.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  clearSelectedLanguage,
  getSelectedLanguage,
  resolveSessionLanguage,
  setSelectedLanguage,
  suggestLanguageFromTimezone,
  timezoneToCountry,
  toArchieLanguage,
  type LanguageRegistryRow,
} from "@/lib/archie/stage2-language-client";

function lang(
  code: string,
  regions: string[],
  active = true,
): LanguageRegistryRow {
  return {
    code,
    label: code.toUpperCase(),
    native_label: code,
    common_regions: regions,
    active,
  };
}

const REGISTRY: LanguageRegistryRow[] = [
  lang("en", ["GB", "US", "NG", "KE", "GH"]),
  lang("fr", ["FR"]),
  lang("sw", ["KE", "TZ"]),
];

describe("selection persistence — explicit and revocable", () => {
  it("sets, reads and clears the stored selection", () => {
    setSelectedLanguage("sw");
    expect(getSelectedLanguage()).toBe("sw");
    clearSelectedLanguage();
    expect(getSelectedLanguage()).toBeNull();
  });
});

describe("timezone hints — advisory only, no permission", () => {
  it("maps known timezones to countries and yields null for unknown ones", () => {
    expect(timezoneToCountry("Africa/Lagos")).toBe("NG");
    expect(timezoneToCountry("America/New_York")).toBe("US");
    expect(timezoneToCountry("Mars/Olympus_Mons")).toBeNull();
  });

  it("suggests the first registry language covering the timezone country, null otherwise", () => {
    expect(suggestLanguageFromTimezone(REGISTRY, "Africa/Dar_es_Salaam")).toBe(
      "sw",
    ); // only sw covers TZ
    expect(suggestLanguageFromTimezone(REGISTRY, "Africa/Nairobi")).toBe("en"); // en is registered first for KE
    expect(suggestLanguageFromTimezone(REGISTRY, null)).toBeNull();
    expect(suggestLanguageFromTimezone(REGISTRY, "Asia/Tokyo")).toBeNull();
  });
});

describe("resolveSessionLanguage — selection beats suggestion", () => {
  it("treats an active user selection as authoritative", () => {
    clearSelectedLanguage();
    const r = resolveSessionLanguage({
      languages: REGISTRY,
      selectedCode: "fr",
      timeZone: "Africa/Lagos", // would suggest en
    });
    expect(r).toEqual({
      language_code: "fr",
      source: "USER_SELECTION",
      authoritative: true,
    });
  });

  it("clears a stale/inactive selection and falls through to the advisory suggestion", () => {
    setSelectedLanguage("sw");
    const r = resolveSessionLanguage({
      languages: [
        lang("en", ["GB", "US", "NG"]),
        lang("fr", ["FR"]),
        lang("sw", ["KE"], false),
      ], // sw inactive
      timeZone: "Africa/Lagos",
    });
    expect(r.source).toBe("LOCATION_SUGGESTION");
    expect(r.authoritative).toBe(false);
    expect(getSelectedLanguage()).toBeNull(); // stale selection was cleared
    clearSelectedLanguage();
  });

  it("falls back honestly to English when nothing resolves", () => {
    clearSelectedLanguage();
    const r = resolveSessionLanguage({
      languages: REGISTRY,
      selectedCode: null,
      timeZone: "Asia/Tokyo",
    });
    expect(r.language_code).toBe("en");
    expect(r.authoritative).toBe(false);
  });
});

describe("toArchieLanguage", () => {
  it("reuses the shared shape", () => {
    const l = toArchieLanguage(lang("yo", ["NG"]));
    expect(l.code).toBe("yo");
    expect(l.common_regions).toEqual(["NG"]);
  });
});
