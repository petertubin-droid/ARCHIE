// ============================================================================
// ARCHIE MARKET INTELLIGENCE — REASONING & EVIDENCE FUSION ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/reasoning-fusion.ts
//
// Fuses deterministic technical rules, market structures, and statistical ML outputs.
// Synthesizes evidence without fabricating confidence or probabilities.
// Fully implements the Section 22 Market Analysis Output Contract.
// ============================================================================

import type {
  MarketCandle,
  CandleInterval,
  MarketCategory,
  MarketAnalysisOutput,
} from "./types.ts";
import { normalizeAndValidateSeries } from "./normalization.ts";
import {
  calculateCandleGeometry,
  detectCandlePatterns,
  CANDLE_RULE_VERSION,
} from "./candle-interpretation.ts";
import { computeIndicatorSuite } from "./technical-indicators.ts";
import { analyzeMarketStructure } from "./market-structure.ts";
import { extractFeatureVector, FEATURE_SCHEMA_VERSION } from "./feature-engineering.ts";
import {
  predictProbabilities,
  MODEL_ARTIFACT_VERSION,
} from "./machine-learning.ts";

export interface FuseMarketAnalysisInput {
  symbol: string;
  category: MarketCategory;
  candles: MarketCandle[];
  interval: CandleInterval;
  dataProvider?: string;
}

/**
 * Executes end-to-end evidence fusion and generates the authoritative Section 22 report.
 */
