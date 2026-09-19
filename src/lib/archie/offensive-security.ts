// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — OFFENSIVE SECURITY ENGINE
//
// A serious offensive-security / ethical-hacking capability.
// ARCHIE learns and reasons about advanced cybersecurity:
// penetration testing, vulnerability discovery, exploit
// development and analysis, web application security, API
// security, network security, authentication/authorization
// weaknesses, privilege escalation, adversarial testing,
// security automation, red-team methodology, blue-team /
// defensive security and vulnerability remediation.
//
// ENGAGEMENT LIFECYCLE (owner-directed, evidence-gated):
//   DISCOVER → ENUMERATE → ANALYZE → TEST
//   → EXPLOIT (authorized environment only)
//   → DOCUMENT → REMEDIATE → RETEST
//
// HARD RULES (no exception exists in code):
//  1. STUDY of offensive techniques is always free.
//  2. Intrusive phases (TEST, EXPLOIT) against REAL external
//     systems require a valid, in-scope, non-expired owner
//     authorization record. Forbidden patterns remain absolute
//     refusals regardless of authorization.
//  3. Lab / CTF / ARCHIE-owned environments must be
//     owner-registered before intrusive phases run there.
//  4. NO FAKE SECURITY RESULTS: every finding must carry real
//     evidence. Findings without evidence are refused. Nothing
//     is ever "detected", "exploited" or "fixed" without proof.
//  5. ARCHIE cannot bypass authorization — including at the
//     owner's request. Weakening the gate is a forbidden
//     operation.
// =========================================================

import { AuthorizationRegistry } from "./capability-authority";
import {
  evaluateSecurityWork,
  type SecurityWorkKind,
} from "./authorized-security";

// ---------------------------------------------------------
// Target environments
// ---------------------------------------------------------

/** The kinds of environment ARCHIE may engage against. */
export type OffensiveTargetKind =
  | "FRELUX_INFRASTRUCTURE" // the environment ARCHIE powers
  | "ARCHIE_INFRASTRUCTURE" // ARCHIE's own systems
  | "DEDICATED_LAB" // purpose-built testing lab
  | "CTF_ENVIRONMENT" // capture-the-flag / training range
  | "OWNER_AUTHORIZED_EXTERNAL"; // any other real system the owner registered

export interface OffensiveTarget {
  id: string;
  kind: OffensiveTargetKind;
  /** URL, hostname, IP range, repo path or environment id. */
  identifier: string;
  /** Explicit in-scope surface; anything not listed is out of scope. */
  scope: string[];
  /** Explicit exclusions — always honoured over scope. */
  exclusions?: string[];
  registeredAt: string;
  /** Owner id that registered this target. */
  registeredBy: string;
}

/** Environment kinds that are inherently controlled (not
 *  someone else's production system). */
const CONTROLLED_KINDS: ReadonlySet<OffensiveTargetKind> = new Set([
  "FRELUX_INFRASTRUCTURE",
  "ARCHIE_INFRASTRUCTURE",
  "DEDICATED_LAB",
  "CTF_ENVIRONMENT",
]);

/** Register a target for offensive work.
 *
 * Every environment — including labs and CTF ranges — must be
 * explicitly registered by the owner before intrusive phases
 * may run against it. Registration is a capability everyone
 * with owner access has; it is NOT an authorization bypass:
 *  - OWNER_AUTHORIZED_EXTERNAL targets additionally require a
 *    live authorization record before TEST/EXPLOIT phases.
 *  - Exclusions are mandatory-honoured in every phase.
 */
export function registerTarget(
  input: Omit<OffensiveTarget, "id" | "registeredAt"> & {
    id?: string;
  },
): { ok: true; target: OffensiveTarget } | { ok: false; error: string } {
  const identifier = input.identifier.trim();
  if (!identifier)
    return { ok: false, error: "Target identifier is required." };
  if (input.scope.length === 0)
    return {
      ok: false,
      error: "Scope must list the in-scope surface explicitly.",
    };
  // Overlap between scope and exclusions is ambiguous — refuse.
  const excluded = new Set((input.exclusions ?? []).map((e) => e.trim()));
  for (const s of input.scope) {
    if (excluded.has(s.trim()))
      return {
        ok: false,
        error: `"${s}" appears in both scope and exclusions.`,
      };
  }
  return {
    ok: true,
    target: {
      ...input,
      id: input.id ?? `target_${Date.now().toString(36)}`,
      identifier,
      registeredAt: new Date().toISOString(),
    },
  };
}

