// =========================================================
// ARCHIE TRADING ENGINE — ORDER LIFECYCLE TESTS
// src/lib/archie/__tests__/order-lifecycle.test.ts
//
// Engine inventory #29 deepening: the order lifecycle behind
// the hard trade gate. Deterministic, structural, honest:
//
//   * positions open ONLY from eligible gate decisions —
//     refusal is structural, no override exists
//   * stop/target monitoring per tick; gap-through stops
//     fill at the worse price — loss never understated
//   * emergency stop closes immediately at market
//   * closed positions are terminal; double close refused
//   * P&L math is direction-aware and fee-explicit
// =========================================================
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADING_LIMITS,
  evaluateTradeGate,
  type TradeRequest,
  type TradingLimits,
} from "@studio-shared/archie-ai/native-engine/crypto/trade-gate.ts";
import {
  closePositionManually,
  monitorPosition,
  openPositionFromDecision,
  renderLifecycleReport,
  type Position,
} from "@studio-shared/archie-ai/native-engine/crypto/order-lifecycle.ts";
import { buildPrediction } from "@studio-shared/archie-ai/native-engine/crypto/probability.ts";
import type { Candle } from "@studio-shared/archie-ai/native-engine/crypto/market-data.ts";

// ---------------------------------------------------------
// Deterministic fixtures (mirrors trade-gate.test.ts)
// ---------------------------------------------------------
function wig(i: number) {
  return Math.sin(i * 1.7) * 0.001;
}

function trendingCandles(count: number, slope: number): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + slope * i + Math.sin(i / 3) * 4;
    return {
      ts: 1726876800 + i * 3600,
      open: 100 + slope * Math.max(0, i - 1) + Math.sin((i - 1) / 3) * 4,
      high: close * (1.005 + wig(i)),
      low: close * (0.995 - wig(i)),
      close,
      volumeBase: 100 + (i % 7) * 5,
    };
  });
}

const goodQuality = {
  crossVenueAnomaly: false,
  venuesReporting: 4,
  analysisAnomalies: [],
  dataAgeMs: 5_000,
};

function goodPrediction() {
  return buildPrediction(
    "BTC-USDT",
    "long",
    trendingCandles(80, 0.8),
    60,
    10,
    {
      samples: 300,
      hitRate: 0.58,
      brier: 0.2,
      meanPredicted: 0.56,
      baseRate: 0.5,
    },
    goodQuality,
  )!;
}

function baseRequest(over: Partial<TradeRequest> = {}): TradeRequest {
  return {
    symbol: "BTC-USDT",
    direction: "long",
    entryPrice: 100,
    stopPrice: 98,
    targetPrice: 104,
    positionSizeQuote: 100,
    portfolioValueQuote: 10_000,
    ...over,
  };
}

function limits(over: Partial<TradingLimits> = {}): TradingLimits {
  return { ...DEFAULT_TRADING_LIMITS, ...over };
}

const T0 = 1_726_876_800_000;
// buildPrediction stamps createdAt with the REAL clock, so the
// gate evaluation must also use the real clock (+30s age) for
// data_fresh to pass honestly.
const NOW = Date.now() + 30_000;

function eligibleDecision(): ReturnType<typeof evaluateTradeGate> {
  // The deterministic trend series may calibrate below the
  // probability threshold — in that case the gate honestly
  // refuses. For lifecycle tests we need an eligible seed:
  // lower the threshold to the calibrated probability only
  // if needed (owner may tune limits; the gate still applies
  // every other check).
  const decision = evaluateTradeGate(
    baseRequest(),
    goodPrediction(),
    limits(),
    NOW,
  );
  if (decision.eligible) return decision;
  const prob = decision.prediction!.calibratedProbability;
  const relaxed = evaluateTradeGate(
    baseRequest(),
    goodPrediction(),
    limits({ probabilityThreshold: prob }),
    NOW,
  );
  if (!relaxed.eligible) {
    throw new Error(
      "fixture failure: gate refused even with threshold at the calibrated probability",
    );
  }
  return relaxed;
}

function ineligibleDecision(): ReturnType<typeof evaluateTradeGate> {
  return evaluateTradeGate(
    baseRequest(),
    goodPrediction(),
    limits({ emergencyStop: true }),
    NOW,
  );
}

