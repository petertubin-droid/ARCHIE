/**
 * FRELUX MARKET INTELLIGENCE, Price Validator & Confidence Engine
 *
 * Validates collected price observations and assigns confidence scores.
 * Detects anomalies and prevents bad data from reaching calculators.
 *
 * Validation considers:
 *   - Product-match confidence
 *   - Source reliability tier
 *   - Price recency (freshness)
 *   - Number of independent sources
 *   - Package-size match
 *   - Currency match
 *   - Market match
 *   - Abnormal price deviation (anomaly detection)
 *
 * This module does NOT call any external API, it's pure logic.
 */

import type {
  MiPriceObservation,
  MiSource,
  MatchConfidence,
  Freshness,
  AnomalyType,
} from '@/types/market-intelligence';

// ============================================================
// FRESHNESS CALCULATION
// ============================================================

// Configurable thresholds (in days)
export const FRESH_THRESHOLD_DAYS = 7;
export const RECENT_THRESHOLD_DAYS = 30;
export const STALE_THRESHOLD_DAYS = 90;

export function calculateFreshness(collectedAt: string | Date): Freshness {
  const date = typeof collectedAt === 'string' ? new Date(collectedAt) : collectedAt;
  const daysOld = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);

  if (daysOld <= FRESH_THRESHOLD_DAYS) return 'fresh';
  if (daysOld <= RECENT_THRESHOLD_DAYS) return 'recent';
  if (daysOld <= STALE_THRESHOLD_DAYS) return 'stale';
  return 'expired';
}

// ============================================================
// CONFIDENCE CALCULATION
// ============================================================

/**
 * Calculate the overall confidence for a price observation.
 * Combines match confidence + source reliability + freshness.
 */
export function calculateObservationConfidence(
  observation: Pick<MiPriceObservation, 'match_confidence' | 'collected_at' | 'package_size' | 'currency_code' | 'market_code'>,
  source: Pick<MiSource, 'reliability_tier' | 'is_verified' | 'country_code'>,
  expectedCurrency: string,
  expectedMarketCode: string,
): { confidence: MatchConfidence; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Match confidence contributes up to 40 points
  const matchScore = { high: 40, medium: 25, low: 10, review_required: 0 };
  score += matchScore[observation.match_confidence];
  if (observation.match_confidence !== 'high') {
    reasons.push(`Product match: ${observation.match_confidence}`);
  }

  // Source reliability contributes up to 30 points
  const tierScore = { 1: 30, 2: 20, 3: 10, 4: 5 };
  score += tierScore[source.reliability_tier as 1 | 2 | 3 | 4] ?? 5;
  if (source.reliability_tier >= 4) {
    reasons.push('Low-reliability source');
  }

  // Freshness contributes up to 15 points
  const freshness = calculateFreshness(observation.collected_at);
  const freshnessScore = { fresh: 15, recent: 10, stale: 3, expired: 0 };
  score += freshnessScore[freshness];
  if (freshness === 'stale' || freshness === 'expired') {
    reasons.push(`Price is ${freshness}`);
  }

  // Verified source bonus (+10)
  if (source.is_verified) {
    score += 10;
  }

  // Currency match (+5)
  if (observation.currency_code === expectedCurrency) {
    score += 5;
  } else {
    reasons.push(`Currency mismatch: expected ${expectedCurrency}, got ${observation.currency_code}`);
  }

  // Market match (+5)
  if (source.country_code === expectedMarketCode) {
    score += 5;
  } else {
    reasons.push(`Market mismatch: expected ${expectedMarketCode}, got ${source.country_code}`);
  }

  // Package size present (+5)
  if (observation.package_size && observation.package_size > 0) {
    score += 5;
  } else {
    reasons.push('Missing package size');
  }

  score = Math.min(score, 100);

  let confidence: MatchConfidence;
  if (score >= 80) confidence = 'high';
  else if (score >= 50) confidence = 'medium';
  else if (score >= 25) confidence = 'low';
  else confidence = 'review_required';

  return { confidence, score, reasons };
}

// ============================================================
// ANOMALY DETECTION
// ============================================================

/**
 * Detect price anomalies among a set of observations for the same product.
 * Uses median-based deviation detection (robust against outliers).
 *
 * Example:
 *   Source A → 9,800
 *   Source B → 10,000
 *   Source C → 9,700
 *   Source D → 4,000  ← FLAGGED (deviates from median)
 */
export function detectAnomalies(
  observations: Array<Pick<MiPriceObservation, 'id' | 'price'>>,
): { observationId: string; anomalyType: AnomalyType; deviationPercent: number; expectedMedian: number }[] {
  if (observations.length < 2) return [];

  const prices = observations.map((o) => o.price).sort((a, b) => a - b);
  const median = calculateMedian(prices);
  const _min = prices[0];
  const _max = prices[prices.length - 1];

  // If only 2 sources, flag if they differ by >50%
  const deviationThreshold = observations.length <= 2 ? 0.50 : 0.35;

  const anomalies: { observationId: string; anomalyType: AnomalyType; deviationPercent: number; expectedMedian: number }[] = [];

  for (const obs of observations) {
    if (median === 0) continue;

    const deviation = Math.abs(obs.price - median) / median;

    if (deviation > deviationThreshold) {
      anomalies.push({
        observationId: obs.id,
        anomalyType: 'price_deviation',
        deviationPercent: Math.round(deviation * 100),
        expectedMedian: median,
      });
    }
  }

  return anomalies;
}

// ============================================================
// MARKET PRICE ESTIMATION
// ============================================================

/**
 * Calculate a market price estimate from multiple approved observations.
 * Uses median (not mean) to be robust against outliers.
 */
export function calculateMarketEstimate(
  observations: Array<Pick<MiPriceObservation, 'price'>>,
): {
  median: number;
  average: number;
  min: number;
  max: number;
  count: number;
  confidence: MatchConfidence;
} {
  if (observations.length === 0) {
    return { median: 0, average: 0, min: 0, max: 0, count: 0, confidence: 'review_required' };
  }

  const prices = observations.map((o) => o.price).sort((a, b) => a - b);
  const median = calculateMedian(prices);
  const sum = prices.reduce((a, b) => a + b, 0);
  const average = Math.round((sum / prices.length) * 100) / 100;
  const min = prices[0];
  const max = prices[prices.length - 1];

  // Confidence based on source count and consistency
  let confidence: MatchConfidence;
  if (observations.length >= 3) {
    const spread = max > 0 ? (max - min) / max : 1;
    if (spread < 0.15) confidence = 'high';
    else if (spread < 0.30) confidence = 'medium';
    else confidence = 'low';
  } else if (observations.length === 2) {
    const spread = max > 0 ? (max - min) / max : 1;
    confidence = spread < 0.15 ? 'medium' : 'low';
  } else {
    confidence = 'low';
  }

  return {
    median: Math.round(median * 100) / 100,
    average,
    min,
    max,
    count: observations.length,
    confidence,
  };
}

// ============================================================
// VALIDATION DECISION
// ============================================================

/**
 * Decide the validation status for an observation.
 * High-confidence observations from good sources can be auto-approved.
 * Low-confidence or anomalous observations go to review.
 */
export function decideValidationStatus(
  confidence: MatchConfidence,
  hasAnomaly: boolean,
  autoApproveEnabled: boolean,
): 'approved' | 'review_required' | 'anomaly' {
  if (hasAnomaly) return 'anomaly';
  if (autoApproveEnabled && confidence === 'high') return 'approved';
  return 'review_required';
}

// ============================================================
// HELPERS
// ============================================================

function calculateMedian(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}
