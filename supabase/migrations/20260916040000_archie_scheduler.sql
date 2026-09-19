-- =========================================================
-- ARCHIE BACKGROUND SCHEDULER (gap audit F-1, C-3, C-2 —
-- owner directive 2026-09-16)
--
-- ARCHIE's learning infrastructure was traffic-driven:
-- consolidation only fired when an engine booted with a
-- message, and saved cognitive traces were never re-examined
-- as learning material. This migration installs the heartbeat:
--
--   pg_cron + pg_net invoke the archie-maintenance edge
--   function hourly. It runs the identical hour-gated
--   consolidation pass and reflects over weak traces
--   (epistemic != VERIFIED or confidence < 0.5), recording
--   honest failure outcomes with NO contributing facts
--   (citing is not credit — no false reinforcement possible).
--
-- AUTH: the cron job passes a per-installation random token
-- (64 hex chars, generated HERE, never in code) which the
-- function verifies against archie_scheduler_tokens in the
-- DB. No token, no run — and the attempt is logged as a
-- security event.
--
-- Idempotent: safe to re-apply (jobs unscheduled first,
-- token row kept).
-- =========================================================

-- 1. Extensions (standard on Supabase).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Token store — the gate the function checks. FORCE RLS
--    with no policies: service-role only, like all ARCHIE tables.
CREATE TABLE IF NOT EXISTS public.archie_scheduler_tokens (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archie_scheduler_tokens FORCE ROW LEVEL SECURITY;

-- 2b. Generate the per-installation token ONCE. 64 hex chars
--     from pgcrypto's CSPRNG — never printed, never in code.
DO $$
DECLARE new_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.archie_scheduler_tokens) THEN
    new_token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.archie_scheduler_tokens (token) VALUES (new_token);
  END IF;
END $$;

-- 3. Scheduler state (reflection watermark) — service-role only.
CREATE TABLE IF NOT EXISTS public.archie_scheduler_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archie_scheduler_state FORCE ROW LEVEL SECURITY;

-- 4. Run log — the scheduler is observable, not a black box.
CREATE TABLE IF NOT EXISTS public.archie_scheduler_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode text NOT NULL,
  ok boolean NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archie_scheduler_runs FORCE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_archie_scheduler_runs_created
  ON public.archie_scheduler_runs (created_at DESC);

-- 5. The hourly heartbeat. archie-* functions deploy with
--    --no-verify-jwt; the x-maintenance-token header IS the
--    gate. Unschedule any previous version first (idempotent).
SELECT cron.unschedule('archie-maintenance-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archie-maintenance-hourly');

SELECT cron.schedule(
  'archie-maintenance-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hqhvlkunkdrxyuvziorm.supabase.co/functions/v1/archie-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-token', (SELECT token FROM public.archie_scheduler_tokens LIMIT 1)
    ),
    body := jsonb_build_object('mode', 'all')
  );
  $$
);
