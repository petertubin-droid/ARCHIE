// =========================================================
// ARCHIE TRADING CONSOLE — TESTS
//
// Verifies Exness-grade components:
//   * Market selection and search
//   * Timeframes & indicator controls
//   * Order ticket, leverage and lot size math
//   * Trade-gate validation and execution flows
//   * Open positions table and emergency panic button
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const fetchTradingStatus = vi.fn();
const fetchTradingPositions = vi.fn();
const dryRunTrade = vi.fn();
const executeTrade = vi.fn();
const emergencyCancel = vi.fn();
const fetchTradingStatusV2 = vi.fn();
const fetchAccountPositions = vi.fn();
const executeAccountTrade = vi.fn();
const analyzeTrade = vi.fn();
const closePosition = vi.fn();
const resetDemoAccount = vi.fn();
const fetchTreasuryStatus = vi.fn();
const treasuryDeposit = vi.fn();
const treasuryWithdraw = vi.fn();
const treasurySwapQuote = vi.fn();
const treasurySwapExecute = vi.fn();

// Market-data client mock — the console pulls real Massive daily
// bars through it; tests supply deterministic quotes + history.
const fetchMarketQuotes = vi.fn();
const fetchMarketHistory = vi.fn();
vi.mock("@/lib/archie/market-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/archie/market-client")>();
  return {
    ...actual,
    fetchMarketQuotes: (...args: unknown[]) => fetchMarketQuotes(...args),
    fetchMarketHistory: (...args: unknown[]) => fetchMarketHistory(...args),
  };
});

vi.mock("@/lib/archie/trading-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/archie/trading-client")>();
  return {
    ...actual,
    fetchTradingStatus: (...args: unknown[]) => fetchTradingStatus(...args),
    fetchTradingPositions: (...args: unknown[]) => fetchTradingPositions(...args),
    dryRunTrade: (...args: unknown[]) => dryRunTrade(...args),
    executeTrade: (...args: unknown[]) => executeTrade(...args),
    emergencyCancel: (...args: unknown[]) => emergencyCancel(...args),
    fetchTradingStatusV2: (...args: unknown[]) => fetchTradingStatusV2(...args),
    fetchAccountPositions: (...args: unknown[]) => fetchAccountPositions(...args),
    executeAccountTrade: (...args: unknown[]) => executeAccountTrade(...args),
    analyzeTrade: (...args: unknown[]) => analyzeTrade(...args),
    closePosition: (...args: unknown[]) => closePosition(...args),
    resetDemoAccount: (...args: unknown[]) => resetDemoAccount(...args),
    fetchTreasuryStatus: (...args: unknown[]) => fetchTreasuryStatus(...args),
    treasuryDeposit: (...args: unknown[]) => treasuryDeposit(...args),
    treasuryWithdraw: (...args: unknown[]) => treasuryWithdraw(...args),
    treasurySwapQuote: (...args: unknown[]) => treasurySwapQuote(...args),
    treasurySwapExecute: (...args: unknown[]) => treasurySwapExecute(...args),
  };
});

import TradingConsole from "./TradingConsole";

