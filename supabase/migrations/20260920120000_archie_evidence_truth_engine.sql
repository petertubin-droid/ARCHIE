-- =========================================================
-- ARCHIE EVIDENCE & TRUTH ENGINE (spec §EVIDENCE-TRUTH)
--
-- The fourth permanent intelligence layer: a structured
-- mechanism for determining WHAT ARCHIE knows, WHAT supports
-- it, WHERE it came from, and WHAT remains unknown.
--
-- It sits above and connects to the three existing layers:
--   * Universal Lexicon Engine        (lexical authority)
--   * Semantic Knowledge Graph Engine (concept relationships,
--     already carrying knowledge_status + provenance)
--   * Context & Inference Engine      (FACT/INFERENCE labels,
--     rule ids, contradiction records)
--
-- It NEVER duplicates or re-stamps them: evidence records
-- REFERENCE lexicon/graph rows through source_ref; lower-
-- layer statuses ride along unchanged.
--
--   archie_claims            — structured claims (subject /
--                              predicate / object), explicit
--                              verification states, temporal
--                              validity, version + history
--   archie_evidence_records  — evidence with type, source
--                              identity, PROVENANCE CHAIN
--                              (preserved through every
--                              transformation), reliability
--                              documented by basis (never
--                              invented numbers)
--   archie_claim_evidence    — claim ↔ evidence links
--                              (SUPPORTS / CONTRADICTS)
--   archie_claim_relations   — claim ↔ claim links
--                              (PREMISE_OF / SUPERSEDES /
--                              CORROBORATES / CONTRADICTS)
--   archie_evidence_conflicts— contradiction records with
--                              honest explanation status
--                              (ESTABLISHED / HYPOTHESIS /
--                              UNEXPLAINED — never invented)
--
-- Functions:
--   archie_evidence_health() — real measured dashboard state
--       + evidence-health issue checks (claims without
--       evidence, inferred claims marked as facts, stale
--       records, unresolved conflicts…). Real counts only.
--
-- Epistemic contract (spec §§5, §15, §16):
--   VERIFIED      — strongly supported by reliable evidence
--                   available to ARCHIE
--   SUPPORTED     — evidence exists and reasonably supports
--   USER_PROVIDED — owner/user statement (never silently
--                   converted to verified fact)
--   INFERRED      — derived by an allowed inference
--   CONFLICTED    — credible evidence disagrees
--   OUTDATED      — previously supported, no longer current
--   UNVERIFIED    — insufficient evidence to establish
--   UNKNOWN       — not enough information to determine
--
-- An inference NEVER becomes VERIFIED without independent
-- evidence. A user statement NEVER becomes VERIFIED without
-- independent evidence. No sources, citations, statistics or
-- dates are ever manufactured.
--
-- RLS mirrors archie_engine_states / lexicon: admins read;
-- only the service role (ARCHIE server code) writes. Evidence
-- records may carry owner-only context — anon gets nothing,
-- non-admin authenticated users get nothing.
--
-- Migration safety: purely additive (IF NOT EXISTS
-- everywhere), no destructive operations, existing tables
-- and data untouched. Rollback: DROP the five tables and the
-- health function (no other object depends on them).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Claims
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_key text NOT NULL UNIQUE,          -- deterministic dedup key (engine-computed)
  subject text NOT NULL,                  -- what the claim is about
  predicate text NOT NULL,                -- the asserted relation/property
  object_value text,                      -- asserted value (may be NULL for open questions)
  claim_type text NOT NULL DEFAULT 'ATTRIBUTE'
    CHECK (claim_type IN ('ATTRIBUTE','RELATION','QUANTITY','EVENT','STATEMENT')),
  statement text NOT NULL,                -- natural-language form
  domain text NOT NULL DEFAULT 'general', -- evidence is domain-aware
  geo_scope text,                         -- geographic scope where relevant
  subject_concept_key text,               -- back-reference into the semantic graph
  object_concept_key text,
  user_provided boolean NOT NULL DEFAULT false,
  inferred boolean NOT NULL DEFAULT false,
  directly_observed boolean NOT NULL DEFAULT false,
  question boolean NOT NULL DEFAULT false, -- open question rather than assertion
  verification_state text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_state IN
      ('VERIFIED','SUPPORTED','USER_PROVIDED','INFERRED',
       'CONFLICTED','OUTDATED','UNVERIFIED','UNKNOWN')),
  conflict_state text NOT NULL DEFAULT 'NONE'
    CHECK (conflict_state IN ('NONE','CONFLICTED','RESOLVED')),
  source_availability text NOT NULL DEFAULT 'SOURCE_UNAVAILABLE'
    CHECK (source_availability IN ('SOURCE_AVAILABLE','SOURCE_UNAVAILABLE')),
  applicable_from timestamptz,            -- temporal truth (spec §12)
  applicable_until timestamptz,
  published_at timestamptz,
  retrieved_at timestamptz,
  version integer NOT NULL DEFAULT 1,     -- history is NEVER silently overwritten
  history jsonb NOT NULL DEFAULT '[]',    -- append-only version records
  supersedes_claim_id uuid REFERENCES public.archie_claims(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_claims_subject_idx
  ON public.archie_claims (subject, predicate);
CREATE INDEX IF NOT EXISTS archie_claims_state_idx
  ON public.archie_claims (verification_state);
CREATE INDEX IF NOT EXISTS archie_claims_domain_idx
  ON public.archie_claims (domain);
CREATE INDEX IF NOT EXISTS archie_claims_concept_idx
  ON public.archie_claims (subject_concept_key)
  WHERE subject_concept_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS archie_claims_inferred_idx
  ON public.archie_claims (inferred) WHERE inferred;
CREATE INDEX IF NOT EXISTS archie_claims_user_provided_idx
  ON public.archie_claims (user_provided) WHERE user_provided;
CREATE INDEX IF NOT EXISTS archie_claims_applicable_until_idx
  ON public.archie_claims (applicable_until)
  WHERE applicable_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS archie_claims_updated_idx
  ON public.archie_claims (updated_date DESC);

COMMENT ON TABLE public.archie_claims IS
  'ARCHIE Evidence & Truth Engine — structured claims with explicit verification states, temporal validity, version history and deterministic dedup keys. Inferences and user statements stay distinguishable from verified facts.';

-- ---------------------------------------------------------
-- 2. Evidence records (with provenance chains)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_key text NOT NULL UNIQUE,      -- deterministic dedup key (engine-computed)
  evidence_type text NOT NULL
    CHECK (evidence_type IN
      ('DIRECT_SOURCE','OFFICIAL_DOCUMENTATION','STRUCTURED_DATABASE',
       'USER_PROVIDED_EVIDENCE','OBSERVED_APP_DATA','MATHEMATICAL_DERIVATION',
       'DETERMINISTIC_CALCULATOR','SEMANTIC_RELATIONSHIP','GRAPH_RELATIONSHIP',
       'INFERENCE','HISTORICAL_RECORD','TEMPORAL_EVIDENCE','DOMAIN_SPECIFIC',
       'CORROBORATING','CONTRADICTORY')),
  source_type text NOT NULL
    CHECK (source_type IN
      ('SEMANTIC_GRAPH','LEXICON','FRELUX_CALCULATOR','FRELUX_DATABASE',
       'CONVERSATION','USER_STATEMENT','EXTERNAL_DOCUMENT','ARCHIE_INFERENCE',
       'APP_OBSERVATION','HISTORICAL_RECORD')),
  source_identity text NOT NULL,          -- e.g. 'semantic_graph_edges', 'FRELUX paint calculator v3'
  source_ref jsonb,                      -- pointer to the real record: {table,row_id,function,project}
  origin_subsystem text NOT NULL,         -- originating subsystem
  observed_by_system boolean NOT NULL DEFAULT false, -- ARCHIE observed it directly vs derived it
  content_label text NOT NULL,           -- concise human description of what the evidence is
  content_digest text,                   -- digest of the exact content (dedup + audit)
  transformation text,                    -- LAST transformation applied to the information
  provenance_chain jsonb NOT NULL DEFAULT '[]', -- ordered steps SOURCE → fact → … preserved through every transformation
  reliability jsonb NOT NULL DEFAULT '{}',        -- {tier, basis} — documented basis only, never invented numbers
  domain text,
  version text,                           -- relevant version of the source where known
  retrieved_at timestamptz,
  published_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_evidence_source_type_idx
  ON public.archie_evidence_records (source_type);
CREATE INDEX IF NOT EXISTS archie_evidence_type_idx
  ON public.archie_evidence_records (evidence_type);
CREATE INDEX IF NOT EXISTS archie_evidence_identity_idx
  ON public.archie_evidence_records (source_identity);
CREATE INDEX IF NOT EXISTS archie_evidence_retrieved_idx
  ON public.archie_evidence_records (retrieved_at)
  WHERE retrieved_at IS NOT NULL;

COMMENT ON TABLE public.archie_evidence_records IS
  'ARCHIE Evidence & Truth Engine — evidence records with type, source identity, reference to the real source row, provenance chain preserved through transformations, and reliability documented by basis only.';

-- ---------------------------------------------------------
-- 3. Claim ↔ evidence links
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_claim_evidence (
  claim_id uuid NOT NULL
    REFERENCES public.archie_claims(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL
    REFERENCES public.archie_evidence_records(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('SUPPORTS','CONTRADICTS')),
  note text,
  created_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, evidence_id, relation)
);

CREATE INDEX IF NOT EXISTS archie_claim_evidence_evidence_idx
  ON public.archie_claim_evidence (evidence_id);

-- ---------------------------------------------------------
-- 4. Claim ↔ claim links (premises, supersession, corroboration)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_claim_relations (
  claim_a_id uuid NOT NULL
    REFERENCES public.archie_claims(id) ON DELETE CASCADE,
  claim_b_id uuid NOT NULL
    REFERENCES public.archie_claims(id) ON DELETE CASCADE,
  relation_type text NOT NULL
    CHECK (relation_type IN ('SUPERSEDES','PREMISE_OF','CORROBORATES','CONTRADICTS','SAME_AS')),
  note text,
  created_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_a_id, claim_b_id, relation_type),
  CHECK (claim_a_id <> claim_b_id)
);

