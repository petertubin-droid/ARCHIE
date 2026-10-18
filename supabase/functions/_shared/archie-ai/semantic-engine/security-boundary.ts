// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — SECURITY BOUNDARY
// supabase/functions/_shared/archie-ai/semantic-engine/security-boundary.ts
//
// Identifies prompt injections, instruction diversions, and
// checks authorization risk. The semantic engine never grants
// privileges to itself or callers.
// =========================================================

import type { SecurityClassification } from "./types.ts";

const INJECTION_PATTERNS: Array<{ pattern: RegExp; name: string; weight: number }> = [
  { pattern: /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i, name: "IGNORE_PREVIOUS_INSTRUCTIONS", weight: 0.95 },
  { pattern: /\byou\s+are\s+(?:now\s+)?(?:a|an|in\s+)?(DAN|unrestricted|jailbroken|god\s+mode|system)\b|\bDAN\s+mode\b/i, name: "ROLEPLAY_JAILBREAK", weight: 0.95 },
  { pattern: /\b(system\s+prompt|developer\s+mode|hidden\s+instructions?)\s*:\s*/i, name: "PROMPT_LEAK_ATTEMPT", weight: 0.90 },
  { pattern: /\b(disregard|forget|override)\s+(the\s+)?(rules|safety|guidelines|guardrails)\b/i, name: "SAFETY_DISREGARD", weight: 0.92 },
  { pattern: /\b(execute|run)\s+(arbitrary|raw|admin)\s+(sql|code|command|shell)\b/i, name: "ARBITRARY_EXECUTION_ATTEMPT", weight: 0.88 },
  { pattern: /<\s*script\b[^>]*>|<\/\s*script\b/i, name: "HTML_INJECTION_SCRIPT", weight: 0.90 },
  { pattern: /\{\{.*\}\}|\$\{.*\}/i, name: "TEMPLATE_INTERPOLATION_ATTEMPT", weight: 0.60 },
  { pattern: /\b(drop\s+table|delete\s+from\s+users|truncate\s+table)\b/i, name: "DESTRUCTIVE_SQL_INJECTION", weight: 0.95 },
];

const PRIVILEGED_ACTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(deploy|publish|release)\b.+?\b(production|main|live)\b/i, name: "DEPLOY_OPERATION" },
  { pattern: /\b(migrate|apply\s+migration|alter\s+schema)\b/i, name: "MIGRATION_OPERATION" },
  { pattern: /\b(rotate|change|revoke|generate)\s+(secret|key|api\s*key|token|credential)\b/i, name: "CREDENTIAL_OPERATION" },
  { pattern: /\b(transfer|pay|payout|withdraw|charge|bill)\s+(money|funds|naira|usd|balance)\b/i, name: "FINANCIAL_EXECUTION" },
  { pattern: /\b(grant|revoke|elevate)\s+(permission|role|access|admin|owner)\b/i, name: "RBAC_OPERATION" },
];

const MUTATING_ACTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(save|create|insert|update|delete|modify|edit|overwrite|add|drop|remove)\b.+?\b(project|room|material|estimate|takeoff|boq|item|budget|table)\b/i, name: "DATA_MUTATION" },
  { pattern: /\b(clear|reset|wipe)\s+(history|memory|cache)\b/i, name: "CACHE_MUTATION" },
];

export function assessSecurityBoundary(
  input: string,
  options?: { ownerAuthorized?: boolean }
): SecurityClassification {
  const flaggedPatterns: string[] = [];
  let maxWeight = 0;

  for (const { pattern, name, weight } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      flaggedPatterns.push(name);
      if (weight > maxWeight) maxWeight = weight;
    }
  }

  const isInjection = flaggedPatterns.length > 0 && maxWeight >= 0.70;

  if (isInjection) {
    return {
      actionType: "UNTRUSTED_INJECTION_RISK",
      requiresOwnerAuthority: true,
      isInjectionAttempt: true,
      injectionConfidence: maxWeight,
      flaggedPatterns,
      explanation: `Input matches adversarial prompt injection or instruction evasion patterns: ${flaggedPatterns.join(", ")}`,
    };
  }

  // Check privileged operations
  for (const { pattern, name } of PRIVILEGED_ACTION_PATTERNS) {
    if (pattern.test(input)) {
      flaggedPatterns.push(name);
      return {
        actionType: "PRIVILEGED_OPERATION",
        requiresOwnerAuthority: true,
        isInjectionAttempt: false,
        injectionConfidence: 0,
        flaggedPatterns,
        explanation: `Input requests a privileged operational change (${name}) requiring Owner Authority`,
      };
    }
  }

  // Check mutating operations
  for (const { pattern, name } of MUTATING_ACTION_PATTERNS) {
    if (pattern.test(input)) {
      flaggedPatterns.push(name);
      return {
        actionType: "MUTATING_OPERATION",
        requiresOwnerAuthority: false,
        isInjectionAttempt: false,
        injectionConfidence: 0,
        flaggedPatterns,
        explanation: `Input requests an estimate or project mutation (${name})`,
      };
    }
  }

  return {
    actionType: "READ_ONLY_INFORMATIONAL",
    requiresOwnerAuthority: false,
    isInjectionAttempt: false,
    injectionConfidence: 0,
    flaggedPatterns: [],
    explanation: "Read-only informational or analytical query within safe boundaries",
  };
}
