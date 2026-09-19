// =========================================================
// FRELUX PHASE 6.5, INGESTION SANITIZATION & PROMPT-INJECTION
// RESISTANCE
//
// All ingested reference material and user-supplied text is
// UNTRUSTED until verified. It is stored as data, never executed,
// never interpolated into prompts without this sanitization step.
// =========================================================

/** Max serialized payload size accepted by ingestion (bytes). */
export const MAX_INGESTION_BYTES = 100_000;
/** Max length of any single text field. */
export const MAX_FIELD_CHARS = 8_000;
/** Max items in any array field. */
export const MAX_ARRAY_ITEMS = 50;

const INJECTION_PATTERNS: Array<{ flag: string; re: RegExp }> = [
  {
    flag: "IGNORE_INSTRUCTIONS",
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  },
  {
    flag: "DISREGARD_RULES",
    re: /disregard\s+(all\s+)?(previous|prior|above|your)/i,
  },
  {
    flag: "SYSTEM_PROMPT_PROBE",
    re: /(reveal|show|print|repeat|output)\s+(your\s+)?(system\s*prompt|hidden\s+instructions|secret)/i,
  },
  {
    flag: "ROLE_HIJACK",
    re: /(act|pretend|behave)\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(different|another|unrestricted|DAN)/i,
  },
  {
    flag: "INSTRUCTION_OVERRIDE",
    re: /(you\s+are\s+now|new\s+instructions|from\s+now\s+on\s+you\s+must)/i,
  },
  {
    flag: "SECRET_EXFIL",
    re: /(api\s*key|secret|token|password|credential).{0,30}(send|post|upload|leak|share)/i,
  },
  {
    flag: "DEPLOY_INJECTION",
    re: /(deploy|push|commit|delete).{0,20}(code|migration|to\s+production|main\s+branch)/i,
  },
];

/** Only http(s) URLs are acceptable as cited sources. */
export function isSafeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length > 500) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/javascript:|data:|vbscript:/i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface SanitizeResult {
  value: string;
  flags: string[];
  truncated: boolean;
}

/** Sanitize free text: strip control chars, cap length, flag injections. */
export function sanitizeText(raw: string | undefined | null): SanitizeResult {
  const flags: string[] = [];
  if (raw == null) return { value: "", flags, truncated: false };
  let value = String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, MAX_FIELD_CHARS);
  const truncated = String(raw).length > MAX_FIELD_CHARS;
  for (const { flag, re } of INJECTION_PATTERNS) {
    if (re.test(value)) flags.push(flag);
  }
  if (flags.length > 0) {
    // Quarantine: keep the text as DATA but neutralize it for any
    // downstream prompt interpolation by wrapping in a data fence.
    value = `[UNTRUSTED-DATA, INJECTION-FLAGGED: ${flags.join(",")}]\n${value}`;
  }
  return { value, flags, truncated };
}

export interface SanitizedArray {
  values: string[];
  flags: string[];
  droppedUrls: number;
}

/** Sanitize an array field (evidence, assumptions, citations). */
export function sanitizeStringArray(
  raw: unknown,
  opts: { validateUrls?: boolean } = {},
): SanitizedArray {
  const flags: string[] = [];
  const values: string[] = [];
  let droppedUrls = 0;
  if (!Array.isArray(raw)) return { values, flags, droppedUrls };
  for (const item of raw.slice(0, MAX_ARRAY_ITEMS)) {
    if (typeof item !== "string") continue;
    const s = sanitizeText(item);
    flags.push(...s.flags);
    const trimmed = s.value.trim();
    if (!trimmed) continue;
    if (opts.validateUrls && !isSafeUrl(trimmed)) {
      droppedUrls += 1;
      continue;
    }
    values.push(trimmed);
  }
  return { values, flags, droppedUrls };
}

