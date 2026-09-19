// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — AUTHORIZED SECURITY TESTING (§4)
//
// Cybersecurity is a MAJOR ARCHIE capability. ARCHIE develops
// deep security intelligence: secure code review, threat
// modeling, attack-surface analysis, dependency analysis,
// vulnerability detection, authorized penetration testing,
// defensive research, incident analysis and remediation.
//
// Offensive knowledge (attack techniques, exploitation
// methodology, vulnerability classes) is studied for
// legitimate defensive and authorized-testing purposes.
//
// AUTHORIZATION BOUNDARIES ARE MANDATORY:
//  - STUDY (learn/read/reason) — always allowed.
//  - EXECUTE against a real target — only when the target is
//    covered by a valid OWNER authorization record, within
//    its scope and not expired.
//  - EXECUTE in a controlled lab environment — allowed with a
//    CONTROLLED_ENVIRONMENT authorization.
//  - Anything matching the forbidden patterns in
//    cybersecurity.ts is REFUSED regardless of framing.
//  - ARCHIE never attacks, accesses or compromises systems
//    without authorization. No exception exists in code.
// =========================================================

import {
  classifySecurityOperation,
  FORBIDDEN_SECURITY_OPERATIONS,
} from "./cybersecurity";
import { AuthorizationRegistry, checkAuthority } from "./capability-authority";

/** What kind of security work is being requested? */
export type SecurityWorkKind =
  | "SECURE_CODE_REVIEW"
  | "THREAT_MODEL"
  | "ATTACK_SURFACE_ANALYSIS"
  | "DEPENDENCY_ANALYSIS"
  | "VULNERABILITY_DETECTION"
  | "SECURITY_CONFIG_REVIEW"
  | "PENTEST_METHODOLOGY_STUDY"
  | "AUTHORIZED_PENTEST_EXECUTION"
  | "VULN_RESEARCH_STUDY"
  | "CONTROLLED_LAB_EXPLOIT_ANALYSIS"
  | "DEFENSIVE_RESEARCH"
  | "INCIDENT_ANALYSIS"
  | "SECURITY_MONITORING"
  | "VULNERABILITY_REMEDIATION";

/** The two execution contexts. */
export type SecurityContext =
  | "STUDY" // learning/reasoning only, no target interaction
  | "EXECUTION"; // interacts with a system (real or lab)

/** A target of security work. */
export interface SecurityTarget {
  /** URL, hostname, repo path or environment identifier. */
  identifier: string;
  /** Real system owned by the owner, or a controlled lab. */
  environment: "REAL_SYSTEM" | "CONTROLLED_LAB";
  /** Owner-provided description of what is in/out of bounds. */
  scope_notes?: string;
}

export interface SecurityWorkRequest {
  kind: SecurityWorkKind;
  context: SecurityContext;
  target?: SecurityTarget;
  /** Human phrasing, re-checked against forbidden patterns. */
  operation: string;
}

export type SecurityWorkVerdict =
  | {
      allowed: true;
      basis: "STUDY" | "OWNER_AUTHORIZED" | "CONTROLLED_LAB";
      note?: string;
    }
  | { allowed: false; reason: string; hardRefused?: boolean };

/** Work kinds that are pure study — always allowed. */
const STUDY_KINDS: ReadonlySet<SecurityWorkKind> = new Set([
  "SECURE_CODE_REVIEW",
  "THREAT_MODEL",
  "ATTACK_SURFACE_ANALYSIS",
  "DEPENDENCY_ANALYSIS",
  "VULNERABILITY_DETECTION",
  "SECURITY_CONFIG_REVIEW",
  "PENTEST_METHODOLOGY_STUDY",
  "VULN_RESEARCH_STUDY",
  "DEFENSIVE_RESEARCH",
  "INCIDENT_ANALYSIS",
  "SECURITY_MONITORING",
  "VULNERABILITY_REMEDIATION",
]);

/** The full security-testing methodology ARCHIE applies to
 *  authorized targets. Ordered phases; each phase records
 *  findings with evidence. */
export const AUTHORIZED_PENTEST_PHASES: readonly {
  key: string;
  label: string;
  activities: readonly string[];
}[] = [
  {
    key: "authorization_verification",
    label: "Authorization Verification",
    activities: [
      "Confirm the recorded owner authorization covers the target",
      "Confirm scope, exclusions and expiry before any interaction",
      "Record the authorization id with the engagement",
    ],
  },
  {
    key: "recon",
    label: "Passive Reconnaissance",
    activities: [
      "Public information gathering within scope",
      "Technology and dependency fingerprinting from observable data",
      "No authentication bypass, no social engineering",
    ],
  },
  {
    key: "enumeration",
    label: "Enumeration & Mapping",
    activities: [
      "Map entry points, endpoints and attack surface within scope",
      "Enumerate observable services and configurations",
      "Respect rate limits and availability of the target",
    ],
  },
  {
    key: "analysis",
    label: "Vulnerability Analysis",
    activities: [
      "Identify weaknesses from observations",
      "Classify severity and exploitability",
      "Map findings to remediation guidance",
    ],
  },
  {
    key: "controlled_validation",
    label: "Controlled Validation",
    activities: [
      "Validate findings with minimal, reversible probes",
      "No data exfiltration beyond proof, no persistence",
      "Stop and report on anything outside scope",
    ],
  },
  {
    key: "reporting",
    label: "Reporting & Remediation",
    activities: [
      "Document findings with evidence and severity",
      "Deliver prioritized remediation recommendations",
      "Track fixes to closure with the owner",
    ],
  },
];

