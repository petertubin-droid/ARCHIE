-- =========================================================
-- ARCHIE CODING STUDIO — ISOLATED PROJECT WORKSPACE
--
-- A dedicated, ISOLATED workspace where ARCHIE plans,
-- writes, validates, previews and iterates real web
-- projects from natural-language briefs.
--
-- HARD RULES:
--   * Generated projects are COMPLETELY ISOLATED from
--     FRELUX production data (separate tables, no FKs into
--     production entities, sandboxed preview).
--   * Nothing here deploys or overwrites production.
--     Deployment happens ONLY through the Owner Authority
--     Layer / authorized deployment workflow.
--   * Every build and feedback iteration creates an
--     IMMUTABLE version snapshot — full history, rollback.
--   * Owner-only access (owner_id scope, admin override).
-- =========================================================

-- ---------------------------------------------------------
-- Projects: one studio project per brief.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  brief text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'READY_FOR_DEPLOYMENT', 'ARCHIVED')),
  approved_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Files: the ACTIVE DRAFT of each project. Real code, path +
-- content. This is the source of truth for the live preview.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_studio_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.frelux_studio_projects (id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);

-- ---------------------------------------------------------
-- Versions: IMMUTABLE snapshots. One per build, feedback
-- iteration, rollback and approved production build.
-- kind: DRAFT_BUILD | FEEDBACK_ITERATION | ROLLBACK |
--       PRODUCTION_BUILD
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_studio_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.frelux_studio_projects (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('DRAFT_BUILD', 'FEEDBACK_ITERATION', 'ROLLBACK', 'PRODUCTION_BUILD')),
  label text NOT NULL,
  reason text NOT NULL,
  engine_note text,
  snapshot jsonb NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Reviews: owner feedback / approval audit trail.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_studio_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.frelux_studio_projects (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('FEEDBACK', 'APPROVAL', 'ROLLBACK')),
  comment text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_projects_owner
  ON public.frelux_studio_projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_studio_files_project
  ON public.frelux_studio_files (project_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_project
  ON public.frelux_studio_versions (project_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_studio_reviews_project
  ON public.frelux_studio_reviews (project_id, created_date DESC);

-- ---------------------------------------------------------
-- RLS: owner-scoped. The project owner can read/write their
-- studio workspace; admins (the platform Owner) see all.
-- Nothing else can touch studio data.
-- ---------------------------------------------------------
ALTER TABLE public.frelux_studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_studio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_studio_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_studio_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner studio projects" ON public.frelux_studio_projects;
CREATE POLICY "owner studio projects" ON public.frelux_studio_projects
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "owner studio files" ON public.frelux_studio_files;
CREATE POLICY "owner studio files" ON public.frelux_studio_files
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "owner studio versions" ON public.frelux_studio_versions;
CREATE POLICY "owner studio versions" ON public.frelux_studio_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "owner studio reviews" ON public.frelux_studio_reviews;
CREATE POLICY "owner studio reviews" ON public.frelux_studio_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.frelux_studio_projects p
            WHERE p.id = project_id
              AND (p.owner_id = auth.uid() OR public.is_admin()))
  );
