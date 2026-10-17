-- ============================================================
-- ARCHIE BOUNDED SELF-TUNING ENGINE (gap C-1)
-- Migration 20261018020000 — fresh-database safe
--
-- Owner-approved tuning envelopes for the REAL bounded
-- parameters the reasoning path consumes (ReasoningLimits).
-- Every applied/rolled-back/kept decision is an auditable
-- event row. Service-role only (RLS, no policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_tuning_params (
  param_key text PRIMARY KEY,
  current numeric NOT NULL,
  min numeric NOT NULL,
  max numeric NOT NULL,
  step numeric NOT NULL,
  owner_approved boolean NOT NULL DEFAULT false,
  last_tuned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min <= current AND current <= max),
  CHECK (step > 0)
);

CREATE TABLE IF NOT EXISTS public.archie_tuning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  param_key text NOT NULL,
  from_value numeric NOT NULL,
  to_value numeric NOT NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('applied', 'kept', 'rolled_back', 'skipped_unapproved')),
  success_rate numeric,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_tuning_events_param_idx
  ON public.archie_tuning_events (param_key, created_at DESC);

-- Owner-approved envelopes for the six REAL reasoning budgets.
-- Bounds are deliberately narrow: the tuner can only ever
-- move a parameter inside these ranges, one step per cycle.
INSERT INTO public.archie_tuning_params
  (param_key, current, min, max, step, owner_approved)
VALUES
  ('maxSteps',          24,  8,   48,  4,  true),
  ('maxDepth',            6,  2,   12,  1,  true),
  ('maxCandidates',       6,  2,   16,  1,  true),
  ('maxConcepts',        10,  2,   32,  2,  true),
  ('maxEngineInvocations', 4,  1,   12,  1,  true),
  ('maxBlockChars',     2500, 500, 8000, 500, true)
ON CONFLICT (param_key) DO NOTHING;

ALTER TABLE public.archie_tuning_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_tuning_events ENABLE ROW LEVEL SECURITY;
