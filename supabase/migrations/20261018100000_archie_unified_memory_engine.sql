-- =========================================================
-- ARCHIE ADVANCED UNIFIED MEMORY ENGINE (MIGRATION)
-- supabase/migrations/20261018100000_archie_unified_memory_engine.sql
--
-- Compact, quota-conscious schema for durable unified memory:
--   1. frelux_archie_long_term_memories (user preferences, project context, operational rules, goals)
--   2. frelux_archie_episodic_events (structured task completions, decisions, milestones, error resolutions)
--   3. frelux_archie_memory_versions (version tracking, historical migration records)
--   4. frelux_archie_contradictions (flagged genuine contradictions for clarification)
--
-- STRICT STORAGE EFFICIENCY:
--   - No large vector caches or synthetic bulk embeddings.
--   - Compact JSONB metadata with bounded index footprint.
--   - FORCE ROW LEVEL SECURITY: service_role access only to protect memory privacy.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Long-Term Memories (preferences, rules, project context)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_long_term_memories (
  id text PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'owner',
  project_id text NOT NULL DEFAULT 'global',
  kind text NOT NULL CHECK (kind IN ('user_preference', 'project_context', 'long_term_goal', 'operational_rule', 'durable_knowledge')),
  key text NOT NULL,
  value jsonb NOT NULL,
  summary text NOT NULL,
  importance double precision NOT NULL DEFAULT 0.8 CHECK (importance >= 0.0 AND importance <= 1.0),
  confidence double precision NOT NULL DEFAULT 0.9 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  provenance text NOT NULL DEFAULT 'USER_PROVIDED',
  privacy text NOT NULL DEFAULT 'private_owner' CHECK (privacy IN ('private_owner', 'project_shared', 'workspace_global', 'ephemeral')),
  retention_policy text NOT NULL DEFAULT 'permanent' CHECK (retention_policy IN ('permanent', 'project_lifetime', 'session_only', 'expiring_30d', 'rolling_lru')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_archie_ltm_lookup
  ON public.frelux_archie_long_term_memories (user_id, project_id, kind, key);

CREATE INDEX IF NOT EXISTS idx_archie_ltm_updated
  ON public.frelux_archie_long_term_memories (updated_at DESC);

ALTER TABLE public.frelux_archie_long_term_memories
  FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 2. Episodic Events (milestones, decisions, task completions)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_episodic_events (
  id text PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'owner',
  project_id text NOT NULL DEFAULT 'global',
  conversation_id text NOT NULL DEFAULT 'main',
  event_type text NOT NULL CHECK (event_type IN ('conversation', 'task_completion', 'user_decision', 'project_milestone', 'error_resolution', 'action_outcome')),
  source text NOT NULL DEFAULT 'archie_native_runtime',
  participants text[] NOT NULL DEFAULT ARRAY['archie'],
  description text NOT NULL,
  associated_entities text[] NOT NULL DEFAULT ARRAY[]::text[],
  outcome text,
  lessons_learned text[],
  confidence double precision NOT NULL DEFAULT 0.8 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  verification_status text NOT NULL DEFAULT 'SYSTEM_OBSERVED',
  privacy text NOT NULL DEFAULT 'private_owner' CHECK (privacy IN ('private_owner', 'project_shared', 'workspace_global', 'ephemeral')),
  retention_policy text NOT NULL DEFAULT 'permanent' CHECK (retention_policy IN ('permanent', 'project_lifetime', 'session_only', 'expiring_30d', 'rolling_lru')),
  metadata jsonb,
  event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_events_user_proj
  ON public.frelux_archie_episodic_events (user_id, project_id, event_at DESC);

ALTER TABLE public.frelux_archie_episodic_events
  FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 3. Memory Version History (historical changes & evolution)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_memory_versions (
  id text PRIMARY KEY,
  memory_id text NOT NULL,
  version integer NOT NULL,
  previous_value jsonb,
  new_value jsonb NOT NULL,
  change_reason text NOT NULL,
  updated_by text NOT NULL DEFAULT 'owner',
  is_historical_change boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_versions_mem
  ON public.frelux_archie_memory_versions (memory_id, version);

ALTER TABLE public.frelux_archie_memory_versions
  FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 4. Contradictions & Conflict Ledger
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_contradictions (
  id text PRIMARY KEY,
  memory_id_a text NOT NULL,
  memory_id_b text,
  statement_a text NOT NULL,
  statement_b text NOT NULL,
  conflict_type text NOT NULL CHECK (conflict_type IN ('update', 'correction', 'historical_difference', 'genuine_contradiction', 'unreliable_source')),
  resolution_state text NOT NULL DEFAULT 'FLAGGED_NEEDS_CLARIFICATION' CHECK (resolution_state IN ('FLAGGED_NEEDS_CLARIFICATION', 'RESOLVED_SUPERSEDED', 'RESOLVED_HISTORICAL')),
  clarification_prompt text,
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_contradictions
  FORCE ROW LEVEL SECURITY;
