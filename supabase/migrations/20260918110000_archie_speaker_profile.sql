-- =========================================================
-- ARCHIE ADVANCED VOICE INTELLIGENCE — SPEAKER PROFILE
-- migration: 20260918110000_archie_speaker_profile.sql
--
-- Owner voice enrollment for speaker recognition:
--   * ONLY derived feature vectors are stored — raw voice
--     recordings are NEVER uploaded for recognition (the
--     voice bank in frelux_archie_voice_samples is separate,
--     owner-managed, for the reply voice profile).
--   * Owner-only RLS: no other user can read, replace or
--     delete the Owner voice profile.
--   * Enrollment is deliberate and multi-sample; the state
--     machine (NONE → ENROLLING → COMPLETE, or DISABLED) is
--     enforced server-side in archie-voice-enroll.
--   * SECURITY LABEL travels with the data: the voiceprint
--     is a statistical speaker-similarity signal, NOT
--     cryptographic identity — it can never authorize
--     protected operations.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_speaker_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NONE | ENROLLING | COMPLETE | DISABLED
  enrollment_state text NOT NULL DEFAULT 'NONE',
  -- pending enrollment vectors (deliberate multi-sample flow)
  pending_samples jsonb NOT NULL DEFAULT '[]',
  -- median-combined owner vector (set at finalize)
  features jsonb,
  match_threshold numeric NOT NULL DEFAULT 0.72,
  sample_count int NOT NULL DEFAULT 0,
  -- languages the owner enrolled in (advisory metadata)
  languages text[] NOT NULL DEFAULT '{}',
  security_label text NOT NULL
    DEFAULT 'statistical speaker-similarity signal — an identification hint for personalization, NOT cryptographic proof of identity; can never authorize protected operations',
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_speaker_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages own speaker profile" ON public.frelux_archie_speaker_profile;
CREATE POLICY "owner manages own speaker profile"
  ON public.frelux_archie_speaker_profile
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_speaker_profile TO authenticated;

-- Honest audit of the anatomy change itself.
DO $mig$
BEGIN
  INSERT INTO public.frelux_archie_audit_events (
    owner_id, event_type, severity, detail
  )
  SELECT
    p.id,
    'archie.anatomy.speaker_profile_created',
    'INFO',
    jsonb_build_object(
      'reason', 'Advanced Voice Intelligence: owner voice enrollment for speaker recognition — derived feature vectors only, raw recordings never uploaded, owner-only RLS.',
      'table', 'frelux_archie_speaker_profile',
      'security_label', 'statistical speaker-similarity signal, NOT cryptographic identity — voice can never authorize protected operations'
    )
  FROM public.profiles p
  WHERE p.role = 'admin'
  LIMIT 1;
END $mig$;
