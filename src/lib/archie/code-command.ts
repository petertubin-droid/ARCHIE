// =========================================================
// FRELUX ARCHIE EXTENSION, OWNER-ONLY CODE COMMAND CONTROL
//
// ARCHIE may read, understand, analyze, learn from, write
// and test code. But ARCHIE may modify its own code or
// protected FRELUX production code ONLY when the
// authenticated Owner explicitly commands and authorizes
// that modification. NOTHING else constitutes authorization:
//
//   a detected bug is NOT authorization.
//   a warning is NOT authorization.
//   a recommendation is NOT authorization.
//   a conversation is NOT authorization.
//   ARCHIE's own decision is NOT authorization.
//   an API subscriber request is NOT authorization.
//
// Workflow:
//   OWNER COMMAND → ARCHIE UNDERSTANDS → INSPECT → PLAN →
//   PROPOSE → WRITE/TEST IN ISOLATION → OWNER AUTHORIZATION →
//   APPLY → REGRESSION TEST → AUDIT → VERSION → DEPLOY
//
// Owner authorization is authenticated and verified
// SERVER-SIDE (the archie-owner-auth edge function,
// PBKDF2-verified). Owner passwords and authorization secrets
// never appear in frontend source, browser storage, AI
// prompts, voice transcripts, ordinary logs, public database
// fields, API responses, PDFs or client-side JavaScript.
// =========================================================

export type CodeCommandStage =
  | "OWNER COMMAND"
  | "ARCHIE UNDERSTANDS"
  | "INSPECT"
  | "PLAN"
  | "PROPOSE"
  | "WRITE/TEST IN ISOLATION"
  | "OWNER AUTHORIZATION"
  | "APPLY"
  | "REGRESSION TEST"
  | "AUDIT"
  | "VERSION"
  | "DEPLOY";

export const CODE_COMMAND_WORKFLOW: readonly CodeCommandStage[] = [
  "OWNER COMMAND",
  "ARCHIE UNDERSTANDS",
  "INSPECT",
  "PLAN",
  "PROPOSE",
  "WRITE/TEST IN ISOLATION",
  "OWNER AUTHORIZATION",
  "APPLY",
  "REGRESSION TEST",
  "AUDIT",
  "VERSION",
  "DEPLOY",
];

/** Stages ARCHIE advances autonomously, everything up to the
 *  owner gate. */
const ARCHIE_STAGES: readonly CodeCommandStage[] = [
  "OWNER COMMAND",
  "ARCHIE UNDERSTANDS",
  "INSPECT",
  "PLAN",
  "PROPOSE",
  "WRITE/TEST IN ISOLATION",
];

/** Sources of "authorization" that are NEVER authorization. */
export const NOT_AUTHORIZATION: readonly string[] = [
  "a detected bug",
  "a warning",
  "a recommendation",
  "a conversation",
  "ARCHIE's own decision",
  "an API subscriber request",
];

/** Is this claimed authorization source the real thing?
 *  Only the authenticated Owner's explicit authorized command
 *  authorizes protected code modification. */
export function isAuthorization(
  source: string,
): { authorized: boolean; error?: string } {
  const s = source.trim().toLowerCase();
  const nots = NOT_AUTHORIZATION.map((n) => n.toLowerCase());
  const matched = nots.find((n) => s.includes(n));
  if (s.includes("owner") && s.includes("explicit command")) {
    return { authorized: true };
  }
  if (matched) {
    return {
      authorized: false,
      error: `"${matched}" is NOT authorization. Only the authenticated Owner's explicit authorized command authorizes protected code modification.`,
    };
  }
  return {
    authorized: false,
    error: "Only the authenticated Owner's explicit authorized command authorizes protected code modification.",
  };
}

// ---------------------------------------------------------
// Command lifecycle
// ---------------------------------------------------------

export interface OwnerCodeCommand {
  command_text: string;
  /** Server-verified owner identity (archie-owner-auth). */
  owner_identity: string;
  server_verified: boolean;
}

/** Open a protected code modification. Refuses anything that
 *  is not a server-verified Owner command. */
