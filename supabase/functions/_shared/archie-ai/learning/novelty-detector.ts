// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — NOVELTY DETECTOR
// supabase/functions/_shared/archie-ai/learning/novelty-detector.ts
//
// Detects exact duplicates, near-duplicates, contradictions,
// refinements, and redundancies against existing knowledge
// items (spec §3 & §6). Pure, deterministic, verifiable.
// =========================================================

import type { ExtractedKnowledgeItem, NoveltyAssessment } from "./types.ts";

/**
 * Tokenizes text into normalized word set for Jaccard similarity.
 */
export function tokenizeToSet(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

/**
 * Computes Jaccard index between two token sets (0..1).
 */
export function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Computes Levenshtein distance between two strings.
 */
export function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Normalized string similarity based on Levenshtein (0..1).
 */
export function computeStringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = computeLevenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

function stringifyObject(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

/**
 * Assesses the novelty of a candidate item against a set of existing knowledge items.
 */
export function assessNovelty(
  candidate: ExtractedKnowledgeItem,
  existingItems: ExtractedKnowledgeItem[],
): NoveltyAssessment {
  const candSubj = candidate.subject.trim().toLowerCase();
  const candPred = candidate.predicate.trim().toLowerCase();
  const candObjStr = stringifyObject(candidate.object).trim().toLowerCase();
  const candDomain = candidate.domain.trim().toLowerCase();

  const candTokens = tokenizeToSet(`${candSubj} ${candPred} ${candObjStr}`);

  for (const existing of existingItems) {
    if (existing.id === candidate.id) continue;
    if (existing.status === "ROLLED_BACK") continue;

    const exSubj = existing.subject.trim().toLowerCase();
    const exPred = existing.predicate.trim().toLowerCase();
    const exObjStr = stringifyObject(existing.object).trim().toLowerCase();
    const exDomain = existing.domain.trim().toLowerCase();

    // Domain and subject alignment
    const sameDomain = exDomain === candDomain || candidate.scope === "GLOBAL" || existing.scope === "GLOBAL";
    if (!sameDomain) continue;

    const sameSubject = exSubj === candSubj;
    const samePredicate = exPred === candPred;

    // 1. Exact Duplicate
    if (sameSubject && samePredicate && exObjStr === candObjStr) {
      return {
        candidateId: candidate.id,
        status: "EXACT_DUPLICATE",
        similarity: 1.0,
        existingRecordId: existing.id,
        reason: `Exact match with existing item ${existing.id} (${existing.subject} ${existing.predicate} = ${exObjStr}).`,
      };
    }

    // 2. Contradiction: Same subject and predicate, but mutually exclusive objects
    if (sameSubject && samePredicate && exObjStr !== candObjStr) {
      // Check numeric or polar opposition
      const candNum = parseFloat(candObjStr);
      const exNum = parseFloat(exObjStr);
      const isNumericDiff = !isNaN(candNum) && !isNaN(exNum) && candNum !== exNum;

      const isPolarDiff =
        (candObjStr === "true" && exObjStr === "false") ||
        (candObjStr === "false" && exObjStr === "true") ||
        (candObjStr === "yes" && exObjStr === "no") ||
        (candObjStr === "no" && exObjStr === "yes");

      if (isNumericDiff || isPolarDiff || (!candObjStr.includes(exObjStr) && !exObjStr.includes(candObjStr))) {
        return {
          candidateId: candidate.id,
          status: "CONTRADICTION",
          similarity: 0.8,
          existingRecordId: existing.id,
          reason: `Direct contradiction on ${existing.subject}.${existing.predicate}: candidate proposes '${candObjStr}' but existing record ${existing.id} holds '${exObjStr}'.`,
        };
      }
    }

    // 3. Refinement: Same subject and predicate, but candidate provides narrower/more detailed data
    if (sameSubject && samePredicate && (candObjStr.includes(exObjStr) || exObjStr.includes(candObjStr))) {
      return {
        candidateId: candidate.id,
        status: "REFINEMENT",
        similarity: 0.9,
        existingRecordId: existing.id,
        reason: `Refinement of existing knowledge item ${existing.id}.`,
      };
    }

    // 4. Near-Duplicate: high token jaccard similarity across content
    const exTokens = tokenizeToSet(`${exSubj} ${exPred} ${exObjStr}`);
    const jaccard = computeJaccardSimilarity(candTokens, exTokens);
    if (jaccard >= 0.85) {
      return {
        candidateId: candidate.id,
        status: "NEAR_DUPLICATE",
        similarity: jaccard,
        existingRecordId: existing.id,
        reason: `Near-duplicate (${(jaccard * 100).toFixed(1)}% token overlap) with existing record ${existing.id}.`,
      };
    }
  }

  // If no match found, candidate is novel
  return {
    candidateId: candidate.id,
    status: "NEW",
    similarity: 0.0,
    reason: "No duplicate, contradiction, or refinement detected in existing knowledge store.",
  };
}
