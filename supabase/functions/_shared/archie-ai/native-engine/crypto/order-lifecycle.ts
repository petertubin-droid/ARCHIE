// =========================================================
// ARCHIE NATIVE ENGINE — ORDER LIFECYCLE
// supabase/functions/_shared/archie-ai/native-engine/crypto/order-lifecycle.ts
//
// The trade gate (trade-gate.ts) decides whether a trade is
// ELIGIBLE. This module owns what happens AFTER: the
// position lifecycle — open, monitor, close — with an
// append-only journal and deterministic P&L.
//
// HARD RULES (structural — no bypass exists):
//   1. A position can ONLY be opened from an ELIGIBLE
//      GateDecision. openPositionFromDecision refuses
//      ineligible decisions and journals the refusal. There
//      is no forceOpen, no constructor escape, no override.
//   2. The owner emergency stop forces an immediate market
//      close on the very next monitor tick — safety before
//      profit, always.
//   3. Tick model: one price per monitor call. Long: stop
//      first, then target. Short: mirrored. When a tick gaps
//      through the stop, the fill is the WORSE of tick vs
//      stop — the loss is never understated.
//   4. Closed positions are terminal: further monitor/close
//      calls are refused and journaled, never silently
//      no-oped.
//   5. P&L is deterministic: direction-aware linear math,
//      explicit fees (basis points per side). No hidden
//      slippage model, no invented numbers.
//
// SCOPE (honest): this is a LEDGER lifecycle — it tracks
// positions and outcomes deterministically. It does NOT place
// orders on exchanges; live execution would require owner-
// provisioned venue credentials and an explicit authorization
// path that does not exist. It never fabricates fills.
// =========================================================

import type { GateDecision } from "./trade-gate.ts";
import type { TradingLimits } from "./trade-gate.ts";

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

export type PositionState = "OPEN" | "CLOSED";

export type PositionStatus =
  | "OPEN"
  | "CLOSED_STOP"
  | "CLOSED_TARGET"
  | "CLOSED_EMERGENCY"
  | "CLOSED_MANUAL";

export interface Position {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** Notional in quote currency at entry (e.g. USDT). */
  positionSizeQuote: number;
  /** Portfolio value at entry — for honest %-of-portfolio math. */
  portfolioValueQuote: number;
  openedAtMs: number;
  state: PositionState;
  status: PositionStatus;
  exitPrice: number | null;
  closedAtMs: number | null;
  /** Gross realized P&L in quote currency (fees excluded). */
  realizedPnlQuote: number | null;
  /** Realized return on the position, % (fees included). */
  realizedPnlPct: number | null;
  /** Fees paid, quote currency (entry + exit sides). */
  feesPaidQuote: number;
}

export type LifecycleEventId =
  | "POSITION_REJECTED"
  | "POSITION_OPENED"
  | "STOP_HIT"
  | "TARGET_HIT"
  | "EMERGENCY_CLOSED"
  | "POSITION_CLOSED"
  | "ILLEGAL_TRANSITION_REFUSED";

export interface LifecycleEvent {
  atMs: number;
  id: LifecycleEventId;
  positionId: string | null;
  detail: string;
}

export interface OpenResult {
  opened: boolean;
  position: Position | null;
  events: LifecycleEvent[];
  reason: string | null;
}

export interface MonitorResult {
  position: Position;
  events: LifecycleEvent[];
  closed: boolean;
}

export interface LifecycleConfig {
  /** Fee in basis points charged per side (entry and exit), on notional. */
  feeBps: number;
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  feeBps: 0,
};

// ---------------------------------------------------------
// Deterministic P&L core
// ---------------------------------------------------------
function exitNotional(position: Position, exitPrice: number): number {
  // linear contract: exit notional scales with price ratio
  return position.entryPrice > 0
    ? position.positionSizeQuote * (exitPrice / position.entryPrice)
    : 0;
}

function grossPnlQuote(
  direction: "long" | "short",
  entryPrice: number,
  exitPrice: number,
  positionSizeQuote: number,
): number {
  if (entryPrice <= 0) return 0;
  const perUnit =
    direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (perUnit / entryPrice) * positionSizeQuote;
}

// ---------------------------------------------------------
// Open — ONLY from an eligible gate decision
// ---------------------------------------------------------
export function openPositionFromDecision(
  decision: GateDecision,
  nowMs: number,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG,
): OpenResult {
  if (!decision.eligible) {
    const failedIds = decision.checks
      .filter((c) => !c.passed)
      .map((c) => c.id)
      .join(", ");
    return {
      opened: false,
      position: null,
      reason:
        `gate refused the trade — failed checks: ${failedIds}. ` +
        "No position may be opened from an ineligible decision; there is no override.",
      events: [
        {
          atMs: nowMs,
          id: "POSITION_REJECTED",
          positionId: null,
          detail: `rejected ${decision.request.direction} ${decision.request.symbol}: failed checks [${failedIds}]`,
        },
      ],
    };
  }
  const req = decision.request;
  const entryFee = (req.positionSizeQuote * config.feeBps) / 10_000;
  const position: Position = {
    id: `pos_${req.symbol.replace(/[^A-Z0-9]/gi, "")}_${nowMs}`,
    symbol: req.symbol,
    direction: req.direction,
    entryPrice: req.entryPrice,
    stopPrice: req.stopPrice,
    targetPrice: req.targetPrice,
    positionSizeQuote: req.positionSizeQuote,
    portfolioValueQuote: req.portfolioValueQuote,
    openedAtMs: nowMs,
    state: "OPEN",
    status: "OPEN",
    exitPrice: null,
    closedAtMs: null,
    realizedPnlQuote: null,
    realizedPnlPct: null,
    feesPaidQuote: entryFee,
  };
  return {
    opened: true,
    position,
    reason: null,
    events: [
      {
        atMs: nowMs,
        id: "POSITION_OPENED",
        positionId: position.id,
        detail: `opened ${req.direction} ${req.symbol}: entry ${req.entryPrice}, stop ${req.stopPrice}, target ${req.targetPrice}, size ${req.positionSizeQuote}`,
      },
    ],
  };
}

