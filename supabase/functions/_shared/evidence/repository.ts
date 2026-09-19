// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — REPOSITORY
//
// Supabase persistence for claims, evidence, links and
// conflicts (tables: archie_claims, archie_evidence_records,
// archie_claim_evidence, archie_claim_relations,
// archie_evidence_conflicts — migration
// 20260920120000_archie_evidence_truth_engine.sql).
//
// Conventions (same contract as the other layers):
//   * every retrieval is BOUNDED (limit caps) — never an
//     unbounded scan on the live chat path;
//   * upserts keyed by the deterministic claim/evidence keys
//     → repeated turns deduplicate instead of duplicating;
//   * claim content changes VERSION the claim and append to
//     history — the historical record is never silently
//     overwritten (spec §23);
//   * writes go through the service-role client (RLS: only
//     the service role may write);
//   * errors are returned honestly, never swallowed into
//     fake data.
// =========================================================

import { claimKey, evidenceKey } from "./keys.ts";
import {
  draftToRecord,
  evidenceDraftToRecord,
  isValueConflict,
} from "./evaluate.ts";
import { chainForInference } from "./provenance.ts";
import type {
  ClaimDraft,
  ClaimEvidenceLink,
  ClaimRecord,
  ClaimRelationRow,
  ConflictRecord,
  EvidenceClient,
  EvidenceDraft,
  EvidenceRecord,
  ProvenanceStep,
} from "./types.ts";

const T = {
  claims: "archie_claims",
  evidence: "archie_evidence_records",
  claimEvidence: "archie_claim_evidence",
  claimRelations: "archie_claim_relations",
  conflicts: "archie_evidence_conflicts",
} as const;

export interface RepositoryLimits {
  maxClaimsPerQuery?: number;
  maxEvidencePerClaim?: number;
  maxPremiseClaims?: number;
}

const DEFAULT_LIMITS: Required<RepositoryLimits> = {
  maxClaimsPerQuery: 25,
  maxEvidencePerClaim: 16,
  maxPremiseClaims: 8,
};

export class EvidenceRepository {
  private limits: Required<RepositoryLimits>;

  constructor(
    private svc: EvidenceClient,
    limits: RepositoryLimits = {},
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  // -----------------------------------------------------
  // Claims
  // -----------------------------------------------------

  /** Record (or refresh) a claim. Content change ⇒ version++
   *  + history append (spec §23). Returns the stored claim. */
  async recordClaim(
    draft: ClaimDraft,
    opts: { now: string; createdBy?: string | null },
  ): Promise<{ record: ClaimRecord; created: boolean; changed: boolean }> {
    const key = claimKey(draft);
    const fields = draftToRecord(draft, key);

    const existing = await this.getClaimByKey(key);
    if (existing) {
      const changed =
        existing.statement !== fields.statement ||
        existing.object_value !== fields.object_value ||
        existing.applicable_from !== fields.applicable_from ||
        existing.applicable_until !== fields.applicable_until;
      if (!changed) {
        return { record: existing, created: false, changed: false };
      }
      const history = Array.isArray(existing.history) ? existing.history : [];
      const appended = [
        ...history,
        {
          version: existing.version,
          statement: existing.statement,
          object_value: existing.object_value,
          applicable_from: existing.applicable_from,
          applicable_until: existing.applicable_until,
          verification_state: existing.verification_state,
          superseded_at: opts.now,
          reason: "content updated — prior version preserved in history",
        },
      ].slice(-20); // bounded history
      const { data, error } = await this.svc
        .from(T.claims)
        .update({
          ...fields,
          version: existing.version + 1,
          history: appended,
          updated_date: opts.now,
          created_by: existing.created_by,
          // version bump ⇒ the previous row is superseded
          supersedes_claim_id: existing.supersedes_claim_id,
        })
        .eq("claim_key", key)
        .select()
        .single();
      if (error || !data) {
        throw new Error(`claim update failed: ${error?.message ?? "no row"}`);
      }
      return { record: data as ClaimRecord, created: false, changed: true };
    }

    const { data, error } = await this.svc
      .from(T.claims)
      .insert({
        ...fields,
        created_by: opts.createdBy ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`claim insert failed: ${error?.message ?? "no row"}`);
    }
    return { record: data as ClaimRecord, created: true, changed: true };
  }

  async getClaimByKey(key: string): Promise<ClaimRecord | null> {
    const { data, error } = await this.svc
      .from(T.claims)
      .select("*")
      .eq("claim_key", key)
      .limit(1);
    if (error) return null;
    return (data?.[0] as ClaimRecord) ?? null;
  }

  async getClaimById(id: string): Promise<ClaimRecord | null> {
    const { data, error } = await this.svc
      .from(T.claims)
      .select("*")
      .eq("id", id)
      .limit(1);
    if (error) return null;
    return (data?.[0] as ClaimRecord) ?? null;
  }

  /** Claims for the same subject+predicate (conflict scan). */
  async findConflictingCandidates(claim: ClaimRecord): Promise<ClaimRecord[]> {
    const { data, error } = await this.svc
      .from(T.claims)
      .select("*")
      .ilike("subject", claim.subject)
      .limit(this.limits.maxClaimsPerQuery);
    if (error) return [];
    const rows = (data ?? []) as ClaimRecord[];
    return rows.filter((r) => r.id !== claim.id && isValueConflict(r, claim));
  }

  async persistClaimState(
    id: string,
    state: { verification_state?: string; conflict_state?: string },
    historyEntry?: Record<string, unknown>,
    now?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      ...state,
      updated_date: now ?? new Date().toISOString(),
    };
    if (historyEntry) {
      const claim = await this.getClaimById(id);
      if (claim) {
        const history = Array.isArray(claim.history) ? claim.history : [];
        patch.history = [...history, historyEntry].slice(-20);
      }
    }
    await this.svc.from(T.claims).update(patch).eq("id", id);
  }