/** Is a concrete surface inside the target's scope and not
 *  excluded? Scope entries match exactly, as path prefixes,
 *  or as trailing-`*` wildcards. Exclusions always win. */
export function inScope(target: OffensiveTarget, surface: string): boolean {
  const s = surface.trim();
  if (!s) return false;
  for (const ex of target.exclusions ?? []) {
    const e = ex.trim();
    if (s === e || s.startsWith(`${e}/`)) return false;
  }
  return target.scope.some((sc) => {
    const c = sc.trim();
    if (c.endsWith("*")) return s.startsWith(c.slice(0, -1));
    return s === c || s.startsWith(`${c}/`);
  });
}

// ---------------------------------------------------------
// Engagement lifecycle
// ---------------------------------------------------------

export const OFFENSIVE_PHASES = [
  "DISCOVER",
  "ENUMERATE",
  "ANALYZE",
  "TEST",
  "EXPLOIT",
  "DOCUMENT",
  "REMEDIATE",
  "RETEST",
] as const;

export type OffensivePhase = (typeof OFFENSIVE_PHASES)[number];

/** How intrusive a phase is against the target. */
export type Intrusiveness = "PASSIVE" | "ACTIVE" | "INTRUSIVE";

const PHASE_INTRUSIVENESS: Record<OffensivePhase, Intrusiveness> = {
  DISCOVER: "PASSIVE", // public info only
  ENUMERATE: "ACTIVE", // touches the target
  ANALYZE: "PASSIVE", // reasoning over collected data
  TEST: "ACTIVE", // sends probes / validation requests
  EXPLOIT: "INTRUSIVE", // attempts actual exploitation
  DOCUMENT: "PASSIVE", // writing things down
  REMEDIATE: "PASSIVE", // recommendations
  RETEST: "ACTIVE", // verifies fixes against the target
};

export type PhaseStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export interface PhaseRecord {
  phase: OffensivePhase;
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  /** Authorization record id backing an authorized intrusive phase. */
  authorizationId?: string;
  /** What was actually observed — not narrated. */
  notes: string[];
}

export interface OffensiveFinding {
  id: string;
  targetId: string;
  phase: OffensivePhase;
  /** e.g. "SQL injection in /api/quotes" — plain and specific. */
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  /** Real evidence: request/response excerpts, tool output,
   *  stack traces. Required. No evidence → no finding. */
  evidence: string[];
  /** Vulnerability class, e.g. "AUTHZ_WEAKNESS". */
  category: string;
  remediation?: string;
  /** Verification of the FIX — set only by a RETEST phase. */
  fixStatus: "OPEN" | "RESOLVED" | "NOT_VERIFIED";
  retestedAt?: string;
  createdAt: string;
}

export interface Engagement {
  id: string;
  target: OffensiveTarget;
  /** Current position in the lifecycle. */
  currentPhase: OffensivePhase;
  phases: Record<OffensivePhase, PhaseRecord>;
  findings: OffensiveFinding[];
  startedAt: string;
}

/** Start an engagement. Phase 0 (DISCOVER) may always begin —
 *  it is passive. */
export function startEngagement(
  target: OffensiveTarget,
  now = new Date().toISOString(),
): { ok: true; engagement: Engagement } | { ok: false; error: string } {
  const phases = {} as Record<OffensivePhase, PhaseRecord>;
  for (const p of OFFENSIVE_PHASES) {
    phases[p] = { phase: p, status: "PENDING", notes: [] };
  }
  phases.DISCOVER.status = "IN_PROGRESS";
  phases.DISCOVER.startedAt = now;
  return {
    ok: true,
    engagement: {
      id: `engagement_${Date.now().toString(36)}`,
      target,
      currentPhase: "DISCOVER",
      phases,
      findings: [],
      startedAt: now,
    },
  };
}

/**
 * Advance the engagement to the next phase.
 *
 * Authorization gate:
 *  - ACTIVE/INTRUSIVE phases against OWNER_AUTHORIZED_EXTERNAL
 *    targets require a live owner authorization record whose
 *    scope covers the target identifier (checked through the
 *    capability-authority registry).
 *  - Controlled environments (FRELUX/ARCHIE infra, labs, CTF)
 *    rely on the owner's target registration plus the
 *    standing CONTROLLED_LAB authorization record for
 *    intrusive phases — registration alone never unlocks
 *    exploitation.
 *  - EXPLOIT is additionally refused when the phase's
 *    documented intent matches forbidden operations —
 *    evaluateSecurityWork re-checks the framing every time.
 */
