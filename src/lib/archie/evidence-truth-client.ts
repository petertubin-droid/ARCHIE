// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — ADMIN CLIENT (§16, §27)
//
// Client helpers for the Evidence & Truth admin surface:
// READ-ONLY over archie_claims, archie_evidence_records,
// archie_claim_evidence, archie_claim_relations and
// archie_evidence_conflicts (admin-only reads enforced by
// RLS via public.is_current_user_admin()). Writes happen
// ONLY server-side through ARCHIE edge functions — this
// page never mutates evidence state: verification,
// classification and conflict resolution are the engine's
// honest processes, not manual overrides.
//
// Every number shown on the page comes from the measured
// archie_evidence_health() RPC or a real table read — no
// estimates, no fabricated data.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export type VerificationState =
  | "VERIFIED"
  | "SUPPORTED"
  | "USER_PROVIDED"
  | "INFERRED"
  | "CONFLICTED"
  | "OUTDATED"
  | "UNVERIFIED"
  | "UNKNOWN";

export const VERIFICATION_STATES: VerificationState[] = [
  "VERIFIED",
  "SUPPORTED",
  "USER_PROVIDED",
  "INFERRED",
  "CONFLICTED",
  "OUTDATED",
  "UNVERIFIED",
  "UNKNOWN",
];

export interface EvidenceClaimRow {
  id: string;
  claim_key: string;
  subject: string;
  predicate: string;
  object_value: string | null;
  claim_type: string;
  statement: string;
  domain: string;
  geo_scope: string | null;
  subject_concept_key: string | null;
  user_provided: boolean;
  inferred: boolean;
  directly_observed: boolean;
  question: boolean;
  verification_state: VerificationState;
  conflict_state: string;
  source_availability: string;
  applicable_from: string | null;
  applicable_until: string | null;
  retrieved_at: string | null;
  version: number;
  history: Array<Record<string, unknown>>;
  created_date: string;
  updated_date: string;
}

export interface EvidenceRecordRow {
  id: string;
  evidence_key: string;
  evidence_type: string;
  source_type: string;
  source_identity: string;
  source_ref: Record<string, unknown> | null;
  origin_subsystem: string;
  observed_by_system: boolean;
  content_label: string;
  transformation: string | null;
  provenance_chain: Array<{
    stage: string;
    detail: string;
    subsystem: string;
    at: string;
    transformation?: string;
  }>;
  reliability: { tier?: string; basis?: string } | null;
  domain: string | null;
  version: string | null;
  retrieved_at: string | null;
  created_date: string;
}

export interface ClaimEvidenceLinkRow {
  claim_id: string;
  evidence_id: string;
  relation: "SUPPORTS" | "CONTRADICTS";
  note: string | null;
}

export interface EvidenceConflictRow {
  id: string;
  claim_a_id: string;
  claim_b_id: string;
  kind: string;
  explanation_status: "ESTABLISHED" | "HYPOTHESIS" | "UNEXPLAINED";
  explanation: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export interface EvidenceHealth {
  total_claims: number;
  verified_claims: number;
  supported_claims: number;
  inferred_claims: number;
  user_provided_claims: number;
  conflicted_claims: number;
  outdated_claims: number;
  unverified_claims: number;
  unknown_claims: number;
  evidence_records: number;
  evidence_sources: number;
  provenance_records: number;
  claim_evidence_links: number;
  conflicts_total: number;
  conflicts_unresolved: number;
  claims_without_evidence: number;
  orphaned_evidence: number;
  inferred_marked_as_facts: number;
  user_provided_marked_verified: number;
  claims_missing_retrieved_at: number;
  stale_claims: number;
  conflicts_without_explanation: number;
  sample_claims_without_evidence: Array<{
    id: string;
    claim_key: string;
    statement: string;
    domain: string;
  }>;
}

/** Measured evidence-health dashboard (server-computed). */
export async function fetchEvidenceHealth(): Promise<EvidenceHealth> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("archie_evidence_health");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("evidence health unavailable");
  return data as EvidenceHealth;
}

