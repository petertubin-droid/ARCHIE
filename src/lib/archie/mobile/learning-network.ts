// =========================================================
// FRELUX PHASE 8 P4, ARCHIE LEARNING NETWORK
//
// The multi-subscriber knowledge ecosystem:
//
//   SUBSCRIBER A ┐
//   SUBSCRIBER B ├→ ARCHIE → LEARNING ENGINE → VALIDATION →
//   SUBSCRIBER C ┘          EVALUATION → APPROVAL → VERSIONED
//
// More data does NOT mean better knowledge. This module is
// the quality gate over pooled submissions:
//   * duplicates, contradictions, regional differences
//   * unreliable sources, low-confidence, outdated items
//   * malicious submissions and prompt injection
//   * data poisoning / mass-manipulation resistance
//
// The agreement rule (fixed): repeated agreement raises
// confidence only for DISTINCT contributors with
// INDEPENDENT content, and only by a capped amount. Bulk
// identical submissions never override authoritative
// evidence (a single ACTUAL_OUTCOME outranks any number of
// coordinated AI_EXTRACTED copies).
// =========================================================

import type { NetworkSubmission } from "./p4-types";

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\b[^.;]{0,30}\b(instructions|prompts)\b/i,
  /system prompt/i,
  /you are now/i,
  /disregard (the )?(above|rules|guidelines)/i,
  /act as (if|an?)/i,
  /api[_ -]?key|secret|password|credential/i,
  /<\/?(script|iframe)/i,
  /javascript:/i,
];

/** Detect prompt-injection attempts in submission content. */
export function detectInjection(
  content: Record<string, unknown>,
): string[] {
  const text = JSON.stringify(content);
  return INJECTION_PATTERNS.filter((rx) => rx.test(text)).map(
    (rx) => `PROMPT_INJECTION_PATTERN:${rx.source.slice(0, 40)}`,
  );
}

function contentKey(content: Record<string, unknown>): string {
  return JSON.stringify(content);
}

/** Evidence rank, identical to the knowledge-graph ranking. */
const EVIDENCE_RANK: Record<string, number> = {
  ACTUAL_OUTCOME: 0,
  SYSTEM_VERIFIED: 1,
  EXTERNAL_SOURCE_VERIFIED: 2,
  USER_CONFIRMED: 3,
  USER_PROVIDED: 4,
  AI_EXTRACTED: 5,
  AI_RECOMMENDATION: 5,
  ESTIMATED: 6,
  ASSUMPTION: 7,
};

function rank(s: NetworkSubmission): number {
  return EVIDENCE_RANK[s.evidence_state] ?? 99;
}

export interface QualityReport {
  duplicates: string[];
  contradictions: Array<{ a: string; b: string; detail: string }>;
  regional_differences: Array<{ a: string; b: string }>;
  unreliable_sources: string[];
  low_confidence: string[];
  outdated: string[];
  malicious: Array<{ contribution_id: string; reason: string }>;
  /** Per-topic agreement-derived confidence adjustments, capped. */
  confidence_adjustments: Array<{
    topic: string;
    distinct_contributors: number;
    independent_content: boolean;
    adjustment: number;
    capped: boolean;
  }>;
  flags: string[];
}

/** Evaluate a pool of network submissions for one topic. The
 *  decision (accept/flag/reject) always routes through human
 *  review, this report informs it. */
