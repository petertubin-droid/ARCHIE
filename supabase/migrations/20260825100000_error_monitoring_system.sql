-- =========================================================
-- FRELUX Error Monitoring & System Health
-- Centralized application error tracking with grouping,
-- rate limiting, deduplication, and admin dashboard.
-- =========================================================

-- ── application_errors table ──
CREATE TABLE IF NOT EXISTS public.application_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Error details
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  error_type text NOT NULL DEFAULT 'runtime',
  message text NOT NULL,
  stack_trace text,
  fingerprint text NOT NULL,

  -- Context
  route text,
  feature text,
  calculator text,
  http_status integer,
  service text,

  -- Client info
  browser text,
  operating_system text,
  device_type text,
  app_version text,
  session_id text,

  -- User (optional, only when authenticated and relevant)
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Additional sanitized metadata
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Grouping / dedup
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),

  -- Resolution
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);



-- ── Grant privileges ──
-- NOTE (chain-replay fix 2026-09-12): the error_alert_config and
-- system_health_checks GRANTs originally sat here, before those tables
-- are created further down in this file. On a fresh chain replay the
-- GRANTs aborted with 42P01 (relation does not exist). They were moved
-- below the CREATE TABLE statements — same privileges, valid ordering.
-- service_role needs full access (used by edge functions with service role key)
GRANT INSERT, SELECT, UPDATE, DELETE ON public.application_errors TO service_role;

-- authenticated (admins) need read and update
GRANT SELECT, UPDATE ON public.application_errors TO authenticated;

-- anon can insert via the edge function (which uses service role key)
-- Direct anon inserts are blocked by RLS — only the service_role policy allows inserts
-- But we grant to anon as fallback for the edge function auth flow
-- NOTE: anon INSERT policy was removed — all inserts go through the edge function only

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON public.application_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_severity ON public.application_errors (severity);
CREATE INDEX IF NOT EXISTS idx_app_errors_route ON public.application_errors (route);
CREATE INDEX IF NOT EXISTS idx_app_errors_feature ON public.application_errors (feature);
CREATE INDEX IF NOT EXISTS idx_app_errors_resolved ON public.application_errors (resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_app_errors_type ON public.application_errors (error_type);
CREATE INDEX IF NOT EXISTS idx_app_errors_fingerprint ON public.application_errors (fingerprint);
CREATE INDEX IF NOT EXISTS idx_app_errors_session ON public.application_errors (session_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_last_seen ON public.application_errors (last_seen DESC);

-- ── RLS ──
ALTER TABLE public.application_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_errors FORCE ROW LEVEL SECURITY;

-- Normal users CANNOT read or modify the error table at all.
-- Only admins can SELECT, UPDATE (for resolve/reopen).
-- INSERT is handled via the report-error Edge Function (service role, bypasses RLS).
DROP POLICY IF EXISTS "Admins can read application errors" ON application_errors;
CREATE POLICY "Admins can read application errors"
  ON public.application_errors FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update application errors" ON application_errors;
CREATE POLICY "Admins can update application errors"
  ON public.application_errors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete application errors" ON application_errors;
CREATE POLICY "Admins can delete application errors"
  ON public.application_errors FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Error alert config table ──
CREATE TABLE IF NOT EXISTS public.error_alert_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  alert_type text NOT NULL
    CHECK (alert_type IN ('critical_error', 'error_spike', 'ai_outage', 'payment_failure', 'auth_outage', 'calculator_failure')),
  enabled boolean NOT NULL DEFAULT true,
  threshold_count integer NOT NULL DEFAULT 5,
  threshold_window_minutes integer NOT NULL DEFAULT 30,
  cooldown_minutes integer NOT NULL DEFAULT 60,

  UNIQUE (alert_type)
);

ALTER TABLE public.error_alert_config ENABLE ROW LEVEL SECURITY;
-- ── Grants for error_alert_config (moved from above — table now exists) ──
GRANT ALL ON public.error_alert_config TO service_role;
GRANT SELECT, UPDATE ON public.error_alert_config TO authenticated;


DROP POLICY IF EXISTS "Admins manage error alert config" ON error_alert_config;
CREATE POLICY "Admins manage error alert config"
  ON public.error_alert_config FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── updated_at trigger for error_alert_config ──
CREATE OR REPLACE FUNCTION public.set_updated_at_error_alert_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_error_alert_config ON public.error_alert_config;
CREATE TRIGGER set_updated_at_error_alert_config
  BEFORE UPDATE ON public.error_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_error_alert_config();

-- ── Seed default alert configs ──
INSERT INTO public.error_alert_config (alert_type, enabled, threshold_count, threshold_window_minutes, cooldown_minutes)
VALUES
  ('critical_error', true, 1, 5, 120),
  ('error_spike', true, 10, 15, 60),
  ('ai_outage', true, 3, 10, 30),
  ('payment_failure', true, 3, 10, 30),
  ('auth_outage', true, 5, 5, 30),
  ('calculator_failure', true, 5, 15, 60)
ON CONFLICT (alert_type) DO NOTHING;

-- ── System health snapshot table (cached health check results) ──
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  service text NOT NULL,
  status text NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  response_time_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_health_checks_service_time ON public.system_health_checks (service, checked_at DESC);

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
-- ── Grants for system_health_checks (moved from above — table now exists) ──
GRANT ALL ON public.system_health_checks TO service_role;
GRANT SELECT, UPDATE ON public.system_health_checks TO authenticated;


DROP POLICY IF EXISTS "Admins read health checks" ON system_health_checks;
CREATE POLICY "Admins read health checks"
  ON public.system_health_checks FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Auto-resolve trigger: when an error is resolved, set resolved_at ──
CREATE OR REPLACE FUNCTION public.set_resolved_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.resolved = true AND OLD.resolved = false THEN
    NEW.resolved_at = now();
    NEW.resolved_by = auth.uid();
  ELSIF NEW.resolved = false AND OLD.resolved = true THEN
    NEW.resolved_at = NULL;
    NEW.resolved_by = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_resolved_at_trigger ON public.application_errors;
CREATE TRIGGER set_resolved_at_trigger
  BEFORE UPDATE ON public.application_errors
  FOR EACH ROW EXECUTE FUNCTION public.set_resolved_at();

-- ── Retention function: delete old resolved errors ──
-- Keeps unresolved critical errors indefinitely.
-- Deletes resolved errors older than retention_days (default 90).
CREATE OR REPLACE FUNCTION public.cleanup_old_errors(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.application_errors
  WHERE resolved = true
    AND last_seen < now() - (retention_days || ' days')::interval
    AND severity != 'critical';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
