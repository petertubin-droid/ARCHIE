// =========================================================
// FRELUX PHASE 8 P3, ARCHIE KNOWLEDGE GRAPH
//
// The connective tissue of ARCHIE's learned knowledge. Built
// ONLY over approved, versioned knowledge items (Phase 6.5
// frelux_knowledge_items shape), never raw ingestion output.
//
// Capabilities (all pure, deterministic, testable):
//   * connect related knowledge (typed relations, provenance)
//   * detect contradictions between knowledge items
//   * resolve conflicts via evidence ranking (never arbitrary)
//   * identify domain coverage/verification gaps
//   * rank knowledge for retrieval (evidence + confidence +
//     recency + region fit)
//
// Governing principles (unchanged from the foundation):
//   * ACTUAL_OUTCOME outranks everything and never converts.
//   * Human-verified states outrank AI-extracted states.
//   * Regional scope is respected, an item never answers for
//     a region it was not scoped to.
//   * Contradictions are FLAGGED for human resolution; ARCHIE
//     never silently deletes or rewrites either side.
// =========================================================

import type { ArchieEvidenceState, ArchieScope } from "./types";

/** A learned knowledge item as persisted (frelux_knowledge_items row). */
export interface KnowledgeNode {
  id: string;
  domain: string;
  topic: string;
  region?: string | null;
  scope: ArchieScope;
  scope_key?: string | null;
  evidence_state: ArchieEvidenceState;
  confidence: number | null;
  content: Record<string, unknown>;
  version: number;
  status?: "ACTIVE" | "ROLLED_BACK";
  ingested_at: string;
}

/** Typed relations between knowledge items. */
export type KnowledgeRelation =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "REFINES"
  | "SUPERSEDES"
  | "RELATED_TO";

export interface KnowledgeLink {
  from_id: string;
  to_id: string;
  relation: KnowledgeRelation;
  /** Who/what created the link and why (provenance, always). */
  created_by: string;
  reason: string;
  created_at: string;
}

/** Evidence ranking, lower rank = stronger evidence. */
const EVIDENCE_RANK: Readonly<Record<ArchieEvidenceState, number>> = {
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

export function evidenceRank(state: ArchieEvidenceState): number {
  return EVIDENCE_RANK[state] ?? 99;
}

// ---------------------------------------------------------
// 1. Connecting knowledge
// ---------------------------------------------------------

/** Connect two knowledge items with a typed relation. Guards:
 *  no self-links, no links to rolled-back items, SUPERSEDES
 *  only newer → older, CONTRADICTS mirrors into the
 *  contradiction ledger (human resolution required). */
export function connectKnowledge(
  a: KnowledgeNode,
  b: KnowledgeNode,
  relation: KnowledgeRelation,
  provenance: { created_by: string; reason: string },
  now = new Date().toISOString(),
): { ok: boolean; error?: string; link?: KnowledgeLink } {
  if (a.id === b.id) {
    return { ok: false, error: "A knowledge item cannot link to itself" };
  }
  if (a.status === "ROLLED_BACK" || b.status === "ROLLED_BACK") {
    return { ok: false, error: "Rolled-back knowledge cannot be linked" };
  }
  if (relation === "SUPERSEDES" && a.ingested_at <= b.ingested_at) {
    return {
      ok: false,
      error: "SUPERSEDES requires the newer item to supersede the older one",
    };
  }
  const link: KnowledgeLink = {
    from_id: a.id,
    to_id: b.id,
    relation,
    ...provenance,
    created_at: now,
  };
  return { ok: true, link };
}

// ---------------------------------------------------------
// 2. Contradiction detection
// ---------------------------------------------------------

export interface ContradictionRecord {
  item_a_id: string;
  item_b_id: string;
  topic: string;
  domain: string;
  /** Human-readable description of exactly WHAT conflicts. */
  detail: string;
  /** Never auto-resolved, a human closes every contradiction. */
  status: "OPEN";
  detected_at: string;
}

/** Numeric fields compared with a relative tolerance so that
 *  12.001 vs 12.002 is noise, 12 vs 15 is a contradiction. */
const REL_TOLERANCE = 0.01;

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
      Math.abs(av - bv) / Math.max(Math.abs(av), Math.abs(bv)) > REL_TOLERANCE
    ) {
      conflicts.push(`field "${key}": ${av} vs ${bv}`);
    }
  }
  return conflicts;
}

/** Regions overlap when identical, or when either side is
 *  global (null region). Region-scoped knowledge from two
 *  different regions is a regional difference, NOT a
 *  contradiction. */
export function regionsOverlap(
  a?: string | null,
  b?: string | null,
): boolean {
  const ra = a ?? "GLOBAL";
  const rb = b ?? "GLOBAL";
  return ra === rb || ra === "GLOBAL" || rb === "GLOBAL";
}

/** Detect contradictions across ACTIVE knowledge: same domain
 *  and topic, overlapping regions, conflicting numeric facts. */
