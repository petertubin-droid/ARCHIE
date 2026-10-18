-- =========================================================
-- ARCHIE TREE LOOP (owner directive 2026-10-18)
--
-- ARCHIE is a tree planted on FRELUX: the roots feed from
-- FRELUX's business signals (what users calculate, which AI
-- features they use, what they ask for that FRELUX cannot do
-- yet), the branches reach outside for knowledge (web
-- research, Gemini), and the oxygen flows back to FRELUX
-- (learned knowledge surfaced on FRELUX surfaces).
--
-- This migration creates the two loop tables:
--   1. frelux_archie_knowledge_gaps — questions FRELUX users
--      asked that no engine could handle ("unsupported").
--      These are the roots' strongest signal: ARCHIE learns
--      what FRELUX needs to know.
--   2. frelux_archie_tree_feed_runs — audit of every feed
--      run (what was ingested, in aggregate only, no user
--      data ever).
--
-- Security: RLS enabled, NO anon/authenticated policies —
-- service-role only (ARCHIE-owned data). The ai-copilot
-- writes gaps service-role; nothing user-facing reads them.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_knowledge_gaps (
  id text PRIMARY KEY, -- sha256 of the normalized question
  question text NOT NULL,
  source text NOT NULL DEFAULT 'copilot',
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  times_seen integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_archie_knowledge_gaps_open
  ON public.frelux_archie_knowledge_gaps (resolved, last_seen DESC);

ALTER TABLE public.frelux_archie_knowledge_gaps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.frelux_archie_tree_feed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  facts_written integer NOT NULL DEFAULT 0,
  usage_rows_read integer NOT NULL DEFAULT 0,
  feature_rows_read integer NOT NULL DEFAULT 0,
  gaps_open integer NOT NULL DEFAULT 0,
  summary text
);

ALTER TABLE public.frelux_archie_tree_feed_runs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- Gap logging RPC: re-asking the same question STRENGTHENS
-- the gap (times_seen + 1) and never duplicates a row.
-- SECURITY DEFINER + service_role only: the copilot's edge
-- runtime holds the service key; anon/authenticated cannot
-- write ARCHIE's gap data.
-- ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.archie_log_knowledge_gap(
  p_question text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized text;
  v_id text;
BEGIN
  IF p_question IS NULL THEN RETURN; END IF;
  v_normalized := left(btrim(regexp_replace(p_question, '\s+', ' ', 'g')), 300);
  IF v_normalized = '' THEN RETURN; END IF;
  v_id := encode(digest(lower(v_normalized), 'sha256'), 'hex');
  INSERT INTO public.frelux_archie_knowledge_gaps (id, question, source)
  VALUES (v_id, v_normalized, 'copilot')
  ON CONFLICT (id) DO UPDATE
    SET times_seen = public.frelux_archie_knowledge_gaps.times_seen + 1,
        last_seen = now(),
        resolved = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archie_log_knowledge_gap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archie_log_knowledge_gap(text) TO service_role;