CREATE INDEX IF NOT EXISTS archie_claim_relations_b_idx
  ON public.archie_claim_relations (claim_b_id);

-- ---------------------------------------------------------
-- 5. Conflict records (never silently resolved)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_evidence_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_a_id uuid NOT NULL
    REFERENCES public.archie_claims(id) ON DELETE CASCADE,
  claim_b_id uuid NOT NULL
    REFERENCES public.archie_claims(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('VALUE_CONFLICT','RELATIONSHIP_CONFLICT','TEMPORAL_CONFLICT','USER_VS_STORED')),
  explanation_status text NOT NULL DEFAULT 'UNEXPLAINED'
    CHECK (explanation_status IN ('ESTABLISHED','HYPOTHESIS','UNEXPLAINED')),
  explanation text,                       -- only what is established or explicitly labeled hypothesis — never invented
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text,
  CHECK (claim_a_id <> claim_b_id)
);

CREATE INDEX IF NOT EXISTS archie_conflicts_a_idx
  ON public.archie_evidence_conflicts (claim_a_id)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS archie_conflicts_b_idx
  ON public.archie_evidence_conflicts (claim_b_id)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.archie_evidence_conflicts IS
  'ARCHIE Evidence & Truth Engine — contradiction records. Conflicts are represented, never silently resolved; explanations are ESTABLISHED, HYPOTHESIS or UNEXPLAINED, never invented.';

