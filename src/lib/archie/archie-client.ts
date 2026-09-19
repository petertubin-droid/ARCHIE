// =========================================================
// FRELUX PHASE 8, ARCHIE CLIENT
//
// Browser-facing persistence for the ARCHIE Training interface:
//   * domain registry (read-only for non-admins)
//   * contributor profile
//   * multimodal ingestions (+ private archie-media storage)
//   * extraction via the archie-extract edge function
//   * candidate promotion THROUGH the Phase 6.5 machinery
//     (learning record → knowledge item → version → audit)
//
// All writes are guarded by Supabase RLS. No raw keys, no
// secrets. ARCHIE never approves its own learning, approval
// is a human admin action enforced by RLS + governance.
// =========================================================
import { supabase, getFunctionErrorMessage } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { sanitizeText, hashContent } from "@/lib/learning/sanitize";
import type {
  ArchieContributor,
  ArchieDomain,
  ArchieExtraction,
  ArchieIngestion,
  ArchieTrainingInput,
  ArchieCandidate,
} from "./types";
import { runArchiePipeline } from "./ingest";
import { checkArchiePromotion } from "./governance";

// ---------------------------------------------------------
// Domain registry (production source of truth)
// ---------------------------------------------------------
export async function fetchArchieDomains(): Promise<ArchieDomain[]> {
  const { data, error } = await supabase
    .from("frelux_archie_domains")
    .select("key,label,description,is_core,risk_class,active")
    .eq("active", true)
    .order("is_core", { ascending: false })
    .order("label");
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieDomain[];
}

// ---------------------------------------------------------
// Contributor profile, falls back to an implicit admin
// profile for platform admins not yet in the registry.
// ---------------------------------------------------------
export async function fetchMyContributor(
  isAdmin: boolean,
  userId: string,
  displayName: string,
): Promise<ArchieContributor> {
  const { data } = await supabase
    .from("frelux_archie_contributors")
    .select("user_id,display_name,role,allowed_domains,must_review,active")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as ArchieContributor;
  return {
    user_id: userId,
    display_name: displayName,
    role: isAdmin ? "ARCHIE_ADMIN" : "OBSERVER",
    allowed_domains: [],
    must_review: true,
    active: true,
  };
}

