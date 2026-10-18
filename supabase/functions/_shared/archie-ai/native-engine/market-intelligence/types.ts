// ============================================================================
// ARCHIE ADVANCED MARKET INTELLIGENCE AND CANDLE READING ENGINE — TYPES
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/types.ts
//
// Core type contracts for multi-market deterministic technical analysis,
// candle interpretation, indicators, causal ML, backtesting, and risk governance.
// ============================================================================

export type MarketCategory = "FOREX" | "CRYPTO" | "STOCKS" | "INDICES";

export type CandleInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w";

export type DataFreshnessClass =
  | "LIVE"
  | "DELAYED"
  | "HISTORICAL"
  | "REPLAYED"
  | "MANUALLY_SUPPLIED";

export interface MarketCandle {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradesCount?: number;
  isFinalized: boolean;
}

export interface InstrumentSpec {
  symbol: string;
  canonicalName: string;
  category: MarketCategory;
  baseAsset: string;
  quoteAsset: string;
  tickSize: number;
  contractOrLotSize: number; // e.g. 100,000 for standard forex lot, 1 for spot crypto/stocks
  minVolume: number;
  maxLeverage: number;
  pipSize?: number; // Forex pip size (e.g. 0.0001 or 0.01 for JPY)
  tradingSessions?: Array<{
    name: string;
    openUtcHour: number;
    closeUtcHour: number;
  }>;
  settlementType: "SPOT" | "DERIVATIVE" | "CASH_INDEX" | "EQUITY";
  underlyingOrProxy?: string;
}

export interface DataQualityReport {
  isValid: boolean;
  totalCandles: number;
  validCandles: number;
  duplicateCount: number;
  missingIntervalGaps: number;
  anomalousCandles: number;
  abstainFromAnalysis: boolean;
  reasons: string[];
}

// ----------------------------------------------------------------------------
// Candle Geometry & Pattern Recognition
// ----------------------------------------------------------------------------

export interface CandleGeometry {
  index: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  body: number;
  totalRange: number;
  upperWick: number;
  lowerWick: number;
  isBullish: boolean;
  isBearish: boolean;
  isDoji: boolean;
  bodyToRangeRatio: number;
  upperWickToRangeRatio: number;
  lowerWickToRangeRatio: number;
  closePositionInRange: number; // 0 = at low, 1 = at high
  relativeBodyToRecentAvg: number;
  rangeRelativeToAtr: number;
}

export type CandlestickPatternName =
  | "DOJI"
  | "HAMMER"
  | "INVERTED_HAMMER"
  | "SHOOTING_STAR"
  | "HANGING_MAN"
  | "BULLISH_ENGULFING"
  | "BEARISH_ENGULFING"
  | "BULLISH_HARAMI"
  | "BEARISH_HARAMI"
  | "INSIDE_BAR"
  | "OUTSIDE_BAR"
  | "PIN_BAR_BULLISH"
  | "PIN_BAR_BEARISH"
  | "MARUBOZU_BULLISH"
  | "MARUBOZU_BEARISH"
  | "MORNING_STAR"
  | "EVENING_STAR"
  | "THREE_WHITE_SOLDIERS"
  | "THREE_BLACK_CROWS"
  | "BREAKOUT_BULLISH"
  | "BREAKDOWN_BEARISH"
  | "FAILED_BREAKOUT";

export interface PatternDetection {
  name: CandlestickPatternName;
  startIndex: number;
  endIndex: number;
  timestamp: number;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  ruleVersion: string;
  evidence: string[];
  invalidationLevel: number;
}

// ----------------------------------------------------------------------------
// Market Structure & Regimes
// ----------------------------------------------------------------------------

export interface SwingPoint {
  index: number;
  type: "SWING_HIGH" | "SWING_LOW";
  price: number;
  candleTimestamp: number;
  confirmedAtTimestamp: number; // Causal: Knowable only after right-hand bars confirm
}

export type MarketRegimeType =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "ABNORMAL_DISLOCATION";

export interface MarketStructureAssessment {
  swings: SwingPoint[];
  higherHighsCount: number;
  higherLowsCount: number;
  lowerHighsCount: number;
  lowerLowsCount: number;
  supportZones: Array<{ price: number; touches: number }>;
  resistanceZones: Array<{ price: number; touches: number }>;
  regime: MarketRegimeType;
  regimeConfidence: number;
  volatilityExpansion: boolean;
  volatilityContraction: boolean;
  liquiditySweepDetected: boolean;
  evidence: string[];
}

