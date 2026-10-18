// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — CROSS-DOMAIN LEARNER
// supabase/functions/_shared/archie-ai/learning/cross-domain-learner.ts
//
// Evaluates concept transfer across domains, preserves jurisdictional
// and regional standards, checks unit compatibility, and prevents
// spurious cross-domain generalizations (spec §4.7).
// =========================================================

import type { CrossDomainTransferCheck } from "./types.ts";

/** Domains strictly bound to jurisdictional and regional contexts. */
const JURISDICTION_BOUND_DOMAINS = new Set([
  "legal",
  "statutory",
  "tax",
  "building_codes",
  "labor_rates",
  "currency",
  "real_estate_conveyancing",
]);

/** Pure logical and mathematical domains freely transferable. */
const UNIVERSAL_DOMAINS = new Set([
  "mathematics",
  "geometry",
  "physics",
  "computer_science",
  "data_structures",
  "probability",
  "logic",
]);

export class CrossDomainLearner {
  /**
   * Assesses whether a learned rule, relation, or procedure can be legally transferred
   * from sourceDomain to targetDomain.
   */
  evaluateTransfer(args: {
    sourceDomain: string;
    targetDomain: string;
    concept: string;
    sourceRegion?: string;
    targetRegion?: string;
    sourceUnit?: string;
    targetUnit?: string;
  }): CrossDomainTransferCheck {
    const src = args.sourceDomain.toLowerCase().trim();
    const tgt = args.targetDomain.toLowerCase().trim();

    // 1. Same domain is always allowed
    if (src === tgt) {
      const regionMatch =
        !args.sourceRegion || !args.targetRegion || args.sourceRegion.toUpperCase() === args.targetRegion.toUpperCase();
      const unitMatch = !args.sourceUnit || !args.targetUnit || args.sourceUnit.toLowerCase() === args.targetUnit.toLowerCase();

      if (!regionMatch) {
        return {
          sourceDomain: src,
          targetDomain: tgt,
          concept: args.concept,
          allowed: false,
          jurisdictionMatch: false,
          unitCompatibility: unitMatch,
          reason: `Cross-regional conflict within ${src}: source region '${args.sourceRegion}' differs from target region '${args.targetRegion}'. Local standards must not cross markets silently.`,
        };
      }

      if (!unitMatch) {
        return {
          sourceDomain: src,
          targetDomain: tgt,
          concept: args.concept,
          allowed: false,
          jurisdictionMatch: true,
          unitCompatibility: false,
          reason: `Unit mismatch within ${src}: source unit '${args.sourceUnit}' incompatible with target unit '${args.targetUnit}'.`,
        };
      }

      return {
        sourceDomain: src,
        targetDomain: tgt,
        concept: args.concept,
        allowed: true,
        jurisdictionMatch: true,
        unitCompatibility: true,
        reason: "Identical domain and compatible regional/unit parameters.",
      };
    }

    // 2. Check universal domains (e.g. physics, math, logic)
    if (UNIVERSAL_DOMAINS.has(src)) {
      return {
        sourceDomain: src,
        targetDomain: tgt,
        concept: args.concept,
        allowed: true,
        jurisdictionMatch: true,
        unitCompatibility: true,
        reason: `Universal domain '${src}' principles transfer freely to '${tgt}'.`,
      };
    }

    // 3. Jurisdiction-bound domains are blocked from cross-domain or cross-region transfer
    if (JURISDICTION_BOUND_DOMAINS.has(src) || JURISDICTION_BOUND_DOMAINS.has(tgt)) {
      return {
        sourceDomain: src,
        targetDomain: tgt,
        concept: args.concept,
        allowed: false,
        jurisdictionMatch: false,
        unitCompatibility: false,
        reason: `Jurisdiction/standard-bound domain '${src}' cannot be transferred to '${tgt}'. Legal and building code rules are non-transferable.`,
      };
    }

    // 4. Default: require explicit structural alignment
    return {
      sourceDomain: src,
      targetDomain: tgt,
      concept: args.concept,
      allowed: false,
      jurisdictionMatch: false,
      unitCompatibility: false,
      reason: `No verified cross-domain analogy mapping exists between '${src}' and '${tgt}' for concept '${args.concept}'.`,
    };
  }
}
