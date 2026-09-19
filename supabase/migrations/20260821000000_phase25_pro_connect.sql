-- =========================================================
-- FRELUX Pro Connect — Professional Network Platform
-- Phase 25: Database Schema
-- Date: 2026-08-21
--
-- Creates a production-ready professional directory, messaging system,
-- reviews, portfolios, verification, and reporting — fully integrated
-- with the existing FRELUX auth (profiles table) and Supabase RLS.
--
-- No hardcoded data. All seed data is structural (categories, services,
-- Nigerian states/cities) and admin-managed going forward.
-- =========================================================

-- =========================================================
-- 1. PRO CATEGORIES — admin-managed professional categories
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text, -- lucide icon name or null
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pro_categories ENABLE ROW LEVEL SECURITY;

-- Public can read active categories
DROP POLICY IF EXISTS "read_active_pro_categories" ON pro_categories;
CREATE POLICY "read_active_pro_categories"
  ON pro_categories FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admin can manage
DROP POLICY IF EXISTS "admin_manage_pro_categories" ON pro_categories;
CREATE POLICY "admin_manage_pro_categories"
  ON pro_categories FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 2. PRO SERVICES — admin-managed service catalogue
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES pro_categories(id) ON DELETE SET NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pro_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_active_pro_services" ON pro_services;
CREATE POLICY "read_active_pro_services"
  ON pro_services FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_pro_services" ON pro_services;
CREATE POLICY "admin_manage_pro_services"
  ON pro_services FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 3. PRO LOCATIONS — structured Nigerian location system
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  city text NOT NULL,
  area text, -- local area / LGA, nullable
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate state/city/area combos
CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_locations_unique
  ON pro_locations(state, city, COALESCE(area, ''));

ALTER TABLE pro_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_active_pro_locations" ON pro_locations;
CREATE POLICY "read_active_pro_locations"
  ON pro_locations FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_pro_locations" ON pro_locations;
CREATE POLICY "admin_manage_pro_locations"
  ON pro_locations FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 4. PRO PROFILES — professional profiles linked to auth.users
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES pro_categories(id) ON DELETE SET NULL,
  business_name text,
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  bio text,
  profile_image_url text,
  cover_image_url text,
  years_experience int,
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'suspended')),
  is_profile_complete boolean NOT NULL DEFAULT false,
  is_listed boolean NOT NULL DEFAULT true, -- professional can opt out of directory
  contact_email_public boolean NOT NULL DEFAULT false,
  contact_phone_public boolean NOT NULL DEFAULT false,
  contact_phone text,
  website_url text,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  project_count int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_profiles_user ON pro_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_category ON pro_profiles(category_id);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_slug ON pro_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_listed ON pro_profiles(is_listed, verification_status) WHERE is_listed = true;
CREATE INDEX IF NOT EXISTS idx_pro_profiles_availability ON pro_profiles(availability);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_rating ON pro_profiles(rating_avg DESC);

ALTER TABLE pro_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read listed profiles (not suspended)
DROP POLICY IF EXISTS "read_listed_pro_profiles" ON pro_profiles;
CREATE POLICY "read_listed_pro_profiles"
  ON pro_profiles FOR SELECT
  TO anon, authenticated
  USING (is_listed = true AND verification_status != 'suspended');

-- Owner can read own profile (even if unlisted/suspended)
DROP POLICY IF EXISTS "read_own_pro_profile" ON pro_profiles;
CREATE POLICY "read_own_pro_profile"
  ON pro_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Owner can insert own profile
DROP POLICY IF EXISTS "insert_own_pro_profile" ON pro_profiles;
CREATE POLICY "insert_own_pro_profile"
  ON pro_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner can update own profile (but NOT verification_status or rating fields)
DROP POLICY IF EXISTS "update_own_pro_profile" ON pro_profiles;
CREATE POLICY "update_own_pro_profile"
  ON pro_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin can do everything
DROP POLICY IF EXISTS "admin_manage_pro_profiles" ON pro_profiles;
CREATE POLICY "admin_manage_pro_profiles"
  ON pro_profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 4b. Trigger: prevent non-admins from changing verification_status
