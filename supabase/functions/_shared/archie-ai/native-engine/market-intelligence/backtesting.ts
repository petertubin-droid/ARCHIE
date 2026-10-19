// ============================================================================
// ARCHIE MARKET INTELLIGENCE — HISTORICAL BACKTESTING & VALIDATION ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/backtesting.ts
//
// Causally correct, event-driven backtesting engine.
// Models spread, slippage, and commissions.
// Resolves same-candle stop/target collisions conservatively (Stop-loss hit first).
// Computes Sharpe, Sortino, Max Drawdown, Profit Factor, and Expectancy.
// ============================================================================

import type {
  MarketCandle,
  BacktestPosition,
  BacktestMetrics,
} from "./types.ts";

export interface BacktestOptions {
  initialEquityQuote: number;
  fixedRiskPerTradeQuote: number;
  slippagePct: number; // e.g. 0.0005 (5 bps)
  commissionPerTradeQuote: number;
  spreadQuote: number; // e.g. 0.0001
  useMarketImpact?: boolean;
  averageDailyVolume?: number;
  dailyVolatilityPct?: number;
  annualSwapRatePct?: number;
}

export const DEFAULT_BACKTEST_OPTIONS: BacktestOptions = {
  initialEquityQuote: 10_000,
  fixedRiskPerTradeQuote: 100, // 1% of 10k
  slippagePct: 0.0005,
  commissionPerTradeQuote: 1.0,
  spreadQuote: 0.0001,
  useMarketImpact: false,
  averageDailyVolume: 1_000_000,
  dailyVolatilityPct: 0.02,
  annualSwapRatePct: 0.02,
};

/**
 * Calculates square-root law market impact (Almgren-Chriss model).
 */
export function calculateSquareRootMarketImpact(
  quantityUnits: number,
  averageDailyVolume: number,
  dailyVolatilityPct = 0.02,
  gamma = 0.5,
): number {
  if (averageDailyVolume <= 0 || quantityUnits <= 0) return 0;
  const participation = quantityUnits / averageDailyVolume;
  return gamma * dailyVolatilityPct * Math.sqrt(Math.min(participation, 1.0));
}

/**
 * Calculates overnight swap or funding fee.
 */
export function calculateOvernightSwapFee(
  quoteInvested: number,
  holdingDays: number,
  annualSwapRatePct = 0.02,
): number {
  if (quoteInvested <= 0 || holdingDays <= 0) return 0;
  return quoteInvested * (annualSwapRatePct / 365) * holdingDays;
}

export type SignalGenerator = (
  candlesSlice: MarketCandle[],
  index: number,
) => {
  action: "BUY" | "SELL" | "HOLD";
  stopLossPrice?: number;
  takeProfitPrice?: number;
};

/**
 * Runs a deterministic, causal backtest over a historical candle series.
 */
