// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — DETERMINISTIC KEYS
//
// Claim and evidence dedup keys (spec §22): the same claim
// content ALWAYS maps to the same key, so repeated turns do
// not create duplicates — an upsert is a no-op after the
// first encounter. Pure functions over the canonical fields
// (no timestamps, no ids): only what the information IS.
// =========================================================

import { sha256 } from "../archie-ai/cognitive/sha256.ts";
import type { ClaimDraft, EvidenceDraft } from "./types.ts";

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  return String(value);
}

/**
 * Deterministic dedup key for a claim: identity = the
 * information itself (subject + predicate + object + domain
 * + geo scope), NOT when it was recorded or by whom.
 */
export function claimKey(draft: ClaimDraft): string {
  const payload = [
    canonical(draft.subject),
    canonical(draft.predicate),
    canonical(draft.objectValue ?? null),
    canonical(draft.domain ?? "general"),
    canonical(draft.geoScope ?? null),
  ].join("\u241f"); // ␟ unit separator — cannot appear in content fields
  return `claim:${sha256(payload)}`;
}

/**
 * Deterministic dedup key for evidence: identity = the
 * SOURCE plus the exact content (digest) plus the evidence
 * type. Two rows copied from the same underlying source
 * collapse to ONE evidence record (spec §10, §22).
 */
export function evidenceKey(draft: EvidenceDraft): string {
  const payload = [
    canonical(draft.sourceType),
    canonical(draft.sourceIdentity),
    canonical(draft.evidenceType),
    canonical(draft.contentDigest ?? draft.contentLabel),
  ].join("\u241f");
  return `evidence:${sha256(payload)}`;
}

/** Digest helper for exact content (dedup + audit trail). */
export function contentDigest(content: string): string {
  return sha256(content);
}
