// =========================================================
// WEATHER-INTELLIGENCE TESTS (batch 24, fix 92)
// Deterministic advisories from conservative thresholds;
// weather-independent works marked irrelevant; season
// summaries refuse to invent climate facts.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assessWork,
  assessWorkPlan,
  summarizeSeason,
} from "@/lib/archie/weather-intelligence";

const FAIR = {
  precipitation_mm: 0,
  wind_speed_ms: 2,
  humidity_percent: 60,
  temp_c: 24,
};
const RAINY = {
  precipitation_mm: 5,
  wind_speed_ms: 2,
  humidity_percent: 60,
  temp_c: 24,
};
const WINDY = {
  precipitation_mm: 0,
  wind_speed_ms: 12,
  humidity_percent: 60,
  temp_c: 24,
};

describe("assessWork", () => {
  it("marks weather-independent works irrelevant and suitable", () => {
    const a = assessWork("INTERIOR_PAINTING" as never, RAINY);
    expect(a.rating).toBe("SUITABLE");
    expect(a.relevant).toBe(false);
  });

  it("stops outdoor wet work in meaningful rain", () => {
    const a = assessWork("EXTERIOR_PAINTING" as never, RAINY);
    expect(a.rating).toBe("UNSUITABLE");
    expect(a.reason).toMatch(/rain 5mm/);
  });

  it("marks roofing unsuitable in high wind", () => {
    expect(assessWork("ROOFING" as never, WINDY).rating).toBe("UNSUITABLE");
    expect(assessWork("EXCAVATION" as never, WINDY).rating).toBe("CAUTION");
  });

  it("is deterministic — same facts, same advisory", () => {
    expect(assessWork("ROOFING" as never, FAIR)).toEqual(
      assessWork("ROOFING" as never, FAIR),
    );
  });

  it("cautions on cure-hostile humidity and temperature extremes", () => {
    const humid = assessWork("SCREEDING" as never, {
      ...FAIR,
      humidity_percent: 90,
    });
    expect(humid.rating).toBe("CAUTION");
    const cold = assessWork("EXTERIOR_PAINTING" as never, {
      ...FAIR,
      temp_c: 5,
    });
    expect(cold.rating).toBe("CAUTION");
    const hot = assessWork("EXTERIOR_PAINTING" as never, {
      ...FAIR,
      temp_c: 40,
    });
    expect(hot.rating).toBe("CAUTION");
  });
});

describe("assessWorkPlan", () => {
  it("advises postponement when any work is unsuitable", () => {
    const { timing_advice, advisories } = assessWorkPlan(
      ["EXTERIOR_PAINTING" as never, "INTERIOR_PAINTING" as never],
      RAINY,
    );
    expect(advisories).toHaveLength(2);
    expect(timing_advice).toMatch(/Postpone today/);
  });

  it("advises caution without postponement for CAUTION-only plans", () => {
    const { timing_advice } = assessWorkPlan(["EXCAVATION" as never], WINDY);
    expect(timing_advice).toMatch(/Schedule with caution/);
  });

  it("returns no timing advice when everything is suitable", () => {
    const { timing_advice } = assessWorkPlan(["ROOFING" as never], FAIR);
    expect(timing_advice).toBeNull();
  });
});

describe("summarizeSeason", () => {
  it("refuses to label with fewer than 7 observations", () => {
    expect(summarizeSeason([0, 0, 1])).toEqual({ label: null, note: null });
  });

  it("labels WET, DRY and MIXED from observed rainfall ratios", () => {
    expect(summarizeSeason([5, 5, 5, 5, 5, 1, 0]).label).toBe("WET");
    expect(summarizeSeason([0, 0, 0, 0, 0, 0, 0]).label).toBe("DRY");
    expect(summarizeSeason([0, 0, 0, 0, 5, 5, 0]).label).toBe("MIXED");
  });
});
