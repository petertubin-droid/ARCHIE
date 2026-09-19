// =========================================================
// ARCHIE KNOWLEDGE REPOSITORY — TABLE REGISTRY
//
// The ONLY place the Project B knowledge table names are
// declared. Every repository operation goes through these
// constants; ARCHIE application code never writes a raw
// knowledge table name again (owner Phase 5 requirement).
// =========================================================

export const KNOWLEDGE_TABLES = {
  lexiconSources: "lexicon_sources",
  lexiconWords: "lexicon_words",
  lexiconSenses: "lexicon_senses",
  lexiconRelationships: "lexicon_relationships",
  lexiconSenseRelations: "lexicon_sense_relations",
  lexiconImports: "lexicon_imports",
  graphNodes: "semantic_graph_nodes",
  graphEdges: "semantic_graph_edges",
  graphImports: "semantic_graph_imports",
} as const;

export type KnowledgeTableName =
  (typeof KNOWLEDGE_TABLES)[keyof typeof KNOWLEDGE_TABLES];

/** Tables the gated ingestion path may write (Phase 5: all frozen). */
export const WRITABLE_KNOWLEDGE_TABLES: readonly KnowledgeTableName[] = [
  KNOWLEDGE_TABLES.lexiconSources,
  KNOWLEDGE_TABLES.lexiconWords,
  KNOWLEDGE_TABLES.lexiconSenses,
  KNOWLEDGE_TABLES.lexiconRelationships,
  KNOWLEDGE_TABLES.lexiconSenseRelations,
  KNOWLEDGE_TABLES.lexiconImports,
  KNOWLEDGE_TABLES.graphNodes,
  KNOWLEDGE_TABLES.graphEdges,
  KNOWLEDGE_TABLES.graphImports,
] as const;

/** Server-side RPCs of the knowledge subsystem (Project B). */
export const KNOWLEDGE_RPC = {
  graphHealth: "archie_graph_health",
  buildSemanticGraph: "archie_build_semantic_graph",
} as const;
