-- ============================================================
-- ARCHIE PROACTIVE BRIEFING ENGINE (gap E-1)
-- Migration 20261018040000 — fresh-database safe
--
-- One deterministic briefing per day, composed natively from
-- the real operational record. Service-role only (RLS, no
-- policies) — the briefing surfaces to the owner through the
-- status/chat owner surfaces.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_briefings (
  brief_date date PRIMARY KEY,
  text text NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_briefings_recent_idx
  ON public.archie_briefings (brief_date DESC);

ALTER TABLE public.archie_briefings ENABLE ROW LEVEL SECURITY;
