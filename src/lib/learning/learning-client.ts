// =========================================================
// FRELUX PHASE 6.5, LEARNING CLIENT
//
// Browser-facing connection of the unified Learning Engine to
// the live FRELUX AI systems:
//   * Gemini: AI Image Estimator correction capture
//   * OpenAI: Live Chat signal capture
//   * USER:   corrections and actual outcomes
// All writes go through Supabase RLS: users only touch their
// own events; records/knowledge/audit are admin-only; ARCHIE
// ingestion goes through the authenticated archie-ingestion
// edge function. No API keys exist in this code.
// =========================================================
import { supabase } from "@/lib/supabase";
import type { LearningEventInput } from "./types";
import {
  advanceLifecycle,
  checkPromotion,
  evaluateScopePromotion,
  isMathCapability,
  shouldProposeImprovement,
} from "./learning-engine";
import { sanitizeText } from "./sanitize";

// ---------------------------------------------------------
// Unified signal recording (one path for every source)
// ---------------------------------------------------------
export async function recordLearningEvent(
  event: LearningEventInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subjectRes = sanitizeText(event.subject);
  if (!subjectRes.value.trim()) {
    return { ok: false, error: "subject is required" };
  }
  const { data, error } = await supabase
    .from("frelux_learning_events")
    .insert({
      event_type: event.event_type,
      source: event.source,
      capability: event.capability,
      subject: subjectRes.value,
      ai_value:
        event.ai_value != null ? sanitizeText(event.ai_value).value : null,
      user_value:
        event.user_value != null ? sanitizeText(event.user_value).value : null,
      expected_value:
        event.expected_value != null
          ? sanitizeText(event.expected_value).value
          : null,
      actual_value:
        event.actual_value != null
          ? sanitizeText(event.actual_value).value
          : null,
      region: event.region ?? null,
      project_id: event.project_id ?? null,
      plan_document_id: event.plan_document_id ?? null,
      metadata: event.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ---------------------------------------------------------
// Gemini learning: AI Image Estimator corrections
// (IMAGE → GEMINI → EXTRACTION → VALIDATION → USER CORRECTION
//  → LEARNING EVENT)
// ---------------------------------------------------------
export async function recordExtractionCorrection(args: {
  field: string;
  aiValue: number | string;
  userValue: number | string;
  region?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await recordLearningEvent({
    event_type: "AI_EXTRACTION_CORRECTION",
    source: "GEMINI",
    capability: "image_estimation_input",
    subject: args.field,
    ai_value: String(args.aiValue),
    user_value: String(args.userValue),
    region: args.region,
    metadata: args.metadata,
  });
  if (!res.ok) return { ok: false, error: res.error };
  // Repeated verified errors may produce an improvement proposal
  // (DRAFT only, never a silent change to extraction logic).
  const { count } = await supabase
    .from("frelux_learning_events")
    .select("id", { count: "exact", head: true })
    .eq("capability", "image_estimation_input")
    .eq("subject", args.field);
  if (count != null && shouldProposeImprovement(count)) {
    const existing = await supabase
      .from("frelux_improvement_proposals")
      .select("id")
      .eq("capability", "image_estimation_input")
      .eq("status", "DRAFT")
      .limit(1);
    if ((existing.data?.length ?? 0) === 0) {
      const user = (await supabase.auth.getUser()).data.user;
      await supabase.from("frelux_improvement_proposals").insert({
        capability: "image_estimation_input",
        reason: `${count} recorded user corrections of Gemini-extracted '${args.field}' values suggest a systematic extraction bias. Review extraction prompts/validation for this field.`,
        evidence: [
          `correction_count=${count}`,
          `last_correction: ${args.aiValue} → ${args.userValue}`,
        ],
        expected_benefit:
          "Higher image-estimation accuracy for this field without touching deterministic calculators.",
        risk: "Low: prompt/validation refinement only. Extraction changes still require human review.",
        requires_engineering_review: false,
        status: "DRAFT",
        rollback_path:
          "Reject the proposal; no production change has been made.",
        proposed_by: user?.id ?? null,
      });
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------
// OpenAI learning: Live Chat signals
// ---------------------------------------------------------
const HONEST_MISSING_PATTERNS = [
  /no approved price/i,
  /price (is )?(not|n't) (available|known)/i,
  /insufficient data/i,
  /missing (information|data)/i,
  /configuration is unavailable/i,
  /not (yet )?configured/i,
  /cannot (verify|confirm)/i,
];

/** Detects when the live chat honestly reported missing data. */
export function classifyChatSignal(
  reply: string,
): "MISSING_INFO" | "RETRIEVAL_FAILURE" | "CHAT_SIGNAL" {
  for (const re of HONEST_MISSING_PATTERNS) {
    if (re.test(reply)) return "MISSING_INFO";
  }
  if (/no results|nothing found|could not find|no documents/i.test(reply)) {
    return "RETRIEVAL_FAILURE";
  }
  return "CHAT_SIGNAL";
}

export async function recordLiveChatSignal(args: {
  questionSummary: string;
  reply: string;
  region?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const type = classifyChatSignal(args.reply);
  if (type === "CHAT_SIGNAL") return { ok: true }; // success noise is not a learning signal
  return recordLearningEvent({
    event_type: type,
    source: "OPENAI",
    capability: "live_chat",
    subject: args.questionSummary.slice(0, 200),
    region: args.region,
    metadata: { reply_excerpt: args.reply.slice(0, 400) },
  }).then((r) => (r.ok ? { ok: true } : { ok: false, error: r.error }));
}

// ---------------------------------------------------------
// Actual project outcome learning (Phase 6.5 §11)
// ---------------------------------------------------------
export async function recordActualOutcome(args: {
  capability: string;
  subject: string;
  estimatedValue: number | string;
  actualValue: number | string;
  region?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; delta?: number; error?: string }> {
  const est = Number(args.estimatedValue);
  const act = Number(args.actualValue);
  const delta =
    Number.isFinite(est) && Number.isFinite(act) && est !== 0
      ? (act - est) / Math.abs(est)
      : undefined;
  const res = await recordLearningEvent({
    event_type: "ACTUAL_OUTCOME",
    source: "OUTCOME",
    capability: args.capability,
    subject: args.subject,
    expected_value: String(args.estimatedValue),
    actual_value: String(args.actualValue),
    region: args.region,
    project_id: args.projectId,
    metadata: { ...(args.metadata ?? {}), delta },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, delta };
}

// ---------------------------------------------------------
// ARCHIE ingestion (backend edge function, authenticated)
// ---------------------------------------------------------
export async function submitArchieReference(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; code?: string; message: string }> {
  const { data, error } = await supabase.functions.invoke<{
    accepted: boolean;
    code: string;
    message: string;
    flags?: string[];
  }>("archie-ingestion", { body: payload });
  if (error) return { ok: false, message: error.message };
  return {
    ok: data?.accepted ?? false,
    code: data?.code,
    message: data?.message ?? "No response",
  };
}

// ---------------------------------------------------------
// Admin review workflow (Human Review, Phase 6.5 §8)
// ---------------------------------------------------------
export async function fetchLearningRecords(
  statusFilter?: string,
): Promise<Array<Record<string, unknown>>> {
  let q = supabase
    .from("frelux_learning_records")
    .select("*")
    .order("created_date", { ascending: false })
    .limit(100);
  if (statusFilter && statusFilter !== "ALL")
    q = q.eq("lifecycle_status", statusFilter);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function fetchRecordAudit(
  recordId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from("frelux_learning_audit")
    .select("*")
    .eq("record_id", recordId)
    .order("created_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function audit(
  recordId: string,
  action: string,
  details: Record<string, unknown>,
) {
  const user = (await supabase.auth.getUser()).data.user;
  await supabase.from("frelux_learning_audit").insert({
    record_id: recordId,
    action,
    actor: user?.id ?? null,
    details,
  });
}

export async function advanceRecord(
  recordId: string,
  to: "CANDIDATE" | "VERIFYING" | "EVALUATING" | "READY_FOR_REVIEW",
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: rec } = await supabase
    .from("frelux_learning_records")
    .select("lifecycle_status")
    .eq("id", recordId)
    .single();
  const from = (rec?.lifecycle_status ??
    "") as import("./types").LearningLifecycle;
  const t = advanceLifecycle(from, to);
  if (!t.ok) return { ok: false, error: t.error };
  const { error } = await supabase
    .from("frelux_learning_records")
    .update({ lifecycle_status: to, updated_date: new Date().toISOString() })
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  await audit(recordId, "ADVANCED", { from, to, reason });
  return { ok: true };
}

export async function reviewRecord(args: {
  recordId: string;
  action: "APPROVE" | "REJECT" | "DEFER" | "REQUEST_VERIFICATION";
  reason: string;
  scopeExplicitlyApproved?: boolean;
  independentlyVerified?: boolean;
  engineeringReviewed?: boolean;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { data: rec } = await supabase
    .from("frelux_learning_records")
    .select("*")
    .eq("id", args.recordId)
    .single();
  if (!rec) return { ok: false, error: "Record not found." };
  const user = (await supabase.auth.getUser()).data.user;
  const capability = String(rec.capability ?? "");
  const proposedScope = String(
    rec.proposed_scope ?? "GLOBAL",
  ) as import("./types").KnowledgeScope;
  const lifecycle = String(
    rec.lifecycle_status ?? "CANDIDATE",
  ) as import("./types").LearningLifecycle;

  if (args.action === "REQUEST_VERIFICATION") {
    const t = advanceLifecycle(lifecycle, "VERIFYING");
    if (!t.ok) return { ok: false, error: t.error };
    await supabase
      .from("frelux_learning_records")
      .update({
        lifecycle_status: "VERIFYING",
        verification_status: "PENDING",
        updated_date: new Date().toISOString(),
      })
      .eq("id", args.recordId);
    await audit(args.recordId, "REQUEST_VERIFICATION", { reason: args.reason });
    return { ok: true, message: "Verification requested." };
  }

  if (args.action === "APPROVE") {
    const check = checkPromotion({
      lifecycle,
      capability,
      proposed_scope: proposedScope,
      target_scope: proposedScope,
      reviewer: user?.id ?? null,
      engineeringReviewed: args.engineeringReviewed,
      scopeExplicitlyApproved: args.scopeExplicitlyApproved,
      independentlyVerified: args.independentlyVerified,
    });
    if (!check.allowed) return { ok: false, error: check.reason };
    // Version snapshot BEFORE promotion (rollback point)
    await supabase.from("frelux_learning_versions").insert({
      record_id: args.recordId,
      version: 1,
      snapshot: rec,
      change_reason: `Approved: ${args.reason}`,
      reviewer: user?.id ?? null,
    });
    // Promote into the versioned Knowledge Layer, fully traceable.
    const { data: existing } = await supabase
      .from("frelux_knowledge_items")
      .select("version")
      .eq("record_id", args.recordId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;
    const { error: kErr } = await supabase
      .from("frelux_knowledge_items")
      .insert({
        record_id: args.recordId,
        capability,
        scope: proposedScope,
        scope_key: (rec.scope_key as string) ?? null,
        topic: rec.topic,
        content: {
          recommendation: rec.recommendation,
          conclusion: rec.conclusion,
          evidence: rec.evidence,
          assumptions: rec.assumptions,
          request_context: rec.request_context,
        },
        evidence_state: "AI_RECOMMENDATION",
        confidence: rec.confidence,
        version: nextVersion,
        status: "ACTIVE",
        change_reason: args.reason,
        created_by: rec.created_by ?? null,
        approved_by: user?.id ?? null,
        approved_date: new Date().toISOString(),
      });
    if (kErr)
      return {
        ok: false,
        error: `Knowledge promotion failed: ${kErr.message}`,
      };
    await supabase
      .from("frelux_learning_records")
      .update({
        lifecycle_status: "APPROVED",
        updated_date: new Date().toISOString(),
      })
      .eq("id", args.recordId);
    await audit(args.recordId, "APPROVED", {
      reason: args.reason,
      reviewer: user?.id ?? null,
      knowledge_version: nextVersion,
      requires_engineering_review: check.requiresEngineeringReview,
    });
    return {
      ok: true,
      message: `Approved and promoted (knowledge v${nextVersion}).`,
    };
  }

  // REJECT / DEFER
  const to = args.action === "REJECT" ? "REJECTED" : "DEFERRED";
  const t = advanceLifecycle(lifecycle, to);
  if (!t.ok) return { ok: false, error: t.error };
  await supabase
    .from("frelux_learning_records")
    .update({ lifecycle_status: to, updated_date: new Date().toISOString() })
    .eq("id", args.recordId);
  await audit(args.recordId, to, {
    reason: args.reason,
    reviewer: user?.id ?? null,
  });
  return {
    ok: true,
    message: args.action === "REJECT" ? "Rejected." : "Deferred.",
  };
}

export async function rollbackKnowledge(
  knowledgeItemId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: item } = await supabase
    .from("frelux_knowledge_items")
    .select("*")
    .eq("id", knowledgeItemId)
    .single();
  if (!item) return { ok: false, error: "Knowledge item not found." };
  const { error } = await supabase
    .from("frelux_knowledge_items")
    .update({
      status: "ROLLED_BACK",
      change_reason: `Rolled back: ${reason}`,
      updated_date: new Date().toISOString(),
    })
    .eq("id", knowledgeItemId);
  if (error) return { ok: false, error: error.message };
  await audit(String(item.record_id), "ROLLED_BACK", {
    knowledgeItemId,
    reason,
    previous_version: item.version,
  });
  return { ok: true };
}

/** Roll back all ACTIVE knowledge produced by one learning record. */
export async function rollbackKnowledgeForRecord(
  recordId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; rolledBack?: number }> {
  const { data: items, error } = await supabase
    .from("frelux_knowledge_items")
    .select("id")
    .eq("record_id", recordId)
    .eq("status", "ACTIVE");
  if (error) return { ok: false, error: error.message };
  let n = 0;
  for (const item of items ?? []) {
    const res = await rollbackKnowledge(String(item.id), reason);
    if (res.ok) n += 1;
  }
  await audit(recordId, "ROLLED_BACK", { reason, rolled_back: n });
  return { ok: true, rolledBack: n };
}

/** Admin helper: verify a scope promotion decision up front. */
export function explainScopePromotion(
  from: import("./types").KnowledgeScope,
  to: import("./types").KnowledgeScope,
  opts?: { explicitlyApproved?: boolean; independentlyVerified?: boolean },
): ReturnType<typeof evaluateScopePromotion> {
  return evaluateScopePromotion(from, to, opts);
}

/** Admin helper: does this capability touch deterministic math? */
export function capabilityIsMath(capability: string): boolean {
  return isMathCapability(capability);
}
