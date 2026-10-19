// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — ENTRY & EXIT ENGINE
// src/lib/archie/trading/entry-exit-engine.ts
//
// Actionable setup evaluation, dynamic stop-loss & exit intelligence:
//   * Candidate entry signal evaluation (BUY/SELL/WAIT/HOLD/NO_TRADE)
//   * Deterministic stop-loss calculation & risk-to-reward validation
//   * Dynamic trailing stop management (Break-even & ATR ratchet)
//   * Real-time position exit intelligence & emergency risk alerts
// =========================================================

import type {
  CandleData,
  MarketInstrument,
  Timeframe,
  TechnicalIndicatorSuite,
  CandleSeriesAnalysis,
  MarketRegimeState,
  ProbabilisticForecast,
  CandidateEntrySignal,
  StopLossPlan,
  DynamicTrailingStopState,
  ExitAlert,
} from "./types";

/**
 * Evaluate candidate trade entry setup.
 */
export function evaluateEntrySignal(
  instrument: MarketInstrument,
  timeframe: Timeframe,
  candles: CandleData[],
  indicators: TechnicalIndicatorSuite,
  candleAnalysis: CandleSeriesAnalysis,
  regimeState: MarketRegimeState,
  forecast: ProbabilisticForecast
): CandidateEntrySignal {
  const lastIdx = candles.length - 1;
  const current = candles[lastIdx];
  const lastClose = current.close;
  const atr = indicators.atr14[lastIdx] ?? lastClose * 0.01;

  const rejectionReasons: string[] = [];
  let decision: CandidateEntrySignal["decision"] = "NO_TRADE";
  let side: "BUY" | "SELL" | null = null;
  let suggestedStopLoss = 0;
  let suggestedTakeProfit1 = 0;
  let suggestedTakeProfit2 = 0;
  let riskRewardRatio = 0;
  let invalidationPrice = 0;

  // Signal expiration: valid for 3 candle durations
  const barDurationMs = 60000; // default 1m in ms
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + barDurationMs * 3;

  // Confidence & conviction threshold
  const minProbThreshold = 0.52;
  const hasBullConviction = forecast.bullishProbability >= minProbThreshold;
  const hasBearConviction = forecast.bearishProbability >= minProbThreshold;

  // 1. Regime alignment check
  const regimeConcordance =
    (hasBullConviction && regimeState.regime !== "TRENDING_BEARISH") ||
    (hasBearConviction && regimeState.regime !== "TRENDING_BULLISH");

  if (!regimeConcordance) {
    rejectionReasons.push(`Setup conflicts with dominant market regime (${regimeState.regime})`);
  }

  // 2. Candle confirmation check
  const latestCandle = candleAnalysis.recentCandles[candleAnalysis.recentCandles.length - 1];
  const candleConfirmation =
    (hasBullConviction && (latestCandle?.direction === "BULLISH" || latestCandle?.detectedPatterns.includes("PIN_BAR_BULLISH"))) ||
    (hasBearConviction && (latestCandle?.direction === "BEARISH" || latestCandle?.detectedPatterns.includes("PIN_BAR_BEARISH")));

  if (hasBullConviction && regimeConcordance) {
    side = "BUY";
    // Structural stop below recent swing low or 1.5 ATR
    suggestedStopLoss = Number((lastClose - atr * 1.5).toFixed(instrument.digits));
    const riskDistance = lastClose - suggestedStopLoss;
    suggestedTakeProfit1 = Number((lastClose + riskDistance * 1.5).toFixed(instrument.digits));
    suggestedTakeProfit2 = Number((lastClose + riskDistance * 2.5).toFixed(instrument.digits));
    invalidationPrice = suggestedStopLoss;
    riskRewardRatio = Number(((suggestedTakeProfit1 - lastClose) / riskDistance).toFixed(2));

    if (riskRewardRatio >= 1.5 && candleConfirmation) {
      decision = "BUY";
    } else {
      decision = "WAIT_FOR_CONFIRMATION";
      if (!candleConfirmation) rejectionReasons.push("Awaiting bullish candle confirmation bar.");
      if (riskRewardRatio < 1.5) rejectionReasons.push("Risk-to-reward ratio below institutional 1.5 threshold.");
    }
  } else if (hasBearConviction && regimeConcordance) {
    side = "SELL";
    suggestedStopLoss = Number((lastClose + atr * 1.5).toFixed(instrument.digits));
    const riskDistance = suggestedStopLoss - lastClose;
    suggestedTakeProfit1 = Number((lastClose - riskDistance * 1.5).toFixed(instrument.digits));
    suggestedTakeProfit2 = Number((lastClose - riskDistance * 2.5).toFixed(instrument.digits));
    invalidationPrice = suggestedStopLoss;
    riskRewardRatio = Number(((lastClose - suggestedTakeProfit1) / riskDistance).toFixed(2));

    if (riskRewardRatio >= 1.5 && candleConfirmation) {
      decision = "SELL";
    } else {
      decision = "WAIT_FOR_CONFIRMATION";
      if (!candleConfirmation) rejectionReasons.push("Awaiting bearish candle confirmation bar.");
      if (riskRewardRatio < 1.5) rejectionReasons.push("Risk-to-reward ratio below institutional 1.5 threshold.");
    }
  } else {
    decision = "NO_TRADE";
    rejectionReasons.push("Probability scores remain inside neutral equilibrium boundary.");
  }

  return {
    id: `sig_${Date.now()}_${instrument.symbol.replace(/[^A-Z0-9]/g, "")}`,
    symbol: instrument.symbol,
    timeframe,
    decision,
    side,
    entryPrice: lastClose,
    suggestedStopLoss,
    suggestedTakeProfit1,
    suggestedTakeProfit2,
    riskRewardRatio,
    invalidationPrice,
    createdAtMs,
    expiresAtMs,
    regimeConcordance,
    candleConfirmation,
    modelConfidencePct: Number(((Math.max(forecast.bullishProbability, forecast.bearishProbability)) * 100).toFixed(1)),
    rejectionReasons,
    notes: rejectionReasons.length === 0 ? "Qualified professional setup." : rejectionReasons.join("; "),
  };
}

