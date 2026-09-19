-- =========================================================
-- FRELUX PHASE 6 STAGE 9 — PROACTIVE MONITORING
--
-- Persistent per-project alerts. One row per (project, alert
-- key) per user: re-runs REFRESH the same row (last_seen_at)
-- instead of duplicating. Conditions clearing resolve the row;
-- dismissals are respected unless the condition escalates.
--
-- RLS: owner-only (created_by = auth.uid()), identical to the
-- Stage-1/Stage-8 agent tables. No project data table is touched.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_agent_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  alert_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('budget','schedule','data_quality','stale_data','material_requirement','project_change')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','resolved')),
  title text NOT NULL,
  condition_text text NOT NULL,
  recommended_action text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence jsonb NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, alert_key, created_by)
);

ALTER TABLE public.project_agent_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_agent_alerts_owner_all ON public.project_agent_alerts;
CREATE POLICY project_agent_alerts_owner_all
  ON public.project_agent_alerts FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

COMMENT ON TABLE public.project_agent_alerts IS
  'Stage 9: proactive monitoring alerts — one row per (project, alert key, user); refreshed, resolved and dismissed without duplication.';
