// =========================================================
// FRELUX ARCHIE STAGE 2 — LOCATION → LANGUAGE WIRING (§16)
//
// Client side of the multilingual, location-aware language
// layer:
//
//   LOCATION → LANGUAGE SUGGESTION (advisory)
//   USER SELECTION → AUTHORITATIVE PREFERENCE (final)
//
// The DB table frelux_archie_languages is the source of truth
// (admin-extensible, no fixed language count — spec §4). This
// module reads the registry, resolves the session language and
// hands it to the archie-core edge function, which validates
// server-side and injects VERIFIED terminology.
//
// The location suggestion uses the device TIMEZONE only — no
// geolocation permission, no device data (the consent model:
// location permission grants LOCATION ONLY, and even that is
// not required here; the timezone is already exposed to the
// page and is not private device data).
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import type { ArchieLanguage } from "./phase9-types";

export type LanguageSelectionSource = "USER_SELECTION" | "LOCATION_SUGGESTION";

export interface SessionLanguageResolution {
  language_code: string;
  source: LanguageSelectionSource;
  /** True only for an explicit user selection (never overridable). */
  authoritative: boolean;
}

/** Registry row as stored in frelux_archie_languages. */
export interface LanguageRegistryRow {
  code: string;
  label: string;
  native_label: string;
  common_regions: string[];
  active: boolean;
}

const SELECTION_KEY = "frelux_archie_language_selection";

// ---------------------------------------------------------
// DB registry (source of truth)
// ---------------------------------------------------------

export async function fetchActiveLanguages(): Promise<
  LanguageRegistryRow[]
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_languages")
    .select("code, label, native_label, common_regions, active")
    .eq("active", true)
    .order("code");
  if (error) {
    throw new Error(
      `Could not load the ARCHIE language registry: ${error.message}`,
    );
  }
  return (data ?? []) as LanguageRegistryRow[];
}

// ---------------------------------------------------------
// User selection persistence (explicit, revocable)
// ---------------------------------------------------------

export function getSelectedLanguage(): string | null {
  try {
    return localStorage.getItem(SELECTION_KEY);
  } catch {
    return null;
  }
}

export function setSelectedLanguage(code: string): void {
  localStorage.setItem(SELECTION_KEY, code);
}

export function clearSelectedLanguage(): void {
  localStorage.removeItem(SELECTION_KEY);
}

// ---------------------------------------------------------
// TIMEZONE → COUNTRY (advisory hint only, no permission)
// ---------------------------------------------------------

/**
 * Coarse timezone → country map for the suggestion path.
 * A missing timezone yields NO suggestion (null), the
 * registry's English fallback then applies. Data, not logic:
 * extendable freely.
 */
export const TIMEZONE_COUNTRY: Record<string, string> = {
  "Africa/Lagos": "NG",
  "Africa/Abuja": "NG",
  "Africa/Port_Harcourt": "NG",
  "Africa/Kano": "NG",
  "Europe/London": "GB",
  "Europe/Dublin": "GB",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "Europe/Paris": "FR",
  "Europe/Brussels": "FR",
  "Europe/Madrid": "ES",
  "Africa/Nairobi": "KE",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Dodoma": "TZ",
  "Africa/Kampala": "KE",
  "Africa/Accra": "GH",
  "Africa/Abidjan": "GH",
  "Africa/Johannesburg": "ZA",
  "Africa/Cairo": "EG",
};

export function timezoneToCountry(timeZone: string): string | null {
  return TIMEZONE_COUNTRY[timeZone] ?? null;
}

export function detectTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * LOCATION → LANGUAGE SUGGESTION (advisory): pick the first
 * registry language whose common regions include the device's
 * timezone country. Never authoritative.
 */
export function suggestLanguageFromTimezone(
  languages: readonly LanguageRegistryRow[],
  timeZone: string | null = detectTimeZone(),
): string | null {
  if (!timeZone) return null;
  const country = timezoneToCountry(timeZone);
  if (!country) return null;
  const match = languages.find((l) => l.common_regions.includes(country));
  return match?.code ?? null;
}

// ---------------------------------------------------------
// Session resolution (spec §4, §18.4 semantics)
// ---------------------------------------------------------

/**
 * Resolve the session language. The user's stored selection is
 * AUTHORITATIVE when it is still active in the registry; the
 * timezone suggestion is advisory and only used when no
 * selection exists. English is the honest fallback when
 * neither resolves — the server still validates finally.
 */
export function resolveSessionLanguage(input: {
  languages: readonly LanguageRegistryRow[];
  selectedCode?: string | null;
  timeZone?: string | null;
}): SessionLanguageResolution {
  const selected = input.selectedCode ?? getSelectedLanguage();
  if (selected) {
    const active = input.languages.find(
      (l) => l.code === selected && l.active,
    );
    if (active) {
      return {
        language_code: selected,
        source: "USER_SELECTION",
        authoritative: true,
      };
    }
    // a stale/inactive selection is NOT silently treated as
    // authoritative; clear it and fall through to advisory.
    clearSelectedLanguage();
  }
  const suggested = suggestLanguageFromTimezone(
    input.languages,
    input.timeZone ?? detectTimeZone(),
  );
  if (suggested) {
    return {
      language_code: suggested,
      source: "LOCATION_SUGGESTION",
      authoritative: false,
    };
  }
  return {
    language_code: "en",
    source: "LOCATION_SUGGESTION",
    authoritative: false,
  };
}

/** Reuse the shared ArchieLanguage shape for registry helpers. */
export function toArchieLanguage(row: LanguageRegistryRow): ArchieLanguage {
  return {
    code: row.code,
    label: row.label,
    native_label: row.native_label,
    common_regions: row.common_regions,
    active: row.active,
  };
}
