// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — LANGUAGE MEMORY (§8–§13)
//
// Universal language learning with persistent, evidence-based
// memory. The existing frelux_archie_languages registry stays
// intact — it remains the FRELUX REGISTERED set; this layer
// adds ARCHIE LEARNED / CURRENTLY LEARNING / DISCOVERED
// knowledge on top, with:
//
//   Language Encountered → Detection → Dictionary Check →
//   Memory Check → Discovery → Learning → Evidence →
//   Validation → Confidence → (Approval) → Memory Registration
//
// Unknown information never automatically becomes permanent
// memory: DISCOVERED/LEARNING/VALIDATING entries stay
// provisional; CONFIRMED requires threshold confidence and
// corroboration from independent sources (or owner approval).
//
// No underlying AI foundation model is retrained — knowledge
// lives here, in persistent storage.
// =========================================================

import type {
  LanguageConfidenceCategories,
  LanguageEntry,
  LanguageEvidence,
  LanguageProfile,
  LanguageValidationState,
} from "./types";

// ---------------------------------------------------------
// Validation state machine (§9)
// ---------------------------------------------------------

const VALIDATION_TRANSITIONS: Record<
  LanguageValidationState,
  LanguageValidationState[]
> = {
  DISCOVERED: ["LEARNING", "REJECTED", "NEEDS_REVIEW"],
  LEARNING: ["VALIDATING", "REJECTED", "NEEDS_REVIEW"],
  VALIDATING: ["CONFIRMED", "REJECTED", "NEEDS_REVIEW"],
  CONFIRMED: ["NEEDS_REVIEW"], // new contradictory evidence re-opens it
  REJECTED: [],
  NEEDS_REVIEW: ["LEARNING", "VALIDATING", "REJECTED", "CONFIRMED"],
};