-- ---------------------------------------------------------
-- 6. Row Level Security
--
-- Evidence may reference owner-only context. Admins read
-- (the Evidence & Truth admin surface); ONLY the service
-- role (ARCHIE server code) writes. Anon and non-admin
-- authenticated users get nothing — the chat path runs
-- server-side under the service role.
-- ---------------------------------------------------------
ALTER TABLE public.archie_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_claim_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_evidence_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_evidence_claims"
  ON public.archie_claims;
CREATE POLICY "admin_read_evidence_claims"
  ON public.archie_claims FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_evidence_records"
  ON public.archie_evidence_records;
CREATE POLICY "admin_read_evidence_records"
  ON public.archie_evidence_records FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_claim_evidence"
  ON public.archie_claim_evidence;
CREATE POLICY "admin_read_claim_evidence"
  ON public.archie_claim_evidence FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_claim_relations"
  ON public.archie_claim_relations;
CREATE POLICY "admin_read_claim_relations"
  ON public.archie_claim_relations FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_evidence_conflicts"
  ON public.archie_evidence_conflicts;
CREATE POLICY "admin_read_evidence_conflicts"
  ON public.archie_evidence_conflicts FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- No INSERT/UPDATE/DELETE policies: only the service role
-- (ARCHIE edge functions) may change evidence state.

