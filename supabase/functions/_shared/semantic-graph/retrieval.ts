// =========================================================
// ARCHIE SEMANTIC KNOWLEDGE GRAPH — RETRIEVAL LAYER
//
// Deterministic, testable semantic-graph retrieval between
// ARCHIE's reasoning pathway and the graph tables:
//
//   concept lookup · concept identification from text ·
//   contextual concept selection (cooperates with the
//   lexicon contextual sense system) · neighbors ·
//   relationship tree · hierarchy · bounded multi-hop path
//   finding · concept comparison · graph health ·
//   ground truth for the live ARCHIE turn
//
// Principles (spec §§6, 11–17):
//   * only what the graph actually contains is returned —
//     never invented relations, never silent fabrication
//   * every relationship carries status + provenance so
//     ARCHIE can distinguish verified from learned from
//     unverified knowledge
//   * ambiguity is preserved: context narrows candidates via
//     the lexicon's sense system; without direct evidence the
//     candidates stay ranked + honest
//   * bounded traversal: configurable depth, per-node and
//     per-query limits — never the whole graph in context
//
// Pure TypeScript with zero runtime imports except the
// lexicon retrieval layer (same _shared tree) — runs
// identically in the Deno edge runtime and vitest.
// =========================================================

import {
  lexicalTokens,
  stem,
  lookupWords,
  selectContextualSenses,
  latestSourceLabel,
  type LexiconClient,
} from "../lexicon/retrieval.ts";
import {
  RELATION_TYPES,
  isKnownRelationType,
  CAUSAL_RELATION_TYPES,
} from "./relations.ts";

// ---------- types ----------

export interface GraphNodeRow {
  id: string;
  concept_key: string;
  synset_key: string | null;
  canonical_name: string;
  sense_external_ids: string[] | string;
  description: string | null;
  domain: string | null;
  language: string;
  region: string | null;
  knowledge_status: string;
  confidence: number | null;
  source_id: string | null;
  provenance: string;
  version: number;
}

export interface GraphEdgeRow {
  id: string;
  source_concept_key: string;
  relation_type: string;
  target_concept_key: string;
  knowledge_status: string;
  confidence: number | null;
  provenance: string;
  evidence: string | null;
  domain: string | null;
  source_id: string | null;
  version: number;
}

export interface GraphLookupOptions {
  /** Only VERIFIED knowledge by default; widening is always
   *  explicit, never silent (spec §13). */
  statuses?: string[];
  language?: string;
  /** Restrict traversal to specific relation types. */
  relationTypes?: string[];
  /** Restrict traversal to relation categories (spec §4). */
  categories?: string[];
  limit?: number;
}

/** Structural client (supabase-js subset) — satisfied by the
 *  archie-core service client and the test harness fake. */
/* The chainable supabase query builder shape is intentionally
 * loose — the concrete service client and the test fake both
 * satisfy it. */
/* eslint-disable @typescript-eslint/no-explicit-any -- builder shape */
export interface GraphClient extends LexiconClient {
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: any; error: any }>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEFAULT_STATUSES = ["VERIFIED"];

function optStatuses(opts: GraphLookupOptions): string[] {
  return opts.statuses ?? DEFAULT_STATUSES;
}

function allowedRelationTypes(opts: GraphLookupOptions): string[] | null {
  if (opts.relationTypes) return opts.relationTypes.filter(isKnownRelationType);
  if (opts.categories?.length) {
    return Object.values(RELATION_TYPES)
      .filter((spec) => opts.categories!.includes(spec.category))
      .map((spec) => spec.type);
  }
  return null;
}

function filterEdgesByRelationTypes(
  edges: GraphEdgeRow[],
  opts: GraphLookupOptions,
): GraphEdgeRow[] {
  const allowed = allowedRelationTypes(opts);
  if (!allowed) return edges;
  const set = new Set(allowed);
  return edges.filter((e) => set.has(e.relation_type));
}

// ---------- concept lookup ----------

/** One concept by its stable concept key. Honest when absent. */
export async function getConcept(
  svc: GraphClient,
  conceptKey: string,
  opts: GraphLookupOptions = {},
): Promise<GraphNodeRow | null> {
  const { data } = await svc
    .from("semantic_graph_nodes")
    .select(
      "id,concept_key,synset_key,canonical_name,sense_external_ids,description,domain,language,region,knowledge_status,confidence,source_id,provenance,version",
    )
    .eq("concept_key", conceptKey)
    .in("knowledge_status", optStatuses(opts))
    .limit(1);
  const rows = (data ?? []) as GraphNodeRow[];
  return rows[0] ?? null;
}

