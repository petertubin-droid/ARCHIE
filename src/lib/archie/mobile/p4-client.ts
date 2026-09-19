// =========================================================
// FRELUX PHASE 8 P4, SUBSCRIBER CLIENT (PERSISTENCE)
//
// RLS-shaped writes for the Phase 8 P4 tables. Every query
// is user-scoped (user_id = session user), the database
// enforces isolation even if a caller forgets a filter.
// Pipeline guards from the pure modules run BEFORE any write.
// =========================================================

import { supabase } from "@/lib/supabase";
import type {
  TrustedDevice,
  DeviceDataConsent,
  MobileLearning,
  SubscriberContribution,
} from "./p4-types";
import { sanitizeText } from "@/lib/learning/sanitize";
import { recordSecurityEvent } from "./security-events";

// ---------------------------------------------------------
// Trusted devices
// ---------------------------------------------------------

export async function upsertTrustedDevice(device: TrustedDevice): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase
    .from("frelux_archie_trusted_devices")
    .upsert(
      {
        id: device.id,
        user_id: device.user_id,
        device_name: sanitizeText(device.device_name).value,
        fingerprint: device.fingerprint,
        enrollment_state: device.enrollment_state,
        security_status: device.security_status,
        token_digest: device.token_digest,
        token_rotated_at: device.token_rotated_at,
        permission_set: device.permission_set,
        revoked_at: device.revoked_at,
      },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchTrustedDevices(userId: string): Promise<TrustedDevice[]> {
  const { data, error } = await supabase
    .from("frelux_archie_trusted_devices")
    .select("*")
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrustedDevice[];
}

// ---------------------------------------------------------
// Device data consents
// ---------------------------------------------------------

export async function persistDataConsent(consent: DeviceDataConsent): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase
    .from("frelux_archie_device_data_consents")
    .upsert(
      {
        user_id: consent.user_id,
        device_id: consent.device_id,
        category: consent.category,
        granted: consent.granted,
        explanation_shown: consent.explanation_shown,
        granted_at: consent.granted_at,
        revoked_at: consent.revoked_at,
      },
      { onConflict: "device_id,category" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchDataConsents(userId: string): Promise<DeviceDataConsent[]> {
  const { data, error } = await supabase
    .from("frelux_archie_device_data_consents")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as DeviceDataConsent[];
}

// ---------------------------------------------------------
// Mobile learnings
// ---------------------------------------------------------

export async function persistMobileLearning(
  learning: MobileLearning,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("frelux_archie_mobile_learnings")
    .upsert(
      {
        id: learning.id,
        user_id: learning.user_id,
        device_id: learning.device_id,
        category: learning.category,
        pipeline_state: learning.pipeline_state,
        shown_summary: learning.shown_summary,
        user_confirmed: learning.user_confirmed,
        scope: learning.scope,
        learned: learning.learned,
        flags: learning.flags,
        updated_date: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchMobileLearnings(
  userId: string,
): Promise<MobileLearning[]> {
  const { data, error } = await supabase
    .from("frelux_archie_mobile_learnings")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MobileLearning[];
}

/** Delete eligible personal data (deletion eligibility is
 *  decided by privacy-controls.deleteEligibility first). */
export async function deleteMobileLearning(
  userId: string,
  learningId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_archie_mobile_learnings")
    .delete()
    .eq("id", learningId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------
// Contributions
// ---------------------------------------------------------

export async function persistContribution(
  contribution: SubscriberContribution,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("frelux_archie_contributions")
    .upsert(
      {
        id: contribution.id,
        user_id: contribution.user_id,
        device_id: contribution.device_id,
        source_type: contribution.source_type,
        topic: sanitizeText(contribution.topic).value,
        content: contribution.content,
        project_ref: contribution.project_ref,
        property_ref: contribution.property_ref,
        country_region: contribution.country_region,
        evidence: contribution.evidence,
        provenance: contribution.provenance,
        confidence: contribution.confidence,
        consent_status: contribution.consent_status,
        scope: contribution.scope,
        verification_state: contribution.verification_state,
        evaluation_state: contribution.evaluation_state,
        version: contribution.version,
        approval_history: contribution.approval_history,
        withdrawn: contribution.withdrawn,
        withdrawn_at: contribution.withdrawn_at,
        updated_date: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchMyContributions(
  userId: string,
): Promise<SubscriberContribution[]> {
  const { data, error } = await supabase
    .from("frelux_archie_contributions")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriberContribution[];
}

// ---------------------------------------------------------
// Security integration (Phase 8b events)
// ---------------------------------------------------------

/** Record a P4 security event on the existing 8b event feed:
 *  forbidden-category requests, suspicious devices, stolen
 *  device responses. */
export async function recordP4SecurityEvent(
  userId: string,
  event: {
    kind:
      | "SUSPICIOUS_DEVICE_DETECTED"
      | "FORBIDDEN_CONSENT_REQUESTED"
      | "DEVICE_TOKEN_ROTATED"
      | "TRUSTED_DEVICE_REVOKED"
      | "DATA_CONSENT_REVOKED";
    severity: "info" | "warning" | "critical";
    message: string;
  },
): Promise<void> {
  await recordSecurityEvent(userId, {
    kind: event.kind,
    severity: event.severity,
    message: event.message,
  });
}