export function advancePhase(
  engagement: Engagement,
  registry: AuthorizationRegistry,
  opts: {
    /** Human phrasing of what this phase will do. */
    operation: string;
    now?: string;
  },
): { ok: true; engagement: Engagement } | { ok: false; error: string } {
  const now = opts.now ?? new Date().toISOString();
  const idx = OFFENSIVE_PHASES.indexOf(engagement.currentPhase);
  if (idx < 0 || idx === OFFENSIVE_PHASES.length - 1)
    return { ok: false, error: "Engagement is already at the final phase." };
  const next = OFFENSIVE_PHASES[idx + 1];
  const intrusiveness = PHASE_INTRUSIVENESS[next];

  // Every phase beyond DISCOVER re-checks the security-work
  // verdict — forbidden patterns can never be authorized.
  const workKind: SecurityWorkKind =
    intrusiveness === "INTRUSIVE"
      ? "AUTHORIZED_PENTEST_EXECUTION"
      : "VULNERABILITY_DETECTION";
  const verdict = evaluateSecurityWork(
    {
      kind: workKind,
      context: intrusiveness === "PASSIVE" ? "STUDY" : "EXECUTION",
      target: {
        identifier: engagement.target.identifier,
        environment: CONTROLLED_KINDS.has(engagement.target.kind)
          ? "CONTROLLED_LAB"
          : "REAL_SYSTEM",
      },
      operation: opts.operation,
    },
    registry,
    new Date(now).getTime(),
  );
  if (!verdict.allowed)
    return {
      ok: false,
      error: `Phase ${next} refused: ${verdict.reason}`,
    };

  // External real systems need a live, in-scope owner
  // authorization record for any non-passive phase. The
  // registry is the single source of truth — ARCHIE cannot
  // forge, extend or waive this check.
  if (
    intrusiveness !== "PASSIVE" &&
    engagement.target.kind === "OWNER_AUTHORIZED_EXTERNAL"
  ) {
    const t = new Date(now).getTime();
    const testOk = registry.has(
      "run_authorized_security_test",
      engagement.target.identifier,
      t,
    );
    const accessOk = registry.has(
      "access_authorized_target",
      engagement.target.identifier,
      t,
    );
    if (!testOk || !accessOk)
      return {
        ok: false,
        error: `Phase ${next} touches the external system ${engagement.target.identifier} and requires live owner authorization records covering it (security-test AND target-access).`,
      };
  }

  engagement.phases[engagement.currentPhase].status = "DONE";
  engagement.phases[engagement.currentPhase].completedAt = now;
  engagement.phases[next].status = "IN_PROGRESS";
  engagement.phases[next].startedAt = now;
  engagement.currentPhase = next;
  return { ok: true, engagement };
}

/** Append an observation note to the current phase. Notes are
 *  the raw material of the report — they are never findings. */
export function addNote(engagement: Engagement, note: string): Engagement {
  const rec = engagement.phases[engagement.currentPhase];
  rec.notes.push(note);
  return engagement;
}

// ---------------------------------------------------------
// Findings — evidence-gated, never fabricated
// ---------------------------------------------------------

/**
 * Record a finding. NO FAKE SECURITY RESULTS:
 *  - evidence is REQUIRED and must be non-empty, real text;
 *  - the finding must be recorded from the phase that
 *    produced it (TEST/EXPLOIT/ENUMERATE/RETEST only);
 *  - REMEDIATE-phase fixes are recommendations, not findings;
 *  - fixStatus may only become RESOLVED through RETEST
 *    evidence — never by assertion.
 */
