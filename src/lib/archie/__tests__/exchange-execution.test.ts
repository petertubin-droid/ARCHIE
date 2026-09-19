// =========================================================
// ARCHIE EXCHANGE EXECUTION TESTS
// src/lib/archie/__tests__/exchange-execution.test.ts
//
// Engine inventory #29 — live execution layer. Every safety
// control is tested at its refusal boundary. NO test touches
// a live venue: the Binance adapter runs against an injected
// mock fetcher; the execution engine runs against a fake
// adapter. The signing primitive is verified against a
// published HMAC-SHA256 test vector.
//
//   * MAINNET cannot construct without owner authorization
//   * missing credentials cannot construct — no guessing
//   * emergency stop / ineligible / stale / unauthorized
//     mainnet all refuse BEFORE the venue is touched
//   * pre-flight balance check refuses insufficient or
//     unreadable balances — never bypasses
//   * fills sync into the lifecycle at the ACTUAL fill price
// =========================================================
import { describe, expect, it } from "vitest";
import {
  BinanceSpotAdapter,
  encodeParams,
  hmacSha256Hex,
  toBinanceSymbol,
} from "@studio-shared/archie-ai/native-engine/crypto/exchange/binance.ts";
import {
  executeDecision,
  emergencyCancelAll,
} from "@studio-shared/archie-ai/native-engine/crypto/exchange/execution.ts";
import type {
  VenueAdapter,
  VenueBalance,
  VenueMode,
  VenueOrderRequest,
  VenueOrderResult,
} from "@studio-shared/archie-ai/native-engine/crypto/exchange/venue.ts";
import {
  DEFAULT_TRADING_LIMITS,
  evaluateTradeGate,
  type GateDecision,
  type TradeRequest,
  type TradingLimits,
} from "@studio-shared/archie-ai/native-engine/crypto/trade-gate.ts";
import { buildPrediction } from "@studio-shared/archie-ai/native-engine/crypto/probability.ts";
import type { Candle } from "@studio-shared/archie-ai/native-engine/crypto/market-data.ts";

// ---------------------------------------------------------
// Deterministic fixtures (same family as order-lifecycle)
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

/** Fresh eligible decision — real clock (data_fresh). */
function freshEligibleDecision(): GateDecision {
  const decision = evaluateTradeGate(
    baseRequest(),
    goodPrediction(),
    limits(),
    Date.now(),
  );
  if (decision.eligible) return decision;
  const relaxed = evaluateTradeGate(
    baseRequest(),
    goodPrediction(),
    limits({
      probabilityThreshold: decision.prediction!.calibratedProbability,
    }),
    Date.now(),
  );
  if (!relaxed.eligible) throw new Error("fixture failure: gate refused");
  return relaxed;
}

// ---------------------------------------------------------
// Signing primitive — published HMAC-SHA256 vector
// ---------------------------------------------------------
describe("hmacSha256Hex", () => {
  it("matches the published RFC-style test vector", async () => {
    // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    const sig = await hmacSha256Hex(
      "key",
      "The quick brown fox jumps over the lazy dog",
    );
    expect(sig).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });
});

describe("encodeParams + toBinanceSymbol", () => {
  it("encodes params in insertion order", () => {
    expect(
      encodeParams([
        ["symbol", "BTCUSDT"],
        ["quantity", 1],
      ]),
    ).toBe("symbol=BTCUSDT&quantity=1");
  });
  it("maps ARCHIE symbols to Binance symbols", () => {
    expect(toBinanceSymbol("BTC-USDT")).toBe("BTCUSDT");
    expect(toBinanceSymbol("eth-usdt")).toBe("ETHUSDT");
  });
});

// ---------------------------------------------------------
// Binance adapter — construction gates
// ---------------------------------------------------------
const CREDS = { apiKey: "test-key", apiSecret: "test-secret" };
const FIXED_NOW = 1_726_876_800_000;