export interface WordConceptCandidate {
  conceptKey: string;
  canonicalName: string;
  definition: string;
  domain: string | null;
  partOfSpeech: string;
  synsetKey: string;
}

/** All concepts a word form can express (spec §2: word ≠
 *  concept — one word maps to MANY concept candidates through
 *  the lexicon's sense layer). */
export async function conceptsForWord(
  svc: GraphClient,
  form: string,
  opts: GraphLookupOptions = {},
): Promise<WordConceptCandidate[]> {
  const entries = await lookupWords(svc, [form], {
    statuses: optStatuses(opts),
    language: opts.language,
  });
  const out: WordConceptCandidate[] = [];
  const seen = new Set<string>();
  for (const { word, senses } of entries) {
    for (const sense of senses) {
      if (!sense.synset_key || seen.has(sense.synset_key)) continue;
      seen.add(sense.synset_key);
      out.push({
        conceptKey: sense.synset_key,
        canonicalName: word.canonical,
        definition: sense.definition,
        domain: sense.domain,
        partOfSpeech: word.part_of_speech,
        synsetKey: sense.synset_key,
      });
    }
  }
  return out;
}

export interface ConceptSelection {
  concepts: WordConceptCandidate[];
  selected: WordConceptCandidate | null;
  ambiguous: boolean;
  ranked: WordConceptCandidate[]; // ranked, deterministic — the honest priority order
  note: string;
}

/** Context-aware concept selection (spec §11). Cooperates
 *  with the lexicon contextual sense system AND the graph
 *  itself: the selected (or ranked) senses map directly to
 *  their concept (synset), and 1-hop graph neighborhoods add
 *  weak lexical evidence (neighbor names/definitions matching
 *  the context's words) — e.g. "How does a bank issue a
 *  mortgage?" ranks the financial concept first because its
 *  sourced graph neighborhood (commercial bank, credit union,
 *  financial institution) carries the mortgage context's
 *  vocabulary. Selection itself still requires DIRECT lexical
 *  evidence; graph evidence ranks candidates, it never alone
 *  resolves ambiguity (spec §6 — no invented certainty).
 *  Bounded: graph evidence is computed for at most the top
 *  8 concept candidates, 8 neighbors each. */
