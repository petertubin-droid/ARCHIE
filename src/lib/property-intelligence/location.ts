/**
 * FRELUX PROPERTY INTELLIGENCE, LOCATION INTELLIGENCE
 *
 * Prompt 4, Phase 3: location → regional profile. Reuses the Prompt 2
 * market-profile architecture. An unsupported or undeterminable location
 * is NEVER silently mapped to another region (no Nigerian fallback).
 */

// =========================================================
// Types
// =========================================================

export interface LocationResolutionInput {
  /** ISO 3166-1 alpha-2 country code, if known. */
  country?: string;
  region?: string;
  city?: string;
  coordinates?: { lat: number; lng: number };
}

/** A profile lookup compatible with international/queries fetchMarketProfile. */
export type MarketProfileLookup = (countryCode: string) => unknown | null | undefined;

export interface ResolvedRegionalContext {
  status: "resolved" | "requires_confirmation" | "unsupported";
  /** The country code that was matched, when resolved. */
  countryCode?: string;
  /** Why this resolution was reached, traceable, never guessed. */
  reason: string;
  /** The resolved regional profile (opaque here; caller supplies the lookup). */
  profile?: unknown;
}

// =========================================================
// Resolution
// =========================================================

export function resolveRegionalContext(
  input: LocationResolutionInput,
  lookup?: MarketProfileLookup,
): ResolvedRegionalContext {
  const { country, region, city, coordinates } = input;

  if (country) {
    const normalized = country.trim().toUpperCase();
    const profile = lookup?.(normalized);
    if (profile) {
      return {
        status: "resolved",
        countryCode: normalized,
        profile,
        reason: `Country "${normalized}"${region ? ` (region: ${region})` : ""}${city ? `, city: ${city}` : ""} matched an existing FRELUX regional profile.`,
      };
    }
    return {
      status: "unsupported",
      countryCode: normalized,
      reason: `Country "${normalized}" has no FRELUX regional profile. Universal building analysis remains available, but regional construction and market data are not configured for this location. No other region's data was substituted.`,
    };
  }

  // No country code. Coordinates alone are NOT country detection :
  // reverse geocoding is not implemented, so we cannot reliably determine
  // the country from coordinates. Never guess.
  return {
    status: "requires_confirmation",
    reason: coordinates
      ? "Coordinates were provided, but FRELUX does not perform reverse geocoding, so the country could not be reliably determined. Confirm the country or region to select a regional profile."
      : `Location "${[city, region].filter(Boolean).join(", ") || "unknown"}" was provided without a country. The country must be confirmed before a regional profile can be selected. FRELUX does not guess the region.`,
  };
}