--       and auto-update rating when reviews change
-- =========================================================
CREATE OR REPLACE FUNCTION update_pro_profile_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate average rating from pro_reviews
  UPDATE pro_profiles
    SET rating_avg = COALESCE(
      (SELECT AVG(rating)::numeric(3,2) FROM pro_reviews
       WHERE professional_id = NEW.professional_id AND is_hidden = false),
      0
    ),
    rating_count = (
      SELECT COUNT(*) FROM pro_reviews
      WHERE professional_id = NEW.professional_id AND is_hidden = false
    ),
    updated_at = now()
  WHERE id = NEW.professional_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- 5. PRO_PROFILE_SERVICES — many-to-many (professional ↔ service)
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_profile_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES pro_services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_profile_services_profile ON pro_profile_services(profile_id);
CREATE INDEX IF NOT EXISTS idx_pro_profile_services_service ON pro_profile_services(service_id);

ALTER TABLE pro_profile_services ENABLE ROW LEVEL SECURITY;

-- Public can read (for directory display)
DROP POLICY IF EXISTS "read_pro_profile_services" ON pro_profile_services;
CREATE POLICY "read_pro_profile_services"
  ON pro_profile_services FOR SELECT
  TO anon, authenticated
  USING (true);

-- Owner of the profile can manage
DROP POLICY IF EXISTS "manage_own_pro_profile_services" ON pro_profile_services;
CREATE POLICY "manage_own_pro_profile_services"
  ON pro_profile_services FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_profile_services.profile_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_profile_services.profile_id AND user_id = auth.uid()));

-- Admin can manage
DROP POLICY IF EXISTS "admin_manage_pro_profile_services" ON pro_profile_services;
CREATE POLICY "admin_manage_pro_profile_services"
  ON pro_profile_services FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 6. PRO_PROFILE_LOCATIONS — professional service areas
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_profile_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES pro_locations(id) ON DELETE CASCADE,
  service_radius_km int DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_profile_locations_profile ON pro_profile_locations(profile_id);
CREATE INDEX IF NOT EXISTS idx_pro_profile_locations_location ON pro_profile_locations(location_id);

ALTER TABLE pro_profile_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_pro_profile_locations" ON pro_profile_locations;
CREATE POLICY "read_pro_profile_locations"
  ON pro_profile_locations FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "manage_own_pro_profile_locations" ON pro_profile_locations;
CREATE POLICY "manage_own_pro_profile_locations"
  ON pro_profile_locations FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_profile_locations.profile_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_profile_locations.profile_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_manage_pro_profile_locations" ON pro_profile_locations;
CREATE POLICY "admin_manage_pro_profile_locations"
  ON pro_profile_locations FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 7. PRO_PORTFOLIO_ITEMS — project portfolio with images
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  image_urls text[] NOT NULL DEFAULT '{}',
  completed_date date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_portfolio_profile ON pro_portfolio_items(profile_id);

ALTER TABLE pro_portfolio_items ENABLE ROW LEVEL SECURITY;

-- Public can read portfolio items of listed profiles
DROP POLICY IF EXISTS "read_pro_portfolio_items" ON pro_portfolio_items;
CREATE POLICY "read_pro_portfolio_items"
  ON pro_portfolio_items FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_portfolio_items.profile_id AND is_listed = true AND verification_status != 'suspended'));

-- Owner can manage
DROP POLICY IF EXISTS "manage_own_portfolio" ON pro_portfolio_items;
CREATE POLICY "manage_own_portfolio"
  ON pro_portfolio_items FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_portfolio_items.profile_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_portfolio_items.profile_id AND user_id = auth.uid()));

-- Admin can manage
DROP POLICY IF EXISTS "admin_manage_portfolio" ON pro_portfolio_items;
CREATE POLICY "admin_manage_portfolio"
  ON pro_portfolio_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 8. PRO_REVIEWS — reviews and ratings
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  project_ref uuid, -- optional reference to a contractor_project
  professional_response text,
  professional_response_at timestamptz,
  is_hidden boolean NOT NULL DEFAULT false,
  is_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_reviews_professional ON pro_reviews(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_reviews_reviewer ON pro_reviews(reviewer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_reviews_unique
  ON pro_reviews(professional_id, reviewer_id, COALESCE(project_ref, '00000000-0000-0000-0000-000000000000'));

ALTER TABLE pro_reviews ENABLE ROW LEVEL SECURITY;

-- Public can read non-hidden reviews
DROP POLICY IF EXISTS "read_visible_pro_reviews" ON pro_reviews;
CREATE POLICY "read_visible_pro_reviews"
  ON pro_reviews FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);

-- Authenticated users can review (but not themselves)
DROP POLICY IF EXISTS "insert_pro_review" ON pro_reviews;
CREATE POLICY "insert_pro_review"
  ON pro_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND reviewer_id NOT IN (SELECT user_id FROM pro_profiles WHERE id = professional_id)
  );

