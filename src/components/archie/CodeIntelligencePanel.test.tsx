// =========================================================
// ARCHIE CODE INTELLIGENCE — OWNER PANEL (SHARED)
//
// One implementation shared by the PWA and the admin console.
// Every control performs a REAL transition through the
// client functions: finding dispositions, patch decisions.
// Nothing decorative — nothing here is a copy of stored text.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listCodeFindings = vi.fn();
const listCalculationTraces = vi.fn();
const listPatchProposals = vi.fn();
const setFindingStatus = vi.fn();
const decidePatchProposal = vi.fn();

vi.mock("@/lib/archie/code-intelligence-client", () => ({
  listCodeFindings: (...a: unknown[]) => listCodeFindings(...a),
  listCalculationTraces: (...a: unknown[]) => listCalculationTraces(...a),
  listPatchProposals: (...a: unknown[]) => listPatchProposals(...a),
  setFindingStatus: (...a: unknown[]) => setFindingStatus(...a),
  decidePatchProposal: (...a: unknown[]) => decidePatchProposal(...a),
}));

import CodeIntelligencePanel from "@/components/archie/CodeIntelligencePanel";

function finding(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    layer: "L4",
    type: "HONESTY",
    location: "src/lib/archie/example.ts:42",
    evidence: "a claim was asserted without a probe",
    proposed_fix: "probe it",
    status: "NEW",
    created_date: "2026-09-16T00:00:00.000Z",
    updated_date: "2026-09-16T00:00:00.000Z",
    ...over,
  };
}

function patch(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    fixes: [{ file: "a.ts" }],
    description: "fix the honesty defect",
    status: "AWAITING_OWNER_APPROVAL",
    test_evidence: [{ test: "a.test.ts" }],
    approval_id: null,
    created_date: "2026-09-16T00:00:00.000Z",
    updated_date: "2026-09-16T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCodeFindings.mockResolvedValue([finding()]);
  listCalculationTraces.mockResolvedValue([
    {
      id: "t1",
      calculator: "PaintCalculator",
      steps: [{ s: 1 }, { s: 2 }],
      valid: true,
      verdict: { note: "trace matches the formula" },
      traced_at: "2026-09-16T00:00:00.000Z",
    },
  ]);
  listPatchProposals.mockResolvedValue([patch()]);
});

describe("CodeIntelligencePanel", () => {
  it("renders findings with their real evidence and proposed fix", async () => {
    render(<CodeIntelligencePanel />);
    expect(
      await screen.findByText(/a claim was asserted without a probe/i),
    ).toBeTruthy();
    expect(screen.getByText(/Proposed: probe it/i)).toBeTruthy();
    expect(screen.getByText(/src\/lib\/archie\/example\.ts:42/)).toBeTruthy();
  });

  it("marks a finding intentional via a real status transition", async () => {
    setFindingStatus.mockResolvedValue(undefined);
    render(<CodeIntelligencePanel />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /intentional \(owner rule\)/i,
      }),
    );
    await waitFor(() =>
      expect(setFindingStatus).toHaveBeenCalledWith(
        "f1",
        "CONFIRMED_INTENTIONAL",
      ),
    );
  });

  it("marks a finding resolved via a real status transition", async () => {
    setFindingStatus.mockResolvedValue(undefined);
    render(<CodeIntelligencePanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /mark resolved/i }),
    );
    await waitFor(() =>
      expect(setFindingStatus).toHaveBeenCalledWith("f1", "RESOLVED"),
    );
  });

  it("hides disposition buttons for already-settled findings", async () => {
    listCodeFindings.mockResolvedValue([finding({ status: "RESOLVED" })]);
    render(<CodeIntelligencePanel />);
    await screen.findByText(/src\/lib\/archie\/example\.ts:42/);
    expect(screen.queryByRole("button", { name: /mark resolved/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /intentional \(owner rule\)/i }),
    ).toBeNull();
  });

  it("renders calculation traces with the live validity verdict", async () => {
    render(<CodeIntelligencePanel />);
    fireEvent.click(await screen.findByRole("button", { name: /traces/i }));
    expect(await screen.findByText("PaintCalculator")).toBeTruthy();
    expect(screen.getByText("TRACE VALID")).toBeTruthy();
    expect(screen.getByText(/trace matches the formula/i)).toBeTruthy();
    expect(screen.getByText(/2 traced steps/i)).toBeTruthy();
  });

  it("shows pending patches awaiting the Owner, with the decision flow", async () => {
    render(<CodeIntelligencePanel />);
    expect(await screen.findByText(/1 awaiting you/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /patches/i }));
    expect(await screen.findByText(/fix the honesty defect/i)).toBeTruthy();
    expect(screen.getByText(/1 test evidence item\(s\)/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reject/i })).toBeTruthy();
  });

  it("REJECTS a patch through the real decision function", async () => {
    decidePatchProposal.mockResolvedValue(undefined);
    render(<CodeIntelligencePanel />);
    fireEvent.click(await screen.findByRole("button", { name: /patches/i }));
    fireEvent.click(await screen.findByRole("button", { name: /reject/i }));
    await waitFor(() =>
      expect(decidePatchProposal).toHaveBeenCalledWith("p1", "REJECTED", ""),
    );
  });

  it("APPROVES a patch only with an explicit owner approval reference", async () => {
    decidePatchProposal.mockResolvedValue(undefined);
    const promptMock = vi.fn().mockReturnValue("change-request #12");
    vi.stubGlobal("prompt", promptMock);
    render(<CodeIntelligencePanel />);
    fireEvent.click(await screen.findByRole("button", { name: /patches/i }));
    fireEvent.click(await screen.findByRole("button", { name: /approve/i }));

    expect(promptMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(decidePatchProposal).toHaveBeenCalledWith(
        "p1",
        "APPROVED",
        "change-request #12",
      ),
    );
    // No reference → no approval, no exception. Owner Authority is explicit.
    promptMock.mockReturnValue("");
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(decidePatchProposal).toHaveBeenCalledTimes(1));
    promptMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("hides the decision flow for patches not awaiting the owner", async () => {
    listPatchProposals.mockResolvedValue([
      patch({ status: "APPROVED", approval_id: "cr-9" }),
    ]);
    render(<CodeIntelligencePanel />);
    fireEvent.click(await screen.findByRole("button", { name: /patches/i }));
    await screen.findByText(/Approved under: cr-9/i);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("surfaces load failures honestly in the alert region", async () => {
    listCodeFindings.mockRejectedValue(new Error("RLS refused the read"));
    render(<CodeIntelligencePanel />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/RLS refused the read/i)).toBeTruthy();
  });
});
