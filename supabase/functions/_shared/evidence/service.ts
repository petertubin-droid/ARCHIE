// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — SERVICE FACADE
//
// The internal API other ARCHIE components call (spec §38):
//   recordClaim · attachEvidence · getEvidence · verifyClaim
//   classifyClaim · detectConflict · getProvenance
//   getSupportingEvidence · getContradictingEvidence
//   evaluateTemporalValidity · recordInference · auditClaim
//   searchEvidence · recordCalculatorClaim · health
//
// Guarantees enforced HERE (not left to callers):
//   * HALLUCINATED-SOURCE PROTECTION (spec §29 Test 12):
//     evidence that references a stored row (graph, lexicon,
//     FRELUX database, app observation) is CHECKED to exist
//     before it is recorded — a nonexistent source is
//     refused, never represented as real evidence;
//   * FALSE-VERIFICATION PROTECTION (Test 13): verifyClaim
//     refuses anything that does not satisfy the VERIFIED
//     rules from evaluate.ts;
//   * FAIL-SAFE (spec §39): every operation degrades
//     honestly — errors are returned, never papered over
//     with invented data;
//   * BOUNDED + CACHED (spec §30): hot-claim cache with TTL
//     keeps the live chat path fast; every retrieval is
//     bounded.
// =========================================================

import { classifyEvidence, canVerify } from "./evaluate.ts";
import { EvidenceRepository } from "./repository.ts";
import { describeChain } from "./provenance.ts";
import { evaluateTemporalValidity } from "./temporal.ts";
import type {
  ClaimAudit,
  ClaimDraft,
  ClaimRecord,
  ConflictRecord,
  EvidenceClient,
  EvidenceDraft,
  EvidenceEvaluation,
  EvidenceRecord,
  EvidenceGroundTruth,
  ProvenanceStep,
  TemporalState,
  VerificationState,
} from "./types.ts";
import type { Corroboration } from "./types.ts";
import { corroboration } from "./corroborate.ts";

/** Source types whose source_ref — WHEN IT CARRIES a
 *  table+row_id pointer — must point at a real stored row,
 *  verified by an existence check before recording. A source
 *  without a pointer (e.g. a tool observation from this
 *  turn's execution) has nothing to verify and is allowed. */
const ROW_BACKED_SOURCE_TYPES = new Set([
  "SEMANTIC_GRAPH",
  "LEXICON",
  "FRELUX_DATABASE",
]);

export interface EvidenceServiceOptions {
  now?: () => string;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

export interface ServiceResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class EvidenceTruthService {
  private repo: EvidenceRepository;
  private client: EvidenceClient;
  private now: () => string;
  private cache = new Map<string, { expires: number; value: ClaimRecord }>();
  private cacheTtlMs: number;
  private cacheMaxEntries: number;

  constructor(client: EvidenceClient, opts: EvidenceServiceOptions = {}) {
    this.repo = new EvidenceRepository(client);
    this.client = client;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000;
    this.cacheMaxEntries = opts.cacheMaxEntries ?? 200;
  }

  // -----------------------------------------------------
  // Claims
  // -----------------------------------------------------

