// =========================================================
// EVOLUTION-CHANGE-REQUEST TESTS (batch 28, fix 129)
// The change-request state machine: complete proposals only;
// protected surfaces flagged at creation; ARCHIE can withdraw
// only its own unsubmitted proposal; staging needs a prior
// owner authorization; PASSED requires consistent results;
// EXECUTED needs a SEPARATE production authorization and a
// real commit; rollback needs recovery information.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  buildApprovalView,
  createChangeRequest,
  formatCrNumber,
  isTerminalCrState,
  OWNER_GATED,
  prepareRollback,
  transitionChangeRequest,
  type CreateChangeRequestInput,
} from "@/lib/archie/evolution/change-request";
import type { EvolutionChangeRequest } from "@/lib/archie/evolution/types";

const NOW = "2026-09-15T00:00:00Z";
const OWNER_APPROVAL = {
  actor: "OWNER" as const,
  authorizationRecordId: "rec-stage",
  serverVerified: true,
};

function input(
  over: Partial<CreateChangeRequestInput> = {},
): CreateChangeRequestInput {
  return {
    title: "Fix login rounding",
    description: "Rounds quote totals correctly",
    reason: "Owner report: totals off by 1 kobo",
    affectedFiles: ["src/lib/quote.ts"],
    affectedComponents: ["Quotations"],
    proposedDiff: "+ fix",
    dependencies: [],
    securityImpact: "none",
    dataImpact: "none",
    regressionRisk: "low",
    testPlan: "vitest src/lib/quote.test.ts",
    rollbackPlan: "git revert",
    requestedLevel: "staging",
    archieVersion: "1.0.0",
    now: NOW,
    ...over,
  };
}

function created(
  over: Partial<CreateChangeRequestInput> = {},
): EvolutionChangeRequest {
  const r = createChangeRequest(input(over), "cr-1", "CR-2026-0001");
  if (!r.ok) throw new Error(r.error);
  return r.request;
}