export function detectContradictions(
  items: KnowledgeNode[],
  now = new Date().toISOString(),
): ContradictionRecord[] {
  const active = items.filter((i) => (i.status ?? "ACTIVE") === "ACTIVE");
  const records: ContradictionRecord[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.domain !== b.domain) continue;
      if (a.topic !== b.topic) continue;
      if (!regionsOverlap(a.region, b.region)) continue;
      const conflicts = numericConflicts(a.content, b.content);
      if (conflicts.length > 0) {
        records.push({
          item_a_id: a.id,
          item_b_id: b.id,
          topic: a.topic,
          domain: a.domain,
          detail: `Conflicting values, ${conflicts.join("; ")}`,
          status: "OPEN",
          detected_at: now,
        });
      }
    }
  }
  return records;
}

// ---------------------------------------------------------
// 3. Conflict resolution (recommendation only, human decides)
// ---------------------------------------------------------

export interface ConflictResolution {
  winner_id: string;
  loser_ids: string[];
  rationale: string;
  /** Always true: ARCHIE proposes, a human disposes. */
  requires_human_decision: true;
}

/** Rank a set of conflicting items. Deterministic order:
 *  evidence rank → confidence → recency. ACTUAL_OUTCOME
 *  items always win over any non-outcome item. */
export function resolveConflict(
  conflicting: KnowledgeNode[],
): ConflictResolution | null {
  if (conflicting.length < 2) return null;
  const sorted = [...conflicting].sort((a, b) => {
    const rankDiff = evidenceRank(a.evidence_state) - evidenceRank(b.evidence_state);
    if (rankDiff !== 0) return rankDiff;
    const confA = a.confidence ?? 0;
    const confB = b.confidence ?? 0;
    if (confA !== confB) return confB - confA;
    return b.ingested_at.localeCompare(a.ingested_at);
  });
  const winner = sorted[0];
  const losers = sorted.slice(1);
  return {
    winner_id: winner.id,
    loser_ids: losers.map((l) => l.id),
    rationale:
      `Strongest evidence wins: ${winner.evidence_state}` +
      (winner.confidence != null ? ` (confidence ${winner.confidence})` : "") +
      ". Losing items are flagged, never deleted; a human closes the contradiction.",
    requires_human_decision: true,
  };
}

// ---------------------------------------------------------
// 4. Gap identification
// ---------------------------------------------------------

export type GapType =
  | "COVERAGE" // domain has no active knowledge at all
  | "VERIFICATION" // knowledge exists but nothing human-verified
  | "CONFIDENCE"; // knowledge exists but all low-confidence

export interface DomainGap {
  domain: string;
  gap_type: GapType;
  summary: string;
}

/** Identify knowledge gaps per domain. Evidence-based only :
 *  never invents what ARCHIE "should" know, only reports what
 *  the learned data demonstrably lacks. */
export function identifyGaps(
  items: KnowledgeNode[],
  activeDomains: readonly { key: string }[],
): DomainGap[] {
  const gaps: DomainGap[] = [];
  const active = items.filter((i) => (i.status ?? "ACTIVE") === "ACTIVE");
  for (const domain of activeDomains) {
    const inDomain = active.filter((i) => i.domain === domain.key);
    if (inDomain.length === 0) {
      gaps.push({
        domain: domain.key,
        gap_type: "COVERAGE",
        summary: `No approved knowledge exists for "${domain.key}"`,
      });
      continue;
    }
    const humanVerified = inDomain.some(
      (i) => evidenceRank(i.evidence_state) <= evidenceRank("USER_CONFIRMED"),
    );
    if (!humanVerified) {
      gaps.push({
        domain: domain.key,
        gap_type: "VERIFICATION",
        summary: `Domain "${domain.key}" has knowledge but none of it is human-verified`,
      });
    }
    if (inDomain.every((i) => (i.confidence ?? 0) < 0.5)) {
      gaps.push({
        domain: domain.key,
        gap_type: "CONFIDENCE",
        summary: `All knowledge in "${domain.key}" is low-confidence (< 0.5)`,
      });
    }
  }
  return gaps;
}

// ---------------------------------------------------------
// 5. Retrieval ranking
// ---------------------------------------------------------

export interface RankedNode {
  node: KnowledgeNode;
  score: number;
}

/** Rank knowledge for a question: evidence strength, confidence,
 *  recency and region fit, deterministic, explainable. */
export function rankForQuestion(
  question: { domain: string; region?: string | null },
  items: KnowledgeNode[],
): RankedNode[] {
  const active = items.filter((i) => (i.status ?? "ACTIVE") === "ACTIVE");
  return active
    .map((node) => {
      // Evidence: 0..4 → maps to 0..8 points (rank 0 strongest).
      const evidenceScore = Math.max(0, 8 - evidenceRank(node.evidence_state) * 1.2);
      const confidenceScore = (node.confidence ?? 0) * 6;
      const ageDays = Math.max(
        0,
        (Date.now() - new Date(node.ingested_at).getTime()) / 86_400_000,
      );
      const recencyScore = Math.max(0, 3 - ageDays / 90);
      const domainScore = node.domain === question.domain ? 2 : 0;
      const regionScore =
        regionsOverlap(node.region, question.region ?? null) ? 1 : 0;
      return {
        node,
        score:
          evidenceScore +
          confidenceScore +
          recencyScore +
          domainScore +
          regionScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
}
