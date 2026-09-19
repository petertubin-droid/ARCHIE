// =========================================================
// ARCHIE SLIPPAGE / EXECUTION-COST TESTS
// src/lib/archie/__tests__/slippage.test.ts
//
// Trading engine deepening (#29). The deterministic book
// walk verified against hand-computed fixtures:
//
//   * a market BUY consumes ASKS, a SELL consumes BIDS
//   * VWAP fill price and bps slippage verified exactly
//   * an order bigger than the visible book REFUSES to
//     estimate — never extrapolated past the last level
//   * zero/empty books refuse honestly
//   * every determinable estimate carries the
//     static-snapshot honesty label
// =========================================================
import { describe, expect, it } from "vitest";
import {
  ESTIMATE_LABEL,
  estimateMarketFill,
} from "@studio-shared/archie-ai/native-engine/crypto/slippage.ts";
import type { OrderBookSnapshot } from "@studio-shared/archie-ai/native-engine/crypto/market-data.ts";

function book(
  asks: Array<[number, number]>,
  bids: Array<[number, number]>,
): OrderBookSnapshot {
  return {
    venue: "binance",
    symbol: "BTC-USDT",
    asks,
    bids,
    fetchedAt: "2026-09-13T00:00:00Z",
    latencyMs: 50,
  };
}

describe("deterministic book walk", () => {
  it("a market BUY walks the ASKS and reports VWAP + adverse cost", () => {
    // asks: 103×1, 110×1 (visible depth 213); bids: 101×1 → mid 102.
    // Buy 153 quote: level 1 fully (103 quote, 1 base), level 2:
    //   50 quote (5/11 base) → baseFilled 16/11
    //   vwap = 153 / (16/11) = 105.1875
    //   cost = (105.1875 − 102) / 102 = exactly +312.5 bps
    //   (adverse cost is positive on BOTH sides — a buy fills
    //   above mid, a sell below)
    const b = book(
      [
        [103, 1],
        [110, 1],
      ],
      [[101, 1]],
    );
    const r = estimateMarketFill(b, "buy", 153);
    expect(r.determinable).toBe(true);
    expect(r.vwapFillPrice).toBeCloseTo(105.1875, 10);
    expect(r.midPrice).toBeCloseTo(102, 10);
    expect(r.slippageBps).toBeCloseTo(312.5, 10);
    expect(r.levelsConsumed).toBe(2);
    expect(r.depthConsumedPct).toBeCloseTo((153 / 213) * 100, 10);
    expect(r.estimateLabel).toBe(ESTIMATE_LABEL);
  });

  it("a market SELL walks the BIDS and reports an adverse cost too", () => {
    const b = book([[101, 1]], [[99, 2]]);
    const r = estimateMarketFill(b, "sell", 198);
    // vwap = 99; mid = 100 → cost = (100−99)/100 = +100 bps
    expect(r.determinable).toBe(true);
    expect(r.vwapFillPrice).toBeCloseTo(99, 10);
    expect(r.slippageBps).toBeCloseTo(100, 10);
  });

  it("a partial level consumption computes the exact pro-rata VWAP", () => {
    // asks: 100×2 (=200 quote). Buy 100 quote → half the level.
    const b = book([[100, 2]], [[99, 1]]);
    const r = estimateMarketFill(b, "buy", 100);
    expect(r.determinable).toBe(true);
    expect(r.filledQuote).toBeCloseTo(100, 10);
    expect(r.vwapFillPrice).toBeCloseTo(100, 10);
    expect(r.depthConsumedPct).toBeCloseTo(50, 10);
  });

  it("REFUSES to estimate past the last visible level — never extrapolates", () => {
    const b = book([[100, 1]], [[99, 1]]); // visible ask depth = 100
    const r = estimateMarketFill(b, "buy", 5000);
    expect(r.determinable).toBe(false);
    expect(r.vwapFillPrice).toBeNull();
    expect(r.slippageBps).toBeNull();
    expect(r.reason).toContain("insufficient");
  });

  it("REFUSES zero-size orders and empty books honestly", () => {
    const b = book([[100, 1]], [[99, 1]]);
    expect(estimateMarketFill(b, "buy", 0).determinable).toBe(false);
    expect(estimateMarketFill(b, "buy", -5).determinable).toBe(false);
    expect(estimateMarketFill(book([], []), "buy", 10).reason).toContain(
      "empty book side",
    );
  });
});