export function recordFinding(
  engagement: Engagement,
  input: {
    title: string;
    severity: OffensiveFinding["severity"];
    category: string;
    evidence: string[];
    remediation?: string;
    phase?: OffensivePhase;
    now?: string;
  },
):
  | { ok: true; engagement: Engagement; finding: OffensiveFinding }
  | { ok: false; error: string } {
  const now = input.now ?? new Date().toISOString();
  const phase = input.phase ?? engagement.currentPhase;
  if (!["ENUMERATE", "ANALYZE", "TEST", "EXPLOIT", "RETEST"].includes(phase))
    return {
      ok: false,
      error: `Findings cannot be recorded from the ${phase} phase.`,
    };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Finding title is required." };
  const evidence = input.evidence.map((e) => e.trim()).filter(Boolean);
  if (evidence.length === 0)
    return {
      ok: false,
      error:
        "No evidence attached. ARCHIE does not record findings without real evidence — nothing was fabricated.",
    };
  const finding: OffensiveFinding = {
    id: `finding_${Date.now().toString(36)}`,
    targetId: engagement.target.id,
    phase,
    title,
    severity: input.severity,
    evidence,
    category: input.category,
    remediation: input.remediation?.trim() || undefined,
    fixStatus: "OPEN",
    createdAt: now,
  };
  engagement.findings.push(finding);
  return { ok: true, engagement, finding };
}

/**
 * Close a finding as RESOLVED — only from the RETEST phase and
 * only with fresh evidence proving the fix. This is the
 * anti-fabrication gate on remediation claims.
 */
export function verifyFix(
  engagement: Engagement,
  findingId: string,
  retestEvidence: string[],
  now = new Date().toISOString(),
): { ok: true; engagement: Engagement } | { ok: false; error: string } {
  if (engagement.currentPhase !== "RETEST")
    return {
      ok: false,
      error: "Fixes can only be verified during the RETEST phase.",
    };
  const ev = retestEvidence.map((e) => e.trim()).filter(Boolean);
  if (ev.length === 0)
    return {
      ok: false,
      error:
        "Retest evidence is required to mark a fix RESOLVED — an unverified fix is NOT_VERIFIED, never resolved.",
    };
  const f = engagement.findings.find((x) => x.id === findingId);
  if (!f) return { ok: false, error: "Finding not found." };
  f.evidence.push(`RETEST (${now}): ${ev.join(" | ")}`);
  f.fixStatus = "RESOLVED";
  f.retestedAt = now;
  return { ok: true, engagement };
}

// ---------------------------------------------------------
// Report — honest summary over recorded evidence
// ---------------------------------------------------------

export interface EngagementReport {
  engagementId: string;
  target: string;
  targetKind: OffensiveTargetKind;
  phaseReached: OffensivePhase;
  completedPhases: OffensivePhase[];
  findingsBySeverity: Record<OffensiveFinding["severity"], number>;
  openFindings: number;
  resolvedFindings: number;
  /** Findings with no retest yet are NOT resolved — the
   *  report says so explicitly. */
  unverifiedFixes: number;
  /** Honest statement of what was and was not covered. */
  scopeStatement: string;
}

export function buildEngagementReport(
  engagement: Engagement,
): EngagementReport {
  const severities: OffensiveFinding["severity"][] = [
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "INFO",
  ];
  const findingsBySeverity = Object.fromEntries(
    severities.map((s) => [
      s,
      engagement.findings.filter((f) => f.severity === s).length,
    ]),
  ) as Record<OffensiveFinding["severity"], number>;
  const completedPhases = OFFENSIVE_PHASES.filter(
    (p) => engagement.phases[p].status === "DONE",
  );
  const open = engagement.findings.filter((f) => f.fixStatus === "OPEN");
  const resolved = engagement.findings.filter(
    (f) => f.fixStatus === "RESOLVED",
  );
  const unverified = engagement.findings.filter(
    (f) => f.fixStatus === "NOT_VERIFIED",
  );
  const scopeStatement =
    `Scope was: ${engagement.target.scope.join(", ")}. ` +
    (engagement.target.exclusions?.length
      ? `Exclusions: ${engagement.target.exclusions.join(", ")}. `
      : "") +
    `Findings are based only on recorded evidence; anything not tested is unproven, not safe.`;
  return {
    engagementId: engagement.id,
    target: engagement.target.identifier,
    targetKind: engagement.target.kind,
    phaseReached: engagement.currentPhase,
    completedPhases,
    findingsBySeverity,
    openFindings: open.length,
    resolvedFindings: resolved.length,
    unverifiedFixes: unverified.length,
    scopeStatement,
  };
}

// ---------------------------------------------------------
// Methodology knowledge (study — always free)
// ---------------------------------------------------------

