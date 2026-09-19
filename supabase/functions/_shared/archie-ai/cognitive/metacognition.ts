// =========================================================
// ARCHIE COGNITIVE ENGINE — META-COGNITION
// supabase/functions/_shared/archie-ai/cognitive/metacognition.ts
//
// ARCHIE evaluating its own reasoning, honestly:
//   What do I know? What don't I know? What evidence supports
//   this? Could I be wrong? What must I verify? What approach
//   is most reliable?
// Every assessment is derived from the real knowledge store —
// never invented.
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import {
  EPISTEMIC_ORDER,
  type EpistemicStatus,
  type MetaAssessment,
} from "./types.ts";

/** Confidence below this means "could be wrong" is mandatory. */
const LOW_CONFIDENCE = 0.6;

/** Classify a fact into the epistemic taxonomy. Honest,
 *  derived mapping — not a guess. */
export function epistemicStatusOf(fact: Fact): EpistemicStatus {
  if (fact.provenance.source === "inferred") return "INFERRED";
  if (
    fact.status === "validated" &&
    fact.validatedCount >= 2 &&
    fact.provenance.source !== "web-research"
  ) {
    return "VERIFIED";
  }
  if (fact.status === "validated" && fact.confidence >= 0.7) {
    return "KNOWN";
  }
  if (fact.status === "candidate" || fact.confidence < 0.5) {
    return "ASSUMED";
  }
  return "KNOWN";
}

/** Weakest status across a set of cited facts. */
export function weakestStatus(facts: Fact[]): EpistemicStatus {
  if (facts.length === 0) return "UNKNOWN";
  return facts.reduce(
    (weakest, f) =>
      EPISTEMIC_ORDER[epistemicStatusOf(f)] < EPISTEMIC_ORDER[weakest]
        ? epistemicStatusOf(f)
        : weakest,
    "VERIFIED" as EpistemicStatus,
  );
}

/** Reliability ranking of approaches. Deterministic evidence
 *  tools outrank stored knowledge, which outranks inference. */
const APPROACH_RANKING: Array<{
  approach: string;
  rationale: string;
  applies: (ctx: {
    deterministicAvailable: boolean;
    factCount: number;
    multiSource: boolean;
  }) => boolean;
}> = [
  {
    approach: "deterministic in-engine computation",
    rationale:
      "exact arithmetic and static analysis re-executed and verified — no interpretation involved",
    applies: (ctx) => ctx.deterministicAvailable,
  },
  {
    approach: "multi-source validated knowledge",
    rationale:
      "independently cross-validated facts agree — strongest stored knowledge",
    applies: (ctx) => ctx.multiSource,
  },
  {
    approach: "single-source validated knowledge",
    rationale: "validated from one trusted provenance (owner-taught or seeded)",
    applies: (ctx) => ctx.factCount > 0,
  },
  {
    approach: "explicit inference with stated confidence",
    rationale:
      "derived by forward-chaining rules over premises — confidence propagates honestly",
    applies: () => true,
  },
];

export class MetaCognitionEngine {
  private assessments = 0;
  private unknownsDeclared = 0;

  /** Full meta-assessment for a task, from real store state. */
  assess(input: {
    task: string;
    matchedFacts: Fact[];
    unmatchedAspects: string[];
    deterministicAvailable: boolean;
    verificationAvailable: boolean;
  }): MetaAssessment {
    this.assessments += 1;
    const whatIKnow: string[] = [];
    const supportingEvidence: MetaAssessment["supportingEvidence"] = [];
    const couldBeWrong: MetaAssessment["couldBeWrong"] = [];
    const mustVerify: string[] = [];

    for (const fact of input.matchedFacts) {
      const status = epistemicStatusOf(fact);
      whatIKnow.push(
        `${fact.subject} ${fact.predicate.replace(/-/g, " ")} → ${String(fact.object)} [${status}, confidence ${(fact.confidence * 100).toFixed(0)}%]`,
      );
      supportingEvidence.push({
        claim: `${fact.subject} ${fact.predicate}: ${String(fact.object).slice(0, 60)}`,
        factId: fact.id,
      });
      if (status === "ASSUMED" || fact.confidence < LOW_CONFIDENCE) {
        couldBeWrong.push({
          risk: `"${fact.subject} ${fact.predicate}" rests on a ${status.toLowerCase()} claim at ${(fact.confidence * 100).toFixed(0)}% confidence`,
          mitigation:
            "confirm with the owner or an independent source before relying on it",
        });
        mustVerify.push(
          `confirm "${fact.subject} ${fact.predicate}" — currently ${status}`,
        );
      }
    }

    if (input.matchedFacts.length > 0 && input.verificationAvailable) {
      mustVerify.push(
        "response integrity: cited facts must exist in the store and be represented accurately",
      );
    }

    const whatIDontKnow = input.unmatchedAspects.slice(0, 4);
    if (whatIDontKnow.length > 0) {
      this.unknownsDeclared += 1;
      mustVerify.push(
        "do not fabricate: unmatched aspects are declared, not filled in",
      );
    }

    const multiSource = input.matchedFacts.some((f) => f.validatedCount >= 2);
    const ranked = APPROACH_RANKING.find((a) =>
      a.applies({
        deterministicAvailable: input.deterministicAvailable,
        factCount: input.matchedFacts.length,
        multiSource,
      }),
    );

    return {
      whatIKnow,
      whatIDontKnow,
      supportingEvidence,
      couldBeWrong,
      mustVerify,
      mostReliableApproach: {
        approach:
          ranked?.approach ?? "explicit inference with stated confidence",
        rationale: ranked?.rationale ?? "",
      },
    };
  }

  /** The explicit knowledge-gap answer for "what don't I know". */
  gapReport(task: string, matched: Fact[], storeSize: number): string {
    this.assessments += 1;
    if (matched.length === 0) {
      this.unknownsDeclared += 1;
      return (
        `No knowledge in my store of ${storeSize} facts matched "${task}". ` +
        "This is an honest UNKNOWN — I will not fabricate an answer."
      );
    }
    const weakest = weakestStatus(matched);
    return (
      `I have ${matched.length} relevant fact(s) for "${task}"; weakest epistemic status: ${weakest}. ` +
      (weakest === "ASSUMED" || weakest === "UNKNOWN"
        ? "Treat the answer as provisional."
        : "Aspects not covered by those facts remain UNKNOWN to me.")
    );
  }

  stats(): { assessments: number; unknownsDeclared: number } {
    return {
      assessments: this.assessments,
      unknownsDeclared: this.unknownsDeclared,
    };
  }
}
