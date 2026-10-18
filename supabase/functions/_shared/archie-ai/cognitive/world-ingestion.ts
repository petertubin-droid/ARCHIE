// =========================================================
// ARCHIE WORLD MODEL — INGESTION VALIDATION GATE
// supabase/functions/_shared/archie-ai/cognitive/world-ingestion.ts
//
// Entry gate for observations that arrive from outside the
// kernel's own cognitive loop (imports, tools, external
// claims). Every item is validated before it can reach
// WorldModel.relate(). Validation is all-or-nothing per item:
// a rejected item is reported with its reasons and never
// written; a valid item is written through relate() and its
// write failure is reported, not hidden.
//
// Rules are structural. Text inside an observation is DATA:
// it is stored verbatim and never interpreted as an
// instruction, and no observation can change scope, owner
// authority, or confidence beyond the 0..1 range.
//
// The kernel's own MODEL phase does not pass through this gate
// (its object values are truncated and its predicates come from
// the knowledge store). This gate covers new external entry
// points only, so it cannot silently drop kernel writes.
// =========================================================

import type { WorldModel } from "./world-model.ts";

export const INGEST_LIMITS = {
  /** Max observations in one batch. Bounds memory and writes. */
  maxBatch: 200,
  /** Max characters for subject, object, and kind labels. */
  maxTextChars: 200,
  /** Max characters for a relation name. */
  maxRelationChars: 64,
  /** Max characters for the provenance label. */
  maxProvenanceChars: 200,
  /** Observation timestamps may not be later than this past now. */
  maxFutureSkewMs: 5 * 60 * 1000,
} as const;

const ALLOWED_KEYS = new Set([
  "subject",
  "relation",
  "object",
  "subjectKind",
  "objectKind",
  "confidence",
  "provenance",
  "observedAt",
]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const RELATION_RE = /^[\p{L}\p{N}_ .:-]+$/u;
const KIND_RE = /^[\p{L}][\p{L} ]*$/u;

export interface ValidObservation {
  subject: string;
  relation: string;
  object: string;
  subjectKind?: string;
  objectKind?: string;
  confidence: number;
  provenance: string;
  observedAt?: string;
}

export type ValidationResult =
  | { ok: true; observation: ValidObservation }
  | { ok: false; reasons: string[] };

function checkText(
  label: string,
  value: unknown,
  max: number,
  reasons: string[],
): string | null {
  if (typeof value !== "string") {
    reasons.push(`${label} must be a string`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    reasons.push(`${label} must not be empty`);
    return null;
  }
  if (trimmed.length > max) {
    reasons.push(`${label} exceeds ${max} characters`);
    return null;
  }
  if (CONTROL_CHARS.test(trimmed)) {
    reasons.push(`${label} contains control characters`);
    return null;
  }
  return trimmed;
}

/** Validate one observation without touching the model. */
export function validateObservation(
  input: unknown,
  now: Date = new Date(),
): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reasons: ["observation must be an object"] };
  }
  const reasons: string[] = [];
  const record = input as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      reasons.push(`unknown field "${key.slice(0, 40)}"`);
    }
  }

  const subject = checkText("subject", record.subject, INGEST_LIMITS.maxTextChars, reasons);
  const object = checkText("object", record.object, INGEST_LIMITS.maxTextChars, reasons);

  let relation: string | null = null;
  if (typeof record.relation !== "string") {
    reasons.push("relation must be a string");
  } else {
    relation = checkText("relation", record.relation, INGEST_LIMITS.maxRelationChars, reasons);
    if (relation && !RELATION_RE.test(relation)) {
      reasons.push("relation contains unsupported characters");
      relation = null;
    }
  }

  if (subject !== null && object !== null && subject === object) {
    reasons.push("subject and object must differ");
  }

  let subjectKind: string | undefined;
  if (record.subjectKind !== undefined) {
    const k = checkText("subjectKind", record.subjectKind, 40, reasons);
    if (k !== null && !KIND_RE.test(k)) reasons.push("subjectKind has unsupported characters");
    else if (k !== null) subjectKind = k;
  }
  let objectKind: string | undefined;
  if (record.objectKind !== undefined) {
    const k = checkText("objectKind", record.objectKind, 40, reasons);
    if (k !== null && !KIND_RE.test(k)) reasons.push("objectKind has unsupported characters");
    else if (k !== null) objectKind = k;
  }

  const c = record.confidence;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1) {
    reasons.push("confidence must be a finite number between 0 and 1");
  }

  const provenance = checkText(
    "provenance",
    record.provenance,
    INGEST_LIMITS.maxProvenanceChars,
    reasons,
  );

  let observedAt: string | undefined;
  if (record.observedAt !== undefined) {
    const raw = record.observedAt;
    const ms = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    if (typeof raw !== "string" || Number.isNaN(ms)) {
      reasons.push("observedAt must be a valid ISO timestamp");
    } else if (ms > now.getTime() + INGEST_LIMITS.maxFutureSkewMs) {
      reasons.push("observedAt is in the future");
    } else {
      observedAt = new Date(ms).toISOString();
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    observation: {
      subject: subject!,
      relation: relation!,
      object: object!,
      subjectKind,
      objectKind,
      confidence: c as number,
      provenance: provenance!,
      observedAt,
    },
  };
}

export interface IngestReport {
  accepted: number;
  rejected: Array<{ index: number; reasons: string[] }>;
  /** Valid items whose write failed. Not counted as accepted. */
  writeFailures: Array<{ index: number; message: string }>;
  /** Batch-level refusal (not an array, or over the batch cap).
   *  When set, nothing was written. */
  batchError?: string;
}

/** Validate a batch and write only the valid items. Batch-level
 *  problems refuse the whole batch before any write. */
export async function ingestObservations(
  model: WorldModel,
  batch: unknown,
  now: Date = new Date(),
): Promise<IngestReport> {
  const report: IngestReport = { accepted: 0, rejected: [], writeFailures: [] };
  if (!Array.isArray(batch)) {
    return { ...report, batchError: "batch must be an array" };
  }
  if (batch.length > INGEST_LIMITS.maxBatch) {
    return {
      ...report,
      batchError: `batch exceeds ${INGEST_LIMITS.maxBatch} observations`,
    };
  }

  const seen = new Set<string>();
  const valid: Array<{ index: number; observation: ValidObservation }> = [];
  batch.forEach((item, index) => {
    const result = validateObservation(item, now);
    if (!result.ok) {
      report.rejected.push({ index, reasons: result.reasons });
      return;
    }
    const o = result.observation;
    const dedupeKey = JSON.stringify([o.subject, o.relation, o.object, o.observedAt ?? null]);
    if (seen.has(dedupeKey)) {
      report.rejected.push({ index, reasons: ["duplicate observation in this batch"] });
      return;
    }
    seen.add(dedupeKey);
    valid.push({ index, observation: o });
  });

  for (const { index, observation } of valid) {
    try {
      await model.relate({
        subject: observation.subject,
        relation: observation.relation,
        object: observation.object,
        subjectKind: observation.subjectKind,
        objectKind: observation.objectKind,
        confidence: observation.confidence,
        provenance: observation.provenance,
        observedAt: observation.observedAt,
      });
      report.accepted += 1;
    } catch (err) {
      report.writeFailures.push({
        index,
        message: err instanceof Error ? err.message.slice(0, 200) : "write failed",
      });
    }
  }
  return report;
}