export function beginCodeModification(command: OwnerCodeCommand): {
  ok: boolean;
  error?: string;
  stage?: CodeCommandStage;
} {
  if (!command.command_text.trim()) {
    return { ok: false, error: "A code modification requires the Owner's command" };
  }
  if (!command.server_verified) {
    return {
      ok: false,
      error: "Owner authorization must be authenticated and verified server-side",
    };
  }
  if (!command.owner_identity.trim()) {
    return { ok: false, error: "The Owner's server-verified identity is required" };
  }
  return { ok: true, stage: "ARCHIE UNDERSTANDS" };
}

/** Advance a stage. ARCHIE advances its own stages; OWNER
 *  AUTHORIZATION consumes a server-verified approval, and
 *  APPLY and beyond belong to the owner-driven process. */
export function advanceCodeCommand(
  current: CodeCommandStage,
  actor: "ARCHIE" | "OWNER",
  opts?: { server_verified_approval?: boolean; sensitive_change?: boolean },
): { ok: boolean; error?: string; next?: CodeCommandStage } {
  const idx = CODE_COMMAND_WORKFLOW.indexOf(current);
  if (idx === -1) return { ok: false, error: `Unknown stage "${current}"` };
  const next = CODE_COMMAND_WORKFLOW[idx + 1];
  if (!next) return { ok: false, error: "Workflow is complete (DEPLOY)" };

  const inArchieRange = ARCHIE_STAGES.includes(current);
  if (inArchieRange) {
    // ARCHIE advances up to presenting the isolated work.
    // The step INTO "OWNER AUTHORIZATION" only completes with
    // the owner's server-verified approval.
    if (next === "OWNER AUTHORIZATION") {
      if (actor !== "OWNER" || opts?.server_verified_approval !== true) {
        return {
          ok: false,
          error: "Protected code modification waits at the gate, only the Owner's server-verified authorization applies it",
        };
      }
      return { ok: true, next: "APPLY" };
    }
    return { ok: true, next };
  }
  // Beyond the gate: owner-driven.
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the Owner drives stages after authorization",
    };
  }
  // Sensitive/high-risk changes keep the additional FRELUX
  // verification gates (engineering review sign-off), which
  // the owner supplies at AUDIT time.
  if (current === "AUDIT" && opts?.sensitive_change && !opts?.server_verified_approval) {
    return {
      ok: false,
      error: "Sensitive changes require the additional verification and approval gates at audit",
    };
  }
  return { ok: true, next };
}

// ---------------------------------------------------------
// Modification record
// ---------------------------------------------------------

/** Every authorized code modification is recorded with
 *  identity, requested change, affected components, version,
 *  tests, timestamp, approval and rollback information. */
export interface CodeModificationRecord {
  owner_identity: string;
  requested_change: string;
  affected_components: string[];
  version: string;
  tests: string[];
  timestamp: string;
  approval: { server_verified: true; authorization_record_id: string };
  rollback: string;
}

export function buildCodeModificationRecord(input: CodeModificationRecord): {
  ok: boolean;
  error?: string;
  record?: CodeModificationRecord;
} {
  if (!input.owner_identity.trim()) return { ok: false, error: "The record requires the Owner's identity" };
  if (!input.requested_change.trim()) return { ok: false, error: "The record requires the requested change" };
  if (input.affected_components.length === 0) {
    return { ok: false, error: "The record requires the affected components" };
  }
  if (!input.rollback.trim()) return { ok: false, error: "The record requires rollback information" };
  if (input.approval.server_verified !== true || !input.approval.authorization_record_id.trim()) {
    return { ok: false, error: "The record requires the server-verified approval reference" };
  }
  if (!input.version.trim() || input.tests.length === 0) {
    return { ok: false, error: "The record requires version and tests" };
  }
  if (Number.isNaN(Date.parse(input.timestamp))) {
    return { ok: false, error: "The record requires a valid timestamp" };
  }
  return { ok: true, record: input };
}

/** Where Owner secrets NEVER appear. Enforced by the
 *  archie-owner-auth design (server-side PBKDF2
 *  verification); listed here so every surface asserts it. */
export const OWNER_SECRET_SURFACES_FORBIDDEN: readonly string[] = [
  "frontend source",
  "browser storage",
  "AI prompts",
  "voice transcripts",
  "ordinary logs",
  "public database fields",
  "API responses",
  "PDFs",
  "client-side JavaScript",
];
