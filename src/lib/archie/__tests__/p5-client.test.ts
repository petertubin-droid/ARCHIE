// =========================================================
// ARCHIE P5 OPS CLIENT TESTS (Phase 8 P5)
//
// The client sends intent; the server enforces governance.
// Pinned: every console operation posts its documented action
// to archie-agents / archie-crypto, transport failures THROW
// (callers show the console an error, never silent success).
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from "@/lib/supabase";
import {
  invokeAgents,
  invokeCrypto,
  spawnFleet,
  advanceAgent,
  recordInfrastructureCost,
  budgetStatus,
  fetchCryptoMarket,
  recordCryptoAnalysis,
  portfolioRisk,
} from "@/lib/archie/p5-client";

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke.mockReset();
});

async function bodyOf(
  fn: () => Promise<unknown>,
  call = 0,
): Promise<Record<string, unknown>> {
  await fn();
  return (invoke.mock.calls[call][1] as { body: Record<string, unknown> }).body;
}

describe("transport envelope", () => {
  it("invokeAgents returns the server's data unchanged", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, decision: "SPAWN" },
      error: null,
    });
    const res = await invokeAgents({ action: "spawn_fleet", agents: [] });
    expect(res).toEqual({ ok: true, decision: "SPAWN" });
    expect(invoke).toHaveBeenCalledWith("archie-agents", {
      body: { action: "spawn_fleet", agents: [] },
    });
  });

  it("transport failures THROW — the console never shows silent success", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "budget gate unreachable" },
    });
    await expect(budgetStatus()).rejects.toThrow("budget gate unreachable");
  });

  it("invokeCrypto targets archie-crypto", async () => {
    invoke.mockResolvedValue({
      data: { classification: "informational" },
      error: null,
    });
    await invokeCrypto({ action: "market", symbols: ["BTC"] });
    expect(invoke).toHaveBeenCalledWith("archie-crypto", {
      body: { action: "market", symbols: ["BTC"] },
    });
  });
});

describe("agent lifecycle ops", () => {
  it("spawnFleet posts the fleet for server-side budget checks", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const agents = [{ role: "research", task: "t", estimated_cost_cents: 10 }];
    expect(await bodyOf(() => spawnFleet(agents))).toEqual({
      action: "spawn_fleet",
      agents,
    });
  });

  it("advanceAgent posts lifecycle + event, detail defaults to {}", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(() => advanceAgent("ag-1", "TERMINATE"))).toEqual({
      action: "lifecycle",
      agent_id: "ag-1",
      event: "TERMINATE",
      detail: {},
    });
  });

  it("recordInfrastructureCost spreads the ledger entry", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(
      await bodyOf(() =>
        recordInfrastructureCost({
          provider: "openai",
          operation: "tokens",
          agent_id: "ag-1",
          cost_actual_cents: 42,
        }),
      ),
    ).toEqual({
      action: "record_cost",
      provider: "openai",
      operation: "tokens",
      agent_id: "ag-1",
      cost_actual_cents: 42,
    });
  });

  it("budgetStatus posts the documented action", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(() => budgetStatus())).toEqual({
      action: "budget_status",
    });
  });
});

describe("crypto ops", () => {
  it("market fetch carries the requested symbols", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(() => fetchCryptoMarket(["BTC", "ETH"]))).toEqual({
      action: "market",
      symbols: ["BTC", "ETH"],
    });
  });

  it("recordCryptoAnalysis spreads the analysis record (guardrails server-side)", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(
      await bodyOf(() =>
        recordCryptoAnalysis({
          asset_symbol: "BTC",
          classification: "informational",
          statement: "observed volatility",
          evidence: ["e1"],
          confidence: 0.4,
        }),
      ),
    ).toEqual({
      action: "record_analysis",
      asset_symbol: "BTC",
      classification: "informational",
      statement: "observed volatility",
      evidence: ["e1"],
      confidence: 0.4,
    });
  });

  it("portfolioRisk posts owner-recorded holdings", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const holdings = [{ symbol: "BTC", value: 100 }];
    expect(await bodyOf(() => portfolioRisk(holdings))).toEqual({
      action: "portfolio_risk",
      holdings,
    });
  });
});