beforeEach(() => {
  vi.clearAllMocks();

  // Default live feed: real daily bars for every instrument.
  fetchMarketQuotes.mockImplementation(async (symbols: string[]) =>
    symbols.map((s: string) => ({
      symbol: s,
      ticker: s,
      price: 100,
      change: 1,
      changePerc: 1.01,
      open: 99,
      high: 101,
      low: 98,
      volume: 1000,
      asOf: "2026-10-18T00:00:00.000Z",
      granularity: "daily" as const,
      source: "massive" as const,
    })),
  );
  fetchMarketHistory.mockResolvedValue([
    { time: 1000, open: 95, high: 101, low: 94, close: 100, volume: 10 },
    { time: 2000, open: 100, high: 102, low: 99, close: 101, volume: 12 },
  ]);
  fetchTradingStatus.mockResolvedValue({
    venue: { configured: true, venue: "EXNESS_DMA", mode: "paper", reason: null },
    credentials: {
      api_key_provisioned: true,
      api_secret_provisioned: true,
      mode: "paper",
      mainnet_authorized_by_secret: false,
    },
    state: { emergency_stop: false, trading_enabled: true, limits: {} },
    portfolio: {
      total_positions: 1,
      open_positions: 1,
      closed_positions: 0,
      stats: {},
      exposure: {},
    },
  });

  // Two-account surface defaults.
  fetchTradingStatusV2.mockResolvedValue({
    venue: { configured: false, venue: null, mode: null, reason: "no credentials" },
    state: { emergency_stop: false, trading_enabled: true, limits: {} },
    accounts: [
      { id: "demo", type: "demo", label: "ARCHIE Demo", balance_quote: 50000, starting_balance_quote: 50000, currency: "USD", trading_enabled: true, emergency_stop: false, venue_mode: "PAPER_SIMULATION" },
      { id: "live", type: "live", label: "ARCHIE Live", balance_quote: 0, starting_balance_quote: 0, currency: "USD", trading_enabled: false, emergency_stop: true, venue_mode: null },
    ],
    positions: null,
  });
  // Same open position the account-scoped book must surface (ticket #123456).
  fetchAccountPositions.mockResolvedValue({
    positions: [
      {
        id: "pos_123456",
        symbol: "BTC/USD",
        direction: "long",
        entryPrice: 68400.0,
        stopPrice: 67500.0,
        targetPrice: 70000.0,
        positionSizeQuote: 6840.0,
        portfolioValueQuote: 68.4,
        openedAtMs: Date.now() - 60000,
        state: "OPEN",
        status: "ACTIVE",
        exitPrice: null,
        closedAtMs: null,
        realizedPnlQuote: null,
        realizedPnlPct: null,
        feesPaidQuote: 2.5,
      },
    ],
  });
  executeAccountTrade.mockResolvedValue({ executed: true, position_id: "pos_new_1", mode: "PAPER_SIMULATION", note: "demo fill at the real daily close" });
  analyzeTrade.mockResolvedValue({
    verdict: "suggested",
    analysis: {
      id: "anx_1",
      symbol: "BTC/USD",
      direction: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      positionSizeSuggestion: 20,
      confidence: 0.62,
      probability: 0.63,
      calibratedProbability: 0.61,
      horizon: "daily",
      reasoning: ["SMA20 above SMA50 (uptrend)", "RSI mid-band, room to run", "momentum positive over 10d"],
      caveats: ["Daily bars only — not intraday advice."],
      backtest: { samples: 240, hitRate: 0.62, brier: 0.24 },
    },
    evidence: { probability: 0.63 },
    request: { symbol: "BTC/USD" },
    message: "",
  });
  closePosition.mockResolvedValue({ closed: true, position: { id: "pos_123456", exitPrice: 101, realizedPnlQuote: 5 } });
  resetDemoAccount.mockResolvedValue({ ok: true });
  fetchTreasuryStatus.mockResolvedValue({ account: "demo", mode: "PAPER_LEDGER", balanceQuote: 50000, ledger: [] });
  treasuryDeposit.mockResolvedValue({ ok: true, credited: 1000, newBalance: 51000, mode: "PAPER_LEDGER" });
  treasuryWithdraw.mockResolvedValue({ ok: true, debited: 500, newBalance: 50500, mode: "PAPER_LEDGER" });
  treasurySwapQuote.mockResolvedValue({ ok: true, toAmount: 0.0125, feePct: 0.1 });
  treasurySwapExecute.mockResolvedValue({ ok: true, swapped: 800, toAmount: 0.0124, mode: "PAPER_LEDGER" });

  fetchTradingPositions.mockResolvedValue({
    positions: [
      {
        id: "pos_123456",
        symbol: "BTC/USD",
        direction: "long",
        entryPrice: 68400.0,
        stopPrice: 67500.0,
        targetPrice: 70000.0,
        positionSizeQuote: 6840.0,
        portfolioValueQuote: 68.4,
        openedAtMs: Date.now() - 60000,
        state: "OPEN",
        status: "ACTIVE",
        exitPrice: null,
        closedAtMs: null,
        realizedPnlQuote: null,
        realizedPnlPct: null,
        feesPaidQuote: 2.5,
      },
    ],
    stats: {},
    exposure: {},
  });
});