// ----------------------------------------------------------------------------
// Technical Indicators
// ----------------------------------------------------------------------------

export interface IndicatorSuite {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  } | null;
  adx14: {
    adx: number;
    plusDI: number;
    minusDI: number;
  } | null;
  supertrend: {
    value: number;
    direction: "BULLISH" | "BEARISH";
  } | null;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
  } | null;
  stochastic14: {
    k: number;
    d: number;
  } | null;
  atr14: number | null;
  historicalVolatilityPct: number | null;
  obv: number | null;
  vwap: number | null;
}

export interface BlueLineHypothesis {
  hypothesisId: string;
  sourceContext: string;
  candidateType: "EMA_SMOOTHED" | "SUPER_TREND_HYBRID" | "ADX_TREND_FILTER";
  parameters: Record<string, number>;
  calculatedValues: number[];
  divergenceNotes: string[];
  reconstructionConfidence: number;
}

// ----------------------------------------------------------------------------
// Feature Engineering & Machine Learning
// ----------------------------------------------------------------------------

export interface FeatureVector {
  timestamp: number;
  schemaVersion: string;
  candleIndex: number;
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  closePosition: number;
  rangeToAtr: number;
  returnLag1: number;
  returnLag3: number;
  returnLag5: number;
  rsiNormalized: number; // (RSI - 50) / 50
  macdHistToAtr: number;
  distFromEma21Atr: number;
  distFromSma50Atr: number;
  bbPercentB: number;
  adxNormalized: number; // ADX / 100
  regimeEncoding: number; // 1 = Bull, -1 = Bear, 0 = Range
}

export interface ModelPrediction {
  timestamp: number;
  modelVersion: string;
  featureSchemaVersion: string;
  horizonCandles: number;
  probBullish: number;
  probBearish: number;
  probNeutral: number;
  expectedReturnMean: number;
  expectedReturnStd: number;
  isCalibrated: boolean;
  brierScoreEstimate?: number;
  invalidationPrice: number;
}

// ----------------------------------------------------------------------------
// Backtesting & Simulation
// ----------------------------------------------------------------------------

export interface BacktestPosition {
  id: string;
  entryTimestamp: number;
  exitTimestamp?: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice?: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  quantityUnits: number;
  quoteInvested: number;
  grossPnl: number;
  slippageCost: number;
  commissionCost: number;
  netPnl: number;
  returnPct: number;
  exitReason?: "STOP_LOSS" | "TAKE_PROFIT" | "HORIZON_EXPIRY" | "EMERGENCY_STOP";
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  expectancyPerTrade: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldingCandles: number;
  totalCostPaid: number;
}

// ----------------------------------------------------------------------------
// Section 22: Market Analysis Output Contract
// ----------------------------------------------------------------------------

export interface MarketAnalysisOutput {
  instrumentIdentifier: string;
  marketCategory: MarketCategory;
  dataProvider: string;
  dataFreshness: DataFreshnessClass;
  latestEligibleCandleTimestamp: number;
  timeframe: CandleInterval;
  candleInterpretation: {
    latestGeometry: CandleGeometry;
    detectedPatterns: PatternDetection[];
  };
  marketStructure: MarketStructureAssessment;
  marketRegime: MarketRegimeType;
  relevantIndicatorReadings: IndicatorSuite;
  bullishEvidence: string[];
  bearishEvidence: string[];
  neutralOrConflictingEvidence: string[];
  forecastHorizon: string;
  estimatedOutcomeProbabilities: {
    probBullish: number;
    probBearish: number;
    probNeutral: number;
  } | null;
  calibrationStatus: "CALIBRATED" | "UNVALIDATED" | "FALLBACK";
  confidenceExplanation: string;
  invalidationConditions: string[];
  relevantRiskConsiderations: string[];
  dataQualityWarnings: string[];
  modelAndRuleVersions: {
    ruleEngineVersion: string;
    modelArtifactVersion: string;
    featureSchemaVersion: string;
  };
  finalClassification: "BULLISH" | "BEARISH" | "NEUTRAL" | "INSUFFICIENT_EVIDENCE";
  noTradeStatus: {
    isNoTrade: boolean;
    reason?: string;
  };
}

// ----------------------------------------------------------------------------
// Section 25: Independent Performance Gates
// ----------------------------------------------------------------------------

