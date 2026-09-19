// =========================================================
// ARCHIE KNOWLEDGE REPOSITORY — ROW PROJECTION SEAM
// (the Phase 4B forward-compatibility point)
//
// CONTRACT: everything above this repository returns the
// CURRENT (Phase 4) canonical row shapes — edge rows carry
// `provenance` and `evidence` as TEXT — exactly the shapes the
// existing retrieval layers consume
// (semantic-graph/retrieval.ts GraphEdgeRow / GraphNodeRow).
//
// Phase 4B (provenance/evidence normalization) replaces the two
// text columns with integer FKs into reference tables. When 4B
// executes, ONLY THIS FILE and repository.ts change:
//
//   1. this file's edge select is rewritten to embed the
//      reference tables, e.g.
//        select('…,provenance_id,evidence_id,' +
//               'provenance(value):semantic_graph_edge_provenance_ref,' +
//               'evidence(value):semantic_graph_edge_evidence_ref')
//   2. projectEdgeRow() then maps
//        provenance: row.provenance?.value ?? ""
//        evidence:  row.evidence?.value ?? null
//      back onto the canonical text shape;
//   3. the client wrapper in repository.ts additionally rewrites
//      the explicit `provenance,evidence` column lists that the
//      existing retrieval layers select on semantic_graph_edges
//      (one wrapper, one place).
//
// No ARCHIE application code, retrieval layer, engine, or test
// fixture changes when 4B lands — that is the point of the seam.
//
// TODAY (Phase 4 schema): both functions are the identity
// mapping over text columns. Nothing to see — move along.
// =========================================================

import type {
  GraphEdgeRow,
  GraphNodeRow,
} from "../semantic-graph/retrieval.ts";

/**
 * Canonical edge column list (Phase 4 schema: text
 * provenance/evidence). The repository's own edge queries use
 * this constant so the 4B rewrite touches exactly one string.
 */
export const EDGE_COLUMNS =
  "id,source_concept_key,relation_type,target_concept_key,knowledge_status,confidence,provenance,evidence,domain,source_id,version,created_by,created_date,updated_date";

/** Canonical node column list (nodes are NOT part of 4B). */
export const NODE_COLUMNS =
  "id,concept_key,synset_key,canonical_name,sense_external_ids,description,domain,language,region,knowledge_status,confidence,source_id,provenance,version";

/**
 * Phase 4: pass-through. Phase 4B: maps ref-embedded edge rows
 * back onto the canonical text shape. Always returns the
 * canonical GraphEdgeRow.
 */
export function projectEdgeRow(
  row: GraphEdgeRow & Record<string, unknown>,
): GraphEdgeRow {
  // Phase 4 schema: the row already carries text columns.
  return {
    id: row.id,
    source_concept_key: row.source_concept_key,
    relation_type: row.relation_type,
    target_concept_key: row.target_concept_key,
    knowledge_status: row.knowledge_status,
    confidence: row.confidence,
    provenance: row.provenance,
    evidence: row.evidence,
    domain: row.domain,
    source_id: row.source_id,
    version: row.version,
  };
}

/** Phase 4: pass-through over text provenance (nodes unchanged by 4B). */
export function projectNodeRow(row: GraphNodeRow): GraphNodeRow {
  return row;
}
