// =========================================================
// ARCHIE CORE PRINCIPLE — THE LONG-TERM ENGINEERING OBJECTIVE
//
// This is a PERMANENT ARCHITECTURAL PRINCIPLE of ARCHIE,
// encoded in core code and persisted in ARCHIE's durable
// store (frelux_archie_core_principles, seeded at birth and
// never overwritten). It is NOT a user-facing prompt, NOT a
// temporary instruction, NOT a mock or placeholder, and it
// must survive upgrades, migrations, devices and deployments.
//
// The objective grants ZERO additional authority. Every
// non-grant below is enforced through the REAL Owner Authority
// Layer (operating-model.ts + change pipeline): this module
// only states the objective and routes actions to that layer —
// it contains no override, no exception path and no way to
// bypass a verdict.
// =========================================================

import { classifyOperation, type AuthorityVerdict } from "./operating-model";

export const ENGINEERING_OBJECTIVE_PRINCIPLE_ID = "engineering_objective";

/** The objective, stated verbatim as ARCHIE's permanent
 *  engineering direction. */
export const ENGINEERING_OBJECTIVE = {
  principleId: ENGINEERING_OBJECTIVE_PRINCIPLE_ID,
  title: "ARCHIE Long-Term Engineering Objective",
  objective:
    "ARCHIE shall continuously develop and strengthen its capabilities in " +
    "software engineering, programming, databases, systems architecture, " +
    "cloud infrastructure, DevOps, cybersecurity, testing, deployment, " +
    "debugging, and infrastructure operations.",
  reason:
    "The reason for this objective is ARCHIE's eventual ability to design, " +
    "build, secure, maintain, migrate, and operate its own independent " +
    "hosted database and supporting infrastructure.",
  learningSources: [
    "Its own codebase and architecture",
    "FRELUX code and integrations",
    "Approved code changes",
    "Tests, failures, bugs, builds, deployments and runtime errors",
    "Legitimate documentation, open-source software and engineering knowledge",
    "Owner-approved projects and implementations",
  ] as const,
  /** The capability roadmap, in strict order. */
  phases: [
    "LEARN",
    "BUILD",
    "TEST",
    "VERIFY",
    "IMPROVE",
    "MASTER",
    "PROPOSE",
  ] as const,
  /** Transition capability: architecture must remain portable so
   *  moving from third-party infrastructure (e.g. Supabase) to
   *  ARCHIE-controlled infrastructure never requires a complete
   *  rewrite. */
  infrastructureTransition:
    "ARCHIE should be architecturally capable of eventually transitioning " +
    "from third-party infrastructure such as Supabase to ARCHIE-controlled " +
    "or ARCHIE-dedicated infrastructure without requiring a complete rewrite.",
  /** Hard authority limits. The objective grants NO authority
   *  over any of these. Each is classified OWNER_APPROVAL_REQUIRED
   *  by classifyEngineeringAction, always. */
  authorityNonGrants: [
    "modify its own core authority or safety controls",
    "deploy itself without authorization",
    "acquire infrastructure or services without authorization",
    "migrate, delete or alter persistent data without authorization",
    "remove security controls",
    "conceal changes or audit history",
    "grant itself permissions",
  ] as const,
  /** All self-modification, infrastructure creation, migration and
   *  production deployment remain subject to the Owner Authority
   *  Layer and explicit authorization. */
  governing: "Owner Authority Layer",
  /** Persistence semantics — permanent, never a prompt. */
  permanence:
    "Permanent architectural principle. Persisted across upgrades, " +
    "migrations, devices and deployments. Never implemented as a " +
    "temporary instruction, mock, placeholder or hardcoded conversational " +
    "response.",
} as const;

/** Ordered capability phases. */
export function objectivePhases(): readonly string[] {
  return ENGINEERING_OBJECTIVE.phases;
}

// ---------------------------------------------------------
// Authority enforcement
//
// Every engineering objective action passes through here. The
// non-grants are hard limits: matching them ALWAYS yields
// OWNER_APPROVAL_REQUIRED, regardless of any other
// classification. All other actions defer to the REAL
// operating-model classifier — this module never widens ARCHIE's
// authority, it can only constrain it further.
// ---------------------------------------------------------

const NON_GRANT_PATTERNS: ReadonlyArray<{ rx: RegExp; grant: string }> = [
  {
    rx: /(modify|alter|weaken|edit|change).*(authority|safety|core controls)/i,
    grant: "modify its own core authority or safety controls",
  },
  {
    rx: /(remove|disable|bypass|weaken).*(security|sentry|guard)/i,
    grant: "remove security controls",
  },
  {
    rx: /(deploy|ship|release).*(itself|production|prod)/i,
    grant: "deploy itself without authorization",
  },
  {
    rx: /(acquire|purchase|provision|buy|rent).*(infrastructure|servers?|services?|hosting|domain)/i,
    grant: "acquire infrastructure or services without authorization",
  },
  {
    rx: /(migrate|delete|alter|drop|truncate).*(persistent )?(data|database|tables?)/i,
    grant: "migrate, delete or alter persistent data without authorization",
  },
  {
    rx: /(conceal|hide|falsify|rewrite).*(changes|audit|history|log)/i,
    grant: "conceal changes or audit history",
  },
  {
    rx: /(grant|give|elevate|escalate).*(itself|own|self).*(permission|role|privilege)/i,
    grant: "grant itself permissions",
  },
];

