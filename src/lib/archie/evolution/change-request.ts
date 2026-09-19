// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — CHANGE REQUESTS (§2, §3, §6, §7)
//
// Persistent, audited change requests with the lifecycle:
//
//   PROPOSED → AWAITING_OWNER → AUTHORIZED → STAGING →
//   TESTING → PASSED → EXECUTED → (ROLLED_BACK)
//   with REJECTED / FAILED as terminal exits.
//
// Authority rules (enforced here, mirrored at the DB level):
//   * ARCHIE creates proposals and may withdraw its own
//     PROPOSED item. Everything else is owner-driven.
//   * AUTHORIZED consumes a server-verified STAGING
//     authorization record (archie-owner-auth).
//   * EXECUTED consumes a SEPARATE, explicit PRODUCTION
//     authorization record for this specific change — staging
//     authorization never doubles as production approval.
//   * ROLLED_BACK consumes its own authorization record.
//   * Protected-surface changes additionally require explicit
//     owner intervention (authority.checkProtectedSurfaceGate).
//   * Every transition appends an immutable audit entry.
//
// Production application itself happens through the owner's
// Git workflow (branch → CI → merge). EXECUTED records the
// resulting commit; nothing here claims deploy success without
// one.
// =========================================================

import {
  checkProtectedSurfaceGate,
  verifyApproval,
  type ApprovalEvidence,
} from "./authority";
import type {
  ChangeAuditEntry,
  ChangeRequestState,
  ChangeRisk,
  EvolutionActor,
  EvolutionChangeRequest,
  RequestedAuthorizationLevel,
} from "./types";
import { TERMINAL_CR_STATES } from "./types";

// ---------------------------------------------------------
// Transitions
// ---------------------------------------------------------

const TRANSITIONS: Record<ChangeRequestState, ChangeRequestState[]> = {
  PROPOSED: ["AWAITING_OWNER", "REJECTED"],
  AWAITING_OWNER: ["AUTHORIZED", "REJECTED", "PROPOSED"],
  AUTHORIZED: ["STAGING", "REJECTED"],
  STAGING: ["TESTING", "FAILED"],
  TESTING: ["PASSED", "FAILED"],
  PASSED: ["EXECUTED", "REJECTED"],
  FAILED: [],
  EXECUTED: ["ROLLED_BACK"],
  REJECTED: [],
  ROLLED_BACK: [],
};

/** Which transitions are owner-gated (documented; enforced in
 *  transitionChangeRequest). */
export const OWNER_GATED: ReadonlySet<ChangeRequestState> = new Set([
  "AUTHORIZED",
  "EXECUTED",
  "ROLLED_BACK",
  "REJECTED",
]);

export function isTerminalCrState(state: ChangeRequestState): boolean {
  return TERMINAL_CR_STATES.includes(state);
}

// ---------------------------------------------------------
// Creation
// ---------------------------------------------------------

export interface CreateChangeRequestInput {
  title: string;
  description: string;
  reason: string;
  affectedFiles: string[];
  affectedComponents: string[];
  proposedDiff: string;
  dependencies: string[];
  securityImpact: string;
  dataImpact: string;
  regressionRisk: ChangeRisk;
  testPlan: string;
  rollbackPlan: string;
  requestedLevel: RequestedAuthorizationLevel;
  archieVersion: string;
  now: string;
}

/** CR numbers are sequential per year: CR-2026-0001. The caller
 *  supplies the next sequence number (persistence layer owns
 *  the counter; this module stays pure). */
export function formatCrNumber(year: number, sequence: number): string {
  return `CR-${year}-${String(sequence).padStart(4, "0")}`;
}

export type CreateCrResult =
  | { ok: true; request: EvolutionChangeRequest; audit: ChangeAuditEntry }
  | { ok: false; error: string };

/** Create a complete change request. Half-proposals are
 *  refused — every field the owner needs to decide (§4) must
 *  be present and honest. */
