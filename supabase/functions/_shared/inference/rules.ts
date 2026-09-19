// =========================================================
// ARCHIE CONTEXT & INFERENCE ENGINE — INFERENCE RULES
//
// Spec §§7–10, §15, §16, §19: controlled inference over
// established graph relationships. PURE functions over
// normalized retrieved edges — no DB access here, fully
// testable, fully deterministic.
//
// GUARDS EVERY RULE ENFORCES (spec §15):
//   * every premise edge must be VERIFIED (or carry its real
//     status into the conclusion honestly);
//   * a conclusion that already exists as a stored edge is
//     DEMOTED to a fact premise — never presented as an
//     inference, and never re-derived as new knowledge;
//   * causal chains only over actual CAUSES edges;
//   * premise-based rules mark the conclusion as depending
//     on USER_PROVIDED information (spec §14);
//   * hop counts are recorded so multi-hop results are never
//     presented as direct facts (spec §10).
// =========================================================

import type {
  ConfidenceState,
  Inference,
  InferenceRuleId,
  Premise,
  RetrievedEdge,
} from "./types.ts";

const VERIFIED = "VERIFIED";

/** Structural relations whose transitivity is meaning-preserving
 *  within two hops (spec §8). */
const TRANSITIVE_RULES: Array<{
  ruleId: InferenceRuleId;
  category: Inference["category"];
  relationType: string;
  verbPhrase: (a: string, c: string) => string;
  becausePhrase: (a: string, b: string, c: string) => string;
  confidence: ConfidenceState;
}> = [
  {
    ruleId: "TAXONOMIC_TRANSITIVE_2HOP",
    category: "TAXONOMIC",
    relationType: "IS_A",
    verbPhrase: (a, c) => `${a} is a kind of ${c}`,
    becausePhrase: (a, b, c) =>
      `${a} is documented as a kind of ${b}, and ${b} as a kind of ${c} (both stored VERIFIED relationships)`,
    confidence: "SUPPORTED",
  },
  {
    ruleId: "COMPOSITIONAL_TRANSITIVE_2HOP",
    category: "COMPOSITIONAL",
    relationType: "PART_OF",
    verbPhrase: (a, c) => `${a} is part of ${c}`,
    becausePhrase: (a, b, c) =>
      `${a} is documented as part of ${b}, and ${b} as part of ${c} (both stored VERIFIED relationships)`,
    confidence: "SUPPORTED",
  },
  {
    ruleId: "CAUSAL_TRANSITIVE_2HOP",
    category: "CAUSAL",
    relationType: "CAUSES",
    verbPhrase: (a, c) =>
      `${a} indirectly causes ${c} (through an intermediate cause)`,
    becausePhrase: (a, b, c) =>
      `${a} is sourced as causing ${b}, and ${b} as causing ${c} — an indirect causal chain, not a direct stored fact`,
    confidence: "PLAUSIBLE",
  },
];

export interface RuleOutcome {
  inferences: Inference[];
  /** Chains where a premise was missing or unverified —
   *  honestly reported as INSUFFICIENT_EVIDENCE, never
   *  silently promoted (spec §15). */
  rejected: Array<{ ruleId: InferenceRuleId; reason: string }>;
}

/**
 * Apply the full rule set to the retrieved edge set.
 * Premises (facts) are the caller's stored-edge premises,
 * keyed by edge identity so rules reference real premise ids
 * in their machine-readable traces (spec §16).
 */
