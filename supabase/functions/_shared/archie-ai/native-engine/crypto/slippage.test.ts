// =========================================================
// ARCHIE NATIVE ENGINE — EXECUTION COST & SLIPPAGE — TESTS
// supabase/functions/_shared/archie-ai/native-engine/crypto/slippage.test.ts
//
// Evidence for the capability claim "execution-cost-estimation":
// exact VWAP walks (buy and sell), slippage sign per side,
// depth-consumption accounting, honest refusal when the
// visible book cannot fill the order, degenerate inputs,
// and the estimate label that every result carries.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  ESTIMATE_LABEL,
  estimateMarketFill,
  slippageCapabilityReports,
} from "./slippage.ts";
import type { OrderBookSnapshot } from "./market-data.ts";

function book(asks: Array<[number, number]>, bids: Array<[number, number]>): OrderBookSnapshot {
  return {
    venue: "binance",
    symbol: "BTC/USDT",
    // [price, size] — asks ascending, bids descending
    asks,
    bids,
    fetchedAt: "2026-09-16T00:00:00.000Z",
  };
}

describe("slippage — deterministic book walks", () => {
  // Bids 100×5, asks 101×2, 102×3, 103×10 → mid = 100.5
  const B = book([[101, 2], [102, 3], [103, 10]], [[100, 5]]);

  it("walks a BUY across ask levels with exact VWAP and slippage", () => {
    // Buy 300 USDT: level 1 fully (202), 98 USDT at 102.
    const e = estimateMarketFill(B, "buy", 300);
    expect(e.determinable).toBe(true);
    expect(e.levelsConsumed).toBe(2);
    expect(e.filledQuote).toBe(300);
    // vwap = 300 / (2 + 98/102)
    expect(e.vwapFillPrice).toBeCloseTo(101.3245, 3);
    expect(e.midPrice).toBe(100.5);
    // buys pay above mid → positive bps
    expect(e.slippageBps).toBeGreaterThan(80);
    expect(e.slippageBps).toBeLessThan(90);
    // visible ask depth = 202 + 306 + 1030 = 1538 → 300/1538
    expect(e.depthConsumedPct).toBeCloseTo((300 / 1538) * 100, 3);
    expect(e.estimateLabel).toBe(ESTIMATE_LABEL);
  });

  it("walks a SELL across bid levels and flips the slippage sign", () => {
    const bb = book([[101, 2]], [[100, 1], [99, 2]]); // mid = 100.5
    // Sell 250 USDT: level 1 fully (100), 150 at 99.
    const e = estimateMarketFill(bb, "sell", 250);
    expect(e.determinable).toBe(true);
    expect(e.levelsConsumed).toBe(2);
    // vwap = 250 / (1 + 150/99) ≈ 99.3976
    expect(e.vwapFillPrice).toBeCloseTo(99.39759, 4);
    // sells receive below mid → reported positive (cost), ≈ 109.7 bps
    expect(e.slippageBps).toBeCloseTo(109.7, 1);
  });

  it("fills exactly one level when the order fits in the best level", () => {
    const e = estimateMarketFill(B, "buy", 101); // best ask: 101 × 2 = 202
    expect(e.determinable).toBe(true);
    expect(e.levelsConsumed).toBe(1);
    expect(e.vwapFillPrice).toBe(101);
    // (101 − 100.5)/100.5 × 10000 ≈ 49.75 bps
    expect(e.slippageBps).toBeCloseTo(49.75, 2);
  });

  it("consumes 100% of a single-level book exactly", () => {
    const one = book([[100, 4]], [[99, 4]]);
    const e = estimateMarketFill(one, "buy", 400);
    expect(e.determinable).toBe(true);
    expect(e.depthConsumedPct).toBeCloseTo(100, 6);
    expect(e.vwapFillPrice).toBe(100);
  });
});

describe("slippage — honest refusal paths", () => {
  const B = book([[101, 2], [102, 3]], [[100, 5]]);

  it("refuses to estimate past the last visible level — never extrapolates", () => {
    const e = estimateMarketFill(B, "buy", 10_000);
    expect(e.determinable).toBe(false);
    expect(e.vwapFillPrice).toBe(null);
    expect(e.slippageBps).toBe(null);
    expect(e.reason).toContain("insufficient");
    // still accounts what WAS consumable: 202 + 306 = 508
    expect(e.filledQuote).toBe(508);
    expect(e.depthConsumedPct).toBe(100);
    expect(e.estimateLabel).toBe(ESTIMATE_LABEL);
  });

  it("refuses zero/negative order sizes", () => {
    for (const size of [0, -5]) {
      const e = estimateMarketFill(B, "buy", size);
      expect(e.determinable).toBe(false);
      expect(e.reason).toContain("positive");
      expect(e.filledQuote).toBe(0);
    }
  });

  it("refuses an empty book side with an honest reason", () => {
    const e = estimateMarketFill(book([], [[100, 1]]), "buy", 50);
    expect(e.determinable).toBe(false);
    expect(e.reason).toContain("no visible liquidity");
  });

  it("still reports the mid when only the audited side is empty", () => {
    const e = estimateMarketFill(book([], [[100, 1]]), "buy", 50);
    expect(e.midPrice).toBe(null); // no ask → no honest mid either
    const sellSide = estimateMarketFill(book([], [[100, 1]]), "sell", 50);
    expect(sellSide.midPrice).toBe(null);
    expect(sellSide.determinable).toBe(true); // bids exist for a sell
  });
});

describe("slippage — capability honesty", () => {
  it("labels every estimate as a static-snapshot estimate, never a fill guarantee", () => {
    expect(ESTIMATE_LABEL).toContain("not a fill guarantee");
  });

  it("capability reports stay honest — estimation OPERATIONAL, live-fill prediction NOT_IMPLEMENTED", () => {
    const caps = slippageCapabilityReports();
    expect(
      caps.find((c) => c.id === "execution-cost-estimation")?.maturity,
    ).toBe("OPERATIONAL");
    expect(
      caps.find((c) => c.id === "execution-cost-prediction")?.maturity,
    ).toBe("NOT_IMPLEMENTED");
  });
});