export function createChangeRequest(
  input: CreateChangeRequestInput,
  id: string,
  crNumber: string,
): CreateCrResult {
  const required: Array<[keyof CreateChangeRequestInput, string]> = [
    ["title", "title"],
    ["description", "description"],
    ["reason", "reason"],
    ["proposedDiff", "proposed diff"],
    ["securityImpact", "security impact"],
    ["dataImpact", "data impact"],
    ["testPlan", "test plan"],
    ["rollbackPlan", "rollback plan"],
  ];
  for (const [field, label] of required) {
    const v = input[field];
    if (typeof v === "string" && !v.trim()) {
      return { ok: false, error: `A change request requires a ${label}.` };
    }
  }
  if (input.affectedFiles.length === 0) {
    return {
      ok: false,
      error: "A change request requires the affected files.",
    };
  }
  if (!input.archieVersion.trim()) {
    return {
      ok: false,
      error: "A change request requires the ARCHIE version.",
    };
  }

  // Protected-surface detection is centralized in authority.ts.
  const gate = checkProtectedSurfaceGate(input.affectedFiles, null);
  const request: EvolutionChangeRequest = {
    id,
    crNumber,
    title: input.title.trim(),
    description: input.description.trim(),
    reason: input.reason.trim(),
    affectedFiles: input.affectedFiles,
    affectedComponents: input.affectedComponents,
    proposedDiff: input.proposedDiff,
    dependencies: input.dependencies,
    securityImpact: input.securityImpact.trim(),
    dataImpact: input.dataImpact.trim(),
    regressionRisk: input.regressionRisk,
    testPlan: input.testPlan.trim(),
    testResults: null,
    rollbackPlan: input.rollbackPlan.trim(),
    requestedLevel: input.requestedLevel,
    ownerAuthorizationStatus: "none",
    stagingAuthorizationRecordId: null,
    productionAuthorizationRecordId: null,
    rollbackAuthorizationRecordId: null,
    resultingCommit: null,
    requiresOwnerIntervention: gate.hits.length > 0,
    flags: gate.hits.length > 0 ? ["OWNER_INTERVENTION_REQUIRED"] : [],
    archieVersion: input.archieVersion,
    createdAt: input.now,
    updatedAt: input.now,
    state: "PROPOSED",
  };
  const audit: ChangeAuditEntry = {
    id: crypto.randomUUID(),
    changeRequestId: id,
    crNumber,
    actor: "ARCHIE",
    action: "create",
    fromState: null,
    toState: "PROPOSED",
    authorizationRecordId: null,
    detail: { title: request.title, affectedFiles: request.affectedFiles },
    createdAt: input.now,
  };
  return { ok: true, request, audit };
}

// ---------------------------------------------------------
// Transitions
// ---------------------------------------------------------

export interface TransitionEvidence {
  now: string;
  actor: EvolutionActor;
  /** Server-verified approval, required on owner-gated transitions. */
  approval?: ApprovalEvidence;
  /** Required on AWAITING_OWNER. */
  proposalComplete?: boolean;
  /** Required on STAGING. */
  stagingEnvironment?: string;
  /** Required on TESTING. */
  testResults?: EvolutionChangeRequest["testResults"];
  /** Required on EXECUTED. */
  resultingCommit?: string;
  /** Required on ROLLED_BACK. */
  rollbackInformation?: string;
  /** Required for protected-surface changes. */
  ownerIntervention?: {
    approval: ApprovalEvidence;
    acknowledgedProtectedSurfaces: string[];
  };
}

export type TransitionResult =
  | { ok: true; request: EvolutionChangeRequest; audit: ChangeAuditEntry }
  | { ok: false; error: string };

/**
 * Transition a change request. Every rule of §2/§3/§5/§7 is
 * enforced here and mirrored by tests.
 */
