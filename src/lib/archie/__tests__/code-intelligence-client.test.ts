// =========================================================
// CODE-INTELLIGENCE-CLIENT TESTS (batch 27, fix 114)
// Real typed access to the live code-intelligence tables:
// findings, traces, patch proposals. Owner decisions are real
// status transitions; approving a patch REQUIRES an approval
// reference; honest errors, no fake data.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

import {
  decidePatchProposal,
  listCalculationTraces,
  listCodeFindings,
  listPatchProposals,
  setFindingStatus,
} from "@/lib/archie/code-intelligence-client";

beforeEach(() => fromMock.mockReset());

const q = (opts: {
  rows?: unknown[] | null;
  err?: { message: string } | null;
  capture?: (u: Record<string, unknown>) => void;
  /** which chain method the real code awaits */
  resolveVia?: "order" | "limit";
}) => {
  const done = { data: opts.rows ?? [], error: opts.err ?? null };
  const maybeDone = (name: "order" | "limit") =>
    name === opts.resolveVia ? Promise.resolve(done) : chain;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => maybeDone("order");
  chain.limit = () => maybeDone("limit");
  chain.update = (u: Record<string, unknown>) => {
    opts.capture?.(u);
    return chain;
  };
  chain.eq = () => Promise.resolve({ error: opts.err ?? null });
  return chain;
};

describe("findings", () => {
  it("lists findings from the real table, newest first", async () => {
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [{ id: "f1", type: "PLACEHOLDER", status: "OPEN" }],
        resolveVia: "order",
      }),
    );
    const findings = await listCodeFindings();
    expect(findings).toHaveLength(1);
    expect(fromMock.mock.calls[0][0]).toBe("archie_code_findings");
  });

  it("applies owner dispositions as real status transitions", async () => {
    const updated: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated, u) }),
    );
    await setFindingStatus("f1", "RESOLVED");
    expect(updated.status).toBe("RESOLVED");
    expect(typeof updated.updated_date).toBe("string");
  });

  it("surfaces read errors honestly", async () => {
    fromMock.mockImplementationOnce(() =>
      q({ rows: null, err: { message: "RLS denied" }, resolveVia: "order" }),
    );
    await expect(listCodeFindings()).rejects.toThrow("RLS denied");
  });
});

describe("calculation traces", () => {
  it("reads provenance traces with a limit", async () => {
    fromMock.mockImplementationOnce(() =>
      q({ rows: [{ id: "t1", valid: true }], resolveVia: "limit" }),
    );
    const traces = await listCalculationTraces(5);
    expect(traces[0].valid).toBe(true);
    expect(fromMock.mock.calls[0][0]).toBe("archie_calculation_traces");
  });
});

describe("patch proposals — owner authority on code changes", () => {
  it("lists proposals from the real table", async () => {
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [{ id: "p1", status: "AWAITING_OWNER_APPROVAL" }],
        resolveVia: "order",
      }),
    );
    const patches = await listPatchProposals();
    expect(patches[0].status).toBe("AWAITING_OWNER_APPROVAL");
  });

  it("refuses to APPROVE without an approval reference", async () => {
    await expect(decidePatchProposal("p1", "APPROVED", "  ")).rejects.toThrow(
      /approval reference is required/i,
    );
  });

  it("records the approval id on APPROVE and clears it on REJECT", async () => {
    const updated: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated, u) }),
    );
    await decidePatchProposal("p1", "APPROVED", "  approval-7  ");
    expect(updated.status).toBe("APPROVED");
    expect(updated.approval_id).toBe("approval-7"); // trimmed
    const updated2: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated2, u) }),
    );
    await decidePatchProposal("p1", "REJECTED", "irrelevant");
    expect(updated2.status).toBe("REJECTED");
    expect(updated2.approval_id).toBeNull(); // rejection clears the reference
  });
});
