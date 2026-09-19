// Supabase Edge Function: archie-trading
// =========================================================
// ARCHIE TRADING SURFACE (batch 20, fix 65, 2026-09-15)
//
// The ONLY sanctioned HTTP entrypoint for trading through
// the audited native engine stack:
//
//   trade-gate  -> exchange execution -> order lifecycle
//   -> portfolio
//
// The engines have existed (with full test coverage) since
// the Phase 8 build; this function is their first runtime
// surface. HARD RULES (mirrored from the engines):
//
//   * Owner/Admin ONLY (JWT -> profile role 'admin'), same
//     authority model as archie-crypto. archie-crypto refuses
//     financial actions by design; THIS function is the one
//     place trading may run -- and only through the gate.
//   * Venue credentials come from the secret store ONLY
//     (executionAdapterFromEnv). No credentials -> no
//     adapter -> no execution, with the honest reason string.
//   * TESTNET by default; MAINNET requires the owner secret
//     BINANCE_MAINNET_AUTHORIZED=true AND a fresh
//     per-request mainnet_execution_authorized=true from the
//     owner. Both are enforced by the engine itself.
//   * SAFE DEFAULTS in the state table: trading disabled,
//     emergency stop ENGAGED -- until the owner enables.
//   * Every trade request carries PredictionEvidence and is
//     evaluated by the FULL trade-gate (11 checks). An
//     ineligible decision cannot execute -- no override
//     exists anywhere, including here.
//   * Evidence entered through this surface is
//     MANUALLY-PROVIDED by the owner and is labeled as such
//     in the persisted caveats. Never presented as model
//     output.
//   * Positions are persisted by the service role only --
//     a human cannot fabricate trading history.
//   * Raw venue responses are NOT persisted (only redacted
//     fill detail) and secrets are never logged or echoed.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import { executionAdapterFromEnv } from "../_shared/archie-ai/native-engine/crypto/exchange/boot.ts";
import {
  DEFAULT_TRADING_LIMITS,
  evaluateTradeGate,
  renderGateDecision,
  type TradingLimits,
  type TradeRequest,
} from "../_shared/archie-ai/native-engine/crypto/trade-gate.ts";
import {
  DEFAULT_EXECUTION_CONFIG,
  executeDecision,
  emergencyCancelAll,
} from "../_shared/archie-ai/native-engine/crypto/exchange/execution.ts";
import {
  closedTrades,
  exposureReport,
  tradeStats,
} from "../_shared/archie-ai/native-engine/crypto/portfolio.ts";
import type { Position } from "../_shared/archie-ai/native-engine/crypto/order-lifecycle.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// REST helper with BOTH apikey + bearer (Kong requirement,
// same convention as archie-crypto fix 27).
async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      data: null,
      error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  return { data: body as T, error: null };
}

interface TradingStateRow {
  emergency_stop: boolean;
  trading_enabled: boolean;
  limits: Partial<TradingLimits> | null;
}

async function readState(): Promise<TradingStateRow> {
  // SAFE DEFAULTS if the row is absent: stop engaged,
  // trading disabled. Never guess into a permissive state.
  const r = await service<TradingStateRow[]>(
    "/rest/v1/frelux_archie_trading_state?id=eq.owner&select=emergency_stop,trading_enabled,limits",
  );
  const row = Array.isArray(r.data) ? r.data[0] : null;
  return {
    emergency_stop: row?.emergency_stop ?? true,
    trading_enabled: row?.trading_enabled ?? false,
    limits: row?.limits ?? null,
  };
}

async function writeState(patch: Record<string, unknown>) {
  // Upsert the single 'owner' row (service role only).
  const r = await service("/rest/v1/frelux_archie_trading_state", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: "owner", ...patch }),
  });
  if (r.error) return r.error;
  return null;
}

