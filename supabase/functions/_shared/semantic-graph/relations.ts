// =========================================================
// ARCHIE SEMANTIC KNOWLEDGE GRAPH — RELATIONSHIP REGISTRY
//
// The single authority for graph relationship types (spec §4):
// categories, semantic type registry, lexicon→graph mapping
// and direction metadata. Pure TypeScript, zero runtime
// imports — runs identically in the Deno edge runtime and
// vitest.
//
// Principles:
//   * extensible: adding a type = adding one registry entry
//   * no fabrication: lexicon relations map ONLY to semantic
//     types whose sourced meaning they directly carry; the
//     provenance string preserves the original relation so
//     ARCHIE can always answer "why do you believe this?"
//   * every type declares its category, so retrieval can
//     filter by category (taxonomic, causal, …) as well as
//     by exact type
// =========================================================

// ---------- categories ----------

export const RELATION_CATEGORIES = [
  "TAXONOMIC",
  "PART_WHOLE",
  "FUNCTIONAL",
  "CAUSAL",
  "PROPERTY",
  "ASSOCIATIVE",
  "TEMPORAL",
  "SPATIAL",
  "COMPARATIVE",
  "DOMAIN",
] as const;

export type RelationCategory = (typeof RELATION_CATEGORIES)[number];

// ---------- registry ----------

export interface RelationTypeSpec {
  /** Semantic relation name as stored in semantic_graph_edges. */
  type: string;
  category: RelationCategory;
  /** Human explanation of the relationship semantics. */
  description: string;
  /** Inverse type, when the relation has a declared opposite
   *  direction (IS_A ↔ HAS_TYPE). Used for readable traversal,
   *  never to invent edges that are not stored. */
  inverse?: string;
  /** True when the relation asserts causation — retrieval must
   *  never present these without status/provenance (spec §6). */
  causal?: boolean;
}

export const RELATION_TYPES: Record<string, RelationTypeSpec> = {
  // TAXONOMIC — type hierarchies
  IS_A: {
    type: "IS_A",
    category: "TAXONOMIC",
    inverse: "HAS_TYPE",
    description: "source concept is a kind/type of target concept",
  },
  TYPE_OF: {
    type: "TYPE_OF",
    category: "TAXONOMIC",
    inverse: "HAS_TYPE",
    description: "source concept is a type of target concept (alias of IS_A)",
  },
  SUBTYPE_OF: {
    type: "SUBTYPE_OF",
    category: "TAXONOMIC",
    inverse: "HAS_TYPE",
    description:
      "source concept is a subtype of target concept (alias of IS_A)",
  },
  HAS_TYPE: {
    type: "HAS_TYPE",
    category: "TAXONOMIC",
    inverse: "IS_A",
    description: "target concept is a kind/type of source concept",
  },

  // PART_WHOLE — composition
  PART_OF: {
    type: "PART_OF",
    category: "PART_WHOLE",
    inverse: "HAS_PART",
    description:
      "source concept is a part/component/member/substance of target concept",
  },
  HAS_PART: {
    type: "HAS_PART",
    category: "PART_WHOLE",
    inverse: "PART_OF",
    description:
      "target concept is a part/component/member/substance of source concept",
  },
  CONTAINS: {
    type: "CONTAINS",
    category: "PART_WHOLE",
    inverse: "COMPONENT_OF",
    description:
      "source concept contains target concept (spatial or compositional)",
  },
  COMPONENT_OF: {
    type: "COMPONENT_OF",
    category: "PART_WHOLE",
    inverse: "CONTAINS",
    description: "source concept is a component of target concept",
  },

  // FUNCTIONAL — use and operation
  USED_FOR: {
    type: "USED_FOR",
    category: "FUNCTIONAL",
    description:
      "source concept is used for the purpose/activity of target concept",
  },
  USED_BY: {
    type: "USED_BY",
    category: "FUNCTIONAL",
    description:
      "source concept is typically used by/employed by target concept",
  },
  REQUIRES: {
    type: "REQUIRES",
    category: "FUNCTIONAL",
    description: "source concept requires target concept",
  },
  PRODUCES: {
    type: "PRODUCES",
    category: "FUNCTIONAL",
    description: "source concept produces target concept",
  },
  CONSUMES: {
    type: "CONSUMES",
    category: "FUNCTIONAL",
    description: "source concept consumes target concept",
  },
  OPERATES_ON: {
    type: "OPERATES_ON",
    category: "FUNCTIONAL",
    description: "source concept operates on target concept",
  },

  // CAUSAL — only ever created from properly sourced
  // relations; retrieval must carry status + provenance.
  CAUSES: {
    type: "CAUSES",
    category: "CAUSAL",
    causal: true,
    description: "source concept causes target concept",
  },
  CAN_CAUSE: {
    type: "CAN_CAUSE",
    category: "CAUSAL",
    causal: true,
    description: "source concept can cause target concept",
  },
  RESULTS_IN: {
    type: "RESULTS_IN",
    category: "CAUSAL",
    causal: true,
    description: "source concept results in target concept",
  },
  PREVENTS: {
    type: "PREVENTS",
    category: "CAUSAL",
    causal: true,
    description: "source concept prevents target concept",
  },
  REDUCES: {
    type: "REDUCES",
    category: "CAUSAL",
    causal: true,
    description: "source concept reduces target concept",
  },

  // PROPERTY
  HAS_PROPERTY: {
    type: "HAS_PROPERTY",
    category: "PROPERTY",
    description: "source concept has target concept as a property",
  },
  HAS_ATTRIBUTE: {
    type: "HAS_ATTRIBUTE",
    category: "PROPERTY",
    description: "source concept has target concept as an attribute",
  },
  HAS_STATE: {
    type: "HAS_STATE",
    category: "PROPERTY",
    description: "source concept can be in the state of target concept",
  },

  // ASSOCIATIVE
  RELATED_TO: {
    type: "RELATED_TO",
    category: "ASSOCIATIVE",
    description:
      "source concept is related to target concept (sourced association)",
  },
  ASSOCIATED_WITH: {
    type: "ASSOCIATED_WITH",
    category: "ASSOCIATIVE",
    description:
      "source concept is associated with target concept (sourced association)",
  },

  // TEMPORAL — where properly supported
  PRECEDES: {
    type: "PRECEDES",
    category: "TEMPORAL",
    description: "source concept precedes target concept",
  },
  FOLLOWS: {
    type: "FOLLOWS",
    category: "TEMPORAL",
    description: "source concept follows target concept",
  },
  OCCURS_DURING: {
    type: "OCCURS_DURING",
    category: "TEMPORAL",
    description: "source concept occurs during target concept",
  },

  // SPATIAL — where applicable
  LOCATED_IN: {
    type: "LOCATED_IN",
    category: "SPATIAL",
    description: "source concept is located in target concept",
  },
  CONTAINS_LOCATION: {
    type: "CONTAINS_LOCATION",
    category: "SPATIAL",
    description: "source concept contains the location target concept",
  },
  ADJACENT_TO: {
    type: "ADJACENT_TO",
    category: "SPATIAL",
    description: "source concept is adjacent to target concept",
  },

  // COMPARATIVE — where established
  SIMILAR_TO: {
    type: "SIMILAR_TO",
    category: "COMPARATIVE",
    description:
      "source concept is similar to target concept (sourced similarity)",
  },
  DIFFERENT_FROM: {
    type: "DIFFERENT_FROM",
    category: "COMPARATIVE",
    description: "source concept is different from target concept",
  },
  CONTRASTS_WITH: {
    type: "CONTRASTS_WITH",
    category: "COMPARATIVE",
    description:
      "source concept contrasts with (is the opposite of) target concept",
  },

  // DOMAIN — domains are metadata, never hard-coded
  USED_IN_DOMAIN: {
    type: "USED_IN_DOMAIN",
    category: "DOMAIN",
    description:
      "source concept belongs to the knowledge domain target concept",
  },
  SPECIALIZED_TERM_IN: {
    type: "SPECIALIZED_TERM_IN",
    category: "DOMAIN",
    description:
      "source concept is a specialized term in the domain target concept",
  },
};