export async function selectContextualConcepts(
  svc: GraphClient,
  form: string,
  context: string,
  opts: GraphLookupOptions = {},
): Promise<ConceptSelection> {
  const concepts = await conceptsForWord(svc, form, opts);
  if (!concepts.length) {
    return {
      concepts: [],
      selected: null,
      ambiguous: true,
      ranked: [],
      note: "not in lexicon",
    };
  }
  const { selection } = await selectContextualSenses(svc, form, context, {
    statuses: optStatuses(opts),
    language: opts.language,
  });
  const bySynset = new Map(concepts.map((c) => [c.synsetKey, c] as const));

  // direct context stems (the word being disambiguated never
  // disambiguates itself)
  const targetForm = form.trim().toLowerCase();
  const targetStems = new Set([targetForm, stem(targetForm)]);
  const contextStems = new Set(
    lexicalTokens(context)
      .map(stem)
      .filter((st) => !targetStems.has(st) && st.length >= 3),
  );
  // weak-evidence vocabulary: definitions of the context's
  // OTHER words (top senses each) — lexical-field stems
  const chainStems = new Set<string>();
  for (const tok of lexicalTokens(context)) {
    if (targetStems.has(tok) || targetStems.has(stem(tok))) continue;
    const entries = await lookupWords(svc, [tok, stem(tok)], {
      statuses: optStatuses(opts),
      language: opts.language,
      limit: 8,
    });
    for (const e of entries) {
      for (const s of e.senses.slice(0, 3)) {
        for (const t of lexicalTokens(s.definition)) {
          const st = stem(t);
          if (st.length >= 4 && !contextStems.has(st)) chainStems.add(st);
        }
      }
    }
  }

  // best lexical score per concept (direct + chain, from the
  // lexicon sense ranking)
  const lexScored = new Map<string, { c: WordConceptCandidate; lex: number }>();
  for (const cand of selection.candidates) {
    const c = bySynset.get(cand.sense.synset_key);
    if (!c) continue;
    const lexScore = cand.score + 0.5 * cand.chainScore;
    const prev = lexScored.get(c.conceptKey);
    if (!prev || lexScore > prev.lex)
      lexScored.set(c.conceptKey, { c, lex: lexScore });
  }
  // concepts the sense system did not rank still get a base
  // entry so graph evidence can lift them
  for (const c of concepts) {
    if (!lexScored.has(c.conceptKey))
      lexScored.set(c.conceptKey, { c, lex: 0 });
  }

  // graph-neighborhood lexical evidence, bounded to the top 8
  // candidates by lexical score (deterministic tie-break)
  const pool = [...lexScored.values()]
    .sort(
      (a, b) => b.lex - a.lex || a.c.conceptKey.localeCompare(b.c.conceptKey),
    )
    .slice(0, 8);
  const keys = pool.map((x) => x.c.conceptKey);
  const { data: outEdges } = await svc
    .from("semantic_graph_edges")
    .select(
      "id,source_concept_key,relation_type,target_concept_key,knowledge_status,confidence,provenance,evidence,domain,source_id,version",
    )
    .in("source_concept_key", keys)
    .in("knowledge_status", optStatuses(opts))
    .limit(8 * keys.length);
  const { data: inEdges } = await svc
    .from("semantic_graph_edges")
    .select(
      "id,source_concept_key,relation_type,target_concept_key,knowledge_status,confidence,provenance,evidence,domain,source_id,version",
    )
    .in("target_concept_key", keys)
    .in("knowledge_status", optStatuses(opts))
    .limit(8 * keys.length);
  const neighborKeys = new Set<string>();
  for (const e of [
    ...((outEdges ?? []) as GraphEdgeRow[]),
    ...((inEdges ?? []) as GraphEdgeRow[]),
  ]) {
    neighborKeys.add(e.target_concept_key);
    neighborKeys.add(e.source_concept_key);
  }
  const { data: neighborNodes } = neighborKeys.size
    ? await svc
        .from("semantic_graph_nodes")
        .select(
          "id,concept_key,synset_key,canonical_name,sense_external_ids,description,domain,language,region,knowledge_status,confidence,source_id,provenance,version",
        )
        .in("concept_key", [...neighborKeys])
        .in("knowledge_status", optStatuses(opts))
    : { data: [] };
  const neighborsByKey = new Map<string, GraphNodeRow[]>();
  for (const e of [
    ...((outEdges ?? []) as GraphEdgeRow[]),
    ...((inEdges ?? []) as GraphEdgeRow[]),
  ]) {
    for (const [from, to] of [
      [e.source_concept_key, e.target_concept_key],
      [e.target_concept_key, e.source_concept_key],
    ] as const) {
      const list = neighborsByKey.get(from) ?? [];
      if (list.length < 8 && to !== from) list.push(to);
      neighborsByKey.set(from, list);
    }
  }
  const nodeByKey = new Map(
    ((neighborNodes ?? []) as GraphNodeRow[]).map(
      (n) => [n.concept_key, n] as const,
    ),
  );

  const graphScored = new Map<string, number>();
  for (const { c } of pool) {
    let graphScore = 0;
    let counted = 0;
    for (const nk of neighborsByKey.get(c.conceptKey) ?? []) {
      if (counted >= 8) break;
      const n = nodeByKey.get(nk);
      if (!n) continue;
      counted++;
      const nameStems = lexicalTokens(n.canonical_name).map(stem);
      const defStems = (n.description ? lexicalTokens(n.description) : []).map(
        stem,
      );
      for (const st of contextStems) {
        if (nameStems.includes(st)) graphScore += 0.75;
        else if (defStems.includes(st)) graphScore += 0.5;
      }
      for (const st of chainStems) {
        if (nameStems.includes(st)) graphScore += 0.6;
        else if (defStems.includes(st)) graphScore += 0.4;
      }
    }
    if (graphScore > 0) graphScored.set(c.conceptKey, Math.min(graphScore, 3));
  }

  const ranked = pool
    .map(({ c, lex }) => ({
      c,
      lex,
      total: lex + (graphScored.get(c.conceptKey) ?? 0),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.lex - a.lex ||
        a.c.conceptKey.localeCompare(b.c.conceptKey),
    )
    .map((x) => x.c);

  if (selection.selected) {
    const sel = bySynset.get(selection.selected.sense.synset_key) ?? null;
    return {
      concepts,
      selected: sel,
      ambiguous: false,
      ranked,
      note: selection.selected.reason,
    };
  }
  const graphHelped = pool.some(
    ({ c }) => (graphScored.get(c.conceptKey) ?? 0) > 0,
  );
  return {
    concepts,
    selected: null,
    ambiguous: true,
    ranked,
    note:
      selection.note +
      (graphHelped
        ? " — candidates ranked with 1-hop graph-neighborhood lexical evidence (weak, never resolving ambiguity alone)"
        : ""),
  };
}

// ---------- neighbors & relationship tree ----------

export interface NeighborEdge {
  edge: GraphEdgeRow;
  other: GraphNodeRow;
  direction: "outgoing" | "incoming";
}

/** 1-hop neighborhood of a concept, bounded (spec §14, §17). */
export async function getNeighbors(
  svc: GraphClient,
  conceptKey: string,
  opts: GraphLookupOptions = {},
): Promise<{ node: GraphNodeRow | null; neighbors: NeighborEdge[] }> {
  const node = await getConcept(svc, conceptKey, opts);
  if (!node) return { node: null, neighbors: [] };
  const limit = opts.limit ?? 24;

  const { data: outEdges } = await svc
    .from("semantic_graph_edges")
    .select(
      "id,source_concept_key,relation_type,target_concept_key,knowledge_status,confidence,provenance,evidence,domain,source_id,version",
    )
    .eq("source_concept_key", conceptKey)
    .in("knowledge_status", optStatuses(opts))
    .limit(limit);
  const { data: inEdges } = await svc
    .from("semantic_graph_edges")
    .select(
      "id,source_concept_key,relation_type,target_concept_key,knowledge_status,confidence,provenance,evidence,domain,source_id,version",
    )
    .eq("target_concept_key", conceptKey)
    .in("knowledge_status", optStatuses(opts))
    .limit(limit);

  const outRows = filterEdgesByRelationTypes(
    (outEdges ?? []) as GraphEdgeRow[],
    opts,
  );
  const inRows = filterEdgesByRelationTypes(
    (inEdges ?? []) as GraphEdgeRow[],
    opts,
  );

  const otherKeys = new Set<string>();
  for (const e of outRows) otherKeys.add(e.target_concept_key);
  for (const e of inRows) otherKeys.add(e.source_concept_key);
  const { data: nodesData } = await svc
    .from("semantic_graph_nodes")
    .select(
      "id,concept_key,synset_key,canonical_name,sense_external_ids,description,domain,language,region,knowledge_status,confidence,source_id,provenance,version",
    )
    .in("concept_key", [...otherKeys])
    .in("knowledge_status", optStatuses(opts));
  const byKey = new Map(
    ((nodesData ?? []) as GraphNodeRow[]).map(
      (n) => [n.concept_key, n] as const,
    ),
  );

  const neighbors: NeighborEdge[] = [];
  for (const e of outRows) {
    const other = byKey.get(e.target_concept_key);
    if (other) neighbors.push({ edge: e, other, direction: "outgoing" });
  }
  for (const e of inRows) {
    const other = byKey.get(e.source_concept_key);
    if (other) neighbors.push({ edge: e, other, direction: "incoming" });
  }
  return { node, neighbors };
}

export interface ConceptReport {
  node: GraphNodeRow;
  /** Grouped by relation type, §14 tree shape. */
  relations: Array<{
    relation_type: string;
    category: string | null;
    causal: boolean;
    edges: Array<{
      direction: "outgoing" | "incoming";
      other_concept_key: string;
      other_name: string;
      knowledge_status: string;
      provenance: string;
    }>;
  }>;
  relatedConceptCount: number;
  provenance: {
    source: string;
    knowledge_status: string;
    provenance: string;
  }[];
}

/** The §14 relationship tree for one concept — grouped by
 *  relation type, only relationships that actually exist. */
export async function conceptReport(
  svc: GraphClient,
  conceptKey: string,
  opts: GraphLookupOptions = {},
): Promise<ConceptReport | null> {
  const { node, neighbors } = await getNeighbors(svc, conceptKey, opts);
  if (!node) return null;

  const byType = new Map<
    string,
    {
      relation_type: string;
      category: string | null;
      causal: boolean;
      edges: ConceptReport["relations"][number]["edges"];
    }
  >();
  for (const { edge, other, direction } of neighbors) {
    let group = byType.get(edge.relation_type);
    if (!group) {
      const spec = RELATION_TYPES[edge.relation_type];
      group = {
        relation_type: edge.relation_type,
        category: spec?.category ?? null,
        causal: spec?.causal ?? false,
        edges: [],
      };
      byType.set(edge.relation_type, group);
    }
    group.edges.push({
      direction,
      other_concept_key: other.concept_key,
      other_name: other.canonical_name,
      knowledge_status: edge.knowledge_status,
      provenance: edge.provenance,
    });
  }
  return {
    node,
    relations: [...byType.values()].sort((a, b) =>
      a.relation_type.localeCompare(b.relation_type),
    ),
    relatedConceptCount: neighbors.length,
    provenance: [
      {
        source: node.source_id ?? "",
        knowledge_status: node.knowledge_status,
        provenance: node.provenance,
      },
    ],
  };
}

// ---------- hierarchy (spec §§1, 14) ----------

export interface ConceptHierarchy {
  concept: GraphNodeRow;
  /** IS_A chain upward (what is it a type of). */
  ancestors: Array<{
    concept_key: string;
    name: string;
    definition: string | null;
    depth: number;
  }>;
  /** HAS_TYPE members one level down (types of it). */
  subtypes: Array<{
    concept_key: string;
    name: string;
    definition: string | null;
  }>;
  truncated: boolean;
}

export async function getHierarchy(
  svc: GraphClient,
  conceptKey: string,
  opts: { maxDepth?: number } & GraphLookupOptions = {},
): Promise<ConceptHierarchy | null> {
  const maxDepth = Math.min(opts.maxDepth ?? 6, 12);
  const concept = await getConcept(svc, conceptKey, opts);
  if (!concept) return null;

  const ancestors: ConceptHierarchy["ancestors"] = [];
  let current = conceptKey;
  const visited = new Set<string>([conceptKey]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const { data: up } = await svc
      .from("semantic_graph_edges")
      .select("target_concept_key")
      .eq("source_concept_key", current)
      .eq("relation_type", "IS_A")
      .in("knowledge_status", optStatuses(opts))
      .limit(1);
    const next = ((up ?? []) as Array<{ target_concept_key: string }>)[0]
      ?.target_concept_key;
    if (!next || visited.has(next)) break;
    visited.add(next);
    const parent = await getConcept(svc, next, opts);
    if (!parent) break;
    ancestors.push({
      concept_key: parent.concept_key,
      name: parent.canonical_name,
      definition: parent.description,
      depth,
    });
    current = next;
  }

  const { data: down } = await svc
    .from("semantic_graph_edges")
    .select("source_concept_key")
    .eq("target_concept_key", conceptKey)
    .eq("relation_type", "IS_A")
    .in("knowledge_status", optStatuses(opts))
    .limit(20);
  const downKeys = ((down ?? []) as Array<{ source_concept_key: string }>)
    .map((r) => r.source_concept_key)
    .filter((k) => !visited.has(k));
  const { data: downNodes } = downKeys.length
    ? await svc
        .from("semantic_graph_nodes")
        .select(
          "id,concept_key,synset_key,canonical_name,sense_external_ids,description,domain,language,region,knowledge_status,confidence,source_id,provenance,version",
        )
        .in("concept_key", downKeys)
        .in("knowledge_status", optStatuses(opts))
    : { data: [] };
  const subtypes = ((downNodes ?? []) as GraphNodeRow[])
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
    .slice(0, 12)
    .map((n) => ({
      concept_key: n.concept_key,
      name: n.canonical_name,
      definition: n.description,
    }));

  return {
    concept,
    ancestors,
    subtypes,
    truncated: ancestors.length >= maxDepth,
  };
}

// ---------- bounded multi-hop path finding (spec §15) ----------

export interface GraphPathStep {
  from_concept_key: string;
  relation_type: string;
  direction: "outgoing" | "incoming";
  to_concept_key: string;
}

export interface FoundPath {
  classification: "DIRECT RELATIONSHIP" | "MULTI-HOP RELATIONSHIP";
  path: GraphPathStep[];
  /** Node names along the path for readable answers. */
  names: string[];
}

export async function findPaths(
  svc: GraphClient,
  fromKey: string,
  toKey: string,
  opts: {
    maxDepth?: number;
    maxPaths?: number;
    expansionLimit?: number;
  } & GraphLookupOptions = {},
): Promise<{
  paths: FoundPath[];
  note: string;
}> {
  const maxDepth = Math.min(opts.maxDepth ?? 3, 5);
  const maxPaths = opts.maxPaths ?? 5;
  const expansionLimit = opts.expansionLimit ?? 40;
  const statuses = optStatuses(opts);
  const allowed = allowedRelationTypes(opts);

  if (fromKey === toKey) {
    return { paths: [], note: "same concept — no traversal needed" };
  }

  const fromNode = await getConcept(svc, fromKey, opts);
  const toNode = await getConcept(svc, toKey, opts);
  if (!fromNode || !toNode) {
    return { paths: [], note: "one or both concepts are not in the graph" };
  }

  // BFS over 1-hop expansions (bounded per node)
  const frontier: Array<{ key: string; path: GraphPathStep[] }> = [
    { key: fromKey, path: [] },
  ];
  const visited = new Set<string>([fromKey]);
  const found: FoundPath[] = [];

  for (let depth = 1; depth <= maxDepth && found.length < maxPaths; depth++) {
    const nextFrontier: Array<{ key: string; path: GraphPathStep[] }> = [];
    for (const frame of frontier) {
      if (frame.path.length >= depth) continue;
      const { neighbors } = await getNeighbors(svc, frame.key, {
        ...opts,
        statuses,
        limit: expansionLimit,
      });
      const edges = allowed
        ? neighbors.filter((n) => allowed.includes(n.edge.relation_type))
        : neighbors;
      for (const { edge, direction } of edges) {
        const step: GraphPathStep =
          direction === "outgoing"
            ? {
                from_concept_key: edge.source_concept_key,
                relation_type: edge.relation_type,
                direction,
                to_concept_key: edge.target_concept_key,
              }
            : {
                from_concept_key: edge.target_concept_key,
                relation_type: edge.relation_type,
                direction,
                to_concept_key: edge.source_concept_key,
              };
        const path = [...frame.path, step];
        if (step.to_concept_key === toKey) {
          found.push({
            classification:
              path.length === 1
                ? "DIRECT RELATIONSHIP"
                : "MULTI-HOP RELATIONSHIP",
            path,
            names: [],
          });
          continue;
        }
        if (!visited.has(step.to_concept_key)) {
          visited.add(step.to_concept_key);
          nextFrontier.push({ key: step.to_concept_key, path });
        }
      }
    }
    frontier.push(...nextFrontier);
    if (!nextFrontier.length) break;
  }

  if (!found.length) {
    return {
      paths: [],
      note: `no path found within ${maxDepth} hops — this does not mean the concepts are unrelated beyond that bound`,
    };
  }

  // resolve readable names along each path
  const nameCache = new Map<string, string>();
  nameCache.set(fromKey, fromNode.canonical_name);
  nameCache.set(toKey, toNode.canonical_name);
  for (const p of found) {
    const keys = [fromKey, ...p.path.map((s) => s.to_concept_key)];
    const missing = [...new Set(keys)].filter((k) => !nameCache.has(k));
    if (missing.length) {
      const { data } = await svc
        .from("semantic_graph_nodes")
        .select("concept_key,canonical_name")
        .in("concept_key", missing)
        .in("knowledge_status", statuses)
        .limit(missing.length);
      for (const n of (data ?? []) as Array<{
        concept_key: string;
        canonical_name: string;
      }>) {
        nameCache.set(n.concept_key, n.canonical_name);
      }
    }
    p.names = keys.map((k) => nameCache.get(k) ?? k);
  }
  return {
    paths: found.slice(0, maxPaths),
    note:
      found[0].path.length === 1
        ? "direct relationship"
        : "traversed through intermediate concepts — never presented as a direct relationship",
  };
}

// ---------- concept comparison (spec §1) ----------

export async function compareConcepts(
  svc: GraphClient,
  keyA: string,
  keyB: string,
  opts: GraphLookupOptions = {},
): Promise<{
  a: GraphNodeRow | null;
  b: GraphNodeRow | null;
  directRelations: Array<{
    relation_type: string;
    direction: "a→b" | "b→a";
    knowledge_status: string;
    provenance: string;
  }>;
  sharedAncestors: Array<{ concept_key: string; name: string }>;
  paths: FoundPath[];
  note: string;
}> {
  const a = await getConcept(svc, keyA, opts);
  const b = await getConcept(svc, keyB, opts);
  if (!a || !b) {
    return {
      a,
      b,
      directRelations: [],
      sharedAncestors: [],
      paths: [],
      note: "one or both concepts are not in the graph",
    };
  }
  const { neighbors: aOut } = await getNeighbors(svc, keyA, {
    ...opts,
    limit: 200,
  });
  const directRelations = [];
  for (const { edge, direction } of aOut) {
    if (direction === "outgoing" && edge.target_concept_key === keyB) {
      directRelations.push({
        relation_type: edge.relation_type,
        direction: "a→b" as const,
        knowledge_status: edge.knowledge_status,
        provenance: edge.provenance,
      });
    }
    if (direction === "incoming" && edge.source_concept_key === keyB) {
      directRelations.push({
        relation_type: edge.relation_type,
        direction: "b→a" as const,
        knowledge_status: edge.knowledge_status,
        provenance: edge.provenance,
      });
    }
  }
  const [hierA, hierB] = await Promise.all([
    getHierarchy(svc, keyA, opts),
    getHierarchy(svc, keyB, opts),
  ]);
  const mapB = new Map(
    (hierB?.ancestors ?? []).map((x) => [x.concept_key, x.name] as const),
  );
  const sharedAncestors = (hierA?.ancestors ?? [])
    .filter((x) => mapB.has(x.concept_key))
    .map((x) => ({ concept_key: x.concept_key, name: x.name }));
  const { paths } = await findPaths(svc, keyA, keyB, { ...opts, maxDepth: 3 });
  return {
    a,
    b,
    directRelations,
    sharedAncestors,
    paths,
    note: directRelations.length
      ? "direct relationship(s) exist"
      : sharedAncestors.length
        ? "no direct relationship — connected through shared taxonomic ancestors"
        : paths.length
          ? "connected through multi-hop paths only"
          : "no relationship found within the bounded traversal",
  };
}

// ---------- graph health dashboard (spec §19) ----------

export interface GraphHealth {
  total_nodes: number;
  total_edges: number;
  relation_type_breakdown: Record<string, number>;
  node_status_breakdown: Record<string, number>;
  edge_status_breakdown: Record<string, number>;
  orphan_nodes: number;
  duplicate_candidates: number;
  missing_provenance: { nodes: number; edges: number };
  circular_relationships: { self_loops: number; is_a_two_cycles: number };
  invalid_relationship_types: number;
  unverified_nodes: number;
  unverified_edges: number;
  graph_version: number;
  last_ingestion: Record<string, unknown> | null;
  /** Computed against the TS registry (the SQL mirror in
   *  archie_graph_health() is cross-checked here). */
  registry_unknown_types: string[];
}

export async function graphHealth(
  svc: GraphClient,
): Promise<GraphHealth | null> {
  if (!svc.rpc) return null;
  const { data, error } = await svc.rpc("archie_graph_health");
  if (error || !data) return null;
  const raw = data as Record<string, unknown>;
  const breakdown = (raw.relation_type_breakdown ?? {}) as Record<
    string,
    number
  >;
  return {
    total_nodes: Number(raw.total_nodes ?? 0),
    total_edges: Number(raw.total_edges ?? 0),
    relation_type_breakdown: breakdown,
    node_status_breakdown: (raw.node_status_breakdown ?? {}) as Record<
      string,
      number
    >,
    edge_status_breakdown: (raw.edge_status_breakdown ?? {}) as Record<
      string,
      number
    >,
    orphan_nodes: Number(raw.orphan_nodes ?? 0),
    duplicate_candidates: Number(raw.duplicate_candidates ?? 0),
    missing_provenance: raw.missing_provenance as {
      nodes: number;
      edges: number;
    },
    circular_relationships: raw.circular_relationships as {
      self_loops: number;
      is_a_two_cycles: number;
    },
    invalid_relationship_types: Number(raw.invalid_relationship_types ?? 0),
    unverified_nodes: Number(raw.unverified_nodes ?? 0),
    unverified_edges: Number(raw.unverified_edges ?? 0),
    graph_version: Number(raw.graph_version ?? 1),
    last_ingestion: (raw.last_ingestion ?? null) as Record<
      string,
      unknown
    > | null,
    registry_unknown_types: Object.keys(breakdown).filter(
      (t) => !isKnownRelationType(t),
    ),
  };
}

// ---------- ground truth for the live ARCHIE turn (spec §12) ----------

export interface SemanticGraphGroundTruth {
  block: string;
  termsExamined: number;
  conceptsIdentified: Array<{
    term: string;
    concept: string;
    conceptKey: string;
  }>;
  conceptsAmbiguous: string[];
  edgesRetrieved: number;
}

/**
 * Build the semantic-graph ground-truth block injected into
 * ARCHIE's system context (spec §12 — the live reasoning
 * pathway: concept identification → graph retrieval →
 * relationship traversal → ARCHIE reasoning).
 *
 * Deterministic, bounded, honest: only concepts the lexicon
 * actually supports are shown; ambiguity is stated; every
 * relation carries its knowledge status; causal relations
 * are marked sourced, never presented as unsourced fact.
 */
export async function semanticGraphGroundTruth(
  svc: GraphClient,
  message: string,
  opts: {
    maxTerms?: number;
    maxIdentified?: number;
    neighborsPerConcept?: number;
    /** Total edge budget across ALL neighborhood retrievals
     *  (identified + ambiguous top candidates) — bounded by
     *  default, never the whole graph in context. */
    edgeBudget?: number;
  } & GraphLookupOptions = {},
): Promise<SemanticGraphGroundTruth> {
  const maxTerms = opts.maxTerms ?? 6;
  const maxIdentified = opts.maxIdentified ?? 3;
  const neighborsPerConcept = opts.neighborsPerConcept ?? 8;
  const edgeBudget = opts.edgeBudget ?? 24;

  const tokens = Array.from(new Set(lexicalTokens(message)))
    .filter((t) => t.length >= 3)
    .slice(0, maxTerms);

  // the CURRENT edition label (never hardcoded — an edition
  // upgrade must never leave stale provenance in the block)
  const sourceLabel = await latestSourceLabel(svc);

  const lines: string[] = [];
  const conceptsIdentified: SemanticGraphGroundTruth["conceptsIdentified"] = [];
  const conceptsAmbiguous: string[] = [];
  let edgesRetrieved = 0;

  for (const term of tokens) {
    if (conceptsIdentified.length >= maxIdentified) break;
    try {
      const sel = await selectContextualConcepts(svc, term, message, opts);
      if (!sel.concepts.length) continue;

      if (sel.selected) {
        const c = sel.selected;
        if (edgesRetrieved >= edgeBudget) {
          // budget exhausted: identify the concept without a
          // neighborhood — honest omission, still bounded
          conceptsIdentified.push({
            term,
            concept: c.definition,
            conceptKey: c.conceptKey,
          });
          lines.push(
            `- "${term}" → concept (${c.definition}) [VERIFIED, ${sourceLabel}] — relationship budget exhausted for this turn`,
          );
          continue;
        }
        const { neighbors } = await getNeighbors(svc, c.conceptKey, {
          ...opts,
          limit: Math.min(neighborsPerConcept, edgeBudget - edgesRetrieved),
        });
        // getNeighbors' limit applies per direction; the
        // budget is enforced on the final edge count
        const budgeted = neighbors.slice(0, edgeBudget - edgesRetrieved);
        edgesRetrieved += budgeted.length;
        conceptsIdentified.push({
          term,
          concept: c.definition,
          conceptKey: c.conceptKey,
        });
        const rels = budgeted
          .map(({ edge, other, direction }) => {
            const dir = direction === "outgoing" ? "→" : "←";
            const status =
              edge.knowledge_status === "VERIFIED"
                ? ""
                : ` [${edge.knowledge_status}]`;
            const causalFlag = CAUSAL_RELATION_TYPES.includes(
              edge.relation_type,
            )
              ? " (sourced causal)"
              : "";
            return `${edge.relation_type}${causalFlag}${dir} ${other.canonical_name}${status}`;
          })
          .join("; ");
        lines.push(
          `- "${term}" → concept (${c.definition}) [VERIFIED, ${sourceLabel}]${rels ? ` — relationships: ${rels}` : " — no stored relationships yet"}`,
        );
      } else {
        conceptsAmbiguous.push(term);
        const shown = sel.ranked.slice(0, 3).length
          ? sel.ranked.slice(0, 3)
          : sel.concepts.slice(0, 3);
        // the TOP-RANKED candidate's graph neighborhood is also
        // included — always labeled as a candidate, never as
        // resolved (spec §§6, 13)
        const top = sel.ranked[0] ?? sel.concepts[0];
        let topRels = "";
        if (top && edgesRetrieved < edgeBudget) {
          const { neighbors } = await getNeighbors(svc, top.conceptKey, {
            ...opts,
            limit: Math.min(neighborsPerConcept, edgeBudget - edgesRetrieved),
          });
          const budgeted = neighbors.slice(0, edgeBudget - edgesRetrieved);
          edgesRetrieved += budgeted.length;
          topRels = budgeted
            .map(({ edge, other, direction }) => {
              const dir = direction === "outgoing" ? "→" : "←";
              const status =
                edge.knowledge_status === "VERIFIED"
                  ? ""
                  : ` [${edge.knowledge_status}]`;
              const causalFlag = CAUSAL_RELATION_TYPES.includes(
                edge.relation_type,
              )
                ? " (sourced causal)"
                : "";
              return `${edge.relation_type}${causalFlag}${dir} ${other.canonical_name}${status}`;
            })
            .join("; ");
        }
        lines.push(
          `- "${term}" → ambiguous in this message; candidates: ${shown
            .map((c) => `(${c.definition}) [VERIFIED, ${sourceLabel}]`)
            .join(" | ")}` +
            (top && topRels
              ? ` — top candidate (${top.definition}) relationships [CANDIDATE, ranked by lexical/graph evidence, never resolved]: ${topRels}`
              : ""),
        );
      }
    } catch {
      // graph failure for one term never blocks the turn —
      // the term is simply not represented (honest omission)
      continue;
    }
  }

  if (!lines.length) {
    return {
      block: "",
      termsExamined: tokens.length,
      conceptsIdentified,
      conceptsAmbiguous,
      edgesRetrieved,
    };
  }
  const block =
    "Semantic knowledge graph ground truth from ARCHIE's graph engine (concepts and sourced relationships; every relation carries its knowledge status — cite them, never contradict them, never present unverified relations as fact):\n" +
    lines.join("\n");
  return {
    block,
    termsExamined: tokens.length,
    conceptsIdentified,
    conceptsAmbiguous,
    edgesRetrieved,
  };
}