  // -----------------------------------------------------
  // Evidence
  // -----------------------------------------------------

  /** Attach evidence to a claim (dedup by evidence_key — a
   *  re-encounter is a no-op). Returns the evidence record. */
  async attachEvidence(
    claimId: string,
    draft: EvidenceDraft,
    relation: "SUPPORTS" | "CONTRADICTS",
    opts: { now: string; note?: string },
  ): Promise<{ record: EvidenceRecord; created: boolean }> {
    const key = evidenceKey(draft);
    const fields = evidenceDraftToRecord(draft, key, opts.now);

    let record = await this.getEvidenceByKey(key);
    let created = false;
    if (!record) {
      const { data, error } = await this.svc
        .from(T.evidence)
        .insert(fields)
        .select()
        .single();
      if (error || !data) {
        throw new Error(
          `evidence insert failed: ${error?.message ?? "no row"}`,
        );
      }
      record = data as EvidenceRecord;
      created = true;
    }

    const { data: existingLink } = await this.svc
      .from(T.claimEvidence)
      .select("claim_id")
      .eq("claim_id", claimId)
      .eq("evidence_id", record.id)
      .eq("relation", relation)
      .limit(1);
    if (!existingLink || existingLink.length === 0) {
      const { error: linkError } = await this.svc.from(T.claimEvidence).insert({
        claim_id: claimId,
        evidence_id: record.id,
        relation,
        note: opts.note ?? null,
      });
      if (linkError) {
        throw new Error(`claim-evidence link failed: ${linkError.message}`);
      }
    }
    return { record, created };
  }

  async getEvidenceByKey(key: string): Promise<EvidenceRecord | null> {
    const { data, error } = await this.svc
      .from(T.evidence)
      .select("*")
      .eq("evidence_key", key)
      .limit(1);
    if (error) return null;
    return (data?.[0] as EvidenceRecord) ?? null;
  }

  async getEvidenceForClaim(claimId: string): Promise<ClaimEvidenceLink[]> {
    const { data, error } = await this.svc
      .from(T.claimEvidence)
      .select("*")
      .eq("claim_id", claimId)
      .limit(this.limits.maxEvidencePerClaim);
    if (error) return [];
    return (data ?? []) as ClaimEvidenceLink[];
  }

  /** Full evidence records for a claim, split by relation. */
  async getEvidenceSplit(claimId: string): Promise<{
    supporting: EvidenceRecord[];
    contradicting: EvidenceRecord[];
  }> {
    const links = await this.getEvidenceForClaim(claimId);
    const split = {
      supporting: [] as EvidenceRecord[],
      contradicting: [] as EvidenceRecord[],
    };
    for (const link of links) {
      const { data, error } = await this.svc
        .from(T.evidence)
        .select("*")
        .eq("id", link.evidence_id)
        .limit(1);
      if (error || !data?.[0]) continue;
      const rec = data[0] as EvidenceRecord;
      if (link.relation === "CONTRADICTS") split.contradicting.push(rec);
      else split.supporting.push(rec);
    }
    return split;
  }

  /** Search evidence by content label / source identity
   *  (bounded ilike scan). */
  async searchEvidence(query: string, limit = 20): Promise<EvidenceRecord[]> {
    const needle = `%${query.slice(0, 64)}%`;
    const { data, error } = await this.svc
      .from(T.evidence)
      .select("*")
      .or(`content_label.ilike.${needle},source_identity.ilike.${needle}`)
      .limit(Math.min(limit, 50));
    if (error) return [];
    return (data ?? []) as EvidenceRecord[];
  }

  // -----------------------------------------------------
  // Claim ↔ claim relations (premises, supersession)
  // -----------------------------------------------------

  async relateClaims(
    claimAId: string,
    claimBId: string,
    relationType: ClaimRelationRow["relation_type"],
    note?: string,
  ): Promise<void> {
    // idempotent: check the relation exists before writing
    const { data: existing } = await this.svc
      .from(T.claimRelations)
      .select("claim_a_id")
      .eq("claim_a_id", claimAId)
      .eq("claim_b_id", claimBId)
      .eq("relation_type", relationType)
      .limit(1);
    if (existing && existing.length > 0) return;
    const { error } = await this.svc.from(T.claimRelations).insert({
      claim_a_id: claimAId,
      claim_b_id: claimBId,
      relation_type: relationType,
      note: note ?? null,
    });
    if (error) {
      throw new Error(`claim relation failed: ${error.message}`);
    }
  }

