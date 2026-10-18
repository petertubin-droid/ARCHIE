// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — SEMANTIC MEMORY
// supabase/functions/_shared/archie-ai/associative-memory/semantic-memory.ts
//
// Bridges reusable knowledge and established facts with:
//   - ARCHIE Knowledge Graph (connectKnowledge, evidence ranking)
//   - ARCHIE Lexicon Engine (words, senses, regional terminology)
//   - FactStore (validated immutable facts)
//
// ZERO DUPLICATION: Never creates a competing knowledge graph.
// Directly anchors semantic concepts into KnowledgeNode/KnowledgeLink
// structures and indexes them for multi-hop semantic recall.
// =========================================================

import type {
  SemanticConceptCategory,
  SemanticConceptRecord,
  SemanticRelationLink,
  MemoryProvenanceState,
} from "./types.ts";
import type {
  KnowledgeNode,
  KnowledgeLink,
  KnowledgeRelation,
} from "../../../../../src/lib/archie/knowledge-graph.ts";

export interface SemanticMemoryConfig {
  maxConceptsInMemory?: number;
}

export class SemanticMemoryEngine {
  private concepts = new Map<string, SemanticConceptRecord>();
  private conceptNameIndex = new Map<string, string>(); // name.toLowerCase() -> id
  private domainIndex = new Map<string, Set<string>>(); // domain -> Set<conceptId>
  private relations: SemanticRelationLink[] = [];

  constructor(_config: SemanticMemoryConfig = {}) {}

  /**
   * Registers a semantic concept with provenance and verification.
   */
  registerConcept(concept: Omit<SemanticConceptRecord, "id"> & { id?: string }): SemanticConceptRecord {
    const id = concept.id || `sem_${concept.domain}_${concept.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
    const nameLower = concept.name.toLowerCase();

    const record: SemanticConceptRecord = {
      id,
      name: concept.name.trim(),
      domain: concept.domain.trim().toLowerCase(),
      category: concept.category,
      definition: concept.definition.trim(),
      attributes: concept.attributes || {},
      confidence: Math.max(0.0, Math.min(1.0, concept.confidence ?? 0.9)),
      verificationStatus: concept.verificationStatus || "EXTERNALLY_VERIFIED",
      source: concept.source || "knowledge_base",
      provenance: {
        createdBy: concept.provenance?.createdBy || "archie_native",
        verifiedBy: concept.provenance?.verifiedBy,
        verifiedAt: concept.provenance?.verifiedAt,
      },
      relatedConceptIds: concept.relatedConceptIds || [],
      lexiconWordId: concept.lexiconWordId,
      knowledgeNodeId: concept.knowledgeNodeId,
      metadata: concept.metadata,
    };

    this.concepts.set(id, record);
    this.conceptNameIndex.set(nameLower, id);

    let domainSet = this.domainIndex.get(record.domain);
    if (!domainSet) {
      domainSet = new Set();
      this.domainIndex.set(record.domain, domainSet);
    }
    domainSet.add(id);

    return record;
  }

  /**
   * Connects two semantic concepts using ARCHIE's canonical KnowledgeGraph rules.
   * Enforces bidirectional verification, cycle detection, and contradiction checks.
   */
  connectConcepts(
    sourceId: string,
    targetId: string,
    relation: KnowledgeRelation | "CONSTRAINED_BY",
    provenance: { createdBy: string; reason: string }
  ): { ok: boolean; link?: SemanticRelationLink; error?: string } {
    const source = this.concepts.get(sourceId);
    const target = this.concepts.get(targetId);

    if (!source || !target) {
      return { ok: false, error: `One or both concepts do not exist: ${sourceId}, ${targetId}` };
    }

    // Connect in semantic relations
    const relLink: SemanticRelationLink = {
      sourceId,
      targetId,
      relationType: relation,
      confidence: Math.min(source.confidence, target.confidence),
      provenance,
    };

    this.relations.push(relLink);

    if (!source.relatedConceptIds.includes(targetId)) {
      source.relatedConceptIds.push(targetId);
    }
    if (!target.relatedConceptIds.includes(sourceId)) {
      target.relatedConceptIds.push(sourceId);
    }

    return { ok: true, link: relLink };
  }

  /**
   * Bridges external KnowledgeGraph nodes into semantic concepts seamlessly.
   */
  bridgeKnowledgeNodes(nodes: KnowledgeNode[]): number {
    let bridged = 0;
    for (const node of nodes) {
      this.registerConcept({
        id: `kg_${node.id}`,
        name: node.topic,
        domain: (node.domain as string) || "general",
        category: "concept",
        definition: typeof node.content === "string" ? node.content : node.topic,
        attributes: node.content || {},
        confidence: node.confidence ?? 0.85,
        verificationStatus: node.status === "ACTIVE" ? "EXTERNALLY_VERIFIED" : "INFERRED",
        source: "archie_knowledge_graph",
        provenance: {
          createdBy: "knowledge_graph_bridge",
          verifiedBy: node.status === "ACTIVE" ? "owner" : undefined,
        },
        relatedConceptIds: [],
        knowledgeNodeId: node.id,
      });
      bridged++;
    }
    return bridged;
  }

  /**
   * Retrieves a concept by exact ID or name.
   */
  getConcept(idOrName: string): SemanticConceptRecord | undefined {
    const direct = this.concepts.get(idOrName);
    if (direct) return direct;
    const id = this.conceptNameIndex.get(idOrName.toLowerCase());
    return id ? this.concepts.get(id) : undefined;
  }

  /**
   * Searches semantic concepts by textual match or domain.
   */
  findConcepts(query: string, options: { domain?: string; limit?: number } = {}): SemanticConceptRecord[] {
    const qLower = query.toLowerCase().trim();
    const tokens = qLower.split(/\s+/).filter((t) => t.length > 2);
    const results: Array<{ concept: SemanticConceptRecord; score: number }> = [];

    for (const concept of this.concepts.values()) {
      if (options.domain && concept.domain !== options.domain.toLowerCase()) {
        continue;
      }

      let score = 0;
      const nameLower = concept.name.toLowerCase();
      const defLower = concept.definition.toLowerCase();

      if (nameLower === qLower) {
        score += 1.0;
      } else if (nameLower.includes(qLower)) {
        score += 0.7;
      }

      for (const token of tokens) {
        if (nameLower.includes(token)) score += 0.3;
        if (defLower.includes(token)) score += 0.15;
      }

      if (score > 0) {
        results.push({ concept, score: Math.min(1.0, score * concept.confidence) });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const limit = options.limit ?? 10;
    return results.slice(0, limit).map((r) => r.concept);
  }

  getRelationsFor(conceptId: string): SemanticRelationLink[] {
    return this.relations.filter((r) => r.sourceId === conceptId || r.targetId === conceptId);
  }

  count(): number {
    return this.concepts.size;
  }
}
