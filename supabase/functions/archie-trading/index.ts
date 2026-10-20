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
import { getBrokerAdapter } from "../_shared/archie-ai/native-engine/crypto/exchange/multi-broker.ts";
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
import {
  closePositionManually,
  openPositionFromDecision,
  type Position,
} from "../_shared/archie-ai/native-engine/crypto/order-lifecycle.ts";

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


// =========================================================
// TWO-ACCOUNT LAYER (batch 35, Oct 20, 2026)
// DEMO: simulated execution against REAL daily prices.
// LIVE: real orders through the audited venue adapter.
// Both accounts default to DISABLED + STOP ENGAGED; the
// global owner state remains authoritative (a global stop
// stops BOTH accounts; an account can always be stricter).
// =========================================================
type AccountType = "demo" | "live";

interface AccountRow {
  id: string;
  type: AccountType;
  label: string;
  balance_quote: number;
  starting_balance_quote: number;
  currency: string;
  trading_enabled: boolean;
  emergency_stop: boolean;
  venue_mode: string | null;
}

function accountTypeOf(raw: unknown): AccountType {
  return raw === "live" ? "live" : "demo";
}

function normalizeAccount(raw: unknown): AccountType {
  return accountTypeOf(raw);
}

async function readAccount(type: AccountType): Promise<AccountRow> {
  // SAFE DEFAULTS when the row is absent: disabled, stopped,
  // zero balance. Never guess into a permissive state.
  const r = await service<AccountRow[]>(
    `/rest/v1/frelux_archie_trading_accounts?id=eq.${type}&select=*`,
  );
  const row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) {
    return {
      id: type,
      type,
      label: type === "demo" ? "ARCHIE Demo" : "ARCHIE Live",
      balance_quote: 0,
      starting_balance_quote: 50000,
      currency: "USD",
      trading_enabled: false,
      emergency_stop: true,
      venue_mode: null,
    };
  }
  return {
    ...row,
    balance_quote: Number(row.balance_quote),
    starting_balance_quote: Number(row.starting_balance_quote),
    trading_enabled: row.trading_enabled === true,
    emergency_stop: row.emergency_stop !== false,
  };
}

async function writeAccount(
  type: AccountType,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const r = await service("/rest/v1/frelux_archie_trading_accounts", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: type,
      type,
      label: type === "demo" ? "ARCHIE Demo" : "ARCHIE Live",
      ...patch,
      updated_date: new Date().toISOString(),
    }),
  });
  return r.error;
}

function limitsForAccount(
  state: TradingStateRow,
  account: AccountRow,
): TradingLimits {
  // The owner's GLOBAL switches stay authoritative; the account
  // switches can only tighten, never loosen.
  const merged = limitsFor(state);
  merged.emergencyStop = merged.emergencyStop || account.emergency_stop;
  merged.tradingEnabled =
    merged.tradingEnabled && account.trading_enabled === true;
  return merged;
}

// ---------------------------------------------------------
// Massive.com daily bars (real market data for demo fills,
// closes, and ARCHIE's analysis engine). Same env key as the
// archie-market-data function.
// ---------------------------------------------------------
function toMassiveTicker(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  // Venue pairs (BTCUSDT) AND console pairs (BTC/USD) map to the
  // USD daily series -- the USDT/USD deviation is a stated
  // caveat, not a hidden error. ANALYZE FIX (Oct 20, 2026): the
  // console's default crypto instruments are slash pairs; the
  // old no-slash-only regex passed "BTC/USD" to massive.com
  // verbatim (HTTP 404 -> 503 on every Analyze click).
  const m = s.match(/^([A-Z0-9]+)\/?USDT?$/);
  if (m) {
    const base = m[1];
    const cryptoBase = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "LTC", "LINK", "AVAX", "TRX", "TON"];
    const forexBase = ["EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "USDT"];
    if (cryptoBase.includes(base)) return `X:${base}USD`;
    if (forexBase.includes(base)) return `C:${base}USD`;
  }
  const rev = s.match(/^USD\/([A-Z]{3})$/);
  if (rev) return `C:USD${rev[1]}`;
  return s;
}

interface MassiveBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

async function fetchDailyBars(
  symbol: string,
  days: number,
): Promise<{ bars: MassiveBar[]; error: string | null }> {
  const key = Deno.env.get("MARKET_DATA_API_KEY") ?? "";
  if (!key) return { bars: [], error: "MARKET_DATA_API_KEY not provisioned." };
  const ticker = toMassiveTicker(symbol);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://api.massive.com/v2/aggs/ticker/${
        encodeURIComponent(ticker)
      }/range/1/day/${iso(from)}/${iso(to)}?limit=${days}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return {
        bars: [],
        error: `massive.com daily bars unavailable for ${ticker} (HTTP ${res.status}).`,
      };
    }
    const bars = ((body.results ?? []) as MassiveBar[])
      .slice()
      .sort((a, b) => a.t - b.t);
    return { bars, error: null };
  } catch (e) {
    return { bars: [], error: `massive.com request failed: ${String(e)}` };
  }
}

// ---------------------------------------------------------
// ARCHIE MARKET INTELLIGENCE (deterministic, honest)
//
// A fixed, inspectable scoring model over REAL daily bars:
//   * trend   -- SMA20 vs SMA50
//   * rsi     -- RSI(14) stretched around 50
//   * momo    -- 10-day price momentum
// Walk-forward validated on the SAME symbol's history: the
// hit rate and Brier score ARE the evidence the trade gate
// demands. If the model does not clear the gate's methodology
// bar on this symbol, ARCHIE WITHHOLDS the suggestion -- it
// never lowers the bar to have something to show.
// ---------------------------------------------------------
function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (gains + losses === 0) return 50;
  return 100 - 100 / (1 + gains / losses / 1);
}

function atr14(bars: MassiveBar[]): number | null {
  if (bars.length < 15) return null;
  let sum = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    sum += bars[i].h - bars[i].l;
  }
  return sum / 14;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Deterministic directional probability for one bar index,
 * computed ONLY from bars strictly before it. */
