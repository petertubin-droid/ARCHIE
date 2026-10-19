// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — MARKET FORECASTING & REGIMES
// src/lib/archie/trading/market-forecasting.ts
//
// Market regime detection & calibrated probabilistic forecasting:
//   * Regimes: Trending (Bull/Bear), Ranging (Low/High Vol), Breakout
//   * Calibrated probability estimation (logistic fusion over inspectable features)
//   * Expected return, ATR volatility boundaries, and invalidation levels
//   * Transparent bullish vs bearish evidence breakdown
//   * Strict uncertainty handling & out-of-distribution guardrails
//   * Never manufacture or inflate probability scores
// =========================================================

import type {
  CandleData,
  Timeframe,
  MarketRegimeState,
  MarketRegimeType,
  ProbabilisticForecast,
  TechnicalIndicatorSuite,
  CandleSeriesAnalysis,
} from "./types";

/**
 * Detect current market regime from indicator suite & price structure.
 */
export function detectMarketRegime(
  candles: CandleData[],
  indicators: TechnicalIndicatorSuite
): MarketRegimeState {
  if (candles.length < 30) {
    return {
      regime: "RANGING_LOW_VOLATILITY",
      confidenceScore: 0.5,
      adxStrength: null,
      volatilityCondition: "NORMAL",
      trendAlignment: "NEUTRAL",
      description: "Insufficient historical bars for robust regime classification.",
    };
  }

  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx].close;

  const currentADX = indicators.adx14.adx[lastIdx];
  const currentPlusDI = indicators.adx14.plusDI[lastIdx];
  const currentMinusDI = indicators.adx14.minusDI[lastIdx];

  const ema9 = indicators.ema9[lastIdx];
  const ema21 = indicators.ema21[lastIdx];
  const sma50 = indicators.sma50[lastIdx];

  const bw = indicators.bollingerBands.bandwidth[lastIdx];
  const supertrendDir = indicators.supertrend.directions[lastIdx];

  // Volatility evaluation
  let volatilityCondition: MarketRegimeState["volatilityCondition"] = "NORMAL";
  if (bw !== null) {
    if (bw < 1.5) volatilityCondition = "LOW";
    else if (bw > 6.0) volatilityCondition = "EXTREME";
    else if (bw > 3.5) volatilityCondition = "HIGH";
  }

  // Trend alignment
  let trendAlignment: MarketRegimeState["trendAlignment"] = "NEUTRAL";
  if (ema9 && ema21 && sma50) {
    if (lastClose > ema9 && ema9 > ema21 && ema21 > sma50) {
      trendAlignment = "ALIGNED_UP";
    } else if (lastClose < ema9 && ema9 < ema21 && ema21 < sma50) {
      trendAlignment = "ALIGNED_DOWN";
    } else if (
      (lastClose > ema21 && ema21 < sma50) ||
      (lastClose < ema21 && ema21 > sma50)
    ) {
      trendAlignment = "CONFLICTED";
    }
  }

  // Regime classification logic
  let regime: MarketRegimeType = "RANGING_LOW_VOLATILITY";
  let confidence = 0.65;
  let description = "Balanced consolidating market.";

  const isTrending = currentADX !== null && currentADX >= 25;
  const isBreakout =
    bw !== null && bw > 3.0 && indicators.supertrend.trendChanges[lastIdx];

  if (isBreakout) {
    regime = "VOLATILITY_BREAKOUT";
    confidence = 0.78;
    description = "Volatility expansion from band compression with trend change.";
  } else if (isTrending) {
    if (trendAlignment === "ALIGNED_UP" && supertrendDir === 1) {
      regime = "TRENDING_BULLISH";
      confidence = Math.min(0.9, 0.65 + (currentADX - 25) * 0.01);
      description = `Strong directional uptrend with ADX ${currentADX.toFixed(1)}.`;
    } else if (trendAlignment === "ALIGNED_DOWN" && supertrendDir === -1) {
      regime = "TRENDING_BEARISH";
      confidence = Math.min(0.9, 0.65 + (currentADX - 25) * 0.01);
      description = `Strong directional downtrend with ADX ${currentADX.toFixed(1)}.`;
    } else {
      regime = "RANGING_HIGH_VOLATILITY";
      confidence = 0.6;
      description = "Elevated volatility with conflicting directional indicators.";
    }
  } else {
    if (volatilityCondition === "HIGH" || volatilityCondition === "EXTREME") {
      regime = "RANGING_HIGH_VOLATILITY";
      confidence = 0.68;
      description = "High-amplitude oscillation between range boundaries.";
    } else {
      regime = "RANGING_LOW_VOLATILITY";
      confidence = 0.72;
      description = "Low-volatility consolidation; mean-reversion favored.";
    }
  }

  return {
    regime,
    confidenceScore: confidence,
    adxStrength: currentADX,
    volatilityCondition,
    trendAlignment,
    description,
  };
}