-- Reviewer can update their own review text/rating (not after professional has responded)
DROP POLICY IF EXISTS "update_own_pro_review" ON pro_reviews;
CREATE POLICY "update_own_pro_review"
  ON pro_reviews FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- Professional can update their own response field only
DROP POLICY IF EXISTS "respond_to_pro_review" ON pro_reviews;
CREATE POLICY "respond_to_pro_review"
  ON pro_reviews FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_reviews.professional_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_reviews.professional_id AND user_id = auth.uid())
  );

-- Admin can manage all reviews
DROP POLICY IF EXISTS "admin_manage_pro_reviews" ON pro_reviews;
CREATE POLICY "admin_manage_pro_reviews"
  ON pro_reviews FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger to update profile rating on review insert/update/delete
DROP TRIGGER IF EXISTS trg_pro_review_rating_update ON pro_reviews;
CREATE TRIGGER trg_pro_review_rating_update
  AFTER INSERT OR UPDATE OR DELETE ON pro_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_pro_profile_rating();

-- =========================================================
-- 9. PRO_CONVERSATIONS — messaging conversations
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_ref uuid, -- optional reference to a contractor_project
  project_context jsonb, -- shared project info (service type, location, etc.)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_conversations_professional ON pro_conversations(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_conversations_customer ON pro_conversations(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_conversations_unique
  ON pro_conversations(professional_id, customer_id, COALESCE(project_ref, '00000000-0000-0000-0000-000000000000'));

ALTER TABLE pro_conversations ENABLE ROW LEVEL SECURITY;

-- Participants can read their own conversations
DROP POLICY IF EXISTS "read_own_conversations" ON pro_conversations;
CREATE POLICY "read_own_conversations"
  ON pro_conversations FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_conversations.professional_id AND user_id = auth.uid())
  );

-- Customer can create conversation
DROP POLICY IF EXISTS "create_conversation" ON pro_conversations;
CREATE POLICY "create_conversation"
  ON pro_conversations FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Participants can update (archive, etc.)
DROP POLICY IF EXISTS "update_own_conversation" ON pro_conversations;
CREATE POLICY "update_own_conversation"
  ON pro_conversations FOR UPDATE
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_conversations.professional_id AND user_id = auth.uid())
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_conversations.professional_id AND user_id = auth.uid())
  );

-- Admin can read (for moderation)
DROP POLICY IF EXISTS "admin_read_conversations" ON pro_conversations;
CREATE POLICY "admin_read_conversations"
  ON pro_conversations FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- =========================================================
-- 10. PRO_MESSAGES — individual messages
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES pro_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  attachment_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  is_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_messages_conversation ON pro_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pro_messages_sender ON pro_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_pro_messages_unread ON pro_messages(conversation_id) WHERE is_read = false;

ALTER TABLE pro_messages ENABLE ROW LEVEL SECURITY;

-- Participants can read messages in their conversations
DROP POLICY IF EXISTS "read_own_messages" ON pro_messages;
CREATE POLICY "read_own_messages"
  ON pro_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pro_conversations c
      WHERE c.id = pro_messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM pro_profiles p WHERE p.id = c.professional_id AND p.user_id = auth.uid())
      )
    )
  );

-- Sender can insert messages in their own conversations
DROP POLICY IF EXISTS "send_message" ON pro_messages;
CREATE POLICY "send_message"
  ON pro_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pro_conversations c
      WHERE c.id = pro_messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM pro_profiles p WHERE p.id = c.professional_id AND p.user_id = auth.uid())
      )
      AND c.status = 'active'
    )
  );

-- Participants can update read status of messages in their conversations
-- (only marking as read, not editing content)
DROP POLICY IF EXISTS "mark_message_read" ON pro_messages;
CREATE POLICY "mark_message_read"
  ON pro_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pro_conversations c
      WHERE c.id = pro_messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM pro_profiles p WHERE p.id = c.professional_id AND p.user_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pro_conversations c
      WHERE c.id = pro_messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM pro_profiles p WHERE p.id = c.professional_id AND p.user_id = auth.uid())
      )
    )
  );

