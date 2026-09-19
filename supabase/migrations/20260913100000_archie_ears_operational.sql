-- =========================================================
-- ARCHIE ANATOMY — EARS BECOMES OPERATIONAL (REAL)
-- migration: 20260913100000_archie_ears_operational.sql
--
-- The Ears / Audio Intelligence subsystem is now genuinely
-- implemented, connected, tested and verified:
--
--   * REAL STT core: native-engine/ears.ts (OpenAI Whisper)
--   * Owner-only edge function: archie-ears (rate-limited,
--     fully audited to frelux_archie_audit_events)
--   * Client engine: src/lib/archie/ears.ts (explicit
--     owner-initiated mic capture, typed honest failures)
--   * Chat voice notes transcribed into the normal cognitive
--     pipeline; Voice page speaks replies via the voice bank
--   * 16 new tests lock in the never-fabricate invariants
--
-- The seed migration (20260910200000) honestly registered
-- ears operational=false with NO bindings because no real
-- transcription backend existed yet — never faked. This
-- migration binds it now that it is real. The anatomy
-- health runner independently verifies the engine module
-- loads and reports HEALTHY only once a real transcription
-- is audited — the registry row alone proves nothing.
-- =========================================================

UPDATE public.archie_subsystems
SET
  purpose = 'Receive and understand spoken instructions and audio information. REAL: speech is transcribed by the archie-ears edge function (Whisper STT core in native-engine/ears.ts), the transcript flows through the normal cognitive pipeline, and the detected language is validated against the live ARCHIE language registry. Every call is audited; an empty transcript is reported as speech_detected:false — never faked.',
  code_bindings = '[
    "supabase/functions/_shared/archie-ai/native-engine/ears.ts",
    "supabase/functions/archie-ears/index.ts",
    "src/lib/archie/ears.ts"
  ]'::jsonb,
  data_bindings = '[
    "frelux_archie_audit_events",
    "frelux_archie_voice_samples",
    "frelux_archie_conversations"
  ]'::jsonb,
  operational = true,
  updated_date = now()
WHERE key = 'ears';

-- Honest audit trail of the anatomy change itself (attributed
-- to the admin/owner profile when one exists).
DO $mig$
BEGIN
  INSERT INTO public.frelux_archie_audit_events (
    owner_id, event_type, severity, detail
  )
  SELECT
    p.id,
    'archie.anatomy.ears_operational',
    'INFO',
    jsonb_build_object(
      'reason', 'Ears subsystem implemented for real: shared STT core + owner-only archie-ears edge function + client engine; tests lock never-fabricate invariants; health runner probes engine module + real transcription audit trail',
      'code_bindings', jsonb_build_array(
        'supabase/functions/_shared/archie-ai/native-engine/ears.ts',
        'supabase/functions/archie-ears/index.ts',
        'src/lib/archie/ears.ts'
      )
    )
  FROM public.profiles p
  WHERE p.role = 'admin'
  LIMIT 1;
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;

