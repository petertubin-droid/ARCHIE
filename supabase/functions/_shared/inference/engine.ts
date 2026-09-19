// =========================================================
// ARCHIE CONTEXT & INFERENCE ENGINE — ORCHESTRATION
//
// Spec §1, §18, §26: the engine that connects the Universal
// Lexicon Engine and the Semantic Knowledge Graph Engine to
// ARCHIE's live reasoning pathway:
//
//   USER INPUT → CONTEXT ANALYSIS → LEXICON/SENSE
//   IDENTIFICATION → GRAPH RETRIEVAL → EVIDENCE +
//   RELATIONSHIP ANALYSIS → INFERENCE → ARCHIE REASONING
//   → RESPONSE
//
// It ORCHESTRATES the lower layers; it never duplicates
// them. Every retrieval is bounded (edge budget, term cap,
// lazy 2nd-hop cap); simple messages stay fast; the engine
// failure NEVER blocks the chat path (the caller degrades
// honestly, as with the lexicon and graph layers).
//
// The `block` reaches the model prompt with FACT vs INFERENCE
// labels intact. Machine-readable traces ride in the returned
// object for the audit ledger only — never exposed as
// chain-of-thought (spec §16, §19).
// =========================================================

import { lexicalTokens, latestSourceLabel } from "../lexicon/retrieval.ts";
import {
  selectContextualConcepts,
  getNeighbors,
  type GraphClient,
  type NeighborEdge,
} from "../semantic-graph/retrieval.ts";
import { buildContextModel, type HistoryTurn } from "./context.ts";
import { applyInferenceRules } from "./rules.ts";
import { detectContradictions } from "./contradiction.ts";
import type { InferenceGroundTruth, Premise, RetrievedEdge } from "./types.ts";

export interface InferenceEngineOptions {
  /** Max message terms examined (default 6). */
  maxTerms?: number;
  /** Max concepts fully processed (identified + ambiguous
   *  top candidates; default 3). */
  maxConcepts?: number;
  /** Total edge budget across all neighborhood retrievals
   *  (default 32 — bounded, never the graph in context). */
  edgeBudget?: number;
  /** Lazy second-hop fetches for 2-hop chains (default 4). */
  maxExtraHops?: number;
  /** Max fact premises surfaced in the block (default 12). */
  maxFacts?: number;
  /** Carried ambiguities from the previous turn. */
  carriedAmbiguities?: string[];
  /** Resolved language registry code. */
  language?: string | null;
  /** Clock override for deterministic tests. */
  now?: () => string;
}

/** Normalize a NeighborEdge into the pure-rule layer's flat
 *  edge form. getNeighbors returns raw rows with direction;
 *  semantics come from the stored relation (source REL
 *  target), so direction only tells us which endpoint is the
 *  node we asked about — the triple itself is verbatim. */
function normalize(
  edge: NeighborEdge,
  nameOf: Map<string, string>,
): RetrievedEdge {
  const name = (key: string) => nameOf.get(key) ?? key;
  return {
    sourceKey: edge.edge.source_concept_key,
    sourceName: name(edge.edge.source_concept_key),
    relationType: edge.edge.relation_type,
    targetKey: edge.edge.target_concept_key,
    targetName: name(edge.edge.target_concept_key),
    knowledgeStatus: edge.edge
      .knowledge_status as RetrievedEdge["knowledgeStatus"],
    provenance: edge.edge.provenance ?? "",
    version: edge.edge.version ?? null,
  };
}

/**
 * The full pipeline for one live ARCHIE turn (spec §18).
 * Deterministic, bounded, honest.
 */