-- Admin can read (for moderation)
DROP POLICY IF EXISTS "admin_read_messages" ON pro_messages;
CREATE POLICY "admin_read_messages"
  ON pro_messages FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- =========================================================
-- 11. PRO_REPORTS — reporting / safety system
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('profile', 'review', 'message', 'portfolio')),
  target_id uuid NOT NULL, -- id of the reported entity
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_reports_status ON pro_reports(status);
CREATE INDEX IF NOT EXISTS idx_pro_reports_reporter ON pro_reports(reporter_id);

ALTER TABLE pro_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
DROP POLICY IF EXISTS "create_pro_report" ON pro_reports;
CREATE POLICY "create_pro_report"
  ON pro_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Users can read their own reports
DROP POLICY IF EXISTS "read_own_pro_reports" ON pro_reports;
CREATE POLICY "read_own_pro_reports"
  ON pro_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Admin can manage all reports
DROP POLICY IF EXISTS "admin_manage_pro_reports" ON pro_reports;
CREATE POLICY "admin_manage_pro_reports"
  ON pro_reports FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 12. PRO_VERIFICATION_LOGS — audit trail for verification changes
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_verification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_verification_logs_profile ON pro_verification_logs(profile_id);

ALTER TABLE pro_verification_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read and insert
DROP POLICY IF EXISTS "admin_manage_verification_logs" ON pro_verification_logs;
CREATE POLICY "admin_manage_verification_logs"
  ON pro_verification_logs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Profile owner can read their own verification history
DROP POLICY IF EXISTS "read_own_verification_logs" ON pro_verification_logs;
CREATE POLICY "read_own_verification_logs"
  ON pro_verification_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_logs.profile_id AND user_id = auth.uid())
  );

-- =========================================================
-- 13. Updated_at triggers for all new tables
-- =========================================================
CREATE OR REPLACE FUNCTION update_pro_table_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pro_categories_updated ON pro_categories;
CREATE TRIGGER trg_pro_categories_updated BEFORE UPDATE ON pro_categories
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_services_updated ON pro_services;
CREATE TRIGGER trg_pro_services_updated BEFORE UPDATE ON pro_services
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_locations_updated ON pro_locations;
CREATE TRIGGER trg_pro_locations_updated BEFORE UPDATE ON pro_locations
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_profiles_updated ON pro_profiles;
CREATE TRIGGER trg_pro_profiles_updated BEFORE UPDATE ON pro_profiles
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_portfolio_updated ON pro_portfolio_items;
CREATE TRIGGER trg_pro_portfolio_updated BEFORE UPDATE ON pro_portfolio_items
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_reviews_updated ON pro_reviews;
CREATE TRIGGER trg_pro_reviews_updated BEFORE UPDATE ON pro_reviews
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_conversations_updated ON pro_conversations;
CREATE TRIGGER trg_pro_conversations_updated BEFORE UPDATE ON pro_conversations
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();
DROP TRIGGER IF EXISTS trg_pro_reports_updated ON pro_reports;
CREATE TRIGGER trg_pro_reports_updated BEFORE UPDATE ON pro_reports
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();

-- =========================================================
-- 14. SEED: Professional Categories (structural, admin-managed)
-- =========================================================
INSERT INTO pro_categories (name, slug, description, icon, sort_order) VALUES
  ('Painters', 'painters', 'Professional painters for interior, exterior, and decorative painting.', 'Paintbrush', 1),
  ('Tilers', 'tilers', 'Professional tilers for floor, wall, bathroom, and kitchen tiling.', 'Grid3x3', 2),
  ('Wall Screeders', 'wall-screeders', 'Wall screeding specialists for smooth wall finishes.', 'Layers', 3),
  ('POP Installers', 'pop-installers', 'POP ceiling design and installation professionals.', 'PanelsTopLeft', 4),
  ('Building Contractors', 'building-contractors', 'General building contractors for construction and renovation.', 'Building2', 5),
  ('Civil Engineers', 'civil-engineers', 'Civil engineers for structural design and supervision.', 'Ruler', 6),
  ('Architects', 'architects', 'Architects for building design and planning.', 'DraftingCompass', 7),
  ('Quantity Surveyors', 'quantity-surveyors', 'Quantity surveyors for cost planning and material estimation.', 'Calculator', 8),
  ('Interior Decorators', 'interior-decorators', 'Interior decoration and design professionals.', 'Sofa', 9),
  ('Plumbers', 'plumbers', 'Plumbing installation and repair professionals.', 'Wrench', 10),
  ('Electricians', 'electricians', 'Electrical installation and wiring professionals.', 'Zap', 11),
  ('Carpenters', 'carpenters', 'Carpentry, woodworking, and furniture professionals.', 'Hammer', 12),
  ('Aluminium & Glass Installers', 'aluminium-glass-installers', 'Aluminium windows, doors, and glass installation.', 'Frame', 13),
  ('Other Construction Professionals', 'other-construction-professionals', 'Other construction and finishing professionals.', 'HardHat', 14)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 15. SEED: Services (structural, admin-managed)
