// =========================================================
// ESCROW-INTELLIGENCE TESTS (batch 23, fix 88)
// Flags are evidence-backed recommendations; dispute
// analysis is for human adjudication; ARCHIE never moves
// funds — the guard is absolute.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assistDisputeAnalysis,
  canArchieMoveFunds,
  ESCROW_AUTHORITY,
  flagTransaction,
} from "@/lib/archie/escrow-intelligence";

describe("flagTransaction", () => {
  const base = {
    transaction_ref: "txn_100",
    topic: "fraud_indicators" as const,
    reason: "mismatched delivery evidence",
    evidence: "evidence doc #7",
    recommended_action: "hold release pending manual review",
  };

  it("requires a transaction reference", () => {
    const r = flagTransaction({ ...base, transaction_ref: " " });
    expect(r.ok).toBe(false);
  });

  it("refuses flags without evidence — AI confidence is never financial truth", () => {
    const r = flagTransaction({ ...base, evidence: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/never financial truth/i);
  });

  it("requires a recommended action", () => {
    expect(flagTransaction({ ...base, recommended_action: " " }).ok).toBe(
      false,
    );
  });

  it("creates a recommendation whose fund authority stays with the provider", () => {
    const r = flagTransaction(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flag.fund_authority).toBe("payment/escrow provider");
      expect(r.flag.recommended_action).toBe(base.recommended_action);
    }
  });
});

describe("assistDisputeAnalysis", () => {
  it("requires reviewed evidence", () => {
    const r = assistDisputeAnalysis({
      transaction_ref: "txn_1",
      positions: ["buyer: not delivered"],
      evidence_reviewed: [],
      analysis: "a",
      recommended_resolution: "r",
    });
    expect(r.ok).toBe(false);
  });

  it("requires a written analysis and defers the decision", () => {
    const r = assistDisputeAnalysis({
      transaction_ref: "txn_1",
      positions: ["buyer", "seller"],
      evidence_reviewed: ["delivery log"],
      analysis: "  ",
      recommended_resolution: "partial refund",
    });
    expect(r.ok).toBe(false);
    const ok = assistDisputeAnalysis({
      transaction_ref: "txn_1",
      positions: ["buyer", "seller"],
      evidence_reviewed: ["delivery log"],
      analysis: "deliveries match milestones 1-2 only",
      recommended_resolution: "partial refund",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok && ok.analysis) {
      expect(ok.analysis.decision_authority).toMatch(
        /payment\/escrow provider \+ human\/business controls/i,
      );
    }
  });
});

describe("the funds guard", () => {
  it("always refuses, for every action", () => {
    const r = canArchieMoveFunds("release escrow");
    expect(r.allowed).toBe(false);
    expect(r.error).toMatch(/never independently move or seize funds/i);
    expect(canArchieMoveFunds().allowed).toBe(false);
    expect(ESCROW_AUTHORITY.may_move_funds).toBe(false);
  });
});
