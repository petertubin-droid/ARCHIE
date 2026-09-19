// =========================================================
// ARCHIE NATIVE ENGINE — GUARDED EXCHANGE EXECUTION
// supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/execution.ts
//
// The ONLY path from a gate decision to a real venue order.
// Safety controls are STRUCTURAL — each one refuses and
// journals, none can be skipped:
//
//   1. EMERGENCY STOP refuses before anything else — again,
//      even if the gate somehow passed (defense in depth:
//      the gate already checked it, execution re-checks).
//   2. Only ELIGIBLE gate decisions execute. Ineligible
//      decisions are refused and journaled with the failed
//      checks — the same structural rule as the lifecycle.
//   3. STALE decisions never execute: a decision older than
//      maxDecisionAgeMs is refused — market data the gate saw
//      may no longer describe the market.
//   4. MAINNET requires a SECOND explicit owner
//      authorization at execution time, independent of the
//      adapter's construction-time check.
//   5. The order is VALIDATED first (venue dry-run), placed
//      only when validation passes; venue rejections are
//      surfaced verbatim.
//   6. The fill syncs into the order lifecycle: the position
//      opens at the ACTUAL fill price the venue reported —
//      never at the intended entry when the venue says
//      otherwise.
//
// NEVER FINANCIAL ADVICE. The owner owns every decision and
// every credential; this module executes the owner's
// configured policy — it does not originate trades.
// =========================================================

import type { GateDecision } from "../trade-gate.ts";
import type { TradingLimits } from "../trade-gate.ts";
import {
  openPositionFromDecision,
  type LifecycleEvent,
  type LifecycleConfig,
  type Position,
} from "../order-lifecycle.ts";
import type { VenueAdapter, VenueOrderRequest } from "./venue.ts";

export interface ExecutionConfig {
  /** Max age of the gate decision at execution time (ms). */
  maxDecisionAgeMs: number;
  /** Owner's per-session live-money authorization. Required
   *  when the adapter is MAINNET — independent of the
   *  adapter's construction-time check. */
  mainnetExecutionAuthorized: boolean;
  /** Lifecycle config (fees) for the opened position. */
  lifecycle: LifecycleConfig;
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxDecisionAgeMs: 15_000,
  mainnetExecutionAuthorized: false,
  lifecycle: { feeBps: 0 },
};

export type ExecutionEventId =
  | "EXECUTION_REFUSED"
  | "EXECUTION_VALIDATED"
  | "EXECUTION_PLACED"
  | "EXECUTION_REJECTED";

export interface ExecutionEvent {
  atMs: number;
  id: ExecutionEventId;
  detail: string;
}

export interface ExecutionResult {
  executed: boolean;
  position: Position | null;
  reason: string | null;
  events: ExecutionEvent[];
  /** The venue's raw response — never summarized into a guess. */
  venueRaw: unknown;
}