// ---------------------------------------------------------
// Open — structural refusal
// ---------------------------------------------------------
describe("openPositionFromDecision", () => {
  it("opens a position from an ELIGIBLE gate decision", () => {
    const decision = eligibleDecision();
    const open = openPositionFromDecision(decision, T0);
    expect(open.opened).toBe(true);
    expect(open.position?.state).toBe("OPEN");
    expect(open.position?.status).toBe("OPEN");
    expect(open.position?.symbol).toBe("BTC-USDT");
    expect(open.position?.entryPrice).toBe(100);
    expect(open.position?.feesPaidQuote).toBe(0); // feeBps 0 default
    expect(open.events.map((e) => e.id)).toContain("POSITION_OPENED");
  });

  it("REFUSES an ineligible decision — structurally, naming every failed check", () => {
    const decision = ineligibleDecision();
    const open = openPositionFromDecision(decision, T0);
    expect(open.opened).toBe(false);
    expect(open.position).toBeNull();
    expect(open.reason).toContain("no override");
    expect(open.reason).toContain("emergency_stop");
    expect(open.events[0].id).toBe("POSITION_REJECTED");
  });

  it("charges the entry fee exactly once (feeBps per side on notional)", () => {
    const open = openPositionFromDecision(eligibleDecision(), T0, {
      feeBps: 10,
    });
    expect(open.position?.feesPaidQuote).toBeCloseTo(0.1, 10); // 100 × 10bps
  });

  it("builds a deterministic position id from symbol + open time", () => {
    const open = openPositionFromDecision(eligibleDecision(), T0);
    expect(open.position?.id).toBe(`pos_BTCUSDT_${T0}`);
  });
});

// ---------------------------------------------------------
// Monitor — stop / target / emergency
// ---------------------------------------------------------
function openLong(over: Partial<Position> = {}): Position {
  const open = openPositionFromDecision(eligibleDecision(), T0);
  return { ...open.position!, ...over };
}

describe("monitorPosition", () => {
  it("keeps the position open while price stays inside the band", () => {
    const res = monitorPosition(openLong(), 101, T0 + 60_000, limits());
    expect(res.closed).toBe(false);
    expect(res.position.state).toBe("OPEN");
    expect(res.events).toEqual([]);
  });

  it("closes at the stop when a long tick touches it, with honest negative P&L", () => {
    const res = monitorPosition(openLong(), 98, T0 + 60_000, limits());
    expect(res.closed).toBe(true);
    expect(res.position.state).toBe("CLOSED");
    expect(res.position.status).toBe("CLOSED_STOP");
    expect(res.position.exitPrice).toBe(98);
    // long: (98−100)/100 × 100 = −2
    expect(res.position.realizedPnlQuote).toBeCloseTo(-2, 10);
    expect(res.position.realizedPnlPct).toBeCloseTo(-2, 10);
    expect(res.events[0].id).toBe("STOP_HIT");
  });

  it("gap-through stop fills at the WORSE price — loss never understated", () => {
    // tick crashes to 95 while the stop sits at 98
    const res = monitorPosition(openLong(), 95, T0 + 60_000, limits());
    expect(res.position.exitPrice).toBe(95); // not 98
    // long: (95−100)/100 × 100 = −5, worse than the −2 the stop implies
    expect(res.position.realizedPnlQuote).toBeCloseTo(-5, 10);
  });

  it("closes at the target when a long tick reaches it, with honest positive P&L", () => {
    const res = monitorPosition(openLong(), 104, T0 + 90_000, limits());
    expect(res.position.status).toBe("CLOSED_TARGET");
    expect(res.position.exitPrice).toBe(104);
    // long: (104−100)/100 × 100 = +4
    expect(res.position.realizedPnlQuote).toBeCloseTo(4, 10);
    expect(res.position.realizedPnlPct).toBeCloseTo(4, 10);
  });

  it("mirrors the geometry for shorts: stop above, target below", () => {
    const shortPosition = openLong({
      direction: "short",
      stopPrice: 102,
      targetPrice: 96,
    });
    const stop = monitorPosition(shortPosition, 102, T0 + 60_000, limits());
    expect(stop.position.status).toBe("CLOSED_STOP");
    // short: (100−102)/100 × 100 = −2
    expect(stop.position.realizedPnlQuote).toBeCloseTo(-2, 10);

    const shortOpen = openLong({
      direction: "short",
      stopPrice: 102,
      targetPrice: 96,
    });
    const target = monitorPosition(shortOpen, 96, T0 + 90_000, limits());
    expect(target.position.status).toBe("CLOSED_TARGET");
    // short: (100−96)/100 × 100 = +4
    expect(target.position.realizedPnlQuote).toBeCloseTo(4, 10);
  });

  it("short gap-through stop fills at the worse (higher) price", () => {
    const shortPosition = openLong({
      direction: "short",
      stopPrice: 102,
      targetPrice: 96,
    });
    // tick spikes to 106 while the stop sits at 102
    const res = monitorPosition(shortPosition, 106, T0 + 60_000, limits());
    expect(res.position.exitPrice).toBe(106);
    // short: (100−106)/100 × 100 = −6
    expect(res.position.realizedPnlQuote).toBeCloseTo(-6, 10);
  });

  it("emergency stop closes IMMEDIATELY at the tick price — before any stop/target logic", () => {
    const res = monitorPosition(
      openLong(),
      100.5,
      T0 + 60_000,
      limits({ emergencyStop: true }),
    );
    expect(res.closed).toBe(true);
    expect(res.position.status).toBe("CLOSED_EMERGENCY");
    expect(res.position.exitPrice).toBe(100.5);
    expect(res.events[0].id).toBe("EMERGENCY_CLOSED");
  });

  it("REFUSES to monitor a closed position — journal says so, nothing silent", () => {
    const closed = monitorPosition(openLong(), 98, T0 + 60_000, limits());
    const again = monitorPosition(closed.position, 104, T0 + 120_000, limits());
    expect(again.closed).toBe(false);
    expect(again.position.state).toBe("CLOSED");
    expect(again.events[0].id).toBe("ILLEGAL_TRANSITION_REFUSED");
    // P&L was NOT restated by the refused call
    expect(again.position.exitPrice).toBe(98);
    expect(again.position.realizedPnlQuote).toBeCloseTo(-2, 10);
  });

  it("applies exit fees on the exit notional (price-scaled)", () => {
    // entry opened with the DEFAULT config (fee 0) — only the
    // exit side charges: notional 100 × (104/100) = 104 → 10bps = 0.104
    const res = monitorPosition(openLong(), 104, T0 + 90_000, limits(), {
      feeBps: 10,
    });
    expect(res.position.feesPaidQuote).toBeCloseTo(0.104, 10);
    expect(res.position.realizedPnlQuote).toBeCloseTo(4 - 0.104, 10);
  });
});

