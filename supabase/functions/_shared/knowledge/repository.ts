// =========================================================
// ARCHIE KNOWLEDGE REPOSITORY — THE CENTRALIZED ABSTRACTION
// (Phase 5; server-side ONLY — never imported from src/)
//
// Every ARCHIE knowledge operation against Project B goes
// through this module:
//
//   lexicon words · senses · synset relationships · sense
//   relationships · graph nodes · graph edges · traversal ·
//   provenance/evidence · ingestion (gated) · graph health.
//
// It is a THIN binding layer: the deterministic retrieval logic
// stays in the existing, engine-owned layers
// (lexicon/retrieval.ts, semantic-graph/retrieval.ts — both
// unchanged), and this repository binds them to a Project B
// client built from Edge Function secrets. Cutover (Phase 7)
// is a client-factory swap: no engine or retrieval code changes.
//
// Security architecture (owner-approved):
//   * server-side only; this file must never be imported by
//     anything under src/ (the Netlify bundle).
//   * credentials come exclusively from
//     KNOWLEDGE_DB_URL / KNOWLEDGE_SERVICE_ROLE_KEY
//     (see config.ts); nothing is hardcoded.
//   * the browser NEVER connects to Project B through this
//     path; the anon-key chat bridge (remote-bridge.ts) is a
//     separate, pre-existing application channel.
//   * ingestion is gated by KNOWLEDGE_WRITES_ENABLED —
//     default DISABLED, honoring the knowledge-write freeze.
//   * Project A's own Supabase configuration is not read or
//     changed here.
// =========================================================

import { createClient as defaultCreateClient } from "npm:@supabase/supabase-js@2";
import {
  loadKnowledgeConfig,
  knowledgeOrigin,
  type KnowledgeConfigResult,
} from "./config.ts";
import { KNOWLEDGE_TABLES, KNOWLEDGE_RPC } from "./tables.ts";
import { EDGE_COLUMNS, projectEdgeRow } from "./projection.ts";
import type {
  GraphClient,
  GraphEdgeRow,
  GraphNodeRow,
  GraphHealth,
} from "../semantic-graph/retrieval.ts";
import type {
  LexiconWordRow,
  LexiconSenseRow,
  LexiconSourceRow,
  LookupOptions,
  ContextualSelection,
} from "../lexicon/retrieval.ts";
import {
  lookupWords as lexLookupWords,
  lookupWord as lexLookupWord,
  selectContextualSenses as lexSelectContextualSenses,
  getSynonyms as lexGetSynonyms,
  getAntonyms as lexGetAntonyms,
  getSenseRelations as lexGetSenseRelations,
  getRelatedWords as lexGetRelatedWords,
  latestSourceLabel as lexLatestSourceLabel,
} from "../lexicon/retrieval.ts";
import {
  getConcept,
  conceptsForWord,
  selectContextualConcepts,
  getNeighbors,
  conceptReport,
  getHierarchy,
  findPaths,
  compareConcepts,
  graphHealth,
  semanticGraphGroundTruth,
} from "../semantic-graph/retrieval.ts";

// ---------- failures ----------

/** Project B is not configured / misconfigured — fail safe, no credentials inside. */
export class KnowledgeConfigError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "KnowledgeConfigError";
    this.reason = reason;
  }
}

/** Ingestion attempted while the knowledge-write freeze gate is closed. */
export class KnowledgeWriteDisabledError extends Error {
  constructor() {
    super(
      "ARCHIE knowledge ingestion is disabled (KNOWLEDGE_WRITES_ENABLED is not 'true'). The knowledge-write freeze is active.",
    );
    this.name = "KnowledgeWriteDisabledError";
  }
}

// ---------- types ----------

/** Rows of the two ingestion ledgers (provenance trail). */
export interface KnowledgeImportRow {
  id: string;
  [key: string]: unknown;
}

export interface KnowledgeRepository {
  /** Project B origin, safe for logs (host only). */
  readonly origin: string;
  /** Whether the gated ingestion path is unlocked. */
  readonly writesEnabled: boolean;

