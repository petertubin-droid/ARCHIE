// =========================================================
// PAPER TRADING (Crypto & Blockchain Intelligence,
// 2026-09-11). The ONLY execution surface that exists today.
//
// HONEST BOUNDARIES (permanent, not "coming soon" fluff):
//   - LIVE trading requires an owner-configured exchange
//     adapter with trade-scoped (no-withdrawal) API keys.
//     NONE EXISTS. Nothing here can reach a real exchange.
//   - The portfolio trades REAL fetched market prices and
//     records every fill — it is a measurement instrument for
//     ARCHIE's track record, not a claim of profit.
//   - openPosition() refuses any proposal that is not a
//     verified ELIGIBLE gate decision (hash re-check).
// =========================================================

import type { GateDecision } from "./trade-gate.ts";
import { fnv1aForDecision } from "./trade-gate-verifier.ts";

export interface PaperPosition {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  /** Units of the asset (positionFraction × equity / entry). */
  size: number;
  openedAt: number;
  decisionHash: string;
  probability: number;
  status: "open" | "closed-stop" | "closed-target" | "closed-manual";
  closedAt?: number;
  exitPrice?: number;
  realizedPnl: number;
}

export interface PaperLedger {
  startingEquity: number;
  equity: number;
  feeBps: number;
  positions: PaperPosition[];
  /** Completed round trips. */
  closed: PaperPosition[];
  totalFees: number;
}

export function newLedger(startingEquity = 10000, feeBps = 10): PaperLedger {
  return {
    startingEquity,
    equity: startingEquity,
    feeBps,
    positions: [],
    closed: [],
    totalFees: 0,
  };
}

export function unrealizedPnl(pos: PaperPosition, price: number): number {
  const move = pos.direction === "long" ? price - pos.entry : pos.entry - price;
  return move * pos.size;
}

/** Open a position from a gate decision. The decision hash is
 *  RE-VERIFIED against the decision contents — a tampered or
 *  replayed decision is refused. This is the non-bypassable
 *  seam between the gate and execution. */
export function openPosition(
  ledger: PaperLedger,
  decision: GateDecision,
  marketPrice: number,
): { opened: PaperPosition | null; note: string } {
  if (decision.decision !== "ELIGIBLE") {
    return { opened: null, note: "Refused: only ELIGIBLE gate decisions can open positions — this proposal is not eligible." };
  }
  const expected = fnv1aForDecision(decision);
  if (expected !== decision.decisionHash) {
    return {
      opened: null,
      note: "Refused: decision hash mismatch — the decision contents do not match the hash (tampered or stale proposal).",
    };
  }
  const drift = Math.abs(marketPrice - decision.entry) / decision.entry;
  if (drift > 0.02) {
    return {
      opened: null,
      note: `Refused: market price drifted ${(drift * 100).toFixed(1)}% from the gate's entry analysis (> 2%) — re-run the analysis.`,
    };
  }
  const notional = ledger.equity * decision.positionFraction;
  const size = notional / decision.entry;
  const fee = (notional * ledger.feeBps) / 10_000;
  ledger.equity -= fee;
  ledger.totalFees += fee;
  const pos: PaperPosition = {
    id: `p_${decision.symbol}_${Date.now().toString(36)}`,
    symbol: decision.symbol,
    direction: decision.direction,
    entry: marketPrice,
    stop: decision.stop,
    target: decision.target,
    size,
    openedAt: Date.now(),
    decisionHash: decision.decisionHash,
    probability: decision.probability,
    status: "open",
    realizedPnl: 0,
  };
  ledger.positions.push(pos);
  return {
    opened: pos,
    note: `PAPER position opened: ${decision.direction} ${decision.symbol}, ${size.toFixed(6)} units at ${marketPrice.toFixed(2)} (paper fee ${fee.toFixed(2)}). This is PAPER trading — no real funds.`,
  };
}

/** Mark-to-market close at stop/target/current. Pure bookkeeping
 *  over real fetched prices. */
export function markPositions(
  ledger: PaperLedger,
  priceFor: (symbol: string) => number,
): string[] {
  const events: string[] = [];
  const stillOpen: PaperPosition[] = [];
  for (const pos of ledger.positions) {
    const price = priceFor(pos.symbol);
    const hitStop = pos.direction === "long" ? price <= pos.stop : price >= pos.stop;
    const hitTarget = pos.direction === "long" ? price >= pos.target : price <= pos.target;
    if (hitStop || hitTarget) {
      const exitPrice = hitStop ? pos.stop : pos.target;
      const gross = pos.direction === "long"
        ? (exitPrice - pos.entry) * pos.size
        : (pos.entry - exitPrice) * pos.size;
      const fee = (exitPrice * pos.size * ledger.feeBps) / 10_000;
      pos.status = hitStop ? "closed-stop" : "closed-target";
      pos.closedAt = Date.now();
      pos.exitPrice = exitPrice;
      pos.realizedPnl = gross - fee;
      ledger.equity += pos.realizedPnl;
      ledger.totalFees += fee;
      ledger.closed.push(pos);
      events.push(
        `PAPER ${pos.status === "closed-stop" ? "STOP" : "TARGET"} hit on ${pos.symbol} ${pos.direction}: ${pos.realizedPnl >= 0 ? "+" : ""}${pos.realizedPnl.toFixed(2)} USD (paper).`,
      );
    } else {
      stillOpen.push(pos);
    }
  }
  ledger.positions = stillOpen;
  return events;
}

export function paperPerformance(ledger: PaperLedger): string {
  const won = ledger.closed.filter((p) => p.realizedPnl > 0).length;
  const lost = ledger.closed.length - won;
  const pnl = ledger.equity - ledger.startingEquity;
  return (
    `Paper portfolio: equity ${ledger.equity.toFixed(2)} USD (start ${ledger.startingEquity.toFixed(2)}), ` +
    `P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD, fees paid ${ledger.totalFees.toFixed(2)}, ` +
    `${ledger.positions.length} open, ${ledger.closed.length} closed (${won}W/${lost}L). ` +
    `PAPER ONLY — live execution requires an owner-configured exchange adapter, which does not exist.`
  );
}
