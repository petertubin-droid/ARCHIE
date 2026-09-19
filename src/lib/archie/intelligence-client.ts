// =========================================================
// FRELUX PHASE 8 P3, ARCHIE INTELLIGENCE CLIENT
//
// Browser-facing persistence for the Phase 8 P3 layer:
// knowledge links, contradictions, domain gaps, professional
// profiles and change requests. Every write is RLS-shaped
// (admin-only for governance tables, exactly like the
// Phase 6.5 learning engine). Pure pipeline guards from the
// logic modules are applied BEFORE any write, so an invalid
// transition can never even reach the database.
// =========================================================

import { supabase } from "@/lib/supabase";
import type { KnowledgeLink, ContradictionRecord, DomainGap } from "./knowledge-graph";
import type { ProfessionalProfile } from "./professional-registry";
import type { ChangeRequest } from "./change-pipeline";
import { sanitizeText } from "@/lib/learning/sanitize";

export async function persistKnowledgeLink(link: KnowledgeLink): Promise<
  { ok: true; id?: string } | { ok: false; error: string }
> {
  const reason = sanitizeText(link.reason).value;
  if (!reason.trim()) {
    return { ok: false, error: "A link requires a provenance reason" };
  }
  const { data, error } = await supabase
    .from("frelux_archie_knowledge_links")
    .insert({
      from_item: link.from_id,
      to_item: link.to_id,
      relation: link.relation,
      created_by: link.created_by,
      reason,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function persistContradictions(
  records: ContradictionRecord[],
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  if (records.length === 0) return { ok: true, inserted: 0 };
  const { error } = await supabase.from("frelux_archie_contradictions").insert(
    records.map((r) => ({
      item_a: r.item_a_id,
      item_b: r.item_b_id,
      topic: r.topic,
      domain: r.domain,
      detail: sanitizeText(r.detail).value,
      status: r.status,
      detected_at: r.detected_at,
    })),
  );
  if (error) return { ok: false, inserted: 0, error: error.message };
  return { ok: true, inserted: records.length };
}

export async function persistDomainGaps(
  gaps: DomainGap[],
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  if (gaps.length === 0) return { ok: true, inserted: 0 };
  const { error } = await supabase.from("frelux_archie_domain_gaps").insert(
    gaps.map((g) => ({
      domain: g.domain,
      gap_type: g.gap_type,
      summary: sanitizeText(g.summary).value,
      status: "OPEN" as const,
    })),
  );
  if (error) return { ok: false, inserted: 0, error: error.message };
  return { ok: true, inserted: gaps.length };
}

export async function upsertProfessionalProfile(
  profile: Omit<ProfessionalProfile, "id" | "created_at"> & {
    id?: string;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("frelux_professional_profiles")
    .upsert(
      {
        ...(profile.id ? { id: profile.id } : {}),
        role: profile.role,
        display_name: sanitizeText(profile.display_name).value,
        verification_state: profile.verification_state,
        verified_by: profile.verified_by ?? null,
        verified_at: profile.verified_at ?? null,
        credential_refs: profile.credential_refs,
        regional_scope: profile.regional_scope,
        active: profile.active,
      },
      { onConflict: "id" },
    )
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function createChangeRequestRow(
  change: ChangeRequest,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("frelux_archie_change_requests")
    .insert({
      id: change.id,
      title: sanitizeText(change.title).value,
      areas: change.areas,
      stage: change.stage,
      created_by: change.created_by,
      requires_engineering_review: change.requires_engineering_review,
      flags: change.flags,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function updateChangeRequestRow(
  change: ChangeRequest,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_archie_change_requests")
    .update({
      stage: change.stage,
      understanding_summary: change.understanding_summary ?? null,
      plan: change.plan ?? null,
      implementation_summary: change.implementation_summary ?? null,
      test_evidence: change.test_evidence ?? null,
      review_signoff_by: change.review_signoff_by ?? null,
      rollback_plan: change.rollback_plan ?? null,
      flags: change.flags,
      updated_date: new Date().toISOString(),
    })
    .eq("id", change.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
