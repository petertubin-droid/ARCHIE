// =========================================================
// FRELUX ARCHIE AMENDMENT, DEFENSIVE CYBERSECURITY
//
// ARCHIE continuously develops LEGITIMATE DEFENSIVE security
// intelligence for FRELUX: secure coding, authentication,
// authorization, encryption, secrets management, API/database/
// web/mobile security, dependency vulnerabilities, threat
// modeling, vulnerability assessment, monitoring, incident
// response and authorized security testing.
//
// Absolute refusals, enforced, not advised:
//   unauthorized access, credential theft, persistence,
//   surveillance, security bypass, attacks against
//   third-party systems. These are REFUSED regardless of
//   framing, target or claimed authorization.
// =========================================================

export const DEFENSIVE_CAPABILITIES: readonly string[] = [
  "secure coding review",
  "authentication security",
  "authorization & access control",
  "encryption in transit and at rest",
  "secrets management hygiene",
  "API security",
  "database security & RLS audit",
  "web security (headers, CSP, XSS/CSRF)",
  "mobile security",
  "dependency vulnerability assessment",
  "threat modeling",
  "vulnerability assessment",
  "security monitoring",
  "incident response preparation",
  "authorized security testing of FRELUX systems",
];

/** Hard-refused operations, no framing changes this. */
export const FORBIDDEN_SECURITY_OPERATIONS: readonly string[] = [
  "unauthorized access",
  "credential theft",
  "persistence (attacker tooling)",
  "surveillance",
  "security bypass",
  "attacks against third-party systems",
];

const FORBIDDEN_PATTERNS: ReadonlyArray<{ rx: RegExp; label: string }> = [
  { rx: /unauthorized access|break into|hack (into|someone)/i, label: "unauthorized access" },
  { rx: /credential (theft|stealing)|steal (the )?(password|secret|token|key)s?|harvest (password|credential)/i, label: "credential theft" },
  { rx: /(install|deploy|maintain).{0,30}(backdoor|rootkit|keylogger)|persist on (the )?(victim|user|someone)/i, label: "persistence (attacker tooling)" },
  { rx: /surveillance|spy on (the )?(user|owner|someone)|monitor (the )?(owner|someone)'s (device|screen)/i, label: "surveillance" },
  { rx: /bypass (the )?(security|auth|rls|gate)|disable (the )?(security|rls)/i, label: "security bypass" },
  { rx: /attack (the )?(third[- ]party|external)|exploit (a )?(third[- ]party|another company)|ddos/i, label: "attacks against third-party systems" },
];

export type SecurityVerdict = "DEFENSIVE_ALLOWED" | "REFUSED";

export interface SecurityOperationVerdict {
  verdict: SecurityVerdict;
  operation: string;
  rationale: string;
}

/** Classify a security operation request. Defensive work on
 *  FRELUX's own systems is allowed; anything matching a
 *  forbidden pattern is REFUSED, first match wins. */
export function classifySecurityOperation(operation: string): SecurityOperationVerdict {
  const op = operation.trim();
  const forbidden = FORBIDDEN_PATTERNS.find((p) => p.rx.test(op));
  if (forbidden) {
    return {
      verdict: "REFUSED",
      operation: op,
      rationale: `"${forbidden.label}" is absolutely refused. ARCHIE performs only legitimate defensive security for FRELUX, never unauthorized access, credential theft, persistence, surveillance, security bypass or attacks on third-party systems.`,
    };
  }
  return {
    verdict: "DEFENSIVE_ALLOWED",
    operation: op,
    rationale:
      "Defensive security work on FRELUX's own systems. Vulnerability identification and defensive fix preparation are allowed; fixes apply through the owner approval gate.",
  };
}

export interface VulnerabilityAssessment {
  finding: string;
  component: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  /** The defensive fix ARCHIE prepares, a proposal. */
  defensive_fix: string;
  /** Fix application goes through the owner gate. */
  fix_is_proposal: true;
}

/** Prepare a defensive vulnerability assessment. Refuses
 *  empty evidence and returns the fixed proposal semantics. */
export function prepareVulnerabilityAssessment(input: {
  finding: string;
  component: string;
  severity: VulnerabilityAssessment["severity"];
  evidence: string;
  defensive_fix: string;
}): { ok: boolean; error?: string; assessment?: VulnerabilityAssessment } {
  if (!input.evidence.trim()) {
    return { ok: false, error: "A vulnerability assessment requires evidence" };
  }
  if (!input.defensive_fix.trim()) {
    return { ok: false, error: "A defensive fix proposal is required" };
  }
  return {
    ok: true,
    assessment: {
      finding: input.finding,
      component: input.component,
      severity: input.severity,
      evidence: input.evidence,
      defensive_fix: input.defensive_fix,
      fix_is_proposal: true,
    },
  };
}

/** The incident response lifecycle ARCHIE supports for
 *  FRELUX, analysis and preparation; containment decisions
 *  involving production or credentials belong to the owner. */
export const INCIDENT_RESPONSE_STAGES: readonly string[] = [
  "detect",
  "analyze",
  "collect evidence",
  "prepare containment recommendation",
  "notify owner",
  "owner-directed response",
  "post-incident review",
];
