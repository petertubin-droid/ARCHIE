-- =========================================================
-- ARCHIE UNIFIED GENERAL COGNITIVE INTELLIGENCE ENGINE —
-- DURABLE STORES + PERMANENT CORE PRINCIPLE (OWNER
-- DIRECTIVE 2026-09-10)
--
-- The HIGHEST-LEVEL intelligence architecture of ARCHIE:
-- ONE unified ARCHIE intelligence (never sub-agents)
-- integrating fifteen systems — multimodal perception,
-- knowledge, persistent memory, advanced reasoning, world
-- model, planning, creation, coding intelligence, tool
-- intelligence, verification, meta-cognition, learning,
-- self-improvement, security & integrity, and cognitive
-- orchestration — running the permanent cognitive loop:
--
--   PERCEIVE → UNDERSTAND → RETRIEVE → REASON → MODEL →
--   PLAN → CREATE → VERIFY → ACT → OBSERVE → EVALUATE →
--   LEARN → REMEMBER → IMPROVE → REPEAT
--
-- Epistemic taxonomy: KNOWN → VERIFIED → INFERRED →
-- ASSUMED → UNKNOWN. Knowledge is never fabricated.
-- Learning NEVER grants execution authority: consequential
-- changes follow DISCOVER → ANALYZE → PROPOSE → OWNER
-- APPROVAL → STAGE → TEST → VERIFY → OWNER APPROVAL →
-- DEPLOY.
--
-- Engine independence: ARCHIE has its own persistent
-- intelligence architecture; external models are
-- replaceable computational components only.
--
-- This migration is IDEMPOTENT and IMMUTABLE-BY-DESIGN:
--   * ON CONFLICT (principle_id) DO NOTHING — upgrades and
--     re-deploys NEVER overwrite or erase it.
--   * Tables are RLS-guarded, service-role only.
--   * Engine core code:
--     supabase/functions/_shared/archie-ai/cognitive/
--     (the kernel) over native-engine/ (the substrate).
-- =========================================================

-- ---------------------------------------------------------
-- 1. World model — entities and typed relations
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_world_model (
  id text PRIMARY KEY,
  subject text NOT NULL,
  relation text NOT NULL,
  object text NOT NULL,
  subject_kind text NOT NULL DEFAULT 'Concept',
  object_kind text NOT NULL DEFAULT 'Concept',
  confidence double precision NOT NULL DEFAULT 0.5,
  provenance text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_world_model_subject
  ON public.frelux_archie_world_model (subject);
CREATE INDEX IF NOT EXISTS idx_archie_world_model_object
  ON public.frelux_archie_world_model (object);

ALTER TABLE public.frelux_archie_world_model ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only.

-- ---------------------------------------------------------
-- 2. Security & integrity — append-only hash-chained audit
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_audit_log (
  seq bigint PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  prev_hash text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_audit_log_at
  ON public.frelux_archie_audit_log (at DESC);

ALTER TABLE public.frelux_archie_audit_log ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only.
-- Append-only semantics enforced in application code
-- (SecurityIntegrityEngine); the chain is tamper-evident.

-- ---------------------------------------------------------
-- 3. Cognitive loop traces — real observability
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_cognitive_traces (
  id text PRIMARY KEY,
  task text NOT NULL,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  route jsonb NOT NULL DEFAULT '{}'::jsonb,
  epistemic text NOT NULL DEFAULT 'UNKNOWN',
  confidence double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_cognitive_traces_created
  ON public.frelux_archie_cognitive_traces (created_at DESC);

ALTER TABLE public.frelux_archie_cognitive_traces ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only.

-- ---------------------------------------------------------
-- 4. Permanent core principle: the unified cognitive
--    engine is ARCHIE's highest-level architecture.
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_core_principles (
  principle_id, title, content, origin, status
) VALUES (
  'unified_cognitive_engine',
  'Unified General Cognitive Intelligence Engine (Highest-Level Architecture)',
  jsonb_build_object(
    'rule', 'ARCHIE''s highest-level intelligence architecture is a Unified '
      'General Cognitive Intelligence Engine: ONE unified ARCHIE '
      'intelligence, never multiple sub-agents. It integrates fifteen '
      'systems - multimodal perception, knowledge engine, persistent '
      'memory, advanced reasoning, world model, planning, creation, coding '
      'intelligence, tool intelligence, verification, meta-cognition, '
      'learning, self-improvement, security & integrity, and cognitive '
      'orchestration - in the permanent cognitive loop PERCEIVE, '
      'UNDERSTAND, RETRIEVE, REASON, MODEL, PLAN, CREATE, VERIFY, ACT, '
      'OBSERVE, EVALUATE, LEARN, REMEMBER, IMPROVE, REPEAT.',
    'knowledge', 'Knowledge expansion is unbounded (no hardcoded domain, '
      'language or technology ceiling). Every claim carries an honest '
      'epistemic status: KNOWN, VERIFIED, INFERRED, ASSUMED, UNKNOWN. '
      'Knowledge is never fabricated when information is unavailable.',
    'authority', 'Autonomy vs authority: ARCHIE may reason, learn, analyze, '
      'research, create proposals, test code and improve its knowledge '
      'autonomously where permitted, but learning and intelligence NEVER '
      'grant execution authority. Consequential system changes follow '
      'DISCOVER, ANALYZE, PROPOSE, OWNER APPROVAL, STAGE, TEST, VERIFY, '
      'OWNER APPROVAL, DEPLOY. The Owner Authority Layer is never '
      'bypassed.',
    'independence', 'Engine independence: the unified engine is ARCHIE''s '
      'own persistent architecture, built on ARCHIE''s native engine with '
      'zero external AI providers. External models, where technically '
      'integrated, remain replaceable computational components - never '
      'ARCHIE''s identity, memory, authority or intelligence. No hidden '
      'dependencies. No mocks, placeholders or simulated intelligence: '
      'every capability is implemented, measured and reported honestly, '
      'or explicitly reported as not implemented.',
    'permanence', 'This principle is permanent from birth: preserve the '
      'unified engine and this architecture through every upgrade, '
      'migration, device, PWA release and future version.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Privileges: tables created via the Management API SQL runner do NOT
-- receive Supabase's default privileges (no GRANT to service_role), which
-- silently denied the engine's writes (HTTP 403, error swallowed by
-- persistence). Grant service-role explicitly; anon/authenticated stay
-- blocked by RLS (service-role only).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public TO service_role;
