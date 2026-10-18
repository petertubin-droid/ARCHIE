// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — AMBIGUITY DETECTOR
// supabase/functions/_shared/archie-ai/semantic-engine/ambiguity-detector.ts
//
// Detects missing units, underspecified parameters, polysemy,
// and scoping ambiguities. Prompts for clarification when
// ambiguity materially impacts accuracy.
// =========================================================

import type { SemanticAmbiguity, SemanticEntity } from "./types.ts";

export function detectAmbiguities(
  text: string,
  entities: SemanticEntity[],
  existingAmbiguities: SemanticAmbiguity[] = []
): {
  ambiguities: SemanticAmbiguity[];
  overallConfidence: number;
} {
  const ambiguities: SemanticAmbiguity[] = [...existingAmbiguities];

  // 1. Unit absence on naked numbers with construction nouns
  // e.g. "room measuring 12 by 10 with 8 height"
  const nakedNumberPattern = /\b(\d+)\s*(?:by|x|×)\s*(\d+)\b(?!\s*(?:feet|foot|ft|m|meters?|inches?|in|mm|cm))/gi;
  let match: RegExpExecArray | null;

  while ((match = nakedNumberPattern.exec(text)) !== null) {
    ambiguities.push({
      type: "UNIT_ABSENCE",
      ambiguousPhrase: match[0],
      candidateInterpretations: [
        { interpretation: `${match[1]} ft by ${match[2]} ft (Imperial feet)`, confidence: 0.50, implication: "Calculates in square feet" },
        { interpretation: `${match[1]} m by ${match[2]} m (Metric meters)`, confidence: 0.50, implication: "Calculates in square meters (10x larger area)" },
      ],
      clarificationQuestion: `Are the dimensions '${match[0]}' in meters (m) or feet (ft)?`,
      impactsCorrectness: true,
    });
  }

  // 2. Scoping ambiguity: "sand and gravel for the foundation and column"
  // Is sand for both, or foundation only?
  const scopePattern = /\b(paint|plaster|screed|tiles?)\s+(?:for|on)\s+(?:the\s+)?([a-z]+)\s+and\s+([a-z]+)\b/i;
  const scopeMatch = scopePattern.exec(text);
  if (scopeMatch) {
    ambiguities.push({
      type: "SCOPING_AMBIGUITY",
      ambiguousPhrase: scopeMatch[0],
      candidateInterpretations: [
        { interpretation: `Apply ${scopeMatch[1]} to both ${scopeMatch[2]} and ${scopeMatch[3]}`, confidence: 0.60, implication: "Aggregates surface area of both" },
        { interpretation: `Apply ${scopeMatch[1]} only to ${scopeMatch[2]}`, confidence: 0.40, implication: "Restricts to primary element" },
      ],
      clarificationQuestion: `Should ${scopeMatch[1]} be applied to both the ${scopeMatch[2]} and the ${scopeMatch[3]}, or only the ${scopeMatch[2]}?`,
      impactsCorrectness: true,
    });
  }

  // 3. Estimate overall confidence
  let confidence = 0.95;
  for (const amb of ambiguities) {
    if (amb.impactsCorrectness) {
      confidence -= 0.15;
    }
  }

  return {
    ambiguities,
    overallConfidence: Math.max(0.40, Number(confidence.toFixed(2))),
  };
}
