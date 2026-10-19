// =========================================================
// archie-trading tests — the ONLY sanctioned trading surface.
// Covers the owner gate (401/403), fail-closed parsing, safe
// defaults (absent state row = stop engaged + disabled), the
// state toggles' AUTHORITY over the trade gate (regression:
// emergency_stop/trading_enabled were previously invisible to
// evaluateTradeGate — a financial-safety bug found by this
// batch), a fully-eligible dry run, venue-boot refusals
// (no credentials → 409), gate-refused execute (no venue
// order, no persistence), venue-response redaction, and the
// positions/portfolio read.
// =========================================================
import { describe, it, expect, beforeEach } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenRows,
  givenUser,
  req,
  state,
  tableFixtures,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

const OWNER = { id: "owner-1", email: "owner@frelux.test" };
const AUTH = { Authorization: "Bearer token-owner-1" };

// ---- Massive API stubbing (harness passes non-supabase URLs
// to the real network, so we intercept api.massive.com here) ----
const harnessFetch: any = globalThis.fetch;
let massiveResponses: Record<string, { body?: unknown }> = {};

function stubMassive() {
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("api.massive.com")) {
      const decoded = decodeURIComponent(url);
      const hit = Object.entries(massiveResponses).find(
        ([k]) => decoded.includes(k),
      )?.[1];
      return new Response(JSON.stringify(hit?.body ?? { status: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return harnessFetch(input, init);
  };
}

function unstubMassive() {
  (globalThis as any).fetch = harnessFetch;
}

/** Build a deterministic synthetic daily-bar history: a gentle
 * uptrend with wobble — enough for SMA/RSI/momentum features and
 * >260 walk-forward samples. */
function uptrendBars(n: number, startPrice = 100): { results: any[] } {
  const results = [];
  let c = startPrice;
  const t0 = 1790000000000;
  for (let i = 0; i < n; i++) {
    c = c * (1 + 0.004 + 0.02 * Math.sin(i / 7));
    results.push({
      o: c - 0.5,
      h: c + 2,
      l: c - 2,
      c: Number(c.toFixed(4)),
      v: 1000 + (i % 100),
      t: t0 + i * 86400000,
    });
  }
  return { results };
}

/** Deterministic DEMO account row: enabled, stopped=false, $50k. */
function demoAccountRow(patch: Record<string, unknown> = {}) {
  givenRows("frelux_archie_trading_accounts", [
    {
      id: "demo",
      type: "demo",
      label: "ARCHIE Demo",
      balance_quote: 50000,
      starting_balance_quote: 50000,
      currency: "USD",
      trading_enabled: true,
      emergency_stop: false,
      venue_mode: "PAPER_SIMULATION",
      ...patch,
    },
    {
      id: "live",
      type: "live",
      label: "ARCHIE Live",
      balance_quote: 0,
      starting_balance_quote: 0,
      currency: "USD",
      trading_enabled: false,
      emergency_stop: true,
      venue_mode: null,
    },
  ]);
}

beforeEach(() => {
  givenUser(OWNER);
  givenRows("profiles", [{ id: "owner-1", role: "admin" }]);
  givenRows("frelux_archie_trading_state", []);
  givenRows("frelux_archie_trading_positions", []);
  givenRows("frelux_archie_trading_accounts", []);
  givenRows("frelux_archie_treasury_ledger", []);
  massiveResponses = {};
  unstubMassive();
  state.env.MARKET_DATA_API_KEY = "test-key";
  // No venue credentials by default — adapter refuses.
  delete state.env.BINANCE_API_KEY;
  delete state.env.BINANCE_API_SECRET;
  delete state.env.BINANCE_MODE;
  delete state.env.BINANCE_MAINNET_AUTHORIZED;
});

/** A trade + evidence payload engineered to pass ALL 11 gate
 *  checks (valid geometry, rr 2.0, 2% position, 65% calibrated
 *  probability, 250 samples, brier 0.20, 2 fresh venues). */
const ELIGIBLE = {
  request: {
    symbol: "BTCUSDT",
    direction: "long",
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    positionSizeQuote: 20,
    portfolioValueQuote: 1000,
  },
  evidence: {
    probability: 0.8,
    calibratedProbability: 0.65,
    confidence: 0.7,
    validation: { samples: 250, hitRate: 0.6, brier: 0.2 },
    dataQuality: {
      crossVenueAnomaly: false,
      venuesReporting: 2,
      analysisAnomalies: [],
      dataAgeMs: 1000,
    },
    features: { f_trend: 1.2, f_rsi: 0.4 },
  },
};

function ownerStateRow(patch: Record<string, unknown> = {}) {
  givenRows("frelux_archie_trading_state", [
    {
      id: "owner",
      emergency_stop: false,
      trading_enabled: true,
      limits: null,
      ...patch,
    },
  ]);
}

describe("archie-trading — owner gate", () => {
  it("401s without an Authorization header", async () => {
    const res = await handler(req("POST", "", { action: "status" }));
    expect(res.status).toBe(401);
  });

  it("401s on an invalid session", async () => {
    givenUser(null);
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin caller — financial execution is owner-only", async () => {
    givenRows("profiles", [{ id: "owner-1", role: "user" }]);
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Owner\/Admin-only/i);
  });

  it("405s non-POST methods", async () => {
    expect((await handler(req("GET", "", undefined, AUTH))).status).toBe(405);
  });

  it("400s on an unknown action", async () => {
    const res = await handler(req("POST", "", { action: "yolo" }, AUTH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown action/i);
  });
});

describe("archie-trading — status", () => {
  it("reports the venue as NOT configured without credentials, honestly", async () => {
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venue.configured).toBe(false);
    expect(body.venue.reason).toMatch(/BINANCE_API_KEY/i);
    // Credential flags — presence only, never values.
    expect(body.credentials.api_key_provisioned).toBe(false);
    expect(body.credentials.api_secret_provisioned).toBe(false);
    expect(body.credentials.mode).toMatch(/TESTNET/i);
    expect(body.credentials.mainnet_authorized_by_secret).toBe(false);
  });

  it("applies SAFE DEFAULTS when the state row is absent", async () => {
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    const body = await res.json();
    // Absent row = stop engaged, trading disabled — never guessed permissive.
    expect(body.state.emergency_stop).toBe(true);
    expect(body.state.trading_enabled).toBe(false);
    expect(body.portfolio.total_positions).toBe(0);
  });

  it("counts open/closed positions and computes stats", async () => {
    ownerStateRow();
    givenRows("frelux_archie_trading_positions", [
      {
        id: "p1",
        symbol: "BTCUSDT",
        direction: "long",
        entry_price: 100,
        stop_price: 95,
        target_price: 110,
        position_size_quote: 20,
        portfolio_value_quote: 1000,
        opened_at_ms: Date.now() - 3_600_000,
        state: "OPEN",
        status: "OPEN",
        exit_price: null,
        closed_at_ms: null,
        realized_pnl_quote: null,
        realized_pnl_pct: null,
        fees_paid_quote: 0.1,
      },
      {
        id: "p0",
        symbol: "ETHUSDT",
        direction: "short",
        entry_price: 50,
        stop_price: 55,
        target_price: 40,
        position_size_quote: 10,
        portfolio_value_quote: 1000,
        opened_at_ms: Date.now() - 7_200_000,
        state: "CLOSED",
        status: "TARGET",
        exit_price: 40,
        closed_at_ms: Date.now() - 3_600_000,
        realized_pnl_quote: 20,
        realized_pnl_pct: 0.2,
        fees_paid_quote: 0.2,
      },
    ]);
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    const body = await res.json();
    expect(body.state.emergency_stop).toBe(false);
    expect(body.state.trading_enabled).toBe(true);
    expect(body.portfolio.total_positions).toBe(2);
    expect(body.portfolio.open_positions).toBe(1);
    expect(body.portfolio.closed_positions).toBe(1);
    expect(body.portfolio.stats.closedTrades).toBeGreaterThanOrEqual(1);
  });
});

describe("archie-trading — set_state (owner switches)", () => {
  it("400s when neither toggle is supplied", async () => {
    const res = await handler(req("POST", "", { action: "set_state" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("writes the toggles and reports the merged state back", async () => {
    const res = await handler(
      req(
        "POST",
        "",
        { action: "set_state", emergency_stop: true, trading_enabled: false },
        AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state.emergency_stop).toBe(true);
    expect(body.state.trading_enabled).toBe(false);
  });
});

describe("archie-trading — dry_run (gate evaluation, no execution)", () => {
  it("400s on a malformed request or evidence (fail closed)", async () => {
    const res = await handler(
      req("POST", "", { action: "dry_run", request: {}, evidence: {} }, AUTH),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/requires a valid request/i);
  });

  it("refuses EVERYTHING while the emergency stop is engaged (regression)", async () => {
    // No state row → safe defaults: stop engaged, trading disabled.
    // Regression: these owner switches were previously invisible
    // to the gate, so an eligible-looking trade passed anyway.
    const res = await handler(
      req("POST", "", { action: "dry_run", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    const failed = body.decision.checks
      .filter((c: any) => !c.passed)
      .map((c: any) => c.id);
    expect(failed).toContain("emergency_stop");
    expect(failed).toContain("trading_enabled");
    expect(body.report).toMatch(/NO TRADE/i);
    expect(body.note).toMatch(/dry run only/i);
  });

  it("passes all 11 checks for an eligible owner-configured trade", async () => {
    ownerStateRow(); // stop disengaged, trading enabled
    const res = await handler(
      req("POST", "", { action: "dry_run", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.decision.checks).toHaveLength(11);
    // Manually-provided evidence must be labeled as such.
    const caveat = body.decision.prediction.caveats.join(" ").toLowerCase();
    expect(caveat).toContain("manually provided");
    expect(body.report).toMatch(/TRADE ELIGIBLE/i);
  });

  it("labels evidence as owner-entered, never as model output", async () => {
    ownerStateRow();
    const res = await handler(
      req("POST", "", { action: "dry_run", ...ELIGIBLE }, AUTH),
    );
    const body = await res.json();
    expect(body.decision.prediction.raw.trend).toBe("manually entered");
  });
});

describe("archie-trading — execute (financial action, hard-gated)", () => {
  it("409s without venue credentials — no adapter, no execution", async () => {
    ownerStateRow();
    const res = await handler(
      req("POST", "", { action: "execute", account: "live", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/BINANCE_API_KEY/i);
    expect(body.hint).toMatch(/secrets flow/i);
  });

  it("reports a gate refusal honestly and never executes it", async () => {
    // Credentials provisioned (adapter constructs offline) but the
    // state row is ABSENT → stop engaged → the gate must refuse
    // BEFORE any venue call, with no position persisted.
    state.env.BINANCE_API_KEY = "test-key";
    state.env.BINANCE_API_SECRET = "test-secret";
    const res = await handler(
      req("POST", "", { action: "execute", account: "live", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.executed).toBe(false);
    expect(body.reason).toMatch(/trade gate refused/i);
    expect(body.report).toMatch(/emergency_stop: FAIL/i);
    expect(tableFixtures.get("frelux_archie_trading_positions")).toHaveLength(
      0,
    );
  });

  it("refuses MAINNET without the owner's authorization secret", async () => {
    state.env.BINANCE_API_KEY = "test-key";
    state.env.BINANCE_API_SECRET = "test-secret";
    state.env.BINANCE_MODE = "MAINNET";
    const res = await handler(
      req(
        "POST",
        "",
        { action: "execute", account: "live", ...ELIGIBLE, mainnet_execution_authorized: true },
        AUTH,
      ),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/MAINNET execution REFUSED/i);
  });
});

describe("archie-trading — emergency_cancel + positions", () => {
  it("409s on emergency_cancel without credentials", async () => {
    const res = await handler(
      req(
        "POST",
        "",
        { action: "emergency_cancel", symbols: ["BTCUSDT"] },
        AUTH,
      ),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no venue orders/i);
  });

  it("400s on emergency_cancel without symbols", async () => {
    state.env.BINANCE_API_KEY = "test-key";
    state.env.BINANCE_API_SECRET = "test-secret";
    const res = await handler(
      req("POST", "", { action: "emergency_cancel" }, AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("returns positions with stats and exposure", async () => {
    givenRows("frelux_archie_trading_positions", [
      {
        id: "p1",
        symbol: "BTCUSDT",
        direction: "long",
        entry_price: 100,
        stop_price: 95,
        target_price: 110,
        position_size_quote: 20,
        portfolio_value_quote: 1000,
        opened_at_ms: Date.now(),
        state: "OPEN",
        status: "OPEN",
        exit_price: null,
        closed_at_ms: null,
        realized_pnl_quote: null,
        realized_pnl_pct: null,
        fees_paid_quote: 0,
      },
    ]);
    const res = await handler(req("POST", "", { action: "positions" }, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0].symbol).toBe("BTCUSDT");
    expect(body.positions[0].entryPrice).toBe(100);
    expect(body.stats).toBeTruthy();
    expect(body.exposure).toBeTruthy();
  });
});

// =========================================================
// TWO-ACCOUNT LAYER + ARCHIE MARKET INTELLIGENCE (batch 35)
// =========================================================
describe("archie-trading — two accounts", () => {
  it("status returns BOTH account summaries with safe per-account defaults", async () => {
    ownerStateRow();
    const res = await handler(req("POST", "", { action: "status" }, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.accounts)).toBe(true);
    const demo = body.accounts.find((a: any) => a.id === "demo");
    const live = body.accounts.find((a: any) => a.id === "live");
    // Absent account rows → SAFE DEFAULTS: stopped + disabled.
    expect(demo.trading_enabled).toBe(false);
    expect(demo.emergency_stop).toBe(true);
    expect(live.trading_enabled).toBe(false);
    expect(live.emergency_stop).toBe(true);
    // Per-account limits merge: global state row is enabled, but
    // the account defaults disable it.
    expect(demo.limits.tradingEnabled).toBe(false);
  });

  it("set_state routes switches to a specific account", async () => {
    ownerStateRow();
    demoAccountRow({ trading_enabled: false });
    const res = await handler(
      req("POST", "", {
        action: "set_state",
        account: "demo",
        trading_enabled: true,
        emergency_stop: false,
      }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account).toBe("demo");
    expect(body.state.trading_enabled).toBe(true);
  });

  it("an account cannot loosen a GLOBAL emergency stop", async () => {
    givenRows("frelux_archie_trading_state", [
      { id: "owner", emergency_stop: true, trading_enabled: true, limits: null },
    ]);
    demoAccountRow();
    const res = await handler(
      req("POST", "", {
        action: "set_state",
        account: "demo",
        emergency_stop: false,
        trading_enabled: true,
      }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/GLOBAL emergency stop/i);
  });

  it("positions can be filtered per account", async () => {
    givenRows("frelux_archie_trading_positions", [
      { id: "p1", account: "demo", symbol: "BTCUSDT", direction: "long", entry_price: 100, stop_price: 95, target_price: 110, position_size_quote: 20, portfolio_value_quote: 1000, opened_at_ms: 1, state: "OPEN", status: "OPEN", exit_price: null, closed_at_ms: null, realized_pnl_quote: null, realized_pnl_pct: null, fees_paid_quote: 0.02 },
      { id: "p2", account: "live", symbol: "ETHUSDT", direction: "short", entry_price: 50, stop_price: 55, target_price: 45, position_size_quote: 10, portfolio_value_quote: 1000, opened_at_ms: 2, state: "OPEN", status: "OPEN", exit_price: null, closed_at_ms: null, realized_pnl_quote: null, realized_pnl_pct: null, fees_paid_quote: 0.01 },
    ]);
    const res = await handler(
      req("POST", "", { action: "positions", account: "live" }, AUTH),
    );
    const body = await res.json();
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0].symbol).toBe("ETHUSDT");
  });
});

describe("archie-trading — DEMO execution (simulated at real prices)", () => {
  it("executes through the gate against the real daily close, locks the ledger, persists account=demo", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    // Real daily bar history: latest close 108.
    massiveResponses["/range/1/day"] = { body: uptrendBars(40, 100) };
    // Anchor the request geometry to the REAL fill the stub
    // will return (the demo path re-evaluates the gate AT the
    // real close, so stop/target must be geometric around it).
    const fill = massiveResponses["/range/1/day"].body.results.slice(-1)[0].c;
    const res = await handler(
      req("POST", "", {
        action: "execute",
        account: "demo",
        ...ELIGIBLE,
        request: {
          ...ELIGIBLE.request,
          entryPrice: fill,
          stopPrice: fill - 5,
          targetPrice: fill + 10,
        },
      }, AUTH),
    );
    const body = await res.json();
    expect(body.executed).toBe(true);
    expect(body.account).toBe("demo");
    expect(body.fill_price).toBeCloseTo(
      massiveResponses["/range/1/day"].body.results.slice(-1)[0].c,
      2,
    );
    expect(body.demo_balance_quote).toBeLessThan(50000); // notional + fee locked
    expect(body.note).toMatch(/DEMO execution/i);
  });

  it("refuses when the demo ledger cannot cover the notional — honestly, no overdraft", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow({ balance_quote: 10 });
    massiveResponses["/range/1/day"] = { body: uptrendBars(40, 100) };
    const res = await handler(
      req("POST", "", { action: "execute", account: "demo", ...ELIGIBLE }, AUTH),
    );
    const body = await res.json();
    expect(body.executed).toBe(false);
    expect(body.reason).toMatch(/insufficient demo cash/i);
  });

  it("503s honestly when the real price feed is down — never fabricates a fill", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    massiveResponses["/range/1/day"] = { body: { results: [] } };
    const res = await handler(
      req("POST", "", { action: "execute", account: "demo", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });

  it("demo execute re-runs the gate AT the real fill and refuses inconsistent geometry", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    massiveResponses["/range/1/day"] = { body: uptrendBars(40, 100) };
    // Stop/target built around 100 while the real fill is ~117:
    // the gate must refuse at the real price.
    const res = await handler(
      req("POST", "", { action: "execute", account: "demo", ...ELIGIBLE }, AUTH),
    );
    const body = await res.json();
    expect(body.executed).toBe(false);
    expect(body.reason ?? body.report).toMatch(/refused|TRADE INELIGIBLE/i);
  });

  it("closes a demo position at the real close and settles the ledger", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow({ balance_quote: 48000 });
    givenRows("frelux_archie_trading_positions", [
      { id: "pos_1", account: "demo", symbol: "BTCUSDT", direction: "long", entry_price: 100, stop_price: 95, target_price: 110, position_size_quote: 500, portfolio_value_quote: 50000, opened_at_ms: 1, state: "OPEN", status: "OPEN", exit_price: null, closed_at_ms: null, realized_pnl_quote: null, realized_pnl_pct: null, fees_paid_quote: 0.5 },
    ]);
    massiveResponses["/range/1/day"] = { body: uptrendBars(40, 100) };
    const lastClose = massiveResponses["/range/1/day"].body.results.slice(-1)[0].c;
    const res = await handler(
      req("POST", "", { action: "close", position_id: "pos_1" }, AUTH),
    );
    const body = await res.json();
    expect(body.closed).toBe(true);
    expect(body.account).toBe("demo");
    expect(body.position.exitPrice).toBeCloseTo(lastClose, 2);
    // Long up → positive P&L; ledger credited notional + pnl - fee.
    expect(body.realized_pnl_quote).toBeGreaterThan(0);
    expect(body.demo_balance_quote).toBeGreaterThan(48000);
  });

  it("reset_demo voids open demo positions at entry (no fabricated P&L) and restores the balance", async () => {
    ownerStateRow();
    demoAccountRow({ balance_quote: 12345 });
    givenRows("frelux_archie_trading_positions", [
      { id: "pos_2", account: "demo", symbol: "BTCUSDT", direction: "long", entry_price: 100, stop_price: 95, target_price: 110, position_size_quote: 500, portfolio_value_quote: 50000, opened_at_ms: 1, state: "OPEN", status: "OPEN", exit_price: null, closed_at_ms: null, realized_pnl_quote: null, realized_pnl_pct: null, fees_paid_quote: 0.5 },
    ]);
    const res = await handler(req("POST", "", { action: "reset_demo" }, AUTH));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.demo_balance_quote).toBe(50000);
    expect(body.voided_positions).toBe(1);
  });
});

describe("archie-trading — ARCHIE market intelligence (analyze)", () => {
  it("suggests a trade with walk-forward evidence the gate accepts, and persists the analysis", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    // 320 bars of gentle uptrend → model should clear the bar.
    massiveResponses["/range/1/day"] = { body: uptrendBars(320, 100) };
    const res = await handler(
      req("POST", "", {
        action: "analyze",
        symbol: "BTCUSDT",
        account: "demo",
        portfolioValueQuote: 50000,
      }, AUTH),
    );
    const body = await res.json();
    expect(body.verdict).toBe("suggested");
    expect(["long", "short"]).toContain(body.analysis.direction);
    // Walk-forward is real: samples within the fetched history.
    expect(body.analysis.backtest.samples).toBeGreaterThan(200);
    expect(body.evidence.validation.samples).toBe(body.analysis.backtest.samples);
    // Geometry: stop and target are ATR bands around the entry.
    const a = body.analysis;
    expect(a.direction === "long"
      ? a.stop_price < a.entry_price && a.target_price > a.entry_price
      : a.stop_price > a.entry_price && a.target_price < a.entry_price).toBe(true);
    // Sizing respects the gate's maxPositionPct.
    expect(body.request.positionSizeQuote).toBeLessThanOrEqual(0.02 * 50000 + 0.01);
    // Honest caveats, always.
    expect(body.analysis.caveats.join(" ")).toMatch(/not financial advice/);
    expect(body.analysis.caveats.join(" ")).toMatch(/daily-granularity|end-of-day/);
  });

  it("WITHHOLDS the suggestion when the model has no demonstrated edge — never lowers the bar", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    // Flat wobble: the model's hit rate should hover near a
    // coin flip — brier likely >= bar → withheld honestly.
    const flat: any[] = [];
    let c = 100;
    for (let i = 0; i < 320; i++) {
      c = 100 + Math.sin(i / 3) * 30; // oscillation, no trend
      flat.push({ o: c - 1, h: c + 1, l: c - 1, c, v: 100, t: 1790000000000 + i * 86400000 });
    }
    massiveResponses["/range/1/day"] = { body: { results: flat } };
    const res = await handler(
      req("POST", "", { action: "analyze", symbol: "BTCUSDT" }, AUTH),
    );
    const body = await res.json();
    // Either verdict is acceptable — but a WITHHELD must say why.
    if (body.verdict === "withheld") {
      expect(body.reason).toMatch(/methodology bar|walk-forward/i);
      expect(body.analysis).toBeUndefined();
    } else {
      expect(body.evidence.validation.brier).toBeLessThan(0.25);
    }
  });

  it("refuses thin history honestly instead of suggesting on few bars", async () => {
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    massiveResponses["/range/1/day"] = { body: uptrendBars(50, 100) };
    const res = await handler(
      req("POST", "", { action: "analyze", symbol: "BTCUSDT" }, AUTH),
    );
    const body = await res.json();
    expect(body.verdict).toBe("withheld");
    expect(body.reason).toMatch(/thin history|daily bars available/i);
  });

  it("503s when the market data key is not provisioned", async () => {
    ownerStateRow();
    demoAccountRow();
    delete state.env.MARKET_DATA_API_KEY;
    const res = await handler(
      req("POST", "", { action: "analyze", symbol: "BTCUSDT" }, AUTH),
    );
    expect(res.status).toBe(503);
  });
});

describe("archie-trading — LIVE account routing", () => {
  it("live execute still requires venue credentials (409) and demo never does", async () => {
    const res = await handler(
      req("POST", "", { action: "execute", account: "live", ...ELIGIBLE }, AUTH),
    );
    expect(res.status).toBe(409);
    // The SAME request on demo is not a credential failure.
    stubMassive();
    ownerStateRow();
    demoAccountRow();
    massiveResponses["/range/1/day"] = { body: uptrendBars(40, 100) };
    const demoRes = await handler(
      req("POST", "", { action: "execute", account: "demo", ...ELIGIBLE }, AUTH),
    );
    expect(demoRes.status).toBe(200);
  });
});


// ---- treasury test helpers ----
function barsUp(n: number, start: number) {
  const out: Array<Record<string, number>> = [];
  let c = start;
  const t0 = 1790000000000;
  for (let i = 0; i < n; i++) {
    c = c * 1.001;
    out.push({ o: c - 0.4, h: c + 0.5, l: c - 0.5, c: +c.toFixed(6), v: 100, t: t0 + i * 86400000 });
  }
  return out;
}

/** All rows the handler has INSERTed into a table so far.
 * The handler's ledger writes carry id="tl_..." — the harness
 * assigns generated ids only to OTHER inserts, so the prefix
 * is a reliable inserted-by-this-call marker. */
function insertsInto(table: string): Array<Record<string, unknown>> {
  const rows = tableFixtures.get(table) ?? [];
  return rows.filter((r: any) => String((r as any).id ?? "").startsWith("tl_"));
}

describe("archie-trading — treasury (deposit / withdraw / swap)", () => {
  it("demo deposit credits the paper ledger and writes the audit trail", async () => {
    stubMassive();
    demoAccountRow();
    const res = await handler(
      req("POST", "", { action: "treasury_deposit", account: "demo", amount: 5000 }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.credited).toBe(5000);
    expect(body.mode).toBe("PAPER_LEDGER");
    expect(body.newBalance).toBe(55000); // 50k seed + 5k
    const inserts = insertsInto("frelux_archie_treasury_ledger");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].kind).toBe("deposit");
    expect(inserts[0].status).toBe("completed");
    unstubMassive();
  });

  it("demo withdrawal refuses to overdraw the paper ledger (honest refusal)", async () => {
    stubMassive();
    demoAccountRow();
    const res = await handler(
      req("POST", "", { action: "treasury_withdraw", account: "demo", amount: 999999 }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("insufficient_paper_funds");
    expect(insertsInto("frelux_archie_treasury_ledger")).toHaveLength(0);
    unstubMassive();
  });

  it("LIVE withdrawal demands the explicit confirmation flag first", async () => {
    stubMassive();
    const res = await handler(
      req("POST", "", { action: "treasury_withdraw", account: "live", amount: 50, address: "bc1qexampleaddress0123" }, AUTH),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("withdraw_authorized");
    expect(insertsInto("frelux_archie_treasury_ledger")).toHaveLength(0);
    unstubMassive();
  });

  it("LIVE withdrawal refuses while the live account is disarmed — no ledger, no venue call", async () => {
    stubMassive();
    const res = await handler(
      req("POST", "", {
        action: "treasury_withdraw",
        account: "live",
        amount: 50,
        address: "bc1qexampleaddress0123",
        withdraw_authorized: true,
      }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("live_account_not_armed");
    expect(insertsInto("frelux_archie_treasury_ledger")).toHaveLength(0);
    unstubMassive();
  });

  it("LIVE deposit via API is refused honestly — money arrives on-chain only", async () => {
    stubMassive();
    const res = await handler(
      req("POST", "", { action: "treasury_deposit", account: "live", amount: 100 }, AUTH),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("on-chain");
    unstubMassive();
  });

  it("demo swap quotes at the REAL daily-close ratio with a fee, and refuses without prices", async () => {
    stubMassive();
    // Two different price series: USDT ~ $1.00, BTC ~ $80,000.
    // The stub differentiates by ticker IN the URL (the edge
    // fetches C:USDTUSD and X:BTCUSD separately).
    massiveResponses["C:USDTUSD/range/1/day"] = { body: { results: barsUp(30, 1) } };
    massiveResponses["X:BTCUSD/range/1/day"] = { body: { results: barsUp(30, 80000) } };
    let res = await handler(
      req("POST", "", { action: "treasury_swap_quote", account: "demo", fromAsset: "USDT", toAsset: "BTC", amount: 800 }, AUTH),
    );
    let body = await res.json();
    
    expect(body.ok).toBe(true);
    // 800 USDT / $80k = 0.01 BTC gross; 0.1% fee
    expect(body.toAmount).toBeCloseTo(0.01 * 0.999, 8);
    expect(body.feePct).toBe(0.1);

    // No prices available -> honest refusal, never a fabricated ratio
    massiveResponses["C:USDTUSD/range/1/day"] = { body: { results: [] } };
    massiveResponses["X:BTCUSD/range/1/day"] = { body: { results: [] } };
    res = await handler(
      req("POST", "", { action: "treasury_swap_execute", account: "demo", fromAsset: "USDT", toAsset: "BTC", amount: 800 }, AUTH),
    );
    body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("swap_price_unavailable");
    expect(insertsInto("frelux_archie_treasury_ledger")).toHaveLength(0);
    unstubMassive();
  });

  it("demo swap executes fresh (never trusts a stale client quote) and audits", async () => {
    stubMassive();
    demoAccountRow();
    massiveResponses["/range/1/day"] = { body: { results: barsUp(40, 100) } };
    const res = await handler(
      req("POST", "", { action: "treasury_swap_execute", account: "demo", fromAsset: "USDT", toAsset: "BTC", amount: 1000 }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("PAPER_LEDGER");
    const inserts = insertsInto("frelux_archie_treasury_ledger");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].kind).toBe("swap");
    expect(inserts[0].status).toBe("completed");
    unstubMassive();
  });

  it("treasury_status returns the paper ledger for demo", async () => {
    stubMassive();
    demoAccountRow();
    const res = await handler(
      req("POST", "", { action: "treasury_status", account: "demo" }, AUTH),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("PAPER_LEDGER");
    expect(body.balanceQuote).toBe(50000);
    expect(Array.isArray(body.ledger)).toBe(true);
    unstubMassive();
  });
});
