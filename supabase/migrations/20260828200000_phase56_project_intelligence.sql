-- ============================================================
-- Phase 56: FRELUX Project Intelligence, Smart Planning & Professional Workspace Expansion
-- 
-- Extends existing tables and creates new ones for:
-- 1. Project Workspace (extends contractor_projects)
-- 2. Smart Shopping List (extends project_shopping_list with actual_price)
-- 3. Material Price Tracker (extends material_catalog)
-- 4. Before & After Gallery (new: gallery_entries, gallery_images)
-- 5. Client Approval System (new: client_estimates, client_approvals)
-- 6. Surface Condition Assessment (extends estimation_surface_conditions)
-- 7. Paint Comparison Tool (new: paint_comparisons)
-- 8. Project Progress Tracker (new: project_progress_stages)
-- ============================================================

-- ============================================================
-- 1. EXTEND contractor_projects — add location field
-- ============================================================
ALTER TABLE public.contractor_projects ADD COLUMN IF NOT EXISTS location text;

-- ============================================================
-- 2. EXTEND project_shopping_list — add actual_price, supplier
-- ============================================================
ALTER TABLE public.project_shopping_list ADD COLUMN IF NOT EXISTS actual_price numeric;
ALTER TABLE public.project_shopping_list ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.project_shopping_list ADD COLUMN IF NOT EXISTS source_calculation_id uuid;

