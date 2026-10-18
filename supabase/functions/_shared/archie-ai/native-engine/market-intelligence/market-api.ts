// ============================================================================
// ARCHIE MARKET INTELLIGENCE — UNIFIED API & ENGINE ORCHESTRATION
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/market-api.ts
//
// Component S / Section 22:
// High-level public entry-point for ARCHIE cognitive systems, UI, and workflows.
// Connects connectors, normalization, indicators, structure, multi-timeframe,
// evidence fusion, risk controls, prediction tracking, and structured audit.
// ============================================================================

import type {
  MarketCandle,
  MarketCategory,
  CandleInterval,
  MarketAnalysisOutput,
  PredictionRecord,
} from "./types.ts";
import { ConnectorManager } from "./market-connectors.ts";
import { fuseMarketAnalysis } from "./reasoning-fusion.ts";
import { globalAdminConfig } from "./admin-config.ts";
import { globalMarketAudit } from "./observability-audit.ts";
import { PredictionTracker } from "./prediction-tracker.ts";
import {
  resampleCandles,
  analyzeSingleTimeframe,
  evaluateMultiTimeframeAlignment,
} from "./multi-timeframe.ts";

export interface AnalyzeMarketRequest {
  symbol: string;
  category: MarketCategory;
  interval: CandleInterval;
  candles?: MarketCandle[];
  callerId?: string;
  recordPrediction?: boolean;
}

export interface AnalyzeMarketResponse {
  success: boolean;
  analysis: MarketAnalysisOutput;
  recordedPredictionId?: string;
  error?: string;
}

export class MarketIntelligenceService {
  private connectorManager = new ConnectorManager();
  private predictionTracker = new PredictionTracker();

  public getPredictionTracker(): PredictionTracker {
    return this.predictionTracker;
  }

  public getConnectorManager(): ConnectorManager {
    return this.connectorManager;
  }

