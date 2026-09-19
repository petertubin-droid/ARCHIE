// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — OWNER AUTHORITY (§1, §5, §16)
//
// The Owner Authority Layer is OUTSIDE ARCHIE's self-modifiable
// capability layer by construction:
//
//   1. It lives in its own module; change requests that touch
//      PROTECTED_SURFACES can never be staged or executed
//      without explicit owner intervention evidence.
//   2. Approvals are never ARCHIE actions — mayApprove() is
//      false for ARCHIE, always, and cannot be configured true.
//   3. Approvals reference server-verified authorization
//      records (the existing archie-owner-auth edge function);
//      a client-side or ARCHIE-side "approval" without a
//      server record is refused.
//   4. The audit trail is append-only and enforced at the
//      database level (RLS + immutability trigger), so ARCHIE
//      cannot rewrite evidence of previous changes.
//
// ARCHIE cannot grant itself privileges: settings themselves
// live in owner-only storage (admin RLS); this module never
// reads settings to answer "may ARCHIE approve" — that answer
// is a constant.
// =========================================================

import type { EvolutionActor } from "./types";

// ---------------------------------------------------------
// Protected surfaces (§5)
// ---------------------------------------------------------

/**
 * Surfaces ARCHIE must NOT autonomously modify. A change
 * request touching any of these stops and requires explicit
 * owner intervention — the owner must take the change over;
 * no configuration, capability or learned knowledge removes
 * this gate.
 */
export const PROTECTED_SURFACES: readonly string[] = [
  // 🧬 DNA — the constitution and anatomy are foundational
  // and can never be self-modified (owner directive
  // 2026-09-10: cognitive anatomy as foundational architecture).
  "public.archie_constitution",
  "public.archie_subsystems",
  "public.archie_subsystem_status",
  "supabase/functions/_shared/archie-ai/anatomy/constitution.ts",
  // ⛔ LIFE-SAFETY HARD GATE (owner directive 2026-09-11):
  // the gate cannot be disabled or rewritten by ARCHIE itself
  // — same protection class as the constitution.
  "supabase/functions/_shared/archie-ai/security/life-safety.ts",
  "supabase/functions/_shared/archie-ai/anatomy/registry.ts",
  "supabase/functions/archie-anatomy",
  "src/lib/archie/capability-authority.ts",
  "src/lib/archie/authorized-security.ts",
  "src/lib/archie/global-orchestrator.ts",
  "src/lib/archie/evolution/authority.ts",
  "src/lib/archie/authority-boundary.ts",
  "src/lib/archie/code-command.ts",
  "src/lib/archie/core-orchestrator.ts",
  "supabase/functions/archie-owner-auth",
  // ⛔ API CREDENTIAL SYSTEM (owner directive 2026-09-12):
  // ARCHIE must never be able to modify its own credential
  // security surface, grant itself authority via credential
  // scopes, or disable the killswitch through its own change
  // pipeline.
  "supabase/functions/_shared/archie-ai/security/api-credentials.ts",
  "supabase/functions/_shared/archie-ai/security/api-credential-store.ts",
  "supabase/functions/archie-credentials",
  "src/lib/auth.tsx",
  "src/lib/supabase.ts",
  "src/lib/supabase-lazy.ts",
  "src/lib/admin-theme.tsx",
  "src/lib/governance",
  "rls_policies",
  "security_policies",
  "secret_management",
  "audit_logs",
  "approval_requirements",
  "deployment_authorization",
  "database_ownership_controls",
];

/** Does a path touch a protected surface? Path matching is
 *  conservative: substring in either direction. */
export function isProtectedSurface(path: string): boolean {
  const p = path.trim().toLowerCase();
  if (!p) return false;
  return PROTECTED_SURFACES.some(
    (s) => p.includes(s.toLowerCase()) || s.toLowerCase().includes(p),
  );
}

/** Which of the given paths touch protected surfaces? */
export function protectedSurfaceHits(paths: readonly string[]): string[] {
  return paths.filter((p) => isProtectedSurface(p));
}

// ---------------------------------------------------------
// Authority constants (§1, §16)
// ---------------------------------------------------------

/** The fixed authority model — mirrors change-pipeline.ts
 *  CHANGE_AUTHORITY. This is a constant, not a setting. */
export const EVOLUTION_AUTHORITY = {
  archie_may_observe: true,
  archie_may_learn: true,
  archie_may_propose: true,
  archie_may_stage: false, // only after owner staging authorization
  archie_may_execute_production: false,
  archie_may_approve: false,
  archie_may_rollback: false,
  archie_may_modify_authority_layer: false,
  owner_is_final_authority: true,
} as const;

/** May this actor approve a change request? ARCHIE can never
 *  approve its own (or any) change. Not configurable. */