function limitsFor(state: TradingStateRow): TradingLimits {
  // Merge stored limits over defaults; unknown keys are
  // ignored by the spread of known structure.
  const stored = state.limits ?? {};
  const merged: TradingLimits = {
    ...DEFAULT_TRADING_LIMITS,
    ...stored,
  };
  // BUG FIX (found by test batch, 2026-09-15): the owner
  // switches are AUTHORITATIVE and must override any stale or
  // drifted limits JSON, or the console's emergency_stop /
  // trading_enabled toggles would have no effect on the trade
  // gate (the gate previously read only DEFAULT_TRADING_LIMITS
  // spread with the limits column, so an engaged emergency
  // stop still let trades pass). Fail closed: an absent state
  // row means stop engaged + trading disabled (readState).
  merged.emergencyStop =
    Boolean(merged.emergencyStop) || state.emergency_stop === true;
  merged.tradingEnabled =
    Boolean(merged.tradingEnabled) && state.trading_enabled !== false;
  return merged;
}

// ---- manually-provided evidence (owner-entered) ----
interface EvidenceInput {
  probability: number;
  calibratedProbability: number;
  confidence: number;
  validation: {
    samples: number;
    hitRate: number | null;
    brier: number | null;
    meanPredicted?: number | null;
    baseRate?: number | null;
  };
  dataQuality: {
    crossVenueAnomaly: boolean;
    venuesReporting: number;
    analysisAnomalies?: string[];
    dataAgeMs: number | null;
  };
  features?: Partial<{
    f_trend: number;
    f_rsi: number;
    f_macd: number;
    f_momentum: number;
    f_volatility: number;
    f_volume: number;
  }>;
  caveats?: string[];
}

const MANUAL_EVIDENCE_CAVEAT =
  "evidence manually provided by the owner through the trading console -- not model output";

function buildManualPrediction(
  request: TradeRequest,
  evidence: EvidenceInput,
): {
  probability: number;
  calibratedProbability: number;
  confidence: number;
  features: unknown;
  raw: unknown;
  validation: EvidenceInput["validation"];
  dataQuality: EvidenceInput["dataQuality"];
  caveats: string[];
  createdAt: string;
} {
  const f = evidence.features ?? {};
  return {
    symbol: request.symbol,
    direction: request.direction,
    probability: evidence.probability,
    calibratedProbability: evidence.calibratedProbability,
    confidence: evidence.confidence,
    features: {
      symbol: request.symbol,
      direction: request.direction,
      f_trend: f.f_trend ?? 0,
      f_rsi: f.f_rsi ?? 0,
      f_macd: f.f_macd ?? 0,
      f_momentum: f.f_momentum ?? 0,
      f_volatility: f.f_volatility ?? 0,
      f_volume: f.f_volume ?? 0,
    },
    raw: {
      trend: "manually entered",
      rsi14: null,
      macdHistogram: null,
      momentumPct10: null,
      realizedVolatilityPct: null,
      volumeZScore: null,
    },
    validation: evidence.validation,
    dataQuality: {
      crossVenueAnomaly: evidence.dataQuality.crossVenueAnomaly,
      venuesReporting: evidence.dataQuality.venuesReporting,
      analysisAnomalies: evidence.dataQuality.analysisAnomalies ?? [],
      dataAgeMs: evidence.dataQuality.dataAgeMs,
    },
    caveats: [...(evidence.caveats ?? []), MANUAL_EVIDENCE_CAVEAT],
    createdAt: new Date().toISOString(),
  };
}

// ---- request validation (fail closed) ----
function parseTradeRequest(raw: Record<string, unknown>): TradeRequest | null {
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const symbol =
    typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
  const direction =
    raw.direction === "long" || raw.direction === "short"
      ? raw.direction
      : null;
  const entryPrice = num(raw.entryPrice);
  const stopPrice = num(raw.stopPrice);
  const targetPrice = num(raw.targetPrice);
  const positionSizeQuote = num(raw.positionSizeQuote);
  const portfolioValueQuote = num(raw.portfolioValueQuote);
  if (
    !symbol ||
    !direction ||
    entryPrice === null ||
    stopPrice === null ||
    targetPrice === null ||
    positionSizeQuote === null ||
    portfolioValueQuote === null ||
    positionSizeQuote <= 0 ||
    portfolioValueQuote <= 0
  ) {
    return null;
  }
  return {
    symbol,
    direction,
    entryPrice,
    stopPrice,
    targetPrice,
    positionSizeQuote,
    portfolioValueQuote,
  };
}

