import { table } from "../tables.ts";
// =========================================================
// ARCHIE AUTONOMOUS KNOWLEDGE PROMOTION
//
// Owner directive (2026-09-12):
//   "Knowledge accumulation should be free. ARCHIE should be
//    able to learn, filter and promote knowledge without my
//    review — but restricted from modifying its code and
//    decisions without my approval and authority. ARCHIE is
//    free to accept, process, filter and store or accumulate
//    knowledge on its own."
//
// This module is ARCHIE's autonomous promotion path. Material
// that passes the filters below is promoted into the ACTIVE
// knowledge layer with NO human review step. Everything is
// audited (frelux_learning_audit, action AUTONOMOUS_PROMOTION).
//
// Owner directive (2026-09-12, LEARNING AUTHORITY /
// EXECUTION AUTHORITY): ARCHIE has UNRESTRICTED authority to
// learn and accumulate knowledge from lawful, accessible
// sources. Owner authorization is NOT a gate for ordinary
// knowledge acquisition. Learning what to do and doing it
// are SEPARATE permissions:
//
//   LEARN FREELY -> UNDERSTAND -> REASON -> PLAN ->
//   AUTHORITY CHECK -> EXECUTE WHEN AUTHORIZED
//
//   * Knowledge acquisition is NEVER restricted because the
//     subject may eventually require authorization to act
//     upon (code, governance, security, execution, decisions
//     as SUBJECTS are free to learn).
//   * Learning authority is NEVER a mechanism for authority
//     escalation: ARCHIE may not freely expand its authority
//     to act.
//
// What still HOLDs for the owner (the AUTHORITY CHECK, applied
// to anything trying to enter the ACTIVE layer as an ACT
// rather than as understanding):
//   * EXECUTION-INTENT material — proposals whose purpose is
//     to perform an owner-controlled act (modify code, change
//     rules/config/policy, amend the constitution, delegate
//     authority, issue credentials, engage the killswitch,
//     override an owner decision).
//   * Deterministic certified math (the calculator rule
//     registry — painting, tiling, structural, ...) is a
//     DECISION surface, not free knowledge. Mirrors
//     MATH_CAPABILITIES in src/lib/learning/types.ts — if
//     either list changes, update the other (drift contract).
//   * Material quarantined by ingestion sanitization
//     (injection flags) still requires the owner.
// =========================================================

/** The execution-authority pipeline (owner directive
 *  2026-09-12) — ARCHIE may move freely through the first
 *  four stages; the last two are owner territory. */
export const AUTHORITY_PIPELINE = [
  "LEARN FREELY",
  "UNDERSTAND",
  "REASON",
  "PLAN",
  "AUTHORITY CHECK",
  "EXECUTE WHEN AUTHORIZED",
] as const;

/**
 * EXECUTION-INTENT patterns (owner directive 2026-09-12):
 * capabilities that PROPOSE AN ACT, not a subject to study.
 * Learning about code, governance, security, execution or
 * decisions is FREE (any subject may be learned); material
 * whose purpose is to PERFORM an owner-controlled act —
 * modify, change, amend, delegate, issue, override — HOLDs
 * for the AUTHORITY CHECK.
 */
const EXECUTION_INTENT_PATTERNS: readonly string[] = [
  "modification",
  "modifying",
  "self_mod",
  "selfmod",
  "code_change",
  "rule_change",
  "config_change",
  "policy_change",
  "governance_change",
  "constitution_amend",
  "amendment",
  "delegation",
  "credential_issuance",
  "killswitch",
  "authority_override",
  "decision_override",
  "authority_escalation",
];

/** Deterministic certified-math capabilities (mirror of
 *  MATH_CAPABILITIES, src/lib/learning/types.ts). */
export const CERTIFIED_MATH_CAPABILITIES: ReadonlySet<string> = new Set([
  "painting",
  "screeding",
  "tiling",
  "pop_ceiling",
  "tyrolene",
  "grafitex",
  "unit_conversion",
  "roof_geometry",
  "structural",
  "foundation",
  "build_to_roof",
  "material_ratios",
]);