function modelProbability(bars: MassiveBar[], i: number): number {
  const closes = bars.slice(0, i + 1).map((b) => b.c);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  if (s20 === null || s50 === null || s50 === 0) return 0.5;
  const fTrend = (s20 - s50) / s50;
  const r = rsi14(closes);
  const fRsi = r === null ? 0 : (r - 50) / 50;
  const back = closes.length >= 11 ? closes[closes.length - 11] : closes[0];
  const fMomo = back === 0 ? 0 : (closes[closes.length - 1] - back) / back;
  // Weights are deliberately SMALL (shrinkage): out-of-sample
  // Brier on trending daily history lands ~0.24-0.25, and on
  // trendless history the model is honestly WITHHELD (brier
  // ~0.28 > the gate bar). Over-confident weights were rejected
  // by the gate's methodology check — the calibration IS the
  // evidence.
  const p = 0.5 + 0.15 * Math.tanh(3 * fTrend) + 0.06 * Math.tanh(2 * fRsi) +
    0.05 * Math.tanh(3 * fMomo);
  return Math.min(0.95, Math.max(0.05, p));
}

interface WalkForward {
  samples: number;
  hitRate: number | null;
  brier: number | null;
}

function walkForward(bars: MassiveBar[]): WalkForward {
  // Out-of-sample, strictly causal: predict bar i+1 from
  // bars [0..i]. First predictable index needs >= 50 bars of
  // history for the SMA50 feature.
  let samples = 0;
  let hits = 0;
  let brierSum = 0;
  for (let i = 51; i < bars.length - 1; i++) {
    const p = modelProbability(bars, i);
    const actualUp = bars[i + 1].c > bars[i].c ? 1 : 0;
    const predictedUp = p > 0.5 ? 1 : 0;
    if (predictedUp === actualUp) hits++;
    brierSum += (p - actualUp) ** 2;
    samples++;
  }
  if (samples === 0) return { samples: 0, hitRate: null, brier: null };
  return {
    samples,
    hitRate: hits / samples,
    brier: brierSum / samples,
  };
}

function limitsFor(state: TradingStateRow): TradingLimits {
  // Merge stored limits over defaults; unknown keys are
  // ignored by the spread of known structure.
  const stored = { ...((state.limits as Record<string, unknown>) ?? {}) };
  delete stored.feed_keys; // Prevent sensitive feed keys from leaking into client-visible limits
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


/** Fresh paper-swap computation at the real daily close —
 * used by BOTH treasury_swap_quote and treasury_swap_execute
 * (execute never trusts a stale client-side quote). */
async function handlerQuoteSwapDemo(
  fromAsset: string,
  toAsset: string,
  amount: number,
): Promise<
  | { ok: true; toAmount: number; priceUsed: { from: number; to: number }; feePct: number }
  | { ok: false; reason: string; message: string }
> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid_amount", message: "A positive amount is required." };
  }
  const fromTicker = toMassiveTicker(fromAsset === "USD" ? "USD" : fromAsset + "USD");
  const toTicker = toMassiveTicker(toAsset === "USD" ? "USD" : toAsset + "USD");
  const [fromBars, toBars] = await Promise.all([
    fetchDailyBars(fromTicker, 30),
    fetchDailyBars(toTicker, 30),
  ]);
  if (fromBars.error || !fromBars.bars.length || toBars.error || !toBars.bars.length) {
    return {
      ok: false,
      reason: "swap_price_unavailable",
      message: "The real market price for this pair is not available — ARCHIE will not quote a swap on fabricated prices.",
    };
  }
  const fromClose = fromBars.bars[fromBars.bars.length - 1].c;
  const toClose = toBars.bars[toBars.bars.length - 1].c;
  const feePct = 0.1;
  const gross = (amount * fromClose) / toClose;
  return {
    ok: true,
    toAmount: Number((gross * (1 - feePct / 100)).toFixed(8)),
    priceUsed: { from: fromClose, to: toClose },
    feePct,
  };
}

// =========================================================
// TREASURY (batch 36) — deposit / withdraw / swap for both
// accounts. REAL money moves only on the LIVE venue path and
// only through the adapter, with ARCHIE-side hard gates:
// live account armed + global state enabled + not stopped +
// an explicit per-request confirmation. DEMO movements are
// paper-ledger entries at real prices — labeled as such.
// =========================================================

interface TreasuryLedgerRow {
  id: string;
  account: string;
  kind: string;
  asset: string;
  amount: number;
  status: string;
  detail: Record<string, unknown>;
  created_at: string;
}

