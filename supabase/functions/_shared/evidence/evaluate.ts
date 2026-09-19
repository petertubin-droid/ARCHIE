// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — CLASSIFICATION
//
// The evidence-state pipeline (spec §§5–17): given a claim
// and its REAL retrieved evidence, determine the honest
// verification state. PURE functions — deterministic and
// testable; persistence happens in repository.ts.
//
// Anti-hallucination guarantees (spec §§15–16, §26):
//   * an unsupported claim can NEVER become VERIFIED
//   * a USER_PROVIDED claim never silently converts to
//     verified fact (independent evidence may lift it to
//     SUPPORTED — the promotion is recorded, the flags stay)
//   * an INFERRED conclusion stays INFERRED unless
//     independent evidence later establishes it
//   * contradictions produce CONFLICTED — never a silent
//     pick of one side
//   * expired information becomes OUTDATED
//   * no evidence at all: UNVERIFIED (assertion) or
//     UNKNOWN (open question) — never a fabricated answer
// =========================================================

import { corroboration } from "./corroborate.ts";
import { reliabilityOf } from "./sources.ts";
import { evaluateTemporalValidity, isCurrentlyApplicable } from "./temporal.ts";
import type {
  ClaimDraft,
  ClaimRecord,
  EvidenceDraft,
  EvidenceEvaluation,
  EvidenceRecord,
  Reliability,
  VerificationState,
} from "./types.ts";

/** Evidence relevant to one claim, split by relation. */
export interface ClaimEvidenceSet {
  claim: ClaimRecord;
  supporting: EvidenceRecord[];
  contradicting: EvidenceRecord[];
}

const USER_TIERS = new Set(["USER_STATEMENT", "DERIVED"]);

function reliabilityTier(record: EvidenceRecord): Reliability {
  const stored = record.reliability as Partial<Reliability> | null;
  if (stored && typeof stored.tier === "string" && stored.basis) {
    return { tier: stored.tier as Reliability["tier"], basis: stored.basis };
  }
  // Stored record without reliability metadata — classify
  // from its documented properties (never invent).
  return reliabilityOf({
    evidenceType: record.evidence_type,
    sourceType: record.source_type,
    sourceIdentity: record.source_identity,
    originSubsystem: record.origin_subsystem,
    contentLabel: record.content_label,
  });
}

/**
 * Classify one claim against its evidence. The claim's own
 * flags (user_provided / inferred / question) and temporal
 * metadata participate; evidence reliability comes from
 * sources.ts's documented tiers.
 *
 * This is the function behind classifyClaim and verifyClaim
 * (verifyClaim additionally REQUIRES a qualifying tier).
 */