export function mayTransitionValidation(
  from: LanguageValidationState,
  to: LanguageValidationState,
): boolean {
  return VALIDATION_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------
// Confidence (§11)
// ---------------------------------------------------------

/** Weights per category. Overall confidence is the weighted
 *  mean of AVAILABLE categories — missing categories are
 *  never counted as zero (unknown ≠ absent skill). */
const CONFIDENCE_WEIGHTS: Record<string, number> = {
  vocabulary: 1.2,
  grammar: 1.1,
  translation: 1.0,
  pronunciation: 0.7,
  dialect: 0.6,
};

export function clampUnit(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Overall confidence from validated category scores. Returns
 *  null when no category is available — the caller must treat
 *  null as UNKNOWN, not as 0. */
export function computeOverallConfidence(
  categories: LanguageConfidenceCategories,
): number | null {
  const entries = Object.entries(categories).filter(
    ([, v]) => typeof v === "number" && v >= 0,
  );
  if (entries.length === 0) return null;
  let weightSum = 0;
  let weighted = 0;
  for (const [k, v] of entries) {
    const w = CONFIDENCE_WEIGHTS[k] ?? 0.5;
    weighted += clampUnit(v as number) * w;
    weightSum += w;
  }
  return weightSum === 0 ? null : weighted / weightSum;
}

/** Assess an entry's evidence quality: reliability ×
 *  corroboration. Two+ independent source types count more
 *  than one repeated source. */
export function assessEvidenceConfidence(
  evidence: LanguageEvidence[],
): number | null {
  if (evidence.length === 0) return null;
  const sourceTypes = new Set(evidence.map((e) => e.sourceType));
  const corroboration = sourceTypes.size >= 2 ? 1 : 0.85;
  const reliability = Math.max(
    ...evidence.map((e) => clampUnit(e.reliability)),
  );
  return clampUnit(reliability * corroboration);
}

// ---------------------------------------------------------
// Profiles (§10, §13)
// ---------------------------------------------------------

export interface CreateLanguageProfileInput {
  name: string;
  nativeName: string;
  isoCode?: string | null;
  altNames?: string[];
  family?: string | null;
  writingSystem?: string[];
  regions?: string[];
  dialects?: string[];
  /** A language matching the FRELUX dictionary is registered,
   *  never overwritten. */
  isFreluxRegistered?: boolean;
  now: string;
}

export type LanguageProfileResult =
  { ok: true; profile: LanguageProfile } | { ok: false; error: string };

export function createLanguageProfile(
  input: CreateLanguageProfileInput,
  id: string,
): LanguageProfileResult {
  if (!input.name.trim() || !input.nativeName.trim()) {
    return {
      ok: false,
      error: "A language profile requires a name and native name.",
    };
  }
  const profile: LanguageProfile = {
    id,
    name: input.name.trim(),
    nativeName: input.nativeName.trim(),
    isoCode: input.isoCode?.trim() || null,
    altNames: input.altNames ?? [],
    family: input.family ?? null,
    writingSystem: input.writingSystem ?? [],
    regions: input.regions ?? [],
    dialects: input.dialects ?? [],
    registryStatus: input.isFreluxRegistered
      ? "frelux_registered"
      : "discovered",
    confidence: null,
    verificationStatus: input.isFreluxRegistered ? "CONFIRMED" : "DISCOVERED",
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return { ok: true, profile };
}

/** Promote the registry status along the learning pipeline. */
export function promoteRegistryStatus(
  profile: LanguageProfile,
  now: string,
): LanguageProfile {
  if (profile.registryStatus === "frelux_registered") return profile;
  if (
    profile.registryStatus === "discovered" &&
    profile.verificationStatus !== "DISCOVERED"
  ) {
    return { ...profile, registryStatus: "currently_learning", updatedAt: now };
  }
  return profile;
}

/** ARCHIE LEARNED requires confirmed core knowledge —
 *  vocabulary AND translation at/above the threshold. */
export function meetsLearnedBar(
  categories: LanguageConfidenceCategories,
  threshold: number,
): boolean {
  const vocab = categories.vocabulary ?? 0;
  const translation = categories.translation ?? 0;
  return vocab >= threshold && translation >= threshold;
}

// ---------------------------------------------------------
// Entries & merge logic (§12)
// ---------------------------------------------------------

export interface UpsertKnowledgeInput {
  profile: LanguageProfile;
  kind: LanguageEntry["kind"];
  key: string;
  payload: Record<string, unknown>;
  region: string | null;
  evidence: Omit<LanguageEvidence, "id" | "entryId" | "createdAt">[];
  now: string;
}

export type UpsertKnowledgeResult =
  | {
      ok: true;
      profile: LanguageProfile;
      /** The created or updated entry. */
      entry: LanguageEntry;
      /** New evidence rows to persist (empty entryId until saved). */
      evidence: Array<
        Omit<LanguageEvidence, "id" | "entryId" | "createdAt"> & {
          entryId: string;
        }
      >;
      /** Nothing was overwritten — a variant or review instead. */
      outcome: "created" | "variant" | "updated" | "needs_review";
      /** Human-readable conflict report (§12). */
      note?: string;
    }
  | { ok: false; error: string };

/**
 * Add knowledge for a language. Merge rules (§12):
 *   - Different region/dialect → coexisting variant (never a conflict).
 *   - Same key+region with equal payload → duplicate, idempotent no-op.
 *   - Same key+region with different payload:
 *       * existing CONFIRMED + incoming evidence not strictly
 *         stronger → the new claim becomes NEEDS_REVIEW; the
 *         verified knowledge is PRESERVED, not overwritten.
 *       * otherwise → update with version bump and history.
 *   - Blind overwrite is impossible by construction.
 */
export function upsertLanguageKnowledge(
  input: UpsertKnowledgeInput,
  existing: LanguageEntry[],
  entryId: string,
): UpsertKnowledgeResult {
  const normalizedKey = input.key.trim().toLowerCase();
  if (!normalizedKey)
    return { ok: false, error: "A knowledge entry requires a key." };
  if (Object.keys(input.payload).length === 0) {
    return { ok: false, error: "A knowledge entry requires a payload." };
  }
  if (input.evidence.length === 0) {
    return {
      ok: false,
      error: "Knowledge requires evidence — no evidence, no memory (§11).",
    };
  }
  const region = input.region?.trim() || null;

  const conflict = existing.find(
    (e) =>
      e.kind === input.kind &&
      e.key === normalizedKey &&
      (e.region ?? null) === region,
  );

  const evidenceWithEntryId = input.evidence.map((e) => ({ ...e, entryId }));

  // Duplicate check — same payload is an idempotent no-op.
  if (conflict && samePayload(conflict.payload, input.payload)) {
    return {
      ok: true,
      profile: input.profile,
      entry: conflict,
      evidence: evidenceWithEntryId,
      outcome: "updated",
      note: "Identical knowledge already recorded — no change made.",
    };
  }

  if (!conflict) {
    const confidence = assessEvidenceConfidence(
      input.evidence.map((e, i) => ({
        ...e,
        id: `tmp-${i}`,
        entryId,
        createdAt: input.now,
      })),
    );
    const entry: LanguageEntry = {
      id: entryId,
      profileId: input.profile.id,
      kind: input.kind,
      key: normalizedKey,
      payload: input.payload,
      region,
      confidence,
      validationState: "LEARNING",
      history: [],
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const profile = promoteRegistryStatus(
      { ...input.profile, updatedAt: input.now },
      input.now,
    );
    return {
      ok: true,
      profile,
      entry,
      evidence: evidenceWithEntryId,
      outcome: "created",
    };
  }

  // Same key + region, different payload — contradiction handling.
  const incomingConfidence = assessEvidenceConfidence(
    input.evidence.map((e, i) => ({
      ...e,
      id: `tmp-${i}`,
      entryId,
      createdAt: input.now,
    })),
  );
  const existingStronger =
    (conflict.confidence ?? 0) >= (incomingConfidence ?? 0);

  if (conflict.validationState === "CONFIRMED" && existingStronger) {
    // Preserve verified knowledge; the contradicting claim goes to review.
    const reviewEntry: LanguageEntry = {
      id: entryId,
      profileId: input.profile.id,
      kind: input.kind,
      key: normalizedKey,
      payload: input.payload,
      region,
      confidence: incomingConfidence,
      validationState: "NEEDS_REVIEW",
      history: [],
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
    return {
      ok: true,
      profile: input.profile,
      entry: reviewEntry,
      evidence: evidenceWithEntryId,
      outcome: "needs_review",
      note: `Conflicting information for "${normalizedKey}"${region ? ` (${region})` : ""}: the CONFIRMED knowledge was preserved; the new claim is recorded as NEEDS_REVIEW pending stronger evidence or owner review.`,
    };
  }

  // Incoming evidence is stronger (or existing was not confirmed) —
  // justified update with version history.
  const updated: LanguageEntry = {
    ...conflict,
    payload: input.payload,
    confidence: incomingConfidence,
    validationState:
      conflict.validationState === "CONFIRMED"
        ? "VALIDATING"
        : conflict.validationState,
    history: [
      ...conflict.history,
      {
        version: conflict.version,
        payload: conflict.payload,
        supersededAt: input.now,
      },
    ],
    version: conflict.version + 1,
    updatedAt: input.now,
  };
  return {
    ok: true,
    profile: input.profile,
    entry: updated,
    evidence: evidenceWithEntryId,
    outcome: "updated",
    note: `Updated "${normalizedKey}" (v${conflict.version} → v${updated.version}); previous payload preserved in history.`,
  };
}

function samePayload(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------
// Validation (§11)
// ---------------------------------------------------------

export interface ValidateEntryInput {
  entry: LanguageEntry;
  allEvidence: LanguageEvidence[];
  minConfidenceThreshold: number;
  now: string;
}

export type ValidateEntryResult =
  | { ok: true; entry: LanguageEntry; reason: string }
  | { ok: false; error: string };

/**
 * Deterministic validation:
 *   CONFIRMED requires confidence ≥ threshold AND at least 2
 *   independent source types. Owner-provided evidence alone
 *   can also confirm (the owner IS an authority).
 *   Anything else stays provisional or goes to NEEDS_REVIEW.
 */
export function validateEntry(input: ValidateEntryInput): ValidateEntryResult {
  const { entry, allEvidence, minConfidenceThreshold } = input;
  if (entry.validationState === "REJECTED") {
    return { ok: false, error: "A REJECTED entry cannot be validated." };
  }
  const independentSources = new Set(allEvidence.map((e) => e.sourceType));
  const hasOwnerEvidence = allEvidence.some(
    (e) => e.sourceType === "owner_provided",
  );
  const confidence = assessEvidenceConfidence(allEvidence);

  if (
    hasOwnerEvidence ||
    (confidence !== null &&
      confidence >= minConfidenceThreshold &&
      independentSources.size >= 2)
  ) {
    if (
      hasOwnerEvidence &&
      confidence !== null &&
      confidence < minConfidenceThreshold &&
      independentSources.size < 2
    ) {
      // Owner evidence confirms, but flag low confidence honestly.
      const confirmed: LanguageEntry = {
        ...entry,
        validationState: "CONFIRMED",
        confidence: confidence ?? entry.confidence,
        updatedAt: input.now,
      };
      return {
        ok: true,
        entry: confirmed,
        reason:
          "Confirmed by owner-provided evidence (confidence is low and should be improved).",
      };
    }
    const confirmed: LanguageEntry = {
      ...entry,
      validationState: "CONFIRMED",
      confidence: confidence ?? entry.confidence,
      updatedAt: input.now,
    };
    return {
      ok: true,
      entry: confirmed,
      reason: hasOwnerEvidence
        ? "Confirmed by owner-provided evidence."
        : `Confidence ${(confidence! * 100).toFixed(0)}% ≥ threshold with ${independentSources.size} independent source types.`,
    };
  }
  if (confidence === null) {
    const review: LanguageEntry = {
      ...entry,
      validationState: "NEEDS_REVIEW",
      updatedAt: input.now,
    };
    return {
      ok: true,
      entry: review,
      reason: "No evidence to assess — NEEDS_REVIEW, information is uncertain.",
    };
  }
  if (confidence < minConfidenceThreshold) {
    const review: LanguageEntry = {
      ...entry,
      validationState: "NEEDS_REVIEW",
      confidence,
      updatedAt: input.now,
    };
    return {
      ok: true,
      entry: review,
      reason: `Confidence ${(confidence * 100).toFixed(0)}% is below the ${(minConfidenceThreshold * 100).toFixed(0)}% threshold — information is uncertain and stays provisional.`,
    };
  }
  const review: LanguageEntry = {
    ...entry,
    validationState: "NEEDS_REVIEW",
    confidence,
    updatedAt: input.now,
  };
  return {
    ok: true,
    entry: review,
    reason: `Only ${independentSources.size} source type(s) — corroboration is insufficient for permanent memory.`,
  };
}

/** Language-level confidence: weighted mean over CONFIRMED
 *  entry categories (§11 example semantics). */
export function computeLanguageConfidence(
  entries: LanguageEntry[],
  kindOf: (entry: LanguageEntry) => keyof LanguageConfidenceCategories,
): number | null {
  const categories: LanguageConfidenceCategories = {};
  const categoryByKind: Record<string, keyof LanguageConfidenceCategories> = {
    vocabulary: "vocabulary",
    grammar: "grammar",
    phrase: "translation",
  };
  for (const key of Object.values(categoryByKind)) {
    const relevant = entries.filter(
      (e) =>
        kindOf(e) === key &&
        e.validationState === "CONFIRMED" &&
        e.confidence !== null,
    );
    if (relevant.length > 0) {
      categories[key] =
        relevant.reduce((s, e) => s + (e.confidence ?? 0), 0) / relevant.length;
    }
  }
  return computeOverallConfidence(categories);
}