  /**
   * Unified analysis pipeline executing complete deterministic and ML evaluation.
   */
  public async analyze(request: AnalyzeMarketRequest): Promise<AnalyzeMarketResponse> {
    const startTime = Date.now();
    const caller = request.callerId ?? "ARCHIE_SYSTEM";

    // 1. Admin config verification
    const config = globalAdminConfig.getConfig();
    if (!config.enabledCategories.includes(request.category)) {
      return {
        success: false,
        analysis: createEmptyAnalysisOutput(request.symbol, request.category, request.interval, "Category disabled"),
        error: `Category ${request.category} is not enabled in admin configuration.`,
      };
    }

    // 2. Market data acquisition
    let rawCandles = request.candles ?? [];
    let providerId = "SUPPLIED_IN_REQUEST";

    if (rawCandles.length === 0) {
      const ingestion = await this.connectorManager.fetchMarketData({
        symbol: request.symbol,
        category: request.category,
        interval: request.interval,
        limit: 120,
      });

      if (ingestion.error || ingestion.candles.length === 0) {
        return {
          success: false,
          analysis: createEmptyAnalysisOutput(
            request.symbol,
            request.category,
            request.interval,
            ingestion.error ?? "Failed to ingest candles",
          ),
          error: ingestion.error ?? "No candles returned by connector",
        };
      }

      rawCandles = ingestion.candles;
      providerId = ingestion.providerId;
    }

    // 3. Evidence Fusion & Section 22 Analysis
    const analysis = fuseMarketAnalysis({
      symbol: request.symbol,
      category: request.category,
      candles: rawCandles,
      interval: request.interval,
      dataProvider: providerId,
    });

    // 4. Multi-Timeframe Confluence Enhancement (if enough candles)
    if (rawCandles.length >= 60 && request.interval === "1m") {
      const htfCandles = resampleCandles(rawCandles, "15m");
      const itfCandles = resampleCandles(rawCandles, "5m");

      if (htfCandles.length >= 10 && itfCandles.length >= 10) {
        const htfRes = analyzeSingleTimeframe(htfCandles, "15m");
        const itfRes = analyzeSingleTimeframe(itfCandles, "5m");
        const ltfRes = analyzeSingleTimeframe(rawCandles, "1m");

        const mtf = evaluateMultiTimeframeAlignment(htfRes, itfRes, ltfRes);
        if (!mtf.isAligned && mtf.conflicts.length > 0) {
          analysis.neutralOrConflictingEvidence.push(...mtf.conflicts);
          if (analysis.finalClassification !== "INSUFFICIENT_EVIDENCE") {
            analysis.confidenceExplanation += ` [MTF Note: ${mtf.synthesis}]`;
          }
        }
      }
    }

    // 5. Prediction Recording
    let recordedPredictionId: string | undefined;
    if (request.recordPrediction && analysis.estimatedOutcomeProbabilities) {
      recordedPredictionId = `pred-${request.symbol}-${Date.now()}`;
      const predRecord: PredictionRecord = {
        id: recordedPredictionId,
        timestamp: Date.now(),
        symbol: request.symbol,
        category: request.category,
        timeframe: request.interval,
        latestEligibleCandleTimestamp: analysis.latestEligibleCandleTimestamp,
        featureSchemaVersion: analysis.modelAndRuleVersions.featureSchemaVersion,
        modelVersion: analysis.modelAndRuleVersions.modelArtifactVersion,
        ruleVersion: analysis.modelAndRuleVersions.ruleEngineVersion,
        probBullish: analysis.estimatedOutcomeProbabilities.probBullish,
        probBearish: analysis.estimatedOutcomeProbabilities.probBearish,
        probNeutral: analysis.estimatedOutcomeProbabilities.probNeutral,
        marketRegime: analysis.marketRegime,
        horizonCandles: 5,
        status: "UNRESOLVED",
      };

      this.predictionTracker.recordPrediction(predRecord);
    }

    // 6. Structured Audit Logging & Telemetry
    const latency = Date.now() - startTime;
    globalMarketAudit.recordTelemetry("market_analysis_pipeline", latency, rawCandles.length);
    globalMarketAudit.logEvent(
      "PREDICTION_RECORDED",
      caller,
      {
        symbol: request.symbol,
        category: request.category,
        interval: request.interval,
        classification: analysis.finalClassification,
        predictionId: recordedPredictionId,
      },
      "INFO",
    );

    return {
      success: true,
      analysis,
      recordedPredictionId,
    };
  }
}

export const globalMarketIntelligence = new MarketIntelligenceService();

function createEmptyAnalysisOutput(
  symbol: string,
  category: MarketCategory,
  interval: CandleInterval,
  reason: string,
): MarketAnalysisOutput {
  return {
    instrumentIdentifier: symbol,
    marketCategory: category,
    dataProvider: "UNAVAILABLE",
    dataFreshness: "DELAYED",
    latestEligibleCandleTimestamp: 0,
    timeframe: interval,
    candleInterpretation: {
      latestGeometry: {
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
        closePositionInRange: 0,
        relativeBodyToRecentAvg: 0,
        rangeRelativeToAtr: 0,
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
      regime: "RANGING",
      regimeConfidence: 0,
      volatilityExpansion: false,
      volatilityContraction: false,
      liquiditySweepDetected: false,
      evidence: [reason],
    },
    marketRegime: "RANGING",
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
    neutralOrConflictingEvidence: [reason],
    forecastHorizon: "5 candles",
    estimatedOutcomeProbabilities: null,
    calibrationStatus: "FALLBACK",
    confidenceExplanation: reason,
    invalidationConditions: [],
    relevantRiskConsiderations: ["No valid market data available for evaluation."],
    dataQualityWarnings: [reason],
    modelAndRuleVersions: {
      ruleEngineVersion: "v1.0.0",
      modelArtifactVersion: "v1.0.0",
      featureSchemaVersion: "v1.0.0",
    },
    finalClassification: "INSUFFICIENT_EVIDENCE",
    noTradeStatus: {
      isNoTrade: true,
      reason,
    },
  };
}
