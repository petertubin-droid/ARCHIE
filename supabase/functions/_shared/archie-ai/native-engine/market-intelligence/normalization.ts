// ============================================================================
// ARCHIE MARKET INTELLIGENCE — DATA NORMALIZATION & INTEGRITY ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/normalization.ts
//
// Strict validation and normalization of market candle series.
// Rejects corrupted, non-finite, out-of-order, or impossible OHLC values.
// Never fabricates data; flags gaps and forces abstention when quality fails.
// ============================================================================

import type { MarketCandle, DataQualityReport, CandleInterval } from "./types.ts";

export const INTERVAL_DURATIONS_MS: Record<CandleInterval, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Validates a single candle for arithmetic and logical integrity.
 */
export function validateSingleCandle(candle: MarketCandle): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!Number.isFinite(candle.open) || candle.open <= 0) {
    reasons.push(`Non-finite or non-positive open price: ${candle.open}`);
  }
  if (!Number.isFinite(candle.high) || candle.high <= 0) {
    reasons.push(`Non-finite or non-positive high price: ${candle.high}`);
  }
  if (!Number.isFinite(candle.low) || candle.low <= 0) {
    reasons.push(`Non-finite or non-positive low price: ${candle.low}`);
  }
  if (!Number.isFinite(candle.close) || candle.close <= 0) {
    reasons.push(`Non-finite or non-positive close price: ${candle.close}`);
  }

  if (reasons.length === 0) {
    if (candle.high < candle.low) {
      reasons.push(`High (${candle.high}) is strictly less than Low (${candle.low})`);
    }
    if (candle.high < candle.open || candle.high < candle.close) {
      reasons.push(`High (${candle.high}) is less than Open (${candle.open}) or Close (${candle.close})`);
    }
    if (candle.low > candle.open || candle.low > candle.close) {
      reasons.push(`Low (${candle.low}) is greater than Open (${candle.open}) or Close (${candle.close})`);
    }
  }

  if (!Number.isFinite(candle.openTimeMs) || candle.openTimeMs <= 0) {
    reasons.push(`Invalid openTimeMs: ${candle.openTimeMs}`);
  }
  if (!Number.isFinite(candle.closeTimeMs) || candle.closeTimeMs < candle.openTimeMs) {
    reasons.push(`closeTimeMs (${candle.closeTimeMs}) is before openTimeMs (${candle.openTimeMs})`);
  }

  if (candle.volume !== undefined && (!Number.isFinite(candle.volume) || candle.volume < 0)) {
    reasons.push(`Invalid volume: ${candle.volume}`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Validates, sorts, deduplicates, and inspects an entire candle series for gaps.
 */
export function normalizeAndValidateSeries(
  rawCandles: MarketCandle[],
  interval: CandleInterval,
  allowFormingLastCandle = true,
): {
  normalizedCandles: MarketCandle[];
  report: DataQualityReport;
} {
  const report: DataQualityReport = {
    isValid: true,
    totalCandles: rawCandles.length,
    validCandles: 0,
    duplicateCount: 0,
    missingIntervalGaps: 0,
    anomalousCandles: 0,
    abstainFromAnalysis: false,
    reasons: [],
  };

  if (!rawCandles || rawCandles.length === 0) {
    report.isValid = false;
    report.abstainFromAnalysis = true;
    report.reasons.push("Empty candle series provided.");
    return { normalizedCandles: [], report };
  }

  // 1. Filter and check individual candle validity
  const validCandidates: MarketCandle[] = [];
  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];
    const check = validateSingleCandle(c);
    if (!check.valid) {
      report.anomalousCandles++;
      report.reasons.push(`Candle at index ${i} invalid: ${check.reasons.join("; ")}`);
    } else {
      validCandidates.push(c);
    }
  }

  if (validCandidates.length === 0) {
    report.isValid = false;
    report.abstainFromAnalysis = true;
    report.reasons.push("Zero valid candles remained after structural filtering.");
    return { normalizedCandles: [], report };
  }

  // 2. Sort strictly by openTimeMs ascending
  validCandidates.sort((a, b) => a.openTimeMs - b.openTimeMs);

  // 3. Deduplicate exact timestamps (keep latest finalized if duplicate)
  const deduped: MarketCandle[] = [];
  const seenTimestamps = new Set<number>();

  for (const c of validCandidates) {
    if (seenTimestamps.has(c.openTimeMs)) {
      report.duplicateCount++;
      // Replace only if current candidate is finalized and previous was forming
      const prevIdx = deduped.findIndex((d) => d.openTimeMs === c.openTimeMs);
      if (prevIdx !== -1 && !deduped[prevIdx].isFinalized && c.isFinalized) {
        deduped[prevIdx] = c;
      }
    } else {
      seenTimestamps.add(c.openTimeMs);
      deduped.push(c);
    }
  }

  // 4. Temporal continuity and gap analysis
  const expectedStep = INTERVAL_DURATIONS_MS[interval];
  for (let i = 1; i < deduped.length; i++) {
    const delta = deduped[i].openTimeMs - deduped[i - 1].openTimeMs;
    if (delta <= 0) {
      report.anomalousCandles++;
      report.reasons.push(`Non-monotonic timestamp detected between index ${i - 1} and ${i}`);
    } else if (expectedStep && delta > expectedStep * 1.5) {
      // Missing expected candle interval
      report.missingIntervalGaps++;
    }
  }

  // 5. Forming candle check on the final candle
  if (!allowFormingLastCandle && deduped.length > 0 && !deduped[deduped.length - 1].isFinalized) {
    report.reasons.push("Last candle is unfinalized/forming while finalized candles are strictly required.");
    report.abstainFromAnalysis = true;
  }

  // Minimum candle count requirement: at least 30 candles for statistical validity
  if (deduped.length < 30) {
    report.abstainFromAnalysis = true;
    report.reasons.push(`Insufficient sample size: ${deduped.length} candles (minimum required: 30)`);
  }

  // High anomaly ratio check
  if (report.totalCandles > 0 && report.anomalousCandles / report.totalCandles > 0.05) {
    report.abstainFromAnalysis = true;
    report.reasons.push(`High anomaly rate: ${report.anomalousCandles} corrupt candles out of ${report.totalCandles}`);
  }

  report.validCandles = deduped.length;
  report.isValid = report.anomalousCandles === 0 && report.duplicateCount === 0;

  return {
    normalizedCandles: deduped,
    report,
  };
}