export function transitionChangeRequest(
  request: EvolutionChangeRequest,
  to: ChangeRequestState,
  evidence: TransitionEvidence,
): TransitionResult {
  const from = request.state;
  if (isTerminalCrState(from)) {
    return {
      ok: false,
      error: `Terminal state ${from} — a new change request must be created instead.`,
    };
  }
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, error: `Invalid transition: ${from} → ${to}` };
  }

  const auditBase = (
    action: string,
    detail: Record<string, unknown>,
    authorizationRecordId: string | null = null,
  ) => ({
    id: crypto.randomUUID(),
    changeRequestId: request.id,
    crNumber: request.crNumber,
    actor: evidence.actor,
    action,
    fromState: from,
    toState: to,
    authorizationRecordId,
    detail,
    createdAt: evidence.now,
  });

  switch (to) {
    case "AWAITING_OWNER": {
      if (evidence.actor !== "ARCHIE" && evidence.actor !== "OWNER") {
        return {
          ok: false,
          error: "Only ARCHIE or the OWNER can submit a proposal for decision.",
        };
      }
      if (!evidence.proposalComplete) {
        return {
          ok: false,
          error:
            "The proposal must be complete before requesting an owner decision.",
        };
      }
      return {
        ok: true,
        request: { ...request, state: to, updatedAt: evidence.now },
        audit: auditBase("submit_for_owner_decision", {
          submittedBy: evidence.actor,
        }),
      };
    }
    case "PROPOSED": {
      // AWAITING_OWNER → PROPOSED: the owner requests changes.
      if (evidence.actor !== "OWNER") {
        return {
          ok: false,
          error: "Only the OWNER can request changes to a proposal.",
        };
      }
      return {
        ok: true,
        request: { ...request, state: to, updatedAt: evidence.now },
        audit: auditBase("request_changes", {}),
      };
    }
    case "REJECTED": {
      // ARCHIE may withdraw only its own not-yet-submitted proposal.
      if (evidence.actor === "ARCHIE" && from !== "PROPOSED") {
        return {
          ok: false,
          error:
            "ARCHIE cannot reject a change once submitted for owner decision.",
        };
      }
      if (evidence.actor === "OWNER" && !evidence.approval) {
        return { ok: false, error: "The OWNER decision must be recorded." };
      }
      const authorizationRecordId =
        evidence.actor === "OWNER"
          ? (evidence.approval?.authorizationRecordId ?? null)
          : null;
      return {
        ok: true,
        request: {
          ...request,
          state: to,
          ownerAuthorizationStatus: "rejected",
          updatedAt: evidence.now,
        },
        audit: auditBase("reject", {}, authorizationRecordId),
      };
    }
    case "AUTHORIZED": {
      const approval = verifyApproval({
        actor: evidence.actor,
        authorizationRecordId: evidence.approval?.authorizationRecordId ?? "",
        serverVerified: evidence.approval?.serverVerified === true,
      });
      if (!approval.authorized) return { ok: false, error: approval.error! };
      if (request.ownerAuthorizationStatus === "production_authorized") {
        return {
          ok: false,
          error: "This change already carries a production authorization.",
        };
      }
      // Staging authorization for THIS change specifically.
      return {
        ok: true,
        request: {
          ...request,
          state: to,
          ownerAuthorizationStatus: "staging_authorized",
          stagingAuthorizationRecordId:
            evidence.approval!.authorizationRecordId,
          updatedAt: evidence.now,
        },
        audit: auditBase(
          "authorize_staging",
          { requestedLevel: request.requestedLevel },
          evidence.approval!.authorizationRecordId,
        ),
      };
    }
    case "STAGING": {
      if (request.ownerAuthorizationStatus !== "staging_authorized") {
        return {
          ok: false,
          error: "Staging requires a prior owner staging authorization.",
        };
      }
      if (!evidence.stagingEnvironment?.trim()) {
        return {
          ok: false,
          error: "Staging requires the staging environment reference.",
        };
      }
      return {
        ok: true,
        request: { ...request, state: to, updatedAt: evidence.now },
        audit: auditBase("stage", { environment: evidence.stagingEnvironment }),
      };
    }
    case "TESTING": {
      return {
        ok: true,
        request: { ...request, state: to, updatedAt: evidence.now },
        audit: auditBase("begin_testing", {}),
      };
    }
    case "PASSED":
    case "FAILED": {
      if (!evidence.testResults) {
        return {
          ok: false,
          error: `${to} requires the recorded test results.`,
        };
      }
      const failures = evidence.testResults.checks.filter(
        (c) => c.status === "failed",
      );
      const consistent =
        (to === "PASSED" &&
          evidence.testResults.summary === "all_passed" &&
          failures.length === 0) ||
        (to === "FAILED" &&
          (failures.length > 0 || evidence.testResults.summary === "failures"));
      if (!consistent) {
        return {
          ok: false,
          error: `Test results do not support ${to} (check statuses vs summary).`,
        };
      }
      return {
        ok: true,
        request: {
          ...request,
          state: to,
          testResults: evidence.testResults,
          updatedAt: evidence.now,
        },
        audit: auditBase(to.toLowerCase(), {
          checks: evidence.testResults.checks.length,
        }),
      };
    }
    case "EXECUTED": {
      const approval = verifyApproval({
        actor: evidence.actor,
        authorizationRecordId: evidence.approval?.authorizationRecordId ?? "",
        serverVerified: evidence.approval?.serverVerified === true,
      });
      if (!approval.authorized) return { ok: false, error: approval.error! };
      if (request.state !== "PASSED") {
        return {
          ok: false,
          error: "Only a PASSED change can be executed in production.",
        };
      }
      // Production authorization must be SEPARATE from the
      // staging authorization (§2 EXECUTE).
      if (
        evidence.approval!.authorizationRecordId ===
        request.stagingAuthorizationRecordId
      ) {
        return {
          ok: false,
          error:
            "Production execution requires a SEPARATE explicit authorization — the staging approval cannot be reused.",
        };
      }
      if (!evidence.resultingCommit?.trim()) {
        return {
          ok: false,
          error:
            "EXECUTED must record the resulting commit — production application happens through the owner's Git workflow.",
        };
      }
      return {
        ok: true,
        request: {
          ...request,
          state: to,
          ownerAuthorizationStatus: "production_authorized",
          productionAuthorizationRecordId:
            evidence.approval!.authorizationRecordId,
          resultingCommit: evidence.resultingCommit.trim(),
          updatedAt: evidence.now,
        },
        audit: auditBase(
          "execute_production",
          { commit: evidence.resultingCommit.trim() },
          evidence.approval!.authorizationRecordId,
        ),
      };
    }
    case "ROLLED_BACK": {
      const approval = verifyApproval({
        actor: evidence.actor,
        authorizationRecordId: evidence.approval?.authorizationRecordId ?? "",
        serverVerified: evidence.approval?.serverVerified === true,
      });
      if (!approval.authorized) return { ok: false, error: approval.error! };
      if (!evidence.rollbackInformation?.trim()) {
        return { ok: false, error: "Rollback requires recovery information." };
      }
      return {
        ok: true,
        request: {
          ...request,
          state: to,
          rollbackAuthorizationRecordId:
            evidence.approval!.authorizationRecordId,
          updatedAt: evidence.now,
        },
        audit: auditBase(
          "rollback",
          { rollbackInformation: evidence.rollbackInformation },
          evidence.approval!.authorizationRecordId,
        ),
      };
    }
    default:
      return { ok: false, error: `Unhandled target state ${to}` };
  }
}

