// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — LIVE-TURN PIPELINE
//
// The live adapter for one ARCHIE chat turn (spec §§3, 20):
//
//   USER INPUT → CONTEXT ANALYSIS → LEXICON → CONCEPTS →
//   GRAPH RETRIEVAL → **EVIDENCE & TRUTH EVALUATION** →
//   CONTROLLED INFERENCE → REASONING → RESPONSE
//
// It consumes the REAL output of the existing layers — the
// Context & Inference Engine's premises (which trace back
// to real graph rows) and the executed tools' results (real
// database reads) — records/classifies the claims they
// establish, and returns:
//
//   * `block` — the ONLY model-facing part: concise FACT /
//     INFERENCE / ASSUMPTION / UNCERTAIN / CONFLICT labels
//     the reply must preserve (spec §25);
//   * a machine-readable trace for the audit ledger (never
//     user-facing chain-of-thought).
//
// Failure NEVER blocks the chat path: per-claim errors are
// recorded as honest degradation; the whole call degrades to
// the empty ground truth (the caller also catches).
//
// Bounded (spec §30): at most maxClaims premises, maxTools
// tool facts, maxEvidence evidence retrievals per claim.
// Deduplication is by deterministic keys — a repeat turn
// re-encounters the SAME claim records, it does not pile up
// duplicates.
// =========================================================

import type {
  ClaimDraft,
  EvidenceGroundTruth,
  EvidenceEvaluation,
} from "./types.ts";
import type { EvidenceTruthService } from "./service.ts";

// minimal structural type of an inference engine premise we
// consume ( Premise from ../inference/types.ts is used
// directly by archie-core; here we accept it structurally )
export interface EvidencePremiseInput {
  id: string;
  kind: string; // FACT | CONTEXT | INFERENCE | ASSUMPTION | UNCERTAINTY
  statement: string;
  source: string; // SEMANTIC_GRAPH | LEXICON | CONVERSATION | USER_PROVIDED
  conceptKey?: string;
  provenance?: string;
}

export interface EvidenceToolInput {
  tool: string;
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
}

export interface EvidenceTurnInput {
  message: string;
  /** Facts/context premises from the Context & Inference
   *  Engine (their source fields carry the lower layers). */
  premises: EvidencePremiseInput[];
  /** USER_PROVIDED premises detected in the message. */
  userPremises: EvidencePremiseInput[];
  /** Inferences the rule layer produced this turn. */
  inferences: Array<{
    id: string;
    ruleId: string;
    statement: string;
    explanation: string;
    premiseIds: string[];
    dependsOnUserPremise: boolean;
  }>;
  /** Tool results executed this turn (real DB reads). */
  toolResults: EvidenceToolInput[];
  domain?: string;
  now?: () => string;
}

export interface EvidencePipelineLimits {
  maxClaims?: number;
  maxToolFacts?: number;
  maxInferences?: number;
}

const DEFAULT_LIMITS: Required<EvidencePipelineLimits> = {
  maxClaims: 6,
  maxToolFacts: 4,
  maxInferences: 3,
};

const SOURCE_BY_PREMISE: Record<string, string> = {
  SEMANTIC_GRAPH: "graph relationships (semantic graph row)",
  LEXICON: "verified lexicon entry",
  CONVERSATION: "conversation context",
  USER_PROVIDED: "user-provided statement",
};

/**
 * The evidence pipeline for one live ARCHIE turn. Records
 * and classifies the claims the OTHER layers established,
 * records inferences with their premises, detects conflicts,
 * and returns the bounded evidence block + audit trace.
 */
