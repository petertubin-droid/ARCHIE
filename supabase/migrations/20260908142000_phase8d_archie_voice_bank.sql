-- =========================================================
-- FRELUX PHASE 8d — ARCHIE VOICE BANK (owner's own voice)
-- Free-tier: samples + derived pitch/pace profile, owner-only.
-- No paid AI/cloud service — analysis is deterministic math.
-- =========================================================

CREATE TABLE IF NOT EXISTS frelux_archie_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'audio/webm',
  pitch_hz numeric,
  rate_hint numeric,
  duration_sec numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE frelux_archie_voice_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own voice samples" ON frelux_archie_voice_samples;
CREATE POLICY "users manage own voice samples" ON frelux_archie_voice_samples
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON frelux_archie_voice_samples TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('archie-voice-samples', 'archie-voice-samples', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users upload own voice samples" ON storage.objects;
CREATE POLICY "users upload own voice samples" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'archie-voice-samples'
              AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users read own voice samples" ON storage.objects;
CREATE POLICY "users read own voice samples" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archie-voice-samples'
         AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users delete own voice samples" ON storage.objects;
CREATE POLICY "users delete own voice samples" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'archie-voice-samples'
         AND (storage.foldername(name))[1] = auth.uid()::text);