function parseEvidence(raw: Record<string, unknown>): EvidenceInput | null {
  try {
    if (
      typeof raw.probability !== "number" ||
      typeof raw.calibratedProbability !== "number" ||
      typeof raw.confidence !== "number" ||
      typeof raw.validation !== "object" ||
      raw.validation === null ||
      typeof raw.dataQuality !== "object" ||
      raw.dataQuality === null
    ) {
      return null;
    }
    const v = raw.validation as Record<string, unknown>;
    if (typeof v.samples !== "number") return null;
    const dq = raw.dataQuality as Record<string, unknown>;
    if (typeof dq.venuesReporting !== "number") return null;
    return {
      probability: raw.probability,
      calibratedProbability: raw.calibratedProbability,
      confidence: raw.confidence,
      validation: {
        samples: v.samples,
        hitRate: typeof v.hitRate === "number" ? v.hitRate : null,
        brier: typeof v.brier === "number" ? v.brier : null,
      },
      dataQuality: {
        crossVenueAnomaly: dq.crossVenueAnomaly === true,
        venuesReporting: dq.venuesReporting,
        analysisAnomalies: Array.isArray(dq.analysisAnomalies)
          ? (dq.analysisAnomalies.filter(
              (a) => typeof a === "string",
            ) as string[])
          : [],
        dataAgeMs: typeof dq.dataAgeMs === "number" ? dq.dataAgeMs : null,
      },
      caveats: Array.isArray(raw.caveats)
        ? (raw.caveats.filter((c) => typeof c === "string") as string[])
        : [],
    };
  } catch {
    return null;
  }
}

// ---- persisted positions -> engine Position objects ----
interface PositionRow {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  position_size_quote: number;
  portfolio_value_quote: number;
  opened_at_ms: number;
  state: "OPEN" | "CLOSED";
  status: string;
  exit_price: number | null;
  closed_at_ms: number | null;
  realized_pnl_quote: number | null;
  realized_pnl_pct: number | null;
  fees_paid_quote: number;
}

function rowToPosition(r: PositionRow): Position {
  return {
    id: r.id,
    symbol: r.symbol,
    direction: r.direction,
    entryPrice: Number(r.entry_price),
    stopPrice: Number(r.stop_price),
    targetPrice: Number(r.target_price),
    positionSizeQuote: Number(r.position_size_quote),
    portfolioValueQuote: Number(r.portfolio_value_quote),
    openedAtMs: Number(r.opened_at_ms),
    state: r.state,
    status: r.status as Position["status"],
    exitPrice: r.exit_price === null ? null : Number(r.exit_price),
    closedAtMs: r.closed_at_ms === null ? null : Number(r.closed_at_ms),
    realizedPnlQuote:
      r.realized_pnl_quote === null ? null : Number(r.realized_pnl_quote),
    realizedPnlPct:
      r.realized_pnl_pct === null ? null : Number(r.realized_pnl_pct),
    feesPaidQuote: Number(r.fees_paid_quote),
  };
}

async function listPositions(): Promise<PositionRow[]> {
  const r = await service<PositionRow[]>(
    "/rest/v1/frelux_archie_trading_positions?order=opened_at_ms.desc&limit=100" +
      "&select=id,symbol,direction,entry_price,stop_price,target_price,position_size_quote,portfolio_value_quote,opened_at_ms,state,status,exit_price,closed_at_ms,realized_pnl_quote,realized_pnl_pct,fees_paid_quote",
  );
  return Array.isArray(r.data) ? r.data : [];
}

function redactVenue(venueRaw: unknown): Record<string, unknown> {
  // Never persist the raw venue response. Keep only the
  // redacted fill/order identifiers.
  if (typeof venueRaw !== "object" || venueRaw === null) {
    return { persisted: "no venue detail (refused or unknown)" };
  }
  const v = venueRaw as Record<string, unknown>;
  return {
    orderId: typeof v.orderId === "string" ? v.orderId : null,
    fillPrice: typeof v.fillPrice === "number" ? v.fillPrice : null,
    fillQty: typeof v.fillQty === "number" ? v.fillQty : null,
    persisted: "redacted -- raw venue response not stored",
  };
}

