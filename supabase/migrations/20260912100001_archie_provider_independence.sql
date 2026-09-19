-- =========================================================
-- ARCHIE CORE PRINCIPLE — PROVIDER INDEPENDENCE
-- (GEMINI SEPARATION RULE) — PERMANENT, OWNER-DIRECTED
--
-- Seeds the PERMANENT PROVIDER INDEPENDENCE PRINCIPLE into
-- ARCHIE's durable birthright store:
--
--   ARCHIE is an independent intelligence system. Gemini must
--   NOT be part of ARCHIE's core intelligence, memory,
--   learning system, Coding Studio, reasoning engine,
--   self-evolution system, or PWA. ARCHIE must operate
--   independently using its own learned knowledge, coding
--   intelligence, memory, tools, and authorized capabilities.
--
--   Gemini belongs ONLY to the FRELUX application as a
--   secondary fallback intelligence service, and may be
--   called ONLY when ARCHIE determines it does not have
--   sufficient validated knowledge to solve a specific
--   FRELUX problem, OR cannot reliably complete the requested
--   task with its current capabilities. ARCHIE never
--   automatically delegates normal work to Gemini; every
--   Gemini response is external assistance requiring ARCHIE's
--   own analysis and validation before acceptance.
--
-- The seed is IDEMPOTENT and IMMUTABLE-BY-DESIGN:
--   * ON CONFLICT (principle_id) DO NOTHING — an upgrade,
--     migration or re-deploy NEVER overwrites or erases it.
--   * ARCHIE itself cannot alter the row (RLS, admins only).
--   * Encoded in core code at src/lib/archie/provider-independence.ts
--     and statically enforced by
--     src/lib/archie/__tests__/provider-independence.test.ts.
-- =========================================================

INSERT INTO public.frelux_archie_core_principles
  (principle_id, title, content, origin, status)
VALUES (
  'provider_independence',
  'ARCHIE Provider Independence (Gemini Separation Rule)',
  jsonb_build_object(
    'rule',
      'ARCHIE is an independent intelligence system. Gemini must NOT be '
      'part of ARCHIE''s core intelligence, memory, learning system, '
      'Coding Studio, reasoning engine, self-evolution system, or PWA. '
      'ARCHIE must operate independently using its own learned knowledge, '
      'coding intelligence, memory, tools, and authorized capabilities.',
    'geminiScope',
      'Gemini belongs ONLY to the FRELUX application as a secondary '
      'fallback intelligence service.',
    'allowedConditions', jsonb_build_array(
      'ARCHIE determines that it does not have sufficient validated '
      'knowledge to solve a specific FRELUX problem, OR',
      'ARCHIE determines that it cannot reliably complete the requested '
      'task with its current capabilities.'
    ),
    'prohibitions', jsonb_build_array(
      'ARCHIE must never automatically delegate normal work to Gemini '
      'simply because Gemini is available.',
      'Before requesting Gemini assistance, ARCHIE must attempt the task '
      'using its own capabilities.',
      'Any Gemini response must be treated as external assistance '
      'requiring ARCHIE''s own analysis and validation before being '
      'accepted into its knowledge or workflow.',
      'Gemini must not be copied into ARCHIE''s core architecture.',
      'ARCHIE must not be made dependent on Gemini.',
      'Gemini must not be ARCHIE''s hidden backend, fallback model, '
      'coding engine, or reasoning engine.'
    ),
    'studioWorkflow', jsonb_build_array(
      'Owner instruction', 'ARCHIE reasoning', 'code generation',
      'sandbox', 'testing', 'verification', 'live preview',
      'Owner review'
    ),
    'protectedSubsystems', jsonb_build_array(
      'ARCHIE Core', 'ARCHIE Coding Studio', 'ARCHIE Memory',
      'ARCHIE Learning', 'ARCHIE Evolution', 'ARCHIE PWA'
    ),
    'engineContract',
      'All ARCHIE inference resolves through ARCHIE''s provider-agnostic '
      'engine registry (neutral engine ids only). No engine operational '
      'means an honest not-operational result — never a silent provider '
      'substitution and never a faked result.',
    'governing', 'Owner Authority Layer',
    'permanence',
      'Permanent architectural principle. Persisted across upgrades, '
      'migrations, devices and deployments. Never implemented as a '
      'temporary instruction, mock, placeholder or hardcoded '
      'conversational response.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
)
ON CONFLICT (principle_id) DO NOTHING;