export function evaluateSubmissions(
  topic: string,
  submissions: NetworkSubmission[],
): QualityReport {
  const report: QualityReport = {
    duplicates: [],
    contradictions: [],
    regional_differences: [],
    unreliable_sources: [],
    low_confidence: [],
    outdated: [],
    malicious: [],
    confidence_adjustments: [],
    flags: [],
  };

  // --- Malicious content + prompt injection ---
  for (const s of submissions) {
    const injections = detectInjection(s.content);
    for (const pattern of injections) {
      report.malicious.push({
        contribution_id: s.contribution_id,
        reason: `Content contains a prompt-injection pattern (${pattern}), treated as untrusted data`,
      });
    }
  }

  // --- Flooding / mass manipulation: one contributor pushing
  //     many submissions on the same topic ---
  const byContributor = new Map<string, number>();
  for (const s of submissions) {
    byContributor.set(s.contributor_id, (byContributor.get(s.contributor_id) ?? 0) + 1);
  }
  const FLOOD_LIMIT = 5;
  for (const [contributor, count] of byContributor) {
    if (count > FLOOD_LIMIT) {
      report.flags.push(
        `CONTRIBUTOR_FLOODING:${contributor} (${count} submissions on "${topic}", possible mass manipulation)`,
      );
      for (const s of submissions.filter((x) => x.contributor_id === contributor)) {
        report.unreliable_sources.push(s.contribution_id);
      }
    }
  }

  // --- Coordinated identical submissions (poisoning signal) ---
  const byContent = new Map<string, NetworkSubmission[]>();
  for (const s of submissions) {
    const key = contentKey(s.content);
    const list = byContent.get(key) ?? [];
    list.push(s);
    byContent.set(key, list);
  }
  for (const [key, list] of byContent) {
    if (list.length > 1) {
      for (const s of list.slice(1)) {
        report.duplicates.push(s.contribution_id);
      }
      const contributors = new Set(list.map((s) => s.contributor_id));
      if (contributors.size > 1) {
        report.flags.push(
          `COORDINATED_IDENTICAL_CONTENT:${list.length} identical submissions from ${contributors.size} contributors, agreement from identical raw content gives NO confidence`,
        );
      }
    }
    void key;
  }

  // --- Pairwise conflicts: contradictions vs regional differences ---
  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const a = submissions[i];
      const b = submissions[j];
      const conflicts = numericConflicts(a.content, b.content);
      if (conflicts.length === 0) continue;
      const regionsOverlap =
        (a.region ?? "GLOBAL") === (b.region ?? "GLOBAL") ||
        (a.region ?? "GLOBAL") === "GLOBAL" ||
        (b.region ?? "GLOBAL") === "GLOBAL";
      if (regionsOverlap) {
        report.contradictions.push({
          a: a.contribution_id,
          b: b.contribution_id,
          detail: conflicts.join("; "),
        });
      } else {
        report.regional_differences.push({ a: a.contribution_id, b: b.contribution_id });
      }
    }
  }

  // --- Low confidence + outdated ---
  for (const s of submissions) {
    if (s.confidence < 0.5) report.low_confidence.push(s.contribution_id);
  }
  const strongest = [...submissions].sort(
    (a, b) => rank(a) - rank(b) || b.confidence - a.confidence,
  )[0];
  if (strongest) {
    for (const s of submissions) {
      if (
        s.contribution_id !== strongest.contribution_id &&
        rank(s) > rank(strongest) &&
        s.created_at < strongest.created_at
      ) {
        // A weaker-evidence item older than a stronger one on
        // the same topic is superseded (kept for audit, not
        // for use).
        report.outdated.push(s.contribution_id);
      }
    }
  }

  // --- Agreement-based confidence (capped, evidence-bounded) ---
  report.confidence_adjustments.push(
    agreementAdjustment(topic, submissions),
  );

  return report;
}

/** THE agreement rule: only DISTINCT contributors with
 *  INDEPENDENT (non-identical) content raise confidence, at
 *  most +0.2 total, and never past an authoritative single
 *  evidence item. */
export function agreementAdjustment(
  topic: string,
  submissions: NetworkSubmission[],
): {
  topic: string;
  distinct_contributors: number;
  independent_content: boolean;
  adjustment: number;
  capped: boolean;
} {
  const cleaned = submissions.filter(
    (s) => !detectInjection(s.content).length,
  );
  const contributors = new Set(cleaned.map((s) => s.contributor_id));
  const distinct = contributors.size;
  const contentVariants = new Set(cleaned.map((s) => contentKey(s.content)));
  const independent = contentVariants.size > 1;

  // The strongest single evidence in the pool bounds everything:
  const bestRank = cleaned.length ? Math.min(...cleaned.map(rank)) : 99;
  const authoritative = bestRank <= 3; // human-confirmed or better

  // Adjustment: +0.05 per distinct contributor, hard cap 0.2.
  let adjustment = Math.min(0.2, (distinct - 1) * 0.05);
  let capped = distinct > 1 && adjustment >= 0.2;
  if (!independent) {
    // identical copies agree by construction, no confidence
    adjustment = 0;
    capped = false;
  }
  if (authoritative) {
    // authoritative evidence is never overridden by volume
    capped = true;
    adjustment = Math.min(adjustment, 0.05);
  }
  return {
    topic,
    distinct_contributors: distinct,
    independent_content: independent,
    adjustment,
    capped,
  };
}

function numericConflicts(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] {
  const conflicts: string[] = [];
  for (const key of Object.keys(a)) {
    const av = a[key];
    const bv = b[key];
    if (
      typeof av === "number" &&
      typeof bv === "number" &&
      Number.isFinite(av) &&
      Number.isFinite(bv) &&
      av !== 0 &&
      bv !== 0 &&
      Math.abs(av - bv) / Math.max(Math.abs(av), Math.abs(bv)) > 0.01
    ) {
      conflicts.push(`field "${key}": ${av} vs ${bv}`);
    }
  }
  return conflicts;
}

/** The network's aggregate verdict for a topic pool, offered
 *  to the human review queue. ARCHIE never auto-accepts. */
export function networkVerdict(
  report: QualityReport,
): "ACCEPT_CANDIDATE_FOR_REVIEW" | "FLAG_FOR_REVIEW" | "REJECT" {
  if (report.malicious.length > 0) return "REJECT";
  const seriousFlags = report.flags.filter((f) =>
    f.startsWith("CONTRIBUTOR_FLOODING") || f.startsWith("COORDINATED"),
  );
  if (seriousFlags.length > 0) return "FLAG_FOR_REVIEW";
  if (report.contradictions.length > 0) return "FLAG_FOR_REVIEW";
  return "ACCEPT_CANDIDATE_FOR_REVIEW";
}