export function executeDecision(
  decision: GateDecision,
  limits: TradingLimits,
  adapter: VenueAdapter,
  nowMs: number,
  config: ExecutionConfig = DEFAULT_EXECUTION_CONFIG,
): Promise<ExecutionResult> {
  const events: ExecutionEvent[] = [];
  const refuse = (reason: string): ExecutionResult => ({
    executed: false,
    position: null,
    reason,
    venueRaw: null,
    events: [
      ...events,
      { atMs: nowMs, id: "EXECUTION_REFUSED", detail: reason },
    ],
  });

  // 1 — emergency stop (defense in depth: the gate checked,
  //     execution checks again)
  if (limits.emergencyStop) {
    return Promise.resolve(
      refuse(
        "OWNER EMERGENCY STOP IS ENGAGED — execution refused. Safety controls are never bypassed for task completion.",
      ),
    );
  }

  // 2 — only eligible decisions execute
  if (!decision.eligible) {
    const failed = decision.checks
      .filter((c) => !c.passed)
      .map((c) => c.id)
      .join(", ");
    return Promise.resolve(
      refuse(
        `gate decision is INELIGIBLE — failed checks: ${failed}. An ineligible decision can never execute.`,
      ),
    );
  }

  // 3 — stale decisions never execute
  const age = nowMs - Date.parse(decision.decidedAt);
  if (!Number.isFinite(age) || age < 0 || age > config.maxDecisionAgeMs) {
    return Promise.resolve(
      refuse(
        `gate decision is STALE (${Number.isFinite(age) ? Math.round(age / 1000) : "?"}s old, limit ${Math.round(config.maxDecisionAgeMs / 1000)}s) — the market data it was based on may no longer describe the market.`,
      ),
    );
  }

  // 4 — MAINNET needs the owner's per-session authorization
  if (adapter.mode === "MAINNET" && !config.mainnetExecutionAuthorized) {
    return Promise.resolve(
      refuse(
        `venue adapter is MAINNET but live-money execution is NOT authorized for this session. The owner must authorize mainnet execution explicitly — this refusal is a safety control, not an error.`,
      ),
    );
  }

  // 5 — size the order from the decision (quote notional →
  //     base quantity at the intended entry)
  const req = decision.request;
  if (req.entryPrice <= 0) {
    return Promise.resolve(
      refuse(
        `intended entry price ${req.entryPrice} is not positive — cannot size the order.`,
      ),
    );
  }
  const quantity = req.positionSizeQuote / req.entryPrice;
  const order: VenueOrderRequest = {
    symbol: req.symbol,
    side: req.direction === "long" ? "BUY" : "SELL",
    quantity,
    authorizedByDecisionId: `${req.symbol}@${decision.decidedAt}`,
  };

  return (async () => {
    // 5a — PRE-FLIGHT BALANCE CHECK: refuse before the venue
    //     is touched when the balance cannot cover the order.
    //     A balance read failure also refuses — never bypass.
    const [base, quote] = req.symbol.split("-").map((x) => x.toUpperCase());
    let balances;
    try {
      balances = await adapter.getBalances();
    } catch (err) {
      return refuse(
        `pre-flight balance check FAILED on ${adapter.venue} (${err instanceof Error ? err.message : "unknown error"}) — execution refuses rather than bypass the check.`,
      );
    }
    const needed = req.direction === "long" ? quote : base;
    const neededAmount =
      req.direction === "long" ? req.positionSizeQuote : quantity;
    const balance = balances.find((b) => b.asset === needed);
    if (!balance || balance.free < neededAmount) {
      return refuse(
        `pre-flight balance check REFUSED: need ${neededAmount} ${needed ?? "?"} free, have ${balance?.free ?? 0}. The order never reached the venue.`,
      );
    }

    // 5b — validate WITHOUT executing
    const validation = await adapter.validateOrder(order);
    if (!validation.ok) {
      const result: ExecutionResult = {
        executed: false,
        position: null,
        reason:
          "venue validation REJECTED the order — the venue's raw response is attached; rejections are surfaced verbatim, never guessed around.",
        venueRaw: validation.raw,
        events: [
          ...events,
          {
            atMs: nowMs,
            id: "EXECUTION_REJECTED",
            detail: `venue ${adapter.venue} (${adapter.mode}) rejected validation for ${req.symbol} ${order.side}`,
          },
        ],
      };
      return result;
    }
    events.push({
      atMs: nowMs,
      id: "EXECUTION_VALIDATED",
      detail: `venue ${adapter.venue} (${adapter.mode}) validated ${req.symbol} ${order.side} qty ${quantity} (dry-run, not executed)`,
    });

    // 5c — place for real
    const placement = await adapter.placeMarketOrder(order);
    if (!placement.ok || placement.orderId === null) {
      return {
        executed: false,
        position: null,
        reason:
          "venue placement FAILED after successful validation — no position was opened. The venue's raw response is attached.",
        venueRaw: placement.raw,
        events: [
          ...events,
          {
            atMs: nowMs,
            id: "EXECUTION_REJECTED",
            detail: `venue ${adapter.venue} (${adapter.mode}) rejected placement for ${req.symbol} ${order.side}`,
          },
        ],
      } satisfies ExecutionResult;
    }
    events.push({
      atMs: nowMs,
      id: "EXECUTION_PLACED",
      detail: `venue ${adapter.venue} (${adapter.mode}) filled order ${placement.orderId} for ${req.symbol} ${order.side}${placement.filledPrice !== null ? ` at avg ${placement.filledPrice}` : " (fill price not reported by venue)"}`,
    });

    // 6 — sync the lifecycle: the position opens at the
    //     ACTUAL fill price when the venue reported one
    const open = openPositionFromDecision(decision, nowMs, config.lifecycle);
    let position = open.position;
    if (
      position &&
      placement.filledPrice !== null &&
      placement.filledPrice > 0
    ) {
      position = {
        ...position,
        entryPrice: placement.filledPrice,
      };
    }
    return {
      executed: true,
      position,
      reason: null,
      events,
      venueRaw: placement.raw,
    } satisfies ExecutionResult;
  })();
}

/** Emergency path: cancel ALL open orders on the venue for
 *  the given symbols. Reports honestly per symbol. */
export async function emergencyCancelAll(
  adapter: VenueAdapter,
  symbols: string[],
  nowMs: number,
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];
  for (const symbol of symbols) {
    try {
      const res = await adapter.cancelAllOpenOrders(symbol);
      events.push({
        atMs: nowMs,
        id: "POSITION_CLOSED",
        positionId: null,
        detail: `EMERGENCY CANCEL ${symbol}: ${res.ok ? "ok" : "FAILED"} — ${res.cancelled} open order(s) cancelled on ${adapter.venue} (${adapter.mode})`,
      });
    } catch (err) {
      events.push({
        atMs: nowMs,
        id: "POSITION_CLOSED",
        positionId: null,
        detail: `EMERGENCY CANCEL ${symbol}: THREW — ${err instanceof Error ? err.message : "unknown error"}. The failure is reported, never hidden.`,
      });
    }
  }
  return events;
}