export async function evidenceGroundTruth(
  service: EvidenceTruthService,
  input: EvidenceTurnInput,
  limits: EvidencePipelineLimits = {},
): Promise<EvidenceGroundTruth> {
  const maxClaims = limits.maxClaims ?? DEFAULT_LIMITS.maxClaims;
  const maxToolFacts = limits.maxToolFacts ?? DEFAULT_LIMITS.maxToolFacts;
  const maxInferences = limits.maxInferences ?? DEFAULT_LIMITS.maxInferences;

  const out: EvidenceGroundTruth = {
    block: "",
    claimsExamined: 0,
    claimsRecorded: 0,
    claimsClassified: 0,
    conflictsDetected: 0,
    evidenceAttached: 0,
    inferencesRecorded: 0,
    states: [],
    degraded: [],
  };

  const lines: string[] = [];
  const claimIdByKey = new Map<string, string>();
  const domain = input.domain?.slice(0, 120) || "general";

  // ---- (1) FACT / CONTEXT premises → claims + evidence.
  //  Premise sources point at REAL lower-layer rows; the
  //  evidence records reference them through provenance.
  for (const premise of input.premises.slice(0, maxClaims)) {
    out.claimsExamined += 1;
    try {
      const draft: ClaimDraft = {
        subject: premise.conceptKey ?? premise.statement.slice(0, 120),
        predicate: "RELATES_AS",
        objectValue: premise.statement.slice(0, 300),
        claimType: "STATEMENT",
        statement: premise.statement.slice(0, 2000),
        domain,
        subjectConceptKey: premise.conceptKey ?? null,
        directlyObserved:
          premise.source === "SEMANTIC_GRAPH" || premise.source === "LEXICON",
        sourceAvailability: "SOURCE_AVAILABLE",
        retrievedAt: new Date().toISOString(),
      };
      const res = await service.recordClaim(draft);
      if (!res.ok || !res.data) {
        out.degraded.push({
          claimKey: draft.subject,
          reason: res.error ?? "record failed",
        });
        continue;
      }
      claimIdByKey.set(premise.id, res.data.claim_key);
      out.claimsRecorded += 1;

      // VERIFIED-tier evidence attaches ONLY when the premise
      // actually resolved a lower-layer row (a concept key);
      // an ambiguous/unresolved premise gets honest
      // observation-tier evidence — never presented as
      // verified fact (spec §29 Test 11).
      const resolved = Boolean(premise.conceptKey) && premise.kind === "FACT";
      const attach = await service.attachEvidence(
        res.data.claim_key,
        {
          evidenceType: resolved
            ? premise.source === "SEMANTIC_GRAPH"
              ? "GRAPH_RELATIONSHIP"
              : premise.source === "LEXICON"
                ? "SEMANTIC_RELATIONSHIP"
                : "STRUCTURED_DATABASE"
            : "OBSERVED_APP_DATA",
          sourceType: resolved
            ? premise.source === "SEMANTIC_GRAPH"
              ? "SEMANTIC_GRAPH"
              : premise.source === "LEXICON"
                ? "LEXICON"
                : "APP_OBSERVATION"
            : "APP_OBSERVATION",
          sourceIdentity:
            premise.source === "SEMANTIC_GRAPH"
              ? "semantic_graph_edges"
              : premise.source === "LEXICON"
                ? "lexicon_senses"
                : "archie_conversation",
          sourceRef: premise.conceptKey
            ? { concept_key: premise.conceptKey }
            : { turn: "current" },
          originSubsystem: "ARCHIE Context & Inference Engine",
          observedBySystem: premise.source !== "CONVERSATION",
          contentLabel:
            (SOURCE_BY_PREMISE[premise.source] ?? premise.source) +
            ": " +
            premise.statement.slice(0, 200),
          provenanceChain: [
            {
              stage: "SOURCE",
              detail: `${SOURCE_BY_PREMISE[premise.source] ?? premise.source} — ${premise.provenance ?? "no lower-layer provenance string"}`,
              subsystem: premise.source,
              at: new Date().toISOString(),
            },
            {
              stage: "EXTRACTED_FACT",
              detail: premise.statement.slice(0, 300),
              subsystem: "ARCHIE Context & Inference Engine",
              at: new Date().toISOString(),
              transformation: "premise normalization",
            },
          ],
          transformation: "premise normalization",
          domain,
          retrievedAt: new Date().toISOString(),
        },
        "SUPPORTS",
      );
      if (attach.ok) out.evidenceAttached += 1;

      const cls = await service.classifyClaim(res.data.claim_key);
      if (cls.ok && cls.data) {
        out.claimsClassified += 1;
        out.states.push({
          claimKey: res.data.claim_key,
          state: cls.data.state,
        });
        lines.push(labelFor(cls.data, premise.statement));
      } else {
        out.degraded.push({
          claimKey: res.data.claim_key,
          reason: cls.error ?? "classify failed",
        });
      }
    } catch (e) {
      out.degraded.push({
        claimKey: premise.id,
        reason: String((e as Error).message ?? e),
      });
    }
  }

  // ---- (2) USER-PROVIDED premises → USER_PROVIDED claims.
  //  Recorded as context, NEVER verified (spec §15).
  for (const premise of input.userPremises.slice(0, maxClaims)) {
    out.claimsExamined += 1;
    try {
      const draft: ClaimDraft = {
        subject: premise.statement.slice(0, 120),
        predicate: "USER_STATED",
        objectValue: premise.statement.slice(0, 300),
        claimType: "STATEMENT",
        statement: premise.statement.slice(0, 2000),
        domain,
        userProvided: true,
        retrievedAt: new Date().toISOString(),
      };
      const res = await service.recordClaim(draft);
      if (!res.ok || !res.data) {
        out.degraded.push({
          claimKey: draft.subject,
          reason: res.error ?? "record failed",
        });
        continue;
      }
      claimIdByKey.set(premise.id, res.data.claim_key);
      out.claimsRecorded += 1;
      const attach = await service.attachEvidence(
        res.data.claim_key,
        {
          evidenceType: "USER_PROVIDED_EVIDENCE",
          sourceType: "USER_STATEMENT",
          sourceIdentity: "owner-conversation",
          originSubsystem: "ARCHIE Context & Inference Engine",
          contentLabel: `user statement: ${premise.statement.slice(0, 200)}`,
          retrievedAt: new Date().toISOString(),
          domain,
        },
        "SUPPORTS",
      );
      if (attach.ok) out.evidenceAttached += 1;
      const cls = await service.classifyClaim(res.data.claim_key);
      if (cls.ok && cls.data) {
        out.claimsClassified += 1;
        out.states.push({
          claimKey: res.data.claim_key,
          state: cls.data.state,
        });
        lines.push(labelFor(cls.data, premise.statement));
      }
    } catch (e) {
      out.degraded.push({
        claimKey: premise.id,
        reason: String((e as Error).message ?? e),
      });
    }
  }

  // ---- (3) INFERENCES → recorded with their premises (the
  //  conclusion stays INFERRED unless independently
  //  established — spec §16).
  for (const inf of input.inferences.slice(0, maxInferences)) {
    try {
      const premiseKeys = inf.premiseIds
        .map((pid) => claimIdByKey.get(pid))
        .filter((k): k is string => Boolean(k));
      const res = await service.recordInference({
        conclusion: {
          subject: inf.statement.slice(0, 120),
          predicate: "DERIVED",
          objectValue: inf.statement.slice(0, 300),
          claimType: "STATEMENT",
          statement: inf.statement.slice(0, 2000),
          domain,
        },
        premiseClaimKeys: premiseKeys,
        ruleId: inf.ruleId,
        explanation: inf.explanation,
      });
      if (res.ok && res.data) {
        out.inferencesRecorded += 1;
        const cls = await service.classifyClaim(res.data.claim_key);
        if (cls.ok && cls.data) {
          out.claimsClassified += 1;
          out.states.push({
            claimKey: res.data.claim_key,
            state: cls.data.state,
          });
          lines.push(
            `INFERENCE (rule ${inf.ruleId}${inf.dependsOnUserPremise ? ", depends on user-provided premise" : ""}): ${inf.statement} — derived from recorded premises; distinguishable from fact.`,
          );
        }
      }
    } catch (e) {
      out.degraded.push({
        claimKey: inf.id,
        reason: String((e as Error).message ?? e),
      });
    }
  }

  // ---- (4) TOOL FACTS → observed application data claims.
  //  Tool results are REAL database reads (system_status,
  //  knowledge_search, frelux_data…) — their evidence is
  //  OBSERVED_APP_DATA with the tool identity.
  for (const tool of input.toolResults
    .filter((t) => t.ok)
    .slice(0, maxToolFacts)) {
    try {
      const digest = JSON.stringify(tool.data ?? {}).slice(0, 400);
      const draft: ClaimDraft = {
        subject: `tool:${tool.tool}`,
        predicate: "OBSERVED_STATE",
        objectValue: digest || tool.summary.slice(0, 200),
        claimType: "STATEMENT",
        statement:
          `Observed application state from ${tool.tool}: ${tool.summary}`.slice(
            0,
            2000,
          ),
        domain,
        directlyObserved: true,
        retrievedAt: new Date().toISOString(),
      };
      const res = await service.recordClaim(draft);
      if (!res.ok || !res.data) continue;
      out.claimsRecorded += 1;
      const attach = await service.attachEvidence(
        res.data.claim_key,
        {
          evidenceType: "OBSERVED_APP_DATA",
          sourceType: "APP_OBSERVATION",
          sourceIdentity: `archie-tool:${tool.tool}`,
          sourceRef: { tool: tool.tool, turn: "current" },
          originSubsystem: "ARCHIE tool execution",
          observedBySystem: true,
          contentLabel:
            `direct tool observation (${tool.tool}): ${tool.summary}`.slice(
              0,
              400,
            ),
          contentDigest: digest,
          retrievedAt: new Date().toISOString(),
          domain,
        },
        "SUPPORTS",
      );
      if (attach.ok) out.evidenceAttached += 1;
      const cls = await service.classifyClaim(res.data.claim_key);
      if (cls.ok && cls.data) {
        out.claimsClassified += 1;
        out.states.push({
          claimKey: res.data.claim_key,
          state: cls.data.state,
        });
      }
    } catch (e) {
      out.degraded.push({
        claimKey: `tool:${tool.tool}`,
        reason: String((e as Error).message ?? e),
      });
    }
  }

  // ---- (5) conflict detection across THIS turn's claims
  //  (classifyClaim already scans stored claims for value
  //  conflicts; surface the count honestly).
  out.conflictsDetected = out.states.filter(
    (s) => s.state === "CONFLICTED",
  ).length;

  out.block = buildBlock(lines, out);
  return out;
}