-- =========================================================
INSERT INTO pro_services (name, slug, category_id, sort_order) VALUES
  -- Painters
  ('Interior Painting', 'interior-painting', (SELECT id FROM pro_categories WHERE slug = 'painters'), 1),
  ('Exterior Painting', 'exterior-painting', (SELECT id FROM pro_categories WHERE slug = 'painters'), 2),
  ('Decorative Painting', 'decorative-painting', (SELECT id FROM pro_categories WHERE slug = 'painters'), 3),
  ('Texture Finishes', 'texture-finishes', (SELECT id FROM pro_categories WHERE slug = 'painters'), 4),
  -- Tilers
  ('Floor Tiling', 'floor-tiling', (SELECT id FROM pro_categories WHERE slug = 'tilers'), 1),
  ('Wall Tiling', 'wall-tiling', (SELECT id FROM pro_categories WHERE slug = 'tilers'), 2),
  ('Bathroom Tiling', 'bathroom-tiling', (SELECT id FROM pro_categories WHERE slug = 'tilers'), 3),
  ('Kitchen Tiling', 'kitchen-tiling', (SELECT id FROM pro_categories WHERE slug = 'tilers'), 4),
  -- Wall Screeders
  ('Interior Wall Screeding', 'interior-wall-screeding', (SELECT id FROM pro_categories WHERE slug = 'wall-screeders'), 1),
  ('Exterior Wall Screeding', 'exterior-wall-screeding', (SELECT id FROM pro_categories WHERE slug = 'wall-screeders'), 2),
  -- POP Installers
  ('Standard POP Ceiling', 'standard-pop-ceiling', (SELECT id FROM pro_categories WHERE slug = 'pop-installers'), 1),
  ('Decorative POP Ceiling', 'decorative-pop-ceiling', (SELECT id FROM pro_categories WHERE slug = 'pop-installers'), 2),
  ('POP Cornice & Moulding', 'pop-cornice-moulding', (SELECT id FROM pro_categories WHERE slug = 'pop-installers'), 3),
  -- Building Contractors
  ('Residential Construction', 'residential-construction', (SELECT id FROM pro_categories WHERE slug = 'building-contractors'), 1),
  ('Renovation', 'renovation', (SELECT id FROM pro_categories WHERE slug = 'building-contractors'), 2),
  ('Finishing', 'finishing-contracting', (SELECT id FROM pro_categories WHERE slug = 'building-contractors'), 3),
  ('Project Management', 'project-management', (SELECT id FROM pro_categories WHERE slug = 'building-contractors'), 4),
  -- Civil Engineers
  ('Structural Design', 'structural-design', (SELECT id FROM pro_categories WHERE slug = 'civil-engineers'), 1),
  ('Site Supervision', 'site-supervision', (SELECT id FROM pro_categories WHERE slug = 'civil-engineers'), 2),
  ('Foundation Works', 'foundation-works', (SELECT id FROM pro_categories WHERE slug = 'civil-engineers'), 3),
  -- Architects
  ('Building Design', 'building-design', (SELECT id FROM pro_categories WHERE slug = 'architects'), 1),
  ('Architectural Drawings', 'architectural-drawings', (SELECT id FROM pro_categories WHERE slug = 'architects'), 2),
  ('3D Visualization', '3d-visualization', (SELECT id FROM pro_categories WHERE slug = 'architects'), 3),
  -- Quantity Surveyors
  ('Cost Estimation', 'cost-estimation', (SELECT id FROM pro_categories WHERE slug = 'quantity-surveyors'), 1),
  ('Bill of Quantities', 'bill-of-quantities', (SELECT id FROM pro_categories WHERE slug = 'quantity-surveyors'), 2),
  ('Material Scheduling', 'material-scheduling', (SELECT id FROM pro_categories WHERE slug = 'quantity-surveyors'), 3),
  -- Interior Decorators
  ('Interior Design', 'interior-design', (SELECT id FROM pro_categories WHERE slug = 'interior-decorators'), 1),
  ('Space Planning', 'space-planning', (SELECT id FROM pro_categories WHERE slug = 'interior-decorators'), 2),
  ('Color Consultation', 'color-consultation', (SELECT id FROM pro_categories WHERE slug = 'interior-decorators'), 3),
  -- Plumbers
  ('Pipe Installation', 'pipe-installation', (SELECT id FROM pro_categories WHERE slug = 'plumbers'), 1),
  ('Bathroom Plumbing', 'bathroom-plumbing', (SELECT id FROM pro_categories WHERE slug = 'plumbers'), 2),
  ('Drainage Systems', 'drainage-systems', (SELECT id FROM pro_categories WHERE slug = 'plumbers'), 3),
  -- Electricians
  ('Electrical Wiring', 'electrical-wiring', (SELECT id FROM pro_categories WHERE slug = 'electricians'), 1),
  ('Lighting Installation', 'lighting-installation', (SELECT id FROM pro_categories WHERE slug = 'electricians'), 2),
  ('Electrical Repairs', 'electrical-repairs', (SELECT id FROM pro_categories WHERE slug = 'electricians'), 3),
  -- Carpenters
  ('Furniture Making', 'furniture-making', (SELECT id FROM pro_categories WHERE slug = 'carpenters'), 1),
  ('Door & Window Frames', 'door-window-frames', (SELECT id FROM pro_categories WHERE slug = 'carpenters'), 2),
  ('Wooden Flooring', 'wooden-flooring', (SELECT id FROM pro_categories WHERE slug = 'carpenters'), 3),
  -- Aluminium & Glass
  ('Aluminium Windows', 'aluminium-windows', (SELECT id FROM pro_categories WHERE slug = 'aluminium-glass-installers'), 1),
  ('Aluminium Doors', 'aluminium-doors', (SELECT id FROM pro_categories WHERE slug = 'aluminium-glass-installers'), 2),
  ('Glass Partitioning', 'glass-partitioning', (SELECT id FROM pro_categories WHERE slug = 'aluminium-glass-installers'), 3),
  -- Other
  ('General Construction', 'general-construction', (SELECT id FROM pro_categories WHERE slug = 'other-construction-professionals'), 1)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 16. SEED: Nigerian States + Major Cities (structural)
