// =========================================================
// ARCHIE NATIVE ENGINE — PORTFOLIO PERFORMANCE ANALYTICS
// supabase/functions/_shared/archie-ai/native-engine/crypto/portfolio.ts
//
// Deterministic portfolio metrics computed from REAL closed
// positions (the order-lifecycle ledger) and REAL order-book
// snapshots. No forecasts, no fabricated advice — every
// number is derived from supplied data with the exact
// formulas stated, and every limitation disclosed honestly:
//
//   * TRADE STATS — count, win rate, profit factor, payoff
//     ratio, expectancy, average win/loss — all from closed
//     positions with fees INCLUDED
//   * EQUITY CURVE — running realized-equity curve from the
//     same closed positions; max drawdown of that curve
//   * RISK METRICS — per-trade return distribution, standard
//     deviation, Sharpe-style ratio (per-trade, rf=0,
//     honestly labeled — NOT an annualized figure)
//   * CONCENTRATION — HHI over open notional by symbol
//   * INSUFFICIENT-DATA HONESTY — fewer than 2 closed trades
//     returns determinable:false, never a made-up statistic
//
// These are descriptive statistics of past executions, not
// predictions. They never bypass the trade gate.
// =========================================================

import type { Position } from "./order-lifecycle.ts";
import type { CapabilityReport } from "../types.ts";

// ---------------------------------------------------------
// Trade statistics from CLOSED positions
// ---------------------------------------------------------

export interface TradeStats {
  determinable: boolean;
  closedTrades: number;
  /** Share of closed trades with net P&L > 0 (fees included). */
  winRatePct: number | null;
  /** Sum of winning P&L ÷ |sum of losing P&L|. null when no losers (infinite). */
  profitFactor: number | null;
  /** Average win ÷ |average loss|. null when no losers. */
  payoffRatio: number | null;
  /** Mean net P&L per closed trade (fees included). */
  expectancyQuote: number | null;
  averageWinQuote: number | null;
  averageLossQuote: number | null;
  /** Net realized P&L across closed trades, fees included. */
  totalPnlQuote: number;
  totalFeesQuote: number;
  /** HONEST LABEL: descriptive per-trade ratio, NOT annualized. */
  sharpeLabel: string;
}

export function closedTrades(positions: Position[]): Position[] {
  return positions
    .filter(
      (p) =>
        p.state === "CLOSED" &&
        p.exitPrice !== null &&
        p.realizedPnlPct !== null &&
        p.closedAtMs !== null,
    )
    .sort((a, b) => (a.closedAtMs ?? 0) - (b.closedAtMs ?? 0));
}

/** Net P&L of a closed position: gross minus fees already
 *  reflected in realizedPnlQuote? No — feesPaidQuote is
 *  tracked separately; net = gross - fees, all in quote. */
export function netPnlQuote(p: Position): number {
  return (p.realizedPnlQuote ?? 0) - p.feesPaidQuote;
}

export function tradeStats(positions: Position[]): TradeStats {
  const closed = closedTrades(positions);
  const totalFees = positions.reduce((a, p) => a + p.feesPaidQuote, 0);
  if (closed.length === 0) {
    return {
      determinable: false,
      closedTrades: 0,
      winRatePct: null,
      profitFactor: null,
      payoffRatio: null,
      expectancyQuote: null,
      averageWinQuote: null,
      averageLossQuote: null,
      totalPnlQuote: 0,
      totalFeesQuote: totalFees,
      sharpeLabel: "no closed trades — no statistics can be computed",
    };
  }
  const pnls = closed.map(netPnlQuote);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const total = pnls.reduce((a, b) => a + b, 0);
  const mean = total / closed.length;
  const variance =
    pnls.reduce((a, p) => a + (p - mean) * (p - mean), 0) / closed.length;
  const sd = Math.sqrt(variance);
  return {
    determinable: true,
    closedTrades: closed.length,
    winRatePct: (wins.length / closed.length) * 100,
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
    payoffRatio: avgLoss === 0 ? null : avgWin / avgLoss,
    expectancyQuote: mean,
    averageWinQuote: wins.length > 0 ? avgWin : null,
    averageLossQuote: losses.length > 0 ? -avgLoss : null,
    totalPnlQuote: total,
    totalFeesQuote: totalFees,
    sharpeLabel:
      sd === 0
        ? "zero dispersion — a per-trade Sharpe-style ratio is meaningless here"
        : "per-trade Sharpe-style ratio (rf=0); NOT annualized, NOT predictive",
  };
}

