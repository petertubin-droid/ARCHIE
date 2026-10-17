-- ============================================================
-- ARCHIE OBSERVABILITY & ALERTING ENGINE (gap F-2)
-- Migration 20261018030000 — fresh-database safe
--
-- Daily honest metrics snapshots + alert lifecycle. The
-- alert row for a code is unresolved while its deterministic
-- condition holds and auto-resolves when it clears.
-- Service-role only (RLS, no policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_metrics_daily (
  metric_date date PRIMARY KEY,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archie_alerts (
  alert_code text PRIMARY KEY,
  severity text NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING')),
  message text NOT NULL DEFAULT '',
  resolved boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS archie_alerts_unresolved_idx
  ON public.archie_alerts (resolved, last_seen_at DESC)
  WHERE resolved = false;

ALTER TABLE public.archie_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_alerts ENABLE ROW LEVEL SECURITY;
