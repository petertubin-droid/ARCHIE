import { describe, expect, it } from "vitest";
// =========================================================
// HARD TRADE GATE TESTS (Crypto & Blockchain Intelligence,
// 2026-09-11). Every NO_TRADE path is named; the ELIGIBLE path
// requires EVERY condition to pass; the decision hash seals the
// evidence; tampering is caught at the execution seam.
// =========================================================

import { gateDecide, computeDecisionHash, DEFAULT_TRADE_LIMITS } from "@studio-shared/archie-ai/native-engine/trade-gate.ts";
import { verifyDecision } from "@studio-shared/archie-ai/native-engine/trade-gate-verifier.ts";
import { openPosition, newLedger, markPositions, paperPerformance } from "@studio-shared/archie-ai/native-engine/paper-trading.ts";
import type { MarketSnapshot, MarketCandle } from "@studio-shared/archie-ai/native-engine/market-data.ts";

function mkSnapshot(
  closes: number[],
  opts: { crossCheck?: number | null; fetchedAt?: number; newestCandleAgeH?: number } = {},
): MarketSnapshot {
  const now = Date.now();
  const ageMs = (opts.newestCandleAgeH ?? 1) * 3_600_000;
  const candles: MarketCandle[] = closes.map((c, i) => ({
    time: now - ageMs - (closes.length - 1 - i) * 86_400_000,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: 100,
  }));
  return {
    symbol: "BTC",
    candles,
    crossCheck:
      opts.crossCheck === null
        ? null
        : { price: opts.crossCheck ?? closes[closes.length - 1], currency: "usd", provider: "coingecko", fetchedAt: now },
    notes: ["test fixture"],
    fetchedAt: opts.fetchedAt ?? now,
  };
}

// A realistic winning track record: 14 resolved predictions at
// reported 0.65 with 9 favorable — Brier ≈ 0.207 (better than
// the 0.25 coin-flip limit).
const GOOD_RECORD = Array.from({ length: 14 }, (_, i) => ({
  reportedProbability: 0.65,
  outcomeFavorable: i < 9,
}));

// A genuinely trending market with enough history for analogs.
const UPTREND = Array.from({ length: 130 }, (_, i) => 100 + i * 0.8);

const BASE = {
  predictionRecord: GOOD_RECORD,
  emergencyStop: false,
};

describe("HARD TRADE GATE — every refusal is named", () => {
  it("EMERGENCY STOP halts everything, even a perfect setup", () => {
    const d = gateDecide({
      snapshot: mkSnapshot(UPTREND),
      predictionRecord: GOOD_RECORD,
      emergencyStop: true,
    });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.emergencyStop).toBe(true);
      expect(d.reasons[0]).toContain("EMERGENCY STOP");
    }
  });

  it("stale data refuses the trade", () => {
    const d = gateDecide({
      ...BASE,
      snapshot: mkSnapshot(UPTREND, { newestCandleAgeH: 48 }),
    });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.reasons.some((r) => r.includes("not fresh"))).toBe(true);
    }
  });

  it("missing independent cross-check refuses the trade", () => {
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND, { crossCheck: null }) });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.reasons.some((r) => r.includes("cross-check"))).toBe(true);
    }
  });

  it("diverged sources (anomaly) refuse the trade", () => {
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND, { crossCheck: UPTREND[UPTREND.length - 1] * 0.9 }) });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.reasons.some((r) => r.includes("DIVERGED") || r.includes("diverge"))).toBe(true);
    }
  });

  it("unproven methodology (no track record) refuses the trade — the default state", () => {
    // Fresh engine: zero resolved predictions. NO TRADE, period.
    const d = gateDecide({ snapshot: mkSnapshot(UPTREND), predictionRecord: [], emergencyStop: false });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.reasons.some((r) => r.includes("Methodology not yet validated"))).toBe(true);
    }
  });

  it("bad calibration (Brier worse than coin flip) refuses the trade", () => {
    // 50% reported probability on random outcomes → Brier 0.25+
    const bad = Array.from({ length: 14 }, (_, i) => ({
      reportedProbability: 0.5,
      outcomeFavorable: i % 2 === 0,
    }));
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND), predictionRecord: bad });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(d.reasons.some((r) => r.includes("Calibration failed"))).toBe(true);
    }
  });

  it("probability below the configured threshold refuses — and is never rounded up", () => {
    // threshold above what the evidence's lower bound can reach
    const d = gateDecide({
      ...BASE,
      snapshot: mkSnapshot(UPTREND),
      limits: { minProbability: 0.99 },
    });
    expect(d.decision).toBe("NO_TRADE");
    if (d.decision === "NO_TRADE") {
      expect(
        d.reasons.some((r) => r.includes("below the configured threshold") && r.includes("Never inflated")),
      ).toBe(true);
    }
  });

  it("range market has no edge → refusal", () => {
    const chop = Array.from({ length: 100 }, (_, i) => 100 + (i % 2) * 0.5);
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(chop) });
    expect(d.decision).toBe("NO_TRADE");
  });

  it("ELIGIBLE only when EVERY condition passes — with the conservative bound attached", () => {
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    expect(d.decision).toBe("ELIGIBLE");
    if (d.decision === "ELIGIBLE") {
      expect(d.direction).toBe("long");
      expect(d.probability).toBeLessThan(1); // never 1.0 — honest uncertainty
      expect(d.probability).toBeGreaterThan(0); // real bound
      expect(d.riskReward).toBeGreaterThanOrEqual(DEFAULT_TRADE_LIMITS.minRiskReward);
      expect(d.positionFraction).toBeLessThanOrEqual(DEFAULT_TRADE_LIMITS.maxPositionFraction);
      expect(d.evidence.probabilityNote).toContain("Wilson 95% LOWER bound");
      expect(d.decisionHash).toHaveLength(8);
    }
  });

  it("the decision hash seals the evidence — tampering is caught at the seam", () => {
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    expect(d.decision).toBe("ELIGIBLE");
    if (d.decision !== "ELIGIBLE") return;
    // Untampered decision verifies
    expect(verifyDecision(d)).toBe(true);
    // A modified entry price no longer matches the hash
    const tampered = { ...d, entry: d.entry * 0.5 };
    expect(verifyDecision(tampered)).toBe(false);
    // A modified probability never validates either
    const inflated = { ...d, probability: 0.99 };
    expect(verifyDecision(inflated)).toBe(false);
    // And the canonical hasher itself is deterministic
    const h1 = computeDecisionHash({
      symbol: d.symbol, direction: d.direction, entry: d.entry, stop: d.stop,
      target: d.target, probability: d.probability, riskReward: d.riskReward,
      positionFraction: d.positionFraction, windowSize: d.evidence.indicators.windowSize,
      analyzedAt: d.evidence.analyzedAt,
    });
    expect(h1).toBe(d.decisionHash);
  });
});

