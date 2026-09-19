-- =========================================================
-- ARCHIE ANATOMY — EARS GOES NATIVE (OPENAI REMOVED)
-- migration: 20260913120000_archie_ears_native.sql
--
-- Owner-directed OpenAI Separation Rule (2026-09-10):
-- "ARCHIE is independent — remove OpenAI from ARCHIE's
--  system. I have a voice bank in the database, use that
--  instead of OpenAI."
--
-- The ears subsystem no longer holds any provider dependency:
--   * Speech is understood through NATIVE on-device speech
--     recognition (browser/OS engine — no cloud provider,
--     no API key, no OpenAI).
--   * The owner's VOICE BANK (frelux_archie_voice_samples)
--     powers the voice machinery: replies are spoken with
--     the deterministic pitch/pace profile, and every
--     utterance gets an honest voice-print check (pure
--     pitch math against the bank profile).
--   * archie-ears is now the owner-gated, rate-limited,
--     audited INTAKE for native transcripts — it performs no
--     transcription and holds no provider key.
--   * A missing OpenAI key can no longer make ears
--     NOT_OPERATIONAL: it never depended on one.
-- =========================================================

UPDATE public.archie_subsystems
SET
  purpose = 'Receive and understand spoken instructions and audio information. NATIVE: speech is understood through on-device speech recognition (no provider, no key, no OpenAI — OpenAI Separation Rule), every utterance is voice-print checked against the owner''s voice bank by deterministic pitch math, the transcript flows through the normal cognitive pipeline, and every call is audited. An empty transcript is reported as speech_detected:false — never faked.',
  code_bindings = '[
    "supabase/functions/_shared/archie-ai/native-engine/ears.ts",
    "supabase/functions/archie-ears/index.ts",
    "src/lib/archie/ears.ts"
  ]'::jsonb,
  data_bindings = '[
    "frelux_archie_audit_events",
    "frelux_archie_voice_samples",
    "frelux_archie_languages"
  ]'::jsonb,
  operational = true,
  updated_date = now()
WHERE key = 'ears';

-- Honest audit trail of the anatomy change itself.
DO $mig$
BEGIN
  INSERT INTO public.frelux_archie_audit_events (
    owner_id, event_type, severity, detail
  )
  SELECT
    p.id,
    'archie.anatomy.ears_native',
    'INFO',
    jsonb_build_object(
      'reason', 'OpenAI Separation Rule (owner-directed): ears now run on native on-device speech recognition + the owner voice bank (deterministic pitch math). No OpenAI API, key or model anywhere in ARCHIE.',
      'voice_bank', 'frelux_archie_voice_samples',
      'engine', 'native-web-speech'
    )
  FROM public.profiles p
  WHERE p.role = 'admin'
  LIMIT 1;
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;