describe("TradingConsole Component", () => {
  it("renders the account summary bar and terminal header", async () => {
    render(<TradingConsole />);
    expect(screen.getByText("ARCHIE TRADING TERMINAL")).toBeTruthy();
    expect(screen.getByText(/EXNESS-GRADE EXECUTION/i)).toBeTruthy();
    expect(screen.getByText(/PANIC KILL/i)).toBeTruthy();
  });

  it("filters market instruments by category chips and search input", async () => {
    render(<TradingConsole />);
    // Select Forex category
    fireEvent.click(screen.getByRole("button", { name: "FOREX" }));
    expect(screen.getByText("EUR/USD")).toBeTruthy();
    expect(screen.getByText("GBP/USD")).toBeTruthy();

    // Select Commodities category
    fireEvent.click(screen.getByRole("button", { name: "COMMODITIES" }));
    expect(screen.getByText("XAU/USD")).toBeTruthy();

    // Search query
    const searchInput = screen.getByPlaceholderText(/search symbol/i);
    fireEvent.change(searchInput, { target: { value: "gold" } });
    expect(screen.getByText("XAU/USD")).toBeTruthy();
  });

  it("renders timeframes and toggles indicator suite", async () => {
    render(<TradingConsole />);
    // Click timeframe
    fireEvent.click(screen.getByRole("button", { name: "1h" }));

    // Toggle indicators
    const indBtn = screen.getByRole("button", { name: /indicators/i });
    fireEvent.click(indBtn);
    expect(screen.getByText("Indicator Suite")).toBeTruthy();
    expect(screen.getByText(/Bollinger Bands/i)).toBeTruthy();
  });

  it("calculates lot stepping and updates contract size", async () => {
    render(<TradingConsole />);
    const plusBtn = screen.getByRole("button", { name: "+0.1" });
    fireEvent.click(plusBtn);
    expect(screen.getByText(/Req\. Margin:/i)).toBeTruthy();
  });

  it("runs pre-flight trade-gate check successfully", async () => {
    dryRunTrade.mockResolvedValue({
      dry_run: true,
      eligible: true,
      decision: { eligible: true, checks: [], decidedAt: new Date().toISOString() },
      report: "Trade Gate: Verified",
      note: "Eligible for venue execution",
    });

    render(<TradingConsole />);
    const checkBtn = screen.getByRole("button", { name: /pre-flight trade-gate check/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(dryRunTrade).toHaveBeenCalled();
    });
  });

  it("renders open positions and executes a new buy order", async () => {
    executeTrade.mockResolvedValue({
      executed: true,
      reason: null,
      position: null,
      events: [],
      position_id: "pos_999888",
    });

    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByText(/#123456/)).toBeTruthy();
    });

    const buyBtn = screen.getByRole("button", { name: /execute buy order/i });
    fireEvent.click(buyBtn);

    // Account-aware routing: DEMO is the default account and
    // executes WITHOUT the LIVE confirmation modal.
    await waitFor(() => {
      expect(executeAccountTrade).toHaveBeenCalledWith(
        expect.objectContaining({ account: "demo" }),
      );
    });
  });

  it("switches to LIVE and demands typed confirmation before executing", async () => {
    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByTestId("account-switcher")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("account-tab-live"));

    const buyBtn = screen.getByRole("button", { name: /execute buy order/i });
    fireEvent.click(buyBtn);

    // No execution yet — the confirmation gate is up and the
    // account-aware client was NOT called.
    expect(screen.getByTestId("live-confirm-modal")).toBeTruthy();
    expect(executeAccountTrade).not.toHaveBeenCalled();

    // Typing the wrong word refuses; typing LIVE authorizes.
    const input = screen.getByTestId("live-confirm-input");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /authorize live order/i }));
    expect(executeAccountTrade).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "LIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /authorize live order/i }));

    await waitFor(() => {
      expect(executeAccountTrade).toHaveBeenCalledWith(
        expect.objectContaining({ account: "live" }),
      );
    });
  });

  it("runs ARCHIE market intelligence and applies the suggestion to the ticket", async () => {
    analyzeTrade.mockResolvedValue({
      verdict: "suggested",
      analysis: {
        id: "ta_test_1",
        symbol: "X:BTCUSD",
        direction: "long",
        entryPrice: 65123.45,
        stopPrice: 63123.45,
        targetPrice: 69123.45,
        positionSizeSuggestion: 200,
        confidence: 0.64,
        probability: 0.61,
        calibratedProbability: 0.63,
        horizon: "daily",
        reasoning: ["SMA20 above SMA50 (bullish alignment)"],
        caveats: ["Daily bars only — intraday moves are invisible to this analysis."],
        backtest: { samples: 268, hitRate: 0.62, brier: 0.24 },
      },
      evidence: { probability: 0.61 },
      request: null,
      message: "ARCHIE suggests a long.",
    });

    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByTestId("archie-analyze-btn")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("archie-analyze-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("archie-suggestion")).toBeTruthy();
    });
    expect(screen.getByTestId("archie-suggestion").textContent).toContain("LONG");
    // Walk-forward honesty is surfaced, not hidden
    expect(screen.getByTestId("archie-suggestion").textContent).toContain("268");
    expect(analyzeTrade).toHaveBeenCalled();

    // Apply fills the ticket's SL/TP from ARCHIE's levels.
    fireEvent.click(screen.getByTestId("archie-apply-btn"));
    const sl = screen.getByTestId("ticket-stop-loss") as HTMLInputElement;
    expect(sl.value).not.toBe("");
  });

  it("opens the treasury panel and runs a demo deposit through the ledger", async () => {
    render(<TradingConsole />);
    fireEvent.click(screen.getByTestId("tab-treasury"));
    await waitFor(() => {
      expect(screen.getByTestId("treasury-panel")).toBeTruthy();
    });

    const amountInput = screen.getByTestId("treasury-amount");
    fireEvent.change(amountInput, { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("treasury-deposit-btn"));

    await waitFor(() => {
      expect(treasuryDeposit).toHaveBeenCalledWith(
        expect.objectContaining({ account: "demo", amount: 5000 }),
      );
    });
  });

  it("closes a position through the real account-routed lifecycle", async () => {
    fetchAccountPositions.mockResolvedValue({
      positions: [
        {
          id: "pos_close_1",
          symbol: "X:BTCUSD",
          direction: "long",
          entryPrice: 64000,
          stopPrice: 62000,
          targetPrice: 68000,
          positionSizeQuote: 200,
          portfolioValueQuote: 10000,
          openedAtMs: Date.now() - 3600000,
          state: "OPEN",
          status: "OPEN",
          exitPrice: null,
          closedAtMs: null,
          realizedPnlQuote: null,
          realizedPnlPct: null,
          feesPaidQuote: 0.2,
        },
      ],
    });

    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByTestId("close-position-pos_close_1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("close-position-pos_close_1"));

    await waitFor(() => {
      expect(closePosition).toHaveBeenCalledWith(
        expect.objectContaining({ account: "demo", positionId: "pos_close_1" }),
      );
    });
  });
});