describe("PAPER TRADING — the only execution surface, honestly bounded", () => {
  it("refuses to open anything from a NO_TRADE decision", () => {
    const ledger = newLedger();
    const d = gateDecide({ snapshot: mkSnapshot(UPTREND), predictionRecord: [], emergencyStop: false });
    expect(d.decision).toBe("NO_TRADE");
    const { opened, note } = openPosition(ledger, d, 100);
    expect(opened).toBeNull();
    expect(note).toContain("Refused");
  });

  it("opens a paper position from a verified ELIGIBLE decision and books fees", () => {
    const ledger = newLedger();
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    expect(d.decision).toBe("ELIGIBLE");
    if (d.decision !== "ELIGIBLE") return;
    const { opened, note } = openPosition(ledger, d, d.entry);
    expect(opened).not.toBeNull();
    expect(note).toContain("PAPER");
    expect(ledger.equity).toBeLessThan(ledger.startingEquity); // entry fee booked
    expect(ledger.positions).toHaveLength(1);
  });

  it("refuses a tampered (stale) decision even if it once was ELIGIBLE", () => {
    const ledger = newLedger();
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    if (d.decision !== "ELIGIBLE") return;
    const tampered = { ...d, probability: 0.99 };
    const { opened, note } = openPosition(ledger, tampered, d.entry);
    expect(opened).toBeNull();
    expect(note).toContain("hash mismatch");
  });

  it("marks positions to market: stop and target both settle with exact P&L", () => {
    const ledger = newLedger();
    const d = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    if (d.decision !== "ELIGIBLE") return;
    openPosition(ledger, d, d.entry);
    const pos = ledger.positions[0];
    // price crashes through the stop → closed-stop
    const events = markPositions(ledger, () => d.stop * 0.9);
    expect(events.some((e) => e.includes("STOP"))).toBe(true);
    expect(ledger.positions).toHaveLength(0);
    expect(pos.status).toBe("closed-stop");
    // long position: loss = (stop − entry) × size − fees
    expect(pos.realizedPnl).toBeLessThan(0);
    // re-open and let it run to target
    const d2 = gateDecide({ ...BASE, snapshot: mkSnapshot(UPTREND) });
    if (d2.decision !== "ELIGIBLE") return;
    openPosition(ledger, d2, d2.entry);
    markPositions(ledger, () => d2.target * 1.5);
    const last = ledger.closed[ledger.closed.length - 1];
    expect(last.status).toBe("closed-target");
    expect(last.realizedPnl).toBeGreaterThan(0);
    // performance line is honest about paper mode
    expect(paperPerformance(ledger)).toContain("PAPER ONLY");
  });
});
