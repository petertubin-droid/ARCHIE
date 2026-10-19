// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — CORE TYPES
// src/lib/archie/trading/types.ts
//
// Strict type definitions for multi-market trading intelligence:
//   * Market instruments & candlestick structures
//   * Technical indicator results & warm-up contracts
//   * Deterministic candle analysis & multi-bar formations
//   * Market regimes & calibrated probabilistic forecasting
//   * Professional entry signals & dynamic stop-loss levels
//   * Open position monitoring & exit intelligence alerts
//   * Independent risk governance & automated execution gates
//   * Broker connection center & operational modes
//   * Strategy backtesting & continuous model governance
// =========================================================

export type MarketCategory = "ALL" | "CRYPTO" | "FOREX" | "COMMODITIES" | "INDICES" | "STOCKS";
export type Timeframe = "1s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";
export type ChartStyle = "candles" | "hollow" | "heikin_ashi" | "line" | "bars";
export type OrderType = "MARKET" | "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP";

export interface MarketInstrument {
  symbol: string;
  name: string;
  category: MarketCategory;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  digits: number;
  contractSize: number;
  pipSize: number;
  baseCurrency: string;
  quoteCurrency: string;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------
// Technical Indicators
// ---------------------------------------------------------

export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
  percentB: (number | null)[];
}

export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export interface SupertrendResult {
  values: (number | null)[];
  directions: (1 | -1 | null)[]; // 1 = Bullish (uptrend), -1 = Bearish (downtrend)
  trendChanges: boolean[];
}

export interface ADXResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

export interface StochasticResult {
  k: (number | null)[];
  d: (number | null)[];
}

export interface BlueMarketLineResult {
  values: (number | null)[];
  slope: (number | null)[];
  bullishConcordance: boolean[];
  turningPoints: { index: number; type: "BOTTOM" | "PEAK"; price: number }[];
  formulaDescription: string;
}