/** Red-team methodology areas ARCHIE studies and applies. */
export const RED_TEAM_METHODOLOGY: readonly {
  key: string;
  label: string;
  areas: readonly string[];
}[] = [
  {
    key: "external_attack_surface",
    label: "External Attack Surface Mapping",
    areas: [
      "Public asset and exposure discovery",
      "Technology and version fingerprinting",
      "DNS, certificate and subdomain enumeration",
    ],
  },
  {
    key: "initial_access",
    label: "Initial Access Techniques",
    areas: [
      "Credential attacks and authentication weaknesses",
      "Injection classes (SQL, XSS, command, deserialization)",
      "Phishing-resistant social-engineering awareness (study only)",
    ],
  },
  {
    key: "post_exploitation",
    label: "Post-Exploitation & Privilege Escalation",
    areas: [
      "Horizontal and vertical privilege escalation concepts",
      "Authorization weakness patterns (IDOR, missing checks)",
      "Misconfiguration and default-credential classes",
    ],
  },
  {
    key: "persistence_limits",
    label: "Engagement Discipline",
    areas: [
      "No persistence on authorized targets beyond proof",
      "No data exfiltration beyond demonstration",
      "Stop conditions and cleanup obligations",
    ],
  },
];

/** Blue-team / defensive methodology areas. */
export const BLUE_TEAM_METHODOLOGY: readonly {
  key: string;
  label: string;
  areas: readonly string[];
}[] = [
  {
    key: "detection",
    label: "Detection Engineering",
    areas: [
      "Logging of authentication and authorization decisions",
      "Anomaly indicators for the technique classes studied",
      "Alert triage and false-positive reduction",
    ],
  },
  {
    key: "hardening",
    label: "Hardening & Secure Configuration",
    areas: [
      "Least privilege and role design",
      "Dependency and patch management",
      "Secrets management and rotation",
    ],
  },
  {
    key: "response",
    label: "Incident Response",
    areas: [
      "Containment, eradication, recovery sequencing",
      "Evidence preservation for analysis",
      "Post-incident lessons into permanent knowledge",
    ],
  },
];

/** Checks that can be safely automated in later ACTIVE
 *  phases vs checks that require a human in the loop. */
export const AUTOMATION_ELIGIBILITY: Record<
  string,
  "AUTOMATABLE" | "HUMAN_REQUIRED"
> = {
  dependency_version_audit: "AUTOMATABLE",
  security_header_review: "AUTOMATABLE",
  robots_and_public_asset_mapping: "AUTOMATABLE",
  tls_configuration_review: "AUTOMATABLE",
  endpoint_authorization_probe: "AUTOMATABLE",
  injection_payload_execution: "HUMAN_REQUIRED",
  privilege_escalation_attempt: "HUMAN_REQUIRED",
  exploit_development: "HUMAN_REQUIRED",
  social_engineering: "HUMAN_REQUIRED",
};

/** Recommend a remediation approach for a finding category —
 *  recommendations are free capabilities; implementing them
 *  on a real system follows the normal deploy pipeline
 *  (propose → owner approval → stage → test → approve →
 *  deploy). */
export function recommendRemediation(
  category: string,
):
  | {
      ok: true;
      recommendation: string;
      implementationRequiresOwnerApproval: true;
    }
  | { ok: false; error: string } {
  const map: Record<string, string> = {
    INJECTION:
      "Parameterized queries/stripping, input validation and context-aware output encoding; add regression tests reproducing the payload.",
    AUTHN_WEAKNESS:
      "Enforce MFA, rotate exposed credentials, rate-limit and monitor authentication endpoints.",
    AUTHZ_WEAKNESS:
      "Deny-by-default authorization checks on every object access; add automated tests for cross-tenant access.",
    PRIVILEGE_ESCALATION:
      "Audit role hierarchy, remove standing privilege, apply least privilege with short-lived grants.",
    MISCONFIGURATION:
      "Align configuration with a hardened baseline; add configuration linting to CI.",
    DEPENDENCY_VULNERABILITY:
      "Upgrade to a patched version, verify the advisory applies, and add a dependency audit gate.",
    SENSITIVE_EXPOSURE:
      "Remove the exposure from public reach, rotate affected secrets, and add exposure scanning.",
    XSS: "Context-aware output encoding, a strict content-security-policy, and HttpOnly cookies for sessions.",
    API_ABUSE:
      "Schema-validate all inputs, add rate limits and per-key quotas, and monitor for anomalies.",
  };
  const rec = map[category];
  if (!rec)
    return {
      ok: false,
      error: `No remediation playbook for "${category}" yet — the finding needs human-led remediation planning.`,
    };
  return {
    ok: true,
    recommendation: rec,
    implementationRequiresOwnerApproval: true,
  };
}