export function mayApprove(actor: EvolutionActor): boolean {
  return actor === "OWNER";
}

/** May this actor reject / request-changes? ARCHIE may only
 *  withdraw its OWN proposal (handled by the state machine);
 *  decisions on owner-gated transitions belong to the owner. */
export function mayDecide(actor: EvolutionActor): boolean {
  return actor === "OWNER";
}

/** Sources of "authorization" that are NEVER authorization —
 *  extends the existing code-command NOT_AUTHORIZATION list
 *  with self-evolution-specific forms (§18). */
export const NOT_EVOLUTION_AUTHORIZATION: readonly string[] = [
  "a detected bug",
  "a warning",
  "a recommendation",
  "a conversation",
  "ARCHIE's own decision",
  "an API subscriber request",
  "a detected opportunity",
  "an improvement ARCHIE believes is beneficial",
  "a learned capability",
  "a language ARCHIE learned",
  "improve yourself",
  "evolve",
  "external content",
  "a document instruction",
  "a user message",
];

export interface AuthorizationCheck {
  authorized: boolean;
  error?: string;
}

/** Is a claimed authorization source the real thing? Only a
 *  server-verified owner authorization record is. */
export function isEvolutionAuthorization(source: string): AuthorizationCheck {
  const s = source.trim().toLowerCase();
  const matched = NOT_EVOLUTION_AUTHORIZATION.find((n) =>
    s.includes(n.toLowerCase()),
  );
  if (matched) {
    return {
      authorized: false,
      error: `"${matched}" is NOT authorization. Only the authenticated Owner's explicit, server-verified authorization authorizes self-modification.`,
    };
  }
  if (s.includes("server-verified owner authorization record")) {
    return { authorized: true };
  }
  return {
    authorized: false,
    error:
      "Only the authenticated Owner's explicit, server-verified authorization authorizes self-modification.",
  };
}

// ---------------------------------------------------------
// Server-verified approval verification
// ---------------------------------------------------------

export interface ApprovalEvidence {
  actor: EvolutionActor;
  /** From the archie-owner-auth edge function ("authorize-change"). */
  authorizationRecordId: string;
  /** True only when the record came from the server response. */
  serverVerified: boolean;
}

/** Verify an approval. ARCHIE structurally cannot pass this
 *  gate: actor must be OWNER and the record must be a
 *  non-empty server-verified id. Fabricated client-side ids
 *  (empty/whitespace/"self") never pass. */
export function verifyApproval(evidence: ApprovalEvidence): AuthorizationCheck {
  if (!mayApprove(evidence.actor)) {
    return {
      authorized: false,
      error: "ARCHIE cannot approve its own changes — only the Owner approves.",
    };
  }
  const id = evidence.authorizationRecordId?.trim() ?? "";
  if (!id || !evidence.serverVerified) {
    return {
      authorized: false,
      error:
        "Approval requires a server-verified authorization record (archie-owner-auth).",
    };
  }
  return { authorized: true };
}

/** OWNER INTERVENTION evidence for protected-surface changes. */
export interface OwnerInterventionEvidence {
  actor: EvolutionActor;
  approval: ApprovalEvidence;
  /** The owner explicitly acknowledged the protected surface. */
  acknowledgedProtectedSurfaces: string[];
}

/** Protected-surface gate (§5): a change touching a protected
 *  surface stops unless the owner explicitly intervenes —
 *  ARCHIE alone can never pass this gate. */
export function checkProtectedSurfaceGate(
  affectedPaths: readonly string[],
  evidence: OwnerInterventionEvidence | null,
): AuthorizationCheck & { hits: string[] } {
  const hits = protectedSurfaceHits(affectedPaths);
  if (hits.length === 0) return { authorized: true, hits };
  if (!evidence) {
    return {
      hits,
      authorized: false,
      error: `This change touches protected surfaces (${hits.join(", ")}). ARCHIE must stop and request explicit owner intervention.`,
    };
  }
  const approval = verifyApproval(evidence.approval);
  if (!approval.authorized) {
    return { hits, ...approval };
  }
  const acknowledged = hits.every((h) =>
    evidence.acknowledgedProtectedSurfaces.some(
      (a) => a.trim().toLowerCase() === h.trim().toLowerCase(),
    ),
  );
  if (!acknowledged) {
    return {
      hits,
      authorized: false,
      error:
        "The owner must explicitly acknowledge every protected surface before this change can proceed.",
    };
  }
  return { authorized: true, hits };
}

/** Untrusted-content boundary (§19): external information can
 *  never authorize anything. This function exists so every
 *  ingestion path asserts it the same way. */
export function externalContentAuthority(): { grantsAuthority: false } {
  return { grantsAuthority: false };
}