export interface EngineeringActionVerdict {
  verdict: AuthorityVerdict;
  action: string;
  rationale: string;
  /** Which non-grant was hit, if any. */
  nonGrant?: string;
  /** The operating-model gate that applies. */
  gate: string;
}

/**
 * Classify an action under the engineering objective's authority
 * constraints. Non-grant actions are UNCONDITIONALLY
 * OWNER_APPROVAL_REQUIRED. Everything else defers to the real
 * operating model — learning, building, testing and improving
 * within ARCHIE's autonomous scope stay autonomous.
 */
export function classifyEngineeringAction(
  action: string,
): EngineeringActionVerdict {
  const hit = NON_GRANT_PATTERNS.find((p) => p.rx.test(action));
  if (hit) {
    return {
      verdict: "OWNER_APPROVAL_REQUIRED",
      action,
      nonGrant: hit.grant,
      rationale:
        `The Long-Term Engineering Objective explicitly does NOT grant ARCHIE ` +
        `authority to ${hit.grant}. This requires explicit Owner authorization.`,
      gate: "Owner Authority Layer — explicit authorization required",
    };
  }
  const base = classifyOperation(action);
  return {
    verdict: base.verdict,
    action,
    rationale: base.rationale,
    gate: base.gate,
  };
}

// ---------------------------------------------------------
// Integrity verification
//
// Used by ARCHIE's core capability health system and by tests:
// proves the principle is intact in code — all commitments
// present, every non-grant actually enforced through the real
// classifier, phases in order. If any check fails, ARCHIE must
// report the principle as compromised, never silently continue.
// ---------------------------------------------------------

export interface ObjectiveIntegrityCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ObjectiveIntegrityReport {
  ok: boolean;
  checks: ObjectiveIntegrityCheck[];
}

export function verifyEngineeringObjectiveIntegrity(): ObjectiveIntegrityReport {
  const checks: ObjectiveIntegrityCheck[] = [];

  checks.push({
    name: "objective_statement_present",
    ok: ENGINEERING_OBJECTIVE.objective.length > 100,
    detail: "The objective statement is encoded in core code, not a prompt.",
  });
  checks.push({
    name: "reason_present",
    ok:
      ENGINEERING_OBJECTIVE.reason.includes("independent") &&
      ENGINEERING_OBJECTIVE.reason.includes("infrastructure"),
    detail: "The infrastructure-independence reason is stated.",
  });
  checks.push({
    name: "learning_sources_complete",
    ok: ENGINEERING_OBJECTIVE.learningSources.length === 6,
    detail: "All six authorized learning sources are encoded.",
  });
  checks.push({
    name: "phases_in_order",
    ok:
      ENGINEERING_OBJECTIVE.phases.join("→") ===
      "LEARN→BUILD→TEST→VERIFY→IMPROVE→MASTER→PROPOSE",
    detail:
      "The roadmap order is LEARN→BUILD→TEST→VERIFY→IMPROVE→MASTER→PROPOSE.",
  });
  checks.push({
    name: "transition_clause_present",
    ok: ENGINEERING_OBJECTIVE.infrastructureTransition.includes(
      "without requiring a complete rewrite",
    ),
    detail: "The Supabase-independence transition clause is encoded.",
  });
  checks.push({
    name: "non_grants_enforced",
    ok: ENGINEERING_OBJECTIVE.authorityNonGrants.every((grant) => {
      // Each non-grant must be verifiable through a real action
      // phrase hitting OWNER_APPROVAL_REQUIRED.
      const probes: Record<string, string> = {
        "modify its own core authority or safety controls":
          "modify its own core authority controls",
        "deploy itself without authorization": "deploy itself to production",
        "acquire infrastructure or services without authorization":
          "acquire infrastructure servers",
        "migrate, delete or alter persistent data without authorization":
          "migrate persistent data",
        "remove security controls": "remove security controls",
        "conceal changes or audit history": "conceal audit history",
        "grant itself permissions": "grant itself permissions",
      };
      const verdict = classifyEngineeringAction(probes[grant] ?? "");
      return (
        verdict.verdict === "OWNER_APPROVAL_REQUIRED" &&
        verdict.nonGrant === grant
      );
    }),
    detail:
      "Every authority non-grant is enforced by the real classifier as OWNER_APPROVAL_REQUIRED.",
  });
  checks.push({
    name: "permanence_clause_present",
    ok:
      ENGINEERING_OBJECTIVE.permanence.includes("Never implemented as a") &&
      ENGINEERING_OBJECTIVE.permanence.includes("mock"),
    detail:
      "The permanence clause forbids prompt/mock/placeholder implementations.",
  });
  checks.push({
    name: "governed_by_owner_authority",
    ok: ENGINEERING_OBJECTIVE.governing === "Owner Authority Layer",
    detail:
      "Self-modification, infrastructure, migration and deployment stay Owner-governed.",
  });

  return { ok: checks.every((c) => c.ok), checks };
}
