-- =========================================================
-- ARCHIE NATIVE INTELLIGENCE ENGINE — DURABLE STORES +
-- PERMANENT CORE-DEPENDENCY PRINCIPLE (OWNER DIRECTIVE)
--
-- ARCHIE's own native independent intelligence engine is a
-- FOUNDATIONAL CORE COMPONENT built at owner directive. It
-- provides the foundational processing layer for natural
-- conversation and language understanding, reasoning and
-- problem solving, context management, persistent-memory
-- retrieval, knowledge acquisition and consolidation,
-- planning and decision-making, coding intelligence, code
-- analysis and generation, tool orchestration, web research,
-- self-evaluation and verification, and learning from
-- validated outcomes.
--
-- It operates with ZERO external commercial AI APIs.
-- External models, if ever used, are optional replaceable
-- components and never ARCHIE's core intelligence.
-- ARCHIE remains operational when Gemini, OpenAI, Claude,
-- Google AI services, or every other external AI provider is
-- unavailable.
--
-- Permanent architecture:
--   ARCHIE NATIVE ENGINE → MEMORY → KNOWLEDGE → REASONING →
--   TOOLS → LEARNING → VERIFICATION → IMPROVEMENT
--
-- This migration is IDEMPOTENT and IMMUTABLE-BY-DESIGN:
--   * ON CONFLICT (principle_id) DO NOTHING — upgrades and
--     re-deploys NEVER overwrite or erase it.
--   * Tables are RLS-guarded, service-role only.
--   * Engine core code:
--     supabase/functions/_shared/archie-ai/native-engine/
--     (shared by ARCHIE Core, archie-chat, Coding Studio and
--     the app via the provider-agnostic engine registry).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Durable knowledge facts (persistent memory retrieval)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_native_facts (
  id text PRIMARY KEY,
  subject text NOT NULL,
  predicate text NOT NULL,
  object jsonb NOT NULL,
  qualifiers jsonb,
  confidence double precision NOT NULL DEFAULT 0.5,
  provenance jsonb NOT NULL,
  status text NOT NULL DEFAULT 'candidate'
    -- 'derived' added by P8 (derived-vs-taught separation)
    CHECK (status IN ('candidate', 'validated', 'uncertain', 'derived')),
  validated_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_native_facts_spo
  ON public.frelux_archie_native_facts (subject, predicate);

ALTER TABLE public.frelux_archie_native_facts
  ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only (ARCHIE-owned data).

-- ---------------------------------------------------------
-- 2. Learning outcomes (learning from validated outcomes)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_native_outcomes (
  id text PRIMARY KEY,
  kind text NOT NULL
    CHECK (kind IN ('success', 'failure', 'correction')),
  task text NOT NULL,
  contributing jsonb NOT NULL DEFAULT '[]',
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_native_outcomes
  ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only (ARCHIE-owned data).

-- ---------------------------------------------------------
-- 3. Permanent core-dependency principle seed
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_core_principles
  (principle_id, title, content, origin, status)
VALUES (
  'native_engine_core',
  'ARCHIE Native Intelligence Engine — Permanent Core Dependency',
  jsonb_build_object(
    'rule',
      'ARCHIE''s own Native Intelligence Engine is a permanent core '
      'component of ARCHIE from birth. ARCHIE is never an empty '
      'intelligence shell waiting for Gemini, OpenAI, Claude or any '
      'other external AI engine. The engine provides the foundational '
      'processing layer for natural conversation and language '
      'understanding, reasoning and problem solving, context '
      'management, persistent-memory retrieval, knowledge acquisition '
      'and consolidation, planning and decision-making, coding '
      'intelligence, code analysis and generation, tool orchestration, '
      'web research, self-evaluation and verification, and learning '
      'from validated outcomes.',
    'independence',
      'The engine operates independently of external commercial AI '
      'APIs. External models, if ever used, are optional replaceable '
      'components and never ARCHIE''s core intelligence. ARCHIE '
      'remains operational when Gemini, OpenAI, Claude, Google AI '
      'services, or every other external AI provider is unavailable.',
    'honesty',
      'No mock, scripted, hardcoded or placeholder engine. A real '
      'executable architecture with measurable capabilities, tests '
      'and diagnostics. Capabilities not yet implemented are clearly '
      'reported rather than pretended to exist.',
    'extensibility',
      'The engine is designed to be extensible so ARCHIE can '
      'progressively improve its reasoning, learning, coding, '
      'knowledge retrieval and computational capabilities over time.',
    'authority',
      'Learning and knowledge improvement are free within ARCHIE''s '
      'established rules; self-modification, production changes, '
      'deployment, infrastructure changes and other consequential '
      'actions remain Owner-authorized.',
    'architecture',
      'ARCHIE NATIVE ENGINE → MEMORY → KNOWLEDGE → REASONING → TOOLS '
      '→ LEARNING → VERIFICATION → IMPROVEMENT. External AI is '
      'optional and external to ARCHIE.',
    'implementation',
      'Core code: supabase/functions/_shared/archie-ai/native-engine/ '
      '(engine, nlu, memory, knowledge, reasoning, planning, tools, '
      'webresearch, coding, selfeval, learning, capabilities, '
      'persistence). Registered as archie-native-engine in the '
      'provider-agnostic engine registry, resolved by ARCHIE Core, '
      'archie-chat, Coding Studio and the app. Durable stores: '
      'frelux_archie_native_facts, frelux_archie_native_outcomes. '
      'Preserved through upgrades, migrations, devices, PWA releases '
      'and future versions.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
)
ON CONFLICT (principle_id) DO NOTHING;