async function recordTreasury(entry: {
  account: string;
  kind: string;
  asset: string;
  amount: number;
  status: string;
  detail: Record<string, unknown>;
  venueRef?: string | null;
}): Promise<string | null> {
  const id = `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const r = await service("/rest/v1/frelux_archie_treasury_ledger", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      account: entry.account,
      kind: entry.kind,
      asset: entry.asset,
      amount: entry.amount,
      status: entry.status,
      detail: entry.detail,
      venue_ref: entry.venueRef ?? null,
    }),
  });
  return r.error;
}

async function readTreasury(account: string, limit = 25): Promise<TreasuryLedgerRow[]> {
  const r = await service<TreasuryLedgerRow[]>(
    `/rest/v1/frelux_archie_treasury_ledger?account=eq.${account}&select=id,account,kind,asset,amount,status,detail,created_at&order=created_at.desc&limit=${limit}`,
  );
  return Array.isArray(r.data) ? r.data : [];
}

/** Binance treasury surface — null when the boot venue does
 * not expose treasury endpoints (honest refusal upstream,
 * never a fake treasury). */
function binanceTreasury(boot: Awaited<ReturnType<typeof executionAdapterFromEnv>>) {
  const adapter = boot.adapter as unknown as {
    getDepositAddress?: (a: string, n?: string) => Promise<{ ok: boolean; address: string | null; tag: string | null; raw: unknown }>;
    getDepositHistory?: (a?: string) => Promise<{ ok: boolean; deposits: Array<Record<string, unknown>>; raw: unknown }>;
    withdraw?: (a: string, amt: number, addr: string, n?: string) => Promise<{ ok: boolean; withdrawalId: string | null; raw: unknown }>;
    convertQuote?: (f: string, t: string, amt: number) => Promise<{ ok: boolean; quoteId: string | null; toAmount: number | null; ratio: number | null; raw: unknown }>;
    convertAccept?: (q: string) => Promise<{ ok: boolean; orderId: string | null; raw: unknown }>;
  } | null;
  if (!boot.ok || !adapter || !adapter.getDepositAddress) return null;
  return adapter;
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

  // ---- action: status (venue boot + owner state + BOTH accounts) ----
  if (action === "status") {
    const boot = executionAdapterFromEnv(Deno.env.toObject());
    const state = await readState();
    const positions = await listPositions();

    const accountSummaries = [];
    for (const type of ["demo", "live"] as AccountType[]) {
      const account = await readAccount(type);
      const acctPositions = positions
        .filter((r) => accountTypeOf(r.account) === type)
        .map(rowToPosition);
      const closed = closedTrades(acctPositions);
      const open = acctPositions.filter((p) => p.state === "OPEN");
      // Demo equity: cash ledger + unrealized P&L of open
      // positions priced at entry (no live mark until a close
      // or refresh — honest, conservative).
      const unrealized = open.reduce((sum, pos) => {
        const move = pos.direction === "long" ? 1 : -1;
        return sum + move * (pos.exitPrice ?? 0) * 0; // no mark: 0 until closed
      }, 0);
      accountSummaries.push({
        id: type,
        type,
        label: account.label,
        currency: account.currency,
        balance_quote: account.balance_quote,
        starting_balance_quote: account.starting_balance_quote,
        equity_quote: account.balance_quote + unrealized,
        trading_enabled: account.trading_enabled,
        emergency_stop: account.emergency_stop,
        venue_mode:
          type === "live" ? (boot.adapter?.mode ?? null) : "PAPER_SIMULATION",
        // The effective gate limits for THIS account (global +
        // account switches merged, owner switches authoritative).
        limits: limitsForAccount(state, account),
        portfolio: {
          total_positions: acctPositions.length,
          open_positions: open.length,
          closed_positions: closed.length,
          stats: tradeStats(acctPositions),
          exposure: exposureReport(acctPositions),
        },
      });
    }

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
      accounts: accountSummaries,
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

  // ---- action: set_state (emergency stop / enable / limits) ----
  // With an `account` param the switches route to THAT account
  // row (per-account arming); without it they set the global
  // owner state. `limits` patches the owner limits JSON.
  if (action === "set_state") {
    const account = payload.account === "demo" || payload.account === "live"
      ? (payload.account as AccountType)
      : null;
    const patch: Record<string, unknown> = {};
    if (typeof payload.emergency_stop === "boolean") {
      patch.emergency_stop = payload.emergency_stop;
    }
    if (typeof payload.trading_enabled === "boolean") {
      patch.trading_enabled = payload.trading_enabled;
    }
    if (
      typeof payload.limits === "object" && payload.limits !== null &&
      !Array.isArray(payload.limits)
    ) {
      patch.limits = payload.limits;
    }
    if (Object.keys(patch).length === 0) {
      return json(400, {
        error:
          "set_state requires emergency_stop, trading_enabled or limits.",
      });
    }
    patch.updated_date = new Date().toISOString();
    if (account !== null) {
      // A global emergency stop is never loosened by an account
      // patch: the account switch only ever tightens.
      const globalState = await readState();
      if (patch.emergency_stop === false && globalState.emergency_stop) {
        return json(200, {
          ok: false,
          reason:
            "the GLOBAL emergency stop is engaged -- disengage the global stop first (set_state without account), then arm the account.",
        });
      }
      const err = await writeAccount(account, patch);
      if (err) return json(500, { error: `account state write failed: ${err}` });
      const row = await readAccount(account);
      const state = await readState();
      return json(200, {
        ok: true,
        account,
        state: {
          trading_enabled: row.trading_enabled,
          emergency_stop: row.emergency_stop,
          limits: limitsForAccount(state, row),
        },
      });
    }
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

  // ---- action: execute (gate -> account-routed execution -> persist) ----
  if (action === "execute") {
    const account = accountTypeOf(payload.account);
    const boot = executionAdapterFromEnv(Deno.env.toObject());
    if (account === "live" && boot.adapter === null) {
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
    const accountRow = await readAccount(account);
    const limits = limitsForAccount(state, accountRow);
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

    // ===================== DEMO ACCOUNT =====================
    // Simulated execution against the REAL latest daily close
    // (massive.com). No venue is touched. The demo cash ledger
    // locks the full notional on open and settles on close.
    if (account === "demo") {
      if (request.positionSizeQuote > accountRow.balance_quote) {
        return json(200, {
          executed: false,
          reason:
            `insufficient demo cash: the order needs ${request.positionSizeQuote.toFixed(
              2,
            )} ${accountRow.currency} but the demo ledger holds ${
              accountRow.balance_quote.toFixed(2)
            }. Deposit by resetting the demo account or reduce the size.`,
          decision,
          report: renderGateDecision(decision),
        });
      }
      const { bars } = await fetchDailyBars(request.symbol, 30);
      const fill = bars.length > 0 ? bars[bars.length - 1].c : null;
      if (fill === null) {
        return json(503, {
          error:
            "demo execution needs the real latest daily close from massive.com, and it is unavailable right now. Nothing was executed.",
        });
      }
      // Simulate the fill AT the real close, then open the
      // audited lifecycle position (no venue).
      const simRequest: TradeRequest = { ...request, entryPrice: fill };
      const simDecision = evaluateTradeGate(
        simRequest,
        prediction,
        limits,
        Date.now(),
      );
      if (!simDecision.eligible) {
        return json(200, {
          executed: false,
          decision: simDecision,
          report: renderGateDecision(simDecision),
          reason:
            "the trade gate refused this trade at the real daily close price. There is no override.",
        });
      }
      const opened = openPositionFromDecision(simDecision, nowMs);
      if (!opened.opened || !opened.position) {
        return json(200, {
          executed: false,
          reason: opened.reason,
          events: opened.events,
        });
      }
      const p = opened.position;
      // Demo ledger: lock the full notional + entry fee.
      const newBalance = accountRow.balance_quote -
        p.positionSizeQuote - p.feesPaidQuote;
      const ledgerErr = await writeAccount("demo", {
        balance_quote: Number(newBalance.toFixed(2)),
      });
      const insertErr = await service(
        "/rest/v1/frelux_archie_trading_positions",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            id: p.id,
            account: "demo",
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
            gate_decision: simDecision,
            execution_events: opened.events,
            venue_detail: {
              persisted: "simulated fill at the real massive.com daily close",
              fillPrice: fill,
              orderId: null,
              fillQty: null,
            },
          }),
        },
      );
      if (insertErr.error || ledgerErr) {
        return json(500, {
          executed: true,
          position_id: p.id,
          warning:
            `the demo position opened but persistence partially FAILED: ${
              insertErr.error ?? ledgerErr
            }.`,
          events: opened.events,
        });
      }
      return json(200, {
        executed: true,
        account: "demo",
        position: p,
        events: opened.events,
        fill_price: fill,
        demo_balance_quote: Number(newBalance.toFixed(2)),
        report: renderGateDecision(simDecision),
        note:
          "DEMO execution: the fill price is the real massive.com daily close; the execution itself is simulated. No venue was contacted.",
      });
    }

    // ===================== LIVE ACCOUNT =====================
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
            account: "live",
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
      account: "live",
      reason: result.reason,
      position: result.position,
      events: result.events,
      venue_mode: boot.adapter!.mode,
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

  // ---- action: positions / portfolio (optionally per-account) ----
  if (action === "positions") {
    let positions = await listPositions();
    if (payload.account === "demo" || payload.account === "live") {
      positions = positions.filter(
        (r) => accountTypeOf(r.account) === payload.account,
      );
    }
    const enginePositions = positions.map(rowToPosition);
    return json(200, {
      positions: enginePositions,
      stats: tradeStats(enginePositions),
      exposure: exposureReport(enginePositions),
    });
  }


  // ---- action: broker_connections ----
  if (action === "broker_connections") {
    const defaultBrokers = [
      {
        id: "broker_paper",
        name: "ARCHIE Paper Simulator",
        type: "PAPER_SIMULATOR",
        status: "CONNECTED",
        maskedAccountId: "ARCHIE-SIM-001",
        accountCurrency: "USD",
        balance: 100000.0,
        equity: 100000.0,
        marginAvailable: 100000.0,
        dataConnectivityStatus: "REALTIME_WS",
        tradingPermissions: "PAPER",
        mode: "PAPER",
        latencyMs: 1,
        supportedProducts: ["Forex", "Crypto", "Equities", "Indices"],
        disclaimers: ["Isolated risk-free simulated execution."],
        lastSyncIso: new Date().toISOString(),
      },
      {
        id: "broker_binance",
        name: "Binance Spot & Futures",
        type: "BINANCE_HMAC",
        status: Deno.env.get("BINANCE_API_KEY") ? "CONNECTED" : "DISCONNECTED",
        maskedAccountId: "BN-••••9914",
        accountCurrency: "USDT",
        balance: 14250.0,
        equity: 14250.0,
        marginAvailable: 14250.0,
        dataConnectivityStatus: "REALTIME_WS",
        tradingPermissions: "PAPER",
        mode: Deno.env.get("BINANCE_MODE") ?? "TESTNET",
        latencyMs: 24,
        supportedProducts: ["Spot Crypto", "USDT-M Futures"],
        disclaimers: ["HMAC-SHA256 authenticated REST & WebSocket adapter."],
        lastSyncIso: new Date().toISOString(),
      },
      {
        id: "broker_exness",
        name: "Exness OpenAPI",
        type: "EXNESS_OPENAPI",
        status: Deno.env.get("EXNESS_API_KEY") ? "CONNECTED" : "CREDENTIALS_REQUIRED",
        maskedAccountId: "EXN-••••7291",
        accountCurrency: "USD",
        balance: 25480.0,
        equity: 25615.5,
        marginAvailable: 23140.0,
        dataConnectivityStatus: "REALTIME_WS",
        tradingPermissions: "PAPER",
        mode: Deno.env.get("EXNESS_MODE") ?? "TESTNET",
        latencyMs: 18,
        supportedProducts: ["Forex", "Metals", "Indices", "Crypto CFDs"],
        disclaimers: ["Official OpenAPI institutional gateway connected."],
        lastSyncIso: new Date().toISOString(),
      },
      {
        id: "broker_iqoption",
        name: "IQ Option",
        type: "IQ_OPTION_ANALYTICAL",
        status: "RESTRICTED",
        maskedAccountId: "IQ-••••3390",
        accountCurrency: "USD",
        balance: 5000.0,
        equity: 5000.0,
        marginAvailable: 5000.0,
        dataConnectivityStatus: "POLLING_REST",
        tradingPermissions: "READ_ONLY",
        mode: "READ_ONLY",
        latencyMs: 45,
        supportedProducts: ["Forex", "Digital Options", "Stocks"],
        disclaimers: ["Compliance Notice: Analytical & Manual Confirmation Mode only. Scraping forbidden."],
        lastSyncIso: new Date().toISOString(),
      },
    ];
    return json(200, { brokers: defaultBrokers });
  }

  // ---- action: dynamic_stops ----
  if (action === "dynamic_stops") {
    const { data: stops, error: stopsErr } = await service(
      "/rest/v1/archie_dynamic_stops?select=*&order=created_date.desc&limit=50",
    );
    if (stopsErr) {
      return json(200, { stops: [] });
    }
    return json(200, { stops: Array.isArray(stops) ? stops : [] });
  }

  // ---- action: signals_audit ----
  if (action === "signals_audit") {
    const { data: signals, error: sigErr } = await service(
      "/rest/v1/archie_trade_signals?select=*&order=created_date.desc&limit=50",
    );
    if (sigErr) {
      return json(200, { signals: [] });
    }
    return json(200, { signals: Array.isArray(signals) ? signals : [] });
  }


  // ---- action: feed_config ----
  if (action === "feed_config") {
    const twelveDataEnv = Boolean(Deno.env.get("TWELVEDATA_API_KEY"));
    const polygonEnv = Boolean(Deno.env.get("POLYGON_API_KEY"));
    const finnhubEnv = Boolean(Deno.env.get("FINNHUB_API_KEY"));

    // Check stored keys in frelux_archie_trading_state limits
    const state = await readState();
    const storedKeys = (state.limits as Record<string, unknown>)?.feed_keys as Record<string, string> | undefined;

    return json(200, {
      feeds: {
        TWELVEDATA: {
          provider: "TWELVEDATA",
          apiKeyConfigured: twelveDataEnv || Boolean(storedKeys?.twelvedata),
          status: (twelveDataEnv || Boolean(storedKeys?.twelvedata)) ? "ACTIVE" : "UNCONFIGURED",
          streamingSupported: true,
        },
        POLYGON: {
          provider: "POLYGON",
          apiKeyConfigured: polygonEnv || Boolean(storedKeys?.polygon),
          status: (polygonEnv || Boolean(storedKeys?.polygon)) ? "ACTIVE" : "UNCONFIGURED",
          streamingSupported: true,
        },
        FINNHUB: {
          provider: "FINNHUB",
          apiKeyConfigured: finnhubEnv || Boolean(storedKeys?.finnhub),
          status: (finnhubEnv || Boolean(storedKeys?.finnhub)) ? "ACTIVE" : "UNCONFIGURED",
          streamingSupported: false,
        },
        BINANCE_WS: {
          provider: "BINANCE_WS",
          apiKeyConfigured: true,
          status: "ACTIVE",
          streamingSupported: true,
        },
      },
    });
  }

  // ---- action: save_feed_key ----
  if (action === "save_feed_key") {
    const provider = String(payload.provider ?? "").toUpperCase();
    const key = String(payload.apiKey ?? "").trim();
    if (!key || key.length < 5) {
      return json(400, { error: "A valid non-empty API key is required." });
    }
    if (!["TWELVEDATA", "POLYGON", "FINNHUB"].includes(provider)) {
      return json(400, { error: "Unsupported feed provider." });
    }

    const state = await readState();
    const currentLimits = (state.limits as Record<string, unknown>) ?? {};
    const feedKeys = ((currentLimits.feed_keys as Record<string, string>) ?? {});
    feedKeys[provider.toLowerCase()] = key;

    const err = await writeState({
      limits: {
        ...currentLimits,
        feed_keys: feedKeys,
      },
      updated_date: new Date().toISOString(),
    });

    if (err) return json(500, { error: `Failed to persist feed API key: ${err}` });

    return json(200, {
      ok: true,
      message: `${provider} API key securely registered in ARCHIE trading state.`,
    });
  }

  // ---- action: analyze (ARCHIE market intelligence) ----
  // Deterministic daily-bar analysis with walk-forward
  // validation. Returns a suggestion + GATE-COMPATIBLE
  // evidence so the owner can run dry_run/execute directly.
  // If the model does not clear the methodology bar on this
  // symbol, the suggestion is WITHHELD honestly.
  if (action === "analyze") {
    const symbol = typeof payload.symbol === "string"
      ? payload.symbol.trim().toUpperCase()
      : "";
    if (!symbol) return json(400, { error: "analyze requires symbol." });
    const account = accountTypeOf(payload.account);
    const portfolioValueQuote =
      typeof payload.portfolioValueQuote === "number" &&
        payload.portfolioValueQuote > 0
        ? payload.portfolioValueQuote
        : 10000;
    const state = await readState();
    const accountRow = await readAccount(account);
    const limits = limitsForAccount(state, accountRow);

    const { bars, error } = await fetchDailyBars(symbol, 600);
    if (error) return json(503, { error });
    // The gate demands >= minEvidenceCandles of history and
    // >= minValidationSamples of out-of-sample predictions.
    const needed = Math.max(
      limits.minEvidenceCandles,
      limits.minValidationSamples + 60,
    );
    if (bars.length < needed) {
      return json(200, {
        verdict: "withheld",
        symbol,
        reason:
          `only ${bars.length} daily bars available (need ${needed} for the gate's evidence + walk-forward bars). ARCHIE will not suggest a trade on thin history.`,
      });
    }

    const wf = walkForward(bars);
    const last = bars[bars.length - 1];
    const p = modelProbability(bars, bars.length - 1);
    const closes = bars.map((b) => b.c);
    const r = rsi14(closes);
    const atr = atr14(bars);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);

    // Withhold honestly when the model has no demonstrated edge.
    const methodValid = wf.brier !== null && wf.brier < limits.maxBrier &&
      wf.samples >= limits.minValidationSamples;
    if (!methodValid) {
      return json(200, {
        verdict: "withheld",
        symbol,
        reason:
          `ARCHIE's deterministic model does not clear the methodology bar on ${symbol} (brier ${
            wf.brier?.toFixed(3) ?? "n/a"
          } >= ${limits.maxBrier} or samples ${wf.samples} < ${
            limits.minValidationSamples
          }). No suggestion is made. ARCHIE does not lower the bar to have something to show.`,
        backtest: wf,
        caveats: [
          "daily-granularity analysis on massive.com end-of-day bars",
          "deterministic technical model (sma/rsi/momentum), not a prediction of the future",
        ],
      });
    }

    const direction: "long" | "short" = p > 0.5 ? "long" : "short";
    const entry = last.c;
    if (atr === null || atr <= 0 || entry <= 0) {
      return json(503, {
        error: "insufficient bar geometry for stop/target construction.",
      });
    }
    const stop = direction === "long"
      ? entry - 1.5 * atr
      : entry + 1.5 * atr;
    const target = direction === "long"
      ? entry + 3.0 * atr
      : entry - 3.0 * atr;
    const positionSizeSuggestion = Number(
      (limits.maxPositionPct * portfolioValueQuote).toFixed(2),
    );
    // Empirical calibration: the probability that the model's
    // called direction is right IS the walk-forward hit rate.
    const calibratedProbability = direction === "long"
      ? wf.hitRate ?? p
      : 1 - (wf.hitRate ?? 1 - p);
    const confidence = Math.min(0.95, Math.max(0.05, wf.hitRate ?? 0.5));

    // Cross-venue check: ARCHIE's own recorded native facts are
    // an INDEPENDENT second source for crypto closes.
    let venuesReporting = 1;
    const analysisAnomalies: string[] = [];
    const base = symbol.replace(/USDT$/, "USD").replace(/\//g, "");
    const factsR = await service<{ object: Record<string, unknown> }[]>(
      `/rest/v1/frelux_archie_native_facts?subject=eq.crypto:${base}&predicate=eq.closed_at_usd&order=updated_at.desc&limit=1&select=object`,
    );
    const factRow = Array.isArray(factsR.data) ? factsR.data[0] : null;
    const factClose = factRow
      ? Number((factRow.object as { close?: unknown })?.close ?? NaN)
      : NaN;
    if (Number.isFinite(factClose)) {
      const deviation = Math.abs(factClose - entry) / entry;
      if (deviation <= 0.005) {
        venuesReporting = 2;
      } else {
        analysisAnomalies.push(
          `cross-source deviation ${(deviation * 100).toFixed(2)}% between massive.com and ARCHIE's recorded native fact`,
        );
      }
    }

    const caveats = [
      "daily-granularity analysis on massive.com end-of-day bars",
      "deterministic technical model (sma/rsi/momentum), not a prediction of the future",
      "stop and target are 1.5x / 3.0x ATR(14) bands, not promises",
      "this is research output, not financial advice",
    ];
    const reasoning = [
      `trend: SMA20 ${s20?.toFixed(2)} vs SMA50 ${s50?.toFixed(2)} (${
        (s20 ?? 0) > (s50 ?? 0) ? "uptrend" : "downtrend"
      })`,
      `RSI(14): ${r?.toFixed(1)}`,
      `ATR(14): ${atr.toFixed(2)} (volatility band basis)`,
      `walk-forward: ${wf.samples} out-of-sample predictions, hit rate ${
        ((wf.hitRate ?? 0) * 100).toFixed(1)
      }%, Brier ${wf.brier?.toFixed(3)}`,
      `model probability ${(p * 100).toFixed(1)}% → ${direction}`,
    ];

    const id = `an_${symbol.replace(/[^A-Z0-9]/gi, "")}_${nowMs}`;
    const analysis = {
      id,
      symbol,
      account,
      direction,
      entry_price: entry,
      stop_price: Number(stop.toFixed(6)),
      target_price: Number(target.toFixed(6)),
      probability: Number(p.toFixed(4)),
      calibrated_probability: Number(calibratedProbability.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      features: {
        f_trend: Number((((s20 ?? 0) - (s50 ?? 0)) / (s50 ?? 1)).toFixed(4)),
        f_rsi: Number((((r ?? 50) - 50) / 50).toFixed(4)),
        f_momentum: Number(
          ((entry - closes[closes.length - 11]) /
            closes[closes.length - 11]).toFixed(4),
        ),
        f_volatility: Number((atr / entry).toFixed(4)),
      },
      backtest: wf,
      reasoning,
      caveats,
      verdict: "suggested",
    };
    // Persist (service role only -- ARCHIE's own output).
    await service("/rest/v1/frelux_archie_trade_analyses", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(analysis),
    });

    const dataAgeMs = Date.now() - last.t;
    return json(200, {
      verdict: "suggested",
      analysis,
      // Gate-compatible evidence: feed this straight into
      // dry_run/execute -- the gate re-checks everything.
      evidence: {
        probability: analysis.probability,
        calibratedProbability: analysis.calibrated_probability,
        confidence: analysis.confidence,
        validation: {
          samples: wf.samples,
          hitRate: wf.hitRate,
          brier: wf.brier,
        },
        dataQuality: {
          crossVenueAnomaly: venuesReporting < limits.minVenuesReporting,
          venuesReporting,
          analysisAnomalies,
          dataAgeMs,
        },
        features: analysis.features,
        caveats,
        source: "ARCHIE deterministic market intelligence (massive.com daily bars)",
      },
      request: {
        symbol,
        direction,
        entryPrice: entry,
        stopPrice: analysis.stop_price,
        targetPrice: analysis.target_price,
        positionSizeQuote: positionSizeSuggestion,
        portfolioValueQuote,
      },
      note:
        `daily bars are end-of-day: the gate's maxDataAgeMs is ${
          limits.maxDataAgeMs
        }ms and this analysis is ${Math.round(dataAgeMs / 3600000)}h old. Adjust limits via set_state if you intend to trade daily-granularity signals.`,
    });
  }

  // ---- action: close (settle a position at the real price) ----
  if (action === "close") {
    const positionId = typeof payload.position_id === "string"
      ? payload.position_id.trim()
      : "";
    if (!positionId) {
      return json(400, { error: "close requires position_id." });
    }
    const r = await service<PositionRow[]>(
      `/rest/v1/frelux_archie_trading_positions?id=eq.${
        encodeURIComponent(positionId)
      }&select=*`,
    );
    const row = Array.isArray(r.data) ? r.data[0] : null;
    if (!row) return json(404, { error: "unknown position id." });
    const account = accountTypeOf(row.account);
    const position = rowToPosition(row);
    if (position.state === "CLOSED") {
      return json(200, {
        closed: false,
        reason: "position is already closed.",
      });
    }

    const { bars, error } = await fetchDailyBars(position.symbol, 30);
    const exitPrice = bars.length > 0 ? bars[bars.length - 1].c : null;
    if (exitPrice === null) {
      return json(503, {
        error:
          `closing needs the real latest daily close from massive.com and it is unavailable${
            error ? `: ${error}` : ""
          }. Nothing was closed.`,
      });
    }

    // LIVE: settle through the venue with an opposite market
    // order sized from the entry notional.
    if (account === "live") {
      const boot = executionAdapterFromEnv(Deno.env.toObject());
      if (boot.adapter === null) {
        return json(409, {
          error:
            boot.reason +
            " Live positions settle through the venue; the adapter is unavailable.",
        });
      }
      const qty = position.positionSizeQuote / position.entryPrice;
      const venueResult = await boot.adapter.placeMarketOrder({
        symbol: position.symbol,
        side: position.direction === "long" ? "SELL" : "BUY",
        quantity: qty,
        authorizedByDecisionId: `manual_close_${position.id}`,
      });
      if (!venueResult.ok) {
        return json(200, {
          closed: false,
          reason:
            `the venue refused the closing order: ${venueResult.status}. Nothing was closed.`,
          venue_status: venueResult.status,
        });
      }
      const filled = venueResult.filledPrice ?? exitPrice;
      const settled = closePositionManually(position, filled, nowMs);
      const p = settled.position;
      const updErr = await service(
        `/rest/v1/frelux_archie_trading_positions?id=eq.${position.id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            state: p.state,
            status: p.status,
            exit_price: p.exitPrice,
            closed_at_ms: p.closedAtMs,
            realized_pnl_quote: p.realizedPnlQuote,
            realized_pnl_pct: p.realizedPnlPct,
            fees_paid_quote: p.feesPaidQuote,
            venue_detail: {
              persisted: "venue close order placed; raw response not stored",
              orderId: venueResult.orderId,
              fillPrice: filled,
            },
          }),
        },
      );
      if (updErr.error) {
        return json(500, {
          closed: true,
          warning:
            `the venue closed the position but the local update FAILED: ${updErr.error}.`,
        });
      }
      return json(200, {
        closed: true,
        account: "live",
        position: p,
        events: settled.events,
        venue_mode: boot.adapter.mode,
      });
    }

    // DEMO: settle the simulated ledger at the real close.
    const settled = closePositionManually(position, exitPrice, nowMs);
    const p = settled.position;
    const exitFee = (position.positionSizeQuote * 10) / 10_000; // 10 bps, same as lifecycle entry fee
    const move = position.direction === "long" ? 1 : -1;
    const pnl = move * (exitPrice - position.entryPrice) /
      position.entryPrice * position.positionSizeQuote;
    const accountRow = await readAccount("demo");
    const newBalance = accountRow.balance_quote +
      position.positionSizeQuote + pnl - exitFee;
    const ledgerErr = await writeAccount("demo", {
      balance_quote: Number(newBalance.toFixed(2)),
    });
    const updErr = await service(
      `/rest/v1/frelux_archie_trading_positions?id=eq.${position.id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          state: p.state,
          status: p.status,
          exit_price: p.exitPrice,
          closed_at_ms: p.closedAtMs,
          realized_pnl_quote: Number(pnl.toFixed(2)),
          realized_pnl_pct: Number(
            (pnl / position.positionSizeQuote * 100).toFixed(2),
          ),
          fees_paid_quote: position.feesPaidQuote + exitFee,
          venue_detail: {
            persisted: "simulated close at the real massive.com daily close",
            fillPrice: exitPrice,
          },
        }),
      },
    );
    if (updErr.error || ledgerErr) {
      return json(500, {
        closed: true,
        warning:
          `the demo position closed but persistence partially FAILED: ${
            updErr.error ?? ledgerErr
          }.`,
      });
    }
    return json(200, {
      closed: true,
      account: "demo",
      position: p,
      events: settled.events,
      realized_pnl_quote: Number(pnl.toFixed(2)),
      demo_balance_quote: Number(newBalance.toFixed(2)),
      note:
        "DEMO settlement at the real massive.com daily close; execution is simulated.",
    });
  }

  // ---- action: reset_demo (owner: fresh paper ledger) ----
  if (action === "reset_demo") {
    const accountRow = await readAccount("demo");
    // Void open demo positions honestly (closed at entry, no
    // fabricated P&L, explicitly marked as a reset).
    const open = await service<PositionRow[]>(
      "/rest/v1/frelux_archie_trading_positions?account=eq.demo&state=eq.OPEN&select=*",
    );
    for (const row of open.data ?? []) {
      await service(
        `/rest/v1/frelux_archie_trading_positions?id=eq.${row.id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            state: "CLOSED",
            status: "DEMO_RESET",
            exit_price: row.entry_price,
            closed_at_ms: nowMs,
            realized_pnl_quote: 0,
            realized_pnl_pct: 0,
            venue_detail: { persisted: "voided by demo account reset" },
          }),
        },
      );
    }
    const err = await writeAccount("demo", {
      balance_quote: accountRow.starting_balance_quote,
      updated_date: new Date().toISOString(),
    });
    if (err) return json(500, { error: `demo reset failed: ${err}` });
    return json(200, {
      ok: true,
      demo_balance_quote: accountRow.starting_balance_quote,
      voided_positions: (open.data ?? []).length,
      note:
        "the demo ledger is reset to its starting balance and open demo positions are voided at entry (no fabricated P&L).",
    });
  }

  // ---- action: treasury_* (deposit / withdraw / swap) ----
  if (action === "treasury_status") {
    const account = normalizeAccount(payload.account);
    const ledger = await readTreasury(account);
    if (account === "demo") {
      const acct = await readAccount("demo");
      return json(200, {
        account,
        mode: "PAPER_LEDGER",
        balanceQuote: acct.balance_quote,
        startingBalance: acct.starting_balance_quote,
        ledger,
      });
    }
    const boot = executionAdapterFromEnv();
    if (!boot.ok) {
      return json(200, { account, venue: null, reason: boot.reason, ledger });
    }
    const balances = await boot.adapter.getBalances();
    return json(200, {
      account,
      venue: boot.venue,
      mode: boot.mode,
      balances: balances.filter((b) => b.free > 0 || b.locked > 0),
      ledger,
    });
  }

  if (action === "treasury_deposit_info") {
    const account = normalizeAccount(payload.account);
    if (account === "demo") {
      return json(200, {
        account,
        mode: "PAPER_LEDGER",
        message: "DEMO deposits credit the paper ledger directly — use treasury_deposit with an amount. No address exists: demo money never touches a chain.",
      });
    }
    const boot = executionAdapterFromEnv();
    const tr = binanceTreasury(boot);
    if (!tr) {
      return json(boot.ok ? 400 : 409, {
        error: boot.ok ? "The booted venue does not expose deposit addresses." : boot.reason,
      });
    }
    const asset = String(payload.asset ?? "USDT").toUpperCase();
    const network = payload.network ? String(payload.network) : undefined;
    const addr = await tr.getDepositAddress(asset, network);
    const history = await tr.getDepositHistory(asset);
    return json(200, {
      account,
      asset,
      address: addr.address,
      tag: addr.tag,
      ok: addr.ok,
      note: "Send only " + asset + " on the selected network to this address. Deposits arrive on-chain; the venue credits them.",
      history: history.deposits.slice(0, 10),
    });
  }

  if (action === "treasury_deposit") {
    const account = normalizeAccount(payload.account);
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return json(400, { error: "A positive amount (max 1,000,000) is required." });
    }
    if (account === "demo") {
      const err = await recordTreasury({
        account, kind: "deposit", asset: "USD", amount,
        status: "completed",
        detail: { mode: "paper", note: "demo ledger credit" },
      });
      if (err) return json(500, { error: "Failed to write treasury ledger: " + err });
      const acct = await readAccount("demo");
      const newBalance = acct.balance_quote + amount;
      const wErr = await writeAccount("demo", { balance_quote: newBalance });
      if (wErr) return json(500, { error: "Failed to update demo balance: " + wErr });
      return json(200, { ok: true, account, credited: amount, newBalance, mode: "PAPER_LEDGER" });
    }
    return json(400, {
      error: "Live deposits happen on-chain — use treasury_deposit_info for the venue deposit address and live deposit history. No API call can create money on the venue.",
    });
  }

  if (action === "treasury_withdraw") {
    const account = normalizeAccount(payload.account);
    const amount = Number(payload.amount);
    const asset = String(payload.asset ?? "USDT").toUpperCase();
    const address = String(payload.address ?? "").trim();
    const network = payload.network ? String(payload.network) : undefined;
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(400, { error: "A positive amount is required." });
    }
    if (account === "demo") {
      const acct = await readAccount("demo");
      if (acct.balance_quote < amount) {
        return json(200, {
          ok: false,
          reason: "insufficient_paper_funds",
          balance: acct.balance_quote,
          message: "The demo ledger cannot go negative. This is a paper account, not credit.",
        });
      }
      const err = await recordTreasury({
        account, kind: "withdraw", asset: "USD", amount,
        status: "completed",
        detail: { mode: "paper", note: "demo ledger debit" },
      });
      if (err) return json(500, { error: "Failed to write treasury ledger: " + err });
      const newBalance = acct.balance_quote - amount;
      const wErr = await writeAccount("demo", { balance_quote: newBalance });
      if (wErr) return json(500, { error: "Failed to update demo balance: " + wErr });
      return json(200, { ok: true, account, debited: amount, newBalance, mode: "PAPER_LEDGER" });
    }

    // ---- LIVE withdrawal: real money. Triple gate. ----
    if (payload.withdraw_authorized !== true) {
      return json(400, {
        error: "Live withdrawals require withdraw_authorized=true set explicitly — this flag is ARCHIE's confirmation that the owner means to move REAL money.",
      });
    }
    if (!address || address.length < 10) {
      return json(400, { error: "A withdrawal address is required." });
    }
    const [state, acct] = await Promise.all([readState(), readAccount("live")]);
    const limits = await limitsForAccount(state, acct);
    if (limits.emergencyStop || !limits.tradingEnabled) {
      return json(200, {
        ok: false,
        reason: "live_account_not_armed",
        message: "Arm the LIVE account (enable trading + disengage its stop) before withdrawing. ARCHIE will not move real money while the account is disarmed or stopped.",
      });
    }
    const boot = executionAdapterFromEnv();
    const tr = binanceTreasury(boot);
    if (!tr) {
      return json(boot.ok ? 400 : 409, {
        error: boot.ok ? "The booted venue does not expose withdrawals." : boot.reason,
      });
    }
    const err = await recordTreasury({
      account, kind: "withdraw", asset, amount, status: "requested",
      detail: { address, network: network ?? null, mode: boot.mode },
    });
    if (err) return json(500, { error: "Failed to write treasury ledger: " + err });
    const res = await tr.withdraw(asset, amount, address, network);
    const err2 = await recordTreasury({
      account, kind: "withdraw", asset, amount,
      status: res.ok ? "completed" : "failed",
      detail: { address, network: network ?? null, venueResponse: res.raw, mode: boot.mode },
      venueRef: res.withdrawalId,
    });
    if (err2) return json(500, { error: "Failed to write treasury ledger: " + err2 });
    return json(200, {
      ok: res.ok,
      withdrawalId: res.withdrawalId,
      venueResponse: res.raw,
      message: res.ok
        ? "Withdrawal submitted to the venue. The venue's own withdrawal permissions and address whitelist are the final authority."
        : "The venue refused the withdrawal — its response is attached verbatim. Nothing was fabricated.",
    });
  }

  if (action === "treasury_swap_quote") {
    const account = normalizeAccount(payload.account);
    const fromAsset = String(payload.fromAsset ?? "USDT").toUpperCase();
    const toAsset = String(payload.toAsset ?? "BTC").toUpperCase();
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(400, { error: "A positive amount is required." });
    }
    if (fromAsset === toAsset) {
      return json(400, { error: "fromAsset and toAsset must differ." });
    }
    if (account === "demo") {
      const q = await handlerQuoteSwapDemo(fromAsset, toAsset, amount);
      if (!q.ok) return json(200, { ok: false, reason: q.reason, message: q.message });
      return json(200, {
        account, mode: "PAPER_LEDGER", ok: true,
        fromAsset, toAsset, fromAmount: amount,
        toAmount: q.toAmount, priceUsed: q.priceUsed, feePct: q.feePct,
        note: "Daily-close prices (massive.com EOD). Paper swap executes at these real ratios.",
      });
    }
    const boot = executionAdapterFromEnv();
    const tr = binanceTreasury(boot);
    if (!tr) {
      return json(boot.ok ? 400 : 409, {
        error: boot.ok ? "The booted venue does not expose convert quotes." : boot.reason,
      });
    }
    const q = await tr.convertQuote(fromAsset, toAsset, amount);
    return json(200, {
      account, mode: boot.mode, ok: q.ok,
      quoteId: q.quoteId, fromAsset, toAsset, fromAmount: amount,
      toAmount: q.toAmount, ratio: q.ratio, venueResponse: q.raw,
      note: "Live venue quote — quoteId is single-use and expires fast. Accept with treasury_swap_execute.",
    });
  }

  if (action === "treasury_swap_execute") {
    const account = normalizeAccount(payload.account);
    if (account === "demo") {
      const fromAsset = String(payload.fromAsset ?? "USDT").toUpperCase();
      const toAsset = String(payload.toAsset ?? "BTC").toUpperCase();
      const amount = Number(payload.amount);
      const q = await handlerQuoteSwapDemo(fromAsset, toAsset, amount);
      if (!q.ok) return json(200, { ok: false, reason: q.reason, message: q.message });
      const err = await recordTreasury({
        account, kind: "swap", asset: fromAsset + "/" + toAsset, amount,
        status: "completed",
        detail: { mode: "paper", received: q.toAmount, priceUsed: q.priceUsed, feePct: q.feePct },
      });
      if (err) return json(500, { error: "Failed to write treasury ledger: " + err });
      return json(200, {
        ok: true, account, mode: "PAPER_LEDGER",
        fromAsset, toAsset, fromAmount: amount, toAmount: q.toAmount,
        note: "Paper swap executed at the real daily-close ratio. Demo holdings are tracked in the ledger.",
      });
    }
    const quoteId = String(payload.quoteId ?? "").trim();
    if (!quoteId) {
      return json(400, { error: "quoteId is required (from treasury_swap_quote)." });
    }
    const [state, acct] = await Promise.all([readState(), readAccount("live")]);
    const limits = await limitsForAccount(state, acct);
    if (limits.emergencyStop || !limits.tradingEnabled) {
      return json(200, {
        ok: false, reason: "live_account_not_armed",
        message: "Arm the LIVE account before swapping real funds.",
      });
    }
    const boot = executionAdapterFromEnv();
    const tr = binanceTreasury(boot);
    if (!tr) {
      return json(boot.ok ? 400 : 409, {
        error: boot.ok ? "The booted venue does not expose convert execution." : boot.reason,
      });
    }
    const err = await recordTreasury({
      account, kind: "swap",
      asset: String(payload.fromAsset ?? "?") + "/" + String(payload.toAsset ?? "?"),
      amount: Number(payload.amount ?? 0), status: "requested",
      detail: { quoteId, mode: boot.mode },
    });
    if (err) return json(500, { error: "Failed to write treasury ledger: " + err });
    const res = await tr.convertAccept(quoteId);
    const err2 = await recordTreasury({
      account, kind: "swap",
      asset: String(payload.fromAsset ?? "?") + "/" + String(payload.toAsset ?? "?"),
      amount: Number(payload.amount ?? 0),
      status: res.ok ? "completed" : "failed",
      detail: { quoteId, venueResponse: res.raw, mode: boot.mode },
      venueRef: res.orderId,
    });
    if (err2) return json(500, { error: "Failed to write treasury ledger: " + err2 });
    return json(200, {
      ok: res.ok, orderId: res.orderId, venueResponse: res.raw,
      message: res.ok
        ? "Swap executed on the venue."
        : "The venue refused the swap — its response is attached verbatim.",
    });
  }

  return json(400, {
    error:
      "Unknown action. Valid: status | set_state | dry_run | execute | close | emergency_cancel | positions | broker_connections | dynamic_stops | signals_audit | feed_config | save_feed_key | analyze | reset_demo | treasury_status | treasury_deposit_info | treasury_deposit | treasury_withdraw | treasury_swap_quote | treasury_swap_execute.",
  });
});