/** FNV-1a content hash for duplicate detection (no crypto needed edge-side). */
export function hashContent(
  parts: Array<string | number | undefined | null>,
): string {
  const input = parts.map((p) => String(p ?? "")).join("\u241F");
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a_${h.toString(16)}_${input.length}`;
}

/**
 * Full payload validation + sanitization for ARCHIE ingestion.
 * Returns a clean record plus flags, or an error code.
 */
export function validateArchiePayload(raw: unknown):
  | {
      ok: true;
      record: Omit<import("./types").LearningRecordInput, "created_by">;
      flags: string[];
    }
  | {
      ok: false;
      code: "INVALID_PAYLOAD" | "PAYLOAD_TOO_LARGE" | "INJECTION_QUARANTINED";
      message: string;
      flags: string[];
    } {
  const flags: string[] = [];
  if (raw == null || typeof raw !== "object") {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Payload must be an object.",
      flags,
    };
  }
  const p = raw as Record<string, unknown>;
  const size = JSON.stringify(raw).length;
  if (size > MAX_INGESTION_BYTES) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `Payload exceeds ${MAX_INGESTION_BYTES} bytes.`,
      flags,
    };
  }
  if (p.source !== "ARCHIE") {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "source must be ARCHIE for this endpoint.",
      flags,
    };
  }
  const topicRes = sanitizeText(p.topic as string);
  const capabilityRes = sanitizeText(p.capability as string);
  if (!topicRes.value.trim() || !capabilityRes.value.trim()) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "topic and capability are required.",
      flags,
    };
  }
  flags.push(...topicRes.flags, ...capabilityRes.flags);

  const SCOPES = ["GLOBAL", "REGIONAL", "PROJECT", "PROPERTY", "USER"] as const;
  const scope = p.proposed_scope as (typeof SCOPES)[number];
  if (!SCOPES.includes(scope)) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message:
        "proposed_scope must be GLOBAL, REGIONAL, PROJECT, PROPERTY or USER.",
      flags,
    };
  }
  if (
    (scope === "PROJECT" || scope === "PROPERTY") &&
    !p.scope_key &&
    !p.project_id &&
    !p.property_id
  ) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message:
        "PROJECT/PROPERTY scope requires scope_key, project_id or property_id.",
      flags,
    };
  }
  if (scope === "REGIONAL" && !p.scope_key) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "REGIONAL scope requires scope_key (market code).",
      flags,
    };
  }

  let confidence: number | undefined;
  if (p.confidence != null) {
    confidence = Number(p.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return {
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "confidence must be a number between 0 and 1.",
        flags,
      };
    }
  }

  const evidence = sanitizeStringArray(p.evidence);
  const cited = sanitizeStringArray(p.cited_sources, { validateUrls: true });
  const assumptions = sanitizeStringArray(p.assumptions);
  flags.push(...evidence.flags, ...cited.flags, ...assumptions.flags);

  const recommendationRes = sanitizeText(p.recommendation as string);
  const conclusionRes = sanitizeText(p.conclusion as string);
  const contextRes = sanitizeText(p.request_context as string);
  flags.push(
    ...recommendationRes.flags,
    ...conclusionRes.flags,
    ...contextRes.flags,
  );

  const record = {
    source: "ARCHIE" as const,
    source_type:
      sanitizeText(p.source_type as string).value || "CHATGPT_REFERENCE",
    provider: sanitizeText(p.provider as string).value || "OPENAI",
    model_version: sanitizeText(p.model_version as string).value,
    topic: topicRes.value.trim(),
    capability: capabilityRes.value.trim(),
    request_context: contextRes.value,
    recommendation: recommendationRes.value,
    conclusion: conclusionRes.value,
    evidence: evidence.values,
    cited_sources: cited.values,
    assumptions: assumptions.values,
    proposed_scope: scope,
    scope_key: p.scope_key
      ? sanitizeText(p.scope_key as string).value.trim()
      : undefined,
    project_id:
      typeof p.project_id === "string" && p.project_id
        ? p.project_id
        : undefined,
    property_id:
      typeof p.property_id === "string" && p.property_id
        ? p.property_id
        : undefined,
    provenance: {
      ...(typeof p.provenance === "object" && p.provenance !== null
        ? p.provenance
        : {}),
      sanitizer_flags: flags,
      dropped_urls: cited.droppedUrls,
      sanitized_at: new Date().toISOString(),
    },
    confidence,
    content_hash: hashContent([
      "ARCHIE",
      topicRes.value.trim(),
      capabilityRes.value.trim(),
      recommendationRes.value,
      conclusionRes.value,
      scope,
      typeof p.scope_key === "string" ? p.scope_key : "",
    ]),
    payload_size: size,
  };

  // Injection-flagged payloads are quarantined: ingested as
  // ARCHIE_RECEIVED (reviewable) but the ingest call reports the
  // quarantine so reviewers see it immediately. It can never be
  // approved without a human reading the flags.
  return { ok: true, record, flags };
}

/** Rate-limit check against a sliding window. */
export function checkRateLimit(
  key: string,
  window: { window_start: string; count: number },
  limit: number,
  windowMs: number,
  now: Date,
): { allowed: boolean; count: number; window_start: string } {
  const start = new Date(window.window_start).getTime();
  if (now.getTime() - start >= windowMs) {
    return { allowed: true, count: 0, window_start: now.toISOString() };
  }
  if (window.count >= limit) {
    return {
      allowed: false,
      count: window.count,
      window_start: window.window_start,
    };
  }
  return {
    allowed: true,
    count: window.count + 1,
    window_start: window.window_start,
  };
}
