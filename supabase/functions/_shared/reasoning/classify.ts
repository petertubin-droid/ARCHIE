// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE —
// PROBLEM CLASSIFICATION
//
// Deterministic signal-based classification into the 12
// reasoning categories (spec §5). Rules are ordered, honest,
// and NEVER force a category: multiple secondary categories
// may apply, and GENERIC means "no reasoning category fits —
// do not pretend one does".
// =========================================================

import type { ProblemCategory } from "./types.ts";

interface CategorySignals {
  category: ProblemCategory;
  patterns: RegExp[];
}

const SIGNALS: CategorySignals[] = [
  {
    // Known premises → logically supported conclusion ("all X
    // are Y, this is X, so…").
    category: "DEDUCTIVE",
    patterns: [
      /\ball\b[^.?!]*\bare\b[^.?!]*\b(?:so|therefore|then)\b/i,
      /\bevery\b[^.?!]*\bis\b[^.?!]*\b(?:so|therefore)\b/i,
      /\bif\b[^.?!]{3,80}\bthen\b[^.?!]*\bmust\b/i,
      /\bgiven that\b[^.?!]+\b(?:it follows|therefore|so)\b/i,
    ],
  },
  {
    // Observed patterns → generalization (marked as inductive).
    category: "INDUCTIVE",
    patterns: [
      /\b(?:pattern|trend|usually|typically|most of the time)\b/i,
      /\bevery time\b[^.?!]*\balso\b/i,
      /\bfrom (?:my|the) observations?\b/i,
      /\bso far\b[^.?!]*\balways\b/i,
    ],
  },
  {
    // Available evidence → candidate explanation.
    category: "ABDUCTIVE",
    patterns: [
      /\b(?:what|which) (?:could|might|can) (?:explain|be the reason|have caused)\b/i,
      /\bmost likely (?:explanation|reason|cause)\b/i,
      /\bwhy do you think\b/i,
    ],
  },
  {
    // Causes, effects, dependencies.
    category: "CAUSAL",
    patterns: [
      /\b(?:what|which)[^.?!]*\bcauses?\b/i,
      /\b(?:cause|effect|impact|consequence) of\b/i,
      /\b(?:if|when)[^.?!]*\b(?:what happens|what will happen|what changes)\b/i,
      /\blead to\b/i,
      /\baffect\b/i,
    ],
  },
  {
    // Compare alternatives using explicit criteria.
    category: "COMPARATIVE",
    patterns: [
      /\bcompare\b/i,
      /\b(?:better|worse|cheaper|faster|safer)\b[^.?!]*\b(?:or|vs\.?|between|than)\b/i,
      /\bvs\.?\b/i,
      /\bwhich (?:should|is better|one should|option)\b/i,
      /\bpros and cons\b/i,
      /\b(?:difference|differences) between\b/i,
    ],
  },
  {
    // Deterministic calculation (number/operator density).
    category: "MATHEMATICAL",
    patterns: [
      /\d+(?:\.\d+)?\s*(?:times|plus|minus|divided by|multiplied by|over|[-+*/^])\s*\d+/i,
      /\d+(?:\.\d+)?\s*(?:%|percent)\s*of\s*\d+/i,
      /\bconvert\s+-?\d/i,
      /\b(?:calculate|compute|how much is|what is)\s*[-\d(]/i,
      /\b(?:sum|total|average|percentage|ratio|square root|power)\b[^.?!]*\d/i,
    ],
  },
  {
    // Dimensions, geometry, layouts, locations.
    category: "SPATIAL",
    patterns: [
      /\b(?:area|perimeter|volume|square meters?|sqm|sq ft|m²|m³)\b/i,
      /\b(?:how many|fit|layout|spacing|width|height|length|dimensions?)\b[^.?!]*\b(?:room|wall|plot|roof|floor|tiles?|sheets?)\b/i,
      /\bhow many\b[^.?!]*\b(?:fit|tiles?|blocks?|sheets?|plots?)\b/i,
    ],
  },
  {
    // Sequence, duration, deadlines, historical states.
    category: "TEMPORAL",
    patterns: [
      /\b(?:how long|how many days?|how many weeks?|how many months?|deadline|due (?:by|date)|before|after|duration)\b/i,
      /\b(?:when (?:did|will|does|is))\b/i,
      /\bin how (?:long|much time)\b/i,
      /\bsequence|order of|first .* then\b/i,
    ],
  },
  {
    // Solutions satisfying multiple constraints.
    category: "CONSTRAINT",
    patterns: [
      /\b(?:must|has to|needs? to|have to)\b[^.?!]*\b(?:but|while|and|at most|at least|not exceed|within|under)\b/i,
      /\b(?:budget|limit|maximum|max|minimum|min|cap)\b[^.?!]*\b\d/i,
      /\bcannot exceed\b/i,
      /\b(?:within|under|no more than|at most)\b[^.?!]*\b(?:naira|₦|\$|kg|bags?|m|ft|days?|hours?)\b/i,
    ],
  },
  {
    // Likely causes of an observed problem.
    category: "DIAGNOSTIC",
    patterns: [
      /\bwhy (?:is|does|do|did|has)\b/i,
      /\bwhat'?s (?:wrong|causing|the problem)\b/i,
      /\b(?:troubleshoot|diagnose|debug|fix this issue)\b/i,
      /\b(?:leaking|cracking|failing|broken|not working|error)\b/i,
    ],
  },
  {
    // Ordered steps toward an objective.
    category: "PLANNING",
    patterns: [
      /\b(?:plan|roadmap|steps?|schedule)\b[^.?!]*\b(?:to|for|how)\b/i,
      /\bhow (?:do|can|should) (?:i|we)\b[^.?!]*\b(?:build|achieve|start|organize|prepare|get)\b/i,
      /\bwhat should (?:i|we) do (?:first|next)\b/i,
      /\bhelp me (?:plan|organize|schedule)\b/i,
    ],
  },
  {
    // Satisfy constraints while improving an objective.
    category: "OPTIMIZATION",
    patterns: [
      /\b(?:cheapest|cheaper|most cost[- ]effective|best value|minimi[sz]e|maximi[sz]e|optimal|most efficient|save (?:the )?most)\b/i,
      /\b(?:best way|best option)\b[^.?!]*\b(?:budget|cost|time|space)\b/i,
    ],
  },
];

export interface Classification {
  primary: ProblemCategory;
  /** Additional categories whose signals also fired. */
  secondary: ProblemCategory[];
  /** What evidence triggered the classification (auditable). */
  signals: string[];
}

/** Classify a problem message. Deterministic; never throws. */
export function classifyProblem(message: string): Classification {
  const hits: Array<{ category: ProblemCategory; signal: string }> = [];
  for (const sig of SIGNALS) {
    for (const pattern of sig.patterns) {
      const m = pattern.exec(message);
      if (m) {
        hits.push({ category: sig.category, signal: m[0].slice(0, 60) });
        break; // one signal per category is enough
      }
    }
  }
  if (hits.length === 0) {
    return { primary: "GENERIC", secondary: [], signals: [] };
  }
  // Order of first hit decides the primary category; later
  // distinct categories become secondary.
  const seen = new Set<ProblemCategory>();
  const ordered: ProblemCategory[] = [];
  for (const hit of hits) {
    if (!seen.has(hit.category)) {
      seen.add(hit.category);
      ordered.push(hit.category);
    }
  }
  // MULTI_DOMAIN when clearly spanning distinct reasoning modes
  const primary =
    ordered.length >= 3 ? "MULTI_DOMAIN" : ordered[0];
  const secondary = ordered.length >= 3 ? ordered.slice(0, 3) : ordered.slice(1);
  return {
    primary,
    secondary,
    signals: hits.map((h) => `${h.category}: ${h.signal}`),
  };
}

/** Simple problems must not be decomposed (spec §6). Bounded,
 *  deterministic complexity gate. */
export function problemIsComplex(message: string, classification: Classification): boolean {
  const words = message.trim().split(/\s+/).length;
  const clauseCount = message.split(/(?:\.|;|, (?:and|but|then|while))\s/).filter((c) => c.trim().length > 3).length;
  return words > 25 || clauseCount >= 3 || classification.primary === "MULTI_DOMAIN";
}
