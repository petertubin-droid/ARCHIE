// ============================================================================
// ARCHIE MARKET INTELLIGENCE — MARKET STRUCTURE & REGIME DETECTION ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/market-structure.ts
//
// Detects swing highs/lows, support/resistance zones, breakouts, fakeouts,
// liquidity sweeps, and market regimes.
// ZERO LOOK-AHEAD BIAS: Confirmation timestamps are recorded at the exact moment
// right-hand bars complete, preserving strict causal integrity.
// ============================================================================

import type {
  MarketCandle,
  SwingPoint,
  MarketStructureAssessment,
  MarketRegimeType,
} from "./types.ts";
import { atr, bollingerBands } from "./technical-indicators.ts";

/**
 * Detects swing points with strict causal confirmation.
 * leftBars: number of bars to the left that must be lower/higher
 * rightBars: number of bars to the right that must confirm the pivot
 */
export function detectCausalSwings(
  candles: MarketCandle[],
  leftBars = 3,
  rightBars = 2,
): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < leftBars + rightBars + 1) return swings;

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const pivotCandidate = candles[i];
    let isHigh = true;
    let isLow = true;

    // Check left bars
    for (let j = i - leftBars; j < i; j++) {
      if (candles[j].high >= pivotCandidate.high) isHigh = false;
      if (candles[j].low <= pivotCandidate.low) isLow = false;
    }

    // Check right bars (confirming bars)
    for (let j = i + 1; j <= i + rightBars; j++) {
      if (candles[j].high >= pivotCandidate.high) isHigh = false;
      if (candles[j].low <= pivotCandidate.low) isLow = false;
    }

    const confirmedAtTimestamp = candles[i + rightBars].closeTimeMs;

    if (isHigh) {
      swings.push({
        index: i,
        type: "SWING_HIGH",
        price: pivotCandidate.high,
        candleTimestamp: pivotCandidate.openTimeMs,
        confirmedAtTimestamp,
      });
    }

    if (isLow) {
      swings.push({
        index: i,
        type: "SWING_LOW",
        price: pivotCandidate.low,
        candleTimestamp: pivotCandidate.openTimeMs,
        confirmedAtTimestamp,
      });
    }
  }

  return swings;
}

/**
 * Evaluates market structure, swings, support/resistance, and regime.
 */
export function analyzeMarketStructure(
  candles: MarketCandle[],
): MarketStructureAssessment {
  const evidence: string[] = [];
  const swings = detectCausalSwings(candles, 3, 2);

  // Separate swing highs and lows
  const swingHighs = swings.filter((s) => s.type === "SWING_HIGH");
  const swingLows = swings.filter((s) => s.type === "SWING_LOW");

  let higherHighsCount = 0;
  let lowerHighsCount = 0;
  let higherLowsCount = 0;
  let lowerLowsCount = 0;

  for (let i = 1; i < swingHighs.length; i++) {
    if (swingHighs[i].price > swingHighs[i - 1].price) higherHighsCount++;
    else lowerHighsCount++;
  }

  for (let i = 1; i < swingLows.length; i++) {
    if (swingLows[i].price > swingLows[i - 1].price) higherLowsCount++;
    else lowerLowsCount++;
  }

  // Support & Resistance Zones
  const supportZones: Array<{ price: number; touches: number }> = [];
  const resistanceZones: Array<{ price: number; touches: number }> = [];

  const tolerance = (candles[candles.length - 1].close || 1) * 0.003; // 0.3% cluster tolerance

  for (const sh of swingHighs) {
    const existing = resistanceZones.find((z) => Math.abs(z.price - sh.price) <= tolerance);
    if (existing) {
      existing.touches++;
    } else {
      resistanceZones.push({ price: sh.price, touches: 1 });
    }
  }

  for (const sl of swingLows) {
    const existing = supportZones.find((z) => Math.abs(z.price - sl.price) <= tolerance);
    if (existing) {
      existing.touches++;
    } else {
      supportZones.push({ price: sl.price, touches: 1 });
    }
  }

  // Volatility expansion / contraction
  const recentAtr = atr(candles, 14) || 1;
  const longAtr = atr(candles, 30) || 1;
  const volatilityExpansion = recentAtr > longAtr * 1.25;
  const volatilityContraction = recentAtr < longAtr * 0.8;

  if (volatilityExpansion) evidence.push("Volatility expansion detected: recent ATR 25% above 30-period baseline.");
  if (volatilityContraction) evidence.push("Volatility contraction detected: market entering consolidation.");

  // Liquidity sweeps check
  let liquiditySweepDetected = false;
  if (candles.length >= 2 && swingHighs.length > 0 && swingLows.length > 0) {
    const lastCandle = candles[candles.length - 1];
    const prevHigh = swingHighs[swingHighs.length - 1].price;
    const prevLow = swingLows[swingLows.length - 1].price;

    // Bearish sweep: High pierced prevHigh, but closed below it
    if (lastCandle.high > prevHigh && lastCandle.close < prevHigh) {
      liquiditySweepDetected = true;
      evidence.push(`Bearish liquidity sweep above swing high ${prevHigh.toFixed(4)}.`);
    }
    // Bullish sweep: Low pierced prevLow, but closed above it
    if (lastCandle.low < prevLow && lastCandle.close > prevLow) {
      liquiditySweepDetected = true;
      evidence.push(`Bullish liquidity sweep below swing low ${prevLow.toFixed(4)}.`);
    }
  }

  // Regime classification
  let regime: MarketRegimeType = "RANGING";
  let regimeConfidence = 0.65;

  if (higherHighsCount >= 2 && higherLowsCount >= 2) {
    regime = "TRENDING_BULL";
    regimeConfidence = 0.85;
    evidence.push(`Bullish trend: ${higherHighsCount} higher highs and ${higherLowsCount} higher lows.`);
  } else if (lowerHighsCount >= 2 && lowerLowsCount >= 2) {
    regime = "TRENDING_BEAR";
    regimeConfidence = 0.85;
    evidence.push(`Bearish trend: ${lowerHighsCount} lower highs and ${lowerLowsCount} lower lows.`);
  } else if (volatilityExpansion) {
    regime = "HIGH_VOLATILITY";
    regimeConfidence = 0.75;
  } else if (volatilityContraction) {
    regime = "LOW_VOLATILITY";
    regimeConfidence = 0.75;
  } else {
    regime = "RANGING";
    evidence.push("Equilibrium price action: mixed swings within range bounds.");
  }

  return {
    swings,
    higherHighsCount,
    higherLowsCount,
    lowerHighsCount,
    lowerLowsCount,
    supportZones: supportZones.sort((a, b) => b.touches - a.touches).slice(0, 5),
    resistanceZones: resistanceZones.sort((a, b) => b.touches - a.touches).slice(0, 5),
    regime,
    regimeConfidence,
    volatilityExpansion,
    volatilityContraction,
    liquiditySweepDetected,
    evidence,
  };
}