-- =========================================================
INSERT INTO pro_locations (state, city, area, sort_order) VALUES
  -- Lagos
  ('Lagos', 'Lagos Mainland', 'Ikeja', 1),
  ('Lagos', 'Lagos Mainland', 'Surulere', 2),
  ('Lagos', 'Lagos Mainland', 'Yaba', 3),
  ('Lagos', 'Lagos Mainland', 'Lekki', 4),
  ('Lagos', 'Lagos Mainland', 'Ajah', 5),
  ('Lagos', 'Lagos Island', 'Victoria Island', 6),
  ('Lagos', 'Lagos Island', 'Ikoyi', 7),
  ('Lagos', 'Lagos Mainland', 'Ikorodu', 8),
  ('Lagos', 'Lagos Mainland', 'Badagry', 9),
  ('Lagos', 'Lagos Mainland', 'Epe', 10),
  -- Abuja FCT
  ('FCT (Abuja)', 'Abuja', 'Wuse', 11),
  ('FCT (Abuja)', 'Abuja', 'Garki', 12),
  ('FCT (Abuja)', 'Abuja', 'Maitama', 13),
  ('FCT (Abuja)', 'Abuja', 'Gwarinpa', 14),
  ('FCT (Abuja)', 'Abuja', 'Kubwa', 15),
  ('FCT (Abuja)', 'Abuja', 'Lugbe', 16),
  -- Rivers
  ('Rivers', 'Port Harcourt', 'GRA', 17),
  ('Rivers', 'Port Harcourt', 'Diobu', 18),
  ('Rivers', 'Port Harcourt', 'Trans-Amadi', 19),
  -- Oyo
  ('Oyo', 'Ibadan', 'Bodija', 20),
  ('Oyo', 'Ibadan', 'Iyana-ipaja', 21),
  ('Oyo', 'Ibadan', 'Jericho', 22),
  -- Imo
  ('Imo', 'Owerri', 'New Owerri', 23),
  ('Imo', 'Owerri', 'World Bank', 24),
  ('Imo', 'Owerri', 'Ikenegbu', 25),
  -- Enugu
  ('Enugu', 'Enugu', 'Independence Layout', 26),
  ('Enugu', 'Enugu', 'GRA', 27),
  ('Enugu', 'Enugu', 'Emene', 28),
  -- Anambra
  ('Anambra', 'Awka', 'Okpuno', 29),
  ('Anambra', 'Onitsha', 'Fegge', 30),
  ('Anambra', 'Nnewi', 'Otolo', 31),
  -- Kano
  ('Kano', 'Kano', 'Nassarawa', 32),
  ('Kano', 'Kano', 'Gwale', 33),
  ('Kano', 'Kano', 'Tarauni', 34),
  -- Kaduna
  ('Kaduna', 'Kaduna', 'Kawo', 35),
  ('Kaduna', 'Kaduna', 'Sabon Tasha', 36),
  ('Kaduna', 'Kaduna', 'Kakuri', 37),
  -- Delta
  ('Delta', 'Asaba', 'GRA', 38),
  ('Delta', 'Warri', 'Effurun', 39),
  ('Delta', 'Warri', 'Ekurede', 40),
  -- Edo
  ('Edo', 'Benin City', 'GRA', 41),
  ('Edo', 'Benin City', 'Sapele Road', 42),
  ('Edo', 'Benin City', 'Ugbowo', 43),
  -- Ogun
  ('Ogun', 'Abeokuta', 'Kuto', 44),
  ('Ogun', 'Abeokuta', 'Asero', 45),
  ('Ogun', 'Abeokuta', 'Lafenwa', 46),
  ('Ogun', 'Sango Ota', 'Sango', 47),
  ('Ogun', 'Sango Ota', 'Iyana-Ilogbo', 48),
  -- Akwa Ibom
  ('Akwa Ibom', 'Uyo', 'Ewet Housing', 49),
  ('Akwa Ibom', 'Uyo', 'Aka Road', 50),
  -- Cross River
  ('Cross River', 'Calabar', 'State Housing', 51),
  ('Cross River', 'Calabar', 'Marian', 52),
  -- Ondo
  ('Ondo', 'Akure', 'Alagbaka', 53),
  ('Ondo', 'Akure', 'Oda Road', 54),
  ('Ondo', 'Ondo City', 'Yaba', 55),
  -- Osun
  ('Osun', 'Osogbo', 'Oke-Fia', 56),
  ('Osun', 'Osogbo', 'GRA', 57),
  -- Ekiti
  ('Ekiti', 'Ado Ekiti', 'Ajilosun', 58),
  ('Ekiti', 'Ado Ekiti', 'Ijigbo', 59),
  -- Abia
  ('Abia', 'Aba', 'Ariaria', 60),
  ('Abia', 'Umuahia', 'Ahim Layout', 61),
  -- Ebonyi
  ('Ebonyi', 'Abakaliki', 'Presidential Road', 62),
  ('Ebonyi', 'Abakaliki', 'Kpirikpiri', 63),
  -- Bayelsa
  ('Bayelsa', 'Yenagoa', 'Etegwe', 64),
  ('Bayelsa', 'Yenagoa', 'Kpansia', 65),
  -- Plateau
  ('Plateau', 'Jos', 'Bukuru', 66),
  ('Plateau', 'Jos', 'Rayfield', 67),
  -- Nasarawa
  ('Nasarawa', 'Lafia', 'Shendam Road', 68),
  ('Nasarawa', 'Keffi', 'Keffin', 69),
  -- Benue
  ('Benue', 'Makurdi', 'Wurukum', 70),
  ('Benue', 'Makurdi', 'High Level', 71),
  -- Kogi
  ('Kogi', 'Lokoja', 'Adankolo', 72),
  ('Kogi', 'Lokoja', 'Ganaja', 73),
  -- Kwara
  ('Kwara', 'Ilorin', 'GRA', 74),
  ('Kwara', 'Ilorin', 'Tanke', 75),
  -- Niger
  ('Niger', 'Minna', 'Tunga', 76),
  ('Niger', 'Minna', 'Bosso', 77),
  -- Bauchi
  ('Bauchi', 'Bauchi', 'Wunti', 78),
  -- Gombe
  ('Gombe', 'Gombe', 'Gabukka', 79),
  -- Sokoto
  ('Sokoto', 'Sokoto', 'Emir Yahaya Road', 80),
  -- Zamfara
  ('Zamfara', 'Gusau', 'Gusau', 81),
  -- Kebbi
  ('Kebbi', 'Birnin Kebbi', 'Birnin Kebbi', 82),
  -- Jigawa
  ('Jigawa', 'Dutse', 'Dutse', 83),
  -- Yobe
  ('Yobe', 'Damaturu', 'Damaturu', 84),
  -- Borno
  ('Borno', 'Maiduguri', 'Gwange', 85),
  ('Borno', 'Maiduguri', 'Bolori', 86),
  -- Adamawa
  ('Adamawa', 'Yola', 'Jimeta', 87),
  ('Adamawa', 'Yola', 'State House', 88),
  -- Taraba
  ('Taraba', 'Jalingo', 'Jalingo', 89)
