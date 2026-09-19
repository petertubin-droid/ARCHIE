-- =========================================================
-- ARCHIE SEMANTIC KNOWLEDGE GRAPH ENGINE (spec §SEMANTIC-GRAPH)
--
-- The structured semantic layer on top of the Universal Lexicon
-- Engine. Concepts (one per verified WordNet synset) and their
-- sourced relationships, with provenance, confidence and
-- knowledge status on every row.
--
--   semantic_graph_nodes   — concepts: normalized concept_key,
--                            canonical name, linked lexical
--                            sense ids, description, domain,
--                            language/region, status,
--                            confidence, provenance, version
--   semantic_graph_edges   — relationships: source/target
--                            concept keys, relation type,
--                            provenance, evidence, domain,
--                            status, confidence, version
--   semantic_graph_imports — ingestion ledger: real counts,
--                            never estimates
--
-- Functions:
--   archie_build_semantic_graph() — materialize the initial
--       graph from the live lexicon (idempotent, set-based)
--   archie_graph_health()        — the graph health dashboard
--       (real database state, never cached assumptions)
--
-- Principles (spec §§3–6):
--   * a concept is a MEANING, not a word: one node per synset,
--     so "bank" (financial) and "bank" (river) are separate
--     concept nodes linked to their own senses
--   * no fabricated knowledge: every edge is mapped from a
--     sourced OEWN relation; the original relation is
--     preserved in provenance; only relations whose sourced
--     meaning directly matches a graph relation type are
--     mapped (mapping table in _shared/semantic-graph/relations.ts)
--   * VERIFIED / LEARNED / USER_PROVIDED / UNVERIFIED statuses
--     — unverified knowledge is never presented as fact
--   * domains are metadata (domain column + USED_IN_DOMAIN
--     edges), never hard-coded
--   * deterministic, idempotent: re-runs update/insert safely
--
-- RLS mirrors the lexicon engine exactly: admins manage,
-- authenticated users read VERIFIED rows (plus their own
-- USER_PROVIDED rows), service role (edge functions) has full
-- access, anon gets nothing.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Concept nodes
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.semantic_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_key text NOT NULL UNIQUE,       -- for lexicon concepts = synset_key ("14828345-n")
  synset_key text,                        -- back-reference into the lexicon (spec §7: reference, never duplicate)
  canonical_name text NOT NULL,
  sense_external_ids jsonb NOT NULL DEFAULT '[]',  -- linked lexical sense ids (word ≠ concept)
  description text,
  domain text,                            -- metadata (e.g. "noun.artifact", "computing")
  language text NOT NULL DEFAULT 'en',
  region text,
  knowledge_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (knowledge_status IN ('VERIFIED','LEARNED','USER_PROVIDED','UNVERIFIED')),
  confidence numeric,                     -- 1.0 only when directly sourced; else null
  source_id uuid REFERENCES public.lexicon_sources(id),
  provenance text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by uuid,                        -- for USER_PROVIDED entries (owner attribution)
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_graph_nodes_synset_idx
  ON public.semantic_graph_nodes (synset_key);
CREATE INDEX IF NOT EXISTS semantic_graph_nodes_name_idx
  ON public.semantic_graph_nodes (canonical_name, language);
CREATE INDEX IF NOT EXISTS semantic_graph_nodes_domain_idx
  ON public.semantic_graph_nodes (domain);
CREATE INDEX IF NOT EXISTS semantic_graph_nodes_status_idx
  ON public.semantic_graph_nodes (knowledge_status);

-- ---------------------------------------------------------
-- 2. Relationships
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.semantic_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_key text NOT NULL REFERENCES public.semantic_graph_nodes(concept_key) ON DELETE CASCADE,
  relation_type text NOT NULL,            -- registry in _shared/semantic-graph/relations.ts (extensible)
  target_concept_key text NOT NULL REFERENCES public.semantic_graph_nodes(concept_key) ON DELETE CASCADE,
  knowledge_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (knowledge_status IN ('VERIFIED','LEARNED','USER_PROVIDED','UNVERIFIED')),
  confidence numeric,
  provenance text NOT NULL DEFAULT '',    -- e.g. "Open English WordNet (CC BY 4.0) ... via lexicon_relationships: HYPERNYM"
  evidence text,                          -- direction/semantics note from the source dataset
  domain text,
  source_id uuid REFERENCES public.lexicon_sources(id),
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_concept_key, relation_type, target_concept_key)
);