// ----------------------------------------------------------------------------
// Microstructure & Order Book Analysis (Section 10 & 20)
// ----------------------------------------------------------------------------

import type { OrderBookSnapshot, OrderBookLevel, MicrostructureMetrics } from "./types.ts";

export function analyzeOrderBook(
  symbol: string,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  timestampMs = Date.now(),
): OrderBookSnapshot {
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

  const bestBid = sortedBids[0]?.price ?? 0;
  const bestAsk = sortedAsks[0]?.price ?? 0;
  const spread = Math.max(0, bestAsk - bestBid);
  const mid = (bestBid + bestAsk) / 2 || 1;
  const spreadBps = Math.round(((spread / mid) * 10_000) * 100) / 100;

  const top10Bids = sortedBids.slice(0, 10);
  const top10Asks = sortedAsks.slice(0, 10);
  const totalBidVol = top10Bids.reduce((acc, b) => acc + b.quantity, 0);
  const totalAskVol = top10Asks.reduce((acc, a) => acc + a.quantity, 0);

  const denominator = Math.max(1e-8, totalBidVol + totalAskVol);
  const depthImbalance = Math.round(((totalBidVol - totalAskVol) / denominator) * 1000) / 1000;

  return {
    symbol,
    timestampMs,
    bids: sortedBids,
    asks: sortedAsks,
    spread: Math.round(spread * 10000) / 10000,
    spreadBps,
    depthImbalance,
  };
}

export function computeMicrostructureMetrics(
  snapshot: OrderBookSnapshot,
  volumeBuckets?: Array<{ buyVolume: number; sellVolume: number }>,
): MicrostructureMetrics {
  const bestBid = snapshot.bids[0]?.price ?? 0;
  const bestAsk = snapshot.asks[0]?.price ?? 0;
  const mid = (bestBid + bestAsk) / 2 || 1;
  const spread = Math.max(0, bestAsk - bestBid);
  const spreadBps = Math.round(((spread / mid) * 10_000) * 100) / 100;

  // Calculate VPIN (Volume-Synchronized Probability of Toxicity)
  let vpin = 0.20; // default baseline toxicity
  if (volumeBuckets && volumeBuckets.length > 0) {
    let totalImbalance = 0;
    let totalVol = 0;
    for (const b of volumeBuckets) {
      const bucketVol = b.buyVolume + b.sellVolume;
      if (bucketVol > 0) {
        totalImbalance += Math.abs(b.buyVolume - b.sellVolume);
        totalVol += bucketVol;
      }
    }
    if (totalVol > 0) {
      vpin = Math.min(1.0, Math.max(0.0, totalImbalance / totalVol));
    }
  } else {
    // Estimate baseline VPIN from depth imbalance
    vpin = Math.min(0.85, 0.20 + Math.abs(snapshot.depthImbalance) * 0.40);
  }

  let quality: "PRISTINE" | "ELEVATED_TOXICITY" | "ILLIQUID" = "PRISTINE";
  if (spreadBps > 40 || snapshot.bids.length === 0 || snapshot.asks.length === 0) {
    quality = "ILLIQUID";
  } else if (vpin > 0.60 || spreadBps > 15) {
    quality = "ELEVATED_TOXICITY";
  }

  return {
    symbol: snapshot.symbol,
    timestampMs: snapshot.timestampMs,
    bidAskSpread: Math.round(spread * 10000) / 10000,
    spreadBps,
    depthImbalance: snapshot.depthImbalance,
    vpinToxicity: Math.round(vpin * 1000) / 1000,
    effectiveSpread: Math.round(spread * 1.2 * 10000) / 10000,
    microstructureQuality: quality,
  };
}
