// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — PROACTIVE REASONING (§6)
//
// ARCHIE reasons beyond the immediate request. For any
// situation it can be asked (and asks itself):
//
//   What is happening?          (WHAT)
//   Why is it happening?         (WHY)
//   What could happen next?      (NEXT)
//   What could fail?            (RISK)
//   What opportunity exists?    (OPPORTUNITY)
//   What should be improved?    (IMPROVE)
//   What alternatives exist?    (ALTERNATIVES)
//   What evidence supports it?  (EVIDENCE)
//   What information is missing? (GAP)
//
// ARCHIE proactively surfaces important findings instead of
// waiting for the owner to discover them — through the
// surfacing policy below (severity-gated, deduplicated).
// =========================================================

/** The nine reasoning lenses. */
export type ReasoningLens =
  | "WHAT"
  | "WHY"
  | "NEXT"
  | "RISK"
  | "OPPORTUNITY"
  | "IMPROVE"
  | "ALTERNATIVES"
  | "EVIDENCE"
  | "GAP";

export const ALL_LENSES: readonly ReasoningLens[] = [
  "WHAT",
  "WHY",
  "NEXT",
  "RISK",
  "OPPORTUNITY",
  "IMPROVE",
  "ALTERNATIVES",
  "EVIDENCE",
  "GAP",
];

export interface ReasoningAnswer {
  lens: ReasoningLens;
  statement: string;
  /** Evidence backing the statement — cited, never implied. */
  evidence: readonly string[];
  confidence: number; // 0..1
}

/**
 * A reasoning frame: all nine lenses applied to a situation.
 * Lenses with insufficient evidence are marked explicitly —
 * an unanswered lens is recorded as a GAP, never guessed.
 */
export interface ReasoningFrame {
  subject: string;
  answers: readonly ReasoningAnswer[];
  unansweredLenses: readonly ReasoningLens[];
  created_at: number;
}

/**
 * Assemble a reasoning frame. Validates the anti-fabrication
 * contract: every answer must cite at least one evidence item,
 * and every unanswered lens must be listed in
 * unansweredLenses (never silently dropped).
 */
export function buildReasoningFrame(
  subject: string,
  answers: readonly ReasoningAnswer[],
): { ok: true; frame: ReasoningFrame } | { ok: false; error: string } {
  if (!subject.trim())
    return { ok: false, error: "A reasoning frame requires a subject." };

  const answered = new Set<ReasoningLens>();
  for (const a of answers) {
    if (!ALL_LENSES.includes(a.lens)) {
      return { ok: false, error: `Unknown lens "${a.lens}".` };
    }
    if (!a.statement.trim()) {
      return { ok: false, error: `Lens ${a.lens}: a statement is required.` };
    }
    if (!a.evidence.length) {
      return {
        ok: false,
        error: `Lens ${a.lens}: every statement must cite evidence. No evidence → record it as a GAP instead.`,
      };
    }
    if (a.confidence < 0 || a.confidence > 1) {
      return {
        ok: false,
        error: `Lens ${a.lens}: confidence must be within 0..1.`,
      };
    }
    if (answered.has(a.lens)) {
      return { ok: false, error: `Lens ${a.lens} answered twice.` };
    }
    answered.add(a.lens);
  }

  const unanswered = ALL_LENSES.filter((l) => !answered.has(l));
  return {
    ok: true,
    frame: {
      subject,
      answers,
      unansweredLenses: unanswered,
      created_at: Date.now(),
    },
  };
}

/** A proactive finding ARCHIE surfaces to the owner. */
export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface ProactiveFinding {
  id: string;
  title: string;
  detail: string;
  severity: FindingSeverity;
  /** Where it was observed: a URL, component, domain, metric. */
  origin: string;
  /** Evidence items supporting the finding. */
  evidence: readonly string[];
  created_at: number;
  /** Lenses the finding already answers (dedupe signal). */
  lenses_covered?: readonly ReasoningLens[];
}

/** Severity ordering for surfacing decisions. */
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

/** The proactive surfacing policy:
 *  - CRITICAL/HIGH findings surface IMMEDIATELY.
 *  - MEDIUM findings surface in the next digest.
 *  - LOW/INFO findings surface only in on-demand reports.
 *  - Duplicate findings (same origin + near-identical title)
 *    are suppressed — the original stands.
 */
export function shouldSurface(
  finding: ProactiveFinding,
  seenFindings: readonly ProactiveFinding[],
): {
  surface: boolean;
  mode: "IMMEDIATE" | "DIGEST" | "REPORT_ONLY";
  reason: string;
} {
  // Evidence discipline: a finding with no evidence is never
  // surfaced — it goes back to research.
  if (!finding.evidence.length) {
    return {
      surface: false,
      mode: "REPORT_ONLY",
      reason: "Finding carries no evidence; not surfaced until evidenced.",
    };
  }

  // Dedupe: same origin + same normalized title = already surfaced.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const duplicate = seenFindings.some(
    (f) => f.origin === finding.origin && norm(f.title) === norm(finding.title),
  );
  if (duplicate) {
    return {
      surface: false,
      mode: "REPORT_ONLY",
      reason: "Duplicate of an already-surfaced finding.",
    };
  }

  if (finding.severity === "CRITICAL" || finding.severity === "HIGH") {
    return {
      surface: true,
      mode: "IMMEDIATE",
      reason: `${finding.severity} severity surfaces immediately.`,
    };
  }
  if (finding.severity === "MEDIUM") {
    return {
      surface: true,
      mode: "DIGEST",
      reason: "MEDIUM severity surfaces in the next digest.",
    };
  }
  return {
    surface: false,
    mode: "REPORT_ONLY",
    reason: "LOW/INFO available in reports.",
  };
}

/** Rank findings for display: severity first, newest first. */
export function rankFindings(
  findings: readonly ProactiveFinding[],
): ProactiveFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      b.created_at - a.created_at,
  );
}

/**
 * Proactive sweep: given observations, ARCHIE identifies what
 * warrants attention. This is the scheduler-facing contract:
 *  a sweep ALWAYS produces either findings to surface or an
 *  explicit all-clear — never silence that could hide a miss.
 */
export interface ProactiveSweep {
  ran_at: number;
  scope: string;
  findings: readonly ProactiveFinding[];
  all_clear: boolean;
  note: string;
}

export function recordSweep(
  scope: string,
  findings: readonly ProactiveFinding[],
): ProactiveSweep {
  const evidenced = findings.filter((f) => f.evidence.length > 0);
  return {
    ran_at: Date.now(),
    scope,
    findings: evidenced,
    all_clear: evidenced.length === 0,
    note:
      evidenced.length === 0
        ? "Sweep complete: nothing met the evidence bar. All clear recorded explicitly."
        : `${evidenced.length} evidenced finding(s) recorded for surfacing policy.`,
  };
}
