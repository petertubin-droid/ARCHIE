// =========================================================
// ARCHIE TRADING CLIENT TESTS (batch 20, fix 66)
//
// Contracts only: every call hits the archie-trading edge
// function with the right action, and errors surface the
// real edge-function context (FIX 63 pattern) — never a
// generic message.
// =========================================================

import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

import {
  dryRunTrade,
  emergencyCancel,
  executeTrade,
  fetchTradingPositions,
  fetchTradingStatus,
  invokeTrading,
  setTradingState,
} from "@/lib/archie/trading-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trading client contracts", () => {
  it("invokeTrading posts to the archie-trading function", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await invokeTrading({ action: "status" });
    expect(res).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("archie-trading", {
      body: { action: "status" },
    });
  });

  it("surfaces the real edge-function error context", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "non-2xx",
        context: { message: "Trading is Owner/Admin-only." },
      },
    });
    await expect(invokeTrading({ action: "status" })).rejects.toThrow(
      "archie-trading: Trading is Owner/Admin-only.",
    );
  });

  it("falls back to the plain message without context", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "edge down" } });
    await expect(invokeTrading({})).rejects.toThrow(
      "archie-trading: edge down",
    );
  });

  it("fetchTradingStatus sends action status", async () => {
    invoke.mockResolvedValue({
      data: {
        venue: { configured: false },
        state: {},
        credentials: {},
        portfolio: {},
      },
      error: null,
    });
    await fetchTradingStatus();
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "status" });
  });

  it("setTradingState sends emergency_stop and trading_enabled", async () => {
    invoke.mockResolvedValue({ data: { ok: true, state: {} }, error: null });
    await setTradingState({ emergency_stop: true });
    expect(invoke.mock.calls[0][1].body).toEqual({
      action: "set_state",
      emergency_stop: true,
    });
    await setTradingState({ trading_enabled: false });
    expect(invoke.mock.calls[1][1].body).toEqual({
      action: "set_state",
      trading_enabled: false,
    });
  });

  it("dryRunTrade wraps request and evidence without touching a venue", async () => {
    invoke.mockResolvedValue({
      data: {
        dry_run: true,
        eligible: false,
        decision: { checks: [] },
        report: "r",
        note: "n",
      },
      error: null,
    });
    await dryRunTrade({
      request: { symbol: "BTCUSDT" },
      evidence: { probability: 0.7 },
    });
    expect(invoke.mock.calls[0][1].body).toEqual({
      action: "dry_run",
      request: { symbol: "BTCUSDT" },
      evidence: { probability: 0.7 },
    });
  });

  it("executeTrade forwards mainnet_execution_authorized", async () => {
    invoke.mockResolvedValue({
      data: { executed: false, reason: "x", position: null, events: [] },
      error: null,
    });
    await executeTrade({
      request: { symbol: "BTCUSDT" },
      evidence: {},
      mainnet_execution_authorized: true,
    });
    expect(invoke.mock.calls[0][1].body).toEqual({
      action: "execute",
      request: { symbol: "BTCUSDT" },
      evidence: {},
      mainnet_execution_authorized: true,
    });
  });

  it("emergencyCancel sends symbols", async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        emergency_stop_engaged: true,
        events: [],
        venue_mode: "TESTNET",
      },
      error: null,
    });
    await emergencyCancel(["BTCUSDT"]);
    expect(invoke.mock.calls[0][1].body).toEqual({
      action: "emergency_cancel",
      symbols: ["BTCUSDT"],
    });
  });

  it("fetchTradingPositions sends action positions", async () => {
    invoke.mockResolvedValue({
      data: { positions: [], stats: {}, exposure: {} },
      error: null,
    });
    await fetchTradingPositions();
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "positions" });
  });
});