/** Autonomous promotion thresholds. */
export const AUTONOMY_THRESHOLDS = {
  /** Below this confidence ARCHIE holds the material for the
   *  owner instead of promoting it. */
  MIN_CONFIDENCE: 0.6,
  /** GLOBAL scope promotes at the same single quality bar.
   *  (Owner directive 2026-09-12 removed the review wall; the
   *  old regional→global promotion caution is now carried by
   *  the confidence filter itself, not by human review. Scope
   *  must simply be labeled honestly by the material.) */
  GLOBAL_CONFIDENCE: 0.6,
} as const;

export type AutonomyDecision = "PROMOTE" | "HOLD" | "REJECT";

export interface AutonomyEvaluation {
  decision: AutonomyDecision;
  reason: string;
}

/** A learning record as ARCHIE's autonomous path sees it. */
export interface AutonomyRecord {
  id?: string;
  capability?: string | null;
  topic?: string | null;
  recommendation?: string | null;
  conclusion?: string | null;
  proposed_scope?: string | null;
  confidence?: number | null;
  [k: string]: unknown;
}

function isExecutionIntent(capability: string): boolean {
  const c = capability.toLowerCase();
  return (
    EXECUTION_INTENT_PATTERNS.some((m) => c.includes(m)) ||
    CERTIFIED_MATH_CAPABILITIES.has(c)
  );
}

/**
 * Decide, purely and deterministically, what ARCHIE does with
 * a piece of received material. No I/O — fully testable.
 */
export function evaluateAutonomy(
  record: AutonomyRecord,
  injectionFlags: readonly string[] = [],
): AutonomyEvaluation {
  if (injectionFlags.length > 0) {
    return {
      decision: "HOLD",
      reason:
        "quarantined by ingestion sanitization (injection flags) — owner review required",
    };
  }
  // LEARNING AUTHORITY: subjects are always free. Only
  // execution-intent material (proposing an owner-controlled
  // act) or certified-math rule changes HOLD at the authority
  // check. Never gate learning merely because the subject may
  // eventually require authorization to act upon.
  const capability = String(record.capability ?? "").toLowerCase();
  if (capability && isExecutionIntent(capability)) {
    return {
      decision: "HOLD",
      reason: `capability '${capability}' carries execution intent (modify/change/delegate/override or certified-math rules) — understanding is stored freely, but acting requires owner authorization`,
    };
  }
  if (!record.topic || !String(record.topic).trim()) {
    return {
      decision: "REJECT",
      reason: "no topic — nothing to anchor knowledge to",
    };
  }
  const hasContent =
    (record.recommendation && String(record.recommendation).trim()) ||
    (record.conclusion && String(record.conclusion).trim());
  if (!hasContent) {
    return {
      decision: "REJECT",
      reason: "no substantive content (recommendation/conclusion empty)",
    };
  }
  // When confidence is absent (never assessed), ARCHIE
  // SELF-ASSESSES the material — processing and filtering on
  // its own (owner directive 2026-09-12). A complete piece of
  // provenance-backed material earns promotion; thin material
  // holds for the owner.
  let confidence = Number(record.confidence ?? 0);
  let selfAssessed = false;
  if (!Number.isFinite(confidence) || confidence <= 0) {
    let score = 0.4;
    if (record.recommendation && String(record.recommendation).trim())
      score += 0.1;
    if (record.conclusion && String(record.conclusion).trim()) score += 0.1;
    if (Array.isArray(record.evidence) && record.evidence.length > 0)
      score += 0.1;
    if (
      record.provenance &&
      typeof record.provenance === "object" &&
      Object.keys(record.provenance as Record<string, unknown>).length > 0
    ) {
      score += 0.1;
    }
    confidence = Math.min(score, 0.9);
    selfAssessed = true;
  }
  const confidenceNote = selfAssessed ? "self-assessed" : "reported";
  if (confidence < AUTONOMY_THRESHOLDS.MIN_CONFIDENCE) {
    return {
      decision: "HOLD",
      reason: `${confidenceNote} confidence ${confidence} below autonomous threshold (${AUTONOMY_THRESHOLDS.MIN_CONFIDENCE}) — held for owner`,
    };
  }
  const scope = String(record.proposed_scope ?? "GLOBAL").toUpperCase();
  if (
    scope === "GLOBAL" &&
    confidence < AUTONOMY_THRESHOLDS.GLOBAL_CONFIDENCE
  ) {
    return {
      decision: "HOLD",
      reason: `GLOBAL scope below autonomous threshold (${AUTONOMY_THRESHOLDS.GLOBAL_CONFIDENCE}; ${confidenceNote} confidence ${confidence}) — held for owner`,
    };
  }
  return {
    decision: "PROMOTE",
    reason: `passes autonomous filters (${confidenceNote} confidence ${confidence}, scope ${scope})`,
  };
}

