-- =========================================================
-- AI Admin Assistant — store Solas API key + action log
-- =========================================================

-- Add columns to site_settings for the Superagent API integration
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS solas_api_key text;
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS solas_agent_id text DEFAULT '6a872e1df3b5e9fc45fc13fb';
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS solas_chat_url text DEFAULT 'https://app.base44.com/superagent/6a872e1df3b5e9fc45fc13fb';

COMMENT ON COLUMN site_settings.solas_api_key IS 'API key for the FRELUX Superagent (Solas). Admin-only access.';
COMMENT ON COLUMN site_settings.solas_agent_id IS 'The Superagent app ID for Solas.';
COMMENT ON COLUMN site_settings.solas_chat_url IS 'Direct chat URL for the Solas Superagent.';

-- Ensure admin-only access to the API key column
DROP POLICY IF EXISTS "site_settings_admin_write_solas" ON site_settings;
CREATE POLICY "site_settings_admin_write_solas"
  ON site_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- =========================================================
-- admin_ai_actions — track issues reported and fixes applied
-- =========================================================
CREATE TABLE IF NOT EXISTS public.admin_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Who reported it
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The issue
  title text NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'bug',
  -- Values: bug, feature_request, content_update, api_change, config, other
  severity text DEFAULT 'normal',
  -- Values: low, normal, high, critical

  -- Solas conversation tracking
  conversation_id text,
  message_id text,

  -- Status lifecycle
  status text DEFAULT 'open',
  -- Values: open, in_progress, resolved, closed, failed

  -- Solas's response (the fix summary)
  resolution text,

  -- Files changed (JSON array of file paths)
  files_changed jsonb DEFAULT '[]'::jsonb,

  -- Commit hash if a git commit was made
  commit_hash text
);

ALTER TABLE public.admin_ai_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_ai_actions_admin_all" ON admin_ai_actions;
CREATE POLICY "admin_ai_actions_admin_all"
  ON admin_ai_actions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Index for listing by most recent
CREATE INDEX IF NOT EXISTS admin_ai_actions_created_at_idx
  ON public.admin_ai_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_ai_actions_status_idx
  ON public.admin_ai_actions (status);