// ---------------------------------------------------------
// Manual close
// ---------------------------------------------------------
describe("closePositionManually", () => {
  it("closes at the owner's price with status CLOSED_MANUAL", () => {
    const res = closePositionManually(openLong(), 101.5, T0 + 60_000);
    expect(res.closed).toBe(true);
    expect(res.position.status).toBe("CLOSED_MANUAL");
    expect(res.position.realizedPnlQuote).toBeCloseTo(1.5, 10);
    expect(res.events[0].id).toBe("POSITION_CLOSED");
  });

  it("REFUSES a double close", () => {
    const first = closePositionManually(openLong(), 101.5, T0 + 60_000);
    const second = closePositionManually(first.position, 99, T0 + 70_000);
    expect(second.closed).toBe(false);
    expect(second.events[0].id).toBe("ILLEGAL_TRANSITION_REFUSED");
    expect(second.position.exitPrice).toBe(101.5); // first close stands
  });
});

// ---------------------------------------------------------
// Honest rendering
// ---------------------------------------------------------
describe("renderLifecycleReport", () => {
  it("refuses to project P&L while the position is open", () => {
    const report = renderLifecycleReport(openLong());
    expect(report).toContain("POSITION OPEN");
    expect(report).toContain("No P&L is realized");
  });

  it("names the close reason and the exact net outcome", () => {
    const closed = monitorPosition(openLong(), 98, T0 + 60_000, limits());
    const report = renderLifecycleReport(closed.position);
    expect(report).toContain("CLOSED_STOP");
    expect(report).toContain("-2.0000");
    expect(report).toContain("-2.00%");
    expect(report).toContain("not financial advice");
  });
});

// ---------------------------------------------------------
// End-to-end: gate → open → monitor → close → report
// ---------------------------------------------------------
describe("full lifecycle", () => {
  it("runs an honest full lifecycle with a complete journal", () => {
    const open = openPositionFromDecision(eligibleDecision(), T0);
    expect(open.opened).toBe(true);

    const tick1 = monitorPosition(open.position!, 101, T0 + 60_000, limits());
    expect(tick1.closed).toBe(false);

    const tick2 = monitorPosition(tick1.position, 104, T0 + 120_000, limits());
    expect(tick2.closed).toBe(true);
    expect(tick2.position.realizedPnlQuote).toBeCloseTo(4, 10);

    const journal = [...open.events, ...tick1.events, ...tick2.events].map(
      (e) => e.id,
    );
    // tick1 stayed inside the band → no event; the journal is
    // open → target-close, in order
    expect(journal).toEqual(["POSITION_OPENED", "TARGET_HIT"]);
  });
});