export function applyInferenceRules(
  edges: RetrievedEdge[],
  factPremiseByEdge: (e: RetrievedEdge) => Premise | undefined,
  userPremises: Premise[],
  maxInferences = 8,
): RuleOutcome {
  const inferences: Inference[] = [];
  const rejected: RuleOutcome["rejected"] = [];

  // index edges by (source, type) for 2-hop chain search
  const bySourceType = new Map<string, RetrievedEdge[]>();
  for (const e of edges) {
    const k = `${e.sourceKey}|${e.relationType}`;
    const list = bySourceType.get(k);
    if (list) list.push(e);
    else bySourceType.set(k, [e]);
  }
  const storedTriples = new Set(
    edges.map((e) => `${e.sourceKey}|${e.relationType}|${e.targetKey}`),
  );

  const emit = (
    edge: RetrievedEdge,
    premise: Premise | undefined,
    fallbackKey: string,
  ): { id: string } => {
    if (premise) return premise;
    return {
      id: `${fallbackKey}:${edge.sourceKey}|${edge.relationType}|${edge.targetKey}`,
    };
  };

  // --- transitive 2-hop rules (taxonomic, compositional, causal)
  for (const rule of TRANSITIVE_RULES) {
    for (const e1 of edges) {
      if (e1.relationType !== rule.relationType) continue;
      if (inferences.length >= maxInferences) break;
      const hop2 =
        bySourceType.get(`${e1.targetKey}|${rule.relationType}`) ?? [];
      for (const e2 of hop2) {
        if (e2.targetKey === e1.sourceKey) continue; // no self-cycles promoted
        if (
          storedTriples.has(
            `${e1.sourceKey}|${rule.relationType}|${e2.targetKey}`,
          )
        ) {
          // the conclusion is already a DIRECT FACT — demote:
          // it must not appear as an inference (spec §10)
          rejected.push({
            ruleId: rule.ruleId,
            reason: `conclusion is already stored directly (${e1.sourceKey} ${rule.relationType} ${e2.targetKey}) — reported as fact, not inference`,
          });
          continue;
        }
        const unverified = [e1, e2].filter(
          (e) => e.knowledgeStatus !== VERIFIED,
        );
        if (unverified.length) {
          rejected.push({
            ruleId: rule.ruleId,
            reason:
              "premise edges are not all VERIFIED — no conclusion drawn (insufficient evidence)",
          });
          continue;
        }
        const p1 = emit(e1, factPremiseByEdge(e1), "edge");
        const p2 = emit(e2, factPremiseByEdge(e2), "edge");
        const a = e1.sourceName;
        const b = e1.targetName;
        const c = e2.targetName;
        inferences.push({
          id: `inference-${inferences.length}`,
          category: rule.category,
          ruleId: rule.ruleId,
          confidence: rule.confidence,
          premiseIds: [p1.id, p2.id],
          conclusion: {
            statement: rule.verbPhrase(a, c),
            subjectKey: e1.sourceKey,
            subjectName: a,
            relation: rule.relationType,
            objectKey: e2.targetKey,
            objectName: c,
            hops: 2,
            dependsOnUserPremise: false,
          },
          explanation: `This is an inference rather than a directly stored fact. It follows because ${rule.becausePhrase(a, b, c)}.`,
        });
      }
    }
  }

  // --- INHERITS_REQUIREMENT: A IS_A B ∧ B REQUIRES X ⇒ A requires X
  //  (property/functional inheritance — spec §7 example.
  //  PLAUSIBLE: inheritance is only justified where the
  //  relationship semantics carry it, and only when both
  //  premises are stored VERIFIED.)
  for (const e1 of edges) {
    if (e1.relationType !== "IS_A") continue;
    if (inferences.length >= maxInferences) break;
    const reqEdges = bySourceType.get(`${e1.targetKey}|REQUIRES`) ?? [];
    for (const e2 of reqEdges) {
      if (storedTriples.has(`${e1.sourceKey}|REQUIRES|${e2.targetKey}`)) {
        rejected.push({
          ruleId: "INHERITS_REQUIREMENT",
          reason:
            "inherited requirement is already stored directly — reported as fact, not inference",
        });
        continue;
      }
      if (e1.knowledgeStatus !== VERIFIED || e2.knowledgeStatus !== VERIFIED) {
        rejected.push({
          ruleId: "INHERITS_REQUIREMENT",
          reason: "premise edges are not all VERIFIED — no inheritance",
        });
        continue;
      }
      const p1 = emit(e1, factPremiseByEdge(e1), "edge");
      const p2 = emit(e2, factPremiseByEdge(e2), "edge");
      const a = e1.sourceName;
      const b = e1.targetName;
      const x = e2.targetName;
      inferences.push({
        id: `inference-${inferences.length}`,
        category: "PROPERTY",
        ruleId: "INHERITS_REQUIREMENT",
        confidence: "PLAUSIBLE",
        premiseIds: [p1.id, p2.id],
        conclusion: {
          statement: `${a} requires ${x} (inherited: ${a} is a kind of ${b}, and ${b} requires ${x})`,
          subjectKey: e1.sourceKey,
          subjectName: a,
          relation: "REQUIRES",
          objectKey: e2.targetKey,
          objectName: x,
          hops: 2,
          dependsOnUserPremise: false,
        },
        explanation: `This is an inference rather than a directly stored fact. It follows because ${a} is documented as a kind of ${b}, and ${b} is documented as requiring ${x}.`,
      });
    }
  }

  // --- REQUIRES_UNAVAILABLE: A REQUIRES B + user premise
  //  "B unavailable" ⇒ A cannot currently be completed using B
  //  (spec §7 second example — functional, premise-based; the
  //  conclusion is explicitly marked as depending on a
  //  USER_PROVIDED premise, never as verified knowledge.)
  for (const e of edges) {
    if (e.relationType !== "REQUIRES") continue;
    if (e.knowledgeStatus !== VERIFIED) continue;
    if (inferences.length >= maxInferences) break;
    const unavailability = (statement: string) =>
      /unavailable|not available|broken|is down|offline|can'?t access|does(n'?t| not) work/i.test(
        statement,
      );
    const matchedUserPremise = userPremises.find(
      (up) =>
        unavailability(up.statement) &&
        up.conceptKey !== undefined &&
        up.conceptKey === e.targetKey,
    );
    if (!matchedUserPremise) continue;
    const a = e.sourceName;
    const b = e.targetName;
    const p1 = emit(e, factPremiseByEdge(e), "edge");
    inferences.push({
      id: `inference-${inferences.length}`,
      category: "FUNCTIONAL",
      ruleId: "REQUIRES_UNAVAILABLE",
      confidence: "PLAUSIBLE",
      premiseIds: [p1.id, matchedUserPremise.id],
      conclusion: {
        statement: `${a} cannot currently be completed using ${b} (the user states ${b} is unavailable)`,
        subjectKey: e.sourceKey,
        subjectName: a,
        relation: "REQUIRES",
        objectKey: e.targetKey,
        objectName: b,
        hops: 1,
        dependsOnUserPremise: true,
      },
      explanation: `This is an inference that depends on user-provided information: ${a} is documented as requiring ${b} (stored VERIFIED relationship), and the user stated this turn that ${b} is unavailable. The unavailability itself is NOT verified knowledge.`,
    });
  }

  return { inferences: inferences.slice(0, maxInferences), rejected };
}
