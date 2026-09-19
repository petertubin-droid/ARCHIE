// =========================================================
// STAGE 2 §16 — location → language wiring tests
//
// Semantics (spec §§4, 16, 18.4):
//   USER SELECTION → AUTHORITATIVE (final, never overridden)
//   LOCATION → SUGGESTION (advisory only)
//   DB registry is the source of truth (no fixed language count)
//   Timezone hint is NOT device data; no geolocation permission
// =========================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  timezoneToCountry,
  suggestLanguageFromTimezone,
  resolveSessionLanguage,
  getSelectedLanguage,
  setSelectedLanguage,
  clearSelectedLanguage,
  type LanguageRegistryRow,
} from "../stage2-language-client";

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: true,
}));

beforeEach(() => {
  localStorage.clear();
});

const REGISTRY: LanguageRegistryRow[] = [
  { code: "en", label: "English", native_label: "English", common_regions: ["NG", "GB", "US"], active: true },
  { code: "pcm", label: "Nigerian Pidgin", native_label: "Naija Pidgin", common_regions: ["NG"], active: true },
  { code: "yo", label: "Yoruba", native_label: "Yorùbá", common_regions: ["NG"], active: true },
  { code: "fr", label: "French", native_label: "Français", common_regions: ["FR"], active: true },
  { code: "sw", label: "Swahili", native_label: "Kiswahili", common_regions: ["KE", "TZ"], active: true },
];

describe("§16 timezone → country (advisory hint, no permission)", () => {
  it("maps known African/European/American zones", () => {
    expect(timezoneToCountry("Africa/Lagos")).toBe("NG");
    expect(timezoneToCountry("Europe/London")).toBe("GB");
    expect(timezoneToCountry("America/New_York")).toBe("US");
    expect(timezoneToCountry("Europe/Paris")).toBe("FR");
    expect(timezoneToCountry("Africa/Nairobi")).toBe("KE");
  });

  it("returns null for unknown timezones (no invented suggestion)", () => {
    expect(timezoneToCountry("Mars/Olympus_Mons")).toBeNull();
  });
});

describe("§16 location → language suggestion (advisory)", () => {
  it("suggests a registry language for the timezone country", () => {
    expect(suggestLanguageFromTimezone(REGISTRY, "Africa/Lagos")).toBe("en");
  });

  it("suggests Swahili for Kenya/Tanzania zones", () => {
    expect(suggestLanguageFromTimezone(REGISTRY, "Africa/Nairobi")).toBe("sw");
    expect(suggestLanguageFromTimezone(REGISTRY, "Africa/Dar_es_Salaam")).toBe("sw");
  });

  it("suggests French for the Paris timezone", () => {
    expect(suggestLanguageFromTimezone(REGISTRY, "Europe/Paris")).toBe("fr");
  });

  it("yields NO suggestion for unknown timezones or countries", () => {
    expect(suggestLanguageFromTimezone(REGISTRY, null)).toBeNull();
    expect(suggestLanguageFromTimezone(REGISTRY, "Mars/Olympus_Mons")).toBeNull();
  });

  it("only suggests ACTIVE registry languages", () => {
    const onlyFrench = REGISTRY.filter((l) => l.code === "fr");
    expect(suggestLanguageFromTimezone(onlyFrench, "Africa/Lagos")).toBeNull();
  });
});

describe("§16 user selection → authoritative preference", () => {
  it("persists and reads the explicit selection", () => {
    expect(getSelectedLanguage()).toBeNull();
    setSelectedLanguage("yo");
    expect(getSelectedLanguage()).toBe("yo");
    clearSelectedLanguage();
    expect(getSelectedLanguage()).toBeNull();
  });

  it("an active user selection is AUTHORITATIVE (beats location)", () => {
    setSelectedLanguage("yo");
    const res = resolveSessionLanguage({
      languages: REGISTRY,
      timeZone: "Africa/Nairobi", // would suggest sw
    });
    expect(res).toEqual({
      language_code: "yo",
      source: "USER_SELECTION",
      authoritative: true,
    });
  });

  it("a stale/inactive selection is cleared and falls to advisory", () => {
    setSelectedLanguage("zu"); // not in registry
    const res = resolveSessionLanguage({
      languages: REGISTRY,
      timeZone: "Africa/Lagos",
    });
    expect(res.source).toBe("LOCATION_SUGGESTION");
    expect(res.authoritative).toBe(false);
    expect(getSelectedLanguage()).toBeNull();
  });

  it("no selection → advisory suggestion from the timezone", () => {
    const res = resolveSessionLanguage({
      languages: REGISTRY,
      selectedCode: null,
      timeZone: "Europe/Paris",
    });
    expect(res).toEqual({
      language_code: "fr",
      source: "LOCATION_SUGGESTION",
      authoritative: false,
    });
  });

  it("no selection and no resolvable timezone → honest English fallback", () => {
    const res = resolveSessionLanguage({
      languages: REGISTRY,
      selectedCode: null,
      timeZone: null,
    });
    expect(res).toEqual({
      language_code: "en",
      source: "LOCATION_SUGGESTION",
      authoritative: false,
    });
  });
});
