// =========================================================
// INFRASTRUCTURE-CLIENT TESTS (batch 26, fix 112)
// Owner-facing views over archie-infra: each action sends the
// right body; failures return { ok: false } envelopes, never
// fake assessment data.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));

import {
  assessInfrastructure,
  getInfrastructureBudgets,
  getInfrastructureCosts,
  getInfrastructureSnapshots,
} from "@/lib/archie/infrastructure-client";

beforeEach(() => invokeMock.mockReset());

describe("assessInfrastructure", () => {
  it("runs a live assessment and returns the view", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, dependencies: [], spend: {}, budgets: [] },
      error: null,
    });
    const r = await assessInfrastructure();
    expect(invokeMock).toHaveBeenCalledWith("archie-infra", {
      body: { action: "assess" },
    });
    expect(r.ok).not.toBe(false);
  });

  it("returns an honest error envelope on edge failure or server refusal", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "not owner" },
    });
    expect(await assessInfrastructure()).toEqual({
      ok: false,
      error: "not owner",
    });
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: "db down" },
      error: null,
    });
    expect(await assessInfrastructure()).toEqual({
      ok: false,
      error: "db down",
    });
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await assessInfrastructure()).toEqual({
      ok: false,
      error: "Assessment failed.",
    });
  });
});

describe("ledger and budget reads", () => {
  it("reads snapshots, costs and budgets with the right actions and limits", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    await getInfrastructureSnapshots(5);
    expect(invokeMock).toHaveBeenLastCalledWith("archie-infra", {
      body: { action: "snapshots", limit: 5 },
    });
    await getInfrastructureCosts(10);
    expect(invokeMock).toHaveBeenLastCalledWith("archie-infra", {
      body: { action: "costs", limit: 10 },
    });
    await getInfrastructureBudgets();
    expect(invokeMock).toHaveBeenLastCalledWith("archie-infra", {
      body: { action: "budgets" },
    });
  });

  it("returns empty lists when none exist, errors when refused", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, snapshots: [] },
      error: null,
    });
    expect(await getInfrastructureSnapshots()).toEqual({
      ok: true,
      snapshots: [],
    });
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, costs: undefined },
      error: null,
    });
    expect(await getInfrastructureCosts()).toEqual({ ok: true, costs: [] });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "denied" },
    });
    expect(await getInfrastructureBudgets()).toEqual({
      ok: false,
      error: "denied",
    });
  });
});