export interface TechnicalIndicatorSuite {
  sma20: (number | null)[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  ema9: (number | null)[];
  ema21: (number | null)[];
  bollingerBands: BollingerBandsResult;
  rsi14: (number | null)[];
  macd: MACDResult;
  atr14: (number | null)[];
  supertrend: SupertrendResult;
  adx14: ADXResult;
  stochastic: StochasticResult;
  vwap: (number | null)[];
  blueMarketLine: BlueMarketLineResult;
}

// ---------------------------------------------------------
// Candle Intelligence
// ---------------------------------------------------------

export type CandleDirection = "BULLISH" | "BEARISH" | "NEUTRAL_DOJI";

export type CandlePatternName =
  | "DOJI"
  | "DRAGONFLY_DOJI"
  | "GRAVESTONE_DOJI"
  | "HAMMER"
  | "INVERTED_HAMMER"
  | "SHOOTING_STAR"
  | "HANGING_MAN"
  | "BULLISH_ENGULFING"
  | "BEARISH_ENGULFING"
  | "INSIDE_BAR"
  | "OUTSIDE_BAR"
  | "PIN_BAR_BULLISH"
  | "PIN_BAR_BEARISH"
  | "MORNING_STAR"
  | "EVENING_STAR"
  | "THREE_WHITE_SOLDIERS"
  | "THREE_BLACK_CROWS";

export interface SingleCandleMetrics {
  index: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  bodySize: number;
  bodyPctOfRange: number;
  upperWickSize: number;
  lowerWickSize: number;
  closePositionInRange: number; // 0 = at low, 1 = at high
  direction: CandleDirection;
  rangeVsATR: number | null;
  isCompressed: boolean; // NR7 or narrow range < 0.6 ATR
  isExpanded: boolean; // Wide range > 1.8 ATR
  detectedPatterns: CandlePatternName[];
}

export interface CandleSeriesAnalysis {
  recentCandles: SingleCandleMetrics[];
  consecutiveBullish: number;
  consecutiveBearish: number;
  latestBreakout: {
    type: "BREAKOUT_HIGH" | "BREAKOUT_LOW" | "FAILED_BREAKOUT" | "NONE";
    level: number | null;
  };
  gapDetected: {
    type: "GAP_UP" | "GAP_DOWN" | "NONE";
    size: number;
  };
  dominantBias: "BULLISH" | "BEARISH" | "BALANCED";
}

// ---------------------------------------------------------
// Market Regime & Forecasting
// ---------------------------------------------------------

export type MarketRegimeType =
  | "TRENDING_BULLISH"
  | "TRENDING_BEARISH"
  | "RANGING_LOW_VOLATILITY"
  | "RANGING_HIGH_VOLATILITY"
  | "VOLATILITY_BREAKOUT";

export interface MarketRegimeState {
  regime: MarketRegimeType;
  confidenceScore: number; // 0 to 1
  adxStrength: number | null;
  volatilityCondition: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  trendAlignment: "ALIGNED_UP" | "ALIGNED_DOWN" | "CONFLICTED" | "NEUTRAL";
  description: string;
}

export interface ProbabilisticForecast {
  symbol: string;
  timeframe: Timeframe;
  horizon: string;
  generatedAtMs: number;
  bullishProbability: number; // 0 to 1 (calibrated)
  bearishProbability: number; // 0 to 1 (calibrated)
  neutralProbability: number; // 0 to 1 (calibrated)
  expectedReturnPct: number;
  expectedATRVolQuote: number;
  structuralInvalidationPrice: number;
  targetPriceFavorable: number;
  targetPriceAdverse: number;
  uncertaintyScore: number; // 0 = high conviction, 1 = maximum ambiguity
  modelConfidence: "HIGH" | "MODERATE" | "LOW" | "OUT_OF_DISTRIBUTION";
  bullishEvidence: string[];
  bearishEvidence: string[];
}

// ---------------------------------------------------------
// Entry Signals & Stop-Loss Management
// ---------------------------------------------------------

export type EntrySignalDecision =
  | "BUY"
  | "SELL"
  | "WAIT_FOR_CONFIRMATION"
  | "HOLD_EXISTING_POSITION"
  | "EXIT_REVIEW_REQUIRED"
  | "NO_TRADE"
  | "DATA_OR_MODEL_UNAVAILABLE";

export interface CandidateEntrySignal {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  decision: EntrySignalDecision;
  side: "BUY" | "SELL" | null;
  entryPrice: number;
  suggestedStopLoss: number;
  suggestedTakeProfit1: number;
  suggestedTakeProfit2: number;
  riskRewardRatio: number;
  invalidationPrice: number;
  createdAtMs: number;
  expiresAtMs: number;
  regimeConcordance: boolean;
  candleConfirmation: boolean;
  modelConfidencePct: number;
  rejectionReasons: string[];
  notes: string;
}

export interface StopLossPlan {
  side: "BUY" | "SELL";
  entryPrice: number;
  stopPrice: number;
  stopDistancePips: number;
  monetaryRiskQuote: number;
  riskPctEquity: number;
  method: "SWING_STRUCTURE" | "ATR_VOLATILITY" | "SUPPORT_RESISTANCE" | "MAX_MONETARY";
  isValid: boolean;
  reason: string;
}

export interface DynamicTrailingStopState {
  positionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  currentPrice: number;
  initialStopPrice: number;
  currentStopPrice: number;
  recommendedStopPrice: number;
  breakEvenTriggered: boolean;
  highestFavorablePrice: number;
  lowestFavorablePrice: number;
  trailingMode: "FIXED" | "BREAK_EVEN" | "ATR_TRAILING" | "SWING_TRAILING";
  brokerNativeSupported: boolean;
}

// ---------------------------------------------------------
// Exit Intelligence
// ---------------------------------------------------------

export type ExitAlertUrgency = "INFORMATIONAL" | "WARNING" | "HIGH_PRIORITY" | "MANDATORY_RISK_EXIT";

export interface ExitAlert {
  id: string;
  positionId: string;
  symbol: string;
  urgency: ExitAlertUrgency;
  currentPrice: number;
  entryPrice: number;
  unrealizedPnlQuote: number;
  unrealizedPnlPct: number;
  reason: string;
  recommendedAction: "HOLD" | "TIGHTEN_STOP" | "CLOSE_HALF" | "CLOSE_IMMEDIATELY";
  timestampMs: number;
}

// ---------------------------------------------------------
// Broker Connections & Operational Modes
// ---------------------------------------------------------

export type BrokerConnectorType =
  | "EXNESS_OPENAPI"
  | "IQ_OPTION_ANALYTICAL"
  | "METATRADER_4_5"
  | "BINANCE_HMAC"
  | "PAPER_SIMULATOR";

export type BrokerConnectionStatus = "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR" | "RESTRICTED";

export interface BrokerCardState {
  id: string;
  name: string;
  type: BrokerConnectorType;
  status: BrokerConnectionStatus;
  maskedAccountId: string;
  accountCurrency: string;
  balance: number;
  equity: number;
  marginAvailable: number;
  dataConnectivityStatus: "REALTIME_WS" | "POLLING_REST" | "OFFLINE" | "STALE";
  tradingPermissions: "READ_ONLY" | "PAPER" | "LIVE_AUTHORIZED" | "DISABLED";
  mode: "PAPER" | "READ_ONLY" | "LIVE";
  lastSyncIso: string;
  supportedProducts: string[];
  latencyMs: number;
  disclaimers: string[];
}

export type OperationalTradingMode =
  | "MODE_1_ANALYSIS_ONLY"
  | "MODE_2_PAPER_TRADING"
  | "MODE_3_ASSISTED_TRADING"
  | "MODE_4_AUTHORIZED_AUTOMATION";

export interface OwnerAutomationSettings {
  mode: OperationalTradingMode;
  emergencyKillSwitchEngaged: boolean;
  requireOwnerApprovalPerOrder: boolean;
  allowAutomatedTrailingStops: boolean;
  allowEmergencyPositionClosure: boolean;
  authorizedBrokers: string[];
  authorizedInstruments: string[];
  maxDailyLossEquityPct: number;
  maxMonetaryLossPerTrade: number;
}

// ---------------------------------------------------------
// Risk Governance
// ---------------------------------------------------------

export interface RiskEvaluationRequest {
  symbol: string;
  side: "BUY" | "SELL";
  orderType: OrderType;
  volumeLots: number;
  entryPrice: number;
  stopPrice: number;
  instrument: MarketInstrument;
  accountEquity: number;
  existingOpenPositionsCount: number;
  existingExposureQuote: number;
}

export interface RiskEvaluationResult {
  approved: boolean;
  riskPerTradeQuote: number;
  riskPctEquity: number;
  marginRequiredQuote: number;
  spreadPips: number;
  reasons: string[];
  checks: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
}

// ---------------------------------------------------------
// Strategy Backtesting & Paper Trading
// ---------------------------------------------------------

export interface BacktestTradeLog {
  id: string;
  entryTime: number;
  exitTime: number;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  targetPrice: number;
  volumeLots: number;
  grossPnlQuote: number;
  feeQuote: number;
  slippageQuote: number;
  netPnlQuote: number;
  returnPct: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "REGIME_EXIT" | "TIME_EXIT";
}

export interface BacktestResults {
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  totalCandlesTested: number;
  initialBalanceQuote: number;
  finalBalanceQuote: number;
  netProfitQuote: number;
  netProfitPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  expectancyQuote: number;
  averageWinQuote: number;
  averageLossQuote: number;
  trades: BacktestTradeLog[];
}

// ---------------------------------------------------------
// Continuous Learning, Model Governance & Trade Journal
// ---------------------------------------------------------

export interface PredictionAuditRecord {
  predictionId: string;
  symbol: string;
  timeframe: Timeframe;
  generatedAtIso: string;
  predictedDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
  predictedProbability: number;
  targetPrice: number;
  invalidationPrice: number;
  horizonBars: number;
  actualOutcome: "TARGET_HIT" | "STOPPED_OUT" | "EXPIRED_FLAT" | "PENDING";
  actualReturnPct: number | null;
  brierScore: number | null;
}

export interface ModelPerformanceMetrics {
  totalPredictions: number;
  resolvedPredictions: number;
  overallBrierScore: number; // 0 = perfect calibration, 0.25 = random coin toss
  directionalAccuracyPct: number;
  isDriftDetected: boolean;
  lastUpdatedIso: string;
}

export interface TradeJournalEntry {
  id: string;
  timestampIso: string;
  symbol: string;
  mode: "PAPER" | "LIVE" | "SIMULATION";
  broker: string;
  side: "BUY" | "SELL";
  orderType: OrderType;
  volumeLots: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  realizedPnlQuote: number | null;
  feesQuote: number;
  setupRationale: string;
  opposingEvidence: string;
  exitReason: string | null;
  postTradeReview: string;
}