CREATE INDEX IF NOT EXISTS semantic_graph_edges_source_idx
  ON public.semantic_graph_edges (source_concept_key, relation_type);
CREATE INDEX IF NOT EXISTS semantic_graph_edges_target_idx
  ON public.semantic_graph_edges (target_concept_key, relation_type);
CREATE INDEX IF NOT EXISTS semantic_graph_edges_type_idx
  ON public.semantic_graph_edges (relation_type);
CREATE INDEX IF NOT EXISTS semantic_graph_edges_status_idx
  ON public.semantic_graph_edges (knowledge_status);

-- ---------------------------------------------------------
-- 3. Ingestion ledger — honest, auditable imports
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.semantic_graph_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'LEXICON_MATERIALIZE',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING','SUCCESS','FAILED','PARTIAL')),
  stats jsonb NOT NULL DEFAULT '{}',
  errors jsonb NOT NULL DEFAULT '[]',
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- 4. RLS — mirrors the lexicon engine policies exactly
-- ---------------------------------------------------------
ALTER TABLE public.semantic_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_graph_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage semantic graph nodes" ON public.semantic_graph_nodes;
CREATE POLICY "admins manage semantic graph nodes"
  ON public.semantic_graph_nodes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users read verified semantic graph nodes" ON public.semantic_graph_nodes;
CREATE POLICY "users read verified semantic graph nodes"
  ON public.semantic_graph_nodes FOR SELECT TO authenticated
  USING (knowledge_status = 'VERIFIED'
         OR (knowledge_status = 'USER_PROVIDED' AND created_by = auth.uid()));

DROP POLICY IF EXISTS "admins manage semantic graph edges" ON public.semantic_graph_edges;
CREATE POLICY "admins manage semantic graph edges"
  ON public.semantic_graph_edges FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users read verified semantic graph edges" ON public.semantic_graph_edges;
CREATE POLICY "users read verified semantic graph edges"
  ON public.semantic_graph_edges FOR SELECT TO authenticated
  USING (knowledge_status = 'VERIFIED'
         OR (knowledge_status = 'USER_PROVIDED' AND created_by = auth.uid()));

DROP POLICY IF EXISTS "admins manage semantic graph imports" ON public.semantic_graph_imports;
CREATE POLICY "admins manage semantic graph imports"
  ON public.semantic_graph_imports FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- service role (edge functions) has full access; anon gets nothing
GRANT ALL ON public.semantic_graph_nodes TO service_role;
GRANT ALL ON public.semantic_graph_edges TO service_role;
GRANT ALL ON public.semantic_graph_imports TO service_role;
REVOKE ALL ON public.semantic_graph_nodes, public.semantic_graph_edges, public.semantic_graph_imports
  FROM anon, authenticated;

-- ---------------------------------------------------------
-- 5. Initial graph materialization (spec §18: automatic
--    lexicon integration — no separate ingestion phase)
--
--    Idempotent: ON CONFLICT upsert. Honest: the ledger row
--    records REAL counts from actual row operations — never
--    estimates.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_build_semantic_graph()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_started timestamptz := now();
  v_import_id uuid;
  v_nodes_before bigint;
  v_edges_before bigint;
  v_nodes_after bigint;
  v_edges_after bigint;
  v_nodes_touched bigint;
  v_synset_edges_ins bigint;
  v_sense_edges_ins bigint;
  v_unmapped_rel_rows bigint;
  v_synset_rel_rows bigint;
  v_sense_rel_rows bigint;
  v_sense_pairs_skipped bigint;
  v_verifier_count bigint;
  v_breakdown jsonb;
  v_node_status jsonb;
  v_edge_status jsonb;
  v_stats jsonb;
