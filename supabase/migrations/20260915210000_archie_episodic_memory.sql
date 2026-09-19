-- =========================================================
-- ARCHIE PHASE 7 (plan P7) — EPISODIC MEMORY + ENGINE COUNTERS
-- Cross-isolate state: salient conversation turns persist
-- across edge isolates so a fresh chat request recalls
-- owner-taught episodic context from a previous session;
-- engine counters stop resetting per isolate so diagnostics
-- report system-wide numbers.
-- Privacy: the personalization_memory consent gate in
-- archie-chat is the REAL control — when revoked, the
-- engine runs with persistence=null and never touches these
-- tables. Matching the native-facts convention: service-role
-- only, no anon/authenticated policies.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Episodic turns (prior-session context, grouped by
--    conversation id — plan item: session grouping)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_episodic_turns (
  id text PRIMARY KEY,
  conversation_id text NOT NULL DEFAULT 'default',
  role text NOT NULL CHECK (role IN ('owner', 'archie')),
  text text NOT NULL,
  turn_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_episodic_turns_conv
  ON public.frelux_archie_episodic_turns (conversation_id, turn_at);

ALTER TABLE public.frelux_archie_episodic_turns
  FORCE ROW LEVEL SECURITY;
-- FORCE per audit F2 convention (all tables FORCE RLS).
-- No anon/authenticated policies: service-role only (ARCHIE-owned data),
-- same convention as frelux_archie_native_facts.

-- ---------------------------------------------------------
-- 2. Engine counters (cross-isolate diagnostics)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_engine_counters (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_engine_counters
  FORCE ROW LEVEL SECURITY;
-- FORCE per audit F2 convention (all tables FORCE RLS).
-- No anon/authenticated policies: service-role only (ARCHIE-owned data).