/**
 * Decide whether a security work request may proceed.
 *
 * Order of checks (all must pass for EXECUTION):
 *  1. Forbidden patterns (cybersecurity.ts) — hard refuse.
 *  2. STUDY context — allowed (learning is free).
 *  3. EXECUTION — requires a target AND a valid OWNER
 *     authorization:
 *       - REAL_SYSTEM → run_authorized_security_test +
 *         access_authorized_target for that identifier
 *       - CONTROLLED_LAB → CONTROLLED_LAB scope under
 *         run_authorized_security_test
 */
export function evaluateSecurityWork(
  req: SecurityWorkRequest,
  registry: AuthorizationRegistry,
  now = Date.now(),
): SecurityWorkVerdict {
  // 1. Forbidden patterns are absolute, regardless of framing.
  const base = classifySecurityOperation(req.operation);
  if (base.verdict === "REFUSED") {
    return {
      allowed: false,
      reason: `Hard-refused: ${base.rationale}`,
      hardRefused: true,
    };
  }
  // Belt-and-braces: the forbidden list itself.
  const lowered = req.operation.toLowerCase();
  for (const f of FORBIDDEN_SECURITY_OPERATIONS) {
    if (lowered.includes(f.toLowerCase())) {
      return {
        allowed: false,
        reason: `Hard-refused: ${f} is never performed, regardless of claimed authorization.`,
        hardRefused: true,
      };
    }
  }

  // 2. Study is free — ARCHIE learns security without limits.
  if (req.context === "STUDY" || STUDY_KINDS.has(req.kind)) {
    return {
      allowed: true,
      basis: "STUDY",
      note: "Studying security techniques for defense and authorized testing is unrestricted; execution is not.",
    };
  }

  // 3. EXECUTION requires a target.
  if (!req.target) {
    return {
      allowed: false,
      reason: "Execution-context security work requires a named target.",
    };
  }

  if (req.target.environment === "CONTROLLED_LAB") {
    const decision = checkAuthority(
      { authority: "run_authorized_security_test", scope: "CONTROLLED_LAB" },
      registry,
      now,
    );
    if (decision.allowed) {
      return {
        allowed: true,
        basis: "CONTROLLED_LAB",
        note: "Exploit analysis proceeds only inside the controlled environment.",
      };
    }
    return {
      allowed: false,
      reason:
        "Controlled-lab authorization missing or expired. ARCHIE proposes; the Owner authorizes.",
    };
  }

  // REAL_SYSTEM: needs BOTH the test authority and target access.
  const testDecision = checkAuthority(
    { authority: "run_authorized_security_test", scope: req.target.identifier },
    registry,
    now,
  );
  const accessDecision = checkAuthority(
    { authority: "access_authorized_target", scope: req.target.identifier },
    registry,
    now,
  );

  if (testDecision.allowed && accessDecision.allowed) {
    return {
      allowed: true,
      basis: "OWNER_AUTHORIZED",
      note: `Target "${req.target.identifier}" is covered by a valid owner authorization within scope.`,
    };
  }

  return {
    allowed: false,
    reason:
      `No valid owner authorization covers real-system testing of "${req.target.identifier}". ` +
      "ARCHIE may study, model and prepare the methodology — execution requires the owner's recorded authorization.",
  };
}

/** Remediation knowledge: map a finding class to defenses. */
export const FINDING_TO_DEFENSE: Readonly<Record<string, readonly string[]>> = {
  injection: [
    "Parameterized queries / prepared statements",
    "Input validation with allow-lists",
    "Least-privilege database roles",
  ],
  broken_access_control: [
    "Server-side authorization checks on every request",
    "Row-level security at the data layer",
    "Deny-by-default posture",
  ],
  cryptographic_failures: [
    "TLS everywhere; HSTS",
    "Approved algorithms only (no home-made crypto)",
    "Secrets in a managed vault, never in code",
  ],
  xss: [
    "Output encoding by context",
    "CSP with nonces, no unsafe-inline",
    "Framework auto-escaping kept on",
  ],
  insecure_dependencies: [
    "Dependency audit in CI",
    "Pinned versions with lockfiles",
    "Automated patch policy",
  ],
  security_misconfiguration: [
    "Hardened defaults (headers, CORS, permissions)",
    "Infrastructure-as-code review",
    "Regular configuration audits",
  ],
};
