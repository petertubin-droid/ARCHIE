// =========================================================
// ARCHIE CONTEXT & INFERENCE ENGINE — CONTRADICTION DETECTION
//
// Spec §11: identify conflicts between stored relationships,
// between a user statement and established information,
// between an inference and a stored fact, and between
// incompatible interpretations. NEVER auto-choose a side —
// flag with both sides' provenance and status.
//
// PURE functions over normalized edges, premises and
// inferences — deterministic, bounded, testable.
// =========================================================

import type {
  ContradictionRecord,
  Inference,
  Premise,
  RetrievedEdge,
} from "./types.ts";

const VERIFIED = "VERIFIED";

let recordSeq = 0;

function record(
  statement: string,
  sideA: ContradictionRecord["sideA"],
  sideB: ContradictionRecord["sideB"],
  explanation: string,
): ContradictionRecord {
  return {
    id: `contradiction-${recordSeq++}`,
    statement,
    sideA,
    sideB,
    disposition: "FLAGGED_NOT_RESOLVED",
    explanation,
  };
}

/**
 * Detect contradictions across the retrieved evidence set.
 * Only graph-checkable conflicts are reported — the engine
 * never fabricates a conflict from vibes (spec §15).
 *
 * `facts` are the stored-edge premises the inferences cite;
 * they let this layer map premise ids back to concept keys.
 */
export function detectContradictions(
  edges: RetrievedEdge[],
  facts: Premise[],
  inferences: Inference[],
  userPremises: Premise[],
  maxContradictions = 6,
): ContradictionRecord[] {
  const out: ContradictionRecord[] = [];
  recordSeq = 0;
  if (out.length >= maxContradictions) return out;

  const nameOf = new Map<string, string>();
  for (const e of edges) {
    nameOf.set(e.sourceKey, e.sourceName);
    nameOf.set(e.targetKey, e.targetName);
  }

  // --- (1) stored CONTRASTS_WITH between two concepts that
  //  both support the same inference chain (the chain's
  //  evidence undermines itself).
  const contrastPairs = new Set(
    edges
      .filter(
        (e) =>
          e.relationType === "CONTRASTS_WITH" && e.knowledgeStatus === VERIFIED,
      )
      .map((e) => `${e.sourceKey}|${e.targetKey}`),
  );
  const premiseKeyById = new Map(
    facts.map((f) => [f.id, f.conceptKey ?? ""] as const),
  );
  for (const inf of inferences) {
    if (out.length >= maxContradictions) break;
    const keys = new Set<string>([
      inf.conclusion.subjectKey,
      inf.conclusion.objectKey,
    ]);
    for (const pid of inf.premiseIds) {
      const k = premiseKeyById.get(pid);
      if (k) keys.add(k);
    }
    const keyList = [...keys];
    for (let i = 0; i < keyList.length; i++) {
      for (let j = i + 1; j < keyList.length; j++) {
        if (out.length >= maxContradictions) break;
        const [k1, k2] = [keyList[i], keyList[j]];
        if (
          contrastPairs.has(`${k1}|${k2}`) ||
          contrastPairs.has(`${k2}|${k1}`)
        ) {
          const n1 = nameOf.get(k1) ?? k1;
          const n2 = nameOf.get(k2) ?? k2;
          out.push(
            record(
              `inference "${inf.conclusion.statement}" draws on concepts the graph documents as contrasting`,
              {
                description: `inference premise chain uses both ${n1} and ${n2}`,
                status: "UNVERIFIED",
                provenance: "ARCHIE Context & Inference Engine (derived)",
              },
              {
                description: `${n1} CONTRASTS_WITH ${n2} (stored VERIFIED)`,
                status: "VERIFIED",
                provenance: "semantic graph (sourced relationship)",
              },
              "The supporting concepts are documented as contrasting — the inference is flagged, not resolved. Evaluate source quality before relying on it.",
            ),
          );
        }
      }
    }
  }

  // --- (2) an inference's conclusion contradicts a stored
  //  CONTRASTS_WITH fact (derived "A is a kind of C" while
  //  the graph stores A CONTRASTS_WITH C).
  for (const inf of inferences) {
    if (out.length >= maxContradictions) break;
    const k1 = inf.conclusion.subjectKey;
    const k2 = inf.conclusion.objectKey;
    if (contrastPairs.has(`${k1}|${k2}`) || contrastPairs.has(`${k2}|${k1}`)) {
      out.push(
        record(
          `derived conclusion "${inf.conclusion.statement}" conflicts with a stored contrasting relationship`,
          {
            description: inf.conclusion.statement,
            status: "UNVERIFIED",
            provenance: `ARCHIE Context & Inference Engine rule ${inf.ruleId} (derived)`,
          },
          {
            description: `${inf.conclusion.subjectName} CONTRASTS_WITH ${inf.conclusion.objectName} (stored VERIFIED)`,
            status: "VERIFIED",
            provenance: "semantic graph (sourced relationship)",
          },
          "A derived conclusion conflicts with stored verified knowledge — the stored fact wins pending evidence; the conflict is flagged for the owner.",
        ),
      );
    }
  }

  // --- (3) the user's current message carries conflicting
  //  availability statements about the same kind of target.
  //  (Availability itself is NOT stored in the graph, so the
  //  honest check is user-message-internal polarity conflict.)
  const unavailable = userPremises.filter((p) =>
    /unavailable|not available|broken|is down|offline|can'?t access|does(n'?t| not) work/i.test(
      p.statement,
    ),
  );
  const available = userPremises.filter((p) =>
    /is available|now works|is back|restored|is working/i.test(p.statement),
  );
  if (unavailable.length && available.length) {
    out.push(
      record(
        "the user's message contains both availability and unavailability statements",
        {
          description: available.map((p) => p.statement).join("; "),
          status: "USER_PROVIDED",
          provenance: "current user message",
        },
        {
          description: unavailable.map((p) => p.statement).join("; "),
          status: "USER_PROVIDED",
          provenance: "current user message",
        },
        "The user's own message carries conflicting availability statements — ask for clarification rather than choosing a side.",
      ),
    );
  }

  return out.slice(0, maxContradictions);
}