describe("BinanceSpotAdapter construction", () => {
  it("REFUSES MAINNET without owner authorization", () => {
    expect(
      () =>
        new BinanceSpotAdapter({
          credentials: CREDS,
          mode: "MAINNET",
          mainnetAuthorizedByOwner: false,
        }),
    ).toThrow(/MAINNET REFUSED/);
  });

  it("REFUSES missing credentials — never guesses", () => {
    expect(
      () =>
        new BinanceSpotAdapter({
          credentials: { apiKey: "", apiSecret: "" },
          mode: "TESTNET",
          mainnetAuthorizedByOwner: false,
        }),
    ).toThrow(/credentials are missing/);
  });

  it("constructs TESTNET without mainnet authorization", () => {
    const a = new BinanceSpotAdapter({
      credentials: CREDS,
      mode: "TESTNET",
      mainnetAuthorizedByOwner: false,
    });
    expect(a.mode).toBe("TESTNET");
    expect(a.venue).toBe("binance-spot");
  });

  it("constructs MAINNET only with owner authorization", () => {
    const a = new BinanceSpotAdapter({
      credentials: CREDS,
      mode: "MAINNET",
      mainnetAuthorizedByOwner: true,
    });
    expect(a.mode).toBe("MAINNET");
  });
});

// ---------------------------------------------------------
// Binance adapter — signed requests against a mock fetcher
// ---------------------------------------------------------
interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function mockFetcher(
  responses: Array<{ status: number; body: unknown }>,
  captured: CapturedCall[],
): typeof fetch {
  let i = 0;
  return (async (url: unknown, init?: RequestInit) => {
    captured.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }) as unknown as typeof fetch;
}

function testnetAdapter(
  responses: Array<{ status: number; body: unknown }>,
  captured: CapturedCall[],
): BinanceSpotAdapter {
  return new BinanceSpotAdapter({
    credentials: CREDS,
    mode: "TESTNET",
    mainnetAuthorizedByOwner: false,
    fetcher: mockFetcher(responses, captured),
    now: () => FIXED_NOW,
  });
}