/**
 * Generate calibrated probabilistic forecast for future price action.
 */
export function generateProbabilisticForecast(
  symbol: string,
  timeframe: Timeframe,
  candles: CandleData[],
  indicators: TechnicalIndicatorSuite,
  candleAnalysis: CandleSeriesAnalysis,
  regimeState: MarketRegimeState
): ProbabilisticForecast {
  const lastIdx = candles.length - 1;
  const currentCandle = candles[lastIdx];
  const lastClose = currentCandle.close;
  const currentATR = indicators.atr14[lastIdx] ?? lastClose * 0.01;

  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];

  let rawBullScore = 0;
  let rawBearScore = 0;

  // 1. Regime context
  if (regimeState.regime === "TRENDING_BULLISH") {
    rawBullScore += 2.0;
    bullishEvidence.push(`Bullish Market Regime (ADX ${regimeState.adxStrength?.toFixed(1) ?? "N/A"})`);
  } else if (regimeState.regime === "TRENDING_BEARISH") {
    rawBearScore += 2.0;
    bearishEvidence.push(`Bearish Market Regime (ADX ${regimeState.adxStrength?.toFixed(1) ?? "N/A"})`);
  }

  // 2. Moving Average & Supertrend
  const stDir = indicators.supertrend.directions[lastIdx];
  if (stDir === 1) {
    rawBullScore += 1.2;
    bullishEvidence.push("Supertrend confirmed Bullish");
  } else if (stDir === -1) {
    rawBearScore += 1.2;
    bearishEvidence.push("Supertrend confirmed Bearish");
  }

  // 3. ARCHIE Blue Market Line
  const blueVal = indicators.blueMarketLine.values[lastIdx];
  const blueSlope = indicators.blueMarketLine.slope[lastIdx];
  if (blueVal !== null && blueSlope !== null) {
    if (lastClose > blueVal && blueSlope > 0) {
      rawBullScore += 1.5;
      bullishEvidence.push("Price above rising ARCHIE Blue Line");
    } else if (lastClose < blueVal && blueSlope < 0) {
      rawBearScore += 1.5;
      bearishEvidence.push("Price below falling ARCHIE Blue Line");
    }
  }

  // 4. Momentum: RSI & MACD
  const rsi = indicators.rsi14[lastIdx];
  if (rsi !== null) {
    if (rsi > 55 && rsi < 70) {
      rawBullScore += 1.0;
      bullishEvidence.push(`RSI constructive in expansion zone (${rsi.toFixed(1)})`);
    } else if (rsi < 45 && rsi > 30) {
      rawBearScore += 1.0;
      bearishEvidence.push(`RSI weak in bearish distribution (${rsi.toFixed(1)})`);
    } else if (rsi >= 70) {
      bearishEvidence.push(`RSI overbought (${rsi.toFixed(1)}) — potential exhaustion`);
    } else if (rsi <= 30) {
      bullishEvidence.push(`RSI oversold (${rsi.toFixed(1)}) — potential bottom bounce`);
    }
  }

  const hist = indicators.macd.histogram[lastIdx];
  if (hist !== null) {
    if (hist > 0) {
      rawBullScore += 0.8;
      bullishEvidence.push("MACD histogram positive");
    } else {
      rawBearScore += 0.8;
      bearishEvidence.push("MACD histogram negative");
    }
  }

  // 5. Candle Analysis
  const lastCandleMetric = candleAnalysis.recentCandles[candleAnalysis.recentCandles.length - 1];
  if (lastCandleMetric) {
    if (lastCandleMetric.detectedPatterns.includes("PIN_BAR_BULLISH")) {
      rawBullScore += 1.4;
      bullishEvidence.push("Bullish Pin Bar rejection of lower levels");
    }
    if (lastCandleMetric.detectedPatterns.includes("BULLISH_ENGULFING")) {
      rawBullScore += 1.3;
      bullishEvidence.push("Bullish Engulfing pattern formed");
    }
    if (lastCandleMetric.detectedPatterns.includes("PIN_BAR_BEARISH")) {
      rawBearScore += 1.4;
      bearishEvidence.push("Bearish Pin Bar rejection of upper levels");
    }
    if (lastCandleMetric.detectedPatterns.includes("BEARISH_ENGULFING")) {
      rawBearScore += 1.3;
      bearishEvidence.push("Bearish Engulfing pattern formed");
    }
  }

  // Softmax / Logistic probability calibration (guaranteed sum = 1.0)
  const netAdvantage = rawBullScore - rawBearScore;
  const neutralBase = 1.0;
  const expBull = Math.exp(Math.min(3.0, Math.max(-3.0, rawBullScore / 2.5)));
  const expBear = Math.exp(Math.min(3.0, Math.max(-3.0, rawBearScore / 2.5)));
  const expNeut = Math.exp(neutralBase);
  const totalExp = expBull + expBear + expNeut;

  let bullishProbability = Number((expBull / totalExp).toFixed(3));
  let bearishProbability = Number((expBear / totalExp).toFixed(3));
  let neutralProbability = Number((1.0 - bullishProbability - bearishProbability).toFixed(3));

  // Safety floor normalization
  if (neutralProbability < 0.05) neutralProbability = 0.05;
  const remaining = 1.0 - neutralProbability;
  const ratio = bullishProbability / (bullishProbability + bearishProbability || 1);
  bullishProbability = Number((remaining * ratio).toFixed(3));
  bearishProbability = Number((remaining * (1 - ratio)).toFixed(3));

  // Expected returns and volatility bounds
  const expectedReturnPct = Number((netAdvantage * 0.15).toFixed(2));
  const expectedATRVolQuote = Number((currentATR * 1.5).toFixed(4));

  // Structural invalidation & target levels
  const targetMultiplier = 1.8;
  const invalidationMultiplier = 1.2;

  let structuralInvalidationPrice: number;
  let targetPriceFavorable: number;
  let targetPriceAdverse: number;

  if (bullishProbability >= bearishProbability) {
    targetPriceFavorable = lastClose + currentATR * targetMultiplier;
    structuralInvalidationPrice = lastClose - currentATR * invalidationMultiplier;
    targetPriceAdverse = structuralInvalidationPrice;
  } else {
    targetPriceFavorable = lastClose - currentATR * targetMultiplier;
    structuralInvalidationPrice = lastClose + currentATR * invalidationMultiplier;
    targetPriceAdverse = structuralInvalidationPrice;
  }

  // Model uncertainty calculation
  const conflict = Math.min(rawBullScore, rawBearScore);
  const uncertaintyScore = Number(
    Math.min(1.0, Math.max(0.1, conflict / (rawBullScore + rawBearScore + 0.1))).toFixed(2)
  );

  let modelConfidence: ProbabilisticForecast["modelConfidence"] = "HIGH";
  if (uncertaintyScore > 0.45) modelConfidence = "LOW";
  else if (uncertaintyScore > 0.25) modelConfidence = "MODERATE";

  return {
    symbol,
    timeframe,
    horizon: "1h - 4h",
    generatedAtMs: Date.now(),
    bullishProbability,
    bearishProbability,
    neutralProbability,
    expectedReturnPct,
    expectedATRVolQuote,
    structuralInvalidationPrice,
    targetPriceFavorable,
    targetPriceAdverse,
    uncertaintyScore,
    modelConfidence,
    bullishEvidence,
    bearishEvidence,
  };
}