// ---------------------------------------------------------
// Media upload, private archie-media bucket, per-user folder
// ---------------------------------------------------------
export async function uploadTrainingMedia(
  userId: string,
  file: File,
): Promise<{ ok: boolean; mediaUri?: string; error?: string }> {
  if (file.size > 100 * 1024 * 1024) {
    return { ok: false, error: "Media must be under 100 MB" };
  }
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${userId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("archie-media")
    .upload(path, file, { upsert: false });
  // FIX 63: surface the real error (see extractViaArchie).
  if (error) {
    const message =
      error instanceof FunctionsHttpError
        ? await getFunctionErrorMessage(error)
        : error.message;
    return { ok: false, error: message };
  }
  return { ok: true, mediaUri: path };
}

// ---------------------------------------------------------
// EXTRACT/ANALYZE via the archie-extract edge function.
// The function routes the modality to the configured provider
// (external FRELUX fallback providers) and returns the
// ArchieExtraction contract. Media is passed as a signed URL
// readable only by the service role.
// ---------------------------------------------------------
export async function extractViaArchie(
  input: Pick<
    ArchieTrainingInput,
    "input_type" | "text" | "media_uri" | "source_ref" | "domain" | "region"
  >,
): Promise<{ ok: boolean; extraction?: ArchieExtraction; error?: string }> {
  const { data, error } = await supabase.functions.invoke("archie-extract", {
    body: {
      input_type: input.input_type,
      text: input.text ?? null,
      media_uri: input.media_uri ?? null,
      source_ref: input.source_ref ?? null,
      domain: input.domain,
      region: input.region ?? null,
    },
  });
  // FIX 63 (2026-09-15, live E2E): the remote-bridge error carries the
  // parsed provider message in `message`, but a raw supabase-js
  // FunctionsHttpError hides the real reason in `error.context` and its
  // `message` is the useless generic "Edge Function returned a non-2xx
  // status code" — which is exactly what the live owner saw instead of
  // the actual 403 reason. Handle both shapes.
  if (error) {
    const message =
      error instanceof FunctionsHttpError
        ? await getFunctionErrorMessage(error)
        : error.message;
    return { ok: false, error: message };
  }
  if (!data?.ok || !data.extraction) {
    return { ok: false, error: data?.error ?? "Extraction failed" };
  }
  return { ok: true, extraction: data.extraction as ArchieExtraction };
}

// ---------------------------------------------------------
// Create an ingestion: INPUT → EXTRACT → … → AWAITING_APPROVAL
// The pipeline NEVER auto-promotes; it persists the extraction
// and candidates, then waits for human approval.
// ---------------------------------------------------------
export async function createArchieIngestion(
  input: ArchieTrainingInput,
): Promise<{
  ok: boolean;
  ingestionId?: string;
  state?: string;
  candidates?: ArchieCandidate[];
  flags?: string[];
  error?: string;
}> {
  const extractionRes = await extractViaArchie(input);
  if (!extractionRes.ok || !extractionRes.extraction) {
    return { ok: false, error: extractionRes.error };
  }

  const result = runArchiePipeline(input, extractionRes.extraction);
  if (result.state === "REJECTED" && result.candidates.length === 0) {
    return {
      ok: false,
      error: "No valid knowledge candidates were produced",
      flags: result.flags,
    };
  }

  const sanitizedText = input.text ? sanitizeText(input.text).value : null;
  const { data, error } = await supabase
    .from("frelux_archie_ingestions")
    .insert({
      input_type: input.input_type,
      title: sanitizeText(input.title).value,
      domain: input.domain,
      region: input.region ?? null,
      media_uri: input.media_uri ?? null,
      source_ref: input.source_ref ?? null,
      raw_text: sanitizedText,
      pipeline_state: result.state,
      extraction: extractionRes.extraction,
      flags: result.flags,
      candidate_count: result.candidates.length,
    })
    .select("id")
    .single();
  // FIX 63: surface the real error (see extractViaArchie).
  if (error) {
    const message =
      error instanceof FunctionsHttpError
        ? await getFunctionErrorMessage(error)
        : error.message;
    return { ok: false, error: message };
  }

  return {
    ok: true,
    ingestionId: data.id,
    state: result.state,
    candidates: result.candidates,
    flags: result.flags,
  };
}

// ---------------------------------------------------------
// List ingestions (admin: all; contributor: own, RLS)
// ---------------------------------------------------------
export async function fetchIngestions(
  opts: { state?: string; limit?: number } = {},
): Promise<ArchieIngestion[]> {
  let q = supabase
    .from("frelux_archie_ingestions")
    .select("*")
    .order("created_date", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.state) q = q.eq("pipeline_state", opts.state);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieIngestion[];
}

// ---------------------------------------------------------
// HUMAN APPROVAL: an admin approves candidates from an
// ingestion. Each candidate becomes a learning record +
// versioned knowledge item via the Phase 6.5 machinery:
// evidence_state NEVER upgrades silently, the candidate keeps
// its born state unless the reviewer explicitly confirms, in
// which case the state moves through the governed conversion
// (see governance.convertEvidenceState).
// ---------------------------------------------------------
export async function approveIngestionCandidates(args: {
  ingestionId: string;
  candidates: ArchieCandidate[];
  reviewerRole: ArchieContributor["role"];
  hasEngineeringReview?: boolean;
}): Promise<{ ok: boolean; approved?: number; error?: string }> {
  const { ingestionId, candidates, reviewerRole } = args;
  let approved = 0;
  const seenHashes = new Set<string>();

  for (const c of candidates) {
    const gate = checkArchiePromotion({
      candidate: c,
      actorRole: reviewerRole,
      actorIsHuman: true,
      hasEngineeringReview: args.hasEngineeringReview,
    });
    if (!gate.ok) {
      return { ok: false, error: `${c.topic.slice(0, 60)}: ${gate.error}` };
    }
    const contentHash = hashContent([
      c.topic,
      JSON.stringify(c.content),
      c.domain,
      c.region ?? "",
      c.evidence_state,
    ]);
    if (seenHashes.has(contentHash)) continue;
    seenHashes.add(contentHash);

    // 1) Learning record (Phase 6.5 shape, admin-only via RLS)
    const rec = await supabase
      .from("frelux_learning_records")
      .insert({
        source: c.provenance.input_type === "SOURCE_CODE" ? "ARCHIE" : "ARCHIE",
        source_type: `PHASE8_${c.provenance.input_type}`,
        topic: sanitizeText(c.topic).value,
        capability: c.domain,
        evidence: c.evidence,
        cited_sources: c.cited_sources,
        assumptions: c.assumptions,
        proposed_scope: c.proposed_scope,
        scope_key: c.scope_key ?? null,
        region: c.region ?? null,
        confidence: c.confidence,
        provenance: c.provenance,
        content_hash: contentHash,
        payload_size: JSON.stringify(c.content).length,
      })
      .select("id")
      .single();
    if (rec.error) return { ok: false, error: rec.error.message };

    // 2) Knowledge item, born with the candidate's evidence
    //    state; reaches READY_FOR_REVIEW through the standard
    //    review flow (this insert is the CANDIDATE stage).
    const ki = await supabase
      .from("frelux_knowledge_items")
      .insert({
        record_id: rec.data.id,
        capability: c.domain,
        scope: c.proposed_scope,
        scope_key: c.scope_key ?? null,
        topic: sanitizeText(c.topic).value,
        content: c.content,
        evidence_state: c.evidence_state,
        confidence: c.confidence,
        domain: c.domain,
        region: c.region ?? null,
        knowledge_type: c.knowledge_type,
        ingestion_id: ingestionId,
        status: "ACTIVE",
        change_reason: "ARCHIE training, human approved",
      })
      .select("id, version")
      .single();
    if (ki.error) return { ok: false, error: ki.error.message };
    approved += 1;
  }

  const upd = await supabase
    .from("frelux_archie_ingestions")
    .update({ pipeline_state: "APPROVED" })
    .eq("id", ingestionId);
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true, approved };
}

// ---------------------------------------------------------
// Reject an ingestion (human admin action)
// ---------------------------------------------------------
export async function rejectIngestion(
  ingestionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_archie_ingestions")
    .update({ pipeline_state: "REJECTED" })
    .eq("id", ingestionId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
