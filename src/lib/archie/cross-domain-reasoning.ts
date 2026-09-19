// =========================================================
// FRELUX PHASE 9, ARCHIE CROSS-DOMAIN REASONING
//
// ARCHIE connects knowledge ACROSS domains when a real,
// REGISTERED relation exists between them:
//
//   Architecture + climate + local materials + market prices
//   + labour + regulations + language + weather
//   → a regionally appropriate construction recommendation.
//
// ANTI-FABRICATION RULE (spec §10): a relation between two
// domains is only usable when explicitly registered with a
// rationale. The reasoner NEVER invents a relationship merely
// because two domains exist; unlinked domains are excluded
// with a recorded reason.
// =========================================================

import { archieDomains } from "./domains";
import type { DomainRelation, DomainSelectionResult } from "./phase9-types";

/**
 * Registered cross-domain relations. Each carries its rationale
 * so any recommendation can explain WHY the domains connect.
 * Extensible: new relations are data, added through the same
 * governance as domains.
 */
export const DOMAIN_RELATIONS: readonly DomainRelation[] = [
  {
    from_domain: "architecture",
    to_domain: "regional_practices",
    relation: "practiced_as",
    rationale:
      "Design intent is executed through regional construction practice.",
  },
  {
    from_domain: "architecture",
    to_domain: "regulations_standards",
    relation: "complies_with",
    rationale:
      "Buildings must comply with regional building standards where reliable information exists.",
  },
  {
    from_domain: "architecture",
    to_domain: "construction",
    relation: "executed_through",
    rationale: "Buildings are realized by construction methods.",
  },
  {
    from_domain: "architecture",
    to_domain: "climate_environment",
    relation: "designed_for",
    rationale: "Buildings respond to their climate zone.",
  },
  {
    from_domain: "construction",
    to_domain: "costing",
    relation: "costed_by",
    rationale: "Construction work is quantified and costed.",
  },
  {
    from_domain: "costing",
    to_domain: "business",
    relation: "priced_in_market",
    rationale: "Costs are validated against market economics.",
  },
  {
    from_domain: "construction",
    to_domain: "weather_intelligence",
    relation: "scheduled_around",
    rationale: "Wet trades and exterior work depend on weather windows.",
  },
  {
    from_domain: "painting_finishes",
    to_domain: "weather_intelligence",
    relation: "sensitive_to",
    rationale: "Paint cure and application quality depend on weather.",
  },
  {
    from_domain: "structural",
    to_domain: "science",
    relation: "grounded_in",
    rationale: "Structural rules derive from physics/materials science.",
  },
  {
    from_domain: "quantity_surveying",
    to_domain: "costing",
    relation: "feeds",
    rationale: "Quantities drive cost estimates.",
  },
  {
    from_domain: "property",
    to_domain: "business",
    relation: "valued_by",
    rationale: "Property value is a market/finance question.",
  },
  {
    from_domain: "project_planning",
    to_domain: "construction",
    relation: "sequences",
    rationale: "Plans order construction activities.",
  },
  {
    from_domain: "regional_practices",
    to_domain: "regional_market",
    relation: "priced_by",
    rationale: "Regional practice determines what materials and rates apply.",
  },
  {
    from_domain: "regional_market",
    to_domain: "costing",
    relation: "calibrates",
    rationale:
      "Market observations calibrate cost commentary (never calculator math).",
  },
  {
    from_domain: "regional_practices",
    to_domain: "language_intelligence",
    relation: "expressed_in",
    rationale: "Regional terminology is language-bound.",
  },
  {
    from_domain: "crypto_intelligence",
    to_domain: "business",
    relation: "analyzed_within",
    rationale:
      "Crypto market analysis is a financial/business analysis context.",
  },
  {
    from_domain: "project_planning",
    to_domain: "planning_productivity",
    relation: "shared_methods",
    rationale:
      "Project planning and personal planning share scheduling methods.",
  },
  {
    from_domain: "planning_productivity",
    to_domain: "health_fitness",
    relation: "supports_routine",
    rationale: "Daily plans schedule fitness and wellness routines.",
  },
  {
    from_domain: "health_fitness",
    to_domain: "science",
    relation: "evidence_from",
    rationale: "Fitness guidance draws on exercise/nutrition science.",
  },
  {
    from_domain: "writing",
    to_domain: "language_intelligence",
    relation: "uses",
    rationale: "Writing quality is language intelligence.",
  },
  {
    from_domain: "regional_practices",
    to_domain: "regulations_standards",
    relation: "governed_by",
    rationale:
      "Regional practice must comply with local standards where reliable information exists.",
  },
];

/** Adjacency map built once from the relation list. */
function buildAdjacency(): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const r of DOMAIN_RELATIONS) {
    if (!adj.has(r.from_domain)) adj.set(r.from_domain, new Set());
    if (!adj.has(r.to_domain)) adj.set(r.to_domain, new Set());
    adj.get(r.from_domain)!.add(r.to_domain);
    adj.get(r.to_domain)!.add(r.from_domain);
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

/** Direct relation lookup with rationale (for explanations). */
export function relationBetween(
  a: string,
  b: string,
): DomainRelation | undefined {
  return DOMAIN_RELATIONS.find(
    (r) =>
      (r.from_domain === a && r.to_domain === b) ||
      (r.from_domain === b && r.to_domain === a),
  );
}

/**
 * Select the domains relevant to a query context. A domain is
 * included when it is (transitively, within the registered
 * relation graph) connected to the anchor domains mentioned by
 * the context. Unconnected registered domains are EXCLUDED with
 * an explicit reason — never silently dragged in.
 */
export function selectRelevantDomains(input: {
  anchor_domains: string[];
  all_domains?: string[];
  /** Max graph hops; keeps reasoning context-sensitive. */
  max_hops?: number;
}): DomainSelectionResult {
  const maxHops = input.max_hops ?? 2;
  const all = input.all_domains ?? archieDomains.list().map((d) => d.key);
  const anchors = input.anchor_domains.filter((a) => all.includes(a));

  const selected = new Set<string>(anchors);
  // BFS over the registered relation graph.
  let frontier = [...anchors];
  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = [];
    for (const d of frontier) {
      for (const n of ADJACENCY.get(d) ?? []) {
        if (all.includes(n) && !selected.has(n)) {
          selected.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }

  const excluded = all
    .filter((d) => !selected.has(d))
    .map((d) => ({
      domain: d,
      reason:
        "No registered relation path to the anchor domains within " +
        `${maxHops} hops; cross-domain context is never fabricated.`,
    }));

  return { selected: [...selected], excluded };
}

/**
 * Verify a claimed cross-domain connection is justified.
 * Used by the learning pipeline: a candidate that asserts a
 * cross-domain relationship must resolve to a REGISTERED
 * relation, otherwise it is flagged, not accepted.
 */
export function assertRelationJustified(
  a: string,
  b: string,
): { ok: true; relation: DomainRelation } | { ok: false; error: string } {
  const rel = relationBetween(a, b);
  if (rel) return { ok: true, relation: rel };
  return {
    ok: false,
    error:
      `No registered relation between "${a}" and "${b}". ` +
      `Cross-domain reasoning requires an explicit registered relation with rationale.`,
  };
}