export function runBacktest(
  candles: MarketCandle[],
  signalFn: SignalGenerator,
  options = DEFAULT_BACKTEST_OPTIONS,
): {
  positions: BacktestPosition[];
  equityCurve: number[];
  metrics: BacktestMetrics;
} {
  const positions: BacktestPosition[] = [];
  const equityCurve: number[] = [options.initialEquityQuote];
  let currentEquity = options.initialEquityQuote;

  let activePosition: BacktestPosition | null = null;
  let activeEntryIndex = 0;
  const holdingCandlesList: number[] = [];
  let totalCostAccumulated = 0;

  for (let i = 30; i < candles.length; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];

    // 1. Process active position against current candle
    if (activePosition) {
      let isClosed = false;
      let exitPrice = 0;
      let exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "HORIZON_EXPIRY" = "HORIZON_EXPIRY";

      const isLong = activePosition.direction === "LONG";

      const stopHit = isLong
        ? candle.low <= activePosition.stopLossPrice
        : candle.high >= activePosition.stopLossPrice;

      const targetHit = isLong
        ? candle.high >= activePosition.takeProfitPrice
        : candle.low <= activePosition.takeProfitPrice;

      // CONSERVATIVE COLLISION RESOLUTION:
      // If both stop and target fall inside the same candle, assume STOP was hit first!
      if (stopHit && targetHit) {
        isClosed = true;
        exitPrice = activePosition.stopLossPrice;
        exitReason = "STOP_LOSS";
      } else if (stopHit) {
        isClosed = true;
        exitPrice = activePosition.stopLossPrice;
        exitReason = "STOP_LOSS";
      } else if (targetHit) {
        isClosed = true;
        exitPrice = activePosition.takeProfitPrice;
        exitReason = "TAKE_PROFIT";
      }

      if (isClosed) {
        // Apply slippage to exit
        const slipFactor = isLong
          ? 1 - options.slippagePct
          : 1 + options.slippagePct;
        const finalExitPrice = exitPrice * slipFactor;

        const grossPnl = isLong
          ? (finalExitPrice - activePosition.entryPrice) * activePosition.quantityUnits
          : (activePosition.entryPrice - finalExitPrice) * activePosition.quantityUnits;

        const holdingCount = Math.max(1, i - activeEntryIndex);
        holdingCandlesList.push(holdingCount);

        const holdingDays = (candle.closeTimeMs - activePosition.entryTimestamp) / 86_400_000;
        const swapCost = calculateOvernightSwapFee(
          activePosition.quoteInvested,
          holdingDays,
          options.annualSwapRatePct ?? 0.02,
        );

        const netPnl = grossPnl - activePosition.commissionCost - swapCost;

        activePosition.exitTimestamp = candle.closeTimeMs;
        activePosition.exitPrice = finalExitPrice;
        activePosition.grossPnl = grossPnl;
        activePosition.netPnl = netPnl;
        activePosition.returnPct = (netPnl / activePosition.quoteInvested) * 100;
        activePosition.exitReason = exitReason;

        totalCostAccumulated += activePosition.commissionCost + activePosition.slippageCost + swapCost;

        currentEquity += netPnl;
        positions.push(activePosition);
        activePosition = null;
      }
    }

    // 2. Generate new entry signal if flat
    if (!activePosition && i < candles.length - 1) {
      const signal = signalFn(candles.slice(0, i + 1), i);

      if (signal.action === "BUY" || signal.action === "SELL") {
        const isLong = signal.action === "BUY";
        const entryBasePrice = candle.close;
        const slipFactor = isLong
          ? 1 + options.slippagePct
          : 1 - options.slippagePct;
        const entryPrice = (entryBasePrice + (isLong ? options.spreadQuote : -options.spreadQuote)) * slipFactor;

        const stopLoss =
          signal.stopLossPrice ??
          (isLong ? entryPrice * 0.98 : entryPrice * 1.02);
        const takeProfit =
          signal.takeProfitPrice ??
          (isLong ? entryPrice * 1.04 : entryPrice * 0.96);

        const stopDistance = Math.abs(entryPrice - stopLoss);
        const quantityUnits =
          stopDistance > 0 ? options.fixedRiskPerTradeQuote / stopDistance : 1;
        const quoteInvested = quantityUnits * entryPrice;

        const dynamicImpact = options.useMarketImpact
          ? calculateSquareRootMarketImpact(
              quantityUnits,
              options.averageDailyVolume ?? 1_000_000,
              options.dailyVolatilityPct ?? 0.02,
            )
          : 0;

        const effectiveSlippagePct = options.slippagePct + dynamicImpact;

        activeEntryIndex = i;
        activePosition = {
          id: `trade-${positions.length + 1}`,
          entryTimestamp: candle.closeTimeMs,
          symbol: "TEST_ASSET",
          direction: isLong ? "LONG" : "SHORT",
          entryPrice,
          stopLossPrice: stopLoss,
          takeProfitPrice: takeProfit,
          quantityUnits,
          quoteInvested,
          grossPnl: 0,
          slippageCost: entryBasePrice * effectiveSlippagePct * quantityUnits * 2,
          commissionCost: options.commissionPerTradeQuote * 2,
          netPnl: 0,
          returnPct: 0,
        };
      }
    }

    equityCurve.push(currentEquity);
  }

  // Close any position still open at end of data (HORIZON_EXPIRY)
  if (activePosition && candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    const isLong = activePosition.direction === "LONG";
    const slipFactor = isLong ? 1 - options.slippagePct : 1 + options.slippagePct;
    const finalExitPrice = lastCandle.close * slipFactor;
    const grossPnl = isLong
      ? (finalExitPrice - activePosition.entryPrice) * activePosition.quantityUnits
      : (activePosition.entryPrice - finalExitPrice) * activePosition.quantityUnits;
    const holdingCount = Math.max(1, candles.length - 1 - activeEntryIndex);
    holdingCandlesList.push(holdingCount);
    const holdingDays = Math.max(0.01, (lastCandle.closeTimeMs - activePosition.entryTimestamp) / 86_400_000);
    const swapCost = calculateOvernightSwapFee(
      activePosition.quoteInvested,
      holdingDays,
      options.annualSwapRatePct ?? 0.02,
    );
    const netPnl = grossPnl - activePosition.commissionCost - swapCost;
    activePosition.exitTimestamp = lastCandle.closeTimeMs;
    activePosition.exitPrice = finalExitPrice;
    activePosition.grossPnl = grossPnl;
    activePosition.netPnl = netPnl;
    activePosition.returnPct = (netPnl / activePosition.quoteInvested) * 100;
    activePosition.exitReason = "HORIZON_EXPIRY";

    totalCostAccumulated += activePosition.commissionCost + activePosition.slippageCost + swapCost;
    currentEquity += netPnl;
    positions.push(activePosition);
    activePosition = null;
  }

  // 3. Compute Metrics
  const totalTrades = positions.length;
  const winningTrades = positions.filter((p) => p.netPnl > 0).length;
  const losingTrades = positions.filter((p) => p.netPnl <= 0).length;
  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const grossProfit = positions
    .filter((p) => p.netPnl > 0)
    .reduce((s, p) => s + p.netPnl, 0);
  const grossLoss = Math.abs(
    positions.filter((p) => p.netPnl < 0).reduce((s, p) => s + p.netPnl, 0),
  );
  const netProfit = currentEquity - options.initialEquityQuote;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const expectancyPerTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

  // Max Drawdown
  let peak = options.initialEquityQuote;
  let maxDd = 0;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Returns for Sharpe / Sortino
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    returns.push(prev > 0 ? (equityCurve[i] - prev) / prev : 0);
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdReturn = Math.sqrt(
    returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / (returns.length || 1),
  );
  const downsideStd = Math.sqrt(
    returns.filter((r) => r < 0).reduce((a, b) => a + b ** 2, 0) / (returns.length || 1),
  );

  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
  const sortinoRatio = downsideStd > 0 ? (avgReturn / downsideStd) * Math.sqrt(252) : 0;

  return {
    positions,
    equityCurve,
    metrics: {
      totalTrades,
      winningTrades,
      losingTrades,
      winRatePct,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      expectancyPerTrade,
      maxDrawdownPct: maxDd,
      sharpeRatio,
      sortinoRatio,
      avgHoldingCandles: holdingCandlesList.length > 0
        ? Math.round((holdingCandlesList.reduce((a, b) => a + b, 0) / holdingCandlesList.length) * 10) / 10
        : 0,
      totalCostPaid: Math.round(totalCostAccumulated * 100) / 100,
    },
  };
}