export function classifyEvidence(
  claim: ClaimRecord,
  supporting: EvidenceRecord[],
  contradicting: EvidenceRecord[],
  now: string,
): EvidenceEvaluation {
  const temporal = evaluateTemporalValidity(claim, now);
  const support = corroboration(supporting);
  const contra = corroboration(contradicting);

  // ---- Conflicts first: a conflict is represented, never
  //  silently resolved (spec §11).
  if (contra.independentCount > 0) {
    return {
      state: "CONFLICTED",
      temporalState: temporal,
      conflictState: "CONFLICTED",
      independentCorroboration: support.independentCount,
      duplicateCopies: support.duplicateCopies + contra.duplicateCopies,
      notes: `${support.independentCount} independent supporting source(s) and ${contra.independentCount} independent contradicting source(s) — the disagreement is recorded, not resolved`,
    };
  }

  // ---- Expired / superseded information is OUTDATED (spec
  //  §12) — it may have been correct before.
  if (temporal === "EXPIRED" || temporal === "SUPERSEDED") {
    return {
      state:
        support.independentCount > 0 ? "OUTDATED" : claim.verification_state,
      temporalState: temporal,
      conflictState: "NONE",
      independentCorroboration: support.independentCount,
      duplicateCopies: support.duplicateCopies,
      notes:
        support.independentCount > 0
          ? "supported evidence exists but its applicable period has ended"
          : "applicable period ended; no supporting evidence retained",
    };
  }

  // ---- No evidence at all.
  if (support.independentCount === 0) {
    if (claim.question) {
      return {
        state: "UNKNOWN",
        temporalState: temporal,
        conflictState: "NONE",
        independentCorroboration: 0,
        duplicateCopies: 0,
        notes: "no stored evidence exists to determine this",
      };
    }
    return {
      state: claim.user_provided
        ? "USER_PROVIDED"
        : claim.inferred
          ? "INFERRED"
          : "UNVERIFIED",
      temporalState: temporal,
      conflictState: "NONE",
      independentCorroboration: 0,
      duplicateCopies: 0,
      notes: claim.user_provided
        ? "user-provided; no independent evidence yet"
        : claim.inferred
          ? "inference recorded without independent evidence"
          : "insufficient evidence to establish this",
    };
  }

  // ---- Evidence exists. Split independent support into
  //  independent (non-user, non-derived) sources.
  const independentNonUser = supporting.filter((r) => {
    const tier = reliabilityTier(r);
    return !USER_TIERS.has(tier.tier);
  });

  // ---- USER_PROVIDED: promotion requires independent
  //  evidence (spec §15) — and even then only to SUPPORTED,
  //  with flags intact. Never silent.
  if (claim.user_provided && independentNonUser.length === 0) {
    return {
      state: "USER_PROVIDED",
      temporalState: temporal,
      conflictState: "NONE",
      independentCorroboration: 0,
      duplicateCopies: support.duplicateCopies,
      notes:
        "user-supplied information; supporting evidence is user/derived only",
    };
  }

  // ---- INFERRED stays INFERRED unless independent
  //  evidence establishes it (spec §16).
  if (claim.inferred && independentNonUser.length === 0) {
    return {
      state: "INFERRED",
      temporalState: temporal,
      conflictState: "NONE",
      independentCorroboration: 0,
      duplicateCopies: support.duplicateCopies,
      notes:
        "derived conclusion; premises recorded, no independent evidence yet",
    };
  }

  // ---- With independent evidence: is it VERIFIED-strong?
  //  VERIFIED requires every supporting source to be
  //  DETERMINISTIC or STRUCTURED_VERIFIED, all currently
  //  applicable, and at least one supporting record.
  const allStrong = supporting.every((r) => {
    const tier = reliabilityTier(r);
    return tier.tier === "DETERMINISTIC" || tier.tier === "STRUCTURED_VERIFIED";
  });

  if (allStrong && isCurrentlyApplicable(temporal)) {
    // A user-provided statement is NEVER silently converted
    // into verified fact (spec §15): independent strong
    // evidence lifts it only to SUPPORTED, promotion noted.
    if (claim.user_provided) {
      return {
        state: "SUPPORTED",
        temporalState: temporal,
        conflictState: "NONE",
        independentCorroboration: support.independentCount,
        duplicateCopies: support.duplicateCopies,
        notes:
          "user-provided, corroborated by independent strong evidence — promoted to supported, never auto-verified",
      };
    }
    return {
      state: "VERIFIED",
      temporalState: temporal,
      conflictState: "NONE",
      independentCorroboration: support.independentCount,
      duplicateCopies: support.duplicateCopies,
      notes:
        "strongly supported: all supporting evidence is deterministic or lower-layer-verified and currently applicable",
    };
  }

  // ---- Anything else with real independent evidence is
  //  SUPPORTED (reasonably supported, not the strongest
  //  standard — spec §5).
  return {
    state: "SUPPORTED",
    temporalState: temporal,
    conflictState: "NONE",
    independentCorroboration: support.independentCount,
    duplicateCopies: support.duplicateCopies,
    notes:
      independentNonUser.length > 0
        ? `${independentNonUser.length} independent supporting evidence record(s); does not meet the strongest verification standard`
        : "supporting evidence is user/derived; treated as reasonably supported, not verified",
  };
}

/**
 * STRICT verification (spec §29, Test 13): an unsupported
 * claim CANNOT become VERIFIED. verifyClaim returns
 * { ok: false } unless every rule for VERIFIED is satisfied
 * by real, currently-applicable, strong evidence.
 */
export function canVerify(
  claim: ClaimRecord,
  supporting: EvidenceRecord[],
  contradicting: EvidenceRecord[],
  now: string,
): { ok: boolean; state: VerificationState; reason: string } {
  const evaluation = classifyEvidence(claim, supporting, contradicting, now);
  if (evaluation.state === "VERIFIED") {
    return { ok: true, state: "VERIFIED", reason: evaluation.notes };
  }
  return {
    ok: false,
    state: evaluation.state,
    reason: `verification refused: ${evaluation.notes}`,
  };
}

/**
 * Detect a VALUE conflict between two claims on the same
 * subject + predicate with different object values (spec
 * §11). Possible explanations (different dates, regions,
 * definitions…) are NEVER invented here — the conflict is
 * recorded UNEXPLAINED unless the caller supplies an
 * explicitly established/hypothesis explanation.
 */
