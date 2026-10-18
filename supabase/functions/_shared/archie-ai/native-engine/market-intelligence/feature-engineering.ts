// ============================================================================
// ARCHIE MARKET INTELLIGENCE — HISTORICAL FEATURE ENGINEERING ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/feature-engineering.ts
//
// Converts validated historical candles into scale-invariant, causally correct
// feature vectors. ZERO FUTURE LEAKAGE.
// ============================================================================

import type { MarketCandle, FeatureVector } from "./types.ts";
import { calculateCandleGeometry } from "./candle-interpretation.ts";
import {
  atr,
  rsi,
  macd,
  ema,
  sma,
  bollingerBands,
  adx,
} from "./technical-indicators.ts";

export const FEATURE_SCHEMA_VERSION = "v1.0.0-archie-features";

/**
 * Extracts a scale-invariant feature vector at candle index `targetIdx`.
 * strictly uses candles up to `targetIdx` (inclusive).
 */
export function extractFeatureVector(
  candles: MarketCandle[],
  targetIdx: number,
): FeatureVector | null {
  if (targetIdx < 26 || targetIdx >= candles.length) return null;

  const window = candles.slice(0, targetIdx + 1);
  const current = window[window.length - 1];

  const currentAtr = atr(window, 14) || 1;
  const geom = calculateCandleGeometry(current, targetIdx, 0, currentAtr);

  // Return lags
  const close = current.close;
  const ret1 = targetIdx >= 1 ? (close - window[window.length - 2].close) / window[window.length - 2].close : 0;
  const ret3 = targetIdx >= 3 ? (close - window[window.length - 4].close) / window[window.length - 4].close : 0;
  const ret5 = targetIdx >= 5 ? (close - window[window.length - 6].close) / window[window.length - 6].close : 0;

  // Normalized technicals
  const rsiVal = rsi(window, 14) ?? 50;
  const rsiNormalized = (rsiVal - 50) / 50; // Bounds roughly [-1, 1]

  const macdVal = macd(window);
  const macdHistToAtr = macdVal ? macdVal.histogram / currentAtr : 0;

  const closes = window.map((c) => c.close);
  const ema21Val = ema(closes, 21);
  const distFromEma21Atr = ema21Val !== null ? (close - ema21Val) / currentAtr : 0;

  const sma50Val = sma(closes, 50);
  const distFromSma50Atr = sma50Val !== null ? (close - sma50Val) / currentAtr : 0;

  const bb = bollingerBands(window, 20);
  const bbPercentB = bb ? bb.percentB : 0.5;

  const adxVal = adx(window, 14);
  const adxNormalized = adxVal ? adxVal.adx / 100 : 0.25;

  // Simple regime proxy: EMA21 > SMA50 ? Bull : Bear
  let regimeEncoding = 0;
  if (ema21Val !== null && sma50Val !== null) {
    regimeEncoding = ema21Val > sma50Val ? 1 : -1;
  }

  return {
    timestamp: current.openTimeMs,
    schemaVersion: FEATURE_SCHEMA_VERSION,
    candleIndex: targetIdx,
    bodyRatio: geom.bodyToRangeRatio,
    upperWickRatio: geom.upperWickToRangeRatio,
    lowerWickRatio: geom.lowerWickToRangeRatio,
    closePosition: geom.closePositionInRange,
    rangeToAtr: geom.rangeRelativeToAtr,
    returnLag1: ret1,
    returnLag3: ret3,
    returnLag5: ret5,
    rsiNormalized,
    macdHistToAtr,
    distFromEma21Atr,
    distFromSma50Atr,
    bbPercentB,
    adxNormalized,
    regimeEncoding,
  };
}
