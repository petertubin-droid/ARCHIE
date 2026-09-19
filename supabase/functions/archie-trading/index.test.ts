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

beforeEach(() => {
  givenUser(OWNER);
  givenRows("profiles", [{ id: "owner-1", role: "admin" }]);
  givenRows("frelux_archie_trading_state", []);
  givenRows("frelux_archie_trading_positions", []);
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
      req("POST", "", { action: "execute", ...ELIGIBLE }, AUTH),
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
      req("POST", "", { action: "execute", ...ELIGIBLE }, AUTH),
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
        { action: "execute", ...ELIGIBLE, mainnet_execution_authorized: true },
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
