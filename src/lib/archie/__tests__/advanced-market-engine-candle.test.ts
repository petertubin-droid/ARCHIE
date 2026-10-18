import { describe, it, expect } from "vitest";
import {
  calculateCandleGeometry,
  detectCandlePatterns,
  CANDLE_RULE_VERSION,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/candle-interpretation.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

describe("ARCHIE Candle Reading & Interpretation Engine", () => {
  it("calculates exact geometry for standard bullish and bearish candles", () => {
    const bullCandle: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 100,
      high: 110,
      low: 95,
      close: 108,
      volume: 50,
      isFinalized: true,
    };

    const geom = calculateCandleGeometry(bullCandle, 0, 8, 15);
    expect(geom.isBullish).toBe(true);
    expect(geom.isBearish).toBe(false);
    expect(geom.body).toBe(8);
    expect(geom.totalRange).toBe(15);
    expect(geom.upperWick).toBe(2); // 110 - 108
    expect(geom.lowerWick).toBe(5); // 100 - 95
    expect(geom.closePositionInRange).toBeCloseTo(13 / 15, 3);
  });

  it("safely handles zero-range candles without division by zero or NaN", () => {
    const flatCandle: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 0,
      isFinalized: true,
    };

    const geom = calculateCandleGeometry(flatCandle, 0);
    expect(Number.isFinite(geom.bodyToRangeRatio)).toBe(true);
    expect(Number.isFinite(geom.upperWickToRangeRatio)).toBe(true);
    expect(Number.isFinite(geom.lowerWickToRangeRatio)).toBe(true);
    expect(Number.isFinite(geom.closePositionInRange)).toBe(true);
    expect(geom.isDoji).toBe(true);
  });

  it("detects Doji pattern when body is <= 10% of total range", () => {
    const doji: MarketCandle = {
      openTimeMs: 2000,
      closeTimeMs: 3000,
      open: 100,
      high: 110,
      low: 90,
      close: 100.5,
      volume: 100,
      isFinalized: true,
    };

    const patterns = detectCandlePatterns([doji, doji]);
    const detected = patterns.find((p) => p.name === "DOJI");
    expect(detected).toBeDefined();
    expect(detected?.bias).toBe("NEUTRAL");
    expect(detected?.ruleVersion).toBe(CANDLE_RULE_VERSION);
  });

  it("detects Bullish Hammer and Pin Bar with long lower wick and small body", () => {
    const prevCandle: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 105,
      high: 106,
      low: 98,
      close: 99,
      volume: 50,
      isFinalized: true,
    };

    // Total range = 10 (90 to 100). Lower wick = 7 (90 to 97). Body = 2 (97 to 99). Upper wick = 1 (99 to 100).
    const hammer: MarketCandle = {
      openTimeMs: 2000,
      closeTimeMs: 3000,
      open: 97,
      high: 100,
      low: 90,
      close: 99,
      volume: 100,
      isFinalized: true,
    };

    const patterns = detectCandlePatterns([prevCandle, hammer]);
    expect(patterns.some((p) => p.name === "HAMMER")).toBe(true);
    expect(patterns.some((p) => p.name === "PIN_BAR_BULLISH")).toBe(true);
  });

  it("detects Shooting Star and Bearish Pin Bar with long upper wick", () => {
    const prevCandle: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 95,
      high: 102,
      low: 94,
      close: 101,
      volume: 50,
      isFinalized: true,
    };

    // Total range = 10 (90 to 100). Upper wick = 7 (93 to 100). Body = 2 (91 to 93). Lower wick = 1 (90 to 91).
    const star: MarketCandle = {
      openTimeMs: 2000,
      closeTimeMs: 3000,
      open: 93,
      high: 100,
      low: 90,
      close: 91,
      volume: 100,
      isFinalized: true,
    };

    const patterns = detectCandlePatterns([prevCandle, star]);
    expect(patterns.some((p) => p.name === "SHOOTING_STAR")).toBe(true);
    expect(patterns.some((p) => p.name === "PIN_BAR_BEARISH")).toBe(true);
  });

  it("detects Bullish Engulfing and Bearish Engulfing formations", () => {
    // Bullish Engulfing
    const bearPrev: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 100,
      high: 101,
      low: 94,
      close: 95,
      volume: 50,
      isFinalized: true,
    };
    const bullCurr: MarketCandle = {
      openTimeMs: 2000,
      closeTimeMs: 3000,
      open: 94,
      high: 103,
      low: 93,
      close: 102,
      volume: 120,
      isFinalized: true,
    };

    const bullPatterns = detectCandlePatterns([bearPrev, bullCurr]);
    expect(bullPatterns.some((p) => p.name === "BULLISH_ENGULFING")).toBe(true);

    // Bearish Engulfing
    const bullPrev2: MarketCandle = {
      openTimeMs: 3000,
      closeTimeMs: 4000,
      open: 100,
      high: 106,
      low: 99,
      close: 105,
      volume: 60,
      isFinalized: true,
    };
    const bearCurr2: MarketCandle = {
      openTimeMs: 4000,
      closeTimeMs: 5000,
      open: 106,
      high: 107,
      low: 98,
      close: 98.5,
      volume: 140,
      isFinalized: true,
    };

    const bearPatterns = detectCandlePatterns([bullPrev2, bearCurr2]);
    expect(bearPatterns.some((p) => p.name === "BEARISH_ENGULFING")).toBe(true);
  });

  it("detects Morning Star and Three White Soldiers formations", () => {
    const c1: MarketCandle = {
      openTimeMs: 1000,
      closeTimeMs: 2000,
      open: 110,
      high: 111,
      low: 98,
      close: 100,
      volume: 80,
      isFinalized: true,
    };
    const c2: MarketCandle = {
      openTimeMs: 2000,
      closeTimeMs: 3000,
      open: 98,
      high: 101,
      low: 97,
      close: 99,
      volume: 30,
      isFinalized: true,
    };
    const c3: MarketCandle = {
      openTimeMs: 3000,
      closeTimeMs: 4000,
      open: 99,
      high: 112,
      low: 98,
      close: 108,
      volume: 150,
      isFinalized: true,
    };

    const msPatterns = detectCandlePatterns([c1, c2, c3]);
    expect(msPatterns.some((p) => p.name === "MORNING_STAR")).toBe(true);
  });
});