/** Bounded claims list with an optional state filter. */
export async function listEvidenceClaims(opts: {
  state?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: EvidenceClaimRow[]; total: number }> {
  const supabase = await getSupabase();
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  let query = supabase
    .from("archie_claims")
    .select("*", { count: "exact" })
    .order("updated_date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (opts.state) query = query.eq("verification_state", opts.state);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []) as EvidenceClaimRow[],
    total: count ?? 0,
  };
}

/** The full provenance view for one claim: evidence (with
 *  chains), premise claims and related conflicts. */
export async function fetchClaimProvenance(claimId: string): Promise<{
  claim: EvidenceClaimRow;
  evidence: Array<{
    record: EvidenceRecordRow;
    relation: string;
    note: string | null;
  }>;
  premises: Array<{ claim: EvidenceClaimRow; note: string | null }>;
  conflicts: EvidenceConflictRow[];
}> {
  const supabase = await getSupabase();
  const claimRes = await supabase
    .from("archie_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (claimRes.error || !claimRes.data) {
    throw new Error(claimRes.error?.message ?? "claim not found");
  }
  const claim = claimRes.data as EvidenceClaimRow;

  const [links, premiseLinks, conflictRows] = await Promise.all([
    supabase
      .from("archie_claim_evidence")
      .select("*")
      .eq("claim_id", claimId)
      .limit(16),
    supabase
      .from("archie_claim_relations")
      .select("claim_b_id, note")
      .eq("claim_a_id", claimId)
      .eq("relation_type", "PREMISE_OF")
      .limit(8),
    supabase
      .from("archie_evidence_conflicts")
      .select("*")
      .or(`claim_a_id.eq.${claimId},claim_b_id.eq.${claimId}`)
      .is("resolved_at", null)
      .limit(10),
  ]);

  const evidence: Array<{
    record: EvidenceRecordRow;
    relation: string;
    note: string | null;
  }> = [];
  for (const link of (links.data ?? []) as ClaimEvidenceLinkRow[]) {
    const res = await supabase
      .from("archie_evidence_records")
      .select("*")
      .eq("id", link.evidence_id)
      .maybeSingle();
    if (res.data) {
      evidence.push({
        record: res.data as EvidenceRecordRow,
        relation: link.relation,
        note: link.note,
      });
    }
  }

  const premises: Array<{ claim: EvidenceClaimRow; note: string | null }> = [];
  for (const pl of (premiseLinks.data ?? []) as Array<{
    claim_b_id: string;
    note: string | null;
  }>) {
    const res = await supabase
      .from("archie_claims")
      .select("*")
      .eq("id", pl.claim_b_id)
      .maybeSingle();
    if (res.data) {
      premises.push({ claim: res.data as EvidenceClaimRow, note: pl.note });
    }
  }

  return {
    claim,
    evidence,
    premises,
    conflicts: (conflictRows.data ?? []) as EvidenceConflictRow[],
  };
}

/** Unresolved conflict records with both claims loaded. */
export async function listUnresolvedConflicts(): Promise<
  Array<{
    conflict: EvidenceConflictRow;
    claimA: EvidenceClaimRow | null;
    claimB: EvidenceClaimRow | null;
  }>
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_evidence_conflicts")
    .select("*")
    .is("resolved_at", null)
    .order("detected_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  const out: Array<{
    conflict: EvidenceConflictRow;
    claimA: EvidenceClaimRow | null;
    claimB: EvidenceClaimRow | null;
  }> = [];
  for (const conflict of (data ?? []) as EvidenceConflictRow[]) {
    const [a, b] = await Promise.all([
      supabase
        .from("archie_claims")
        .select("*")
        .eq("id", conflict.claim_a_id)
        .maybeSingle(),
      supabase
        .from("archie_claims")
        .select("*")
        .eq("id", conflict.claim_b_id)
        .maybeSingle(),
    ]);
    out.push({
      conflict,
      claimA: (a.data as EvidenceClaimRow) ?? null,
      claimB: (b.data as EvidenceClaimRow) ?? null,
    });
  }
  return out;
}

/** Visual styles per verification state (premium, calm). */
export const STATE_STYLES: Record<VerificationState, string> = {
  VERIFIED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  SUPPORTED: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  USER_PROVIDED: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  INFERRED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
  CONFLICTED: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  OUTDATED: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  UNVERIFIED: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  UNKNOWN: "bg-slate-400/10 text-slate-500 border-slate-400/30",
};
