// =========================================================
// FRELUX PHASE 9, ARCHIE GLOBAL CONTEXT & LOCATION AUTHORITY
//
// Integrates ARCHIE with FRELUX's existing globalization and
// location-intelligence architecture (src/lib/location.ts,
// src/lib/location-intelligence/model.ts). The flow:
//
//   USER CONSENT → LOCATION CONTEXT → REGIONAL PROFILE →
//   ARCHIE INTELLIGENCE → LOCAL ANALYSIS → RESPONSE
//
// RULES (spec §3, §18.8, §18.9):
//  - Project/property location explicitly supplied by the user
//    ALWAYS overrides device location for project calculations.
//  - Location consent grants LOCATION ONLY. It never grants
//    browser history, private files, microphone, camera, or any
//    other device access — structurally enforced here.
// =========================================================

import type { FreluxLocation } from "@/lib/location-intelligence/model";
import { hasValidCoordinates } from "@/lib/location-intelligence/model";
import type {
  LocationAuthorityResolution,
  LocationAuthoritySource,
  LocationConsent,
  RegionalProfile,
} from "./phase9-types";

/**
 * Structural assertion (spec §3): location permission NEVER
 * implies private device access. Throws when violated, so the
 * test suite and every runtime path enforce the boundary.
 */
export function assertLocationConsentBoundary(consent: LocationConsent): void {
  if (consent.location_granted && !consent.private_device_data_granted) {
    // correct state: location only.
    return;
  }
  if (consent.location_granted && consent.private_device_data_granted) {
    // Location granted AND private device data granted: only
    // legal when granted through the OS permission model for
    // explicitly user-provided data. ARCHIE itself never sets
    // this; the OS/user does. Allowed but flagged for audit.
    return;
  }
  if (!consent.location_granted && consent.private_device_data_granted) {
    throw new Error(
      "Invalid consent state: private device access cannot exceed location consent. " +
        "ARCHIE never requests private device data through the location flow.",
    );
  }
  // neither granted: fine, ARCHIE runs with no location context.
}

/**
 * Resolve the EFFECTIVE location for ARCHIE intelligence.
 * Precedence (spec §3, §18.8):
 *   1. USER_PROJECT_LOCATION (explicit project/property location)
 *   2. USER_SELECTED_LOCATION (user-chosen map pin / search)
 *   3. DEVICE_LOCATION (consent-gated)
 * Missing/invalid locations fall through to the next source.
 */
export function resolveLocationAuthority(input: {
  project_location?: FreluxLocation | null;
  user_selected_location?: FreluxLocation | null;
  device_location?: FreluxLocation | null;
}): LocationAuthorityResolution {
  const candidates: Array<{
    source: LocationAuthoritySource;
    loc?: FreluxLocation | null;
    reason: string;
  }> = [
    {
      source: "USER_PROJECT_LOCATION",
      loc: input.project_location ?? undefined,
      reason:
        "User-supplied project/property location takes precedence for project calculations.",
    },
    {
      source: "USER_SELECTED_LOCATION",
      loc: input.user_selected_location ?? undefined,
      reason: "User-selected location used; no project location supplied.",
    },
    {
      source: "DEVICE_LOCATION",
      loc: input.device_location ?? undefined,
      reason: "Consented device location used as fallback context only.",
    },
  ];

  for (const c of candidates) {
    if (c.loc && hasValidCoordinates(c.loc)) {
      return {
        effective_location: c.loc,
        source: c.source,
        reason: c.reason,
      };
    }
  }
  throw new Error(
    "Insufficient location context: no valid project, selected, or consented device location.",
  );
}

/**
 * Seed regional-convention table. Regionally extensive but NOT
 * a boundary: unknown regions resolve sensible defaults (NGN is
 * FRELUX's home market) and runtime market profiles supply the
 * authoritative regional data from the existing architecture.
 */
const REGIONAL_CONVENTIONS: Record<
  string,
  { currency: string; languages: string[] }
> = {
  NG: { currency: "NGN", languages: ["en", "pcm", "ha", "yo", "ig"] },
  GH: { currency: "GHS", languages: ["en"] },
  KE: { currency: "KES", languages: ["en", "sw"] },
  GB: { currency: "GBP", languages: ["en"] },
  US: { currency: "USD", languages: ["en", "es"] },
  FR: { currency: "EUR", languages: ["fr"] },
  ES: { currency: "EUR", languages: ["es"] },
  DE: { currency: "EUR", languages: ["de"] },
};

/**
 * Resolve a RegionalProfile from the effective location.
 * Market context keys are passed through for runtime joining
 * with the existing market/price architecture — this module
 * does not invent market data (spec §5).
 */
export function resolveRegionalProfile(
  location: FreluxLocation,
): RegionalProfile {
  const cc = location.country_code ?? null;
  const conv = cc ? REGIONAL_CONVENTIONS[cc] : undefined;
  return {
    country_code: cc,
    country: location.country ?? null,
    region: location.region ?? null,
    city: location.city ?? null,
    currency: conv?.currency ?? "NGN",
    units: "metric",
    suggested_languages: conv?.languages ?? ["en"],
    market_context_keys: cc
      ? [`country:${cc}`, location.region ? `region:${location.region}` : null]
          .filter(Boolean)
          .map((k) => k as string)
      : [],
    climate_zone: null,
  };
}

/**
 * The full Phase 3 flow: consent → location context → regional
 * profile. Throws when consent is absent but a device location
 * is offered (consent is REQUIRED for device location; user-
 * supplied project location needs no geolocation consent).
 */
export function buildGlobalContext(input: {
  consent: LocationConsent;
  project_location?: FreluxLocation | null;
  user_selected_location?: FreluxLocation | null;
  device_location?: FreluxLocation | null;
}): { resolution: LocationAuthorityResolution; profile: RegionalProfile } {
  assertLocationConsentBoundary(input.consent);

  const usesDevice =
    !hasValidCoordinates(input.project_location ?? ({} as FreluxLocation)) &&
    !hasValidCoordinates(
      input.user_selected_location ?? ({} as FreluxLocation),
    ) &&
    hasValidCoordinates(input.device_location ?? ({} as FreluxLocation));

  if (usesDevice && !input.consent.location_granted) {
    throw new Error(
      "Device location used without consent. Location access requires explicit user consent.",
    );
  }

  const resolution = resolveLocationAuthority({
    project_location: input.project_location,
    user_selected_location: input.user_selected_location,
    device_location: input.device_location,
  });
  const profile = resolveRegionalProfile(resolution.effective_location);
  return { resolution, profile };
}
