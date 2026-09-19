/**
 * FRELUX LOCATION INTELLIGENCE, Canonical Location Model
 *
 * ONE canonical location record that can be attached to a project,
 * property, or any future FRELUX entity (supplier, contractor, listing).
 *
 * Principles:
 * - Never fabricate data: fields the provider did not supply stay null.
 * - Never silently infer: country is only set by a provider result or
 *   the user; coordinates alone never imply a country.
 * - Every record is traceable: source + timestamp + verification status.
 * - No hardcoded cities, regions, or coordinates anywhere in this module.
 */

// ============================================================
// Types
// ============================================================

/** How the location was captured. */
export type LocationSource = "gps" | "search" | "map_pin" | "manual";

/**
 * Verification status:
 * - provider_verified: a geocoding provider supplied the address fields.
 * - user_confirmed: the user entered or confirmed the fields manually.
 * - unverified: raw capture (e.g. GPS without reverse geocoding).
 */
export type LocationVerification =
  | "provider_verified"
  | "user_confirmed"
  | "unverified";

/** The canonical FRELUX location record. */
export interface FreluxLocation {
  latitude: number | null;
  longitude: number | null;
  /** GPS accuracy radius in meters, when the source provided it. */
  accuracy_m: number | null;
  /** Human-readable address, only when provider-verified or user-entered. */
  formatted_address: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, when known. Uppercase. */
  country_code: string | null;
  /** State / province / region. */
  region: string | null;
  /** City / locality / area. */
  city: string | null;
  /** Postal code, where the provider or user supplied one. */
  postcode: string | null;
  /** Stable provider place identifier (e.g. OSM way/relation id), if any. */
  place_id: string | null;
  source: LocationSource;
  /** ISO 8601 timestamp of capture. */
  captured_at: string;
  verification: LocationVerification;
}

// ============================================================
// Normalization helpers
// ============================================================

/** Normalize an ISO 3166-1 alpha-2 country code; null when not one. */
export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(trimmed)) return null;
  return trimmed;
}