BEGIN
  INSERT INTO public.semantic_graph_imports (kind, status, started_at)
  VALUES ('LEXICON_MATERIALIZE', 'RUNNING', v_started)
  RETURNING id INTO v_import_id;

  SELECT count(*) INTO v_nodes_before FROM public.semantic_graph_nodes;
  SELECT count(*) INTO v_edges_before FROM public.semantic_graph_edges;
  SELECT count(*) INTO v_verifier_count
  FROM public.lexicon_senses WHERE knowledge_status = 'VERIFIED';
  SELECT count(*) INTO v_synset_rel_rows FROM public.lexicon_relationships;
  SELECT count(*) INTO v_sense_rel_rows FROM public.lexicon_sense_relations;

  -- 5a) Concept nodes: one per VERIFIED synset. The canonical
  --     name is the alphabetically-first member lemma of the
  --     synset (frequency is not sourced in this dataset;
  --     lexical members of a synset are synonyms — one name is
  --     chosen deterministically, never invented).
  WITH agg AS (
    SELECT s.synset_key,
           (array_agg(w.canonical ORDER BY w.canonical))[1] AS canonical_name,
           (array_agg(s.definition ORDER BY s.external_id))[1] AS description,
           jsonb_agg(DISTINCT s.external_id) AS sense_external_ids,
           max(s.domain) AS domain,
           max(s.region) AS region,
           max(w.language) AS language,
           (array_agg(s.source_id ORDER BY s.external_id))[1] AS source_id
    FROM public.lexicon_senses s
    JOIN public.lexicon_words w ON w.id = s.word_id
    WHERE s.knowledge_status = 'VERIFIED'
    GROUP BY s.synset_key
  ), ins AS (
    INSERT INTO public.semantic_graph_nodes
      (concept_key, synset_key, canonical_name, sense_external_ids,
       description, domain, language, region, knowledge_status,
       confidence, source_id, provenance)
    SELECT a.synset_key, a.synset_key, a.canonical_name, a.sense_external_ids,
           a.description, a.domain, a.language, a.region, 'VERIFIED', 1.0,
           a.source_id,
           'concept derived from OEWN ' ||
             coalesce((SELECT ls.version FROM public.lexicon_sources ls
                       WHERE ls.id = a.source_id), 'unknown edition') ||
           ' synset ' || a.synset_key ||
           ' (via ARCHIE Universal Lexicon)'
    FROM agg a
    ON CONFLICT (concept_key) DO UPDATE SET
      synset_key = EXCLUDED.synset_key,
      canonical_name = EXCLUDED.canonical_name,
      sense_external_ids = EXCLUDED.sense_external_ids,
      description = EXCLUDED.description,
      domain = EXCLUDED.domain,
      language = EXCLUDED.language,
      region = EXCLUDED.region,
      confidence = EXCLUDED.confidence,
      source_id = EXCLUDED.source_id,
      provenance = EXCLUDED.provenance,
      updated_date = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_nodes_touched FROM ins;

  -- 5b) Synset-level edges. Only relations whose sourced
  --     meaning directly matches a graph relation type are
  --     mapped (registry: _shared/semantic-graph/relations.ts).
  --     Unmapped relation types are counted and reported,
  --     never silently guessed.
  WITH mapped_per_row AS (
    SELECT r.id,
           CASE r.relation_type
             WHEN 'HYPERNYM' THEN 'IS_A'
             WHEN 'HYPONYM' THEN 'HAS_TYPE'
             WHEN 'MERONYM_PART' THEN 'HAS_PART'
             WHEN 'MERONYM_MEMBER' THEN 'HAS_PART'
             WHEN 'MERONYM_SUBSTANCE' THEN 'HAS_PART'
             WHEN 'HOLONYM_PART_OF' THEN 'PART_OF'
             WHEN 'HOLONYM_MEMBER_OF' THEN 'PART_OF'
             WHEN 'HOLONYM_SUBSTANCE_OF' THEN 'PART_OF'
             WHEN 'SIMILAR_TO' THEN 'SIMILAR_TO'
             WHEN 'ALSO_SEE' THEN 'RELATED_TO'
             WHEN 'ATTRIBUTE' THEN 'RELATED_TO'
             WHEN 'EXEMPLIFIES' THEN 'RELATED_TO'
             WHEN 'ENTAILMENT' THEN 'REQUIRES'
             WHEN 'CAUSES' THEN 'CAUSES'
             WHEN 'DOMAIN_TOPIC' THEN 'USED_IN_DOMAIN'
             WHEN 'DOMAIN_REGION' THEN 'USED_IN_DOMAIN'
             ELSE NULL
           END AS graph_rel,
           r.source_id, r.relation_type AS orig_type, r.from_synset_key, r.to_synset_key
    FROM public.lexicon_relationships r
    JOIN public.semantic_graph_nodes n1 ON n1.concept_key = r.from_synset_key
    JOIN public.semantic_graph_nodes n2 ON n2.concept_key = r.to_synset_key
  -- Aggregate: several source relations can map to the SAME
  -- graph relation for the same synset pair (e.g. MERONYM_PART
  -- and MERONYM_MEMBER both -> HAS_PART). One edge per
  -- (from, graph_rel, to) — ALL source relations are preserved
  -- in the provenance string, never silently dropped.
  ), mapped AS (
    SELECT from_synset_key, to_synset_key, graph_rel,
           min(source_id::text)::uuid AS source_id,
           string_agg(DISTINCT orig_type, ',' ORDER BY orig_type) AS orig_types
    FROM mapped_per_row
    WHERE graph_rel IS NOT NULL
    GROUP BY from_synset_key, to_synset_key, graph_rel
  ), ins AS (
    INSERT INTO public.semantic_graph_edges
      (source_concept_key, relation_type, target_concept_key,
       knowledge_status, confidence, provenance, evidence, source_id)
    SELECT m.from_synset_key, m.graph_rel, m.to_synset_key,
           'VERIFIED', 1.0,
           'Open English WordNet (CC BY 4.0) via lexicon_relationships: ' || m.orig_types,
           'OEWN ' || m.orig_types || ': mapped to ' || m.graph_rel || ' (directly sourced meaning)',
           m.source_id
    FROM mapped m
    ON CONFLICT (source_concept_key, relation_type, target_concept_key) DO UPDATE SET
      knowledge_status = EXCLUDED.knowledge_status,
      confidence = EXCLUDED.confidence,
      provenance = EXCLUDED.provenance,
      evidence = EXCLUDED.evidence,
      source_id = EXCLUDED.source_id,
      updated_date = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_synset_edges_ins FROM ins;

  -- unmapped relation types in the source (honest reporting)
  SELECT count(*) INTO v_unmapped_rel_rows
  FROM public.lexicon_relationships r
  WHERE r.relation_type NOT IN (
    'HYPERNYM','HYPONYM','MERONYM_PART','MERONYM_MEMBER','MERONYM_SUBSTANCE',
    'HOLONYM_PART_OF','HOLONYM_MEMBER_OF','HOLONYM_SUBSTANCE_OF','SIMILAR_TO',
    'ALSO_SEE','ATTRIBUTE','EXEMPLIFIES','ENTAILMENT','CAUSES',
    'DOMAIN_TOPIC','DOMAIN_REGION'
  );

  -- 5c) Sense-level edges collapsed to concept level with
  --     deduplication: antonym → CONTRASTS_WITH; derivation,
  --     pertainym, also-see, exemplifies and the ROLE_* family
  --     → RELATED_TO (the precise original relation is always
  --     preserved in provenance — conservative mapping, never
  --     upgraded to a stronger claim than the source).
  WITH pairs AS (
    SELECT DISTINCT
           fs.synset_key AS from_key,
           ts.synset_key AS to_key,
           sr.relation_type AS orig_type,
           min(sr.source_id::text)::uuid AS source_id
    FROM public.lexicon_sense_relations sr
    JOIN public.lexicon_senses fs ON fs.external_id = sr.from_sense_external_id
    JOIN public.lexicon_senses ts ON ts.external_id = sr.to_sense_external_id
    WHERE fs.knowledge_status = 'VERIFIED'
      AND ts.knowledge_status = 'VERIFIED'
    GROUP BY fs.synset_key, ts.synset_key, sr.relation_type
  ), skipped AS (
    SELECT count(*) AS n FROM pairs
    WHERE from_key IS NULL OR to_key IS NULL
  -- Aggregate: derivation, pertainym, also-see, exemplifies and
  -- the ROLE_* family ALL map to RELATED_TO for the same
  -- concept pair. One edge per (from, graph_rel, to) — ALL
  -- source relations preserved in provenance, never dropped.
  ), mapped AS (
    SELECT p.from_key, p.to_key,
           CASE p.orig_type
             WHEN 'ANTONYM' THEN 'CONTRASTS_WITH'
             ELSE 'RELATED_TO'
           END AS graph_rel,
           min(p.source_id::text)::uuid AS source_id,
           string_agg(p.orig_type, ',' ORDER BY p.orig_type) AS orig_types
    FROM pairs p
    JOIN public.semantic_graph_nodes n1 ON n1.concept_key = p.from_key
    JOIN public.semantic_graph_nodes n2 ON n2.concept_key = p.to_key
    GROUP BY p.from_key, p.to_key,
             CASE p.orig_type
               WHEN 'ANTONYM' THEN 'CONTRASTS_WITH'
               ELSE 'RELATED_TO'
             END
  ), ins AS (
    INSERT INTO public.semantic_graph_edges
      (source_concept_key, relation_type, target_concept_key,
       knowledge_status, confidence, provenance, evidence, source_id)
    SELECT m.from_key, m.graph_rel, m.to_key,
           'VERIFIED', 1.0,
           'Open English WordNet (CC BY 4.0) via lexicon_sense_relations: ' || m.orig_types,
           'OEWN ' || m.orig_types || ': mapped to ' || m.graph_rel || ' (directly sourced meaning)',
           m.source_id
    FROM mapped m
    ON CONFLICT (source_concept_key, relation_type, target_concept_key) DO UPDATE SET
      knowledge_status = EXCLUDED.knowledge_status,
      confidence = EXCLUDED.confidence,
      provenance = EXCLUDED.provenance,
      evidence = EXCLUDED.evidence,
      source_id = EXCLUDED.source_id,
      updated_date = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_sense_edges_ins FROM ins;

  -- sense pairs that could not attach to two concept nodes
  SELECT count(*) INTO v_sense_pairs_skipped
  FROM (
    SELECT DISTINCT fs.synset_key AS fk, ts.synset_key AS tk
    FROM public.lexicon_sense_relations sr
    JOIN public.lexicon_senses fs ON fs.external_id = sr.from_sense_external_id
    JOIN public.lexicon_senses ts ON ts.external_id = sr.to_sense_external_id
    WHERE (fs.knowledge_status IS DISTINCT FROM 'VERIFIED'
           OR ts.knowledge_status IS DISTINCT FROM 'VERIFIED')
  ) x;

  -- 5d) REAL final state (never estimated)
  SELECT count(*) INTO v_nodes_after FROM public.semantic_graph_nodes;
  SELECT count(*) INTO v_edges_after FROM public.semantic_graph_edges;
  SELECT coalesce(jsonb_object_agg(relation_type, n), '{}'::jsonb) INTO v_breakdown
  FROM (SELECT relation_type, count(*) AS n
        FROM public.semantic_graph_edges GROUP BY relation_type) t;
  SELECT coalesce(jsonb_object_agg(knowledge_status, n), '{}'::jsonb) INTO v_node_status
  FROM (SELECT knowledge_status, count(*) AS n
        FROM public.semantic_graph_nodes GROUP BY knowledge_status) t;
  SELECT coalesce(jsonb_object_agg(knowledge_status, n), '{}'::jsonb) INTO v_edge_status
  FROM (SELECT knowledge_status, count(*) AS n
        FROM public.semantic_graph_edges GROUP BY knowledge_status) t;

  v_stats := jsonb_build_object(
    'nodes_before', v_nodes_before,
    'nodes_after', v_nodes_after,
    'nodes_touched', v_nodes_touched,
    'edges_before', v_edges_before,
    'edges_after', v_edges_after,
    'synset_edges_inserted', v_synset_edges_ins,
    'sense_edges_inserted', v_sense_edges_ins,
    'synset_relation_rows', v_synset_rel_rows,
    'sense_relation_rows', v_sense_rel_rows,
    'unmapped_synset_relation_rows', v_unmapped_rel_rows,
    'synset_rows_not_newly_inserted', greatest(v_synset_rel_rows - v_unmapped_rel_rows - v_synset_edges_ins, 0),
    'sense_pairs_skipped', v_sense_pairs_skipped,
    'verified_lexicon_senses', v_verifier_count,
    'relation_type_breakdown', v_breakdown,
    'node_status_breakdown', v_node_status,
    'edge_status_breakdown', v_edge_status
  );

  UPDATE public.semantic_graph_imports
  SET status = 'SUCCESS', finished_at = now(), stats = v_stats, updated_date = now()
  WHERE id = v_import_id;

  RETURN jsonb_build_object('import_id', v_import_id, 'stats', v_stats);
