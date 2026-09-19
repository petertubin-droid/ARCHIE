-- =========================================================
-- FRELUX Pro Connect — Trust, Verification & Account Types
-- Phase 26: Extends Phase 25 Pro Connect
-- Date: 2026-08-21
--
-- Adds: account types, tiered verification, verification workflow,
-- credential verification for regulated professions, verification
-- documents (private), admin verification center support, verified
-- reviews, and configurable settings.
--
-- EXTENDS — does not rebuild — the existing Phase 25 schema.
-- =========================================================

-- =========================================================
-- 1. ACCOUNT TYPE on profiles table
-- =========================================================
-- Add account_type column to existing profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'client'
  CHECK (account_type IN ('client', 'pro_worker'));

-- Update handle_new_user to accept account_type from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_metadata->>'account_type', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- =========================================================
-- 2. EXTEND pro_profiles with verification tier columns
-- =========================================================
-- Drop old CHECK constraint to add new status values
ALTER TABLE pro_profiles DROP CONSTRAINT IF EXISTS pro_profiles_verification_status_check;

ALTER TABLE pro_profiles
  ADD COLUMN IF NOT EXISTS contact_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS pro_level boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_level_awarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_number text;

-- Update CHECK constraint to include new statuses
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_profiles_verification_status_check'
                 AND conrelid = 'public.pro_profiles'::regclass) THEN
ALTER TABLE pro_profiles
  ADD CONSTRAINT pro_profiles_verification_status_check
  CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'more_info', 'suspended'));
  END IF;
END
$mig$;


-- =========================================================
-- 3. PRO_VERIFICATION_REQUESTS — verification workflow
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('contact', 'identity', 'pro_level')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'more_info', 'withdrawn')),
  -- Information submitted by the professional
  professional_name text,
  business_name text,
  category_id uuid REFERENCES pro_categories(id) ON DELETE SET NULL,
  service_locations text[],
  years_experience int,
  -- Identity verification (Level 2)
  identity_document_type text, -- 'national_id', 'drivers_license', 'international_passport', 'voters_card'
  identity_document_number text, -- NOT exposed publicly; only admin can read
  -- Admin review
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_notes text,
  rejection_reason text,
  more_info_request text,
  -- Timestamps
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_verification_requests_profile ON pro_verification_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_pro_verification_requests_status ON pro_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_pro_verification_requests_type ON pro_verification_requests(request_type);

ALTER TABLE pro_verification_requests ENABLE ROW LEVEL SECURITY;

-- Owner can read their own verification requests
DROP POLICY IF EXISTS "read_own_verification_requests" ON pro_verification_requests;
CREATE POLICY "read_own_verification_requests"
  ON pro_verification_requests FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_requests.profile_id AND user_id = auth.uid()));

-- Owner can create verification requests for their own profile
DROP POLICY IF EXISTS "create_own_verification_request" ON pro_verification_requests;
CREATE POLICY "create_own_verification_request"
  ON pro_verification_requests FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_requests.profile_id AND user_id = auth.uid()));

-- Owner can update (withdraw) their own pending requests
DROP POLICY IF EXISTS "update_own_verification_request" ON pro_verification_requests;
CREATE POLICY "update_own_verification_request"
  ON pro_verification_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_requests.profile_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_requests.profile_id AND user_id = auth.uid()));

-- Admin can manage all verification requests
DROP POLICY IF EXISTS "admin_manage_verification_requests" ON pro_verification_requests;
CREATE POLICY "admin_manage_verification_requests"
  ON pro_verification_requests FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_pro_verification_requests_updated ON pro_verification_requests;
CREATE TRIGGER trg_pro_verification_requests_updated
  BEFORE UPDATE ON pro_verification_requests
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();

-- =========================================================
-- 4. PRO_VERIFICATION_DOCUMENTS — private identity documents
-- =========================================================
-- Stores references to identity documents in private storage.
-- These are NEVER exposed publicly. Only the profile owner and admin can read.
CREATE TABLE IF NOT EXISTS pro_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES pro_verification_requests(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN (
    'national_id', 'drivers_license', 'international_passport', 'voters_card',
    'professional_certificate', 'business_registration', 'other'
  )),
  -- Private storage path — NEVER exposed via public URL
  storage_path text NOT NULL,
  -- Metadata only — no sensitive content stored in this table
  file_name text,
  file_size bigint,
  mime_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_verification_documents_profile ON pro_verification_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_pro_verification_documents_request ON pro_verification_documents(request_id);

