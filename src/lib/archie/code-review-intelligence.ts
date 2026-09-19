// =========================================================
// FRELUX ARCHIE AMENDMENT, CODE REVIEW & ERROR INTELLIGENCE
//
// ARCHIE continuously identifies, explains and prioritizes
// findings across the FRELUX codebase: bugs, warnings, build
// and runtime failures, type/import/dependency problems,
// configuration issues, API/database failures, security
// vulnerabilities, performance problems, architectural
// weaknesses, accessibility/responsive issues, deployment
// problems, regression risks, duplicated/dead code and logic
// inconsistencies.
//
// Every significant finding carries severity, affected
// component, evidence, likely cause, impact and recommended
// remediation. Findings are always PROPOSALS, fixes go
// through the owner approval gate, never direct application.
// =========================================================

export type ReviewSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingKind =
  | "bug"
  | "warning"
  | "build_runtime_failure"
  | "type_import_dependency_problem"
  | "configuration_issue"
  | "api_database_failure"
  | "security_vulnerability"
  | "performance_problem"
  | "architectural_weakness"
  | "accessibility_responsive_issue"
  | "deployment_problem"
  | "regression_risk"
  | "duplicated_dead_code"
  | "logic_inconsistency";

export const FINDING_KINDS: readonly FindingKind[] = [
  "bug",
  "warning",
  "build_runtime_failure",
  "type_import_dependency_problem",
  "configuration_issue",
  "api_database_failure",
  "security_vulnerability",
  "performance_problem",
  "architectural_weakness",
  "accessibility_responsive_issue",
  "deployment_problem",
  "regression_risk",
  "duplicated_dead_code",
  "logic_inconsistency",
];

/** Severity ordering for prioritization. */
const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/** Default severity per finding kind, a finding may be
 *  raised or lowered per instance based on evidence. */
export const DEFAULT_SEVERITY: Readonly<Record<FindingKind, ReviewSeverity>> = {
  bug: "HIGH",
  warning: "LOW",
  build_runtime_failure: "HIGH",
  type_import_dependency_problem: "MEDIUM",
  configuration_issue: "MEDIUM",
  api_database_failure: "HIGH",
  security_vulnerability: "CRITICAL",
  performance_problem: "MEDIUM",
  architectural_weakness: "MEDIUM",
  accessibility_responsive_issue: "MEDIUM",
  deployment_problem: "HIGH",
  regression_risk: "HIGH",
  duplicated_dead_code: "LOW",
  logic_inconsistency: "HIGH",
};

export interface CodeReviewFinding {
  kind: FindingKind;
  severity: ReviewSeverity;
  affected_component: string;
  /** Concrete evidence: file path, error message, test output,
   *  stack trace, measurement. Findings without evidence are
   *  not findings, they are guesses. */
  evidence: string;
  likely_cause: string;
  impact: string;
  recommended_remediation: string;
  /** true → touches deterministic math, structural logic or
   *  safety rules: the fix additionally requires engineering
   *  review in the owner gate. */
  requires_engineering_review: boolean;
}

export interface PreparedFinding extends CodeReviewFinding {
  remediation_is_proposal: true;
  /** The gate the fix must pass before application. */
  gate: "ARCHIE proposes → OWNER reviews → OWNER authorizes → APPLY → TEST → AUDIT → VERSION → DEPLOY";
}

/** Classify and prepare a raw finding. Enforces evidence and
 *  the fixed remediation workflow. */
export function prepareFinding(input: {
  kind: FindingKind;
  affected_component: string;
  evidence: string;
  likely_cause: string;
  impact: string;
  recommended_remediation: string;
  severity?: ReviewSeverity;
}): { ok: boolean; error?: string; finding?: PreparedFinding } {
  if (!input.evidence.trim()) {
    return { ok: false, error: "A finding without evidence is a guess, evidence is required" };
  }
  if (!input.affected_component.trim()) {
    return { ok: false, error: "A finding requires the affected component" };
  }
  const severity = input.severity ?? DEFAULT_SEVERITY[input.kind];
  const requiresEngineering = /formula|deterministic|structural|foundation|safety|load/i.test(
    input.affected_component,
  );
  return {
    ok: true,
    finding: {
      kind: input.kind,
      severity,
      affected_component: input.affected_component,
      evidence: input.evidence,
      likely_cause: input.likely_cause,
      impact: input.impact,
      recommended_remediation: input.recommended_remediation,
      requires_engineering_review: requiresEngineering,
      remediation_is_proposal: true,
      gate: "ARCHIE proposes → OWNER reviews → OWNER authorizes → APPLY → TEST → AUDIT → VERSION → DEPLOY",
    },
  };
}

/** Prioritize findings: most severe first, and within the same
 *  severity, engineering-gated ones first. */
export function prioritizeFindings(
  findings: readonly CodeReviewFinding[],
): CodeReviewFinding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return Number(b.requires_engineering_review) - Number(a.requires_engineering_review);
  });
}

/** Describe a finding in the full reporting shape the owner
 *  sees: severity, component, evidence, cause, impact,
 *  remediation. */
export function describeFinding(f: CodeReviewFinding): string {
  return [
    `[${f.severity}] ${f.kind}`,
    `Component: ${f.affected_component}`,
    `Evidence: ${f.evidence}`,
    `Likely cause: ${f.likely_cause}`,
    `Impact: ${f.impact}`,
    `Remediation (proposal): ${f.recommended_remediation}`,
    f.requires_engineering_review
      ? "Fix additionally requires engineering review."
      : "Fix follows the standard owner approval gate.",
  ].join("\n");
}
