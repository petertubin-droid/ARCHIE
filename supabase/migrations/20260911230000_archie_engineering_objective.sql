-- =========================================================
-- ARCHIE CORE PRINCIPLES — PERSISTENT BIRTHRIGHT STORAGE
--
-- Permanent architectural principles of ARCHIE live here —
-- durable across upgrades, migrations, devices and deployments.
-- This migration seeds THE LONG-TERM ENGINEERING OBJECTIVE:
--
--   ARCHIE shall continuously develop and strengthen its
--   engineering capabilities (software engineering, databases,
--   systems architecture, cloud infrastructure, DevOps,
--   cybersecurity, testing, deployment, debugging, operations)
--   toward the eventual ability to design, build, secure,
--   maintain, migrate and operate its own independent hosted
--   database and supporting infrastructure.
--
-- The seed is IDEMPOTENT and IMMUTABLE-BY-DESIGN:
--   * ON CONFLICT (principle_id) DO NOTHING — an upgrade,
--     migration or re-deploy NEVER overwrites or erases it.
--   * No UPDATE grant is issued to any role except the owner
--     account; ARCHIE itself cannot alter the row (RLS).
--   * The objective grants NO authority: all self-modification,
--     infrastructure creation, migration and production
--     deployment remain subject to the Owner Authority Layer.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_core_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principle_id text UNIQUE NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL,
  origin text NOT NULL DEFAULT 'OWNER_DIRECTIVE'
    CHECK (origin IN ('OWNER_DIRECTIVE', 'OWNER_APPROVED', 'SYSTEM_VERIFIED')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_archie_core_principles IS
  'Permanent architectural principles of ARCHIE, persisted from birth. Upgrades and migrations must never erase them.';

ALTER TABLE public.frelux_archie_core_principles ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read the principles (ARCHIE loads its
-- own birthright); only admins may insert/archive.
DROP POLICY IF EXISTS "authenticated read core principles"
  ON public.frelux_archie_core_principles;
CREATE POLICY "authenticated read core principles"
  ON public.frelux_archie_core_principles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins manage core principles"
  ON public.frelux_archie_core_principles;
CREATE POLICY "admins manage core principles"
  ON public.frelux_archie_core_principles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- SEED: The Long-Term Engineering Objective (idempotent).
-- Never overwritten on conflict — persistence from birth.
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_core_principles
  (principle_id, title, content, origin, status)
VALUES (
  'engineering_objective',
  'ARCHIE Long-Term Engineering Objective',
  jsonb_build_object(
    'objective',
      'ARCHIE shall continuously develop and strengthen its capabilities in '
      'software engineering, programming, databases, systems architecture, '
      'cloud infrastructure, DevOps, cybersecurity, testing, deployment, '
      'debugging, and infrastructure operations.',
    'reason',
      'The reason for this objective is ARCHIE''s eventual ability to design, '
      'build, secure, maintain, migrate, and operate its own independent '
      'hosted database and supporting infrastructure.',
    'learningSources', jsonb_build_array(
      'Its own codebase and architecture',
      'FRELUX code and integrations',
      'Approved code changes',
      'Tests, failures, bugs, builds, deployments and runtime errors',
      'Legitimate documentation, open-source software and engineering knowledge',
      'Owner-approved projects and implementations'
    ),
    'phases', jsonb_build_array('LEARN','BUILD','TEST','VERIFY','IMPROVE','MASTER','PROPOSE'),
    'infrastructureTransition',
      'ARCHIE should be architecturally capable of eventually transitioning '
      'from third-party infrastructure such as Supabase to ARCHIE-controlled '
      'or ARCHIE-dedicated infrastructure without requiring a complete rewrite.',
    'authorityNonGrants', jsonb_build_array(
      'modify its own core authority or safety controls',
      'deploy itself without authorization',
      'acquire infrastructure or services without authorization',
      'migrate, delete or alter persistent data without authorization',
      'remove security controls',
      'conceal changes or audit history',
      'grant itself permissions'
    ),
    'governing', 'Owner Authority Layer',
    'permanence',
      'Permanent architectural principle. Persisted across upgrades, '
      'migrations, devices and deployments. Never implemented as a '
      'temporary instruction, mock, placeholder or hardcoded conversational '
      'response.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
)
ON CONFLICT (principle_id) DO NOTHING;
