// =========================================================
// ARCHIE INGESTION — SERVER-SIDE PAYLOAD VALIDATION
//
// Same contract as src/lib/learning/sanitize.ts (kept in sync
// deliberately; the edge function cannot import app code).
// All content is stored as DATA with injection flags — never
// executed, never interpolated into prompts.
// =========================================================

const MAX_INGESTION_BYTES = 100_000;
const MAX_FIELD_CHARS = 8_000;
const MAX_ARRAY_ITEMS = 50;

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

function isSafeUrl(raw: string): boolean {
  const t = raw.trim();
  if (t.length > 500 || !/^https?:\/\//i.test(t)) return false;
  if (/javascript:|data:|vbscript:/i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeText(raw: unknown): { value: string; flags: string[] } {
  const flags: string[] = [];
  if (raw == null) return { value: "", flags };
  let value = String(raw)
    // eslint-disable-next-line no-control-regex -- stripping control chars from untrusted input is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, MAX_FIELD_CHARS);
  for (const { flag, re } of INJECTION_PATTERNS) {
    if (re.test(value)) flags.push(flag);
  }
  if (flags.length > 0) {
    value = `[UNTRUSTED-DATA — INJECTION-FLAGGED: ${flags.join(",")}]\n${value}`;
  }
  return { value, flags };
}

function sanitizeArray(
  raw: unknown,
  validateUrls = false,
): { values: string[]; flags: string[]; droppedUrls: number } {
  const flags: string[] = [];
  const values: string[] = [];
  let droppedUrls = 0;
  if (!Array.isArray(raw)) return { values, flags, droppedUrls };
  for (const item of raw.slice(0, MAX_ARRAY_ITEMS)) {
    if (typeof item !== "string") continue;
    const s = sanitizeText(item);
    flags.push(...s.flags);
    const t = s.value.trim();
    if (!t) continue;
    if (validateUrls && !isSafeUrl(t)) {
      droppedUrls += 1;
      continue;
    }
    values.push(t);
  }
  return { values, flags, droppedUrls };
}

function hashContent(parts: Array<string | number | undefined | null>): string {
  const input = parts.map((p) => String(p ?? "")).join("\u241F");
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a_${h.toString(16)}_${input.length}`;
}

export interface ValidatedRecord {
  source: "ARCHIE";
  source_type: string;
  provider: string;
  model_version: string;
  topic: string;
  capability: string;
  request_context: string;
  recommendation: string;
  conclusion: string;
  evidence: string[];
  cited_sources: string[];
  assumptions: string[];
  proposed_scope: "GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER";
  scope_key?: string;
  project_id?: string;
  property_id?: string;
  provenance: Record<string, unknown>;
  confidence?: number;
  content_hash: string;
  payload_size: number;
}

export function validateArchiePayload(raw: unknown):
  | { ok: true; record: ValidatedRecord; flags: string[] }
  | {
      ok: false;
      code: "INVALID_PAYLOAD" | "PAYLOAD_TOO_LARGE";
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
  const topicRes = sanitizeText(p.topic);
  const capabilityRes = sanitizeText(p.capability);
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
      message: "Invalid proposed_scope.",
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

  let confidence: number | undefined;
  if (p.confidence != null) {
    confidence = Number(p.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return {
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "confidence must be between 0 and 1.",
        flags,
      };
    }
  }

  const evidence = sanitizeArray(p.evidence);
  const cited = sanitizeArray(p.cited_sources, true);
  const assumptions = sanitizeArray(p.assumptions);
  flags.push(...evidence.flags, ...cited.flags, ...assumptions.flags);
  const recommendationRes = sanitizeText(p.recommendation);
  const conclusionRes = sanitizeText(p.conclusion);
  const contextRes = sanitizeText(p.request_context);
  flags.push(
    ...recommendationRes.flags,
    ...conclusionRes.flags,
    ...contextRes.flags,
  );

  const record: ValidatedRecord = {
    source: "ARCHIE",
    source_type: sanitizeText(p.source_type).value || "CHATGPT_REFERENCE",
    // provenance is recorded honestly — an unlabeled external
    // reference is UNSPECIFIED, never silently attributed to
    // a provider (OpenAI Separation Rule)
    provider: sanitizeText(p.provider).value || "UNSPECIFIED",
    model_version: sanitizeText(p.model_version).value,
    topic: topicRes.value.trim(),
    capability: capabilityRes.value.trim(),
    request_context: contextRes.value,
    recommendation: recommendationRes.value,
    conclusion: conclusionRes.value,
    evidence: evidence.values,
    cited_sources: cited.values,
    assumptions: assumptions.values,
    proposed_scope: scope,
    scope_key: p.scope_key ? sanitizeText(p.scope_key).value.trim() : undefined,
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
        ? (p.provenance as Record<string, unknown>)
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
  return { ok: true, record, flags };
}