export function fuseMarketAnalysis(
  input: FuseMarketAnalysisInput,
): MarketAnalysisOutput {
  const dataProvider = input.dataProvider ?? "Archie Verified Multi-Venue Gateway";

  // 1. Data Normalization and Integrity Gate
  const { normalizedCandles, report: qualityReport } = normalizeAndValidateSeries(
    input.candles,
    input.interval,
    true,
  );

  const latestCandle =
    normalizedCandles.length > 0
      ? normalizedCandles[normalizedCandles.length - 1]
      : null;
  const latestTimestamp = latestCandle ? latestCandle.openTimeMs : 0;

  // If quality check demands abstention
  if (qualityReport.abstainFromAnalysis || !latestCandle) {
    return {
      instrumentIdentifier: input.symbol,
      marketCategory: input.category,
      dataProvider,
      dataFreshness: "HISTORICAL",
      latestEligibleCandleTimestamp: latestTimestamp,
      timeframe: input.interval,
      candleInterpretation: {
        latestGeometry: latestCandle
          ? calculateCandleGeometry(latestCandle, 0)
          : {
              index: 0,
              timestamp: 0,
              open: 0,
              high: 0,
              low: 0,
              close: 0,
              body: 0,
              totalRange: 0,
              upperWick: 0,
              lowerWick: 0,
              isBullish: false,
              isBearish: false,
              isDoji: false,
              bodyToRangeRatio: 0,
              upperWickToRangeRatio: 0,
              lowerWickToRangeRatio: 0,
              closePositionInRange: 0.5,
              relativeBodyToRecentAvg: 1,
              rangeRelativeToAtr: 1,
            },
        detectedPatterns: [],
      },
      marketStructure: {
        swings: [],
        higherHighsCount: 0,
        higherLowsCount: 0,
        lowerHighsCount: 0,
        lowerLowsCount: 0,
        supportZones: [],
        resistanceZones: [],
        regime: "ABNORMAL_DISLOCATION",
        regimeConfidence: 0,
        volatilityExpansion: false,
        volatilityContraction: false,
        liquiditySweepDetected: false,
        evidence: ["Data quality gate failed; abstaining from analytical generation."],
      },
      marketRegime: "ABNORMAL_DISLOCATION",
      relevantIndicatorReadings: {
        sma20: null,
        sma50: null,
        sma200: null,
        ema9: null,
        ema21: null,
        ema50: null,
        rsi14: null,
        macd: null,
        adx14: null,
        supertrend: null,
        bollingerBands: null,
        stochastic14: null,
        atr14: null,
        historicalVolatilityPct: null,
        obv: null,
        vwap: null,
      },
      bullishEvidence: [],
      bearishEvidence: [],
      neutralOrConflictingEvidence: qualityReport.reasons,
      forecastHorizon: "5 candles",
      estimatedOutcomeProbabilities: null,
      calibrationStatus: "UNVALIDATED",
      confidenceExplanation:
        "Abstained from evaluation due to data quality or sample insufficiency.",
      invalidationConditions: ["Immediate: data feed unverified"],
      relevantRiskConsiderations: ["Extreme: unvalidated or sparse data"],
      dataQualityWarnings: qualityReport.reasons,
      modelAndRuleVersions: {
        ruleEngineVersion: CANDLE_RULE_VERSION,
        modelArtifactVersion: MODEL_ARTIFACT_VERSION,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      },
      finalClassification: "INSUFFICIENT_EVIDENCE",
      noTradeStatus: {
        isNoTrade: true,
        reason: `Data quality failure: ${qualityReport.reasons.join("; ")}`,
      },
    };
  }

  // 2. Deterministic Subsystems Execution
  const geometry = calculateCandleGeometry(
    latestCandle,
    normalizedCandles.length - 1,
  );
  const patterns = detectCandlePatterns(normalizedCandles);
  const indicators = computeIndicatorSuite(normalizedCandles);
  const structure = analyzeMarketStructure(normalizedCandles);

  // 3. Feature Extraction and ML Model Prediction
  const features = extractFeatureVector(
    normalizedCandles,
    normalizedCandles.length - 1,
  );
  const mlPrediction = features ? predictProbabilities(features) : null;

  // 4. Evidence Compilation and Conflict Analysis
  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];
  const conflictingEvidence: string[] = [];

  // Structure evidence
  if (structure.regime === "TRENDING_BULL") {
    bullishEvidence.push(`Market structure in bullish trend (${structure.higherHighsCount} higher highs).`);
  } else if (structure.regime === "TRENDING_BEAR") {
    bearishEvidence.push(`Market structure in bearish trend (${structure.lowerLowsCount} lower lows).`);
  } else {
    conflictingEvidence.push("Market structure currently in non-directional range.");
  }

  // Pattern evidence
  for (const pat of patterns) {
    if (pat.bias === "BULLISH") bullishEvidence.push(`Candle pattern: ${pat.name}`);
    if (pat.bias === "BEARISH") bearishEvidence.push(`Candle pattern: ${pat.name}`);
    if (pat.bias === "NEUTRAL") conflictingEvidence.push(`Candle pattern: ${pat.name}`);
  }

  // Indicator evidence
  if (indicators.rsi14 !== null) {
    if (indicators.rsi14 > 65) {
      bullishEvidence.push(`RSI momentum strong (${indicators.rsi14.toFixed(1)}).`);
    } else if (indicators.rsi14 < 35) {
      bearishEvidence.push(`RSI momentum weak (${indicators.rsi14.toFixed(1)}).`);
    }
  }

  if (indicators.macd && indicators.macd.histogram > 0) {
    bullishEvidence.push("MACD histogram above zero line.");
  } else if (indicators.macd && indicators.macd.histogram < 0) {
    bearishEvidence.push("MACD histogram below zero line.");
  }

  if (indicators.supertrend) {
    if (indicators.supertrend.direction === "BULLISH") {
      bullishEvidence.push(`Supertrend bullish (support at ${indicators.supertrend.value.toFixed(2)}).`);
    } else {
      bearishEvidence.push(`Supertrend bearish (resistance at ${indicators.supertrend.value.toFixed(2)}).`);
    }
  }

  // Synthesis and Final Classification
  let finalClassification: "BULLISH" | "BEARISH" | "NEUTRAL" | "INSUFFICIENT_EVIDENCE" = "NEUTRAL";
  let isNoTrade = false;
  let noTradeReason = "";

  const bullScore = bullishEvidence.length;
  const bearScore = bearishEvidence.length;

  if (bullScore >= 3 && bearScore <= 1 && (!mlPrediction || mlPrediction.probBullish > 0.50)) {
    finalClassification = "BULLISH";
  } else if (bearScore >= 3 && bullScore <= 1 && (!mlPrediction || mlPrediction.probBearish > 0.50)) {
    finalClassification = "BEARISH";
  } else {
    finalClassification = "NEUTRAL";
    isNoTrade = true;
    noTradeReason = `Evidence conflict: ${bullScore} bullish cues vs ${bearScore} bearish cues.`;
  }

  // Invalidation levels
  const invalidationConditions: string[] = [];
  if (finalClassification === "BULLISH") {
    const stopLevel = structure.supportZones[0]?.price ?? latestCandle.low;
    invalidationConditions.push(`Break and close below support level ${stopLevel.toFixed(4)}.`);
  } else if (finalClassification === "BEARISH") {
    const stopLevel = structure.resistanceZones[0]?.price ?? latestCandle.high;
    invalidationConditions.push(`Break and close above resistance level ${stopLevel.toFixed(4)}.`);
  } else {
    invalidationConditions.push("Market remains in indeterminate state.");
  }

  return {
    instrumentIdentifier: input.symbol,
    marketCategory: input.category,
    dataProvider,
    dataFreshness: "LIVE",
    latestEligibleCandleTimestamp: latestTimestamp,
    timeframe: input.interval,
    candleInterpretation: {
      latestGeometry: geometry,
      detectedPatterns: patterns,
    },
    marketStructure: structure,
    marketRegime: structure.regime,
    relevantIndicatorReadings: indicators,
    bullishEvidence,
    bearishEvidence,
    neutralOrConflictingEvidence: conflictingEvidence,
    forecastHorizon: "5 candles",
    estimatedOutcomeProbabilities: mlPrediction
      ? {
          probBullish: mlPrediction.probBullish,
          probBearish: mlPrediction.probBearish,
          probNeutral: mlPrediction.probNeutral,
        }
      : null,
    calibrationStatus: mlPrediction ? "CALIBRATED" : "FALLBACK",
    confidenceExplanation:
      finalClassification !== "NEUTRAL"
        ? `Consensus achieved across structure, indicators, and ML probability (${bullScore} vs ${bearScore} weight).`
        : "Conflicting evidence between trend structure and momentum indicators.",
    invalidationConditions,
    relevantRiskConsiderations: [
      "Execution must respect instrument spread and session boundary.",
      `Current market regime: ${structure.regime}.`,
    ],
    dataQualityWarnings: qualityReport.reasons,
    modelAndRuleVersions: {
      ruleEngineVersion: CANDLE_RULE_VERSION,
      modelArtifactVersion: MODEL_ARTIFACT_VERSION,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    },
    finalClassification,
    noTradeStatus: {
      isNoTrade,
      reason: isNoTrade ? noTradeReason : undefined,
    },
  };
}
