// =========================================================
// GLOBAL-CONTEXT TESTS (batch 27, fix 115)
// Location consent grants LOCATION ONLY (structurally
// enforced); project location always overrides device;
// device location requires explicit consent; unknown regions
// resolve honest defaults, never invented market data.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assertLocationConsentBoundary,
  buildGlobalContext,
  resolveLocationAuthority,
  resolveRegionalProfile,
} from "@/lib/archie/global-context";
import type { FreluxLocation } from "@/lib/location-intelligence/model";

function loc(lat = 6.5, lng = 3.4, cc: string | null = "NG"): FreluxLocation {
  return {
    latitude: lat,
    longitude: lng,
    accuracy_m: null,
    formatted_address: null,
    country: cc ? "Somewhere" : null,
    country_code: cc,
  } as FreluxLocation;
}

describe("the consent boundary (spec §3)", () => {
  it("accepts location-only consent", () => {
    expect(() =>
      assertLocationConsentBoundary({
        location_granted: true,
        private_device_data_granted: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertLocationConsentBoundary({
        location_granted: false,
        private_device_data_granted: false,
      }),
    ).not.toThrow();
  });

  it("structurally refuses private device access exceeding location consent", () => {
    expect(() =>
      assertLocationConsentBoundary({
        location_granted: false,
        private_device_data_granted: true,
      }),
    ).toThrow(/private device access cannot exceed location consent/i);
  });
});

describe("resolveLocationAuthority — precedence", () => {
  it("user project location ALWAYS overrides device location", () => {
    const r = resolveLocationAuthority({
      project_location: loc(6.5, 3.4, "NG"),
      device_location: loc(51.5, -0.1, "GB"),
    });
    expect(r.source).toBe("USER_PROJECT_LOCATION");
    expect(r.effective_location.country_code).toBe("NG");
  });

  it("falls through invalid candidates instead of using garbage coordinates", () => {
    const r = resolveLocationAuthority({
      project_location: { ...loc(), latitude: null },
      user_selected_location: loc(51.5, -0.1, "GB"),
    });
    expect(r.source).toBe("USER_SELECTED_LOCATION");
  });

  it("throws honestly when no valid location exists", () => {
    expect(() => resolveLocationAuthority({})).toThrow(
      /Insufficient location context/i,
    );
  });
});

describe("resolveRegionalProfile — honest defaults, no invented data", () => {
  it("resolves conventions for known regions", () => {
    const ng = resolveRegionalProfile(loc(6.5, 3.4, "NG"));
    expect(ng.currency).toBe("NGN");
    expect(ng.suggested_languages).toContain("yo");
    expect(ng.market_context_keys).toContain("country:NG");
  });

  it("falls back to NGN/en for unknown regions and passes keys for runtime joining", () => {
    const unknown = resolveRegionalProfile(loc(10.0, 10.0, null));
    expect(unknown.currency).toBe("NGN");
    expect(unknown.suggested_languages).toEqual(["en"]);
    expect(unknown.market_context_keys).toEqual([]);
    expect(unknown.climate_zone).toBeNull();
  });
});

describe("buildGlobalContext — the full consent flow", () => {
  it("refuses device location without explicit consent", () => {
    expect(() =>
      buildGlobalContext({
        consent: {
          location_granted: false,
          private_device_data_granted: false,
        },
        device_location: loc(6.5, 3.4, "NG"),
      }),
    ).toThrow(/without consent/i);
  });

  it("uses project location with no geolocation consent needed", () => {
    const { resolution, profile } = buildGlobalContext({
      consent: { location_granted: false, private_device_data_granted: false },
      project_location: loc(6.5, 3.4, "NG"),
    });
    expect(resolution.source).toBe("USER_PROJECT_LOCATION");
    expect(profile.currency).toBe("NGN");
  });

  it("uses consented device location as fallback context", () => {
    const { resolution } = buildGlobalContext({
      consent: { location_granted: true, private_device_data_granted: false },
      device_location: loc(6.5, 3.4, "NG"),
    });
    expect(resolution.source).toBe("DEVICE_LOCATION");
  });
});