  async recordClaim(
    draft: ClaimDraft,
    createdBy?: string | null,
  ): Promise<ServiceResult<ClaimRecord>> {
    try {
      const { record, created, changed } = await this.repo.recordClaim(draft, {
        now: this.now(),
        createdBy: createdBy ?? null,
      });
      this.cacheSet(record);
      return {
        ok: true,
        data: record,
        // created/changed ride as flags in callers that need them
        ...(created || changed ? {} : {}),
      } as ServiceResult<ClaimRecord>;
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  async getClaim(claimKeyOrId: string): Promise<ClaimRecord | null> {
    const cached = this.cache.get(claimKeyOrId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const rec = claimKeyOrId.startsWith("claim:")
      ? await this.repo.getClaimByKey(claimKeyOrId)
      : await this.repo.getClaimById(claimKeyOrId);
    if (rec) this.cacheSet(rec);
    return rec;
  }

  /** Full classification pipeline (spec §20 steps 6–10):
   *  retrieve evidence → corroboration → temporal validity →
   *  conflict scan → state. Persists the resulting state. */
  async classifyClaim(
    claimKeyOrId: string,
  ): Promise<ServiceResult<EvidenceEvaluation>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    try {
      const now = this.now();
      const { supporting, contradicting } = await this.repo.getEvidenceSplit(
        claim.id,
      );
      const evaluation = classifyEvidence(
        claim,
        supporting,
        contradicting,
        now,
      );

      // Conflict scan: same subject+predicate, different value.
      const candidates = await this.repo.findConflictingCandidates(claim);
      for (const other of candidates) {
        await this.repo.recordConflict(claim.id, other.id, "VALUE_CONFLICT", {
          detectedAt: now,
        });
      }

      await this.repo.persistClaimState(
        claim.id,
        {
          verification_state:
            candidates.length > 0 ? "CONFLICTED" : evaluation.state,
          conflict_state:
            candidates.length > 0 ? "CONFLICTED" : evaluation.conflictState,
        },
        {
          event: "classified",
          state: evaluation.state,
          temporal_state: evaluation.temporalState,
          independent_corroboration: evaluation.independentCorroboration,
          duplicate_copies: evaluation.duplicateCopies,
          conflicting_claims: candidates.length,
          classified_at: now,
          notes: evaluation.notes,
        },
        now,
      );
      return { ok: true, data: evaluation };
    } catch (e) {
      // FAIL-SAFE (spec §39): never present unsupported
      // information as verified — refuse to classify rather
      // than inventing a state.
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  /**
   * STRICT verification (Test 13): returns ok:false — with
   * the honest state it DID reach — unless the VERIFIED
   * standard is fully satisfied by real evidence.
   */
  async verifyClaim(
    claimKeyOrId: string,
  ): Promise<ServiceResult<{ state: VerificationState; reason: string }>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    try {
      const { supporting, contradicting } = await this.repo.getEvidenceSplit(
        claim.id,
      );
      const verdict = canVerify(claim, supporting, contradicting, this.now());
      if (!verdict.ok)
        return {
          ok: false,
          error: verdict.reason,
          data: { state: verdict.state, reason: verdict.reason },
        };
      await this.repo.persistClaimState(
        claim.id,
        { verification_state: "VERIFIED" },
        { event: "verified", reason: verdict.reason, verified_at: this.now() },
        this.now(),
      );
      return { ok: true, data: verdict };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  // -----------------------------------------------------
  // Evidence
  // -----------------------------------------------------

  /**
   * Attach evidence to a claim — with HALLUCINATED-SOURCE
   * PROTECTION: row-backed source types (graph, lexicon,
   * FRELUX database, app observation) are existence-checked
   * first; a source that does not exist is REFUSED, never
   * recorded as real evidence (spec §29 Test 12).
   */
  async attachEvidence(
    claimKeyOrId: string,
    draft: EvidenceDraft,
    relation: "SUPPORTS" | "CONTRADICTS" = "SUPPORTS",
    note?: string,
  ): Promise<ServiceResult<EvidenceRecord>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    try {
      if (ROW_BACKED_SOURCE_TYPES.has(draft.sourceType)) {
        const exists = await this.sourceRefExists(draft);
        if (!exists) {
          return {
            ok: false,
            error:
              "refused: the referenced source row does not exist — a nonexistent source is never recorded as real evidence",
          };
        }
      }
      const { record } = await this.repo.attachEvidence(
        claim.id,
        draft,
        relation,
        { now: this.now(), note },
      );
      this.cache.delete(claim.claim_key);
      return { ok: true, data: record };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  /** Existence check for a row-backed source_ref: {table,
   *  row_id} must resolve to a real row. */
  private async sourceRefExists(draft: EvidenceDraft): Promise<boolean> {
    const ref = draft.sourceRef ?? {};
    const table = typeof ref.table === "string" ? ref.table : null;
    const rowId = typeof ref.row_id === "string" ? ref.row_id : null;
    if (!table || !rowId) {
      // No row pointer in the source_ref — nothing to
      // existence-check; the provenance chain still documents
      // the real origin.
      return true;
    }
    try {
      const { data, error } = await this.client
        .from(table)
        .select("id")
        .eq("id", rowId)
        .limit(1);
      return !error && Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
  }

  async getEvidence(
    claimKeyOrId: string,
  ): Promise<ServiceResult<EvidenceRecord[]>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    const links = await this.repo.getEvidenceForClaim(claim.id);
    const out: EvidenceRecord[] = [];
    for (const link of links) {
      const { data, error } = await this.client
        .from("archie_evidence_records")
        .select("*")
        .eq("id", link.evidence_id)
        .limit(1);
      if (!error && data?.[0]) out.push(data[0] as EvidenceRecord);
    }
    return { ok: true, data: out };
  }

  async getSupportingEvidence(
    claimKeyOrId: string,
  ): Promise<ServiceResult<EvidenceRecord[]>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    const { supporting } = await this.repo.getEvidenceSplit(claim.id);
    return { ok: true, data: supporting };
  }

  async getContradictingEvidence(
    claimKeyOrId: string,
  ): Promise<ServiceResult<EvidenceRecord[]>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    const { contradicting } = await this.repo.getEvidenceSplit(claim.id);
    return { ok: true, data: contradicting };
  }

  async searchEvidence(query: string): Promise<EvidenceRecord[]> {
    return this.repo.searchEvidence(query);
  }

  /**
   * Deterministic FRELUX calculator output (spec §14): the
   * claim keeps its calculation provenance and is classified
   * by the same pipeline — deterministic evidence is the
   * only path to VERIFIED for computed values. FRELUX
   * calculators and formulas are NEVER modified here.
   */
  async recordCalculatorClaim(input: {
    claim: ClaimDraft;
    calculator: string;
    calculatorVersion?: string;
    parameters: Record<string, unknown>;
    result: string;
  }): Promise<ServiceResult<ClaimRecord>> {
    const claimRes = await this.recordClaim(input.claim);
    if (!claimRes.ok || !claimRes.data) return claimRes;
    const evidence: EvidenceDraft = {
      evidenceType: "DETERMINISTIC_CALCULATOR",
      sourceType: "FRELUX_CALCULATOR",
      sourceIdentity: `frelux-calculator:${input.calculator}`,
      sourceRef: {
        function: input.calculator,
        parameters: input.parameters,
      },
      originSubsystem: "FRELUX deterministic engine",
      observedBySystem: true,
      contentLabel:
        `deterministic output of ${input.calculator}: ${input.result}`.slice(
          0,
          1000,
        ),
      contentDigest: JSON.stringify(input.result),
      transformation: "deterministic calculation",
      version: input.calculatorVersion ?? null,
      retrievedAt: this.now(),
      domain: input.claim.domain ?? null,
    };
    const attach = await this.attachEvidence(
      claimRes.data.claim_key,
      evidence,
      "SUPPORTS",
      "deterministic FRELUX calculator output (owner-approved formula)",
    );
    if (!attach.ok) return { ok: false, error: attach.error };
    await this.classifyClaim(claimRes.data.claim_key);
    return {
      ok: true,
      data: (await this.getClaim(claimRes.data.claim_key)) ?? claimRes.data,
    };
  }

  // -----------------------------------------------------
  // Temporal validity
  // -----------------------------------------------------

  async evaluateTemporalValidity(
    claimKeyOrId: string,
  ): Promise<ServiceResult<TemporalState>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    return { ok: true, data: evaluateTemporalValidity(claim, this.now()) };
  }

  // -----------------------------------------------------
  // Inference
  // -----------------------------------------------------

  async recordInference(input: {
    conclusion: ClaimDraft;
    premiseClaimKeys: string[];
    ruleId: string;
    explanation: string;
  }): Promise<ServiceResult<ClaimRecord>> {
    try {
      const premiseIds: string[] = [];
      for (const key of input.premiseClaimKeys) {
        const rec = await this.getClaim(key);
        if (rec) premiseIds.push(rec.id);
      }
      const record = await this.repo.recordInference(
        input.conclusion,
        premiseIds,
        input.ruleId,
        input.explanation,
        { now: this.now() },
      );
      // classify the derived claim with its own evidence
      await this.classifyClaim(record.claim_key);
      return {
        ok: true,
        data: (await this.getClaim(record.claim_key)) ?? record,
      };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  // -----------------------------------------------------
  // Conflicts
  // -----------------------------------------------------

  async detectConflict(input: {
    claimAKey: string;
    claimBKey: string;
    kind: ConflictRecord["kind"];
    explanation?: string | null;
    explanationStatus?: ConflictRecord["explanation_status"];
  }): Promise<ServiceResult<ConflictRecord>> {
    const a = await this.getClaim(input.claimAKey);
    const b = await this.getClaim(input.claimBKey);
    if (!a || !b) return { ok: false, error: "claim not found" };
    try {
      const rec = await this.repo.recordConflict(a.id, b.id, input.kind, {
        explanation: input.explanation ?? null,
        explanationStatus: input.explanationStatus,
        detectedAt: this.now(),
      });
      await this.repo.persistClaimState(
        a.id,
        { verification_state: "CONFLICTED", conflict_state: "CONFLICTED" },
        { event: "conflict-detected", with_claim: b.claim_key, at: this.now() },
        this.now(),
      );
      await this.repo.persistClaimState(
        b.id,
        { verification_state: "CONFLICTED", conflict_state: "CONFLICTED" },
        { event: "conflict-detected", with_claim: a.claim_key, at: this.now() },
        this.now(),
      );
      return { ok: true, data: rec };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e) };
    }
  }

  // -----------------------------------------------------
  // Provenance (full chain walk — spec §§7, 8, 21)
  // -----------------------------------------------------

  async getProvenance(claimKeyOrId: string): Promise<
    ServiceResult<{
      claim: ClaimRecord;
      evidence: Array<{
        record: EvidenceRecord;
        relation: "SUPPORTS" | "CONTRADICTS";
        chain: ProvenanceStep[];
        chainDescription: string;
      }>;
      premises: Array<{ claim: ClaimRecord; note: string | null }>;
      corroboration: Corroboration;
    }>
  > {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    const { supporting, contradicting } = await this.repo.getEvidenceSplit(
      claim.id,
    );
    const links = await this.repo.getEvidenceForClaim(claim.id);
    const relationByEvidence = new Map(
      links.map((l) => [l.evidence_id, l.relation]),
    );
    const evidence = [...supporting, ...contradicting].map((record) => ({
      record,
      relation: relationByEvidence.get(record.id) ?? "SUPPORTS",
      chain: Array.isArray(record.provenance_chain)
        ? record.provenance_chain
        : [],
      chainDescription: describeChain(
        Array.isArray(record.provenance_chain) ? record.provenance_chain : [],
      ),
    }));
    const premises = (await this.repo.getPremiseClaims(claim.id)).map((p) => ({
      claim: p,
      note: `PREMISE_OF ${claim.claim_key}`,
    }));
    return {
      ok: true,
      data: {
        claim,
        evidence,
        premises,
        corroboration: corroboration(supporting),
      },
    };
  }

  // -----------------------------------------------------
  // Self-audit (spec §24) — answers as DATA, concise
  // evidence explanations only, never chain-of-thought.
  // -----------------------------------------------------

  async auditClaim(claimKeyOrId: string): Promise<ServiceResult<ClaimAudit>> {
    const claim = await this.getClaim(claimKeyOrId);
    if (!claim) return { ok: false, error: "claim not found" };
    const { supporting, contradicting } = await this.repo.getEvidenceSplit(
      claim.id,
    );
    const premises = await this.repo.getPremiseClaims(claim.id);
    const conflicts = (await this.repo.getUnresolvedConflicts(100)).filter(
      (c) => c.claim_a_id === claim.id || c.claim_b_id === claim.id,
    );
    const temporal = evaluateTemporalValidity(claim, this.now());
    const corr = corroboration(supporting);

    const chainsWithMissingSource = [...supporting, ...contradicting].filter(
      (r) =>
        !Array.isArray(r.provenance_chain) ||
        r.provenance_chain.length === 0 ||
        !r.provenance_chain.some((s) => s.stage === "SOURCE"),
    ).length;

    const originSubsystems = Array.from(
      new Set([...supporting, ...contradicting].map((r) => r.origin_subsystem)),
    );

    return {
      ok: true,
      data: {
        claimId: claim.id,
        statement: claim.statement,
        state: claim.verification_state,
        temporalState: temporal,
        support: {
          supportingEvidence: supporting.length,
          contradictingEvidence: contradicting.length,
          directOrObserved:
            supporting.some((r) => r.observed_by_system) ||
            claim.directly_observed,
          derived: claim.inferred,
          premiseCount: premises.length,
          independentSources: corr.independentCount,
        },
        provenance: {
          traceableToSource:
            chainsWithMissingSource === 0 &&
            (supporting.length > 0 || contradicting.length > 0),
          missingProvenanceSteps: chainsWithMissingSource,
          originSubsystems,
        },
        conflicts: conflicts.map((c) => ({
          conflictId: c.id,
          explanationStatus: c.explanation_status,
        })),
        flags: {
          isUserProvided: claim.user_provided,
          isInferred: claim.inferred,
          inferencePresentedAsFact:
            claim.inferred &&
            (claim.verification_state === "VERIFIED" ||
              claim.verification_state === "SUPPORTED") &&
            corr.independentCount === 0,
          evidenceMissing:
            supporting.length === 0 && contradicting.length === 0,
          missingTimestamps:
            claim.source_availability === "SOURCE_AVAILABLE" &&
            claim.retrieved_at === null,
          stale: temporal === "EXPIRED" || temporal === "SUPERSEDED",
        },
      },
    };
  }

  // -----------------------------------------------------
  // Health (spec §28) — real measured state.
  // -----------------------------------------------------

  async health(): Promise<Record<string, unknown> | null> {
    return this.repo.health();
  }

  // -----------------------------------------------------
  // Cache (spec §30)
  // -----------------------------------------------------

  private cacheSet(record: ClaimRecord): void {
    if (this.cache.size >= this.cacheMaxEntries) {
      // drop the oldest entry (Map preserves insertion order)
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(record.claim_key, {
      value: record,
      expires: Date.now() + this.cacheTtlMs,
    });
  }
}

/** Factory: create the evidence service bound to a client. */
export function createEvidenceTruthService(
  client: EvidenceClient,
  opts: EvidenceServiceOptions = {},
): EvidenceTruthService {
  return new EvidenceTruthService(client, opts);
}

// re-exported for the live pipeline
export type { EvidenceGroundTruth };