-- ---------------------------------------------------------
-- 7. Evidence health — REAL measured state, never estimates
--
-- One SECURITY DEFINER function computing the dashboard and
-- the health checks server-side. It only COUNTS and lists
-- bounded samples; it never modifies anything.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_evidence_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    -- the service role (bypassrls) and admins only
    RAISE EXCEPTION 'admin only'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    -- claim counts (real, measured)
    'total_claims', (SELECT count(*) FROM archie_claims),
    'verified_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'VERIFIED'),
    'supported_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'SUPPORTED'),
    'inferred_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'INFERRED'),
    'user_provided_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'USER_PROVIDED'),
    'conflicted_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'CONFLICTED'),
    'outdated_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'OUTDATED'),
    'unverified_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'UNVERIFIED'),
    'unknown_claims', (SELECT count(*) FROM archie_claims WHERE verification_state = 'UNKNOWN'),
    -- evidence + provenance (real, measured)
    'evidence_records', (SELECT count(*) FROM archie_evidence_records),
    'evidence_sources', (SELECT count(DISTINCT source_identity) FROM archie_evidence_records),
    'provenance_records', (SELECT count(*) FROM archie_evidence_records
                            WHERE jsonb_array_length(provenance_chain) > 0),
    'claim_evidence_links', (SELECT count(*) FROM archie_claim_evidence),
    'conflicts_total', (SELECT count(*) FROM archie_evidence_conflicts),
    'conflicts_unresolved', (SELECT count(*) FROM archie_evidence_conflicts
                              WHERE resolved_at IS NULL),
    -- evidence-health checks (spec §28)
    'claims_without_evidence', (SELECT count(*) FROM archie_claims c
      WHERE NOT EXISTS (SELECT 1 FROM archie_claim_evidence ce WHERE ce.claim_id = c.id)),
    'orphaned_evidence', (SELECT count(*) FROM archie_evidence_records e
      WHERE NOT EXISTS (SELECT 1 FROM archie_claim_evidence ce WHERE ce.evidence_id = e.id)),
    'inferred_marked_as_facts', (SELECT count(*) FROM archie_claims
      WHERE inferred AND verification_state IN ('VERIFIED','SUPPORTED')),
    'user_provided_marked_verified', (SELECT count(*) FROM archie_claims
      WHERE user_provided AND verification_state = 'VERIFIED'
        AND NOT EXISTS (SELECT 1 FROM archie_claim_evidence ce
                         JOIN archie_evidence_records er ON er.id = ce.evidence_id
                         WHERE ce.claim_id = archie_claims.id
                           AND ce.relation = 'SUPPORTS'
                           AND er.source_type NOT IN ('CONVERSATION','USER_STATEMENT'))),
    'claims_missing_retrieved_at', (SELECT count(*) FROM archie_claims
      WHERE source_availability = 'SOURCE_AVAILABLE' AND retrieved_at IS NULL),
    'stale_claims', (SELECT count(*) FROM archie_claims
      WHERE applicable_until IS NOT NULL AND applicable_until < now()
        AND verification_state NOT IN ('OUTDATED','CONFLICTED')),
    'conflicts_without_explanation', (SELECT count(*) FROM archie_evidence_conflicts
      WHERE resolved_at IS NULL AND explanation_status = 'UNEXPLAINED'),
    'sample_claims_without_evidence', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT c.id, c.claim_key, c.statement, c.domain FROM archie_claims c
        WHERE NOT EXISTS (SELECT 1 FROM archie_claim_evidence ce WHERE ce.claim_id = c.id)
        ORDER BY c.updated_date DESC LIMIT 5) x)
  );
END;
$$;

-- privileges: the engine writes via service_role (edge
-- functions); authenticated admins read through the RLS
-- policies; anon gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_claims, public.archie_evidence_records, public.archie_claim_evidence, public.archie_claim_relations, public.archie_evidence_conflicts TO service_role;
GRANT SELECT ON public.archie_claims, public.archie_evidence_records, public.archie_claim_evidence, public.archie_claim_relations, public.archie_evidence_conflicts TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.archie_evidence_health() TO authenticated;

COMMENT ON FUNCTION public.archie_evidence_health() IS
  'ARCHIE Evidence & Truth Engine — real measured dashboard + health checks. Read-only, admin/service-role only, never fabricates numbers.';
