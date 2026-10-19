// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — BACKTESTING ENGINE
// src/lib/archie/trading/backtesting-engine.ts
//
// Causal historical strategy replay & realistic performance attribution:
//   * Strict look-ahead bias prevention (evaluation at bar close, fill at next open)
//   * Explicit spread, commission, and slippage cost modeling
//   * Comprehensive statistics: Net PnL, Win Rate, Profit Factor,
//     Max Drawdown, Sharpe Ratio, Expectancy
// =========================================================

import type {
  CandleData,
  MarketInstrument,
  Timeframe,
  BacktestResults,
  BacktestTradeLog,
} from "./types";
import { calculateAllIndicators } from "./indicators";
import { analyzeCandleSeries } from "./candle-analysis";
import { detectMarketRegime, generateProbabilisticForecast } from "./market-forecasting";
import { evaluateEntrySignal } from "./entry-exit-engine";

/**
 * Execute causal walk-forward backtest over candlestick series.
 */
export function runStrategyBacktest(
  strategyName: string,
  instrument: MarketInstrument,
  timeframe: Timeframe,
  candles: CandleData[],
  initialBalance: number = 10000,
  riskPctPerTrade: number = 1.5
): BacktestResults {
  const warmUpBars = 35;
  if (candles.length <= warmUpBars + 10) {
    return {
      strategyName,
      symbol: instrument.symbol,
      timeframe,
      totalCandlesTested: candles.length,
      initialBalanceQuote: initialBalance,
      finalBalanceQuote: initialBalance,
      netProfitQuote: 0,
      netProfitPct: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      expectancyQuote: 0,
      averageWinQuote: 0,
      averageLossQuote: 0,
      trades: [],
    };
  }

  const trades: BacktestTradeLog[] = [];
  let currentBalance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownQuote = 0;

  let activeTrade: {
    id: string;
    entryTime: number;
    side: "BUY" | "SELL";
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
    volumeLots: number;
  } | null = null;

  const commissionPerLot = 3.5; // Institutional $3.50 per lot
  const slippagePips = 0.4;
  const spreadQuote = instrument.spread;

  for (let i = warmUpBars; i < candles.length - 1; i++) {
    const historicalSlice = candles.slice(0, i + 1);
    const nextBar = candles[i + 1];

    // If an active trade exists, evaluate exit criteria at nextBar
    if (activeTrade) {
      let exitPrice: number | null = null;
      let exitReason: BacktestTradeLog["exitReason"] = "TIME_EXIT";

      const isBuy = activeTrade.side === "BUY";

      if (isBuy) {
        if (nextBar.low <= activeTrade.stopPrice) {
          exitPrice = activeTrade.stopPrice - slippagePips * instrument.pipSize;
          exitReason = "STOP_LOSS";
        } else if (nextBar.high >= activeTrade.targetPrice) {
          exitPrice = activeTrade.targetPrice;
          exitReason = "TAKE_PROFIT";
        }
      } else {
        if (nextBar.high >= activeTrade.stopPrice) {
          exitPrice = activeTrade.stopPrice + slippagePips * instrument.pipSize;
          exitReason = "STOP_LOSS";
        } else if (nextBar.low <= activeTrade.targetPrice) {
          exitPrice = activeTrade.targetPrice;
          exitReason = "TAKE_PROFIT";
        }
      }

      if (exitPrice !== null) {
        const grossPnl = isBuy
          ? (exitPrice - activeTrade.entryPrice) * activeTrade.volumeLots * instrument.contractSize
          : (activeTrade.entryPrice - exitPrice) * activeTrade.volumeLots * instrument.contractSize;

        const feeQuote = commissionPerLot * 2 * activeTrade.volumeLots;
        const slippageQuote = slippagePips * instrument.pipSize * activeTrade.volumeLots * instrument.contractSize;
        const netPnl = grossPnl - feeQuote - slippageQuote;

        currentBalance += netPnl;
        peakBalance = Math.max(peakBalance, currentBalance);
        const dd = peakBalance - currentBalance;
        maxDrawdownQuote = Math.max(maxDrawdownQuote, dd);

        trades.push({
          id: activeTrade.id,
          entryTime: activeTrade.entryTime,
          exitTime: nextBar.time,
          side: activeTrade.side,
          entryPrice: activeTrade.entryPrice,
          exitPrice,
          stopPrice: activeTrade.stopPrice,
          targetPrice: activeTrade.targetPrice,
          volumeLots: activeTrade.volumeLots,
          grossPnlQuote: Number(grossPnl.toFixed(2)),
          feeQuote: Number(feeQuote.toFixed(2)),
          slippageQuote: Number(slippageQuote.toFixed(2)),
          netPnlQuote: Number(netPnl.toFixed(2)),
          returnPct: Number(((netPnl / currentBalance) * 100).toFixed(2)),
          exitReason,
        });

        activeTrade = null;
      }
      continue;
    }

    // Evaluate signals causally at bar close
    const indicators = calculateAllIndicators(historicalSlice);
    const candleAnalysis = analyzeCandleSeries(historicalSlice, 20);
    const regime = detectMarketRegime(historicalSlice, indicators);
    const forecast = generateProbabilisticForecast(
      instrument.symbol,
      timeframe,
      historicalSlice,
      indicators,
      candleAnalysis,
      regime
    );

    const signal = evaluateEntrySignal(
      instrument,
      timeframe,
      historicalSlice,
      indicators,
      candleAnalysis,
      regime,
      forecast
    );

    // Open trade at nextBar.open if qualified
    if ((signal.decision === "BUY" || signal.decision === "SELL") && signal.side) {
      const isBuy = signal.side === "BUY";
      const fillPrice = isBuy
        ? nextBar.open + spreadQuote + slippagePips * instrument.pipSize
        : nextBar.open - slippagePips * instrument.pipSize;

      const stopDist = Math.abs(fillPrice - signal.suggestedStopLoss);
      const riskCapital = currentBalance * (riskPctPerTrade / 100);
      const lotSize = Math.max(
        0.01,
        Number((riskCapital / (stopDist * instrument.contractSize || 1)).toFixed(2))
      );

      activeTrade = {
        id: `bt_${i}_${Date.now()}`,
        entryTime: nextBar.time,
        side: signal.side,
        entryPrice: fillPrice,
        stopPrice: signal.suggestedStopLoss,
        targetPrice: signal.suggestedTakeProfit1,
        volumeLots: Math.min(lotSize, 5.0),
      };
    }
  }

  // Calculate aggregate metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.netPnlQuote > 0).length;
  const losingTrades = trades.filter((t) => t.netPnlQuote <= 0).length;
  const winRatePct = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const totalGrossGains = trades.filter((t) => t.netPnlQuote > 0).reduce((acc, t) => acc + t.netPnlQuote, 0);
  const totalGrossLosses = Math.abs(
    trades.filter((t) => t.netPnlQuote < 0).reduce((acc, t) => acc + t.netPnlQuote, 0)
  );

  const profitFactor = totalGrossLosses > 0 ? Number((totalGrossGains / totalGrossLosses).toFixed(2)) : totalGrossGains > 0 ? 99.0 : 0;
  const netProfitQuote = Number((currentBalance - initialBalance).toFixed(2));
  const netProfitPct = Number(((netProfitQuote / initialBalance) * 100).toFixed(2));
  const maxDrawdownPct = peakBalance > 0 ? Number(((maxDrawdownQuote / peakBalance) * 100).toFixed(2)) : 0;

  const returns = trades.map((t) => t.returnPct);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const returnVariance =
    returns.length > 1
      ? returns.reduce((acc, r) => acc + (r - avgReturn) ** 2, 0) / (returns.length - 1)
      : 1;
  const returnStdDev = Math.sqrt(returnVariance);
  const sharpeRatio = returnStdDev > 0 ? Number(((avgReturn / returnStdDev) * Math.sqrt(252)).toFixed(2)) : 0;

  const averageWinQuote = winningTrades > 0 ? Number((totalGrossGains / winningTrades).toFixed(2)) : 0;
  const averageLossQuote = losingTrades > 0 ? Number((totalGrossLosses / losingTrades).toFixed(2)) : 0;
  const expectancyQuote = totalTrades > 0 ? Number((netProfitQuote / totalTrades).toFixed(2)) : 0;

  return {
    strategyName,
    symbol: instrument.symbol,
    timeframe,
    totalCandlesTested: candles.length,
    initialBalanceQuote: initialBalance,
    finalBalanceQuote: Number(currentBalance.toFixed(2)),
    netProfitQuote,
    netProfitPct,
    totalTrades,
    winningTrades,
    losingTrades,
    winRatePct,
    profitFactor,
    maxDrawdownPct,
    sharpeRatio,
    expectancyQuote,
    averageWinQuote,
    averageLossQuote,
    trades,
  };
}