export type PerformanceGateId =
  | "GATE_A_DATA_INTEGRITY"
  | "GATE_B_CALCULATION_CORRECTNESS"
  | "GATE_C_CAUSAL_CORRECTNESS"
  | "GATE_D_REPRODUCIBILITY"
  | "GATE_E_STATISTICAL_VALIDITY"
  | "GATE_F_ECONOMIC_VALIDITY"
  | "GATE_G_GENERALIZATION"
  | "GATE_H_CALIBRATION"
  | "GATE_I_RISK_GOVERNANCE"
  | "GATE_J_SECURITY_AND_AUTHORITY"
  | "GATE_K_PERFORMANCE"
  | "GATE_L_PRODUCTION_AUTHORIZATION";

export interface PerformanceGateResult {
  gateId: PerformanceGateId;
  name: string;
  passed: boolean;
  scoreOrValue: number | string;
  thresholdOrRequirement: string;
  details: string;
}

// ----------------------------------------------------------------------------
// Market Data Connectors & Ingestion (Component A / Section 5)
// ----------------------------------------------------------------------------

export interface ConnectorHealth {
  providerId: string;
  isHealthy: boolean;
  lastSuccessfulPingMs: number;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  rateLimitRemaining: number;
  rateLimitResetMs: number;
}

export interface MarketDataRequest {
  symbol: string;
  category: MarketCategory;
  interval: CandleInterval;
  limit: number;
  sinceMs?: number;
}

export interface IngestionResult {
  providerId: string;
  rawCandlesCount: number;
  freshness: DataFreshnessClass;
  latencyMs: number;
  candles: MarketCandle[];
  error?: string;
}

// ----------------------------------------------------------------------------
// Multi-Timeframe Analysis (Section 10)
// ----------------------------------------------------------------------------

export interface TimeframeAnalysisResult {
  interval: CandleInterval;
  latestCandleTimestamp: number;
  regime: MarketRegimeType;
  trendDirection: "BULLISH" | "BEARISH" | "SIDEWAYS" | "UNCERTAIN";
  trendStrengthAdx: number;
  swingHigh?: number;
  swingLow?: number;
  primaryKeyZone?: { low: number; high: number };
  detectedPatterns: PatternDetection[];
}

export interface MultiTimeframeAssessment {
  higherTimeframe: TimeframeAnalysisResult;
  intermediateTimeframe: TimeframeAnalysisResult;
  lowerTimeframe: TimeframeAnalysisResult;
  isAligned: boolean;
  confluenceScore: number; // 0.0 to 1.0
  conflicts: string[];
  synthesis: string;
}

// ----------------------------------------------------------------------------
// Prediction Recording & Outcome Tracking (Component K / Section 14)
// ----------------------------------------------------------------------------

export interface PredictionRecord {
  id: string;
  timestamp: number;
  symbol: string;
  category: MarketCategory;
  timeframe: CandleInterval;
  latestEligibleCandleTimestamp: number;
  featureSchemaVersion: string;
  modelVersion: string;
  ruleVersion: string;
  probBullish: number;
  probBearish: number;
  probNeutral: number;
  targetPrice?: number;
  stopLossPrice?: number;
  invalidationPrice?: number;
  horizonCandles: number;
  marketRegime: MarketRegimeType;
  status: "UNRESOLVED" | "RESOLVED";
}

export interface PredictionOutcomeRecord {
  predictionId: string;
  resolvedTimestamp: number;
  resolutionStatus:
    | "HIT_TARGET"
    | "HIT_STOP_LOSS"
    | "HORIZON_EXPIRY"
    | "INVALIDATED"
    | "AMBIGUOUS_COLLISION";
  candlesHeld: number;
  entryPrice: number;
  exitPrice: number;
  realizedReturnPct: number;
  directionalCorrectness: boolean;
  brierScore: number;
  logLoss: number;
}

export interface OutcomeVerificationSummary {
  totalPredictions: number;
  unresolvedCount: number;
  resolvedCount: number;
  directionalAccuracyPct: number;
  meanBrierScore: number;
  meanLogLoss: number;
  targetHitRatePct: number;
  stopLossHitRatePct: number;
  calibrationBuckets: Array<{
    bucketMinProb: number;
    bucketMaxProb: number;
    predictedMeanProb: number;
    actualObservedFrequency: number;
    count: number;
  }>;
}