  async getPremiseClaims(claimId: string): Promise<ClaimRecord[]> {
    const { data, error } = await this.svc
      .from(T.claimRelations)
      .select("claim_b_id")
      .eq("claim_a_id", claimId)
      .eq("relation_type", "PREMISE_OF")
      .limit(this.limits.maxPremiseClaims);
    if (error) return [];
    const out: ClaimRecord[] = [];
    for (const row of (data ?? []) as Array<{ claim_b_id: string }>) {
      const rec = await this.getClaimById(row.claim_b_id);
      if (rec) out.push(rec);
    }
    return out;
  }

  // -----------------------------------------------------
  // Conflicts
  // -----------------------------------------------------

  /** Record a conflict between two claims. Never resolves;
   *  an explanation is only stored with its honest status
   *  (ESTABLISHED / HYPOTHESIS / UNEXPLAINED). */
  async recordConflict(
    claimAId: string,
    claimBId: string,
    kind: ConflictRecord["kind"],
    opts: {
      explanation?: string | null;
      explanationStatus?: ConflictRecord["explanation_status"];
      detectedAt?: string;
    },
  ): Promise<ConflictRecord> {
    // Idempotent per (pair, kind): re-detection is a no-op.
    const [a, b] = [claimAId, claimBId].sort();
    const { data: existing, error: findError } = await this.svc
      .from(T.conflicts)
      .select("*")
      .eq("claim_a_id", a)
      .eq("claim_b_id", b)
      .eq("kind", kind)
      .eq("resolved_at", null)
      .limit(1);
    if (!findError && existing?.[0]) {
      return existing[0] as ConflictRecord;
    }
    const { data, error } = await this.svc
      .from(T.conflicts)
      .insert({
        claim_a_id: a,
        claim_b_id: b,
        kind,
        explanation: opts.explanation ?? null,
        explanation_status:
          opts.explanation && opts.explanationStatus
            ? opts.explanationStatus
            : "UNEXPLAINED",
        detected_at: opts.detectedAt ?? new Date().toISOString(),
        resolved_at: null,
        resolution: null,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`conflict insert failed: ${error?.message ?? "no row"}`);
    }
    return data as ConflictRecord;
  }

  async getUnresolvedConflicts(limit = 50): Promise<ConflictRecord[]> {
    const { data, error } = await this.svc
      .from(T.conflicts)
      .select("*")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(Math.min(limit, 100));
    if (error) return [];
    return (data ?? []) as ConflictRecord[];
  }

  // -----------------------------------------------------
  // Inference recording (provenance preserved, spec §8)
  // -----------------------------------------------------

  /** Record an inferred claim with its premises: PREMISE_OF
   *  relations + an INFERENCE evidence record whose chain
   *  embeds the premises' provenance chains (traceable from
   *  conclusion back to sources). */
  async recordInference(
    conclusionDraft: ClaimDraft,
    premiseClaimIds: string[],
    ruleId: string,
    explanation: string,
    opts: { now: string; createdBy?: string | null },
  ): Promise<ClaimRecord> {
    const premises: ClaimRecord[] = [];
    const premiseChains: ProvenanceStep[][] = [];
    for (const pid of premiseClaimIds.slice(0, this.limits.maxPremiseClaims)) {
      const rec = await this.getClaimById(pid);
      if (rec) {
        premises.push(rec);
        const split = await this.getEvidenceSplit(pid);
        for (const ev of [...split.supporting, ...split.contradicting]) {
          premiseChains.push(
            Array.isArray(ev.provenance_chain) ? ev.provenance_chain : [],
          );
        }
      }
    }
    const chain = chainForInference(premiseChains, {
      ruleId,
      explanation,
      subsystem: "ARCHIE Context & Inference Engine",
      now: opts.now,
    });

    const { record } = await this.recordClaim(
      { ...conclusionDraft, inferred: true },
      opts,
    );

    for (const p of premises) {
      await this.relateClaims(
        record.id,
        p.id,
        "PREMISE_OF",
        `premise of inference rule ${ruleId}`,
      );
    }

    await this.attachEvidence(
      record.id,
      {
        evidenceType: "INFERENCE",
        sourceType: "ARCHIE_INFERENCE",
        sourceIdentity: `archie-inference:${ruleId}`,
        originSubsystem: "ARCHIE Context & Inference Engine",
        contentLabel: `derived by rule ${ruleId}: ${explanation}`.slice(
          0,
          1000,
        ),
        provenanceChain: chain,
        transformation: `inference:${ruleId}`,
        retrievedAt: opts.now,
      },
      "SUPPORTS",
      {
        now: opts.now,
        note: `premises: ${premises.map((p) => p.claim_key).join(", ") || "none"}`,
      },
    );

    return record;
  }

  // -----------------------------------------------------
  // Health (server-side RPC — real counts, never estimates)
  // -----------------------------------------------------

  async health(): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.svc.rpc("archie_evidence_health");
    if (error) return null;
    return (data as Record<string, unknown>) ?? null;
  }
}
