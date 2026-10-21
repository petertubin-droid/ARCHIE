-- Per-account ARCHIE UI preferences. User-owned rows are isolated by RLS.
CREATE TABLE IF NOT EXISTS public.frelux_archie_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archie_preferences_object CHECK (jsonb_typeof(settings) = 'object')
);

ALTER TABLE public.frelux_archie_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_user_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archie_user_preferences_owner_all ON public.frelux_archie_user_preferences;
CREATE POLICY archie_user_preferences_owner_all
  ON public.frelux_archie_user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_user_preferences TO authenticated;
