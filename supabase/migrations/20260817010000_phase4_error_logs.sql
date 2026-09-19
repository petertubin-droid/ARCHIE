-- ─────────────────────────────────────────────────────────
-- Phase 4: Monitoring — error_logs table
-- ─────────────────────────────────────────────────────────

-- Error logs table for tracking runtime errors from the frontend
-- RLS: users can only see their own errors; admins see all.
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Error details
  error_message text NOT NULL,
  error_stack text,
  component_stack text,

  -- Context
  boundary_name text NOT NULL DEFAULT 'unknown',
  url text,
  user_agent text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status for triage
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Severity (auto-classified by error message patterns)
  severity text NOT NULL DEFAULT 'error'
    CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Indexes for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs (severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON public.error_logs (is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_boundary ON public.error_logs (boundary_name);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs FORCE ROW LEVEL SECURITY;

-- Policies:
-- 1. Users can INSERT their own errors (for error boundary logging)
-- 2. Users can SELECT their own errors
-- 3. Admins can SELECT, UPDATE all errors
-- 4. Anon can INSERT errors (for unauthenticated error reporting)

DROP POLICY IF EXISTS "Anyone can insert error logs" ON error_logs;
CREATE POLICY "Anyone can insert error logs"
  ON public.error_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own error logs" ON public.error_logs;
CREATE POLICY "Users can view own error logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update error logs" ON public.error_logs;
CREATE POLICY "Admins can update error logs"
  ON public.error_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete error logs" ON public.error_logs;
CREATE POLICY "Admins can delete error logs"
  ON public.error_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger to set user_id from auth.uid() on INSERT
-- (so the error boundary doesn't need to pass user_id explicitly)
CREATE OR REPLACE FUNCTION public.set_error_log_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_error_log_user_id ON public.error_logs;
CREATE TRIGGER trg_set_error_log_user_id
  BEFORE INSERT ON public.error_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_error_log_user_id();

-- Auto-classify severity based on error message patterns
CREATE OR REPLACE FUNCTION public.classify_error_severity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Critical: network errors, auth failures, data corruption
  IF NEW.error_message ~* '(network|fetch failed|websocket|supabase.*error|auth.*failed|session.*expired)' THEN
    NEW.severity := 'critical';
  -- Warning: deprecation warnings, rate limits
  ELSIF NEW.error_message ~* '(rate.limit|deprecated|timeout|slow.*query)' THEN
    NEW.severity := 'warning';
  -- Info: performance metrics (web vitals)
  ELSIF NEW.boundary_name = 'web_vital' OR NEW.error_message ~* 'web.vital' THEN
    NEW.severity := 'info';
  ELSE
    NEW.severity := 'error';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_error_severity ON public.error_logs;
CREATE TRIGGER trg_classify_error_severity
  BEFORE INSERT ON public.error_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.classify_error_severity();
