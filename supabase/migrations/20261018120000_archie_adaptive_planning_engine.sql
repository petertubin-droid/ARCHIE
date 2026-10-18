-- ============================================================
-- ARCHIE ADAPTIVE PLANNING ENGINE SCHEMA
-- Migration 20261018120000 — Quota-conscious storage schema:
-- DAG-scheduled plans, node dependencies, execution checkpoints,
-- and operator reliability telemetry.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_adaptive_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal text NOT NULL CHECK (char_length(goal) BETWEEN 3 AND 500),
  goal_subject text NOT NULL CHECK (char_length(goal_subject) BETWEEN 1 AND 250),
  profile text NOT NULL DEFAULT 'balanced'
    CHECK (profile IN ('balanced', 'fastest', 'lowest_cost', 'highest_reliability', 'conservative')),
  executable boolean NOT NULL DEFAULT true,
  total_cost numeric NOT NULL DEFAULT 0,
  adaptive_cost numeric NOT NULL DEFAULT 0,
  overall_reliability numeric NOT NULL DEFAULT 1.0,
  critical_path_duration_ms integer NOT NULL DEFAULT 0,
  requires_owner_authorization boolean NOT NULL DEFAULT false,
  gap_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archie_adaptive_plan_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.archie_adaptive_plans(id) ON DELETE CASCADE,
  step_key text NOT NULL CHECK (char_length(step_key) BETWEEN 1 AND 100),
  operator_id text NOT NULL CHECK (char_length(operator_id) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  achieves text NOT NULL,
  satisfies text NOT NULL,
  depends_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_duration_ms integer NOT NULL DEFAULT 200,
  base_cost numeric NOT NULL DEFAULT 1,
  adaptive_cost numeric NOT NULL DEFAULT 1,
  reliability_score numeric NOT NULL DEFAULT 1.0,
  requires_owner_authorization boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'executed', 'awaiting_owner', 'contingency_active', 'failed', 'skipped')),
  result text,
  error text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archie_operator_telemetry (
  operator_id text PRIMARY KEY,
  domain text NOT NULL DEFAULT 'general',
  invocations integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  average_duration_ms integer NOT NULL DEFAULT 0,
  last_executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_adaptive_plans_subject_idx
  ON public.archie_adaptive_plans (goal_subject, created_at DESC);

CREATE INDEX IF NOT EXISTS archie_adaptive_plan_nodes_plan_idx
  ON public.archie_adaptive_plan_nodes (plan_id, status);

ALTER TABLE public.archie_adaptive_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_adaptive_plan_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_operator_telemetry ENABLE ROW LEVEL SECURITY;