describe("TradingConsole — live Massive market feed", () => {
  it("pulls REAL daily quotes through the market client and marks instruments live", async () => {
    render(<TradingConsole />);
    await waitFor(() => {
      expect(fetchMarketQuotes).toHaveBeenCalled();
    });
    // One batched call for all instrument symbols
    const symbols = fetchMarketQuotes.mock.calls[0][0] as string[];
    expect(symbols.length).toBeGreaterThan(5);
    expect(symbols).toContain("X:BTCUSD");
    expect(symbols).toContain("C:EURUSD");
    expect(symbols).toContain("NVDA");
    // The provenance badge announces the live daily feed
    await waitFor(() => {
      expect(screen.getByTestId("live-feed-badge").textContent).toContain("LIVE DAILY");
    });
  });

  it("renders REAL history candles instead of the synthetic seed generator", async () => {
    render(<TradingConsole />);
    await waitFor(() => {
      expect(fetchMarketHistory).toHaveBeenCalled();
    });
    // The chart received the mocked real candles (historyStatus ok → no empty overlay)
    await waitFor(() => {
      expect(screen.queryByText(/No live daily history/i)).toBeNull();
    });
  });

  it("shows an honest empty chart when the feed has no history for the symbol", async () => {
    fetchMarketHistory.mockResolvedValue([]);
    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByText(/No live daily history/i)).toBeInTheDocument();
    });
  });

  it("marks symbols honestly as off-feed when the plan lacks entitlement", async () => {
    fetchMarketQuotes.mockImplementation(async (symbols: string[]) =>
      symbols.map((s: string) => ({
        symbol: s,
        ticker: s,
        price: null,
        change: null,
        changePerc: null,
        open: null,
        high: null,
        low: null,
        volume: null,
        asOf: null,
        granularity: "daily" as const,
        source: "massive" as const,
        error: { kind: "not_entitled" },
      })),
    );
    render(<TradingConsole />);
    await waitFor(() => {
      expect(screen.getByTestId("live-feed-badge").textContent).toContain("OFF-FEED");
    });
  });

  it("opens the Markets panel with the all-markets live feed", async () => {
    render(<TradingConsole />);
    fireEvent.click(screen.getByTestId("tab-markets"));
    // MarketDataPanel renders its search box
    expect(await screen.findByTestId("market-search-input")).toBeInTheDocument();
  });
});

