-- =========================================================
-- ARCHIE OFFENSIVE SECURITY ENGINE (authorized ethical hacking)
--
-- Persistence for the 8-phase engagement lifecycle:
--   DISCOVER → ENUMERATE → ANALYZE → TEST → EXPLOIT
--   → DOCUMENT → REMEDIATE → RETEST
--
-- Owner-registered targets, engagements, and evidence-gated
-- findings. NO FAKE SECURITY RESULTS: findings require
-- non-empty evidence; fix_status can only become RESOLVED
-- with retest evidence recorded during the RETEST phase.
--
-- Write access is admin (owner) only — ARCHIE records what
-- was observed; it cannot forge authorizations or findings.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Targets — every environment (labs, CTF, FRELUX, ARCHIE
--    infra, owner-authorized external) must be registered.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_offensive_targets (
  id text PRIMARY KEY,
  kind text NOT NULL
    CHECK (kind IN ('FRELUX_INFRASTRUCTURE','ARCHIE_INFRASTRUCTURE','DEDICATED_LAB','CTF_ENVIRONMENT','OWNER_AUTHORIZED_EXTERNAL')),
  identifier text NOT NULL,
  scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb DEFAULT '[]'::jsonb,
  registered_at timestamptz NOT NULL DEFAULT now(),
  registered_by uuid NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offensive_targets_scope_not_empty
    CHECK (jsonb_array_length(scope) > 0)
);

ALTER TABLE public.archie_offensive_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_offensive_targets" ON public.archie_offensive_targets;
CREATE POLICY "admin_read_offensive_targets" ON public.archie_offensive_targets
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_offensive_targets" ON public.archie_offensive_targets;
CREATE POLICY "admin_write_offensive_targets" ON public.archie_offensive_targets
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 2. Engagements — the lifecycle state machine per target.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_offensive_engagements (
  id text PRIMARY KEY,
  target_id text NOT NULL REFERENCES public.archie_offensive_targets(id) ON DELETE CASCADE,
  current_phase text NOT NULL DEFAULT 'DISCOVER'
    CHECK (current_phase IN ('DISCOVER','ENUMERATE','ANALYZE','TEST','EXPLOIT','DOCUMENT','REMEDIATE','RETEST')),
  phases jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offensive_engagements_target
  ON public.archie_offensive_engagements (target_id, started_at DESC);

ALTER TABLE public.archie_offensive_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_offensive_engagements" ON public.archie_offensive_engagements;
CREATE POLICY "admin_read_offensive_engagements" ON public.archie_offensive_engagements
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_offensive_engagements" ON public.archie_offensive_engagements;
CREATE POLICY "admin_write_offensive_engagements" ON public.archie_offensive_engagements
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 3. Findings — evidence-gated. Evidence array must be
--    non-empty (see constraint).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_offensive_findings (
  id text PRIMARY KEY,
  engagement_id text NOT NULL REFERENCES public.archie_offensive_engagements(id) ON DELETE CASCADE,
  target_id text NOT NULL,
  phase text NOT NULL
    CHECK (phase IN ('ENUMERATE','ANALYZE','TEST','EXPLOIT','RETEST')),
  title text NOT NULL,
  severity text NOT NULL
    CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  category text NOT NULL,
  evidence jsonb NOT NULL,
  remediation text,
  fix_status text NOT NULL DEFAULT 'OPEN'
    CHECK (fix_status IN ('OPEN','RESOLVED','NOT_VERIFIED')),
  retested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offensive_findings_evidence_required
    CHECK (jsonb_array_length(evidence) > 0)
);

CREATE INDEX IF NOT EXISTS idx_offensive_findings_engagement
  ON public.archie_offensive_findings (engagement_id, severity);

ALTER TABLE public.archie_offensive_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_offensive_findings" ON public.archie_offensive_findings;
CREATE POLICY "admin_read_offensive_findings" ON public.archie_offensive_findings
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_offensive_findings" ON public.archie_offensive_findings;
CREATE POLICY "admin_write_offensive_findings" ON public.archie_offensive_findings
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- =========================================================
-- Seed: ARCHIE's first real authorization (moved from
-- 20260910180000_archie_first_authorization.sql on 2026-09-12).
-- In a fresh chain replay the tables only exist from this file,
-- so the seed must run after creation. Idempotent: safe to re-run.
-- =========================================================

INSERT INTO public.archie_offensive_targets (
  id, kind, identifier, scope, exclusions, registered_by
) VALUES (
  'tgt-archie-api-lab',
  'ARCHIE_INFRASTRUCTURE',
  'hqhvlkunkdrxyuvziorm.supabase.co',
  '["https://hqhvlkunkdrxyuvziorm.supabase.co/functions/v1 — edge-function gateway (public endpoints)", "https://hqhvlkunkdrxyuvziorm.supabase.co/rest/v1 — anon-accessible REST surface"]'::jsonb,
  '["direct database connections (Postgres/psql)", "auth admin endpoints and user management", "all archie_* registry/audit tables", "frelux_security_events", "any write path to production user or business data", "service-role credentials"]'::jsonb,
  'd74ffbd7-281b-4445-9728-ad87c287e0b9'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.archie_offensive_engagements (
  id, target_id, current_phase, phases
) VALUES (
  'eng-archie-api-lab-1',
  'tgt-archie-api-lab',
  'DISCOVER',
  '{"DISCOVER": {"started": "2026-09-10", "note": "Authorized engagement on ARCHIE''s own API surface. Owner-registered; verdict-gate integration verified 2026-09-10."}}'::jsonb
) ON CONFLICT (id) DO NOTHING;