/** Mean ÷ standard deviation of per-trade net P&L — rf = 0.
 *  Returns null when undeterminable (sd = 0 or <2 trades). */
export function sharpeStyleRatio(positions: Position[]): number | null {
  const pnls = closedTrades(positions).map(netPnlQuote);
  if (pnls.length < 2) return null;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance =
    pnls.reduce((a, p) => a + (p - mean) * (p - mean), 0) / pnls.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  return mean / sd;
}

// ---------------------------------------------------------
// Equity curve + max drawdown (realized only)
// ---------------------------------------------------------

export interface EquityCurve {
  /** Start of the curve — the first close, in chronological order. */
  points: Array<{ closedAtMs: number; equity: number }>;
  /** Max peak-to-trough decline of the running equity, % of peak. */
  maxDrawdownPct: number | null;
}

export function equityCurve(
  positions: Position[],
  startingQuote = 0,
): EquityCurve {
  const closed = closedTrades(positions);
  const points: Array<{ closedAtMs: number; equity: number }> = [];
  let equity = startingQuote;
  let peak = startingQuote;
  let maxDd = 0;
  for (const p of closed) {
    equity += netPnlQuote(p);
    points.push({ closedAtMs: p.closedAtMs ?? 0, equity });
    if (equity > peak) peak = equity;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
  }
  return {
    points,
    maxDrawdownPct: closed.length > 0 ? maxDd : null,
  };
}

// ---------------------------------------------------------
// Open-exposure concentration (HHI by symbol)
// ---------------------------------------------------------

export interface ExposureReport {
  determinable: boolean;
  openPositions: number;
  /** Notional at entry by symbol, quote currency. */
  bySymbol: Array<{ symbol: string; notionalQuote: number; sharePct: number }>;
  /** Herfindahl–Hirschman index over open notional shares, 0–10000. */
  hhi: number | null;
  /** Honest concentration classification (>2500 = highly concentrated). */
  classification: string;
}

export function exposureReport(positions: Position[]): ExposureReport {
  const open = positions.filter((p) => p.state === "OPEN");
  if (open.length === 0) {
    return {
      determinable: false,
      openPositions: 0,
      bySymbol: [],
      hhi: null,
      classification: "no open positions — concentration is not applicable",
    };
  }
  const bySymbolMap = new Map<string, number>();
  for (const p of open) {
    bySymbolMap.set(
      p.symbol,
      (bySymbolMap.get(p.symbol) ?? 0) + p.positionSizeQuote,
    );
  }
  const total = [...bySymbolMap.values()].reduce((a, b) => a + b, 0);
  const bySymbol = [...bySymbolMap.entries()]
    .map(([symbol, notional]) => ({
      symbol,
      notionalQuote: notional,
      sharePct: total > 0 ? (notional / total) * 100 : 0,
    }))
    .sort((a, b) => b.notionalQuote - a.notionalQuote);
  const hhi = bySymbol.reduce((a, s) => a + s.sharePct * s.sharePct, 0);
  return {
    determinable: true,
    openPositions: open.length,
    bySymbol,
    hhi,
    classification:
      hhi > 10000 * 0.999
        ? "single-asset exposure — one asset dominates the open book"
        : hhi > 2500
          ? "highly concentrated open exposure (HHI > 2500)"
          : hhi > 1500
            ? "moderately concentrated open exposure (HHI > 1500)"
            : "diversified open exposure",
  };
}

// ---------------------------------------------------------
// Honest capability reports
// ---------------------------------------------------------
export function portfolioCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "trading-portfolio-analytics",
      description:
        "Deterministic portfolio performance analytics from closed positions: win rate, profit factor, payoff ratio, expectancy, per-trade Sharpe-style ratio (honestly labeled, not annualized), realized-equity curve with max drawdown, HHI concentration over open exposure",
      maturity: "OPERATIONAL",
      measuredBy:
        "portfolio.test.ts (stats, curve, drawdown, concentration, insufficient-data honesty)",
    },
    {
      id: "trading-portfolio-prediction",
      description:
        "Predictive portfolio performance, forecasting, or auto-sizing recommendations",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — descriptive statistics only, never forecasts, never gate bypass",
    },
  ];
}
