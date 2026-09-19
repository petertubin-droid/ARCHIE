// =========================================================
// ARCHIE CONTEXT & INFERENCE ENGINE — TYPES
//
// Third intelligence layer (spec §§1–27). Sits ABOVE the
// Universal Lexicon Engine and the Semantic Knowledge Graph
// Engine and orchestrates them; it never duplicates them.
//
// EPISTEMIC CONTRACT (spec §2, §15, §20, §26):
//   FACT       — directly supported by stored knowledge.
//   CONTEXT    — supplied by the conversation/task.
//   INFERENCE  — derived from established relationships.
//   ASSUMPTION — required to proceed but not established.
//   UNCERTAINTY— multiple interpretations remain possible.
//
// The engine NEVER silently converts an assumption or
// inference into a fact. Knowledge statuses from the lower
// layers (VERIFIED / LEARNED / USER_PROVIDED / UNVERIFIED)
// ride along unchanged — nothing is re-stamped on the way up.
// =========================================================

import type {
  GraphEdgeRow,
  GraphNodeRow,
} from "../semantic-graph/retrieval.ts";

/** How a statement is known (spec §2). */
export type EpistemicKind =
  "FACT" | "CONTEXT" | "INFERENCE" | "ASSUMPTION" | "UNCERTAINTY";

/** Inference confidence states (spec §9). Meaningful states
 *  only — NO manufactured numerical percentages, because the
 *  system has no validated methodology for producing them. */
export type ConfidenceState =
  | "HIGH_CONFIDENCE" // direct stored VERIFIED fact (not an inference)
  | "SUPPORTED" // multi-hop over all-VERIFIED structural relations
  | "PLAUSIBLE" // inheritance / causal chains / premise-based rules
  | "UNCERTAIN" // depends on an ambiguous candidate concept
  | "INSUFFICIENT_EVIDENCE"; // no conclusion — stated honestly

/** Knowledge statuses from the lower layers (spec §20). */
export type KnowledgeStatus =
  "VERIFIED" | "LEARNED" | "USER_PROVIDED" | "UNVERIFIED";

/** Structured inference categories (spec §8). */
export type InferenceCategory =
  | "TAXONOMIC" // IS_A chains
  | "PROPERTY" // inherited properties/requirements
  | "FUNCTIONAL" // REQUIRES-based reasoning
  | "CAUSAL" // CAUSES chains (only over sourced CAUSES edges)
  | "COMPOSITIONAL" // PART_OF chains
  | "TEMPORAL" // explicit temporal premises only
  | "DOMAIN"; // domain-driven meaning selection

/** Implemented rules (spec §7, §8). Every rule guards its
 *  premises — an inference is produced ONLY when the
 *  underlying relationships are actually established. */
export type InferenceRuleId =
  | "TAXONOMIC_TRANSITIVE_2HOP" // A IS_A B ∧ B IS_A C ⇒ A IS_A C (derived)
  | "COMPOSITIONAL_TRANSITIVE_2HOP" // A PART_OF B ∧ B PART_OF C ⇒ A PART_OF C (derived)
  | "CAUSAL_TRANSITIVE_2HOP" // A CAUSES B ∧ B CAUSES C ⇒ A causes C indirectly (all-VERIFIED only)
  | "INHERITS_REQUIREMENT" // A IS_A B ∧ B REQUIRES X ⇒ A requires X (inherited)
  | "REQUIRES_UNAVAILABLE"; // A REQUIRES B + premise "B unavailable" ⇒ A cannot be completed using B

/** A single statement the engine reasoned over, with its
 *  honest epistemic label and provenance (spec §6, §14, §16). */
export interface Premise {
  id: string;
  kind: EpistemicKind;
  statement: string;
  knowledgeStatus: KnowledgeStatus;
  source: "SEMANTIC_GRAPH" | "LEXICON" | "CONVERSATION" | "USER_PROVIDED";
  conceptKey?: string;
  provenance?: string;
  /** Temporal honesty (spec §12): stored facts carry their
   *  dataset edition; conversation premises carry turn time.
   *  Old stored facts are NEVER treated as automatically
   *  current — the note says what is actually known. */
  temporalNote?: string;
}

/** A conclusion derived by a rule. NEVER equals a stored
 *  fact — the engine demotes conclusions that already exist
 *  as stored relationships to FACT premises instead (spec
 *  §10: DIRECT FACT ≠ DERIVED CONCLUSION). */
export interface DerivedConclusion {
  statement: string;
  subjectKey: string;
  subjectName: string;
  relation: string;
  objectKey: string;
  objectName: string;
  hops: number;
  /** true when a premise is USER_PROVIDED — the conclusion
   *  then depends on user-supplied information, never on
   *  externally verified knowledge alone (spec §14). */
  dependsOnUserPremise: boolean;
}