-- ============================================================
-- 3. EXTEND material_catalog — add current_price, previous_price, price_updated_at, price_source, is_active
-- ============================================================
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS current_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS previous_price numeric;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS price_updated_at timestamptz;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS price_source text;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index for price tracking
CREATE INDEX IF NOT EXISTS idx_material_catalog_active ON public.material_catalog(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_material_catalog_category ON public.material_catalog(category);

-- ============================================================
-- 4. NEW: material_price_history — preserve all price changes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.material_catalog(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  category text NOT NULL,
  old_price numeric,
  new_price numeric NOT NULL,
  unit text,
  price_source text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_price_history_material_id ON public.material_price_history(material_id);
CREATE INDEX IF NOT EXISTS idx_material_price_history_created_at ON public.material_price_history(created_at DESC);

ALTER TABLE public.material_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_price_history_public_read" ON public.material_price_history;
CREATE POLICY "material_price_history_public_read"
  ON public.material_price_history FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "material_price_history_admin_write" ON public.material_price_history;
CREATE POLICY "material_price_history_admin_write"
  ON public.material_price_history FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 5. NEW: project_calculations — store structured calc results linked to projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  calculator_type text NOT NULL
    CHECK (calculator_type IN ('paint','screeding','pop_ceiling','tile','finish','tyrolene','cost','build_to_roof','structural','foundation')),
  calculator_slug text NOT NULL,
  calc_title text NOT NULL,
  calc_data jsonb NOT NULL DEFAULT '{}',
  result_summary jsonb NOT NULL DEFAULT '{}',
  materials jsonb NOT NULL DEFAULT '[]',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_calculations_project_id ON public.project_calculations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_calculations_user_id ON public.project_calculations(user_id);
CREATE INDEX IF NOT EXISTS idx_project_calculations_type ON public.project_calculations(calculator_type);

ALTER TABLE public.project_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_calculations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_calc_owner_select" ON public.project_calculations;
CREATE POLICY "project_calc_owner_select"
  ON public.project_calculations FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "project_calc_owner_insert" ON public.project_calculations;
CREATE POLICY "project_calc_owner_insert"
  ON public.project_calculations FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "project_calc_owner_update" ON public.project_calculations;
CREATE POLICY "project_calc_owner_update"
  ON public.project_calculations FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "project_calc_owner_delete" ON public.project_calculations;
CREATE POLICY "project_calc_owner_delete"
  ON public.project_calculations FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 6. NEW: gallery_entries — Before & After project showcase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gallery_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,
  project_category text NOT NULL DEFAULT 'painting'
    CHECK (project_category IN ('painting','screeding','pop_ceiling','tiling','finishing','construction')),
  paint_type_used text,
  paint_quality_used text,
  colour_used text,
  location text,
  completion_date date,

  is_public boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','featured','hidden')),
  is_featured boolean NOT NULL DEFAULT false,

  admin_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_entries_user_id ON public.gallery_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_entries_status ON public.gallery_entries(status);
CREATE INDEX IF NOT EXISTS idx_gallery_entries_category ON public.gallery_entries(project_category);
CREATE INDEX IF NOT EXISTS idx_gallery_entries_public ON public.gallery_entries(is_public) WHERE is_public = true;

ALTER TABLE public.gallery_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_entries FORCE ROW LEVEL SECURITY;

-- Owner can CRUD their own entries
DROP POLICY IF EXISTS "gallery_owner_select" ON public.gallery_entries;
CREATE POLICY "gallery_owner_select"
  ON public.gallery_entries FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "gallery_owner_insert" ON public.gallery_entries;
CREATE POLICY "gallery_owner_insert"
  ON public.gallery_entries FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gallery_owner_update" ON public.gallery_entries;
CREATE POLICY "gallery_owner_update"
  ON public.gallery_entries FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gallery_owner_delete" ON public.gallery_entries;
CREATE POLICY "gallery_owner_delete"
  ON public.gallery_entries FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Public can read approved/featured entries
DROP POLICY IF EXISTS "gallery_public_read" ON public.gallery_entries;
CREATE POLICY "gallery_public_read"
  ON public.gallery_entries FOR SELECT
  TO anon, authenticated USING (status IN ('approved','featured') AND is_public = true);

-- Admin can manage all entries
DROP POLICY IF EXISTS "gallery_admin_all" ON public.gallery_entries;
CREATE POLICY "gallery_admin_all"
  ON public.gallery_entries FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 7. NEW: gallery_images — images for gallery entries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_entry_id uuid NOT NULL REFERENCES public.gallery_entries(id) ON DELETE CASCADE,

  image_type text NOT NULL DEFAULT 'after'
    CHECK (image_type IN ('before','after')),
  image_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_entry_id ON public.gallery_images(gallery_entry_id);
CREATE INDEX IF NOT EXISTS idx_gallery_images_type ON public.gallery_images(image_type);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_images_select" ON public.gallery_images;
CREATE POLICY "gallery_images_select"
  ON public.gallery_images FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "gallery_images_owner_insert" ON public.gallery_images;
CREATE POLICY "gallery_images_owner_insert"
  ON public.gallery_images FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.gallery_entries WHERE id = gallery_entry_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "gallery_images_owner_delete" ON public.gallery_images;
CREATE POLICY "gallery_images_owner_delete"
  ON public.gallery_images FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.gallery_entries WHERE id = gallery_entry_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "gallery_images_admin_all" ON public.gallery_images;
CREATE POLICY "gallery_images_admin_all"
  ON public.gallery_images FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 8. NEW: client_estimates — client-facing estimates with approval workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  estimate_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,

  -- Cost breakdown
  materials_cost numeric NOT NULL DEFAULT 0,
  labour_cost numeric NOT NULL DEFAULT 0,
  transport_cost numeric NOT NULL DEFAULT 0,
  misc_cost numeric NOT NULL DEFAULT 0,
  markup_percentage numeric NOT NULL DEFAULT 0,
  markup_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',

  -- Materials summary (JSON array)
  materials_summary jsonb NOT NULL DEFAULT '[]',

  -- Terms
  validity_days integer NOT NULL DEFAULT 30,
  notes text,
  terms_conditions text,

  -- Client info
  client_name text,
  client_email text,
  client_phone text,

  -- Approval workflow
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','approved','changes_requested','expired')),

  -- Secure sharing
  share_token text UNIQUE,
  shared_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  changes_requested_at timestamptz,
  client_feedback text,

  -- Price snapshot info
  price_snapshot jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_estimates_project_id ON public.client_estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_client_estimates_user_id ON public.client_estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_client_estimates_status ON public.client_estimates(status);
CREATE INDEX IF NOT EXISTS idx_client_estimates_share_token ON public.client_estimates(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE public.client_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_estimates FORCE ROW LEVEL SECURITY;

-- Owner CRUD
DROP POLICY IF EXISTS "client_estimates_owner_select" ON public.client_estimates;
CREATE POLICY "client_estimates_owner_select"
  ON public.client_estimates FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "client_estimates_owner_insert" ON public.client_estimates;
CREATE POLICY "client_estimates_owner_insert"
  ON public.client_estimates FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "client_estimates_owner_update" ON public.client_estimates;
CREATE POLICY "client_estimates_owner_update"
  ON public.client_estimates FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "client_estimates_owner_delete" ON public.client_estimates;
CREATE POLICY "client_estimates_owner_delete"
  ON public.client_estimates FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Public can view via share_token (but only non-sensitive fields)
DROP POLICY IF EXISTS "client_estimates_public_view" ON public.client_estimates;
CREATE POLICY "client_estimates_public_view"
  ON public.client_estimates FOR SELECT
  TO anon, authenticated USING (
    share_token IS NOT NULL
    AND status IN ('sent','viewed','approved','changes_requested')
  );

-- Public can update status (approve/request changes) via share_token
DROP POLICY IF EXISTS "client_estimates_public_update" ON public.client_estimates;
CREATE POLICY "client_estimates_public_update"
  ON public.client_estimates FOR UPDATE
  TO anon, authenticated USING (
    share_token IS NOT NULL
    AND status IN ('sent','viewed','changes_requested')
  ) WITH CHECK (
    share_token IS NOT NULL
  );

-- ============================================================
-- 9. NEW: paint_comparisons — configurable paint comparison data
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paint_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  paint_type text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  finish text,
  recommended_use text,
  durability text,
  washability text,
  appearance text,
  product_characteristics text,
  suitable_areas text,
  price_range text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paint_comparisons_active ON public.paint_comparisons(is_active) WHERE is_active = true;

ALTER TABLE public.paint_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paint_comparisons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paint_comparisons_public_read" ON public.paint_comparisons;
CREATE POLICY "paint_comparisons_public_read"
  ON public.paint_comparisons FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "paint_comparisons_admin_write" ON public.paint_comparisons;
CREATE POLICY "paint_comparisons_admin_write"
  ON public.paint_comparisons FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 10. NEW: project_progress_stages — extensible progress tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_progress_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  stage_key text NOT NULL,
  stage_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  notes text,
  photo_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_progress_project_id ON public.project_progress_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_progress_sort_order ON public.project_progress_stages(sort_order);

ALTER TABLE public.project_progress_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_progress_stages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_progress_owner_select" ON public.project_progress_stages;
CREATE POLICY "project_progress_owner_select"
  ON public.project_progress_stages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.contractor_projects WHERE id = project_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "project_progress_owner_insert" ON public.project_progress_stages;
CREATE POLICY "project_progress_owner_insert"
  ON public.project_progress_stages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.contractor_projects WHERE id = project_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "project_progress_owner_update" ON public.project_progress_stages;
CREATE POLICY "project_progress_owner_update"
  ON public.project_progress_stages FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.contractor_projects WHERE id = project_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.contractor_projects WHERE id = project_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "project_progress_owner_delete" ON public.project_progress_stages;
CREATE POLICY "project_progress_owner_delete"
  ON public.project_progress_stages FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.contractor_projects WHERE id = project_id AND user_id = auth.uid())
  );

-- ============================================================
-- 11. NEW: surface_assessments — standalone surface condition assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.surface_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  surface_condition text NOT NULL
    CHECK (surface_condition IN ('new_wall','previously_painted','smooth','rough','dirty','damp','cracked')),
  surface_type text,
  room_name text,
  notes text,
  recommendations jsonb NOT NULL DEFAULT '[]',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_assessments_project_id ON public.surface_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_surface_assessments_user_id ON public.surface_assessments(user_id);

ALTER TABLE public.surface_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "surface_assessments_owner_select" ON public.surface_assessments;
CREATE POLICY "surface_assessments_owner_select"
  ON public.surface_assessments FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "surface_assessments_owner_insert" ON public.surface_assessments;
CREATE POLICY "surface_assessments_owner_insert"
  ON public.surface_assessments FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "surface_assessments_owner_update" ON public.surface_assessments;
CREATE POLICY "surface_assessments_owner_update"
  ON public.surface_assessments FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "surface_assessments_owner_delete" ON public.surface_assessments;
CREATE POLICY "surface_assessments_owner_delete"
  ON public.surface_assessments FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 12. NEW: project_stage_templates — configurable default stages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_stage_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL UNIQUE,
  stage_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_stage_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stage_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_stage_templates_public_read" ON public.project_stage_templates;
CREATE POLICY "project_stage_templates_public_read"
  ON public.project_stage_templates FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "project_stage_templates_admin_write" ON public.project_stage_templates;
CREATE POLICY "project_stage_templates_admin_write"
  ON public.project_stage_templates FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default project stages
INSERT INTO public.project_stage_templates (stage_key, stage_name, description, sort_order) VALUES
  ('planning', 'Planning', 'Project planning and material selection phase', 1),
  ('materials', 'Materials', 'Procurement and delivery of materials', 2),
  ('preparation', 'Preparation', 'Surface preparation and cleaning', 3),
  ('painting_installation', 'Painting / Installation', 'Main painting or installation work', 4),
  ('finishing', 'Finishing', 'Final touches and finishing details', 5),
  ('completed', 'Completed', 'Project completed and handed over', 6)
ON CONFLICT (stage_key) DO NOTHING;

-- Default paint comparison data
INSERT INTO public.paint_comparisons (paint_type, display_name, description, finish, recommended_use, durability, washability, appearance, product_characteristics, suitable_areas, price_range, sort_order) VALUES
  ('matt', 'Matt', 'A flat, non-reflective paint finish that hides surface imperfections well. Ideal for ceilings and low-traffic areas.', 'Flat / Matte', 'Bedrooms, ceilings, and low-traffic walls', 'Moderate - 3 to 5 years', 'Low - not washable, marks easily', 'Smooth, flat, non-reflective', 'Hides imperfections, easy touch-ups, low sheen', 'Bedrooms, ceilings, adult living spaces', 'Budget to mid-range', 1),
  ('satin', 'Satin', 'A soft sheen finish that balances washability with a subtle glow. Versatile and widely used throughout homes.', 'Soft sheen', 'Living rooms, hallways, children''s rooms, kitchens', 'Good - 5 to 7 years', 'Good - washable, resists stains', 'Smooth with a subtle pearl-like sheen', 'Durable, washable, hides minor imperfections', 'Living rooms, hallways, kitchens, bedrooms', 'Mid-range', 2),
  ('emulsion', 'Emulsion', 'A water-based paint suitable for interior walls. Easy to apply and quick drying with low odour.', 'Variable (matte to satin)', 'Interior walls and ceilings in residential and commercial spaces', 'Good - 4 to 6 years', 'Moderate - lightly washable when fully cured', 'Smooth, even coverage', 'Water-based, low odour, quick drying, easy application', 'Interior walls, ceilings, offices', 'Budget to mid-range', 3)
ON CONFLICT (paint_type) DO NOTHING;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS "material_price_history_set_updated_at" ON public.material_price_history;
CREATE TRIGGER "material_price_history_set_updated_at" BEFORE UPDATE ON public.material_price_history FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "project_calculations_set_updated_at" ON public.project_calculations;
CREATE TRIGGER "project_calculations_set_updated_at" BEFORE UPDATE ON public.project_calculations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "gallery_entries_set_updated_at" ON public.gallery_entries;
CREATE TRIGGER "gallery_entries_set_updated_at" BEFORE UPDATE ON public.gallery_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "client_estimates_set_updated_at" ON public.client_estimates;
CREATE TRIGGER "client_estimates_set_updated_at" BEFORE UPDATE ON public.client_estimates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "paint_comparisons_set_updated_at" ON public.paint_comparisons;
CREATE TRIGGER "paint_comparisons_set_updated_at" BEFORE UPDATE ON public.paint_comparisons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "project_progress_stages_set_updated_at" ON public.project_progress_stages;
CREATE TRIGGER "project_progress_stages_set_updated_at" BEFORE UPDATE ON public.project_progress_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "surface_assessments_set_updated_at" ON public.surface_assessments;
CREATE TRIGGER "surface_assessments_set_updated_at" BEFORE UPDATE ON public.surface_assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS "project_stage_templates_set_updated_at" ON public.project_stage_templates;
CREATE TRIGGER "project_stage_templates_set_updated_at" BEFORE UPDATE ON public.project_stage_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for project and gallery images
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-media', 'project-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project-media bucket
DROP POLICY IF EXISTS "project_media_public_read" ON storage.objects;
CREATE POLICY "project_media_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'project-media');

DROP POLICY IF EXISTS "project_media_owner_insert" ON storage.objects;
CREATE POLICY "project_media_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-media' AND auth.uid() = owner);

DROP POLICY IF EXISTS "project_media_owner_update" ON storage.objects;
CREATE POLICY "project_media_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-media' AND auth.uid() = owner);

DROP POLICY IF EXISTS "project_media_owner_delete" ON storage.objects;
CREATE POLICY "project_media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-media' AND auth.uid() = owner);



-- Grant privileges to PostgREST roles
GRANT ALL ON public.material_price_history TO anon, authenticated, service_role;
GRANT ALL ON public.project_calculations TO anon, authenticated, service_role;
GRANT ALL ON public.gallery_entries TO anon, authenticated, service_role;
GRANT ALL ON public.gallery_images TO anon, authenticated, service_role;
GRANT ALL ON public.client_estimates TO anon, authenticated, service_role;
GRANT ALL ON public.paint_comparisons TO anon, authenticated, service_role;
GRANT ALL ON public.project_progress_stages TO anon, authenticated, service_role;
GRANT ALL ON public.surface_assessments TO anon, authenticated, service_role;
GRANT ALL ON public.project_stage_templates TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