export function isKnownRelationType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(RELATION_TYPES, type);
}

export function relationCategory(type: string): RelationCategory | null {
  return RELATION_TYPES[type]?.category ?? null;
}

export function relationTypesInCategories(
  categories: RelationCategory[],
): string[] {
  return Object.values(RELATION_TYPES)
    .filter((spec) => categories.includes(spec.category))
    .map((spec) => spec.type);
}

/** Causal types — callers presenting these must include
 *  status + provenance (spec §§4–6). */
export const CAUSAL_RELATION_TYPES: string[] = Object.values(RELATION_TYPES)
  .filter((s) => s.causal)
  .map((s) => s.type);

// ---------- lexicon → graph mapping (spec §7) ----------
//
// The Universal Lexicon is the initial lexical foundation.
// Each mapping below maps a sourced OEWN relation to the
// semantic relation whose meaning it DIRECTLY carries. The
// original relation type is preserved in the edge provenance
// string; nothing is inferred, collapsed or invented.

export interface LexiconRelationMapping {
  lexiconRelation: string;
  lexiconTable: "lexicon_relationships" | "lexicon_sense_relations";
  graphRelation: string;
  /** Directional semantics note stored in edge evidence. */
  note: string;
}

export const LEXICON_RELATION_MAPPINGS: LexiconRelationMapping[] = [
  // synset-level (lexicon_relationships)
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "HYPERNYM",
    graphRelation: "IS_A",
    note: "OEWN HYPERNYM: source synset is a kind of the target synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "HYPONYM",
    graphRelation: "HAS_TYPE",
    note: "OEWN HYPONYM: the target synset is a kind of the source synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "MERONYM_PART",
    graphRelation: "HAS_PART",
    note: "OEWN MERONYM_PART: the target synset is a part of the source synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "MERONYM_MEMBER",
    graphRelation: "HAS_PART",
    note: "OEWN MERONYM_MEMBER: the target synset is a member of the source synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "MERONYM_SUBSTANCE",
    graphRelation: "HAS_PART",
    note: "OEWN MERONYM_SUBSTANCE: the target synset is a substance of the source synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "HOLONYM_PART_OF",
    graphRelation: "PART_OF",
    note: "OEWN HOLONYM_PART_OF: the source synset is a part of the target synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "HOLONYM_MEMBER_OF",
    graphRelation: "PART_OF",
    note: "OEWN HOLONYM_MEMBER_OF: the source synset is a member of the target synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "HOLONYM_SUBSTANCE_OF",
    graphRelation: "PART_OF",
    note: "OEWN HOLONYM_SUBSTANCE_OF: the source synset is a substance of the target synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "SIMILAR_TO",
    graphRelation: "SIMILAR_TO",
    note: "OEWN SIMILAR_TO: adjective clusters express sourced similarity",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "ALSO_SEE",
    graphRelation: "RELATED_TO",
    note: "OEWN ALSO_SEE: sourced related-meaning pointer",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "ATTRIBUTE",
    graphRelation: "RELATED_TO",
    note: "OEWN ATTRIBUTE: noun/attribute ↔ adjective pairing",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "EXEMPLIFIES",
    graphRelation: "RELATED_TO",
    note: "OEWN EXEMPLIFIES: sourced usage-domain exemplification",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "ENTAILMENT",
    graphRelation: "REQUIRES",
    note: "OEWN ENTAILMENT: performing the source verb entails the target verb",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "CAUSES",
    graphRelation: "CAUSES",
    note: "OEWN CAUSES: performing the source verb causes the target verb state",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "DOMAIN_TOPIC",
    graphRelation: "USED_IN_DOMAIN",
    note: "OEWN DOMAIN_TOPIC: the source synset belongs to the topic domain of the target synset",
  },
  {
    lexiconTable: "lexicon_relationships",
    lexiconRelation: "DOMAIN_REGION",
    graphRelation: "USED_IN_DOMAIN",
    note: "OEWN DOMAIN_REGION: the source synset belongs to the regional domain of the target synset",
  },
  // sense-level (lexicon_sense_relations) — collapsed to concept
  // (synset) level with deduplication by the materialization
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ANTONYM",
    graphRelation: "CONTRASTS_WITH",
    note: "OEWN ANTONYM: opposite word senses, both sourced",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "DERIVATION",
    graphRelation: "RELATED_TO",
    note: "OEWN DERIVATION: word-family derivation (same concept family)",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "PERTAINYM",
    graphRelation: "RELATED_TO",
    note: "OEWN PERTAINYM: pertaining-to relation, both sourced",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ALSO_SEE",
    graphRelation: "RELATED_TO",
    note: "OEWN sense-level ALSO_SEE: sourced related-meaning pointer",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "EXEMPLIFIES",
    graphRelation: "RELATED_TO",
    note: "OEWN sense-level EXEMPLIFIES: usage-domain exemplification",
  },
  // ROLE_* family: sourced thematic-role pointers (agent,
  // instrument, result, …). Mapped conservatively to
  // RELATED_TO — the precise role is preserved in provenance
  // and never silently upgraded to a stronger claim.
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_AGENT",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_AGENT: the noun sense denotes the typical agent of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_EVENT",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_EVENT: the noun sense denotes the event of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_RESULT",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_RESULT: the noun sense denotes the result of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_BY_MEANS_OF",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_BY_MEANS_OF: means-of relation between senses",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_UNDERGOER",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_UNDERGOER: the noun sense denotes the undergoer of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_INSTRUMENT",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_INSTRUMENT: the noun sense denotes the typical instrument of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_USES",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_USES: the verb sense typically uses the noun sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_STATE",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_STATE: the noun sense denotes the state of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_PROPERTY",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_PROPERTY: the noun sense denotes a property of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_LOCATION",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_LOCATION: the noun sense denotes the typical location of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_MATERIAL",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_MATERIAL: the noun sense denotes the typical material of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_VEHICLE",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_VEHICLE: the noun sense denotes the typical vehicle of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_BODY_PART",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_BODY_PART: the noun sense denotes the typical body part of the verb sense",
  },
  {
    lexiconTable: "lexicon_sense_relations",
    lexiconRelation: "ROLE_DESTINATION",
    graphRelation: "RELATED_TO",
    note: "OEWN ROLE_DESTINATION: the noun sense denotes the typical destination of the verb sense",
  },
];

/** Provenance prefix stamped on every lexicon-derived edge
 *  (matches the materialization in
 *  20260920100000_archie_semantic_graph_engine.sql). */
export const LEXICON_EDGE_PROVENANCE =
  "Open English WordNet (CC BY 4.0) — sourced lexicon materialization";

export function lexiconMappingFor(
  lexiconTable: LexiconRelationMapping["lexiconTable"],
  lexiconRelation: string,
): LexiconRelationMapping | null {
  return (
    LEXICON_RELATION_MAPPINGS.find(
      (m) =>
        m.lexiconTable === lexiconTable &&
        m.lexiconRelation === lexiconRelation,
    ) ?? null
  );
}
