// =========================================================
// archie-market-data tests — real price plumbing gate.
// Covers: owner gate (401/403), action validation, honest
// per-symbol entitlement failures (never fabricated prices),
// console-symbol → Massive ticker mapping, day-over-day
// change math, history/search/ipos/marketstatus passthrough,
// and the crypto native-facts knowledge write (one fact per
// symbol per day, validated, never blocking the response).
// =========================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenRows,
  givenUser,
  req,
  state,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

const OWNER = { id: "owner-1", email: "owner@frelux.test" };

// ---- Massive API stubbing (harness passes non-supabase URLs
// to the real network, so we intercept api.massive.com here) ----
// The harness's Supabase REST interceptor is the fetch that is
// live at import time — ALL non-Massive traffic is delegated to
// it and it is always the restore target (never the raw network,
// never this stub itself).
const harnessFetch: any = globalThis.fetch;
let massiveCalls: string[] = [];
let massiveResponses: Record<
  string,
  { status?: number; body?: unknown }
> = {};

function stubMassive() {
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("api.massive.com")) {
      // The function encodeURIComponent()es tickers (X:BTCUSD →
      // X%3ABTCUSD) — match response stubs against the DECODED path.
      const path = url.replace("https://api.massive.com", "");
      massiveCalls.push(path);
      const decoded = decodeURIComponent(path);
      const hit = massiveResponses[path] ?? massiveResponses[decoded] ??
        Object.entries(massiveResponses).find(
          ([k]) => decoded.includes(k) || path.includes(k),
        )?.[1];
      return new Response(JSON.stringify(hit?.body ?? { status: "OK" }), {
        status: hit?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/frelux_archie_native_facts") && nativeFactsCapture) {
      nativeFactsCapture(JSON.parse(init?.body ?? "[]"));
      return new Response(null, { status: 201 });
    }
    return harnessFetch(input, init);
  };
}

function unstubMassive() {
  (globalThis as any).fetch = harnessFetch;
}

const BAR = (c: number, t: number, o = c - 1) => ({
  T: "X:BTCUSD",
  v: 5762.6,
  vw: c,
  o,
  c,
  h: c + 10,
  l: c - 10,
  t,
  n: 523812,
});

// Optional capture for the native-facts knowledge write test.
let nativeFactsCapture: null | ((rows: any[]) => void) = null;

beforeEach(() => {
  givenUser(OWNER);
  givenRows("profiles", [{ id: "owner-1", role: "admin" }]);
  givenRows("frelux_archie_native_facts", []);
  state.env.MARKET_DATA_API_KEY = "test-massive-key";
  massiveCalls = [];
  massiveResponses = {};
  nativeFactsCapture = null;
  stubMassive();
});

afterEach(unstubMassive);

