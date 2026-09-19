-- =========================================================
-- ARCHIE CORE PRINCIPLE — PROVIDER INDEPENDENCE
-- (OPENAI SEPARATION RULE) — PERMANENT, OWNER-DIRECTED
--
-- Seeds the OPENAI SEPARATION PRINCIPLE into ARCHIE's durable
-- birthright store, by direct owner instruction (2026-09-10):
--
--   "ARCHIE is independent — remove OpenAI from ARCHIE's
--    system. I have a voice bank in the database, use that
--    instead of OpenAI."
--
--   * ARCHIE's voice features are provider-free: replies are
--     spoken through the owner's own voice bank (deterministic
--     pitch/pace math on recorded samples — no cloud AI) and
--     speech is understood through native on-device speech
--     recognition. No OpenAI key, API or model powers any
--     part of ARCHIE's ears or voice.
--   * No OpenAI API endpoint, key, model id or SDK may appear
--     in any ARCHIE-owned function, module, page or test.
--   * A missing OpenAI key can never make an ARCHIE subsystem
--     fail or claim NOT_OPERATIONAL — ARCHIE does not depend
--     on it at all.
--   * OpenAI belongs ONLY to the FRELUX application as a
--     secondary fallback, under the same conditions as Gemini.
--
-- The seed is IDEMPOTENT and IMMUTABLE-BY-DESIGN (same
-- pattern as the Gemini separation rule):
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
  'openai_separation',
  'ARCHIE Provider Independence (OpenAI Separation Rule)',
  jsonb_build_object(
    'rule',
    'ARCHIE is an independent intelligence system. OpenAI must NOT be part of ARCHIE''s core intelligence, memory, learning system, Coding Studio, reasoning engine, self-evolution system, voice/ears system, or PWA. ARCHIE must operate independently using its own learned knowledge, coding intelligence, memory, tools, and authorized capabilities.',
    'openai_scope',
    'OpenAI belongs ONLY to the FRELUX application as a secondary fallback intelligence service, under the same conditions as Gemini.',
    'voice_independence',
    'ARCHIE''s voice features are provider-free by construction: replies are spoken through the owner''s own voice bank (deterministic pitch/pace math on recorded samples — no cloud AI), and speech is understood through native on-device speech recognition. No OpenAI key, API or model may power any part of ARCHIE''s ears or voice.',
    'prohibitions', jsonb_build_array(
      'No OpenAI API endpoint, key, model id or SDK may appear in any ARCHIE-owned function, module, page or test.',
      'ARCHIE must never delegate transcription, synthesis, reasoning or any other work to OpenAI.',
      'A missing or removed OpenAI key must never make an ARCHIE subsystem fail or claim NOT_OPERATIONAL — ARCHIE subsystems do not depend on it at all.',
      'OpenAI must not be ARCHIE''s hidden backend, fallback model, coding engine, reasoning engine, transcription engine or voice engine.'
    ),
    'governing', 'Owner Authority Layer',
    'permanence', 'Permanent architectural principle. Persisted across upgrades, migrations, devices and deployments.'
  )::jsonb,
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;
