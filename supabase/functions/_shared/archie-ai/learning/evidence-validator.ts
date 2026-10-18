// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — EVIDENCE VALIDATOR
// supabase/functions/_shared/archie-ai/learning/evidence-validator.ts
//
// Implements evidence evaluation, independent corroboration
// verification, anti-repetition protection (audit H2),
// acknowledgement vs verification separation (audit H1),
// and strict evidence state transitions (spec §5).
// =========================================================

import type {
  EvidenceState,
  ExtractedKnowledgeItem,
  LearningSource,
} from "./types.ts";

export interface ValidationEvaluationResult {
  evidenceState: EvidenceState;
  calibratedConfidence: number;
  confidenceBasis: string;
  isPromotableToVerified: boolean;
  warnings: string[];
}

const BASE_SOURCE_CONFIDENCE: Record<LearningSource, number> = {
  USER: 0.85,
  OUTCOME: 0.80,
  SYSTEM: 0.75,
  DOCUMENT: 0.70,
  ARCHIE: 0.65,
  TOOL_RESULT: 0.65,
  WEB: 0.55,
  OPENAI: 0.50,
  GEMINI: 0.50,
};

/**
 * Validates candidate evidence, assesses corroboration vs repetition,
 * checks for conflicts, and computes calibrated confidence.
 */
export function validateEvidence(
  item: {
    source: LearningSource;
    sourceReference?: string;
    corroboratingSources?: string[];
    contradictingSources?: string[];
    confidence?: number;
    evidenceState?: EvidenceState;
    temporal?: { isStale?: boolean };
  },
): ValidationEvaluationResult {
  const warnings: string[] = [];

  // 1. Initial baseline from source
  let baseConf = BASE_SOURCE_CONFIDENCE[item.source] ?? 0.50;
  if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) {
    // Blend reported confidence with verified source prior
    baseConf = Math.min(1, Math.max(0, 0.5 * baseConf + 0.5 * item.confidence));
  }

  // 2. Corroboration ledger analysis (Anti-Repetition H2 Enforcement)
  // Deduplicate sources to prevent same-source repetition from masquerading as multiple corroborations
  const uniqueCorroborators = new Set<string>();
  if (item.sourceReference) {
    uniqueCorroborators.add(item.sourceReference.trim().toLowerCase());
  }
  for (const src of item.corroboratingSources ?? []) {
    const norm = src.trim().toLowerCase();
    if (norm) uniqueCorroborators.add(norm);
  }

  // Same-source count vs distinct source count
  const distinctSourcesCount = uniqueCorroborators.size;
  const rawCorroborationCount = (item.corroboratingSources ?? []).length + (item.sourceReference ? 1 : 0);

  if (rawCorroborationCount > 1 && distinctSourcesCount <= 1) {
    warnings.push("Audit H2: Repeated assertions from the same source do not constitute independent corroboration.");
  }

  // Corroboration bonus: only from distinct independent sources
  const independentBonus = Math.max(0, distinctSourcesCount - 1) * 0.08;
  let calibratedConfidence = Math.min(0.98, baseConf + independentBonus);

  // 3. Contradiction analysis
  const uniqueContradictions = new Set(
    (item.contradictingSources ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  if (uniqueContradictions.size > 0) {
    calibratedConfidence = Math.max(0.1, calibratedConfidence - uniqueContradictions.size * 0.25);
    warnings.push(`Contradicted by ${uniqueContradictions.size} independent source(s).`);
  }

  // 4. Stale penalty
  if (item.temporal?.isStale) {
    calibratedConfidence = Math.max(0.1, calibratedConfidence * 0.6);
    warnings.push("Knowledge item is marked stale.");
  }

  // 5. Evidence State Determination
  let evidenceState: EvidenceState = item.evidenceState ?? "UNREVIEWED";

  if (uniqueContradictions.size > 0 && uniqueContradictions.size >= distinctSourcesCount) {
    evidenceState = "CONTRADICTED";
  } else if (item.temporal?.isStale) {
    evidenceState = "OUTDATED";
  } else if (calibratedConfidence < 0.40) {
    evidenceState = "UNCERTAIN";
  } else if (
    (item.source === "USER" && distinctSourcesCount >= 1) ||
    (distinctSourcesCount >= 2 && calibratedConfidence >= 0.70)
  ) {
    // Requires either explicit Owner origin or at least 2 distinct independent sources
    evidenceState = "VERIFIED";
  } else if (calibratedConfidence >= 0.50) {
    evidenceState = "SUPPORTED";
  } else {
    evidenceState = "UNREVIEWED";
  }

  const isPromotableToVerified = evidenceState === "VERIFIED" && calibratedConfidence >= 0.70;

  const confidenceBasis = `Source: ${item.source} (${distinctSourcesCount} distinct corroborator(s), ${uniqueContradictions.size} contradiction(s)). ${warnings.join(" ")}`.trim();

  return {
    evidenceState,
    calibratedConfidence,
    confidenceBasis,
    isPromotableToVerified,
    warnings,
  };
}