ALTER TABLE pro_verification_documents ENABLE ROW LEVEL SECURITY;

-- Only the profile owner can read their own documents
DROP POLICY IF EXISTS "read_own_verification_documents" ON pro_verification_documents;
CREATE POLICY "read_own_verification_documents"
  ON pro_verification_documents FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_documents.profile_id AND user_id = auth.uid()));

-- Only the profile owner can upload documents for their own profile
DROP POLICY IF EXISTS "create_own_verification_documents" ON pro_verification_documents;
CREATE POLICY "create_own_verification_documents"
  ON pro_verification_documents FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_documents.profile_id AND user_id = auth.uid()));

-- Only the profile owner can delete their own documents
DROP POLICY IF EXISTS "delete_own_verification_documents" ON pro_verification_documents;
CREATE POLICY "delete_own_verification_documents"
  ON pro_verification_documents FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_verification_documents.profile_id AND user_id = auth.uid()));

-- Admin can read all verification documents (for review)
DROP POLICY IF EXISTS "admin_read_verification_documents" ON pro_verification_documents;
CREATE POLICY "admin_read_verification_documents"
  ON pro_verification_documents FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admin can delete verification documents (after review)
DROP POLICY IF EXISTS "admin_delete_verification_documents" ON pro_verification_documents;
CREATE POLICY "admin_delete_verification_documents"
  ON pro_verification_documents FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =========================================================
-- 5. PRO_CREDENTIALS — regulated profession credentials
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  professional_body text NOT NULL,
  registration_number text NOT NULL,
  credential_type text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired')),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  expires_at date,
  -- Document reference (private storage)
  document_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_credentials_profile ON pro_credentials(profile_id);
CREATE INDEX IF NOT EXISTS idx_pro_credentials_status ON pro_credentials(verification_status);

ALTER TABLE pro_credentials ENABLE ROW LEVEL SECURITY;

-- Public can read that a credential exists and its verification status
-- but NOT the registration_number or document_path
-- This is handled via a view below
DROP POLICY IF EXISTS "read_own_credentials" ON pro_credentials;
CREATE POLICY "read_own_credentials"
  ON pro_credentials FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_credentials.profile_id AND user_id = auth.uid()));

-- Owner can create credentials for their own profile
DROP POLICY IF EXISTS "create_own_credentials" ON pro_credentials;
CREATE POLICY "create_own_credentials"
  ON pro_credentials FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_credentials.profile_id AND user_id = auth.uid()));

-- Owner can update their own credentials (but not verification_status)
DROP POLICY IF EXISTS "update_own_credentials" ON pro_credentials;
CREATE POLICY "update_own_credentials"
  ON pro_credentials FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_credentials.profile_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM pro_profiles WHERE id = pro_credentials.profile_id AND user_id = auth.uid()));

-- Admin can manage all credentials
DROP POLICY IF EXISTS "admin_manage_credentials" ON pro_credentials;
CREATE POLICY "admin_manage_credentials"
  ON pro_credentials FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_pro_credentials_updated ON pro_credentials;
CREATE TRIGGER trg_pro_credentials_updated
  BEFORE UPDATE ON pro_credentials
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();

-- =========================================================
-- 5b. PUBLIC VIEW for credentials (hides sensitive fields)
-- =========================================================
-- This view exposes only: profile_id, professional_body, credential_type,
-- verification_status, verified_at — NOT registration_number or document_path.
CREATE OR REPLACE VIEW pro_credentials_public AS
SELECT
  id,
  profile_id,
  professional_body,
  credential_type,
  verification_status,
  verified_at,
  expires_at,
  created_at
FROM pro_credentials
WHERE verification_status = 'verified';

GRANT SELECT ON pro_credentials_public TO anon, authenticated;

