-- =========================================================
-- ARCHIE ADVANCED VOICE INTELLIGENCE — ANATOMY UPDATE
-- migration: 20260918120000_archie_voice_intelligence_anatomy.sql
--
-- The ears subsystem becomes the full voice-intelligence layer
-- (owner directive 2026-09-13): a genuinely functional
-- conversational voice interface on the ONE ARCHIE spine.
--
--   MICROPHONE → EARS (native STT + audited intake) →
--     SPEAKER RECOGNITION (derived vectors, server-side
--     comparison, owner enrollment) → LANGUAGE →
--     COGNITIVE ENGINE (archie-core — the REAL engine) →
--     AUTHORITY (unchanged: voice NEVER authorizes) →
--     MOUTH (TTS) → LISTEN AGAIN (barge-in supported)
--
-- Nothing here creates a second intelligence — the voice
-- layer is an interface to the existing cognitive pipeline.
-- =========================================================

UPDATE public.archie_subsystems
SET
  purpose = 'Receive and understand spoken instructions and audio information — now a full conversational voice interface. NATIVE: speech is understood through on-device recognition (no provider, no key — OpenAI Separation Rule), every utterance is voice-print checked against the owner''s voice bank, and enrolled owner voice profiles (frelux_archie_speaker_profile, derived vectors only — raw audio never uploaded) add a server-verified speaker-similarity signal for personalization. Transcripts flow through the audited intake into the REAL cognitive pipeline (archie-core), replies are spoken through the mouth, and a continuous conversational session re-listens with genuine barge-in. The speaker signal is a statistical similarity hint — NOT cryptographic identity and NEVER authorization: protected operations always require the existing owner-authorization workflow.',
  code_bindings = '[
    "supabase/functions/_shared/archie-ai/native-engine/voiceprint.ts",
    "supabase/functions/_shared/archie-ai/native-engine/ears.ts",
    "supabase/functions/_shared/archie-ai/native-engine/mouth.ts",
    "supabase/functions/archie-voice-enroll/index.ts",
    "supabase/functions/archie-ears/index.ts",
    "src/lib/archie/voice-session.ts",
    "src/lib/archie/ears.ts",
    "src/lib/archie/mobile/voice-enrollment.ts",
    "src/lib/archie/mobile/voice-profile.ts",
    "src/lib/archie/mobile/voice.ts",
    "src/pages/Assistant.tsx"
  ]'::jsonb,
  data_bindings = '[
    "frelux_archie_audit_events",
    "frelux_archie_voice_samples",
    "frelux_archie_speaker_profile",
    "frelux_archie_languages",
    "frelux_archie_conversations"
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
    'archie.anatomy.voice_intelligence',
    'INFO',
    jsonb_build_object(
      'reason', 'Advanced Voice Intelligence: conversational voice sessions with genuine barge-in, real interim transcripts, server-side speaker recognition (deliberate owner enrollment, derived vectors only), and text/voice both routed through the REAL archie-core cognitive engine. The fake on-device generateFree chat path was removed from the assistant.',
      'new_edge', 'archie-voice-enroll (owner-gated, rate-limited, audited)',
      'new_table', 'frelux_archie_speaker_profile (owner-only RLS)',
      'security', 'voice recognition is an identification signal, never authorization — high-risk spoken phrases route to the existing owner-authorization workflow and never execute',
      'constitution', 'LEARNING ≠ AUTHORIZATION; VOICE RECOGNITION ≠ UNLIMITED AUTHORITY; VOICE INPUT ≠ DIRECT EXECUTION'
    )
  FROM public.profiles p
  WHERE p.role = 'admin'
  LIMIT 1;
END $mig$;
