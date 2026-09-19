-- =========================================================
-- ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE (spec §§1–40)
--
-- The fifth permanent intelligence layer, on top of:
--   * Universal Lexicon Engine
--   * Semantic Knowledge Graph Engine
--   * Context & Inference Engine
--   * Evidence & Truth Engine
--
-- STORAGE EFFICIENCY (spec §34): reasoning rows REFERENCE
-- lower-layer rows (concept keys, claim ids, FRELUX engine
-- ids) — no lexicon/graph/evidence payloads are duplicated.
-- jsonb columns are bounded by the writing service
-- (truncation at insert), and every table carries the
-- indexes the Admin Reasoning section actually reads.
--
--   archie_reasoning_problems — one row per problem ARCHIE
--       took through structured reasoning
--   archie_reasoning_runs     — one row per reasoning run:
--       depth, steps, duration, outcome, honest failure kind
--   archie_reasoning_solutions — candidate solutions with
--       validation state, constraint outcomes, engine ids
--   archie_reasoning_patterns  — VALIDATED reusable reasoning
--       knowledge, always CANDIDATE status: promotion follows
--       the existing ARCHIE knowledge rules, never automatic
--       (spec §28)
--
-- SAFE MIGRATION (spec §35): IF NOT EXISTS everywhere, no
-- destructive resets, additive only. Rollback = DROP TABLE
-- (reasoning state is regenerable; no authoritative data
-- lives only here).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Problems
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_reasoning_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid,
  category text NOT NULL DEFAULT 'GENERIC',      -- DEDUCTIVE…MULTI_DOMAIN (spec §5)
  objective text NOT NULL,                        -- bounded at insert (500)
  domain text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'PENDING',         -- PENDING|SOLVED|UNRESOLVED|INSUFFICIENT_INFORMATION|IMPOSSIBLE|CONFLICTED
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_reasoning_problems_owner_idx
  ON public.archie_reasoning_problems (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS archie_reasoning_problems_status_idx
  ON public.archie_reasoning_problems (status);
CREATE INDEX IF NOT EXISTS archie_reasoning_problems_conversation_idx
  ON public.archie_reasoning_problems (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ---------------------------------------------------------
-- 2. Runs — one row per reasoning execution
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_reasoning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.archie_reasoning_problems(id)
    ON DELETE CASCADE,
  depth int NOT NULL DEFAULT 0,                   -- subproblems + chained steps
  steps int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL DEFAULT 0,
  outcome text NOT NULL,                          -- SOLVED|UNRESOLVED|INSUFFICIENT_INFORMATION|IMPOSSIBLE|CONFLICTED|NOT_APPLICABLE
  failure_kind text,                              -- spec §20 taxonomy, null when solved
  solution_validated boolean NOT NULL DEFAULT false,
  validation_failures int NOT NULL DEFAULT 0,
  contradiction_detections int NOT NULL DEFAULT 0,
  calculator_assisted boolean NOT NULL DEFAULT false,   -- FRELUX engine ran (spec §16)
  evidence_assisted boolean NOT NULL DEFAULT false,     -- lower-layer evidence used
  failed_paths int NOT NULL DEFAULT 0,
  engines_invoked text[] NOT NULL DEFAULT '{}',   -- FRELUX engine ids (references)
  assumptions jsonb NOT NULL DEFAULT '[]',        -- {statement, effect} — bounded at insert
  loop_terminations text[] NOT NULL DEFAULT '{}', -- spec §30 protection events
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_reasoning_runs_problem_idx
  ON public.archie_reasoning_runs (problem_id);
CREATE INDEX IF NOT EXISTS archie_reasoning_runs_outcome_idx
  ON public.archie_reasoning_runs (outcome);
CREATE INDEX IF NOT EXISTS archie_reasoning_runs_created_idx
  ON public.archie_reasoning_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS archie_reasoning_runs_calculator_idx
  ON public.archie_reasoning_runs (calculator_assisted)
  WHERE calculator_assisted;
CREATE INDEX IF NOT EXISTS archie_reasoning_runs_evidence_idx
  ON public.archie_reasoning_runs (evidence_assisted)
  WHERE evidence_assisted;

-- ---------------------------------------------------------
-- 3. Solutions — candidates + validation state (spec §17)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_reasoning_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.archie_reasoning_runs(id)
    ON DELETE CASCADE,
  description text NOT NULL,                      -- bounded at insert (1000)
  validation_state text NOT NULL DEFAULT 'PENDING', -- VALIDATED|PARTIALLY_VALIDATED|FAILED|PENDING
  final boolean NOT NULL DEFAULT false,
  frelux_engine_id text,                          -- reference to the canonical engine, when used
  assumptions text[] NOT NULL DEFAULT '{}',
  premise_ids text[] NOT NULL DEFAULT '{}',       -- references to lower-layer premise ids
  constraint_violations int NOT NULL DEFAULT 0,
  quantities jsonb NOT NULL DEFAULT '[]',         -- [{value, unit, dimension}] — bounded at insert
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_reasoning_solutions_run_idx
  ON public.archie_reasoning_solutions (run_id);
CREATE INDEX IF NOT EXISTS archie_reasoning_solutions_validation_idx
  ON public.archie_reasoning_solutions (validation_state);
CREATE INDEX IF NOT EXISTS archie_reasoning_solutions_final_idx
  ON public.archie_reasoning_solutions (final)
  WHERE final;

-- ---------------------------------------------------------
-- 4. Patterns — VALIDATED reusable reasoning knowledge.
--    status is CANDIDATE; only the existing ARCHIE
--    knowledge/provenance rules can promote it (spec §28).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_reasoning_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key text NOT NULL UNIQUE,
  statement text NOT NULL,
  domain text NOT NULL DEFAULT 'general',
  evidence_refs jsonb NOT NULL DEFAULT '[]',      -- references only (spec §34)
  validated_count int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'CANDIDATE',
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_reasoning_patterns_domain_idx
  ON public.archie_reasoning_patterns (domain);
CREATE INDEX IF NOT EXISTS archie_reasoning_patterns_status_idx
  ON public.archie_reasoning_patterns (status);

-- ---------------------------------------------------------
-- 5. Row-level security — owner (admin) read-only; ALL
--    writes go through the service role (ARCHIE edge
--    functions). No client may mutate reasoning state.
-- ---------------------------------------------------------
ALTER TABLE public.archie_reasoning_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_reasoning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_reasoning_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_reasoning_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_reasoning_problems"
  ON public.archie_reasoning_problems;
CREATE POLICY "admin_read_reasoning_problems"
  ON public.archie_reasoning_problems FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_reasoning_runs"
  ON public.archie_reasoning_runs;
CREATE POLICY "admin_read_reasoning_runs"
  ON public.archie_reasoning_runs FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_reasoning_solutions"
  ON public.archie_reasoning_solutions;
CREATE POLICY "admin_read_reasoning_solutions"
  ON public.archie_reasoning_solutions FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_read_reasoning_patterns"
  ON public.archie_reasoning_patterns;
CREATE POLICY "admin_read_reasoning_patterns"
  ON public.archie_reasoning_patterns FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- No INSERT/UPDATE/DELETE policies: only the service role
-- (ARCHIE edge functions) may change reasoning state.

-- ---------------------------------------------------------
-- 6. Reasoning health — REAL measured state (spec §37).
--    Diagnostics only; nothing silently repairs itself.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_reasoning_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'status', CASE
      WHEN (SELECT count(*) FROM public.archie_reasoning_runs WHERE depth > 24) > 0
        THEN 'DEGRADED'
      ELSE 'OPERATIONAL'
    END,
    'problems_processed', (SELECT count(*) FROM public.archie_reasoning_problems),
    'problems_solved', (SELECT count(*) FROM public.archie_reasoning_problems WHERE status = 'SOLVED'),
    'problems_unresolved', (SELECT count(*) FROM public.archie_reasoning_problems WHERE status IN ('UNRESOLVED', 'INSUFFICIENT_INFORMATION')),
    'problems_impossible', (SELECT count(*) FROM public.archie_reasoning_problems WHERE status = 'IMPOSSIBLE'),
    'problems_conflicted', (SELECT count(*) FROM public.archie_reasoning_problems WHERE status = 'CONFLICTED'),
    'validation_failures', (SELECT count(*) FROM public.archie_reasoning_solutions WHERE validation_state = 'FAILED'),
    'contradiction_detections', (SELECT coalesce(sum(contradiction_detections), 0) FROM public.archie_reasoning_runs),
    'average_reasoning_depth', COALESCE((
      SELECT round(avg(depth)::numeric, 2) FROM public.archie_reasoning_runs
    ), 0),
    'failed_paths', (SELECT coalesce(sum(failed_paths), 0) FROM public.archie_reasoning_runs),
    'calculator_assisted', (SELECT count(*) FROM public.archie_reasoning_runs WHERE calculator_assisted),
    'evidence_assisted', (SELECT count(*) FROM public.archie_reasoning_runs WHERE evidence_assisted),
    'reasoning_errors', (SELECT count(*) FROM public.archie_reasoning_runs WHERE failure_kind = 'SYSTEM_LIMITATION'),
    'excessive_depth_runs', (SELECT count(*) FROM public.archie_reasoning_runs WHERE depth > 24),
    'loop_protection_events', (
      SELECT coalesce(sum(cardinality(loop_terminations)), 0)
      FROM public.archie_reasoning_runs
    ),
    'patterns', (SELECT count(*) FROM public.archie_reasoning_patterns),
    'patterns_awaiting_promotion', (
      SELECT count(*) FROM public.archie_reasoning_patterns WHERE status = 'CANDIDATE'
    ),
    'orphan_runs', (
      SELECT count(*) FROM public.archie_reasoning_runs r
      LEFT JOIN public.archie_reasoning_problems p ON p.id = r.problem_id
      WHERE p.id IS NULL
    ),
    'orphan_solutions', (
      SELECT count(*) FROM public.archie_reasoning_solutions s
      LEFT JOIN public.archie_reasoning_runs r ON r.id = s.run_id
      WHERE r.id IS NULL
    )
  );
$$;

-- Revoke execute from anon/public: owner surface only.
REVOKE EXECUTE ON FUNCTION public.archie_reasoning_health()
  FROM anon, public;
