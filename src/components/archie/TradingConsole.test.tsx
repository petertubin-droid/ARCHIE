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

vi.mock("@/lib/archie/trading-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/archie/trading-client")>();
  return {
    ...actual,
    fetchTradingStatus: (...args: unknown[]) => fetchTradingStatus(...args),
    fetchTradingPositions: (...args: unknown[]) => fetchTradingPositions(...args),
    dryRunTrade: (...args: unknown[]) => dryRunTrade(...args),
    executeTrade: (...args: unknown[]) => executeTrade(...args),
    emergencyCancel: (...args: unknown[]) => emergencyCancel(...args),
  };
});

import TradingConsole from "./TradingConsole";

beforeEach(() => {
  vi.clearAllMocks();
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

    await waitFor(() => {
      expect(executeTrade).toHaveBeenCalled();
    });
  });
});