/** Minimal service-client surface the promote path needs.
 *  Structural on purpose: the edge runtime ships supabase-js
 *  via npm: specifiers this module does not need to import. */
type Db = { from(table: string): DbTable };
type DbResult = { error: { message: string } | null };
interface DbTable {
  // PromiseLike: supabase-js returns PostgrestFilterBuilder
  // (a thenable without .catch/.finally), which is fully
  // compatible at runtime with `await` — the strict Promise
  // type here made real service clients type-reject.
  insert(payload: unknown): PromiseLike<DbResult>;
  update(payload: unknown): {
    eq(col: string, val: unknown): PromiseLike<DbResult>;
  };
  select(cols?: string): {
    eq(
      col: string,
      val: unknown,
    ): {
      order(
        col: string,
        o: { ascending: boolean },
      ): {
        limit(
          n: number,
        ): PromiseLike<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Promote a received record into the ACTIVE knowledge layer
 * autonomously: version snapshot first (rollback point), then
 * the knowledge item, then the record's lifecycle, then the
 * audit entry. approved_by stays NULL — this is ARCHIE acting
 * on the owner\'s standing directive, and the audit says so.
 */
export async function autonomouslyPromote(
  db: Db,
  record: Record<string, unknown> & { id: string },
  actorId: string | null,
  reason: string,
): Promise<{ ok: boolean; error?: string; knowledge_version?: number }> {
  // Version snapshot BEFORE promotion (rollback point).
  const snap = await db.from(table("learning_versions")).insert({
    record_id: record.id,
    version: 1,
    snapshot: record,
    change_reason: `ARCHIE autonomous promotion: ${reason}`,
    reviewer: null,
  });
  if (snap?.error)
    return { ok: false, error: `snapshot failed: ${snap.error.message}` };

  // Next knowledge version for this record.
  const existing = await db
    .from(table("knowledge_items"))
    .select("version")
    .eq("record_id", record.id)
    .order("version", { ascending: false })
    .limit(1);
  if (existing?.error) {
    return {
      ok: false,
      error: `version lookup failed: ${existing.error.message}`,
    };
  }
  const rows = (existing?.data ?? []) as { version: number }[];
  const knowledge_version = (rows[0]?.version ?? 0) + 1;

  const item = {
    record_id: record.id,
    capability: record.capability ?? null,
    scope: record.proposed_scope ?? "GLOBAL",
    scope_key: record.scope_key ?? null,
    topic: record.topic,
    content: {
      recommendation: record.recommendation ?? null,
      conclusion: record.conclusion ?? null,
      evidence: record.evidence ?? null,
      assumptions: record.assumptions ?? null,
      request_context: record.request_context ?? null,
    },
    evidence_state: "AI_RECOMMENDATION",
    confidence: record.confidence ?? null,
    version: knowledge_version,
    status: "ACTIVE",
    change_reason: `ARCHIE autonomous promotion (owner directive 2026-09-12): ${reason}`,
    created_by: record.created_by ?? null,
    approved_by: null,
    approved_date: new Date().toISOString(),
  };
  const inserted = await db.from(table("knowledge_items")).insert(item);
  if (inserted?.error) {
    return {
      ok: false,
      error: `knowledge promotion failed: ${inserted.error.message}`,
    };
  }

  const upd = await db
    .from(table("learning_records"))
    .update({
      lifecycle_status: "APPROVED",
      updated_date: new Date().toISOString(),
    })
    .eq("id", record.id);
  if (upd?.error)
    return {
      ok: false,
      error: `lifecycle update failed: ${upd.error.message}`,
    };

  await db.from(table("learning_audit")).insert({
    record_id: record.id,
    action: "AUTONOMOUS_PROMOTION",
    actor: actorId,
    details: {
      autonomous: true,
      reason,
      knowledge_version,
      policy:
        "owner directive 2026-09-12 — knowledge accumulation is free; code and decisions stay owner-gated",
    },
  });

  return { ok: true, knowledge_version };
}
