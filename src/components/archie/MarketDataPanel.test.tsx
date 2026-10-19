// =========================================================
// MARKET DATA PANEL TESTS
//
// Verifies the all-markets live feed surface:
//   * Watchlist quotes render for stocks, crypto AND forex
//   * Entitlement failures render as honest states, not zeros
//   * Feed provenance banner (DAILY granularity) is always shown
//   * Ticker search flows through the Massive reference API
//   * IPO calendar renders real listings
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const fetchMarketQuotes = vi.fn();
const fetchMarketStatus = vi.fn();
const fetchIpos = vi.fn();
const searchTickers = vi.fn();

vi.mock("@/lib/archie/market-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/archie/market-client")>();
  return {
    ...actual,
    fetchMarketQuotes: (...args: unknown[]) => fetchMarketQuotes(...args),
    fetchMarketStatus: (...args: unknown[]) => fetchMarketStatus(...args),
    fetchIpos: (...args: unknown[]) => fetchIpos(...args),
    searchTickers: (...args: unknown[]) => searchTickers(...args),
  };
});

import MarketDataPanel from "./MarketDataPanel";

const quote = (over: Record<string, unknown> = {}) => ({
  symbol: "",
  ticker: "X:BTCUSD",
  price: 82006.85,
  change: 2000,
  changePerc: 2.5,
  open: 80000,
  high: 83000,
  low: 79000,
  volume: 5762,
  asOf: "2026-10-18T00:00:00.000Z",
  granularity: "daily" as const,
  source: "massive" as const,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchMarketQuotes.mockResolvedValue([
    quote(),
    quote({ ticker: "AAPL", price: 232.15, changePerc: -0.4, change: -0.93, high: 235, low: 231 }),
    quote({ ticker: "C:EURUSD", price: 1.0862, changePerc: 0.12, change: 0.0013, high: 1.09, low: 1.08, volume: null }),
    quote({ ticker: "I:SPX", price: null, change: null, changePerc: null, open: null, high: null, low: null, volume: null, asOf: null, error: { kind: "not_entitled" } }),
  ]);
  fetchMarketStatus.mockResolvedValue({
    afterHours: true,
    market: "closed",
    currencies: { crypto: "open", fx: "open" },
  });
  fetchIpos.mockResolvedValue([
    { ticker: "CGL", issuer: "CGL Logistics Holdings Ltd", status: "pending", listingDate: "2026-11-02", finalPrice: 4.0, lowPrice: 4.0, highPrice: 4.0, offerSize: null, exchange: "XASE" },
  ]);
  searchTickers.mockResolvedValue([
    { ticker: "TSLA", name: "Tesla, Inc. Common Stock", market: "stocks", exchange: "XNAS", type: "CS", active: true, currency: "usd" },
  ]);
});

describe("MarketDataPanel — all-markets live feed", () => {
  it("renders real quotes for crypto, stocks and forex with honest granularity", async () => {
    render(<MarketDataPanel />);
    expect(await screen.findByTestId("market-tile-X:BTCUSD")).toBeInTheDocument();
    expect(screen.getByTestId("market-tile-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("market-tile-C:EURUSD")).toBeInTheDocument();
    expect(screen.getByText("82,006.85")).toBeInTheDocument();
    // Provenance banner always declares DAILY granularity
    expect(screen.getByText(/Granularity: DAILY/i)).toBeInTheDocument();
    expect(screen.getByText(/Massive.com daily feed/i)).toBeInTheDocument();
  });

  it("shows honest per-symbol states when the plan lacks entitlement — never fabricated prices", async () => {
    render(<MarketDataPanel />);
    await screen.findByTestId("market-tile-I:SPX");
    expect(screen.getByText("Not entitled on this plan")).toBeInTheDocument();
  });

  it("renders the market status line from the live feed", async () => {
    render(<MarketDataPanel />);
    expect(await screen.findByText(/Crypto open/i)).toBeInTheDocument();
    expect(screen.getByText(/FX open/i)).toBeInTheDocument();
  });

  it("flows ticker search through the Massive reference API", async () => {
    render(<MarketDataPanel />);
    const input = await screen.findByTestId("market-search-input");
    fireEvent.change(input, { target: { value: "tesla" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(searchTickers).toHaveBeenCalledWith("tesla");
    });
    expect(await screen.findByTestId("market-search-results")).toBeInTheDocument();
    expect(screen.getByText("Tesla, Inc. Common Stock")).toBeInTheDocument();
  });

  it("renders the real IPO calendar", async () => {
    render(<MarketDataPanel />);
    expect(await screen.findByText("CGL Logistics Holdings Ltd")).toBeInTheDocument();
    expect(screen.getByText("2026-11-02")).toBeInTheDocument();
  });

  it("surfaces a feed error honestly when the backend is unreachable", async () => {
    fetchMarketQuotes.mockRejectedValue(new Error("upstream down"));
    render(<MarketDataPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Live feed unavailable/i)).toBeInTheDocument();
    });
  });
});