END;
$$;

-- ---------------------------------------------------------
-- 6. Graph health dashboard (spec §19) — real database state
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_graph_health()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_nodes', (SELECT count(*) FROM public.semantic_graph_nodes),
    'total_edges', (SELECT count(*) FROM public.semantic_graph_edges),
    'relation_type_breakdown', (
      SELECT coalesce(jsonb_object_agg(relation_type, n), '{}'::jsonb)
      FROM (SELECT relation_type, count(*) AS n
            FROM public.semantic_graph_edges GROUP BY relation_type) t),
    'node_status_breakdown', (
      SELECT coalesce(jsonb_object_agg(knowledge_status, n), '{}'::jsonb)
      FROM (SELECT knowledge_status, count(*) AS n
            FROM public.semantic_graph_nodes GROUP BY knowledge_status) t),
    'edge_status_breakdown', (
      SELECT coalesce(jsonb_object_agg(knowledge_status, n), '{}'::jsonb)
      FROM (SELECT knowledge_status, count(*) AS n
            FROM public.semantic_graph_edges GROUP BY knowledge_status) t),
    -- orphan nodes: a concept with no relationship at all
    'orphan_nodes', (
      SELECT count(*) FROM public.semantic_graph_nodes n
      WHERE NOT EXISTS (SELECT 1 FROM public.semantic_graph_edges e
                        WHERE e.source_concept_key = n.concept_key)
        AND NOT EXISTS (SELECT 1 FROM public.semantic_graph_edges e
                         WHERE e.target_concept_key = n.concept_key)),
    -- duplicate CANDIDATES (honest naming: same canonical name
    -- + identical description). Polysemy legitimately repeats
    -- names with different definitions — those are different
    -- concepts, not duplicates; identical definition pairs are
    -- surfaced for review, never auto-merged (spec §8).
    'duplicate_candidates', (
      SELECT coalesce(sum(cnt - 1), 0)
      FROM (SELECT count(*) AS cnt
            FROM public.semantic_graph_nodes
            WHERE description IS NOT NULL
            GROUP BY canonical_name, md5(lower(description))
            HAVING count(*) > 1) t),
    'missing_provenance', jsonb_build_object(
      'nodes', (SELECT count(*) FROM public.semantic_graph_nodes
                WHERE provenance = '' OR source_id IS NULL),
      'edges', (SELECT count(*) FROM public.semantic_graph_edges
                WHERE provenance = '' OR source_id IS NULL)),
    -- circular relationships (bounded checks: self-loops and
    -- 2-cycles in taxonomic edges — the problematic cases)
    'circular_relationships', jsonb_build_object(
      'self_loops', (SELECT count(*) FROM public.semantic_graph_edges
                     WHERE source_concept_key = target_concept_key),
      'is_a_two_cycles', (
        SELECT count(*) FROM public.semantic_graph_edges e1
        JOIN public.semantic_graph_edges e2
          ON e2.source_concept_key = e1.target_concept_key
         AND e2.target_concept_key = e1.source_concept_key
         AND e2.relation_type = e1.relation_type
         AND e2.id < e1.id
        WHERE e1.relation_type IN ('IS_A','HAS_TYPE'))),
    -- invalid relationship types: not in the registry as of
    -- this migration (registry: relations.ts — extensible via
    -- registry entry + migration-awareness)
    'invalid_relationship_types', (
      SELECT count(*) FROM public.semantic_graph_edges
      WHERE relation_type NOT IN (
        'IS_A','TYPE_OF','SUBTYPE_OF','HAS_TYPE','PART_OF','HAS_PART',
        'CONTAINS','COMPONENT_OF','USED_FOR','USED_BY','REQUIRES','PRODUCES',
        'CONSUMES','OPERATES_ON','CAUSES','CAN_CAUSE','RESULTS_IN','PREVENTS',
        'REDUCES','HAS_PROPERTY','HAS_ATTRIBUTE','HAS_STATE','RELATED_TO',
        'ASSOCIATED_WITH','PRECEDES','FOLLOWS','OCCURS_DURING','LOCATED_IN',
        'CONTAINS_LOCATION','ADJACENT_TO','SIMILAR_TO','DIFFERENT_FROM',
        'CONTRASTS_WITH','USED_IN_DOMAIN','SPECIALIZED_TERM_IN')),
    -- unverified knowledge is present but never shown as fact
    'unverified_nodes', (
      SELECT count(*) FROM public.semantic_graph_nodes
      WHERE knowledge_status = 'UNVERIFIED'),
    'unverified_edges', (
      SELECT count(*) FROM public.semantic_graph_edges
      WHERE knowledge_status = 'UNVERIFIED'),
    'graph_version', (
      SELECT coalesce(max(version), 1) FROM public.semantic_graph_nodes),
    'last_ingestion', (
      SELECT to_jsonb(x) FROM (
        SELECT id, kind, status, started_at, finished_at, stats, errors
        FROM public.semantic_graph_imports
        ORDER BY created_date DESC LIMIT 1) x)
  );
$$;
