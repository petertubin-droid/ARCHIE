// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — ENGINE
// supabase/functions/_shared/archie-ai/semantic-engine/engine.ts
//
// Top-level deterministic pipeline: language → context → intent →
// entities → references → constraints → ambiguity → routing.
// This engine is a structured supplement to ARCHIE's native NLU,
// never an authorization source or replacement for deterministic
// task engines.
// =========================================================

import type {
  SemanticInterpretation,
  ConversationHistoryTurn,
  SemanticRelationship,
} from "./types.ts";
import { detectLanguage } from "./language-detector.ts";
import { resolveContextualMeanings } from "./contextual-resolver.ts";
import { classifyIntent } from "./intent-classifier.ts";
import { extractEntities } from "./entity-extractor.ts";
import { resolveReferences } from "./reference-resolver.ts";
import { analyzeConstraints } from "./constraint-analyzer.ts";
import { analyzeTemporal } from "./temporal-analyzer.ts";
import { detectAmbiguities } from "./ambiguity-detector.ts";
import { assessSecurityBoundary } from "./security-boundary.ts";
import { bridgeFreluxCalculation } from "./frelux-bridge.ts";

export interface SemanticEngineOptions {
  historyTurns?: ConversationHistoryTurn[];
  /** Informational context only. Does NOT grant any permissions. */
  ownerAuthorized?: boolean;
  /** Max input characters to bound deterministic processing. */
  maxInputLength?: number;
}

export function understandSemantics(
  input: string,
  options: SemanticEngineOptions = {},
): SemanticInterpretation {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const maxLength = Math.max(100, Math.min(options.maxInputLength ?? 10_000, 50_000));
  const originalInput = typeof input === "string" ? input : "";
  const boundedInput = originalInput.slice(0, maxLength);
  const text = boundedInput.trim();
  const history = options.historyTurns || [];

  // Language detection (only detection; does not translate)
  const detectedLanguage = detectLanguage(text);

  // Contextual resolution (polysemy, abbreviations, regional terms)
  const contextual = resolveContextualMeanings(text);

  // Security boundary classification
  const security = assessSecurityBoundary(text, { ownerAuthorized: options.ownerAuthorized });

  // Intent classification
  const intent = classifyIntent(text, security.actionType);

  // Entity extraction
  const entities = extractEntities(text);

  // Reference resolution against recent conversation history
  const references = resolveReferences(text, history);

  // Constraints, temporal context, and ambiguities
  const constraints = analyzeConstraints(text);
  const temporal = analyzeTemporal(text);
  const ambiguityResult = detectAmbiguities(text, entities, contextual.ambiguities);

  // Bridge to FRELUX deterministic engines (never calculate here)
  const downstreamRecommendation = bridgeFreluxCalculation(text, entities);

  // Relationships (simple extraction from entity roles)
  const relationships: SemanticRelationship[] = [];
  const materials = entities.filter((e) => e.category === "MATERIAL");
  const dims = entities.filter((e) => e.category === "DIMENSION");
  for (const mat of materials) {
    for (const dim of dims) {
      relationships.push({
        sourceEntityText: mat.rawText,
        targetEntityText: dim.rawText,
        relationshipType: "CONSTRAINED_BY",
        confidence: 0.75,
      });
    }
  }

  // Required information for FRELUX task
  const missingInformation = {
    requiredParameters: downstreamRecommendation.missingParameters,
    taskTarget: downstreamRecommendation.targetEngineId,
    explanation: downstreamRecommendation.missingParameters.length > 0
      ? `The ${downstreamRecommendation.targetEngineId} calculation requires: ${downstreamRecommendation.missingParameters.join(", ")}. ARCHIE will not invent these parameters.`
      : undefined,
  };

  // Override routing for security risk — never let semantic inference authorize actions
  if (security.isInjectionAttempt) {
    downstreamRecommendation.recommendedModule = "SECURITY_STOP";
  } else if (ambiguityResult.ambiguities.some((a) => a.impactsCorrectness)) {
    downstreamRecommendation.recommendedModule = "CLARIFICATION_PROMPT";
  }

  // Confidence: deterministic heuristic only. Not empirically calibrated.
  const intentConfidence = intent.confidence;
  const entityConfidence = entities.length > 0
    ? entities.reduce((s, e) => s + e.confidence, 0) / entities.length
    : 0.70;
  const referenceConfidence = references.length > 0
    ? references.reduce((s, r) => s + r.resolutionConfidence, 0) / references.length
    : 0.90;
  const overallConfidence = Math.max(0.30, Math.min(0.95, (intentConfidence + entityConfidence + referenceConfidence + ambiguityResult.overallConfidence) / 4));

  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    originalInput,
    normalizedInput: text,
    detectedLanguage,
    intent,
    security,
    confidence: {
      overall: Number(overallConfidence.toFixed(2)),
      intentConfidence,
      entityConfidence: Number(entityConfidence.toFixed(2)),
      referenceConfidence: Number(referenceConfidence.toFixed(2)),
      isCalibrated: false,
    },
    entities,
    references,
    relationships,
    constraints,
    temporal,
    ambiguities: ambiguityResult.ambiguities,
    missingInformation,
    downstreamRecommendation,
    evidence: {
      lexiconMatches: contextual.resolvedWords.map((r) => r.selectedSenseId),
      knowledgeGraphLinks: entities.filter((e) => e.knowledgeGraphEntityId).map((e) => e.knowledgeGraphEntityId!),
      contextTraces: [
        ...contextual.expandedTerms.map((t) => `${t.original} -> ${t.expanded} (${t.domain})`),
        ...references.filter((r) => r.status === "RESOLVED").map((r) => `${r.rawExpression} -> ${r.resolvedObjectId || r.resolvedValue}`),
      ],
    },
    processingDurationMs: Number((ended - started).toFixed(3)),
  };
}
