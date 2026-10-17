-- ============================================================
-- ARCHIE UNCERTAINTY & CAUSAL INFERENCE ENGINE (gap A-2)
-- Migration 20261018010000 — fresh-database safe
--
-- One row per calibration key: REAL outcome counts behind
-- every Beta-calibrated confidence estimate. Service-role
-- only (RLS enabled, no policies — lockdown pattern).
-- The atomic increment function makes concurrent isolate
-- recording race-free.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_calibration (
  calibration_key text PRIMARY KEY,
  successes integer NOT NULL DEFAULT 0 CHECK (successes >= 0),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  last_outcome text NOT NULL DEFAULT 'SUCCESS'
    CHECK (last_outcome IN ('SUCCESS', 'FAILURE')),
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_calibration_updated_idx
  ON public.archie_calibration (last_updated DESC);

-- Atomic record: INSERT ... ON CONFLICT increment. Concurrent
-- isolates can never lose a count.
CREATE OR REPLACE FUNCTION public.archie_calibration_record(
  p_key text,
  p_success boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.archie_calibration (calibration_key, successes, failures, last_outcome, last_updated)
  VALUES (p_key, CASE WHEN p_success THEN 1 ELSE 0 END, CASE WHEN p_success THEN 0 ELSE 1 END, CASE WHEN p_success THEN 'SUCCESS' ELSE 'FAILURE' END, now())
  ON CONFLICT (calibration_key) DO UPDATE SET
    successes = public.archie_calibration.successes + CASE WHEN p_success THEN 1 ELSE 0 END,
    failures = public.archie_calibration.failures + CASE WHEN p_success THEN 0 ELSE 1 END,
    last_outcome = CASE WHEN p_success THEN 'SUCCESS' ELSE 'FAILURE' END,
    last_updated = now();
$$;

-- RLS lockdown: service role only (edge functions use the
-- service client; no anon/authenticated policy exists).
ALTER TABLE public.archie_calibration ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.archie_calibration_record(text, boolean)
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.archie_calibration_record(text, boolean)
  TO service_role;