describe("BinanceSpotAdapter signed requests", () => {
  it("validateOrder calls /api/v3/order/test with correctly signed params", async () => {
    const captured: CapturedCall[] = [];
    const adapter = testnetAdapter([{ status: 200, body: {} }], captured);
    const res = await adapter.validateOrder({
      symbol: "BTC-USDT",
      side: "BUY",
      quantity: 0.123456789,
      authorizedByDecisionId: "d1",
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("VALIDATED (not executed)");
    const call = captured[0];
    // testnet base + path
    expect(
      call.url.startsWith("https://testnet.binance.vision/api/v3/order/test?"),
    ).toBe(true);
    // API key header present, secret NEVER in the URL
    expect(call.headers["X-MBX-APIKEY"]).toBe("test-key");
    expect(call.url).not.toContain("test-secret");
    // quantity trimmed to 6 decimals
    expect(call.url).toContain("quantity=0.123456");
    // fixed clock in the signature
    expect(call.url).toContain(`timestamp=${FIXED_NOW}`);
    // signature param present and hex
    const sig = call.url.split("signature=")[1];
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // the signature is the HMAC of the exact query before it
    const query = call.url.split("?")[1].split("&signature=")[0];
    const recomputed = await hmacSha256Hex("test-secret", query);
    expect(sig).toBe(recomputed);
  });

  it("placeMarketOrder reports the venue orderId and the average fill price", async () => {
    const captured: CapturedCall[] = [];
    const adapter = testnetAdapter(
      [
        {
          status: 200,
          body: {
            orderId: 46666,
            fills: [
              { price: "100.5", qty: "0.5" },
              { price: "101.5", qty: "0.5" },
            ],
          },
        },
      ],
      captured,
    );
    const res = await adapter.placeMarketOrder({
      symbol: "BTC-USDT",
      side: "BUY",
      quantity: 1,
      authorizedByDecisionId: "d1",
    });
    expect(res.ok).toBe(true);
    expect(res.orderId).toBe("46666");
    expect(res.filledPrice).toBeCloseTo(101, 10);
    expect(
      captured[0].url.startsWith(
        "https://testnet.binance.vision/api/v3/order?",
      ),
    ).toBe(true);
  });

  it("surfaces a venue rejection verbatim — ok false, raw attached", async () => {
    const captured: CapturedCall[] = [];
    const adapter = testnetAdapter(
      [
        {
          status: 400,
          body: { code: -1013, msg: "Filter failure: LOT_SIZE" },
        },
      ],
      captured,
    );
    const res = await adapter.placeMarketOrder({
      symbol: "BTC-USDT",
      side: "BUY",
      quantity: 1,
      authorizedByDecisionId: "d1",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe("REJECTED");
    expect((res.raw as { msg: string }).msg).toContain("LOT_SIZE");
  });

  it("reports network failures honestly (no fake success)", async () => {
    const adapter = new BinanceSpotAdapter({
      credentials: CREDS,
      mode: "TESTNET",
      mainnetAuthorizedByOwner: false,
      fetcher: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
      now: () => FIXED_NOW,
    });
    const res = await adapter.placeMarketOrder({
      symbol: "BTC-USDT",
      side: "BUY",
      quantity: 1,
      authorizedByDecisionId: "d1",
    });
    expect(res.ok).toBe(false);
    expect((res.raw as { error: string }).error).toBe("network_failure");
  });

  it("cancelAllOpenOrders counts the cancelled orders", async () => {
    const captured: CapturedCall[] = [];
    const adapter = testnetAdapter(
      [{ status: 200, body: [{ orderId: 1 }, { orderId: 2 }] }],
      captured,
    );
    const res = await adapter.cancelAllOpenOrders("BTC-USDT");
    expect(res.ok).toBe(true);
    expect(res.cancelled).toBe(2);
    expect(captured[0].method).toBe("DELETE");
    expect(captured[0].url).toContain("symbol=BTCUSDT");
  });

  it("getBalances parses the account payload", async () => {
    const captured: CapturedCall[] = [];
    const adapter = testnetAdapter(
      [
        {
          status: 200,
          body: {
            balances: [
              { asset: "USDT", free: "5000.5", locked: "10" },
              { asset: "BTC", free: "0.5", locked: "0" },
            ],
          },
        },
      ],
      captured,
    );
    const balances = await adapter.getBalances();
    expect(balances).toEqual([
      { asset: "USDT", free: 5000.5, locked: 10 },
      { asset: "BTC", free: 0.5, locked: 0 },
    ]);
  });

  it("refuses invalid symbols and non-positive quantities locally", async () => {
    const adapter = testnetAdapter([], []);
    await expect(
      adapter.placeMarketOrder({
        symbol: "no good symbol",
        side: "BUY",
        quantity: 1,
        authorizedByDecisionId: "d",
      }),
    ).rejects.toThrow(/invalid symbol/);
    await expect(
      adapter.placeMarketOrder({
        symbol: "BTC-USDT",
        side: "BUY",
        quantity: -1,
        authorizedByDecisionId: "d",
      }),
    ).rejects.toThrow(/invalid quantity/);
  });
});

// ---------------------------------------------------------
// Execution engine — every refusal boundary
// ---------------------------------------------------------
class FakeAdapter implements VenueAdapter {
  venue = "fake-spot";
  mode: VenueMode;
  calls: string[] = [];
  balances: VenueBalance[];
  validateOk: boolean;
  placeOk: boolean;
  filledPrice: number | null;
  constructor(options: {
    mode?: VenueMode;
    balances?: VenueBalance[];
    validateOk?: boolean;
    placeOk?: boolean;
    filledPrice?: number | null;
  }) {
    this.mode = options.mode ?? "TESTNET";
    this.balances = options.balances ?? [
      { asset: "USDT", free: 10_000, locked: 0 },
      { asset: "BTC", free: 5, locked: 0 },
    ];
    this.validateOk = options.validateOk ?? true;
    this.placeOk = options.placeOk ?? true;
    this.filledPrice = options.filledPrice ?? null;
  }
  async validateOrder(request: VenueOrderRequest): Promise<VenueOrderResult> {
    this.calls.push(`validate:${request.symbol}:${request.side}`);
    return {
      ok: this.validateOk,
      orderId: null,
      filledPrice: null,
      status: this.validateOk ? "VALIDATED" : "REJECTED",
      raw: { request },
    };
  }
  async placeMarketOrder(
    request: VenueOrderRequest,
  ): Promise<VenueOrderResult> {
    this.calls.push(
      `place:${request.symbol}:${request.side}:${request.quantity}`,
    );
    return {
      ok: this.placeOk,
      orderId: this.placeOk ? "42" : null,
      filledPrice: this.placeOk ? this.filledPrice : null,
      status: this.placeOk ? "FILLED" : "REJECTED",
      raw: { request, venue: "raw-response" },
    };
  }
  async cancelAllOpenOrders(symbol: string) {
    this.calls.push(`cancel:${symbol}`);
    return { ok: true, cancelled: 1, raw: {} };
  }
  async getBalances(): Promise<VenueBalance[]> {
    this.calls.push("balances");
    return this.balances;
  }
}

describe("executeDecision refusal boundaries", () => {
  it("REFUSES when the emergency stop is engaged — the venue is never touched", async () => {
    const adapter = new FakeAdapter({});
    const res = await executeDecision(
      freshEligibleDecision(),
      limits({ emergencyStop: true }),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("EMERGENCY STOP");
    expect(adapter.calls).toEqual([]);
  });

  it("REFUSES an ineligible gate decision — structurally", async () => {
    const adapter = new FakeAdapter({});
    const ineligible = evaluateTradeGate(
      baseRequest(),
      goodPrediction(),
      limits({ emergencyStop: true }),
      Date.now(),
    );
    const res = await executeDecision(
      ineligible,
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("INELIGIBLE");
    expect(res.reason).toContain("emergency_stop");
    expect(adapter.calls).toEqual([]);
  });

  it("REFUSES a stale decision — its market data may no longer describe the market", async () => {
    const adapter = new FakeAdapter({});
    const decision = freshEligibleDecision();
    const staleNow = Date.parse(decision.decidedAt) + 60_000; // 60s later
    const res = await executeDecision(decision, limits(), adapter, staleNow);
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("STALE");
    expect(adapter.calls).toEqual([]);
  });

  it("REFUSES a MAINNET adapter without per-session owner authorization", async () => {
    const adapter = new FakeAdapter({ mode: "MAINNET" });
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("NOT authorized");
    expect(adapter.calls).toEqual([]);
  });

  it("REFUSES when the pre-flight balance cannot cover the order", async () => {
    const adapter = new FakeAdapter({
      balances: [{ asset: "USDT", free: 50, locked: 0 }], // 50 < 100 notional
    });
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("pre-flight balance check REFUSED");
    expect(res.reason).toContain("have 50");
    // the order never reached the venue
    expect(adapter.calls).toEqual(["balances"]);
  });

  it("REFUSES when the balance read itself fails — never bypasses the check", async () => {
    const adapter = new (class extends FakeAdapter {
      async getBalances(): Promise<VenueBalance[]> {
        throw new Error("venue 503");
      }
    })({});
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("balance check FAILED");
  });

  it("REFUSES when the venue validation rejects the order", async () => {
    const adapter = new FakeAdapter({ validateOk: false });
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("validation REJECTED");
    expect(res.venueRaw).toBeDefined();
    expect(adapter.calls).toEqual(["balances", "validate:BTC-USDT:BUY"]);
  });

  it("REFUSES (no position) when placement fails after validation", async () => {
    const adapter = new FakeAdapter({ placeOk: false });
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.now(),
    );
    expect(res.executed).toBe(false);
    expect(res.position).toBeNull();
    expect(res.reason).toContain("placement FAILED");
    expect(res.venueRaw).toBeDefined();
  });
});

describe("executeDecision — the one happy path", () => {
  it("executes an eligible fresh decision and syncs the lifecycle at the ACTUAL fill price", async () => {
    const adapter = new FakeAdapter({ filledPrice: 100.75 });
    const res = await executeDecision(
      freshEligibleDecision(),
      limits(),
      adapter,
      Date.parse(freshEligibleDecision().decidedAt) + 1_000,
    );
    expect(res.executed).toBe(true);
    expect(res.position).not.toBeNull();
    // entry synced to the ACTUAL fill, not the intended 100
    expect(res.position?.entryPrice).toBe(100.75);
    // events in order: validated then placed
    const ids = res.events.map((e) => e.id);
    expect(ids[ids.length - 2]).toBe("EXECUTION_VALIDATED");
    expect(ids[ids.length - 1]).toBe("EXECUTION_PLACED");
    // side: long → BUY
    expect(adapter.calls).toContain("balances");
    expect(
      adapter.calls.some((c) => c.startsWith("validate:BTC-USDT:BUY")),
    ).toBe(true);
    expect(adapter.calls.some((c) => c.startsWith("place:BTC-USDT:BUY:"))).toBe(
      true,
    );
  });

  it("sizes the order as quote notional / entry price", async () => {
    const adapter = new FakeAdapter({ filledPrice: 100 });
    const decision = freshEligibleDecision();
    await executeDecision(
      decision,
      limits(),
      adapter,
      Date.parse(decision.decidedAt) + 1_000,
    );
    const placeCall = adapter.calls.find((c) => c.startsWith("place:"));
    // 100 USDT notional at entry 100 → 1 base unit
    expect(placeCall).toBe("place:BTC-USDT:BUY:1");
  });
});

describe("emergencyCancelAll", () => {
  it("cancels per symbol and journals honestly, including failures", async () => {
    const adapter = new (class extends FakeAdapter {
      async cancelAllOpenOrders(symbol: string) {
        if (symbol === "BAD-USDT") throw new Error("venue down");
        return { ok: true, cancelled: 2, raw: {} };
      }
    })({});
    const events = await emergencyCancelAll(
      adapter,
      ["BTC-USDT", "BAD-USDT"],
      FIXED_NOW,
    );
    expect(events.length).toBe(2);
    expect(events[0].detail).toContain("2 open order(s) cancelled");
    expect(events[1].detail).toContain("THREW");
    expect(events[1].detail).toContain("venue down");
  });
});

// ---------------------------------------------------------
// Boot factory — owner credential contract
// ---------------------------------------------------------
import { executionAdapterFromEnv } from "@studio-shared/archie-ai/native-engine/crypto/exchange/boot.ts";

describe("executionAdapterFromEnv", () => {
  it("constructs NOTHING without owner credentials — honest reason", () => {
    const res = executionAdapterFromEnv({});
    expect(res.adapter).toBeNull();
    expect(res.reason).toContain("not provisioned");
  });

  it("defaults to TESTNET when only credentials are provisioned", () => {
    const res = executionAdapterFromEnv({
      BINANCE_API_KEY: "k",
      BINANCE_API_SECRET: "s",
    });
    expect(res.adapter).not.toBeNull();
    expect(res.adapter!.mode).toBe("TESTNET");
  });

  it("REFUSES MAINNET without the owner's explicit authorization flag", () => {
    const res = executionAdapterFromEnv({
      BINANCE_API_KEY: "k",
      BINANCE_API_SECRET: "s",
      BINANCE_MODE: "MAINNET",
    });
    expect(res.adapter).toBeNull();
    expect(res.reason).toContain("REFUSED");
  });

  it("constructs MAINNET only with BINANCE_MAINNET_AUTHORIZED=true", () => {
    const res = executionAdapterFromEnv({
      BINANCE_API_KEY: "k",
      BINANCE_API_SECRET: "s",
      BINANCE_MODE: "MAINNET",
      BINANCE_MAINNET_AUTHORIZED: "true",
    });
    expect(res.adapter).not.toBeNull();
    expect(res.adapter!.mode).toBe("MAINNET");
  });

  it("rejects an invalid mode string honestly", () => {
    const res = executionAdapterFromEnv({
      BINANCE_API_KEY: "k",
      BINANCE_API_SECRET: "s",
      BINANCE_MODE: "sideways",
    });
    expect(res.adapter).toBeNull();
    expect(res.reason).toContain("invalid");
  });
});
