// =========================================================
// RESPONSE COMPOSER (plan P6 — fluid, honest language)
// Deterministic discourse composition: the engine's answers
// keep their exact factual content (cited facts, confidence,
// provenance, epistemic labels) while the CONNECTIVE tissue
// — openings, footers, transitions — varies naturally.
//
// Hard rules:
//  1. Same content → same phrasing, byte-stable (stable hash
//     of the cited evidence picks the variant). Same input
//     always reads the same — never random.
//  2. Different content → different phrasing across a
//     request stream, so answers stop reading like stamps.
//  3. Every variant of a frame family preserves the required
//     epistemic marker ("validated knowledge", provenance,
//     confidence) — fluency NEVER trades away honesty.
//  4. Zero fabrication surface: the composer only frames
//     parts that already carry provenance; it invents no
//     facts, no numbers, no claims.
// =========================================================

/** Owner-facing verbosity profile (plan P6 Batch B). The
 *  engine stays deterministic; the profile selects which
 *  OPTIONAL connectives are composed. Required epistemic
 *  content is never omitted. */
export type Verbosity = "concise" | "detailed";

/** FNV-1a 32-bit stable hash — deterministic, dependency-free. */
export function stableHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick(key: string, seed: string, variants: string[]): string {
  return variants[stableHash(`${key}:${seed}`) % variants.length];
}

// ---------------------------------------------------------
// Frame families — each variant keeps the epistemic marker
// ---------------------------------------------------------

const KNOWLEDGE_OPENINGS = [
  "From my validated knowledge:",
  "Here is what I hold as validated knowledge on that:",
  "What my validated knowledge store says (with provenance):",
  "Straight from my validated knowledge, with provenance:",
];

const HOWTO_FOOTERS = [
  "If you need deeper steps than this, say so — I will plan the work and report any capability gaps honestly.",
  "Want this broken into a full step-by-step plan? Ask and I will plan it — and report honestly where my capabilities end.",
  "I can take this deeper: say the word and I will plan the full work, flagging any capability gaps up front.",
];

// P8 derived-vs-taught: openings for answers that cite
// DERIVED knowledge. Every variant carries the "derived"
// marker so a rule-chain conclusion is never presented as
// owner-validated knowledge.
const DERIVED_OPENINGS = [
  "From my derived knowledge (rule chains — not owner-validated):",
  "Here is what I derived by inference (re-derivable, not owner-validated):",
  "What my reasoning derived on that (inference chains, not owner-validated):",
  "Derived knowledge — produced by my rules, not yet owner-validated:",
];

// H-1 — openings for answers citing ONLY owner-asserted
// knowledge (taught, not yet independently verified). Every
// variant carries the "owner-asserted" marker so an owner's
// assertion is never presented as independently-validated
// knowledge.
const OWNER_ASSERTED_OPENINGS = [
  "From what you have taught me (owner-asserted — your assertion, not independently verified):",
  "Here is what I hold on your authority (owner-asserted, not yet independently verified):",
  "What my owner-asserted knowledge says — taught by you, not independently verified:",
  "You taught me this (owner-asserted — it earns validated status only when confirmed in use):",
];

const UNKNOWN_OPENINGS = [
  "I do not have validated knowledge on that yet.",
  "That is not in my validated knowledge yet.",
  "My validated knowledge store has nothing on this yet.",
];

// FIX 14 (remediation batch 6, Level 3 audit 2026-09-13): a
// mixed cited set — SOME independently-validated facts plus
// SOME owner-asserted ones (no derived) — previously opened
// under the plain "validated knowledge" frame, mislabeling the
// owner-asserted lines at frame level even though each line
// carries its inline label. Every mixed-basis variant names
// BOTH bases explicitly.
const MIXED_BASIS_OPENINGS = [
  "From my knowledge — a mixed basis (each line is labeled with its exact status):",
  "Mixed basis: independently validated, owner-asserted (taught by you) and/or candidate web findings may appear — the line labels say which:",
  "What I hold on that is a mixed basis — each line's label gives its exact reliability:",
];

/** Opening line for an answer citing a MIX of validated and
 *  owner-asserted facts. Every variant contains both
 *  "validated" and "owner-asserted" markers. */
export function mixedBasisOpening(seed: string): string {
  return pick("kb-mixed", seed, MIXED_BASIS_OPENINGS);
}

/** Opening line for a validated-knowledge answer. Every
 *  variant contains "validated knowledge" — the epistemic
 *  label is the anchor, never dropped. */
export function knowledgeOpening(seed: string): string {
  return pick("kb-open", seed, KNOWLEDGE_OPENINGS);
}

/** Opening line for an answer citing derived (P8) knowledge.
 *  Every variant contains "derived" AND an explicit
 *  not-owner-validated disclaimer. */
export function derivedOpening(seed: string): string {
  return pick("kb-derived", seed, DERIVED_OPENINGS);
}

/** Opening line for an answer citing only owner-asserted
 *  knowledge. Every variant contains "owner-asserted" and an
 *  explicit not-independently-verified disclaimer. */
export function ownerAssertedOpening(seed: string): string {
  return pick("kb-owner-asserted", seed, OWNER_ASSERTED_OPENINGS);
}

/** Does a set of facts the answer is about to cite include
 *  any DERIVED fact? Selects the honest opening family. */
export function includesDerived(facts: Array<{ status: string }>): boolean {
  return facts.some((f) => f.status === "derived");
}

/** Optional how-to footer. Omitted in concise mode. */
export function howtoFooter(seed: string, verbosity: Verbosity): string {
  if (verbosity === "concise") return "";
  return pick("howto-foot", seed, HOWTO_FOOTERS);
}

/** Opening line for an honest "not in my knowledge" answer.
 *  Every variant contains "validated knowledge". */
export function unknownOpening(seed: string): string {
  return pick("kb-unknown", seed, UNKNOWN_OPENINGS);
}

/** Epistemic-safety self-check used by tests and the
 *  engine's composer integration: asserts every variant of
 *  every family keeps its required marker. */
export function composerSelfCheck(): {
  ok: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  for (const [i, v] of KNOWLEDGE_OPENINGS.entries()) {
    if (!/validated knowledge/i.test(v)) {
      failures.push(`knowledgeOpening[${i}] lost the epistemic marker`);
    }
  }
  for (const [i, v] of DERIVED_OPENINGS.entries()) {
    if (
      !/derived/i.test(v) ||
      !/not.{0,20}owner-validated|not yet owner-validated/i.test(v)
    ) {
      failures.push(`derivedOpening[${i}] lost the derived/disclaimer marker`);
    }
  }
  for (const [i, v] of UNKNOWN_OPENINGS.entries()) {
    if (!/validated knowledge/i.test(v)) {
      failures.push(`unknownOpening[${i}] lost the epistemic marker`);
    }
  }
  for (const [i, v] of MIXED_BASIS_OPENINGS.entries()) {
    if (!/mixed basis/i.test(v) || !/label/i.test(v)) {
      failures.push(
        `mixedBasisOpening[${i}] lost the mixed-basis/label markers`,
      );
    }
  }
  for (const [i, v] of HOWTO_FOOTERS.entries()) {
    if (!/plan|honest|capabilit/i.test(v)) {
      failures.push(`howtoFooter[${i}] lost the honesty/planning marker`);
    }
  }
  return { ok: failures.length === 0, failures };
}