// =========================================================
// Handler
// =========================================================
serveWithCors(async (req: Request) => {
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only." });

  // ---- authentication + owner/admin authorization ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "Invalid session." });

  const { data: profile } = await service<{ role: string }>(
    `/rest/v1/profiles?id=eq.${auth.user.id}&select=role`,
  ).then((r) =>
    Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r,
  );
  if (profile?.role !== "admin") {
    return json(403, {
      error:
        "Trading is Owner/Admin-only. Financial execution is never available to non-owner accounts.",
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const action = String(payload.action ?? "");
  const nowMs = Date.now();

  // ---- action: status (venue boot + owner state + counts) ----
  if (action === "status") {
    const boot = executionAdapterFromEnv(Deno.env.toObject());
    const state = await readState();
    const positions = await listPositions();
    const enginePositions = positions.map(rowToPosition);
    const closed = closedTrades(enginePositions);
    return json(200, {
      venue: {
        configured: boot.adapter !== null,
        venue: boot.adapter?.venue ?? null,
        mode: boot.adapter?.mode ?? null,
        reason: boot.adapter === null ? boot.reason : null,
      },
      // Credential presence flags -- NEVER the values.
      credentials: {
        api_key_provisioned: Boolean(Deno.env.get("BINANCE_API_KEY")),
        api_secret_provisioned: Boolean(Deno.env.get("BINANCE_API_SECRET")),
        mode: Deno.env.get("BINANCE_MODE") ?? "TESTNET (default)",
        mainnet_authorized_by_secret:
          Deno.env.get("BINANCE_MAINNET_AUTHORIZED") === "true",
      },
      state: {
        emergency_stop: state.emergency_stop,
        trading_enabled: state.trading_enabled,
        limits: limitsFor(state),
      },
      portfolio: {
        total_positions: enginePositions.length,
        open_positions: enginePositions.filter((p) => p.state === "OPEN")
          .length,
        closed_positions: closed.length,
        stats: tradeStats(enginePositions),
        exposure: exposureReport(enginePositions),
      },
    });
  }

  // ---- action: set_state (emergency stop / enable toggles) ----
  if (action === "set_state") {
    const patch: Record<string, unknown> = {};
    if (typeof payload.emergency_stop === "boolean") {
      patch.emergency_stop = payload.emergency_stop;
    }
    if (typeof payload.trading_enabled === "boolean") {
      patch.trading_enabled = payload.trading_enabled;
    }
    if (Object.keys(patch).length === 0) {
      return json(400, {
        error: "set_state requires emergency_stop or trading_enabled.",
      });
    }
    patch.updated_date = new Date().toISOString();
    const err = await writeState(patch);
    if (err) return json(500, { error: `state write failed: ${err}` });
    const state = await readState();
    return json(200, {
      ok: true,
      state: {
        emergency_stop: state.emergency_stop,
        trading_enabled: state.trading_enabled,
        limits: limitsFor(state),
      },
    });
  }

  // ---- action: dry_run (full gate evaluation, NO execution) ----
  if (action === "dry_run") {
    const request = parseTradeRequest(
      (payload.request ?? {}) as Record<string, unknown>,
    );
    const evidence = parseEvidence(
      (payload.evidence ?? {}) as Record<string, unknown>,
    );
    if (!request || !evidence) {
      return json(400, {
        error:
          "dry_run requires a valid request (symbol, direction, entryPrice, stopPrice, targetPrice, positionSizeQuote, portfolioValueQuote) and evidence (probability, calibratedProbability, confidence, validation.samples, dataQuality.venuesReporting).",
      });
    }
    const state = await readState();
    const limits = limitsFor(state);
    const prediction = buildManualPrediction(request, evidence);
    // Recapture the clock AFTER building the prediction:
    // createdAt is stamped inside buildManualPrediction, and if
    // it lands a few ms after the pre-captured nowMs the
    // data_fresh check (age >= 0) fails for genuinely fresh
    // evidence — a race that flipped eligible trades on slow
    // ticks. Found by the full-suite run, 2026-09-15.
    const decision = evaluateTradeGate(request, prediction, limits, Date.now());
    return json(200, {
      dry_run: true,
      eligible: decision.eligible,
      decision,
      report: renderGateDecision(decision),
      note: "dry run only -- no order was sent to any venue. Execution requires the execute action with venue credentials provisioned.",
    });
  }

  // ---- action: execute (gate -> executeDecision -> persist) ----
  if (action === "execute") {
    const boot = executionAdapterFromEnv(Deno.env.toObject());
    if (boot.adapter === null) {
      return json(409, {
        error: boot.reason,
        hint: "Provision BINANCE_API_KEY / BINANCE_API_SECRET (and optionally BINANCE_MODE / BINANCE_MAINNET_AUTHORIZED) through the platform secrets flow. ARCHIE never hardcodes keys.",
      });
    }
    const request = parseTradeRequest(
      (payload.request ?? {}) as Record<string, unknown>,
    );
    const evidence = parseEvidence(
      (payload.evidence ?? {}) as Record<string, unknown>,
    );
    if (!request || !evidence) {
      return json(400, {
        error: "execute requires a valid request and evidence payload.",
      });
    }
    const state = await readState();
    const limits = limitsFor(state);
    const prediction = buildManualPrediction(request, evidence);
    // Same race as dry_run — recapture AFTER prediction creation.
    const decision = evaluateTradeGate(request, prediction, limits, Date.now());

    if (!decision.eligible) {
      // An ineligible decision is reported, never executed --
      // and never silently swallowed.
      return json(200, {
        executed: false,
        decision,
        report: renderGateDecision(decision),
        reason:
          "the trade gate refused this trade. There is no override -- adjust the request or the evidence, or do not trade.",
      });
    }

    const config = {
      ...DEFAULT_EXECUTION_CONFIG,
      mainnetExecutionAuthorized: payload.mainnet_execution_authorized === true,
    };
    const result = await executeDecision(
      decision,
      limits,
      boot.adapter,
      nowMs,
      config,
    );

    // Persist the position (service role only) when opened.
    if (result.executed && result.position) {
      const p = result.position;
      const insertErr = await service(
        "/rest/v1/frelux_archie_trading_positions",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            id: p.id,
            symbol: p.symbol,
            direction: p.direction,
            entry_price: p.entryPrice,
            stop_price: p.stopPrice,
            target_price: p.targetPrice,
            position_size_quote: p.positionSizeQuote,
            portfolio_value_quote: p.portfolioValueQuote,
            opened_at_ms: p.openedAtMs,
            state: p.state,
            status: p.status,
            exit_price: p.exitPrice,
            closed_at_ms: p.closedAtMs,
            realized_pnl_quote: p.realizedPnlQuote,
            realized_pnl_pct: p.realizedPnlPct,
            fees_paid_quote: p.feesPaidQuote,
            gate_decision: decision,
            execution_events: result.events,
            venue_detail: redactVenue(result.venueRaw),
          }),
        },
      );
      if (insertErr.error) {
        return json(500, {
          executed: true,
          position_id: p.id,
          warning:
            `the venue filled the order but persisting the position FAILED: ${insertErr.error}. ` +
            "The position exists on the venue; the local record could not be written.",
          events: result.events,
        });
      }
    }

    return json(200, {
      executed: result.executed,
      reason: result.reason,
      position: result.position,
      events: result.events,
      venue_mode: boot.adapter.mode,
      report: renderGateDecision(decision),
    });
  }

  // ---- action: emergency_cancel (venue-level cancel-all) ----
  if (action === "emergency_cancel") {
    const boot = executionAdapterFromEnv(Deno.env.toObject());
    if (boot.adapter === null) {
      return json(409, {
        error:
          boot.reason +
          " There are no venue orders to cancel through this surface.",
      });
    }
    const symbols = Array.isArray(payload.symbols)
      ? payload.symbols.filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        )
      : [];
    if (symbols.length === 0) {
      return json(400, {
        error: "emergency_cancel requires symbols: string[].",
      });
    }
    // The emergency stop is ALSO engaged as part of an
    // emergency cancel -- cancelling means STOP.
    await writeState({
      emergency_stop: true,
      updated_date: new Date().toISOString(),
    });
    const events = await emergencyCancelAll(boot.adapter, symbols, nowMs);
    return json(200, {
      ok: true,
      emergency_stop_engaged: true,
      events,
      venue_mode: boot.adapter.mode,
    });
  }

  // ---- action: positions / portfolio ----
  if (action === "positions") {
    const positions = await listPositions();
    const enginePositions = positions.map(rowToPosition);
    return json(200, {
      positions: enginePositions,
      stats: tradeStats(enginePositions),
      exposure: exposureReport(enginePositions),
    });
  }

  return json(400, {
    error:
      "Unknown action. Valid: status | set_state | dry_run | execute | emergency_cancel | positions.",
  });
});
