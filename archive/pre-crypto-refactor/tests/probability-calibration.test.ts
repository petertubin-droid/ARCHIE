import { describe, expect, it } from "vitest";
// =========================================================
// PROBABILITY & CALIBRATION TESTS (Crypto & Blockchain
// Intelligence, 2026-09-11). THE HARD PERFORMANCE GATE's math:
// conservative Wilson lower bounds, minimum-sample refusals,
// Brier calibration. Never inflated, never fabricated.
// =========================================================

import {
  wilsonLowerBound,
  estimateDirectionProbability,
  calibration,
  type CalibrationRecord,
} from "@studio-shared/archie-ai/native-engine/probability.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-data.ts";

function mk(closes: number[]): MarketCandle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000_000 + i * 86_400_000,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: 100,
  }));
}

describe("probability & calibration — evidence-first math", () => {
  it("Wilson lower bound is deliberately BELOW the observed rate", () => {
    // 70/100 hits: observed 0.70, lower bound must be < 0.70
    const lb = wilsonLowerBound(70, 100);
    expect(lb).toBeLessThan(0.7);
    expect(lb).toBeGreaterThan(0.6); // 95% CI for 0.70 over n=100 ≈ [0.60, 0.78]
    // Small samples shrink hard: 7/10 also "70%" observed
    const lbSmall = wilsonLowerBound(7, 10);
    expect(lbSmall).toBeLessThan(lb);
    // Zero samples → 0, never a guess
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("an unbroken uptrend yields a directional estimate with real analogs", () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + i * 1.5);
    const est = estimateDirectionProbability(mk(closes), 5);
    expect(est.direction).toBe("long");
    expect(est.samples).toBeGreaterThan(20);
    // every analog in a monotonically rising series hit → rate 1.0,
    // lower bound still < 1.0 (honest uncertainty)
    expect(est.observedRate).toBe(1);
    expect(est.probability).not.toBeNull();
    expect(est.probability!).toBeLessThan(1);
    expect(est.probability!).toBeGreaterThan(0.8);
  });

  it("range regime NEVER produces a probability estimate", () => {
    const chop = Array.from({ length: 100 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 0.1));
    const est = estimateDirectionProbability(mk(chop), 5);
    expect(est.probability).toBeNull();
    expect(est.direction).toBe("flat");
    expect(est.note).toContain("NO probability estimate");
  });

  it("thin history is an honest refusal, never an extrapolation", () => {
    const short = mk(Array.from({ length: 30 }, (_, i) => 100 + i));
    const est = estimateDirectionProbability(short, 5);
    // trending-up regime but only a handful of analogs fit in 30 bars
    if (est.direction !== "flat") {
      expect(est.samples).toBeLessThan(20);
      expect(est.probability).toBeNull();
      expect(est.note).toContain("NO probability estimate");
    } else {
      expect(est.probability).toBeNull();
    }
  });

  it("calibration refuses to bless a methodology with < 10 resolved predictions", () => {
    const few: CalibrationRecord[] = [
      { reportedProbability: 0.7, outcomeFavorable: true },
      { reportedProbability: 0.7, outcomeFavorable: false },
    ];
    const c = calibration(few);
    expect(c.brier).toBeNull();
    expect(c.resolved).toBe(2);
    expect(c.note).toContain("at least 10 required");
  });

  it("Brier score is exact: perfect predictions 0, coin-flip lies ~0.25", () => {
    const perfect: CalibrationRecord[] = Array.from({ length: 12 }, () => ({
      reportedProbability: 0.9,
      outcomeFavorable: true,
    }));
    expect(calibration(perfect).brier).toBeCloseTo(0.01, 6); // (0.9-1)^2 × 12
    const flip: CalibrationRecord[] = Array.from({ length: 20 }, (_, i) => ({
      reportedProbability: 0.5,
      outcomeFavorable: i % 2 === 0,
    }));
    const b = calibration(flip).brier!;
    expect(b).toBeCloseTo(0.25, 6);
  });
});