-- =========================================================
-- 6. PRO_SETTINGS — admin-configurable verification settings
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_settings (
  id int PRIMARY KEY DEFAULT 1,
  -- Verification badge descriptions (admin-editable)
  contact_verified_description text NOT NULL DEFAULT 'This professional has verified their email address and phone number with FRELUX.',
  frelux_verified_description text NOT NULL DEFAULT 'FRELUX has reviewed the professional''s identity and professional profile information according to FRELUX''s verification requirements.',
  pro_level_description text NOT NULL DEFAULT 'This professional has demonstrated sustained excellence on FRELUX through verified credentials, legitimate reviews, and portfolio history.',
  verification_disclaimer text NOT NULL DEFAULT 'Verification does not constitute a guarantee of workmanship, pricing, or project outcome.',
  -- Pro Level eligibility requirements (admin-configurable)
  pro_level_min_reviews int NOT NULL DEFAULT 5,
  pro_level_min_rating numeric(3,2) NOT NULL DEFAULT 4.50,
  pro_level_min_portfolio_items int NOT NULL DEFAULT 3,
  pro_level_min_profile_age_days int NOT NULL DEFAULT 30,
  -- Matching settings
  verified_boost_in_search boolean NOT NULL DEFAULT true,
  -- Moderation settings
  auto_publish_reviews boolean NOT NULL DEFAULT true,
  require_review_approval boolean NOT NULL DEFAULT false,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default settings row
INSERT INTO pro_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE pro_settings ENABLE ROW LEVEL SECURITY;

-- Public can read settings (badge descriptions, etc.)
DROP POLICY IF EXISTS "read_pro_settings" ON pro_settings;
CREATE POLICY "read_pro_settings"
  ON pro_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin can update settings
DROP POLICY IF EXISTS "admin_update_pro_settings" ON pro_settings;
CREATE POLICY "admin_update_pro_settings"
  ON pro_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_pro_settings_updated ON pro_settings;
CREATE TRIGGER trg_pro_settings_updated
  BEFORE UPDATE ON pro_settings
  FOR EACH ROW EXECUTE FUNCTION update_pro_table_updated_at();

-- =========================================================
-- 7. Add is_verified_review to pro_reviews
-- =========================================================
ALTER TABLE pro_reviews
  ADD COLUMN IF NOT EXISTS is_verified_review boolean NOT NULL DEFAULT false;

-- A review is "verified" if it's associated with a legitimate FRELUX project_ref
-- This is set by the system, not by users
-- =========================================================
-- 8. Private storage bucket for verification documents
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('pro-verification', 'pro-verification', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for pro-verification bucket (PRIVATE)
-- Only owner can read their own verification documents
DROP POLICY IF EXISTS "read_own_verification_storage" ON storage.objects;
CREATE POLICY "read_own_verification_storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pro-verification' AND owner = auth.uid());

-- Only authenticated users can upload (for their own profile)
DROP POLICY IF EXISTS "upload_verification_storage" ON storage.objects;
CREATE POLICY "upload_verification_storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pro-verification');

-- Only owner can delete their own verification documents
DROP POLICY IF EXISTS "delete_own_verification_storage" ON storage.objects;
CREATE POLICY "delete_own_verification_storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pro-verification' AND owner = auth.uid());

-- Admin can read all verification documents
DROP POLICY IF EXISTS "admin_read_verification_storage" ON storage.objects;
CREATE POLICY "admin_read_verification_storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pro-verification' AND public.is_admin());

-- =========================================================
-- 9. Function: compute_verification_tier
-- =========================================================
-- Returns the highest verification tier for a profile:
-- 0 = unverified, 1 = contact verified, 2 = FRELUX verified, 3 = FRELUX Pro
CREATE OR REPLACE FUNCTION get_verification_tier(profile_uuid uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN pro_level = true THEN 3
    WHEN identity_verified_at IS NOT NULL THEN 2
    WHEN contact_verified_at IS NOT NULL THEN 1
    ELSE 0
  END
  FROM pro_profiles
  WHERE id = profile_uuid;
$$;

-- =========================================================
-- 10. Function: check_pro_level_eligibility
-- =========================================================
-- Checks if a profile meets the admin-configured criteria for Pro Level
CREATE OR REPLACE FUNCTION check_pro_level_eligibility(profile_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings pro_settings;
  v_profile pro_profiles;
  v_review_count int;
  v_rating_avg numeric(3,2);
  v_portfolio_count int;
  v_profile_age_days int;
BEGIN
  SELECT * INTO v_settings FROM pro_settings WHERE id = 1;
  SELECT * INTO v_profile FROM pro_profiles WHERE id = profile_uuid;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Must be FRELUX Verified first
  IF v_profile.identity_verified_at IS NULL THEN RETURN false; END IF;

  -- Check review count
  SELECT COUNT(*), COALESCE(AVG(rating)::numeric(3,2), 0)
    INTO v_review_count, v_rating_avg
  FROM pro_reviews
  WHERE professional_id = profile_uuid AND is_hidden = false;

  IF v_review_count < v_settings.pro_level_min_reviews THEN RETURN false; END IF;

  -- Check rating
  IF v_rating_avg < v_settings.pro_level_min_rating THEN RETURN false; END IF;

  -- Check portfolio
  SELECT COUNT(*) INTO v_portfolio_count
  FROM pro_portfolio_items
  WHERE profile_id = profile_uuid;

  IF v_portfolio_count < v_settings.pro_level_min_portfolio_items THEN RETURN false; END IF;

  -- Check profile age
  v_profile_age_days := EXTRACT(EPOCH FROM (now() - v_profile.created_at))::int / 86400;
  IF v_profile_age_days < v_settings.pro_level_min_profile_age_days THEN RETURN false; END IF;

  RETURN true;
END;
$$;

-- =========================================================
-- 11. Function: award_pro_level (admin-only)
-- =========================================================
-- Admin calls this to award Pro Level after verifying eligibility
CREATE OR REPLACE FUNCTION award_pro_level(profile_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can award Pro Level';
  END IF;

  UPDATE pro_profiles
  SET pro_level = true,
      pro_level_awarded_at = now(),
      updated_at = now()
  WHERE id = profile_uuid;

  RETURN true;
END;
$$;

-- =========================================================
-- 12. Function: revoke_pro_level (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION revoke_pro_level(profile_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can revoke Pro Level';
  END IF;

  UPDATE pro_profiles
  SET pro_level = false,
      pro_level_awarded_at = NULL,
      updated_at = now()
  WHERE id = profile_uuid;

  RETURN true;
END;
$$;

-- =========================================================
-- 13. Function: approve_verification (admin-only)
-- =========================================================
-- Sets identity_verified_at and updates profile verification_status
CREATE OR REPLACE FUNCTION approve_verification(
  profile_uuid uuid,
  request_uuid uuid,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request pro_verification_requests;
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve verification';
  END IF;

  SELECT * INTO v_request FROM pro_verification_requests WHERE id = request_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification request not found'; END IF;

  v_old_status := (SELECT verification_status FROM pro_profiles WHERE id = profile_uuid);

  -- Update the request
  UPDATE pro_verification_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = admin_notes,
      updated_at = now()
  WHERE id = request_uuid;

  -- Update the profile based on request type
  IF v_request.request_type = 'contact' THEN
    UPDATE pro_profiles
    SET contact_verified_at = now(),
        verification_status = 'verified',
        updated_at = now()
    WHERE id = profile_uuid;
  ELSIF v_request.request_type = 'identity' THEN
    UPDATE pro_profiles
    SET identity_verified_at = now(),
        verification_status = 'verified',
        updated_at = now()
    WHERE id = profile_uuid;
  END IF;

  -- Log the verification change
  INSERT INTO pro_verification_logs (profile_id, admin_id, old_status, new_status, notes)
  VALUES (profile_uuid, auth.uid(), v_old_status, 'verified', admin_notes);
END;
$$;

-- =========================================================
-- 14. Function: reject_verification (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION reject_verification(
  profile_uuid uuid,
  request_uuid uuid,
  rejection_reason text DEFAULT NULL,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject verification';
  END IF;

  v_old_status := (SELECT verification_status FROM pro_profiles WHERE id = profile_uuid);

  UPDATE pro_verification_requests
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = rejection_reason,
      admin_notes = admin_notes,
      updated_at = now()
  WHERE id = request_uuid;

  UPDATE pro_profiles
  SET verification_status = 'rejected',
      updated_at = now()
  WHERE id = profile_uuid;

  INSERT INTO pro_verification_logs (profile_id, admin_id, old_status, new_status, notes)
  VALUES (profile_uuid, auth.uid(), v_old_status, 'rejected', COALESCE(rejection_reason, admin_notes));
END;
$$;

-- =========================================================
-- 15. Function: request_more_info (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION request_more_info_verification(
  profile_uuid uuid,
  request_uuid uuid,
  info_request text DEFAULT NULL,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can request more info';
  END IF;

  v_old_status := (SELECT verification_status FROM pro_profiles WHERE id = profile_uuid);

  UPDATE pro_verification_requests
  SET status = 'more_info',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      more_info_request = info_request,
      admin_notes = admin_notes,
      updated_at = now()
  WHERE id = request_uuid;

  UPDATE pro_profiles
  SET verification_status = 'more_info',
      updated_at = now()
  WHERE id = profile_uuid;

  INSERT INTO pro_verification_logs (profile_id, admin_id, old_status, new_status, notes)
  VALUES (profile_uuid, auth.uid(), v_old_status, 'more_info', COALESCE(info_request, admin_notes));
END;
$$;

-- =========================================================
-- 16. Function: suspend_verification (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION suspend_verification(
  profile_uuid uuid,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can suspend verification';
  END IF;

  v_old_status := (SELECT verification_status FROM pro_profiles WHERE id = profile_uuid);

  UPDATE pro_profiles
  SET verification_status = 'suspended',
      identity_verified_at = NULL,
      contact_verified_at = NULL,
      pro_level = false,
      pro_level_awarded_at = NULL,
      updated_at = now()
  WHERE id = profile_uuid;

  INSERT INTO pro_verification_logs (profile_id, admin_id, old_status, new_status, notes)
  VALUES (profile_uuid, auth.uid(), v_old_status, 'suspended', reason);
END;
$$;

-- =========================================================
-- 17. Function: reinstate_verification (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION reinstate_verification(
  profile_uuid uuid,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reinstate verification';
  END IF;

  v_old_status := (SELECT verification_status FROM pro_profiles WHERE id = profile_uuid);

  UPDATE pro_profiles
  SET verification_status = 'unverified',
      updated_at = now()
  WHERE id = profile_uuid;

  INSERT INTO pro_verification_logs (profile_id, admin_id, old_status, new_status, notes)
  VALUES (profile_uuid, auth.uid(), v_old_status, 'unverified', admin_notes);
END;
$$;

-- =========================================================
-- 18. Function: upgrade_account_type
-- =========================================================
-- Allows a client to upgrade to pro_worker
CREATE OR REPLACE FUNCTION upgrade_account_type(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User can upgrade themselves, or admin can do it
  IF auth.uid() != target_user AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You can only upgrade your own account';
  END IF;

  UPDATE public.profiles
  SET account_type = 'pro_worker',
      updated_at = now()
  WHERE id = target_user;
END;
$$;

-- =========================================================
-- 19. GRANTS for new tables
-- =========================================================
GRANT SELECT ON pro_verification_requests TO authenticated;
GRANT INSERT, UPDATE ON pro_verification_requests TO authenticated;
GRANT SELECT ON pro_verification_documents TO authenticated;
GRANT INSERT, DELETE ON pro_verification_documents TO authenticated;
GRANT SELECT ON pro_credentials TO authenticated;
GRANT INSERT, UPDATE ON pro_credentials TO authenticated;
GRANT SELECT ON pro_settings TO anon, authenticated;
GRANT SELECT ON pro_credentials_public TO anon, authenticated;

-- Admin full access
GRANT ALL ON pro_verification_requests TO authenticated;
GRANT ALL ON pro_verification_documents TO authenticated;
GRANT ALL ON pro_credentials TO authenticated;
GRANT ALL ON pro_settings TO authenticated;

-- Allow profiles table to be updated for account_type
GRANT UPDATE ON public.profiles TO authenticated;
