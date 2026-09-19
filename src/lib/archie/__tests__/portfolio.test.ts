// =========================================================
// ARCHIE PORTFOLIO ANALYTICS TESTS
// src/lib/archie/__tests__/portfolio.test.ts
//
// Trading engine deepening (#29). Deterministic metrics from
// the REAL Position ledger type — every statistic derived
// with fees included, and the insufficient-data honesty
// boundary tested at its refusal point:
//
//   * no closed trades → determinable:false, nulls, never
//     invented numbers
//   * win rate / profit factor / expectancy arithmetic
//     verified against hand-computed fixtures
//   * equity curve + max drawdown verified step by step
//   * HHI concentration classified at its boundaries
//   * the per-trade Sharpe-style ratio is never presented
//     as annualized
// =========================================================
import { describe, expect, it } from "vitest";
import {
  closedTrades,
  equityCurve,
  exposureReport,
  netPnlQuote,
  sharpeStyleRatio,
  tradeStats,
} from "@studio-shared/archie-ai/native-engine/crypto/portfolio.ts";
import type { Position } from "@studio-shared/archie-ai/native-engine/crypto/order-lifecycle.ts";

function position(over: Partial<Position>): Position {
  return {
    id: "p" + Math.random().toString(36).slice(2, 8),
    symbol: "BTC-USDT",
    direction: "long",
    entryPrice: 100,
    stopPrice: 90,
    targetPrice: 120,
    positionSizeQuote: 1000,
    portfolioValueQuote: 10_000,
    openedAtMs: 1_000,
    state: "OPEN",
    status: "OPEN",
    exitPrice: null,
    closedAtMs: null,
    realizedPnlQuote: null,
    realizedPnlPct: null,
    feesPaidQuote: 0,
    ...over,
  };
}

function closed(p: Partial<Position>): Position {
  return position({
    state: "CLOSED",
    status: "CLOSED_TARGET",
    exitPrice: p.exitPrice ?? 110,
    closedAtMs: p.closedAtMs ?? 2_000,
    realizedPnlQuote: p.realizedPnlQuote ?? 100,
    realizedPnlPct: p.realizedPnlPct ?? 10,
    ...p,
  });
}

describe("insufficient-data honesty", () => {
  it("returns determinable:false with nulls — never invented statistics", () => {
    const stats = tradeStats([position({}), position({})]);
    expect(stats.determinable).toBe(false);
    expect(stats.closedTrades).toBe(0);
    expect(stats.winRatePct).toBeNull();
    expect(stats.profitFactor).toBeNull();
    expect(stats.expectancyQuote).toBeNull();
    expect(stats.sharpeLabel).toContain("no closed trades");
  });

  it("counts only genuinely closed positions with complete exits", () => {
    const partial = position({ state: "CLOSED", exitPrice: null });
    expect(closedTrades([partial, closed({})])).toHaveLength(1);
  });
});

describe("trade statistics (fees included)", () => {
  it("computes win rate, profit factor, payoff and expectancy", () => {
    // 3 wins (+100, +200, +50 net) and 2 losses (−80, −120 net)
    const trades = [
      closed({ realizedPnlQuote: 100, feesPaidQuote: 0, closedAtMs: 1 }),
      closed({ realizedPnlQuote: 200, feesPaidQuote: 0, closedAtMs: 2 }),
      closed({ realizedPnlQuote: 50, feesPaidQuote: 0, closedAtMs: 3 }),
      closed({ realizedPnlQuote: -80, feesPaidQuote: 0, closedAtMs: 4 }),
      closed({ realizedPnlQuote: -120, feesPaidQuote: 0, closedAtMs: 5 }),
    ];
    const s = tradeStats(trades);
    expect(s.determinable).toBe(true);
    expect(s.closedTrades).toBe(5);
    expect(s.winRatePct).toBeCloseTo(60, 10);
    expect(s.profitFactor).toBeCloseTo(350 / 200, 10);
    expect(s.payoffRatio).toBeCloseTo(350 / 3 / (200 / 2), 10);
    expect(s.expectancyQuote).toBeCloseTo(30, 10);
    expect(s.totalPnlQuote).toBeCloseTo(150, 10);
  });

  it("subtracts fees from every net figure", () => {
    const trades = [closed({ realizedPnlQuote: 100, feesPaidQuote: 30 })];
    expect(netPnlQuote(trades[0])).toBe(70);
    const s = tradeStats(trades);
    expect(s.totalPnlQuote).toBeCloseTo(70, 10);
    expect(s.totalFeesQuote).toBeCloseTo(30, 10);
  });

  it("profit factor is null when there are no losers — never Infinity", () => {
    const s = tradeStats([closed({ realizedPnlQuote: 50 })]);
    expect(s.profitFactor).toBeNull();
    expect(s.payoffRatio).toBeNull();
  });

  it("the Sharpe-style ratio is labeled honestly and needs ≥2 trades", () => {
    expect(sharpeStyleRatio([closed({})])).toBeNull();
    const r = sharpeStyleRatio([
      closed({ realizedPnlQuote: 100 }),
      closed({ realizedPnlQuote: -50 }),
    ]);
    expect(r).not.toBeNull();
    const s = tradeStats([
      closed({ realizedPnlQuote: 100 }),
      closed({ realizedPnlQuote: -50 }),
    ]);
    expect(s.sharpeLabel).toContain("NOT annualized");
  });
});

describe("equity curve & max drawdown", () => {
  it("walks realized equity chronologically and reports the worst peak-to-trough decline", () => {
    const curve = equityCurve(
      [
        closed({ realizedPnlQuote: 100, closedAtMs: 1 }),
        closed({ realizedPnlQuote: -200, closedAtMs: 2 }),
        closed({ realizedPnlQuote: 50, closedAtMs: 3 }),
      ],
      1000,
    );
    expect(curve.points.map((p) => p.equity)).toEqual([1100, 900, 950]);
    // peak 1100, trough 900 → 18.18%
    expect(curve.maxDrawdownPct).toBeCloseTo(((1100 - 900) / 1100) * 100, 10);
  });

  it("returns null drawdown when no trades closed", () => {
    expect(equityCurve([position({})]).maxDrawdownPct).toBeNull();
  });
});

describe("open-exposure concentration", () => {
  it("computes HHI by symbol and classifies concentration", () => {
    const open = [
      position({ symbol: "BTC-USDT", positionSizeQuote: 900 }),
      position({ symbol: "ETH-USDT", positionSizeQuote: 100 }),
    ];
    const r = exposureReport(open);
    expect(r.determinable).toBe(true);
    expect(r.bySymbol[0]).toEqual({
      symbol: "BTC-USDT",
      notionalQuote: 900,
      sharePct: 90,
    });
    expect(r.hhi).toBeCloseTo(90 * 90 + 10 * 10, 10);
    expect(r.classification).toContain("highly concentrated");
  });

  it("single asset is called exactly that", () => {
    const r = exposureReport([
      position({ symbol: "BTC-USDT", positionSizeQuote: 500 }),
    ]);
    expect(r.classification).toContain("single-asset");
  });

  it("no open positions → determinable:false, never a fake HHI", () => {
    const r = exposureReport([closed({})]);
    expect(r.determinable).toBe(false);
    expect(r.hhi).toBeNull();
    expect(r.classification).toContain("not applicable");
  });
});