// ----------------------------------------------------------------------------
// Walk-Forward Validation (Component M / Section 16)
// ----------------------------------------------------------------------------

export interface WalkForwardFold {
  foldIndex: number;
  trainStartMs: number;
  trainEndMs: number;
  valStartMs: number;
  valEndMs: number;
  testStartMs: number;
  testEndMs: number;
  trainCandlesCount: number;
  testCandlesCount: number;
  metrics: BacktestMetrics;
  brierScore: number;
  isRobust: boolean;
}

export interface WalkForwardReport {
  foldsCount: number;
  folds: WalkForwardFold[];
  meanSharpeRatio: number;
  minSharpeRatio: number;
  meanWinRatePct: number;
  maxDrawdownPct: number;
  stabilityScore: number; // 0.0 to 1.0
  passedValidation: boolean;
}

// ----------------------------------------------------------------------------
// Model Registry & Version Management (Component P / Section 17 & 21)
// ----------------------------------------------------------------------------

export type ModelLifecycleStatus =
  | "CANDIDATE"
  | "APPROVED"
  | "PROMOTED"
  | "DEPRECATED"
  | "ROLLED_BACK";

export interface ModelArtifact {
  id: string;
  name: string;
  version: string;
  architecture: "LOGISTIC_BASELINE" | "RIDGE_REGRESSION" | "DECISION_STUMP_ENSEMBLE";
  weights: Record<string, number>;
  featureSchemaVersion: string;
  trainingWindow: { startMs: number; endMs: number; sampleCount: number };
  evaluationMetrics: {
    brierScore: number;
    aucRoc: number;
    logLoss: number;
    winRatePct: number;
    profitFactor: number;
  };
  status: ModelLifecycleStatus;
  createdAtMs: number;
  promotedAtMs?: number;
  promotedBy?: string;
  changeNotes?: string;
}

// ----------------------------------------------------------------------------
// Observability & Structured Audit (Component Q / Section 20 & 23)
// ----------------------------------------------------------------------------

export type AuditEventType =
  | "DATA_INGESTION"
  | "DATA_VALIDATION_FAILURE"
  | "PREDICTION_RECORDED"
  | "OUTCOME_VERIFIED"
  | "RISK_GATE_REJECTION"
  | "PERFORMANCE_GATE_EVALUATION"
  | "MODEL_PROMOTION"
  | "MODEL_ROLLBACK"
  | "ADMIN_CONFIG_CHANGE";

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  actor: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  payloadSanitized: Record<string, unknown>;
  checksumSha256?: string;
}

export interface TelemetryMetrics {
  stage: string;
  latencyMs: number;
  throughputCandlesPerSec?: number;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Admin Configuration & Guardrails (Component R / Section 21)
// ----------------------------------------------------------------------------

export interface AdminConfig {
  version: number;
  updatedAtMs: number;
  updatedBy: string;
  authorizedProviders: string[];
  enabledCategories: MarketCategory[];
  supportedSymbols: string[];
  maxRiskPerHypotheticalTradePct: number;
  minConfidenceToIssueDirectional: number;
  maxLeverageCeiling: number;
  liveOrderExecutionEnabled: false; // HARDCODED IMMUTABLE FALSE
  autoModelPromotionAllowed: false; // STRICT OWNER APPROVAL REQUIRED
}

export interface ConfigChangeRequest {
  requester: string;
  reason: string;
  updates: Partial<Omit<AdminConfig, "version" | "updatedAtMs" | "liveOrderExecutionEnabled">>;
}

// ----------------------------------------------------------------------------
// Blue Line Hypothesis & Reconstruction (Section 9)
// ----------------------------------------------------------------------------

export interface BlueLineCandidateEvaluation {
  candidateName: string;
  formula: string;
  parameters: Record<string, number>;
  meanAbsoluteError: number;
  pearsonCorrelation: number;
  rmse: number;
  isRepainting: boolean;
  sampleCandlesCount: number;
  returnStatsOnCrossover: {
    forwardReturn1dMean: number;
    forwardReturn1dWinRatePct: number;
    totalSignalsCount: number;
  };
}

export interface BlueLineReconstructionReport {
  investigationId: string;
  targetSeriesLength: number;
  bestCandidate: BlueLineCandidateEvaluation | null;
  allEvaluations: BlueLineCandidateEvaluation[];
  isDefinitivelyIdentified: boolean;
  uncertaintyNotes: string[];
}
