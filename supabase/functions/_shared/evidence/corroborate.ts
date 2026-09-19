// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — CORROBORATION
//
// Spec §10: multiple INDEPENDENT sources supporting the
// same claim count as corroboration. Copies of the SAME
// underlying source (same source identity, or evidence whose
// provenance chain traces to the same root) are recognized
// and NOT counted as independent evidence.
// =========================================================

import type { Corroboration, EvidenceRecord } from "./types.ts";

/** The independence identity of one evidence record: its
 *  declared source identity, or — when it was derived —
 *  the ROOT SOURCE of its provenance chain (copies usually
 *  inherit the same root). */
function independenceKey(record: EvidenceRecord): string {
  const chain = Array.isArray(record.provenance_chain)
    ? record.provenance_chain
    : [];
  const root = chain.find((s) => s.stage === "SOURCE");
  if (root) {
    return `${root.subsystem}|${root.detail}`;
  }
  return `${record.source_type}|${record.source_identity}`;
}

/**
 * Count independent corroboration among evidence records.
 * Records from the same underlying source collapse into one
 * independent voice; every additional copy is counted as a
 * duplicate, never as corroboration.
 */
export function corroboration(records: EvidenceRecord[]): Corroboration {
  const independent = new Set<string>();
  const seen = new Set<string>(); // evidence id — already accounted
  let duplicateCopies = 0;

  for (const r of records) {
    const key = independenceKey(r);
    if (independent.has(key) || seen.has(r.id)) {
      duplicateCopies += 1;
    } else {
      independent.add(key);
      seen.add(r.id);
    }
  }

  return {
    independentSourceIdentities: Array.from(independent).slice(0, 16),
    independentCount: independent.size,
    duplicateCopies,
  };
}