/** Valid latitude check. */
export function isValidLatitude(lat: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** Valid longitude check. */
export function isValidLongitude(lng: unknown): lng is number {
  return typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** A coordinate pair is only valid when BOTH values are valid. */
export function hasValidCoordinates(loc: FreluxLocation): boolean {
  return isValidLatitude(loc.latitude) && isValidLongitude(loc.longitude);
}

// ============================================================
// Validation
// ============================================================

export type LocationValidationIssue =
  | "no_data"
  | "invalid_coordinates"
  | "invalid_country_code"
  | "needs_country_or_coordinates";

/**
 * Validate a canonical location record.
 *
 * A record must have either valid coordinates, a valid country code,
 * or both. A record with only free-text fields and no country and no
 * coordinates cannot be used for regional resolution.
 */
export function validateFreluxLocation(
  loc: FreluxLocation | null | undefined,
): { valid: boolean; issues: LocationValidationIssue[] } {
  if (!loc) return { valid: false, issues: ["no_data"] };

  const issues: LocationValidationIssue[] = [];

  const latOk = isValidLatitude(loc.latitude);
  const lngOk = isValidLongitude(loc.longitude);

  // Coordinates are optional, but if one is present both must be valid.
  const hasAnyCoord = loc.latitude !== null || loc.longitude !== null;
  if (hasAnyCoord && !(latOk && lngOk)) issues.push("invalid_coordinates");
  if (!hasAnyCoord) {
    // No coordinates at all, then a country is required.
    if (!loc.country_code && !loc.country) {
      issues.push("needs_country_or_coordinates");
    }
  }

  if (loc.country_code && !/^[A-Z]{2}$/.test(loc.country_code)) {
    issues.push("invalid_country_code");
  }

  return { valid: issues.length === 0, issues };
}

// ============================================================
// Construction
// ============================================================

const nowIso = () => new Date().toISOString();

/** An empty, unverified location shell, all fields null. */
export function emptyLocation(source: LocationSource = "manual"): FreluxLocation {
  return {
    latitude: null,
    longitude: null,
    accuracy_m: null,
    formatted_address: null,
    country: null,
    country_code: null,
    region: null,
    city: null,
    postcode: null,
    place_id: null,
    source,
    captured_at: nowIso(),
    verification: "unverified",
  };
}

/**
 * Build a canonical location from a browser GeolocationPosition.
 * Only GPS fields are populated, reverse geocoding is a separate,
 * optional provider step. Nothing is guessed.
 */
export function fromGeolocationPosition(
  pos: GeolocationPosition,
): FreluxLocation {
  return {
    ...emptyLocation("gps"),
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_m: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
  };
}

/** Strip unknown/extra fields from a raw record and coerce to canonical shape. */
export function sanitizeLocationRecord(
  raw: Record<string, unknown> | null | undefined,
): FreluxLocation {
  const base = emptyLocation();
  if (!raw || typeof raw !== "object") return base;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  const source = ["gps", "search", "map_pin", "manual"].includes(
    raw.source as string,
  )
    ? (raw.source as LocationSource)
    : "manual";
  const verification = [
    "provider_verified",
    "user_confirmed",
    "unverified",
  ].includes(raw.verification as string)
    ? (raw.verification as LocationVerification)
    : "unverified";

  return {
    latitude: isValidLatitude(raw.latitude) ? raw.latitude : null,
    longitude: isValidLongitude(raw.longitude) ? raw.longitude : null,
    accuracy_m: num(raw.accuracy_m),
    formatted_address: str(raw.formatted_address),
    country: str(raw.country),
    country_code: normalizeCountryCode(str(raw.country_code)),
    region: str(raw.region),
    city: str(raw.city),
    postcode: str(raw.postcode),
    place_id: str(raw.place_id),
    source,
    captured_at: str(raw.captured_at) ?? base.captured_at,
    verification,
  };
}

// ============================================================
// Display
// ============================================================

/**
 * Honest, human-readable label for a location.
 * Uses only fields that actually exist, never fabricates an address.
 */
export function formatLocationLabel(loc: FreluxLocation | null | undefined): string {
  if (!loc) return "Location not set";

  const parts: string[] = [];
  if (loc.formatted_address) parts.push(loc.formatted_address);
  else {
    if (loc.city) parts.push(loc.city);
    if (loc.region) parts.push(loc.region);
  }
  if (parts.length === 0 && loc.country) parts.push(loc.country);
  if (parts.length === 0 && hasValidCoordinates(loc)) {
    parts.push(
      `${loc.latitude!.toFixed(4)}, ${loc.longitude!.toFixed(4)}`,
    );
  }
  if (parts.length === 0 && loc.country_code) parts.push(loc.country_code);
  if (parts.length === 0) return "Location not set";
  return parts.join(", ");
}

/** Format coordinates for display; null when no valid coordinates. */
export function formatCoordinates(
  loc: FreluxLocation | null | undefined,
): string | null {
  if (!loc || !hasValidCoordinates(loc)) return null;
  return `${loc.latitude!.toFixed(5)}, ${loc.longitude!.toFixed(5)}`;
}

/** Format accuracy for display; null when unavailable. */
export function formatAccuracy(
  loc: FreluxLocation | null | undefined,
): string | null {
  if (!loc || loc.accuracy_m === null || loc.accuracy_m === undefined) return null;
  if (loc.accuracy_m >= 1000) return `± ${(loc.accuracy_m / 1000).toFixed(1)} km`;
  return `± ${Math.round(loc.accuracy_m)} m`;
}

/** Human label for the capture source. */
export const SOURCE_LABELS: Record<LocationSource, string> = {
  gps: "GPS",
  search: "Search",
  map_pin: "Map pin",
  manual: "Entered manually",
};

/** Short "time ago" label. */
export function formatCapturedAt(
  loc: FreluxLocation | null | undefined,
): string | null {
  if (!loc?.captured_at) return null;
  const t = Date.parse(loc.captured_at);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
