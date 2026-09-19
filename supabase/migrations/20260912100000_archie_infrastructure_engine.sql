-- =========================================================
-- ARCHIE INFRASTRUCTURE ENGINE — SNAPSHOT LEDGER
-- 20260912100000
--
-- Engine inventory #26 (anatomy "legs"): infrastructure as
-- a real engine, not just a cost ledger. Every assessment
-- (dependency probes + cost aggregation + budget
-- evaluation + projection) is appended here as evidence:
--
--   assess → probes (Supabase REST, edge runtime, frontend)
--          → current-month costs per provider
--          → budgets vs spend (owner's exhaustion policy)
--          → linear monthly projection
--          → SNAPSHOT (this table, append-only for every
--            role, service included)
--
-- APPEND-ONLY: infrastructure history is evidence and can
-- never be rewritten (same pattern as the constitution and
-- the recovery ledger).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_infrastructure_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_status text NOT NULL
    CHECK (overall_status IN ('HEALTHY', 'DEGRADED', 'CRITICAL')),
  -- DependencyCheck[]: {name, ok, latency_ms, detail}
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- CostSummary: month, totals, by_provider, projection
  cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- BudgetState[]: spend vs frelux_infrastructure_budgets
  budget_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency boolean NOT NULL DEFAULT false,
  assessed_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infra_snapshots_date
  ON public.frelux_archie_infrastructure_snapshots
  (created_date DESC);

COMMENT ON TABLE public.frelux_archie_infrastructure_snapshots IS
  'ARCHIE Infrastructure Engine — append-only assessment history: live dependency probes, per-provider costs, budget states and monthly projection. Owner rules the budgets (frelux_infrastructure_budgets); the engine reports and recommends, never invents billing rules.';

-- ---------------------------------------------------------
-- Append-only enforcement (every role, service included)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_infra_snapshots_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ARCHIE infrastructure snapshots are append-only: UPDATE/DELETE is refused for every role. Assessment history is evidence.'
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS infra_snapshots_immutable
  ON public.frelux_archie_infrastructure_snapshots;
CREATE TRIGGER infra_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.frelux_archie_infrastructure_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.archie_infra_snapshots_immutable();

-- ---------------------------------------------------------
-- RLS — owner reads, service role writes.
-- ---------------------------------------------------------
ALTER TABLE public.frelux_archie_infrastructure_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads infrastructure snapshots"
  ON public.frelux_archie_infrastructure_snapshots;
CREATE POLICY "owner reads infrastructure snapshots"
  ON public.frelux_archie_infrastructure_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated roles: the
-- infrastructure engine writes through the service role only.
