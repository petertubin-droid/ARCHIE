// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — CONSTRAINT ANALYZER
// supabase/functions/_shared/archie-ai/semantic-engine/constraint-analyzer.ts
//
// Extracts exclusions ("not", "except"), bounds ("at least", "at most"),
// conditions ("only if", "unless"), and sequence requirements.
// =========================================================

import type { SemanticConstraint } from "./types.ts";

export function analyzeConstraints(text: string): SemanticConstraint[] {
  const constraints: SemanticConstraint[] = [];

  // 1. Minimum bounds: e.g. "at least 3 coats", "minimum of 25 MPa", "not less than 10m"
  const minPattern = /\b(?:at\s+least|minimum(?:\s+of)?|not\s+less\s+than|no\s+fewer\s+than)\s+(\d+(?:\.\d+)?)\s*([a-z%]+)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = minPattern.exec(text)) !== null) {
    constraints.push({
      type: "MINIMUM_BOUND",
      operator: "AT_LEAST",
      targetValue: parseFloat(match[1]),
      unit: match[2]?.trim(),
      rawExpression: match[0],
      polarity: "AFFIRMATIVE",
    });
  }

  // 2. Maximum bounds: e.g. "at most 10% waste", "maximum 50 bags", "not exceeding 200m"
  const maxPattern = /\b(?:at\s+most|maximum(?:\s+of)?|not\s+exceeding|no\s+more\s+than|capped\s+at)\s+(\d+(?:\.\d+)?)\s*([a-z%]+)?\b/gi;
  while ((match = maxPattern.exec(text)) !== null) {
    constraints.push({
      type: "MAXIMUM_BOUND",
      operator: "AT_MOST",
      targetValue: parseFloat(match[1]),
      unit: match[2]?.trim(),
      rawExpression: match[0],
      polarity: "AFFIRMATIVE",
    });
  }

  // 3. Exclusions / Negations: e.g. "do not include plaster", "without doors", "except the ceiling"
  const exclusionPattern = /\b(?:do\s+not\s+include|without|exclude|except|excluding)\s+(?:the\s+)?([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/gi;
  while ((match = exclusionPattern.exec(text)) !== null) {
    constraints.push({
      type: "EXCLUSION",
      operator: "EXCEPT",
      targetValue: match[1].trim(),
      rawExpression: match[0],
      polarity: "NEGATIVE",
    });
  }

  // 4. Conditions: e.g. "only if budget allows", "unless specified by engineer"
  const conditionPattern = /\b(only\s+if|unless|provided\s+that|if\s+and\s+only\s+if)\s+([^,.]+)/gi;
  while ((match = conditionPattern.exec(text)) !== null) {
    constraints.push({
      type: "CONDITION",
      operator: match[1].toLowerCase().includes("unless") ? "UNLESS" : "ONLY_IF",
      targetValue: match[2].trim(),
      rawExpression: match[0],
      polarity: "CONDITIONAL",
    });
  }

  return constraints;
}