/** One inference with its machine-readable trace (spec §16):
 * premise ids + rule + conclusion. Auditable as data; the
 * user only ever sees the concise explanation, never
 * private chain-of-thought. */
export interface Inference {
  id: string;
  category: InferenceCategory;
  ruleId: InferenceRuleId;
  confidence: ConfidenceState;
  premiseIds: string[];
  conclusion: DerivedConclusion;
  /** Concise, user-appropriate basis (spec §6, §19):
   *  "This follows because A is documented as a type of B…" */
  explanation: string;
}

/** A detected conflict (spec §11). NEVER auto-resolved — the
 *  engine flags it with both sides' provenance and lets the
 *  reasoning layer (and the owner) decide. */
export interface ContradictionRecord {
  id: string;
  statement: string;
  sideA: { description: string; status: KnowledgeStatus; provenance: string };
  sideB: { description: string; status: KnowledgeStatus; provenance: string };
  disposition: "FLAGGED_NOT_RESOLVED";
  explanation: string;
}

/** Bounded context for the current turn (spec §3). NEVER the
 *  whole conversation — relevance-selected prior turns only. */
export interface ContextModel {
  currentMessage: string;
  /** Relevance-ranked prior turns actually loaded (bounded). */
  relevantPriorTurns: Array<{
    index: number;
    role: string;
    content: string;
    relevance: number;
    reason: string;
  }>;
  /** True when the message likely refers to the prior turn
   *  (pronoun/reference openers) — that turn is then always
   *  loaded regardless of term overlap. */
  referencedPriorTurnLikely: boolean;
  /** Domains inferred from identified concepts + graph
   *  USED_IN_DOMAIN edges (spec §13). Multiple candidates
   *  are preserved — ambiguity is never silently resolved. */
  domainCandidates: string[];
  language: string | null;
  temporal: {
    now: string;
    priorTurnCount: number;
    /** Honest note on temporal validity of stored knowledge. */
    note: string;
  };
  /** Explicit user constraints detected deterministically
   *  (spec §3) — markers only, never invented intent. */
  constraints: Array<{ text: string; source: "USER_MESSAGE" | "HISTORY" }>;
  /** User-supplied premises detected in the message (spec
   *  §14) — always labeled USER_PROVIDED, never verified. */
  userPremises: Premise[];
  /** Ambiguities carried from prior turns (stateless recompute
   *  from history, spec §3 "unresolved ambiguities"). */
  unresolvedAmbiguities: string[];
}

/** Normalized retrieved edge for the pure rule layer. The
 *  engine converts GraphEdgeRow + direction into this. */
export interface RetrievedEdge {
  sourceKey: string;
  sourceName: string;
  relationType: string;
  targetKey: string;
  targetName: string;
  knowledgeStatus: KnowledgeStatus;
  provenance: string;
  version: number | null;
}

export type RetrievedNodesByName = Map<string, string>; // concept key → canonical name

/** Machine-readable result returned to archie-core. The
 *  `block` is the ONLY part that reaches the model prompt;
 *  everything else is for audit (JSONB, append-only) and
 *  status surfaces — never exposed as chain-of-thought. */
export interface InferenceGroundTruth {
  block: string;
  context: ContextModel;
  /** Stored VERIFIED relationships used as premises. */
  facts: Premise[];
  inferences: Inference[];
  contradictions: ContradictionRecord[];
  /** Chains examined and NOT promoted, with reasons — the
   *  anti-hallucination record (spec §15, §16). Audit-only:
   *  never part of the model-facing block. */
  rejectedChains: Array<{ ruleId: string; reason: string }>;
  /** Terms left genuinely ambiguous — carried for the next
   *  turn and stated honestly in the block (spec §4). */
  carriedAmbiguities: Array<{ term: string; candidates: string[] }>;
  termsExamined: number;
  edgesExamined: number;
  extraHopsRetrieved: number;
  /** Honest label of the knowledge edition, e.g.
   *  "OEWN 2026-dev-bff3181" — read from lexicon_sources,
   *  never hardcoded. */
  sourceLabel: string;
}

export const EMPTY_INFERENCE_GROUND_TRUTH: InferenceGroundTruth = {
  block: "",
  context: {
    currentMessage: "",
    relevantPriorTurns: [],
    referencedPriorTurnLikely: false,
    domainCandidates: [],
    language: null,
    temporal: { now: "", priorTurnCount: 0, note: "" },
    constraints: [],
    userPremises: [],
    unresolvedAmbiguities: [],
  },
  facts: [],
  inferences: [],
  contradictions: [],
  rejectedChains: [],
  carriedAmbiguities: [],
  termsExamined: 0,
  edgesExamined: 0,
  extraHopsRetrieved: 0,
  sourceLabel: "",
};

// Re-exports so the engine module carries the full contract
// for its callers without importing three paths.
export type { GraphEdgeRow, GraphNodeRow };