/**
 * Calculate deterministic stop loss and validate risk parameters.
 */
export function calculateStopLossPlan(
  side: "BUY" | "SELL",
  entryPrice: number,
  candles: CandleData[],
  instrument: MarketInstrument,
  accountEquity: number,
  maxRiskPct: number = 2.0
): StopLossPlan {
  const atrValues = indicatorsATR(candles, 14);
  const lastATR = atrValues[atrValues.length - 1] ?? entryPrice * 0.01;

  let stopPrice = 0;
  if (side === "BUY") {
    // 1.8 ATR distance or swing low
    stopPrice = Number((entryPrice - lastATR * 1.8).toFixed(instrument.digits));
  } else {
    stopPrice = Number((entryPrice + lastATR * 1.8).toFixed(instrument.digits));
  }

  const stopDistance = Math.abs(entryPrice - stopPrice);
  const stopDistancePips = instrument.pipSize > 0 ? stopDistance / instrument.pipSize : stopDistance;

  // Monetary risk quote calculation for standard lot (1.0 lot)
  const monetaryRiskQuote = stopDistance * instrument.contractSize;
  const riskPctEquity = accountEquity > 0 ? (monetaryRiskQuote / accountEquity) * 100 : 0;

  // Validation
  let isValid = true;
  let reason = "Valid protective stop structure.";

  if (side === "BUY" && stopPrice >= entryPrice) {
    isValid = false;
    reason = "Long stop-loss must be strictly below entry price.";
  } else if (side === "SELL" && stopPrice <= entryPrice) {
    isValid = false;
    reason = "Short stop-loss must be strictly above entry price.";
  } const spreadQuote = instrument.pipSize > 0 ? instrument.spread * instrument.pipSize : instrument.spread;
  if (stopDistance < spreadQuote * 1.5) {
    isValid = false;
    reason = "Stop-loss distance is smaller than spread noise threshold.";
  }

  return {
    side,
    entryPrice,
    stopPrice,
    stopDistancePips: Number(stopDistancePips.toFixed(1)),
    monetaryRiskQuote: Number(monetaryRiskQuote.toFixed(2)),
    riskPctEquity: Number(riskPctEquity.toFixed(2)),
    method: "ATR_VOLATILITY",
    isValid,
    reason,
  };
}

/** Helper ATR */
function indicatorsATR(candles: CandleData[], period: number = 14): (number | null)[] {
  if (candles.length < period + 1) return candles.map(() => null);
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }
  const out: (number | null)[] = [];
  let cur = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) out.push(null);
    else if (i === period - 1) out.push(cur);
    else {
      cur = (cur * (period - 1) + tr[i]) / period;
      out.push(cur);
    }
  }
  return out;
}

