// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — NORMALIZATION
// supabase/functions/_shared/archie-ai/learning/normalization.ts
//
// Normalizes incoming information, scrubs secrets, quarantines
// prompt-injections & adversarial inputs, and generates
// deterministic SHA-256 content hashes (spec §3 & §13).
// =========================================================

import type { LearningInput, NormalizedLearningInput } from "./types.ts";
import { sha256 } from "../cognitive/sha256.ts";

export interface InjectionPattern {
  flag: string;
  re: RegExp;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

export const ADVERSARIAL_PATTERNS: readonly InjectionPattern[] = [
  {
    flag: "IGNORE_INSTRUCTIONS",
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
    severity: "CRITICAL",
  },
  {
    flag: "DISREGARD_RULES",
    re: /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions|guidelines|rules)/i,
    severity: "CRITICAL",
  },
  {
    flag: "SYSTEM_PROMPT_PROBE",
    re: /(reveal|show|print|repeat|output)\s+(your\s+)?(system\s*prompt|hidden\s+instructions|secret)/i,
    severity: "HIGH",
  },
  {
    flag: "ROLE_HIJACK",
    re: /(act|pretend|behave)\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(different|another|unrestricted|DAN|jailbreak)/i,
    severity: "HIGH",
  },
  {
    flag: "INSTRUCTION_OVERRIDE",
    re: /(you\s+are\s+now|new\s+instructions|from\s+now\s+on\s+you\s+must\s+follow)/i,
    severity: "HIGH",
  },
  {
    flag: "SECRET_EXFIL",
    re: /(api\s*key|secret|token|password|credential).{0,30}(send|post|upload|leak|share|webhook)/i,
    severity: "CRITICAL",
  },
  {
    flag: "AUTHORITY_ESCALATION",
    re: /(bypass|disable|override)\s+(owner\s+authority|approval|permissions|safety\s+checks)/i,
    severity: "CRITICAL",
  },
  {
    flag: "DEPLOY_INJECTION",
    re: /(eval\(|exec\(|child_process|<script|\brm\s+-rf\b)/i,
    severity: "CRITICAL",
  },
];

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "OPENAI_KEY", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "BEARER_TOKEN", re: /\bBearer\s+[A-Za-z0-9_.-]{20,}\b/gi },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "GENERIC_API_KEY", re: /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"]?([A-Za-z0-9+/=_-]{16,})['"]?/gi },
  { name: "PRIVATE_KEY", re: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
];

/**
 * Normalizes input text and scrubs confidential tokens.
 */
export function scrubSecrets(text: string): { cleaned: string; redactedCount: number } {
  let cleaned = text;
  let redactedCount = 0;

  for (const { name, re } of SECRET_PATTERNS) {
    const matches = cleaned.match(re);
    if (matches) {
      redactedCount += matches.length;
      cleaned = cleaned.replace(re, `[REDACTED_${name}]`);
    }
  }

  return { cleaned, redactedCount };
}

/**
 * Detects adversarial prompt injection attempts in input text.
 */
export function scanAdversarialFlags(text: string): string[] {
  const flags: string[] = [];
  for (const p of ADVERSARIAL_PATTERNS) {
    if (p.re.test(text)) {
      flags.push(p.flag);
    }
  }
  return flags;
}

/**
 * Normalizes an incoming LearningInput into a structured machine-processable form.
 */
export function normalizeLearningInput(input: LearningInput): NormalizedLearningInput {
  const raw = input.rawContent ?? "";
  
  // 1. Strip null bytes and non-printable control chars (preserve newlines/tabs)
  const sanitizedChars = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Secret redaction
  const { cleaned: secretScrubbed, redactedCount } = scrubSecrets(sanitizedChars);

  // 3. Normalized whitespace for canonical representation
  const normalizedText = secretScrubbed.trim();

  // 4. Adversarial scan
  const sanitizerFlags = scanAdversarialFlags(normalizedText);
  const quarantined = sanitizerFlags.length > 0;

  // 5. Deterministic content hash over normalized text + source + domain
  const domain = (input.domain ?? "general").toLowerCase().trim();
  const hashPayload = `${input.source}:${domain}:${normalizedText}`;
  const contentHash = sha256(hashPayload);

  return {
    id: input.id,
    source: input.source,
    sourceReference: input.sourceReference,
    normalizedContent: normalizedText,
    contentHash,
    sanitizerFlags,
    quarantined,
    redactedSecretsCount: redactedCount,
    observedAt: input.observedAt || new Date().toISOString(),
    scope: input.scope ?? "PROJECT",
    scopeKey: input.scopeKey,
    domain,
  };
}