export function isValueConflict(
  a: Pick<
    ClaimRecord,
    "subject" | "predicate" | "object_value" | "domain" | "geo_scope"
  >,
  b: Pick<
    ClaimRecord,
    "subject" | "predicate" | "object_value" | "domain" | "geo_scope"
  >,
): boolean {
  const sameSubjectPredicate =
    a.subject.trim().toLowerCase() === b.subject.trim().toLowerCase() &&
    a.predicate.trim().toLowerCase() === b.predicate.trim().toLowerCase();
  if (!sameSubjectPredicate) return false;
  const av = (a.object_value ?? "").trim().toLowerCase();
  const bv = (b.object_value ?? "").trim().toLowerCase();
  if (av === bv) return false;
  // same subject+predicate+value is the same claim (dedup),
  // but different DOMAIN or GEO scope is a DIFFERENT
  // assertion, not a conflict.
  const sa = (a.domain ?? "").trim().toLowerCase();
  const sb = (b.domain ?? "").trim().toLowerCase();
  const ga = (a.geo_scope ?? "").trim().toLowerCase();
  const gb = (b.geo_scope ?? "").trim().toLowerCase();
  if (sa && sb && sa !== sb) return false;
  if (ga && gb && ga !== gb) return false;
  return true;
}

/** Build the claim record fields from a draft (before
 *  persistence — claim_key computed by keys.ts). */
export function draftToRecord(
  draft: ClaimDraft,
  key: string,
): Omit<ClaimRecord, "id" | "created_by" | "created_date" | "updated_date"> & {
  id?: string;
} {
  return {
    claim_key: key,
    subject: draft.subject.trim().slice(0, 512),
    predicate: draft.predicate.trim().slice(0, 512),
    object_value: draft.objectValue ?? null,
    claim_type: draft.claimType ?? "ATTRIBUTE",
    statement: draft.statement.trim().slice(0, 2000),
    domain: (draft.domain ?? "general").trim().slice(0, 120) || "general",
    geo_scope: draft.geoScope ?? null,
    subject_concept_key: draft.subjectConceptKey ?? null,
    object_concept_key: draft.objectConceptKey ?? null,
    user_provided: draft.userProvided ?? false,
    inferred: draft.inferred ?? false,
    directly_observed: draft.directlyObserved ?? false,
    question: draft.question ?? false,
    verification_state: draft.question
      ? "UNKNOWN"
      : draft.userProvided
        ? "USER_PROVIDED"
        : draft.inferred
          ? "INFERRED"
          : "UNVERIFIED",
    conflict_state: "NONE",
    source_availability: draft.sourceAvailability ?? "SOURCE_UNAVAILABLE",
    applicable_from: draft.applicableFrom ?? null,
    applicable_until: draft.applicableUntil ?? null,
    published_at: draft.publishedAt ?? null,
    retrieved_at: draft.retrievedAt ?? null,
    version: 1,
    history: [],
    supersedes_claim_id: null,
  };
}

/** Evidence draft → record fields (reliability from
 *  sources.ts, provenance chain preserved as passed). */
export function evidenceDraftToRecord(
  draft: EvidenceDraft,
  key: string,
  now: string,
): Omit<EvidenceRecord, "id" | "created_date" | "updated_date"> & {
  id?: string;
} {
  const chain =
    draft.provenanceChain && draft.provenanceChain.length > 0
      ? draft.provenanceChain
      : [
          {
            stage: "SOURCE" as const,
            detail: `${draft.sourceIdentity} (${draft.sourceType})`,
            subsystem: draft.originSubsystem,
            at: draft.retrievedAt ?? now,
          },
        ];
  return {
    evidence_key: key,
    evidence_type: draft.evidenceType,
    source_type: draft.sourceType,
    source_identity: draft.sourceIdentity,
    source_ref: draft.sourceRef ?? null,
    origin_subsystem: draft.originSubsystem,
    observed_by_system: draft.observedBySystem ?? false,
    content_label: draft.contentLabel.slice(0, 1000),
    content_digest: draft.contentDigest ?? null,
    transformation: draft.transformation ?? null,
    provenance_chain: chain,
    reliability: reliabilityOf(draft),
    domain: draft.domain ?? null,
    version: draft.version ?? null,
    retrieved_at: draft.retrievedAt ?? now,
    published_at: draft.publishedAt ?? null,
  };
}
