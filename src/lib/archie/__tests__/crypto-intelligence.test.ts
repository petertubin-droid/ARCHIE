import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import type { Fetcher } from "@studio-shared/archie-ai/native-engine/crypto/market-data.ts";

function turns(text: string) {
  return [{ role: "owner" as const, parts: [{ text }] }];
}

// H-2 wiring (audit fix 2026-09-11): the crypto intelligence
// libraries are now REACHABLE from conversation. Every price is
// observed from a real venue (fixtures here; live fetch in
// production) or the failure is reported honestly — never
// simulated.

/** Deterministic fixture fetcher: coinbase + kraken answer
 *  live prices for BTC-USD/ETH-USD; every other venue reports
 *  HTTP 403 (geo-block) — the honest-unavailability path. */
function fixtureFetcher(opts?: { failAll?: boolean }): Fetcher {
  const now = Math.floor(Date.now() / 1000);
  // 400 hourly candles, gentle uptrend around 3000 for ETH
  const candles = Array.from({ length: 400 }, (_, i) => {
    const t = now - (400 - i) * 3600;
    const base = 3000 + i * 0.5 + Math.sin(i / 7) * 8;
    return [t, base - 5, base + 5, base - 2, base + 2, 120 + (i % 30)];
  });
  return async (url: string) => {
    if (opts?.failAll) {
      return { ok: false, status: 403, json: async () => ({}) };
    }
    if (url.includes("api.exchange.coinbase.com/products/ETH-USD/ticker")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          price: "3012.5",
          bid: "3011",
          ask: "3014",
          volume: "1234",
        }),
      };
    }
    if (url.includes("api.exchange.coinbase.com/products/ETH-USD/candles")) {
      return { ok: true, status: 200, json: async () => candles };
    }
    if (url.includes("api.kraken.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          error: [],
          result: {
            XETHZUSD: {
              c: ["3010.1", "1"],
              b: ["3009", "1"],
              a: ["3011", "1"],
              h: ["3050", "1"],
              l: ["2980", "1"],
              v: ["5000", "5000"],
              p: ["3008", "1"],
            },
          },
        }),
      };
    }
    // okx / kucoin / coingecko / binance / bybit: honest 403
    return { ok: false, status: 403, json: async () => ({}) };
  };
}

function cryptoEngine(): ArchieNativeEngine {
  return new ArchieNativeEngine({ cryptoFetcher: fixtureFetcher() });
}

async function ask(engine: ArchieNativeEngine, text: string): Promise<string> {
  const res = await engine.generate({
    turns: turns(text),
    tools: [],
    systemInstruction: "",
  });
  return res.parts[0].text ?? "";
}

describe("crypto market intelligence wiring (audit fix H-2)", () => {
  it("routes crypto price questions to crypto_market_query, not the materials price rule", async () => {
    const engine = cryptoEngine();
    const text = await ask(engine, "what is the price of bitcoin");
    expect(text).toContain("BTC-USD consensus");
    expect(text).not.toContain("market intelligence crawler");
  });

  it("price snapshot carries multi-venue provenance and honest unavailable-venue reporting", async () => {
    const engine = cryptoEngine();
    const text = await ask(engine, "how much is ethereum worth");
    expect(text).toContain("ETH-USD consensus $");
    expect(text).toMatch(/across 2 live venues \(coinbase, kraken\)/);
    expect(text).toMatch(/5 venue\(s\) unavailable, reported honestly/);
    expect(text).toContain("not financial advice");
  });

  it("unknown asset asks honestly instead of guessing", async () => {
    const engine = cryptoEngine();
    const text = await ask(engine, "what is the crypto price of zcash");
    expect(text).toMatch(/Ask me for a live crypto price/i);
  });

  it("all venues unavailable → honest refusal, never a fabricated price", async () => {
    const engine = new ArchieNativeEngine({
      cryptoFetcher: fixtureFetcher({ failAll: true }),
    });
    const text = await ask(engine, "what is the price of bitcoin");
    expect(text).toMatch(/could not get a live BTC-USD price/);
    expect(text).toContain("I will not fabricate a market price");
  });

  it("incomplete trade plan asks for the missing parameters", async () => {
    const engine = cryptoEngine();
    const text = await ask(
      engine,
      "should i buy eth with entry 3000, stop 2800",
    );
    expect(text).toMatch(/take-profit target, position size, portfolio value/);
    expect(text).toContain(
      "I will not evaluate a trade with guessed parameters",
    );
  });

  it("full trade evaluation runs the real evidence pipeline and renders a gate decision", async () => {
    const engine = cryptoEngine();
    const text = await ask(
      engine,
      "should i buy eth, entry 3000, stop 2850, target 3300, size 500, portfolio 50000",
    );
    // The gate VERDICT is whatever the real pipeline decides on
    // this evidence — the test pins the honesty frame, not the
    // trade outcome.
    expect(text).toMatch(/TRADE ELIGIBLE|NO TRADE/);
    expect(text).toMatch(
      /Calibrated probability for a long ETH position: \d+\.\d+%/,
    );
    expect(text).toMatch(
      /60m candles, 4h horizon, walk-forward validated on \d+ samples/,
    );
    expect(text).toContain("not financial advice");
  });

  it("an owner-configured emergency stop fails every trade at the gate", async () => {
    const { DEFAULT_TRADING_LIMITS } =
      await import("@studio-shared/archie-ai/native-engine/crypto/trade-gate.ts");
    const engine = new ArchieNativeEngine({
      cryptoFetcher: fixtureFetcher(),
      tradingLimits: { ...DEFAULT_TRADING_LIMITS, emergencyStop: true },
    });
    const text = await ask(
      engine,
      "should i buy eth, entry 3000, stop 2850, target 3300, size 500, portfolio 50000",
    );
    expect(text).toContain("NO TRADE");
    expect(text).toContain("OWNER EMERGENCY STOP IS ENGAGED");
  });

  it("teaching is unaffected — the crypto route never mints facts", async () => {
    const engine = cryptoEngine();
    await ask(engine, "remember that my cold wallet address is bc1qtest");
    const fact = engine
      .rankKnowledge("cold wallet address")
      .find(
        (f) =>
          f.subject.includes("cold-wallet") || f.subject.includes("wallet"),
      );
    expect(fact).toBeDefined();
    expect(fact!.status).toBe("owner-asserted");
  });
});
