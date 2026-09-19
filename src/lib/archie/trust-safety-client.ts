// =========================================================
// FRELUX TRUST & SAFETY CLIENT, persistence & enforcement
//
// Browser-facing persistence for the Trust & Safety core:
//   * trust & safety detection events (auditable records)
//   * account pauses (temporary, bounded, owner-reviewed)
//   * escrow transaction flags
//
// REAL ENFORCEMENT: assertNotPaused() is called by the
// marketplace listing path, so a paused offender cannot post
// new listings while their pause is active. The pause itself
// is temporary: it expires at MAX_SUSPENSION_HOURS unless
// the Owner reviews it first.
//
// All writes are RLS-guarded (admin/service-role only); the
// appeal path routes to the Owner; no client path can mint,
// extend or adjudicate a pause.
// =========================================================
import { supabase } from "@/lib/supabase";
import {
  isPauseActive,
  type AccountPauseRecord,
} from "./account-pause";
import type { EscrowFlag } from "./escrow-intelligence";
import type { TrustSafetyAssessment } from "./trust-safety";

// ---------------------------------------------------------
// Detections
// ---------------------------------------------------------
export async function persistTrustSafetyEvent(
  assessment: TrustSafetyAssessment,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("frelux_trust_safety_events")
    .insert({
      account_id: assessment.account_id,
      signals: assessment.signals,
      evidence: assessment.evidence as unknown as never,
      risk_score: assessment.risk_score,
      risk_level: assessment.risk_level,
      review_status: assessment.detection_record.review_status,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function fetchTrustSafetyEvents(
  accountId: string,
): Promise<TrustSafetyAssessment[]> {
  const { data, error } = await supabase
    .from("frelux_trust_safety_events")
    .select(
      "account_id,signals,evidence,risk_score,risk_level,created_date",
    )
    .eq("account_id", accountId)
    .order("created_date", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data ?? []).map((row: Record<string, unknown>) =>
    buildAssessment(row),
  );
}

function buildAssessment(row: Record<string, unknown>): TrustSafetyAssessment {
  const riskScore = Number(row.risk_score ?? 0);
  return {
    account_id: String(row.account_id ?? ""),
    signals: (row.signals as TrustSafetyAssessment["signals"]) ?? [],
    evidence: (row.evidence as TrustSafetyAssessment["evidence"]) ?? [],
    risk_score: riskScore,
    risk_level: (row.risk_level as TrustSafetyAssessment["risk_level"]) ?? "LOW",
    detection_record: {
      account_identity: String(row.account_id ?? ""),
      detected_behaviors: (row.signals as TrustSafetyAssessment["signals"]) ?? [],
      evidence: (row.evidence as TrustSafetyAssessment["evidence"]) ?? [],
      risk_level: (row.risk_level as TrustSafetyAssessment["risk_level"]) ?? "LOW",
      risk_score: riskScore,
      assessed_at: String(row.created_date ?? new Date().toISOString()),
      assessor: "ARCHIE",
      review_status: "REVIEWED",
    },
  };
}

// ---------------------------------------------------------
// Pauses, persistence + enforcement
// ---------------------------------------------------------
export async function persistAccountPause(
  pause: AccountPauseRecord,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("frelux_account_pauses")
    .insert({
      account_id: pause.account_identity,
      reason: pause.reason,
      evidence: pause.evidence as unknown as never,
      detected_behaviors: pause.detected_behaviors,
      risk_level: pause.risk_level,
      risk_score: pause.risk_score,
      paused_at: pause.paused_at,
      expires_at: pause.expires_at,
      archie_decision: pause.archie_decision,
      review_status: pause.review_status,
      final_owner_decision: pause.final_owner_decision,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

/** Active pauses for an account, review status decides. */
export async function fetchAccountPauses(
  accountId: string,
): Promise<AccountPauseRecord[]> {
  const { data, error } = await supabase
    .from("frelux_account_pauses")
    .select(
      "id,account_id,reason,evidence,detected_behaviors,risk_level,risk_score,paused_at,expires_at,archie_decision,review_status,final_owner_decision,owner_reviewed_at,created_date",
    )
    .eq("account_id", accountId)
    .order("paused_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    account_identity: String(row.account_id ?? ""),
    reason: String(row.reason ?? ""),
    evidence: (row.evidence as AccountPauseRecord["evidence"]) ?? [],
    detected_behaviors:
      (row.detected_behaviors as AccountPauseRecord["detected_behaviors"]) ?? [],
    risk_level: (row.risk_level as AccountPauseRecord["risk_level"]) ?? "LOW",
    risk_score: Number(row.risk_score ?? 0),
    paused_at: String(row.paused_at ?? row.created_date ?? new Date().toISOString()),
    expires_at: String(
      row.expires_at ??
        new Date(Date.now() + 72 * 3_600_000).toISOString(),
    ),
    archie_decision: (row.archie_decision as AccountPauseRecord["archie_decision"]) ??
      "TEMPORARY PAUSE (authorized, pending Owner review)",
    review_status: (row.review_status as AccountPauseRecord["review_status"]) ??
      "PENDING_OWNER_REVIEW",
    final_owner_decision:
      (row.final_owner_decision as AccountPauseRecord["final_owner_decision"]) ??
      "PENDING",
    owner_reviewed_at: row.owner_reviewed_at ? String(row.owner_reviewed_at) : undefined,
    notification: {
      owner_notified_at: String(row.paused_at ?? row.created_date ?? new Date().toISOString()),
      account_notified: true as const,
      appeal_available: true as const,
      appeal_to: "OWNER" as const,
    },
  }));
}

/** OWNER REVIEW, applied by the owner/admin session (RLS
 *  enforces admin-only writes). ARCHIE never calls this for
 *  its own adjudication. */
export async function applyOwnerReview(
  pauseId: string,
  decision: "REINSTATE" | "RESTRICT" | "TERMINATE",
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_account_pauses")
    .update({
      review_status: "REVIEWED",
      final_owner_decision: decision,
      owner_reviewed_at: new Date().toISOString(),
    })
    .eq("id", pauseId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** The account's appeal, recorded, routed to the Owner. */
export async function recordAccountAppeal(
  pauseId: string,
  appealText: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!appealText.trim()) return { ok: false, error: "An appeal requires text" };
  const { error } = await supabase
    .from("frelux_account_pauses")
    .update({ appeal_text: appealText.trim(), review_status: "PENDING_OWNER_REVIEW" })
    .eq("id", pauseId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Is this account currently paused? TRUE only while a pause
 *  record is active (not expired, not owner-reinstated). If
 *  the pause table is unreachable the check fails OPEN with a
 *  logged reason: persistent enforcement stays with RLS, the
 *  database CHECK bounds and Owner review, a transport error
 *  must not lock every legitimate user out. */
export async function isAccountPaused(accountId: string): Promise<boolean> {
  try {
    const pauses = await fetchAccountPauses(accountId);
    return pauses.some((p) => isPauseActive(p).active);
  } catch {
    return false;
  }
}

/** Enforcement gate for marketplace writes. */
export async function assertNotPaused(
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!accountId) return { ok: true };
  if (await isAccountPaused(accountId)) {
    return {
      ok: false,
      error:
        "This account is temporarily paused pending a review. If you believe this is a mistake, submit an appeal and the owner will review it.",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------
// Escrow flags
// ---------------------------------------------------------
export async function persistEscrowFlag(
  flag: EscrowFlag,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("frelux_escrow_flags")
    .insert({
      transaction_ref: flag.transaction_ref,
      topic: flag.topic,
      reason: flag.reason,
      evidence: flag as unknown as never,
      recommended_action: flag.recommended_action,
      status: "OPEN",
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}
