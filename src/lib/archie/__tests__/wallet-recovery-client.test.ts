// =========================================================
// ARCHIE WALLET RECOVERY CLIENT TESTS (batch 21, fix 71)
// Contracts: right action per call, real error surfacing.
// =========================================================

import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

import {
  fetchRecoveryJobs,
  fetchRecoveryMeta,
  runRecovery,
} from "@/lib/archie/wallet-recovery-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wallet-recovery client contracts", () => {
  it("fetchRecoveryMeta sends action meta", async () => {
    invoke.mockResolvedValue({
      data: {
        caps: { maxCandidates: 64, maxPassphrases: 8, maxPaths: 10 },
        chains: [],
        contract: [],
      },
      error: null,
    });
    await fetchRecoveryMeta();
    expect(invoke.mock.calls[0][0]).toBe("archie-wallet-recovery");
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "meta" });
  });

  it("runRecovery sends the spec under action recover", async () => {
    invoke.mockResolvedValue({
      data: {
        result: { found: false, results: [], attempts: {} },
        report: "r",
        ledger_warning: null,
      },
      error: null,
    });
    const spec = {
      template: { slots: ["a", null], candidates: ["x"] },
      passphrases: [""],
    };
    await runRecovery(spec);
    expect(invoke.mock.calls[0][1].body).toEqual({
      action: "recover",
      spec,
    });
  });

  it("fetchRecoveryJobs sends action jobs", async () => {
    invoke.mockResolvedValue({ data: { jobs: [] }, error: null });
    await fetchRecoveryJobs();
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "jobs" });
  });

  it("surfaces the real edge error context", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "non-2xx",
        context: { message: "Wallet recovery is Owner/Admin-only." },
      },
    });
    await expect(fetchRecoveryMeta()).rejects.toThrow(
      "archie-wallet-recovery: Wallet recovery is Owner/Admin-only.",
    );
  });
});