function labelFor(evaluation: EvidenceEvaluation, statement: string): string {
  const short =
    statement.length > 140 ? statement.slice(0, 137) + "…" : statement;
  switch (evaluation.state) {
    case "VERIFIED":
      return `FACT (verified): ${short}`;
    case "SUPPORTED":
      return `FACT (supported by ${evaluation.independentCorroboration} independent source(s)): ${short}`;
    case "USER_PROVIDED":
      return `USER-PROVIDED (context, not independently verified): ${short}`;
    case "INFERRED":
      return `INFERENCE (derived): ${short}`;
    case "CONFLICTED":
      return `CONFLICTED (sources disagree — present the disagreement, do not silently pick a side): ${short}`;
    case "OUTDATED":
      return `OUTDATED (may have been correct previously; not safely current): ${short}`;
    case "UNKNOWN":
      return `UNKNOWN (no stored evidence — say so; never invent an answer): ${short}`;
    default:
      return `UNVERIFIED (insufficient evidence — do not present as established): ${short}`;
  }
}

function buildBlock(lines: string[], out: EvidenceGroundTruth): string {
  if (!lines.length && out.degraded.length === 0) return "";
  const header = [
    "EVIDENCE & TRUTH EVALUATION (ARCHIE Evidence & Truth Engine):",
    "Preserve these evidence labels in the reply: FACT (supported/verified), INFERENCE (derived), USER-PROVIDED (context), CONFLICTED (sources disagree — say which), UNKNOWN/UNVERIFIED (say so honestly).",
    "Never claim something is verified, official, or 'according to a source' unless a FACT line above states it. Never present an inference or user statement as established fact.",
  ].join("\n");
  const body = lines.slice(0, 12).join("\n");
  const tail =
    out.degraded.length > 0
      ? `\n(${out.degraded.length} claim(s) could not be evaluated this turn — treat any related statement as UNVERIFIED.)`
      : "";
  return `${header}\n${body}${tail}`;
}

// Convenience re-export so archie-core can import one module.
export { createEvidenceTruthService } from "./service.ts";
export type { EvidenceTruthService } from "./types.ts";