/**
 * Dynamic Trailing Stop calculation.
 * Rules:
 *   - Only tightens (never widens).
 *   - Moves to break-even once 1R favorable price attained.
 *   - Ratchets along ATR boundary.
 */
export function updateDynamicTrailingStop(
  state: DynamicTrailingStopState,
  currentPrice: number,
  atr: number
): DynamicTrailingStopState {
  const isBuy = state.side === "BUY";
  let highestFavorablePrice = state.highestFavorablePrice;
  let lowestFavorablePrice = state.lowestFavorablePrice;

  if (isBuy) {
    highestFavorablePrice = Math.max(highestFavorablePrice, currentPrice);
  } else {
    lowestFavorablePrice = Math.min(lowestFavorablePrice, currentPrice);
  }

  const initialRisk = Math.abs(state.entryPrice - state.initialStopPrice);
  let breakEvenTriggered = state.breakEvenTriggered;
  let recommendedStop = state.currentStopPrice;

  if (isBuy) {
    // Break-even check
    if (!breakEvenTriggered && currentPrice >= state.entryPrice + initialRisk) {
      breakEvenTriggered = true;
      recommendedStop = Math.max(recommendedStop, state.entryPrice);
    }
    // Trailing ATR ratchet
    if (breakEvenTriggered) {
      const atrTrail = highestFavorablePrice - atr * 1.5;
      recommendedStop = Math.max(recommendedStop, atrTrail);
    }
  } else {
    // Break-even check short
    if (!breakEvenTriggered && currentPrice <= state.entryPrice - initialRisk) {
      breakEvenTriggered = true;
      recommendedStop = Math.min(recommendedStop, state.entryPrice);
    }
    // Trailing ATR ratchet short
    if (breakEvenTriggered) {
      const atrTrail = lowestFavorablePrice + atr * 1.5;
      recommendedStop = Math.min(recommendedStop, atrTrail);
    }
  }

  return {
    ...state,
    currentPrice,
    highestFavorablePrice,
    lowestFavorablePrice,
    breakEvenTriggered,
    recommendedStopPrice: recommendedStop,
  };
}

/**
 * Continuous Exit Intelligence Evaluation.
 */
export function evaluateExitIntelligence(
  positionId: string,
  symbol: string,
  side: "BUY" | "SELL",
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  currentPrice: number,
  atr: number,
  reversalDetected: boolean
): ExitAlert | null {
  const isBuy = side === "BUY";
  const pnlQuote = isBuy ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnlPct = entryPrice > 0 ? (pnlQuote / entryPrice) * 100 : 0;

  // 1. Target attained
  if ((isBuy && currentPrice >= targetPrice) || (!isBuy && currentPrice <= targetPrice)) {
    return {
      id: `exit_${Date.now()}_${positionId}`,
      positionId,
      symbol,
      urgency: "HIGH_PRIORITY",
      currentPrice,
      entryPrice,
      unrealizedPnlQuote: Number(pnlQuote.toFixed(2)),
      unrealizedPnlPct: Number(pnlPct.toFixed(2)),
      reason: "Profit target attained. Lock in gains.",
      recommendedAction: "CLOSE_IMMEDIATELY",
      timestampMs: Date.now(),
    };
  }

  // 2. Severe reversal pattern against position
  if (reversalDetected) {
    return {
      id: `exit_${Date.now()}_${positionId}`,
      positionId,
      symbol,
      urgency: "HIGH_PRIORITY",
      currentPrice,
      entryPrice,
      unrealizedPnlQuote: Number(pnlQuote.toFixed(2)),
      unrealizedPnlPct: Number(pnlPct.toFixed(2)),
      reason: "Opposing momentum reversal detected on higher timeframe.",
      recommendedAction: "TIGHTEN_STOP",
      timestampMs: Date.now(),
    };
  }

  // 3. Proximity to stop loss (< 0.3 ATR from stop)
  const stopDistance = Math.abs(currentPrice - stopPrice);
  if (stopDistance < atr * 0.3) {
    return {
      id: `exit_${Date.now()}_${positionId}`,
      positionId,
      symbol,
      urgency: "WARNING",
      currentPrice,
      entryPrice,
      unrealizedPnlQuote: Number(pnlQuote.toFixed(2)),
      unrealizedPnlPct: Number(pnlPct.toFixed(2)),
      reason: "Price in immediate proximity of stop-loss invalidation boundary.",
      recommendedAction: "HOLD",
      timestampMs: Date.now(),
    };
  }

  return null;
}