  /**
   * The bound Project B client in the CANONICAL Phase 4 row
   * shapes (text provenance/evidence — see projection.ts).
   * Used by the existing retrieval layers; Phase 4B adapts the
   * edge reads INSIDE this repository, not in callers.
   */
  graphClient(): GraphClient;

  // ---- lexicon -----------------------------------------------------------
  lexicon: {
    /** Word lookup (word + its senses). */
    lookup(
      form: string,
      opts?: LookupOptions,
    ): Promise<Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }>>;
    lookupMany(
      forms: string[],
      opts?: LookupOptions,
    ): Promise<Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }>>;
    /** Contextual sense selection (never fabricated certainty). */
    contextualSenses(
      form: string,
      context: string,
      opts?: LookupOptions,
    ): Promise<{ word: LexiconWordRow | null; selection: ContextualSelection }>;
    synonyms(
      synsetKey: string,
      excludeExternalId?: string,
      opts?: LookupOptions,
    ): Promise<
      Array<{ word: string; partOfSpeech: string; definition: string }>
    >;
    antonyms(
      senseExternalId: string,
      opts?: LookupOptions,
    ): Promise<Array<{ word: string; definition: string }>>;
    /** Sense relationships (lexicon_sense_relations). */
    senseRelations(
      senseExternalId: string,
      types?: string[],
      opts?: LookupOptions,
    ): Promise<Array<{ relation_type: string; to_sense_external_id: string }>>;
    /** Synset relationships (lexicon_relationships). */
    relatedWords(
      synsetKey: string,
      relationTypes?: string[],
      opts?: LookupOptions,
    ): Promise<
      Array<{ relationType: string; word: string; definition: string }>
    >;
    /** Provenance: the latest lexicon source label (e.g. OEWN edition). */
    latestSourceLabel(): Promise<string>;
    sources(): Promise<LexiconSourceRow[]>;
  };

  // ---- semantic graph ----------------------------------------------------
  graph: {
    /** Semantic node lookup. */
    concept(
      conceptKey: string,
      opts?: Parameters<typeof getConcept>[2],
    ): Promise<GraphNodeRow | null>;
    conceptsForWord(
      form: string,
      opts?: Parameters<typeof conceptsForWord>[2],
    ): Promise<
      ReturnType<typeof conceptsForWord> extends Promise<infer T> ? T : never
    >;
    contextualConcepts(
      form: string,
      context: string,
      opts?: Parameters<typeof selectContextualConcepts>[3],
    ): ReturnType<typeof selectContextualConcepts> extends Promise<infer T>
      ? T
      : never;
    /** Semantic edge lookup: the edges touching a concept. */
    neighbors(
      conceptKey: string,
      opts?: Parameters<typeof getNeighbors>[2],
    ): Promise<
      ReturnType<typeof getNeighbors> extends Promise<infer T> ? T : never
    >;
    report(
      conceptKey: string,
      opts?: Parameters<typeof conceptReport>[2],
    ): Promise<
      ReturnType<typeof conceptReport> extends Promise<infer T> ? T : never
    >;
    /** Graph traversal: bounded hierarchy. */
    hierarchy(
      conceptKey: string,
      opts?: Parameters<typeof getHierarchy>[2],
    ): Promise<
      ReturnType<typeof getHierarchy> extends Promise<infer T> ? T : never
    >;
    /** Graph traversal: bounded path finding between concepts. */
    paths(
      fromKey: string,
      toKey: string,
      opts?: Parameters<typeof findPaths>[3],
    ): ReturnType<typeof findPaths> extends Promise<infer T> ? T : never;
    compare(
      keyA: string,
      keyB: string,
      opts?: Parameters<typeof compareConcepts>[3],
    ): ReturnType<typeof compareConcepts> extends Promise<infer T> ? T : never;
    /** Ground-truth block for the live ARCHIE turn (bounded budget). */
    groundTruth(
      message: string,
      opts?: Parameters<typeof semanticGraphGroundTruth>[2],
    ): ReturnType<typeof semanticGraphGroundTruth> extends Promise<infer T>
      ? T
      : never;
  };

  // ---- provenance / evidence ---------------------------------------------
  provenance: {
    /** Full provenance/evidence record for one edge (text shape). */
    forEdge(edgeId: string): Promise<GraphEdgeRow | null>;
    /** Provenance for a node (concept provenance string + source). */
    forNode(conceptKey: string): Promise<GraphNodeRow | null>;
    /** The knowledge ingestion ledgers (lexicon + graph). */
    lexiconImports(): Promise<KnowledgeImportRow[]>;
    graphImports(): Promise<KnowledgeImportRow[]>;
  };

  // ---- health --------------------------------------------------------------
  /** Graph-health query (archie_graph_health RPC, read-only). */
  health(): Promise<GraphHealth | null>;

  // ---- ingestion (GATED — freeze active by default) ----------------------
  ingestion: {
    readonly enabled: boolean;
    upsertSources(rows: LexiconSourceRow[]): Promise<void>;
    insertWords(rows: Record<string, unknown>[]): Promise<void>;
    insertSenses(rows: Record<string, unknown>[]): Promise<void>;
    insertSynsetRelations(rows: Record<string, unknown>[]): Promise<void>;
    insertSenseRelations(rows: Record<string, unknown>[]): Promise<void>;
    recordLexiconImport(row: Record<string, unknown>): Promise<void>;
    recordGraphImport(row: Record<string, unknown>): Promise<void>;
    /** Rebuild the semantic graph (archie_build_semantic_graph RPC). */
    rebuildSemanticGraph(): Promise<Record<string, unknown>>;
  };
}

