// =========================================================
// ARCHIE NATIVE ENGINE — EXECUTION COST & SLIPPAGE ESTIMATION
// supabase/functions/_shared/archie-ai/native-engine/crypto/slippage.ts
//
// Deterministic pre-trade cost estimation by walking the REAL
// order-book snapshot level by level. Given a side and an
// order size in quote currency, this computes exactly what a
// market order would consume:
//
//   * VWAP fill price across the levels consumed
//   * slippage vs. the mid price, in basis points
//   * share of visible book depth consumed
//   * HONEST REFUSAL when the visible book cannot fill the
//     order — the estimate is never extrapolated past the
//     last visible level
//
// No forecasting, no hidden model: the estimate is a walk of
// the supplied snapshot, nothing more. Real books move — the
// result is labeled an ESTIMATE, not a promise.
// =========================================================

import type { OrderBookSnapshot } from "./market-data.ts";
import type { CapabilityReport } from "../types.ts";

export interface FillEstimate {
  determinable: boolean;
  side: "buy" | "sell";
  /** Order size in quote currency (e.g. USDT). */
  orderSizeQuote: number;
  /** Volume-weighted average price across consumed levels. */
  vwapFillPrice: number | null;
  /** Mid price at snapshot time. */
  midPrice: number | null;
  /** (vwap − mid) for buys, (mid − vwap) for sells, in bps. */
  slippageBps: number | null;
  /** Quote value consumed across levels. */
  filledQuote: number;
  /** Share of the visible depth (same side) consumed, %. */
  depthConsumedPct: number;
  /** Levels consumed. */
  levelsConsumed: number;
  /** Honest reason when not determinable. */
  reason: string;
  /** The honest label every estimate carries. */
  estimateLabel: string;
}

export const ESTIMATE_LABEL =
  "static-snapshot estimate — the live book WILL differ; not a fill guarantee";

function sideLevels(book: OrderBookSnapshot, side: "buy" | "sell") {
  // A market BUY consumes asks; a market SELL consumes bids.
  return side === "buy" ? book.asks : book.bids;
}

export function estimateMarketFill(
  book: OrderBookSnapshot,
  side: "buy" | "sell",
  orderSizeQuote: number,
): FillEstimate {
  const bestBid = book.bids[0]?.[0] ?? null;
  const bestAsk = book.asks[0]?.[0] ?? null;
  const mid =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

  const levels = sideLevels(book, side);
  const visibleDepthQuote = levels.reduce(
    (a, [price, qty]) => a + price * qty,
    0,
  );

  if (orderSizeQuote <= 0) {
    return {
      determinable: false,
      side,
      orderSizeQuote,
      vwapFillPrice: null,
      midPrice: mid,
      slippageBps: null,
      filledQuote: 0,
      depthConsumedPct: 0,
      levelsConsumed: 0,
      reason: "order size must be positive",
      estimateLabel: ESTIMATE_LABEL,
    };
  }
  if (levels.length === 0 || visibleDepthQuote === 0) {
    return {
      determinable: false,
      side,
      orderSizeQuote,
      vwapFillPrice: null,
      midPrice: mid,
      slippageBps: null,
      filledQuote: 0,
      depthConsumedPct: 0,
      levelsConsumed: 0,
      reason: "empty book side — no visible liquidity to estimate against",
      estimateLabel: ESTIMATE_LABEL,
    };
  }

  let remaining = orderSizeQuote;
  let costBase = 0; // Σ price × qty consumed (base = quote cost)
  let baseFilled = 0; // Σ qty consumed (base asset units)
  let levelsConsumed = 0;

  for (const [price, qty] of levels) {
    if (remaining <= 0) break;
    const levelQuote = price * qty;
    const takeQuote = Math.min(remaining, levelQuote);
    const takeBase = levelQuote > 0 ? takeQuote / price : 0;
    costBase += takeQuote;
    baseFilled += takeBase;
    remaining -= takeQuote;
    levelsConsumed += 1;
  }

  if (remaining > 0) {
    // NOT extrapolated — honest refusal. A market order larger
    // than the visible book has no deterministic estimate.
    return {
      determinable: false,
      side,
      orderSizeQuote,
      vwapFillPrice: null,
      midPrice: mid,
      slippageBps: null,
      filledQuote: orderSizeQuote - remaining,
      depthConsumedPct: 100,
      levelsConsumed,
      reason:
        "visible book depth insufficient for the order size — no estimate past the last visible level",
      estimateLabel: ESTIMATE_LABEL,
    };
  }

  const vwap = baseFilled > 0 ? costBase / baseFilled : null;
  const slippageBps =
    vwap !== null && mid !== null && mid > 0
      ? ((vwap - mid) / mid) * 10_000 * (side === "buy" ? 1 : -1)
      : null;

  return {
    determinable: true,
    side,
    orderSizeQuote,
    vwapFillPrice: vwap,
    midPrice: mid,
    slippageBps,
    filledQuote: costBase,
    depthConsumedPct: (costBase / visibleDepthQuote) * 100,
    levelsConsumed,
    reason: "",
    estimateLabel: ESTIMATE_LABEL,
  };
}

/** Honest capability reports for this subsystem. */
export function slippageCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "execution-cost-estimation",
      description:
        "Deterministic order-book walk: VWAP fill price, mid-price slippage in bps, visible-depth consumption; refuses to estimate past the last visible level",
      maturity: "OPERATIONAL",
      measuredBy:
        "slippage.test.ts (buy/sell walks, insufficient depth refusal, single-level book)",
    },
    {
      id: "execution-cost-prediction",
      description:
        "Predicting live fills, latency-aware execution, or IOC/FOK simulation against a moving book",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — static-snapshot estimate only, explicitly labeled as such",
    },
  ];
}