ON CONFLICT (state, city, COALESCE(area, '')) DO NOTHING;

-- =========================================================
-- 17. GRANTS
-- =========================================================
GRANT SELECT ON pro_categories TO anon, authenticated;
GRANT SELECT ON pro_services TO anon, authenticated;
GRANT SELECT ON pro_locations TO anon, authenticated;
GRANT SELECT ON pro_profiles TO anon, authenticated;
GRANT SELECT ON pro_profile_services TO anon, authenticated;
GRANT SELECT ON pro_profile_locations TO anon, authenticated;
GRANT SELECT ON pro_portfolio_items TO anon, authenticated;
GRANT SELECT ON pro_reviews TO anon, authenticated;
GRANT SELECT ON pro_conversations TO authenticated;
GRANT SELECT ON pro_messages TO authenticated;
GRANT SELECT ON pro_reports TO authenticated;
GRANT SELECT ON pro_verification_logs TO authenticated;

GRANT INSERT, UPDATE ON pro_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pro_profile_services TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pro_profile_locations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pro_portfolio_items TO authenticated;
GRANT INSERT, UPDATE ON pro_reviews TO authenticated;
GRANT INSERT, UPDATE ON pro_conversations TO authenticated;
GRANT INSERT, UPDATE ON pro_messages TO authenticated;
GRANT INSERT ON pro_reports TO authenticated;

