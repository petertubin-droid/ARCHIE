-- =========================================================
-- FRELUX Phase 57 — PLAN VISION (Advanced Vision + Plan
-- Intelligence + AI Quantity Takeoff)
--
-- Private, ownership-enforced storage for construction documents
-- and their versioned AI extractions. The ORIGINAL uploaded file
-- is preserved unmodified in a PRIVATE bucket — project plans
-- are never exposed through public URLs.
--
-- RLS: every row is visible/editable only to its owner.
-- =========================================================

-- ── Private bucket for plan documents ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-documents', 'plan-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Owner-only storage policies for plan documents.
DROP POLICY IF EXISTS "plan_documents_owner_read" ON storage.objects;
CREATE POLICY "plan_documents_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'plan-documents' AND owner = auth.uid());

DROP POLICY IF EXISTS "plan_documents_owner_write" ON storage.objects;
CREATE POLICY "plan_documents_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'plan-documents' AND owner = auth.uid());

DROP POLICY IF EXISTS "plan_documents_owner_update" ON storage.objects;
CREATE POLICY "plan_documents_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'plan-documents' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'plan-documents' AND owner = auth.uid());

DROP POLICY IF EXISTS "plan_documents_owner_delete" ON storage.objects;
CREATE POLICY "plan_documents_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'plan-documents' AND owner = auth.uid());

-- ── Document records ──
CREATE TABLE IF NOT EXISTS public.plan_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid, -- optional user_projects link (no FK: loose coupling)
  kind text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL,
  scale jsonb, -- ScaleRecord | null
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_documents_select_own" ON public.plan_documents;
CREATE POLICY "plan_documents_select_own" ON public.plan_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_documents_insert_own" ON public.plan_documents;
CREATE POLICY "plan_documents_insert_own" ON public.plan_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_documents_update_own" ON public.plan_documents;
CREATE POLICY "plan_documents_update_own" ON public.plan_documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_documents_delete_own" ON public.plan_documents;
CREATE POLICY "plan_documents_delete_own" ON public.plan_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS plan_documents_user_idx ON public.plan_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_documents_project_idx ON public.plan_documents (project_id) WHERE project_id IS NOT NULL;

-- ── Versioned extractions (one row per extraction run) ──
CREATE TABLE IF NOT EXISTS public.plan_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.plan_documents (id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  extraction jsonb NOT NULL, -- full PlanExtraction payload (rooms/facts/roof/issues…)
  -- Denormalized review progress for cheap listing queries.
  rooms_total integer NOT NULL DEFAULT 0,
  rooms_verified integer NOT NULL DEFAULT 0,
  has_blocking_issues boolean NOT NULL DEFAULT false,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

ALTER TABLE public.plan_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_extractions_select_own" ON public.plan_extractions;
CREATE POLICY "plan_extractions_select_own" ON public.plan_extractions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_extractions_insert_own" ON public.plan_extractions;
CREATE POLICY "plan_extractions_insert_own" ON public.plan_extractions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_extractions_update_own" ON public.plan_extractions;
CREATE POLICY "plan_extractions_update_own" ON public.plan_extractions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_extractions_delete_own" ON public.plan_extractions;
CREATE POLICY "plan_extractions_delete_own" ON public.plan_extractions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS plan_extractions_doc_idx ON public.plan_extractions (document_id, version DESC);

-- updated_at triggers
DROP TRIGGER IF EXISTS "plan_documents_set_updated_at" ON public.plan_documents;
CREATE TRIGGER "plan_documents_set_updated_at" BEFORE UPDATE ON public.plan_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "plan_extractions_set_updated_at" ON public.plan_extractions;
CREATE TRIGGER "plan_extractions_set_updated_at" BEFORE UPDATE ON public.plan_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