export async function inferenceGroundTruth(
  svc: GraphClient,
  message: string,
  history: HistoryTurn[],
  opts: InferenceEngineOptions = {},
): Promise<InferenceGroundTruth> {
  const maxTerms = opts.maxTerms ?? 6;
  const maxConcepts = opts.maxConcepts ?? 3;
  const edgeBudget = opts.edgeBudget ?? 32;
  const maxExtraHops = opts.maxExtraHops ?? 4;
  const maxFacts = opts.maxFacts ?? 12;

  const sourceLabel = await latestSourceLabel(svc);

  // ---- 1) CONTEXT ANALYSIS (bounded — spec §3)
  const context = buildContextModel(message, history, {
    carriedAmbiguities: opts.carriedAmbiguities ?? [],
    language: opts.language ?? null,
    sourceLabel,
    now: opts.now,
  });

  // ---- 2) TERM IDENTIFICATION → LEXICON SENSES → CONCEPTS
  //  (lower layers do the real work — spec §17)
  const tokens = Array.from(new Set(lexicalTokens(message)))
    .filter((t) => t.length >= 3)
    .slice(0, maxTerms);

  type Working = {
    term: string;
    conceptKey: string;
    conceptName: string;
    definition: string;
    ambiguous: boolean;
  };
  const identified: Working[] = [];
  const ambiguous: Array<{ term: string; candidates: string[] }> = [];
  let edgesExamined = 0;

  for (const term of tokens) {
    if (identified.length >= maxConcepts) break;
    try {
      const sel = await selectContextualConcepts(svc, term, message);
      if (!sel.concepts.length) continue;
      if (sel.selected) {
        identified.push({
          term,
          conceptKey: sel.selected.conceptKey,
          conceptName: sel.selected.canonicalName,
          definition: sel.selected.definition,
          ambiguous: false,
        });
      } else {
        const top = sel.ranked[0] ?? sel.concepts[0];
        ambiguous.push({
          term,
          candidates: (sel.ranked.length ? sel.ranked : sel.concepts)
            .slice(0, 3)
            .map((c) => c.definition),
        });
        if (identified.length < maxConcepts && top) {
          // the top candidate participates as a CANDIDATE,
          // clearly labeled — never as resolved (spec §§4, 6)
          identified.push({
            term,
            conceptKey: top.conceptKey,
            conceptName: top.canonicalName,
            definition: top.definition,
            ambiguous: true,
          });
        }
      }
    } catch {
      continue; // one term's failure never blocks the turn
    }
  }

  // ---- 3) BOUNDED GRAPH RETRIEVAL (edge budget shared
  //  across ALL concepts — spec §21)
  const nameOf = new Map<string, string>();
  const retrievedEdges: RetrievedEdge[] = [];
  const seenTriple = new Set<string>();
  const domains = new Set<string>();

  for (const w of identified) {
    if (edgesExamined >= edgeBudget) break;
    try {
      const { node, neighbors } = await getNeighbors(svc, w.conceptKey, {
        limit: Math.min(8, edgeBudget - edgesExamined),
      });
      if (node) {
        nameOf.set(node.concept_key, node.canonical_name);
        if (node.domain) domains.add(node.domain);
      }
      const budgeted = neighbors.slice(0, edgeBudget - edgesExamined);
      edgesExamined += budgeted.length;
      for (const nb of budgeted) {
        nameOf.set(nb.other.concept_key, nb.other.canonical_name);
        if (nb.other.domain) domains.add(nb.other.domain);
        if (nb.edge.relation_type === "USED_IN_DOMAIN" && nb.other.domain) {
          domains.add(nb.other.domain);
        }
        const flat = normalize(nb, nameOf);
        const triple = `${flat.sourceKey}|${flat.relationType}|${flat.targetKey}`;
        if (seenTriple.has(triple)) continue;
        seenTriple.add(triple);
        retrievedEdges.push(flat);
      }
    } catch {
      continue;
    }
  }

  // ---- 4) LAZY SECOND HOP — the mid nodes of IS_A/CAUSES/
  //  PART_OF chains, so 2-hop inference runs on actually
  //  retrieved, provenance-carrying edges (spec §10)
  let extraHopsRetrieved = 0;
  const hopRelations = new Set(["IS_A", "CAUSES", "PART_OF", "REQUIRES"]);
  const identifiedKeys = new Set(identified.map((w) => w.conceptKey));
  const mids = new Set(
    retrievedEdges
      .filter(
        (e) =>
          hopRelations.has(e.relationType) &&
          e.sourceKey !== e.targetKey &&
          identifiedKeys.has(e.sourceKey) &&
          !identifiedKeys.has(e.targetKey),
      )
      .map((e) => e.targetKey),
  );
  for (const mid of mids) {
    if (extraHopsRetrieved >= maxExtraHops) break;
    if (edgesExamined >= edgeBudget) break;
    try {
      const { neighbors } = await getNeighbors(svc, mid, {
        limit: Math.min(6, edgeBudget - edgesExamined),
      });
      extraHopsRetrieved += 1;
      const budgeted = neighbors
        .filter((nb) => hopRelations.has(nb.edge.relation_type))
        .slice(0, edgeBudget - edgesExamined);
      edgesExamined += budgeted.length;
      for (const nb of budgeted) {
        nameOf.set(nb.other.concept_key, nb.other.canonical_name);
        const flat = normalize(nb, nameOf);
        const triple = `${flat.sourceKey}|${flat.relationType}|${flat.targetKey}`;
        if (seenTriple.has(triple)) continue;
        seenTriple.add(triple);
        retrievedEdges.push(flat);
      }
    } catch {
      continue;
    }
  }
  context.domainCandidates = [...domains].slice(0, 4);

  // ---- 5) EVIDENCE ASSEMBLY — premises with honest labels
  //  (spec §§6, 14, 20)
  const facts: Premise[] = [];
  const factPremiseByEdge = new Map<string, Premise>();
  for (const e of retrievedEdges) {
    if (facts.length >= maxFacts) break;
    const p: Premise = {
      id: `fact-${facts.length}`,
      kind: "FACT",
      conceptKey: e.sourceKey,
      statement: `${e.sourceName} ${e.relationType.replace(/_/g, " ")} ${e.targetName}`,
      knowledgeStatus: e.knowledgeStatus,
      source: "SEMANTIC_GRAPH",
      provenance: e.provenance,
      temporalNote: `stored relationship, edition ${sourceLabel}`,
    };
    facts.push(p);
    factPremiseByEdge.set(`${e.sourceKey}|${e.relationType}|${e.targetKey}`, p);
  }
  const premiseForEdge = (e: RetrievedEdge): Premise | undefined =>
    factPremiseByEdge.get(`${e.sourceKey}|${e.relationType}|${e.targetKey}`);

  // attach user premises to the concept they are about — only
  // when the message names exactly one identified concept
  // (spec §14: premise-based conclusions must not stretch
  // beyond what the user actually said)
  const messageLower = message.toLowerCase();
  const named = identified.filter(
    (w) =>
      w.conceptName.length >= 3 &&
      messageLower.includes(w.conceptName.toLowerCase()),
  );
  if (named.length === 1 && context.userPremises.length) {
    for (const up of context.userPremises) up.conceptKey = named[0].conceptKey;
  }

  // ---- 6) CONTROLLED INFERENCE + 7) CONTRADICTION CHECK
  const { inferences, rejected } = applyInferenceRules(
    retrievedEdges,
    premiseForEdge,
    context.userPremises,
  );
  const contradictions = detectContradictions(
    retrievedEdges,
    facts,
    inferences,
    context.userPremises,
  );

  // ---- 8) THE GROUND-TRUTH BLOCK — the ONLY part that
  //  reaches the model. FACT vs INFERENCE vs ASSUMPTION
  //  labels stay explicit and inseparable (spec §§2, 19, 26).
  const lines: string[] = [];
  if (context.relevantPriorTurns.length) {
    lines.push(
      `CONTEXT: ${context.relevantPriorTurns.length} prior turn(s) loaded as context (relevance-ranked, bounded): ` +
        context.relevantPriorTurns
          .map((t) => `[${t.role}] ${t.content.slice(0, 120)}`)
          .join(" | "),
    );
  }
  for (const w of identified) {
    lines.push(
      `TERM: "${w.term}" → concept (${w.definition}) ` +
        (w.ambiguous
          ? "[CANDIDATE — context did not resolve the ambiguity; never treat as resolved]"
          : "[resolved by contextual evidence]"),
    );
  }
  for (const f of facts) {
    lines.push(
      `FACT [${f.knowledgeStatus}, stored]: ${f.statement} — sourced (${sourceLabel}).`,
    );
  }
  for (const inf of inferences) {
    const dep = inf.conclusion.dependsOnUserPremise
      ? " NOTE: depends on user-provided information, not verified knowledge."
      : "";
    lines.push(
      `INFERENCE [${inf.confidence}, DERIVED — never present as a stored fact]: ` +
        `${inf.conclusion.statement}. ${inf.explanation}${dep}`,
    );
  }
  for (const up of context.userPremises) {
    lines.push(
      `USER-PREMISE [USER_PROVIDED, not verified]: ${up.statement} — may be used as a premise but must not be presented as established fact.`,
    );
  }
  for (const c of contradictions) {
    lines.push(
      `CONTRADICTION [FLAGGED, not resolved]: ${c.statement}. ${c.explanation}`,
    );
  }
  for (const a of ambiguous) {
    lines.push(
      `UNCERTAINTY: "${a.term}" is ambiguous in this message — candidates: ` +
        a.candidates.map((c) => `(${c})`).join(" | ") +
        " — preserve the ambiguity; ask for clarification when it materially affects the answer.",
    );
  }
  if (context.domainCandidates.length) {
    lines.push(
      `DOMAIN CONTEXT (candidates, not asserted): ${context.domainCandidates.join(", ")}.`,
    );
  }
  if (context.constraints.length) {
    lines.push(
      `USER CONSTRAINTS (explicit markers): ${[...new Set(context.constraints.map((c) => c.text))].join(", ")} — honor them.`,
    );
  }

  const block = lines.length
    ? "ARCHIE Context & Inference Engine ground truth (facts are stored sourced knowledge; INFERENCE lines are derived conclusions — cite them as inferences, never as stored facts; USER-PREMISE lines are user-supplied and unverified; CONTRADICTION lines are flagged conflicts — never silently choose a side; UNCERTAINTY lines preserve unresolved ambiguity):\n" +
      lines.join("\n")
    : "";

  return {
    block,
    context,
    facts,
    inferences,
    contradictions,
    rejectedChains: rejected.slice(0, 12),
    carriedAmbiguities: ambiguous
      .map((a) => ({ term: a.term, candidates: a.candidates.slice(0, 3) }))
      .slice(0, 3),
    termsExamined: tokens.length,
    edgesExamined,
    extraHopsRetrieved,
    sourceLabel,
  };
}

export type { RetrievedEdge };
