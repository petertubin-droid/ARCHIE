// =========================================================
// FRELUX PHASE 9, ARCHIE WEATHER & ENVIRONMENTAL INTELLIGENCE
//
// Integrates FRELUX's existing weather architecture
// (src/lib/weather.ts, weather-work.ts) with ARCHIE's regional
// project intelligence. Weather influences recommendations ONLY
// where technically relevant, using deterministic thresholds:
//
//   - Exterior painting: rain/wind/humidity sensitive
//   - Concrete pouring: rain sensitive
//   - Roofing: wind/rain sensitive
//   - Interior work: NOT weather dependent (explicitly excluded)
//
// Weather never changes calculator math; it only informs
// project timing and work-suitability recommendations (§6).
// =========================================================

import type { WeatherSensitiveWork, WeatherWorkAdvisory } from "./phase9-types";

/** Minimal weather-fact shape extracted from the existing
 *  WeatherDay interface (kept decoupled for testability). */
export interface WeatherFacts {
  precipitation_mm: number;
  wind_speed_ms: number;
  humidity_percent: number;
  temp_c: number;
}

/** Works that genuinely depend on weather (§6). */
const WEATHER_DEPENDENT: ReadonlySet<WeatherSensitiveWork> = new Set([
  "EXTERIOR_PAINTING",
  "CONCRETE_POURING",
  "ROOFING",
  "EXCAVATION",
  "SCREEDING",
]);

/** Deterministic thresholds, deliberately conservative. */
const THRESHOLDS = {
  RAIN_MM_UNSUITABLE: 2, // any meaningful rain stops outdoor wet work
  RAIN_MM_CAUTION: 0.2,
  WIND_MS_UNSUITABLE: 10, // roofing/generator lifts unsafe
  WIND_MS_CAUTION: 6,
  HUMIDITY_CAUTION: 85, // slow cure / sheen problems
  TEMP_C_LOW_CAUTION: 10, // paint/cement cure issues
  TEMP_C_HIGH_CAUTION: 38,
};

/**
 * Assess one work type against today's weather. Deterministic:
 * same weather facts always produce the same advisory. Works
 * with NO weather dependency return rating SUITABLE with
 * relevant:false so callers know weather was not a factor.
 */
export function assessWork(
  work: WeatherSensitiveWork,
  weather: WeatherFacts,
): WeatherWorkAdvisory {
  if (!WEATHER_DEPENDENT.has(work)) {
    return {
      work,
      rating: "SUITABLE",
      reason: "No weather dependency for this work type.",
      relevant: false,
    };
  }

  const reasons: string[] = [];
  let rating: WeatherWorkAdvisory["rating"] = "SUITABLE";

  const bump = (r: "CAUTION" | "UNSUITABLE") => {
    if (r === "UNSUITABLE") rating = "UNSUITABLE";
    else if (rating === "SUITABLE") rating = "CAUTION";
  };

  if (weather.precipitation_mm >= THRESHOLDS.RAIN_MM_UNSUITABLE) {
    reasons.push(`rain ${weather.precipitation_mm}mm`);
    bump("UNSUITABLE");
  } else if (weather.precipitation_mm >= THRESHOLDS.RAIN_MM_CAUTION) {
    reasons.push("light rain expected");
    bump("CAUTION");
  }
  if (
    work === "ROOFING" &&
    weather.wind_speed_ms >= THRESHOLDS.WIND_MS_UNSUITABLE
  ) {
    reasons.push(`wind ${weather.wind_speed_ms}m/s`);
    bump("UNSUITABLE");
  } else if (weather.wind_speed_ms >= THRESHOLDS.WIND_MS_CAUTION) {
    reasons.push("moderate wind");
    bump("CAUTION");
  }
  if (
    (work === "EXTERIOR_PAINTING" || work === "SCREEDING") &&
    weather.humidity_percent >= THRESHOLDS.HUMIDITY_CAUTION
  ) {
    reasons.push(`humidity ${weather.humidity_percent}%`);
    bump("CAUTION");
  }
  if (weather.temp_c <= THRESHOLDS.TEMP_C_LOW_CAUTION) {
    reasons.push(`cold ${weather.temp_c}°C`);
    bump("CAUTION");
  } else if (weather.temp_c >= THRESHOLDS.TEMP_C_HIGH_CAUTION) {
    reasons.push(`heat ${weather.temp_c}°C`);
    bump("CAUTION");
  }

  if (reasons.length === 0) {
    return {
      work,
      rating: "SUITABLE",
      reason: "Weather conditions are within suitable ranges for this work.",
      relevant: true,
    };
  }
  return {
    work,
    rating,
    reason: `Weather factor(s): ${reasons.join(", ")}.`,
    relevant: true,
  };
}

/**
 * Assess a set of planned works. Also derives project-timing
 * advice (§6: "appropriate project timing") — outdoor wet
 * trades first when the forecast is degrading.
 */
export function assessWorkPlan(
  works: WeatherSensitiveWork[],
  weather: WeatherFacts,
): {
  advisories: WeatherWorkAdvisory[];
  timing_advice: string | null;
} {
  const advisories = works.map((w) => assessWork(w, weather));
  const unsuitable = advisories.filter((a) => a.rating === "UNSUITABLE");
  const caution = advisories.filter((a) => a.rating === "CAUTION");

  let timing_advice: string | null = null;
  if (unsuitable.length > 0) {
    timing_advice =
      `Postpone today: ${unsuitable.map((a) => a.work).join(", ")} ` +
      `are unsuitable in current conditions.`;
  } else if (caution.length > 0) {
    timing_advice =
      `Schedule with caution: ${caution.map((a) => a.work).join(", ")} ` +
      `are weather-sensitive today; indoor trades are unaffected.`;
  }
  return { advisories, timing_advice };
}

/**
 * Seasonal pattern summary for project planning. Uses observed
 * rainfall history where available; never invents a climate
 * fact (returns null when insufficient data).
 */
export function summarizeSeason(dailyRainMm: number[]): {
  label: "DRY" | "WET" | "MIXED" | null;
  note: string | null;
} {
  if (dailyRainMm.length < 7) return { label: null, note: null };
  const wetDays = dailyRainMm.filter(
    (r) => r >= THRESHOLDS.RAIN_MM_CAUTION,
  ).length;
  const ratio = wetDays / dailyRainMm.length;
  if (ratio >= 0.6) {
    return {
      label: "WET",
      note: "Majority of recent days show rain: prioritize indoor trades.",
    };
  }
  if (ratio <= 0.15) {
    return {
      label: "DRY",
      note: "Dry window: good period for exterior and roof work.",
    };
  }
  return {
    label: "MIXED",
    note: "Intermittent rain: plan exterior work around forecast windows.",
  };
}
