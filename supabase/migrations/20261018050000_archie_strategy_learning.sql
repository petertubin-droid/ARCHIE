-- ============================================================
-- ARCHIE STRATEGY LEARNING ENGINE (gap C-4)
-- Migration 20261018050000 — fresh-database safe
--
-- Real outcome counts per "<intent>:<strategy>" key, recorded
-- ONLY on explicit owner confirmation (positive) or correction
-- (negative) — engagement and citations never count. Atomic
-- increments race-safe across isolates. Service-role only
-- (RLS, no policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_strategy_stats (
  strategy_key text PRIMARY KEY,
  positives integer NOT NULL DEFAULT 0 CHECK (positives >= 0),
  negatives integer NOT NULL DEFAULT 0 CHECK (negatives >= 0),
  last_outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archie_strategy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_key text NOT NULL,
  positive boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_strategy_events_key_idx
  ON public.archie_strategy_events (strategy_key, created_at DESC);

-- Atomic increment: race-safe across isolates. The event row
-- is the audit trail; the stats row is the aggregate.
CREATE OR REPLACE FUNCTION public.archie_strategy_record(
  p_strategy_key text,
  p_positive boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.archie_strategy_stats AS s
    (strategy_key, positives, negatives, last_outcome_at)
  VALUES (
    p_strategy_key,
    CASE WHEN p_positive THEN 1 ELSE 0 END,
    CASE WHEN p_positive THEN 0 ELSE 1 END,
    now()
  )
  ON CONFLICT (strategy_key) DO UPDATE
    SET positives = s.positives + CASE WHEN p_positive THEN 1 ELSE 0 END,
        negatives = s.negatives + CASE WHEN p_positive THEN 0 ELSE 1 END,
        last_outcome_at = now(),
        updated_at = now();

  INSERT INTO public.archie_strategy_events (strategy_key, positive)
  VALUES (p_strategy_key, p_positive);
END;
$$;

REVOKE ALL ON FUNCTION public.archie_strategy_record(text, boolean) FROM anon, authenticated;

ALTER TABLE public.archie_strategy_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_strategy_events ENABLE ROW LEVEL SECURITY;
