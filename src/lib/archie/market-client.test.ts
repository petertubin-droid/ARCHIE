// =========================================================
// MARKET CLIENT TESTS
//
// Verifies the PWA-side contract with the owner-gated
// archie-market-data edge function:
//   * invocations carry the right action payloads
//   * edge errors surface honestly (real context message)
//   * console symbol → Massive ticker mapping
//   * graceful empty-array handling on missing payloads
// =========================================================

import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

import {
  consoleSymbolToTicker,
  fetchIpos,
  fetchMarketHistory,
  fetchMarketQuotes,
  fetchMarketStatus,
  invokeMarketData,
  searchTickers,
} from "@/lib/archie/market-client";

const ok = (data: unknown) => ({ data, error: null });

beforeEach(() => {
  invokeMock.mockReset();
});

describe("invokeMarketData", () => {
  it("routes to the archie-market-data function with the action body", async () => {
    invokeMock.mockResolvedValueOnce(ok({ quotes: [] }));
    await fetchMarketQuotes(["X:BTCUSD"]);
    expect(invokeMock).toHaveBeenCalledWith("archie-market-data", {
      body: { action: "quotes", symbols: ["X:BTCUSD"] },
    });
  });

  it("surfaces the real edge error context, never a generic message", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { message: "Market data is Owner/Admin-only." },
      },
    });
    await expect(fetchMarketQuotes(["X:BTCUSD"])).rejects.toThrow(
      "archie-market-data: Market data is Owner/Admin-only.",
    );
  });
});

describe("payload building", () => {
  it("requests daily history with a day span", async () => {
    invokeMock.mockResolvedValueOnce(ok({ candles: [] }));
    await fetchMarketHistory("ETH/USD", 90);
    expect(invokeMock.mock.calls[0][1].body).toEqual({
      action: "history",
      symbol: "ETH/USD",
      days: 90,
    });
  });

  it("searches with a market filter", async () => {
    invokeMock.mockResolvedValueOnce(ok({ results: [] }));
    await searchTickers("tesla", "stocks");
    expect(invokeMock.mock.calls[0][1].body).toEqual({
      action: "search",
      query: "tesla",
      market: "stocks",
      limit: 20,
    });
  });

  it("requests the IPO calendar with a status filter", async () => {
    invokeMock.mockResolvedValueOnce(ok({ ipos: [] }));
    await fetchIpos("pending");
    expect(invokeMock.mock.calls[0][1].body).toEqual({
      action: "ipos",
      status: "pending",
      limit: 30,
    });
  });

  it("returns empty arrays gracefully on missing payloads", async () => {
    invokeMock.mockResolvedValueOnce(ok({}));
    expect(await fetchMarketQuotes([])).toEqual([]);
    invokeMock.mockResolvedValueOnce(ok({}));
    expect(await fetchMarketStatus()).toBeNull();
  });
});

describe("consoleSymbolToTicker", () => {
  it("maps crypto, forex, stock and index styles to Massive tickers", () => {
    expect(consoleSymbolToTicker("BTC/USD")).toBe("X:BTCUSD");
    expect(consoleSymbolToTicker("ETHUSD")).toBe("X:ETHUSD");
    expect(consoleSymbolToTicker("EUR/USD")).toBe("C:EURUSD");
    expect(consoleSymbolToTicker("XAU/USD")).toBe("C:XAUUSD");
    expect(consoleSymbolToTicker("NVDA")).toBe("NVDA");
    expect(consoleSymbolToTicker("AAPL")).toBe("AAPL");
  });
});
