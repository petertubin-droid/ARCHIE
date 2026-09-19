// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — SOURCE RELIABILITY
//
// Spec §9: NO simplistic "source X is always true". A
// government standard, a user statement, a forum post and
// an ARCHIE inference must not receive identical evidentiary
// treatment. Reliability depends on source type, evidence
// type, directness and — where documented — the lower
// layer's own verification status.
//
// HONESTY FIRST: the function returns an ORDINAL tier plus
// the DOCUMENTED basis for assigning it. It never invents
// numeric confidence, and a source with no basis for a
// rating gets UNRATED — not a polite guess.
// =========================================================

import type { EvidenceDraft, Reliability, ReliabilityTier } from "./types.ts";

/** Ordinal strength of tiers — used ONLY for conflict
 *  asymmetry notes (a conflict is still a conflict; the
 *  stronger side is never silently chosen). */
const TIER_ORDER: Record<ReliabilityTier, number> = {
  DETERMINISTIC: 6,
  STRUCTURED_VERIFIED: 5,
  STRUCTURED: 4,
  DOCUMENTED: 3,
  USER_STATEMENT: 2,
  DERIVED: 1,
  UNRATED: 0,
};

/**
 * Classify the reliability of one evidence record by its
 * DOCUMENTED properties — source type, evidence type, and
 * the lower layer's own verified status (which callers pass
 * through sourceRef/status metadata; the graph and lexicon
 * remain the authoritative layers).
 */
export function reliabilityOf(draft: EvidenceDraft): Reliability {
  // Deterministic FRELUX calculator output and mathematical
  // derivation: the strongest evidence ARCHIE can hold, and
  // ONLY in the domain of the calculation itself.
  if (
    draft.sourceType === "FRELUX_CALCULATOR" ||
    draft.evidenceType === "DETERMINISTIC_CALCULATOR" ||
    draft.evidenceType === "MATHEMATICAL_DERIVATION"
  ) {
    return {
      tier: "DETERMINISTIC",
      basis:
        "deterministic engine output (owner-approved FRELUX formula or mathematical derivation — reproducible, not estimated)",
    };
  }

  // Lower-layer VERIFIED knowledge: sourced relationships in
  // the semantic graph / verified lexicon rows. The tier
  // reflects the LOWER layer's verification, carried
  // through, never re-stamped here.
  if (
    (draft.sourceType === "SEMANTIC_GRAPH" || draft.sourceType === "LEXICON") &&
    (draft.evidenceType === "GRAPH_RELATIONSHIP" ||
      draft.evidenceType === "SEMANTIC_RELATIONSHIP" ||
      draft.evidenceType === "STRUCTURED_DATABASE")
  ) {
    return {
      tier: "STRUCTURED_VERIFIED",
      basis:
        "sourced row from the verified Universal Lexicon / Semantic Knowledge Graph (lower-layer VERIFIED status carried through unchanged)",
    };
  }

  // Real application data ARCHIE directly observed (its own
  // database state, tool outputs) — structured and direct,
  // but not an independent external verification.
  if (
    draft.sourceType === "FRELUX_DATABASE" ||
    draft.sourceType === "APP_OBSERVATION" ||
    draft.evidenceType === "OBSERVED_APP_DATA" ||
    draft.evidenceType === "STRUCTURED_DATABASE"
  ) {
    return {
      tier: "STRUCTURED",
      basis:
        "directly observed application state (real FRELUX/ARCHIE database row, read at retrieval time — not independently verified)",
    };
  }

  // External documentation referenced by a real retrieval —
  // documented but not verified by ARCHIE.
  if (
    draft.sourceType === "EXTERNAL_DOCUMENT" ||
    draft.evidenceType === "OFFICIAL_DOCUMENTATION" ||
    draft.evidenceType === "DIRECT_SOURCE"
  ) {
    return {
      tier: "DOCUMENTED",
      basis:
        "referenced document or source content (exists as retrieved; ARCHIE has not independently verified it)",
    };
  }

  if (draft.sourceType === "HISTORICAL_RECORD") {
    return {
      tier: "STRUCTURED",
      basis: "historical record retained in ARCHIE storage",
    };
  }

  // User/owner statements and conversation context: usable
  // as context, NEVER as independent verification.
  if (
    draft.sourceType === "CONVERSATION" ||
    draft.sourceType === "USER_STATEMENT" ||
    draft.evidenceType === "USER_PROVIDED_EVIDENCE"
  ) {
    return {
      tier: "USER_STATEMENT",
      basis:
        "supplied directly by the user/owner — context for reasoning, not independent verification",
    };
  }

  // ARCHIE's own inferences: always the weakest tier — a
  // derived conclusion stays distinguishable from fact.
  if (
    draft.sourceType === "ARCHIE_INFERENCE" ||
    draft.evidenceType === "INFERENCE"
  ) {
    return {
      tier: "DERIVED",
      basis:
        "derived by an ARCHIE inference rule from premises — never equivalent to directly established information",
    };
  }

  // No documented basis → UNRATED. Honesty over invention.
  return {
    tier: "UNRATED",
    basis: "no documented basis for a reliability rating",
  };
}

/**
 * Compare two tiers (conflict asymmetry notes only). The
 * result NEVER resolves a conflict — every conflict is
 * recorded; this only says which side rests on stronger
 * documented evidence, for the owner's review.
 */
export function strongerTierNotes(a: Reliability, b: Reliability): string {
  if (TIER_ORDER[a.tier] === TIER_ORDER[b.tier]) {
    return "both sides rest on equally documented evidence";
  }
  const [strong, weak] =
    TIER_ORDER[a.tier] > TIER_ORDER[b.tier] ? [a, b] : [b, a];
  return `side A rests on ${strong.tier}, side B on ${weak.tier} — the conflict is recorded either way and never auto-resolved`;
}