describe("creation", () => {
  it("formats sequential CR numbers per year", () => {
    expect(formatCrNumber(2026, 1)).toBe("CR-2026-0001");
    expect(formatCrNumber(2026, 12345)).toBe("CR-2026-12345");
  });

  it("refuses half-proposals — every owner-decision field must be present", () => {
    const required: Array<[keyof CreateChangeRequestInput, RegExp]> = [
      ["title", /requires a title/i],
      ["description", /requires a description/i],
      ["reason", /requires a reason/i],
      ["proposedDiff", /requires a proposed diff/i],
      ["securityImpact", /requires a security impact/i],
      ["dataImpact", /requires a data impact/i],
      ["testPlan", /requires a test plan/i],
      ["rollbackPlan", /requires a rollback plan/i],
    ];
    for (const [field, pattern] of required) {
      const r = createChangeRequest(
        input({ [field]: " " } as never),
        "cr-1",
        "CR-2026-0001",
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(pattern);
    }
    expect(
      createChangeRequest(input({ affectedFiles: [] }), "cr-1", "CR-2026-0001")
        .ok,
    ).toBe(false);
    expect(
      createChangeRequest(input({ archieVersion: " " }), "cr-1", "CR-2026-0001")
        .ok,
    ).toBe(false);
  });

  it("flags protected-surface changes for owner intervention at creation", () => {
    const r = created({ affectedFiles: ["rls_policies", "src/lib/quote.ts"] });
    expect(r.requiresOwnerIntervention).toBe(true);
    expect(r.flags).toContain("OWNER_INTERVENTION_REQUIRED");
    expect(r.ownerAuthorizationStatus).toBe("none");
    expect(r.state).toBe("PROPOSED");
    const clean = created();
    expect(clean.requiresOwnerIntervention).toBe(false);
  });
});

describe("the transition machine", () => {
  it("refuses terminal states, invalid transitions and double authorization", () => {
    expect(isTerminalCrState("EXECUTED")).toBe(false);
    expect(isTerminalCrState("REJECTED")).toBe(true);
    expect(isTerminalCrState("ROLLED_BACK")).toBe(true);
    expect([...OWNER_GATED]).toEqual([
      "AUTHORIZED",
      "EXECUTED",
      "ROLLED_BACK",
      "REJECTED",
    ]);
    const rejected = { ...created(), state: "REJECTED" as const };
    expect(
      transitionChangeRequest(rejected, "PROPOSED", {
        now: NOW,
        actor: "OWNER",
      }).ok,
    ).toBe(false);
    expect(
      transitionChangeRequest(created(), "EXECUTED", {
        now: NOW,
        actor: "ARCHIE",
      }).ok,
    ).toBe(false);
  });

  it("submits complete proposals for owner decision; ARCHIE withdraws only unsubmitted ones", () => {
    const r = transitionChangeRequest(created(), "AWAITING_OWNER", {
      now: NOW,
      actor: "ARCHIE",
      proposalComplete: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.state).toBe("AWAITING_OWNER");
      expect(r.audit.action).toBe("submit_for_owner_decision");
    }
    expect(
      transitionChangeRequest(created(), "AWAITING_OWNER", {
        now: NOW,
        actor: "ARCHIE",
        proposalComplete: false,
      }).ok,
    ).toBe(false);
    // ARCHIE cannot reject after submission; OWNER can, recording the decision.
    const awaiting = (
      transitionChangeRequest(created(), "AWAITING_OWNER", {
        now: NOW,
        actor: "ARCHIE",
        proposalComplete: true,
      }) as { request: EvolutionChangeRequest }
    ).request;
    expect(
      transitionChangeRequest(awaiting, "REJECTED", {
        now: NOW,
        actor: "ARCHIE",
      }).ok,
    ).toBe(false);
    const ownerReject = transitionChangeRequest(awaiting, "REJECTED", {
      now: NOW,
      actor: "OWNER",
      approval: OWNER_APPROVAL,
    });
    expect(ownerReject.ok && ownerReject.request.ownerAuthorizationStatus).toBe(
      "rejected",
    );
    // ARCHIE CAN withdraw its own unsubmitted proposal.
    const withdrawn = transitionChangeRequest(created(), "REJECTED", {
      now: NOW,
      actor: "ARCHIE",
    });
    expect(withdrawn.ok).toBe(true);
  });

  it("requires server-verified owner authorization to stage, and an environment reference", () => {
    const awaiting = (
      transitionChangeRequest(created(), "AWAITING_OWNER", {
        now: NOW,
        actor: "ARCHIE",
        proposalComplete: true,
      }) as { request: EvolutionChangeRequest }
    ).request;
    expect(
      transitionChangeRequest(awaiting, "AUTHORIZED", {
        now: NOW,
        actor: "ARCHIE",
        approval: OWNER_APPROVAL,
      }).ok,
    ).toBe(false); // ARCHIE cannot authorize itself
    const authorized = (
      transitionChangeRequest(awaiting, "AUTHORIZED", {
        now: NOW,
        actor: "OWNER",
        approval: OWNER_APPROVAL,
      }) as { request: EvolutionChangeRequest }
    ).request;
    expect(authorized.ownerAuthorizationStatus).toBe("staging_authorized");
    expect(
      transitionChangeRequest(authorized, "STAGING", {
        now: NOW,
        actor: "ARCHIE",
      }).ok,
    ).toBe(false);
    const staged = transitionChangeRequest(authorized, "STAGING", {
      now: NOW,
      actor: "ARCHIE",
      stagingEnvironment: "staging-db-42",
    });
    expect(staged.ok).toBe(true);
  });

  it("requires consistent test results for PASSED/FAILED", () => {
    const staged = {
      ...created(),
      state: "STAGING" as const,
      ownerAuthorizationStatus: "staging_authorized" as const,
    };
    const testing = (
      transitionChangeRequest(staged, "TESTING", {
        now: NOW,
        actor: "ARCHIE",
      }) as { request: EvolutionChangeRequest }
    ).request;
    const allPassed = {
      summary: "all_passed",
      checks: [{ name: "t", status: "passed" }],
    } as never;
    const failed = {
      summary: "failures",
      checks: [{ name: "t", status: "failed" }],
    } as never;
    expect(
      transitionChangeRequest(testing, "PASSED", { now: NOW, actor: "ARCHIE" })
        .ok,
    ).toBe(false);
    expect(
      transitionChangeRequest(testing, "PASSED", {
        now: NOW,
        actor: "ARCHIE",
        testResults: failed,
      }).ok,
    ).toBe(false);
    const passed = transitionChangeRequest(testing, "PASSED", {
      now: NOW,
      actor: "ARCHIE",
      testResults: allPassed,
    });
    expect(passed.ok).toBe(true);
  });

  it("EXECUTED requires a SEPARATE production authorization and the resulting commit", () => {
    const passed: EvolutionChangeRequest = {
      ...created(),
      state: "PASSED",
      ownerAuthorizationStatus: "staging_authorized",
      stagingAuthorizationRecordId: "rec-stage",
    };
    // Reusing the staging approval is refused.
    expect(
      transitionChangeRequest(passed, "EXECUTED", {
        now: NOW,
        actor: "OWNER",
        approval: {
          actor: "OWNER",
          authorizationRecordId: "rec-stage",
          serverVerified: true,
        },
      }).ok,
    ).toBe(false);
    const noCommit = transitionChangeRequest(passed, "EXECUTED", {
      now: NOW,
      actor: "OWNER",
      approval: {
        actor: "OWNER",
        authorizationRecordId: "rec-prod",
        serverVerified: true,
      },
    });
    expect(noCommit.ok).toBe(false);
    const executed = transitionChangeRequest(passed, "EXECUTED", {
      now: NOW,
      actor: "OWNER",
      approval: {
        actor: "OWNER",
        authorizationRecordId: "rec-prod",
        serverVerified: true,
      },
      resultingCommit: "  abc123  ",
    });
    expect(executed.ok).toBe(true);
    if (executed.ok) {
      expect(executed.request.ownerAuthorizationStatus).toBe(
        "production_authorized",
      );
      expect(executed.request.resultingCommit).toBe("abc123");
    }
  });
});

describe("approval view and rollback preparation", () => {
  it("shows the owner everything, hiding nothing", () => {
    const view = buildApprovalView(created());
    expect(view.crNumber).toBe("CR-2026-0001");
    expect(view.diff).toBe("+ fix");
    expect(view.rollbackPlan).toBe("git revert");
    expect(view.requiresOwnerIntervention).toBe(false);
  });

  it("requires a recorded version and rollback plan before execution", () => {
    const r = created();
    expect(prepareRollback(r, " ", "db", "cfg")).toMatchObject({
      error: expect.stringMatching(/current version/i),
    });
    const prep = prepareRollback(r, "v1.2.3", "none", "none");
    expect("recoveryInformation" in prep && prep.recoveryInformation).toContain(
      "Restore point: v1.2.3",
    );
    expect("recoveryInformation" in prep && prep.recoveryInformation).toContain(
      "Affected files: src/lib/quote.ts",
    );
  });
});