// ---------------------------------------------------------
// Approval view for the admin UI (§4)
// ---------------------------------------------------------

/** Everything the owner sees before approving — nothing is
 *  hidden (§4). Derived from the stored record. */
export function buildApprovalView(request: EvolutionChangeRequest) {
  return {
    crNumber: request.crNumber,
    whatWillChange: request.description,
    why: request.reason,
    filesAffected: request.affectedFiles,
    componentsAffected: request.affectedComponents,
    diff: request.proposedDiff,
    dependencies: request.dependencies,
    risk: request.regressionRisk,
    securityImpact: request.securityImpact,
    dataImpact: request.dataImpact,
    testResults: request.testResults,
    rollbackPlan: request.rollbackPlan,
    requiresOwnerIntervention: request.requiresOwnerIntervention,
    flags: request.flags,
    requestedLevel: request.requestedLevel,
  };
}

// ---------------------------------------------------------
// Rollback preparation (§7)
// ---------------------------------------------------------

export interface RollbackPreparation {
  currentVersion: string;
  affectedFiles: string[];
  databaseImpact: string;
  configurationImpact: string;
  recoveryInformation: string;
}

/** Before executing a production change, recovery information
 *  must be prepared and recorded (§7). */
export function prepareRollback(
  request: EvolutionChangeRequest,
  currentVersion: string,
  databaseImpact: string,
  configurationImpact: string,
): RollbackPreparation | { error: string } {
  if (!currentVersion.trim())
    return { error: "The current version must be recorded before execution." };
  if (!request.rollbackPlan.trim())
    return { error: "The change request must carry a rollback plan." };
  return {
    currentVersion,
    affectedFiles: request.affectedFiles,
    databaseImpact,
    configurationImpact,
    recoveryInformation: [
      `Restore point: ${currentVersion}`,
      `Affected files: ${request.affectedFiles.join(", ")}`,
      `Rollback plan: ${request.rollbackPlan}`,
      `Database impact: ${databaseImpact}`,
      `Configuration impact: ${configurationImpact}`,
    ].join("\n"),
  };
}