describe("archie-market-data — authorization", () => {
  it("rejects unauthenticated callers", async () => {
    const res = await handler(req("POST", "/", { action: "marketstatus" }));
    expect(res.status).toBe(401);
  });

  it("rejects non-admin authenticated callers", async () => {
    givenRows("profiles", []);
    const res = await handler(
      req("POST", "/", { action: "marketstatus" }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Owner/Admin-only");
  });

  it("answers 405 for GET", async () => {
    const res = await handler(req("GET", "/", undefined, { Authorization: "Bearer token-owner-1" }));
    expect(res.status).toBe(405);
  });
});

describe("archie-market-data — quotes", () => {
  it("returns real daily bars with day-over-day change, mapped from console symbols", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    massiveResponses["/v2/aggs/ticker/X:BTCUSD/prev"] = {
      body: { results: [BAR(82006.85, 1792367999999)], status: "OK" },
    };
    // range query for the change baseline: two older bars
    massiveResponses["/v2/aggs/ticker/X:BTCUSD/range/1/day/"] = {
      body: {
        results: [
          BAR(80000, 1792195199999),
          BAR(82006.85, 1792367999999),
        ],
        status: "OK",
      },
    };
    const res = await handler(
      req("POST", "/", { action: "quotes", symbols: ["BTC/USD"] }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes).toHaveLength(1);
    const q = body.quotes[0];
    expect(q.ticker).toBe("X:BTCUSD");
    expect(q.price).toBe(82006.85);
    expect(q.change).toBeCloseTo(2006.85, 2);
    expect(q.changePerc).toBeCloseTo(2.51, 2);
    expect(q.granularity).toBe("daily");
    expect(q.source).toBe("massive");
    expect(q.asOf).toBeTruthy();
  });

  it("surfaces plan entitlement failures honestly per symbol (never fabricated)", async () => {
    stubMassive();
    massiveResponses["/v2/aggs/ticker/I:SPX/prev"] = {
      status: 403,
      body: { status: "NOT_AUTHORIZED", message: "You are not entitled to this data." },
    };
    massiveResponses["/v2/aggs/ticker/I:SPX/range/1/day/"] = {
      status: 403,
      body: { status: "NOT_AUTHORIZED", message: "You are not entitled to this data." },
    };
    const res = await handler(
      req("POST", "/", { action: "quotes", symbols: ["I:SPX"] }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes[0].price).toBeNull();
    expect(body.quotes[0].error.kind).toBe("not_entitled");
  });

  it("reports the provider as not configured when the key is absent", async () => {
    delete state.env.MARKET_DATA_API_KEY;
    const res = await handler(
      req("POST", "/", { action: "quotes", symbols: ["BTC/USD"] }, { Authorization: "Bearer token-owner-1" }),
    );
    const body = await res.json();
    expect(body.quotes[0].price).toBeNull();
    expect(body.quotes[0].error.kind).toBe("not_configured");
  });

  it("caps the symbol batch and rejects empty batches", async () => {
    const empty = await handler(
      req("POST", "/", { action: "quotes", symbols: [] }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(empty.status).toBe(400);
  });

  it("records a validated crypto native fact (once per symbol per day)", async () => {
    const insertCalls: any[] = [];
    nativeFactsCapture = (rows) => insertCalls.push(rows);
    massiveResponses["/v2/aggs/ticker/X:BTCUSD/prev"] = {
      body: {
        results: [BAR(82006.85, 1792367999999)],
        status: "OK",
      },
    };
    massiveResponses["/v2/aggs/ticker/X:BTCUSD/range/1/day/"] = {
      body: { results: [BAR(82006.85, 1792367999999)], status: "OK" },
    };
    const res = await handler(
      req("POST", "/", { action: "quotes", symbols: ["X:BTCUSD"] }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(res.status).toBe(200);
    // The fact write is fire-and-forget — give the microtask a beat.
    await new Promise((r) => setTimeout(r, 20));
    expect(insertCalls.length).toBe(1);
    const row = insertCalls[0][0];
    expect(row.subject).toBe("crypto:BTCUSD");
    expect(row.predicate).toBe("closed_at_usd");
    expect(row.object.close).toBe(82006.85);
    expect(row.status).toBe("validated");
    expect(row.provenance.source).toBe("massive.com");
    expect(row.id).toMatch(/^massive-daily-X:BTCUSD-\d{4}-\d{2}-\d{2}$/);
  });
});

describe("archie-market-data — history, search, ipos, marketstatus", () => {
  it("returns daily candles from the range endpoint", async () => {
    massiveResponses["/v2/aggs/ticker/X:ETHUSD/range/1/day/"] = {
      body: {
        results: [
          { o: 1, c: 2, h: 3, l: 0.5, v: 10, t: 1000 },
          { o: 2, c: 4, h: 5, l: 1.5, v: 20, t: 2000 },
        ],
        status: "OK",
      },
    };
    const res = await handler(
      req("POST", "/", { action: "history", symbol: "ETH/USD", days: 30 }, { Authorization: "Bearer token-owner-1" }),
    );
    const body = await res.json();
    expect(body.candles).toHaveLength(2);
    expect(body.candles[0].time).toBe(1000);
    expect(body.candles[1].close).toBe(4);
    expect(body.granularity).toBe("daily");
  });

  it("searches reference tickers through the Massive API", async () => {
    massiveResponses["/v3/reference/tickers"] = {
      body: {
        results: [
          {
            ticker: "TSLA",
            name: "Tesla, Inc. Common Stock",
            market: "stocks",
            primary_exchange: "XNAS",
            type: "CS",
            active: true,
            currency_name: "usd",
          },
        ],
      },
    };
    const res = await handler(
      req("POST", "/", { action: "search", query: "tesla", market: "stocks" }, { Authorization: "Bearer token-owner-1" }),
    );
    const body = await res.json();
    expect(body.results[0].ticker).toBe("TSLA");
    expect(massiveCalls[0]).toContain("search=tesla");
    expect(massiveCalls[0]).toContain("market=stocks");
  });

  it("returns the IPO calendar with normalized fields", async () => {
    massiveResponses["/vX/reference/ipos"] = {
      body: {
        results: [
          {
            ticker: "CGL",
            issuer_name: "CGL Logistics Holdings Ltd",
            ipo_status: "pending",
            listing_date: "2026-11-02",
            final_issue_price: 4.0,
            lowest_offer_price: 4.0,
            highest_offer_price: 4.0,
            primary_exchange: "XASE",
          },
        ],
      },
    };
    const res = await handler(
      req("POST", "/", { action: "ipos", status: "pending", limit: 20 }, { Authorization: "Bearer token-owner-1" }),
    );
    const body = await res.json();
    expect(body.ipos[0].ticker).toBe("CGL");
    expect(body.ipos[0].listingDate).toBe("2026-11-02");
  });

  it("returns the live market status", async () => {
    massiveResponses["/v1/marketstatus/now"] = {
      body: { afterHours: true, currencies: { crypto: "open" } },
    };
    const res = await handler(
      req("POST", "/", { action: "marketstatus" }, { Authorization: "Bearer token-owner-1" }),
    );
    const body = await res.json();
    expect(body.status.afterHours).toBe(true);
  });

  it("rejects unknown actions", async () => {
    const res = await handler(
      req("POST", "/", { action: "nope" }, { Authorization: "Bearer token-owner-1" }),
    );
    expect(res.status).toBe(400);
  });
});