export type KnowledgeRepositoryResult =
  | { ok: true; repository: KnowledgeRepository }
  | { ok: false; error: KnowledgeConfigError };

// ---------- construction ----------

export interface KnowledgeRepositoryOptions {
  /**
   * Client factory indirection (also the Phase 4B seam): the
   * Deno runtime uses supabase-js; tests inject the harness
   * fake. The default is the real supabase-js createClient.
   */
  clientFactory?: (url: string, serviceKey: string) => GraphClient;
  /** Config override (tests); production reads the env. */
  config?: KnowledgeConfigResult;
}

export function createKnowledgeRepository(
  opts: KnowledgeRepositoryOptions = {},
): KnowledgeRepositoryResult {
  const configResult = opts.config ?? loadKnowledgeConfig();
  if (!configResult.ok) {
    return {
      ok: false,
      error: new KnowledgeConfigError(
        configResult.reason,
        configResult.message,
      ),
    };
  }
  const { url, serviceKey, writesEnabled } = configResult.config;
  const factory = opts.clientFactory ?? defaultCreateClient;
  let client: GraphClient | null = null;

  const getClient = (): GraphClient => {
    if (!client) {
      client = factory(url, serviceKey);
    }
    return client;
  };

  const write = async (
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> => {
    if (!writesEnabled) throw new KnowledgeWriteDisabledError();
    const { error } = await getClient().from(table).insert(rows).select("id");
    if (error) {
      throw new Error(
        `Knowledge ingestion into ${table} failed (Project B ${knowledgeOrigin(url)}): ${error.message ?? "unknown error"}`,
      );
    }
  };

  const repository: KnowledgeRepository = {
    origin: knowledgeOrigin(url),
    writesEnabled,

    graphClient: () => getClient(),

    lexicon: {
      lookup: (form, o) => lexLookupWord(getClient(), form, o),
      lookupMany: (forms, o) => lexLookupWords(getClient(), forms, o),
      contextualSenses: (form, context, o) =>
        lexSelectContextualSenses(getClient(), form, context, o),
      synonyms: (synsetKey, exclude, o) =>
        lexGetSynonyms(getClient(), synsetKey, exclude, o),
      antonyms: (senseExternalId, o) =>
        lexGetAntonyms(getClient(), senseExternalId, o),
      senseRelations: (senseExternalId, types, o) =>
        lexGetSenseRelations(getClient(), senseExternalId, types, o),
      relatedWords: (synsetKey, relationTypes, o) =>
        lexGetRelatedWords(getClient(), synsetKey, relationTypes, o),
      latestSourceLabel: () => lexLatestSourceLabel(getClient()),
      sources: async () => {
        const svc = getClient();
        const { data } = await svc
          .from(KNOWLEDGE_TABLES.lexiconSources)
          .select("id,name,dataset,version,license,attribution,url");
        return (data ?? []) as unknown as LexiconSourceRow[];
      },
    },

    graph: {
      concept: (key, o) => getConcept(getClient(), key, o),
      conceptsForWord: (form, o) => conceptsForWord(getClient(), form, o),
      contextualConcepts: (form, context, o) =>
        selectContextualConcepts(getClient(), form, context, o),
      neighbors: (key, o) => getNeighbors(getClient(), key, o),
      report: (key, o) => conceptReport(getClient(), key, o),
      hierarchy: (key, o) => getHierarchy(getClient(), key, o),
      paths: (a, b, o) => findPaths(getClient(), a, b, o),
      compare: (a, b, o) => compareConcepts(getClient(), a, b, o),
      groundTruth: (message, o) =>
        semanticGraphGroundTruth(getClient(), message, o),
    },

    provenance: {
      forEdge: async (edgeId) => {
        const { data } = await getClient()
          .from(KNOWLEDGE_TABLES.graphEdges)
          .select(EDGE_COLUMNS)
          .eq("id", edgeId)
          .limit(1);
        const rows = (data ?? []) as Array<
          GraphEdgeRow & Record<string, unknown>
        >;
        return rows[0] ? projectEdgeRow(rows[0]) : null;
      },
      forNode: (conceptKey) => getConcept(getClient(), conceptKey),
      lexiconImports: async () => {
        const { data } = await getClient()
          .from(KNOWLEDGE_TABLES.lexiconImports)
          .select("*")
          .order("created_date", { ascending: false })
          .limit(20);
        return (data ?? []) as KnowledgeImportRow[];
      },
      graphImports: async () => {
        const { data } = await getClient()
          .from(KNOWLEDGE_TABLES.graphImports)
          .select("*")
          .order("created_date", { ascending: false })
          .limit(20);
        return (data ?? []) as KnowledgeImportRow[];
      },
    },

    // archie_graph_health is a heavy aggregation (~5-7s on Project B's
    // micro compute). A transient failure under load must not read as
    // "unknown" in status surfaces: one bounded retry, then the
    // documented null degradation (persistent outages still degrade).
    health: async () => {
      const first = await graphHealth(getClient());
      if (first) return first;
      await new Promise((resolve) => setTimeout(resolve, 750));
      return graphHealth(getClient());
    },

    ingestion: {
      get enabled() {
        return writesEnabled;
      },
      upsertSources: (rows) =>
        writesEnabled
          ? write(
              KNOWLEDGE_TABLES.lexiconSources,
              rows as Record<string, unknown>[],
            )
          : Promise.reject(new KnowledgeWriteDisabledError()),
      insertWords: (rows) => write(KNOWLEDGE_TABLES.lexiconWords, rows),
      insertSenses: (rows) => write(KNOWLEDGE_TABLES.lexiconSenses, rows),
      insertSynsetRelations: (rows) =>
        write(KNOWLEDGE_TABLES.lexiconRelationships, rows),
      insertSenseRelations: (rows) =>
        write(KNOWLEDGE_TABLES.lexiconSenseRelations, rows),
      recordLexiconImport: async (row) => {
        if (!writesEnabled) throw new KnowledgeWriteDisabledError();
        await write(KNOWLEDGE_TABLES.lexiconImports, [row]);
      },
      recordGraphImport: async (row) => {
        if (!writesEnabled) throw new KnowledgeWriteDisabledError();
        await write(KNOWLEDGE_TABLES.graphImports, [row]);
      },
      rebuildSemanticGraph: async () => {
        if (!writesEnabled) throw new KnowledgeWriteDisabledError();
        const svc = getClient();
        if (!svc.rpc) throw new Error("Project B client does not support rpc");
        const { data, error } = await svc.rpc(KNOWLEDGE_RPC.buildSemanticGraph);
        if (error) {
          throw new Error(
            `Semantic graph rebuild failed (Project B ${knowledgeOrigin(url)}): ${error.message ?? "unknown error"}`,
          );
        }
        return (data ?? {}) as Record<string, unknown>;
      },
    },
  };

  return { ok: true, repository };
}