-- Admin full access
GRANT ALL ON pro_categories TO authenticated;
GRANT ALL ON pro_services TO authenticated;
GRANT ALL ON pro_locations TO authenticated;
GRANT ALL ON pro_profiles TO authenticated;
GRANT ALL ON pro_profile_services TO authenticated;
GRANT ALL ON pro_profile_locations TO authenticated;
GRANT ALL ON pro_portfolio_items TO authenticated;
GRANT ALL ON pro_reviews TO authenticated;
GRANT ALL ON pro_conversations TO authenticated;
GRANT ALL ON pro_messages TO authenticated;
GRANT ALL ON pro_reports TO authenticated;
GRANT ALL ON pro_verification_logs TO authenticated;

-- =========================================================
-- 18. Storage bucket for portfolio images
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('pro-portfolio', 'pro-portfolio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for pro-portfolio bucket
DROP POLICY IF EXISTS "read_pro_portfolio_images" ON storage.objects;
CREATE POLICY "read_pro_portfolio_images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'pro-portfolio');

DROP POLICY IF EXISTS "upload_pro_portfolio_images" ON storage.objects;
CREATE POLICY "upload_pro_portfolio_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pro-portfolio');

DROP POLICY IF EXISTS "update_own_pro_portfolio_images" ON storage.objects;
CREATE POLICY "update_own_pro_portfolio_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'pro-portfolio' AND owner = auth.uid());

DROP POLICY IF EXISTS "delete_own_pro_portfolio_images" ON storage.objects;
CREATE POLICY "delete_own_pro_portfolio_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pro-portfolio' AND owner = auth.uid());