// ---------------------------------------------------------
// Close — the single terminal transition
// ---------------------------------------------------------
function closeAt(
  position: Position,
  exitPrice: number,
  nowMs: number,
  status: Exclude<PositionStatus, "OPEN">,
  eventId: LifecycleEventId,
  config: LifecycleConfig,
): MonitorResult {
  const gross = grossPnlQuote(
    position.direction,
    position.entryPrice,
    exitPrice,
    position.positionSizeQuote,
  );
  const exitFee = (exitNotional(position, exitPrice) * config.feeBps) / 10_000;
  const fees = position.feesPaidQuote + exitFee;
  const net = gross - fees;
  const closed: Position = {
    ...position,
    state: "CLOSED",
    status,
    exitPrice,
    closedAtMs: nowMs,
    realizedPnlQuote: net,
    realizedPnlPct:
      position.positionSizeQuote > 0
        ? (net / position.positionSizeQuote) * 100
        : 0,
    feesPaidQuote: fees,
  };
  return {
    position: closed,
    closed: true,
    events: [
      {
        atMs: nowMs,
        id: eventId,
        positionId: position.id,
        detail:
          `closed ${position.direction} ${position.symbol} at ${exitPrice} (${status}); ` +
          `gross P&L ${gross.toFixed(4)}, fees ${fees.toFixed(4)}, net ${net.toFixed(4)} (${closed.realizedPnlPct?.toFixed(2)}% of position)`,
      },
    ],
  };
}

// ---------------------------------------------------------
// Monitor — one price tick per call
// ---------------------------------------------------------
export function monitorPosition(
  position: Position,
  price: number,
  nowMs: number,
  limits: TradingLimits,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG,
): MonitorResult {
  if (position.state === "CLOSED") {
    return {
      position,
      closed: false,
      events: [
        {
          atMs: nowMs,
          id: "ILLEGAL_TRANSITION_REFUSED",
          positionId: position.id,
          detail: `position ${position.id} is already CLOSED (${position.status}) — monitoring a closed position is refused`,
        },
      ],
    };
  }
  // Emergency stop — close at the current price IMMEDIATELY,
  // before any stop/target logic. Safety before profit.
  if (limits.emergencyStop) {
    return closeAt(
      position,
      price,
      nowMs,
      "CLOSED_EMERGENCY",
      "EMERGENCY_CLOSED",
      config,
    );
  }
  // Long: stop first (risk before reward), then target.
  if (position.direction === "long") {
    if (price <= position.stopPrice) {
      // gap-through fills at the tick when it is WORSE than the
      // stop — the loss is never understated
      return closeAt(
        position,
        Math.min(price, position.stopPrice),
        nowMs,
        "CLOSED_STOP",
        "STOP_HIT",
        config,
      );
    }
    if (price >= position.targetPrice) {
      return closeAt(
        position,
        position.targetPrice,
        nowMs,
        "CLOSED_TARGET",
        "TARGET_HIT",
        config,
      );
    }
  } else {
    if (price >= position.stopPrice) {
      // short gap-through: fill at the worse of tick vs stop
      return closeAt(
        position,
        Math.max(price, position.stopPrice),
        nowMs,
        "CLOSED_STOP",
        "STOP_HIT",
        config,
      );
    }
    if (price <= position.targetPrice) {
      return closeAt(
        position,
        position.targetPrice,
        nowMs,
        "CLOSED_TARGET",
        "TARGET_HIT",
        config,
      );
    }
  }
  // still open — no event needed, price within the band
  return { position, closed: false, events: [] };
}

// ---------------------------------------------------------
// Manual close (owner decision) — also terminal
// ---------------------------------------------------------
export function closePositionManually(
  position: Position,
  exitPrice: number,
  nowMs: number,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG,
): MonitorResult {
  if (position.state === "CLOSED") {
    return {
      position,
      closed: false,
      events: [
        {
          atMs: nowMs,
          id: "ILLEGAL_TRANSITION_REFUSED",
          positionId: position.id,
          detail: `position ${position.id} is already CLOSED (${position.status}) — double close is refused`,
        },
      ],
    };
  }
  return closeAt(
    position,
    exitPrice,
    nowMs,
    "CLOSED_MANUAL",
    "POSITION_CLOSED",
    config,
  );
}

// ---------------------------------------------------------
// Honest human rendering
// ---------------------------------------------------------
export function renderLifecycleReport(position: Position): string {
  const basis = `${position.direction} ${position.symbol}, size ${position.positionSizeQuote}, entry ${position.entryPrice}`;
  if (position.state === "OPEN") {
    return (
      `POSITION OPEN (${basis}; stop ${position.stopPrice}, target ${position.targetPrice}). ` +
      "No P&L is realized while the position is open — I will not project an outcome as if it happened."
    );
  }
  const pnl =
    position.realizedPnlQuote === null
      ? "unknown"
      : position.realizedPnlQuote.toFixed(4);
  const pct =
    position.realizedPnlPct === null
      ? "unknown"
      : `${position.realizedPnlPct.toFixed(2)}%`;
  return (
    `POSITION CLOSED — ${position.status} (${basis}; exit ${position.exitPrice}). ` +
    `Net realized P&L ${pnl} quote units = ${pct} of the position, fees ${position.feesPaidQuote.toFixed(4)}. ` +
    "This is a ledger outcome, not financial advice."
  );
}
