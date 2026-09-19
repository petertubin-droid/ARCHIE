-- =========================================================
-- Phase 31: Worker Channel Verification Gating + KYC
-- Only FRELUX verified (tier 2) and Pro (tier 3) workers can join channels
-- Adds mobile OTP verification + NIN KYC to registration flow
-- =========================================================

-- =========================================================
-- 1. Add NIN + KYC columns to pro_profiles
-- =========================================================
ALTER TABLE pro_profiles
  ADD COLUMN IF NOT EXISTS nin_number text, -- National Identification Number (11 digits)
  ADD COLUMN IF NOT EXISTS nin_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nin_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS mobile_otp_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobile_otp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS mobile_number text;

-- Index for NIN lookup (admin verification)
CREATE INDEX IF NOT EXISTS idx_pro_profiles_nin ON pro_profiles(nin_number) WHERE nin_number IS NOT NULL;

-- =========================================================
-- 2. OTP log table for mobile verification
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_mobile_otp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'registration', -- 'registration', 'phone_change'
  is_used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_otp_profile ON pro_mobile_otp_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_mobile_otp_phone ON pro_mobile_otp_log(phone_number);

-- RLS for OTP log
ALTER TABLE pro_mobile_otp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mobile_otp_self_read" ON pro_mobile_otp_log;
CREATE POLICY "mobile_otp_self_read" ON pro_mobile_otp_log FOR SELECT USING (
  profile_id IN (SELECT id FROM pro_profiles WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "mobile_otp_self_insert" ON pro_mobile_otp_log;
CREATE POLICY "mobile_otp_self_insert" ON pro_mobile_otp_log FOR INSERT WITH CHECK (
  profile_id IN (SELECT id FROM pro_profiles WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "mobile_otp_self_update" ON pro_mobile_otp_log;
CREATE POLICY "mobile_otp_self_update" ON pro_mobile_otp_log FOR UPDATE USING (
  profile_id IN (SELECT id FROM pro_profiles WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "mobile_otp_admin_all" ON pro_mobile_otp_log;
CREATE POLICY "mobile_otp_admin_all" ON pro_mobile_otp_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- =========================================================
-- 3. Update worker_channel_members RLS — only tier 2+ can join
-- =========================================================
-- Drop old policies
DROP POLICY IF EXISTS "worker_members_insert_self" ON worker_channel_members;
DROP POLICY IF EXISTS "worker_members_read_self" ON worker_channel_members;
DROP POLICY IF EXISTS "worker_members_delete_self" ON worker_channel_members;

-- New: only pro_worker with verification tier >= 2 can join
CREATE POLICY "worker_members_read_self" ON worker_channel_members FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "worker_members_insert_self" ON worker_channel_members;
CREATE POLICY "worker_members_insert_self" ON worker_channel_members FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.account_type = 'pro_worker'
  )
  AND EXISTS (
    SELECT 1 FROM pro_profiles pp
    WHERE pp.user_id = auth.uid()
    AND (
      pp.identity_verified_at IS NOT NULL  -- Tier 2 (FRELUX verified)
      OR pp.pro_level = true                -- Tier 3 (FRELUX Pro)
    )
  )
);

DROP POLICY IF EXISTS "worker_members_delete_self" ON worker_channel_members;
CREATE POLICY "worker_members_delete_self" ON worker_channel_members FOR DELETE USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- =========================================================
-- 4. Update worker_channel_messages RLS — only tier 2+ can post
-- =========================================================
DROP POLICY IF EXISTS "worker_messages_insert" ON worker_channel_messages;

CREATE POLICY "worker_messages_insert" ON worker_channel_messages FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM worker_channel_members m WHERE m.channel_id = worker_channel_messages.channel_id AND m.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM worker_channel_members m WHERE m.channel_id = worker_channel_messages.channel_id AND m.user_id = auth.uid()
    AND m.muted_until IS NOT NULL AND m.muted_until > now()
  )
  -- Must be tier 2+
  AND EXISTS (
    SELECT 1 FROM pro_profiles pp
    WHERE pp.user_id = auth.uid()
    AND (
      pp.identity_verified_at IS NOT NULL
      OR pp.pro_level = true
    )
  )
);

-- =========================================================
-- 5. Grant permissions on new tables
-- =========================================================
GRANT SELECT, INSERT, UPDATE ON pro_mobile_otp_log TO authenticated;
-- =========================================================
-- 6. RPC: Send mobile OTP (generates + stores 6-digit code)
-- =========================================================
CREATE OR REPLACE FUNCTION send_mobile_otp(
  p_phone_number TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  otp_code TEXT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_otp TEXT;
  v_existing_unused INTEGER;
BEGIN
  -- Find the pro_profile for this user
  SELECT id INTO v_profile_id FROM pro_profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, 'No professional profile found'::TEXT;
    RETURN;
  END IF;

  -- Rate limit: max 3 unused OTPs in last 10 minutes
  SELECT COUNT(*) INTO v_existing_unused
  FROM pro_mobile_otp_log
  WHERE profile_id = v_profile_id
    AND is_used = false
    AND created_at > now() - interval '10 minutes';

  IF v_existing_unused >= 3 THEN
    RETURN QUERY SELECT false, NULL::TEXT, 'Too many OTP requests. Please wait 10 minutes.'::TEXT;
    RETURN;
  END IF;

  -- Generate 6-digit OTP
  v_otp := lpad(floor(random() * 1000000)::TEXT, 6, '0');

  -- Invalidate previous unused OTPs
  UPDATE pro_mobile_otp_log
  SET is_used = true
  WHERE profile_id = v_profile_id AND is_used = false;

  -- Insert new OTP
  INSERT INTO pro_mobile_otp_log (profile_id, phone_number, otp_code, purpose, expires_at)
  VALUES (v_profile_id, p_phone_number, v_otp, 'registration', now() + interval '10 minutes');

  -- Update mobile number on profile
  UPDATE pro_profiles SET mobile_number = p_phone_number WHERE id = v_profile_id;

  RETURN QUERY SELECT true, v_otp, 'OTP sent successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION send_mobile_otp TO authenticated;

-- =========================================================
-- 7. RPC: Verify mobile OTP
-- =========================================================
CREATE OR REPLACE FUNCTION verify_mobile_otp(
  p_phone_number TEXT,
  p_otp_code TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_log_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM pro_profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT false, 'No professional profile found'::TEXT;
    RETURN;
  END IF;

  -- Find matching unused, non-expired OTP
  SELECT id INTO v_log_id
  FROM pro_mobile_otp_log
  WHERE profile_id = v_profile_id
    AND phone_number = p_phone_number
    AND otp_code = p_otp_code
    AND is_used = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_log_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invalid or expired OTP'::TEXT;
    RETURN;
  END IF;

  -- Mark OTP as used
  UPDATE pro_mobile_otp_log SET is_used = true WHERE id = v_log_id;

  -- Update profile
  UPDATE pro_profiles
  SET mobile_otp_verified = true,
      mobile_otp_verified_at = now(),
      phone_verified = true,
      phone_number = p_phone_number,
      contact_verified_at = COALESCE(contact_verified_at, now())
  WHERE id = v_profile_id;

  RETURN QUERY SELECT true, 'Mobile number verified successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_mobile_otp TO authenticated;

-- =========================================================
-- 8. RPC: Verify NIN (admin approval workflow)
-- =========================================================
-- Workers submit their NIN; admin verifies it.
-- This function creates a verification request with NIN.
CREATE OR REPLACE FUNCTION submit_nin_verification(
  p_nin_number TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_nin_valid BOOLEAN;
BEGIN
  -- Validate NIN format (11 digits)
  IF p_nin_number !~ '^[0-9]{11}$' THEN
    RETURN QUERY SELECT false, 'NIN must be exactly 11 digits'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_profile_id FROM pro_profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT false, 'No professional profile found'::TEXT;
    RETURN;
  END IF;

  -- Check if NIN is already used by another profile
  PERFORM 1 FROM pro_profiles WHERE nin_number = p_nin_number AND id != v_profile_id;
  IF FOUND THEN
    RETURN QUERY SELECT false, 'This NIN is already registered to another account'::TEXT;
    RETURN;
  END IF;

  -- Store NIN (pending admin verification)
  UPDATE pro_profiles
  SET nin_number = p_nin_number
  WHERE id = v_profile_id;

  -- Create identity verification request
  INSERT INTO pro_verification_requests (profile_id, request_type, status, identity_document_type, identity_document_number)
  VALUES (v_profile_id, 'identity', 'pending', 'national_id', p_nin_number)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true, 'NIN submitted for verification. An admin will review it shortly.'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_nin_verification TO authenticated;

-- =========================================================
-- 9. RPC: Admin approves NIN (sets identity_verified_at)
-- =========================================================
CREATE OR REPLACE FUNCTION admin_approve_nin(
  p_profile_id UUID,
  p_admin_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin
  PERFORM 1 FROM profiles WHERE id = p_admin_id AND role = 'admin';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Only admins can approve NIN'::TEXT;
    RETURN;
  END IF;

  -- Update profile
  UPDATE pro_profiles
  SET nin_verified = true,
      nin_verified_at = now(),
      identity_verified_at = now(),
      verification_status = 'verified'
  WHERE id = p_profile_id;

  -- Approve pending verification requests
  UPDATE pro_verification_requests
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE profile_id = p_profile_id
    AND request_type = 'identity'
    AND status = 'pending';

  RETURN QUERY SELECT true, 'NIN verified successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_nin TO authenticated;

-- =========================================================
-- 10. RPC: Get user verification tier for channel access
-- =========================================================
CREATE OR REPLACE FUNCTION get_user_verification_tier(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier INTEGER := 0;
  v_pro_level BOOLEAN;
  v_identity_verified TIMESTAMPTZ;
  v_contact_verified TIMESTAMPTZ;
BEGIN
  SELECT pro_level, identity_verified_at, contact_verified_at
  INTO v_pro_level, v_identity_verified, v_contact_verified
  FROM pro_profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_pro_level THEN
    v_tier := 3;
  ELSEIF v_identity_verified IS NOT NULL THEN
    v_tier := 2;
  ELSEIF v_contact_verified IS NOT NULL THEN
    v_tier := 1;
  END IF;

  RETURN v_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_verification_tier TO authenticated;

-- =========================================================
-- 11. NIN verification audit log (for reports against workers)
-- =========================================================
CREATE TABLE IF NOT EXISTS pro_nin_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  nin_number TEXT NOT NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'rejected', 'revoked')),
  notes TEXT,
  -- Snapshot of profile state at verification time (for reference)
  display_name_snapshot TEXT,
  business_name_snapshot TEXT,
  phone_number_snapshot TEXT,
  mobile_number_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_nin_log_profile ON pro_nin_verification_log(profile_id);

-- RLS: only admins can read the NIN verification log
ALTER TABLE pro_nin_verification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nin_log_admin_read" ON pro_nin_verification_log;
CREATE POLICY "nin_log_admin_read" ON pro_nin_verification_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
DROP POLICY IF EXISTS "nin_log_admin_all" ON pro_nin_verification_log;
CREATE POLICY "nin_log_admin_all" ON pro_nin_verification_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON pro_nin_verification_log TO authenticated;
-- =========================================================
-- 12. Update admin_approve_nin to also log to verification log
-- =========================================================
CREATE OR REPLACE FUNCTION admin_approve_nin(
  p_profile_id UUID,
  p_admin_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nin TEXT;
  v_display_name TEXT;
  v_business_name TEXT;
  v_phone TEXT;
  v_mobile TEXT;
BEGIN
  -- Verify admin
  PERFORM 1 FROM profiles WHERE id = p_admin_id AND role = 'admin';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Only admins can approve NIN'::TEXT;
    RETURN;
  END IF;

  -- Get current profile data for snapshot
  SELECT nin_number, display_name, business_name, phone_number, mobile_number
  INTO v_nin, v_display_name, v_business_name, v_phone, v_mobile
  FROM pro_profiles WHERE id = p_profile_id;

  IF v_nin IS NULL THEN
    RETURN QUERY SELECT false, 'No NIN on file for this profile'::TEXT;
    RETURN;
  END IF;

  -- Update profile to verified
  UPDATE pro_profiles
  SET nin_verified = true,
      nin_verified_at = now(),
      identity_verified_at = now(),
      verification_status = 'verified'
  WHERE id = p_profile_id;

  -- Approve pending verification requests
  UPDATE pro_verification_requests
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE profile_id = p_profile_id
    AND request_type = 'identity'
    AND status = 'pending';

  -- Log to NIN verification audit log (for future reference / reports)
  INSERT INTO pro_nin_verification_log (
    profile_id, nin_number, verified_by, status,
    display_name_snapshot, business_name_snapshot,
    phone_number_snapshot, mobile_number_snapshot
  ) VALUES (
    p_profile_id, v_nin, p_admin_id, 'approved',
    v_display_name, v_business_name, v_phone, v_mobile
  );

  RETURN QUERY SELECT true, 'NIN verified and logged successfully'::TEXT;
END;
$$;

-- =========================================================
-- 13. RPC: Admin rejects NIN
-- =========================================================
CREATE OR REPLACE FUNCTION admin_reject_nin(
  p_profile_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nin TEXT;
BEGIN
  PERFORM 1 FROM profiles WHERE id = p_admin_id AND role = 'admin';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Only admins can reject NIN'::TEXT;
    RETURN;
  END IF;

  SELECT nin_number INTO v_nin FROM pro_profiles WHERE id = p_profile_id;
  IF v_nin IS NULL THEN
    RETURN QUERY SELECT false, 'No NIN on file'::TEXT;
    RETURN;
  END IF;

  -- Update profile
  UPDATE pro_profiles
  SET nin_verified = false,
      verification_status = 'rejected'
  WHERE id = p_profile_id;

  -- Update verification requests
  UPDATE pro_verification_requests
  SET status = 'rejected',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      admin_notes = p_reason
  WHERE profile_id = p_profile_id
    AND request_type = 'identity'
    AND status = 'pending';

  -- Log rejection
  INSERT INTO pro_nin_verification_log (profile_id, nin_number, verified_by, status, notes)
  VALUES (p_profile_id, v_nin, p_admin_id, 'rejected', p_reason);

  RETURN QUERY SELECT true, 'NIN rejected'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_nin TO authenticated;

-- =========================================================
-- 14. RPC: Admin fetches NIN submissions (for review panel)
-- =========================================================
CREATE OR REPLACE FUNCTION admin_get_nin_submissions(
  p_status TEXT DEFAULT 'pending'
)
RETURNS TABLE (
  profile_id UUID,
  display_name TEXT,
  business_name TEXT,
  slug TEXT,
  nin_number TEXT,
  nin_verified BOOLEAN,
  phone_number TEXT,
  mobile_number TEXT,
  mobile_otp_verified BOOLEAN,
  verification_status TEXT,
  created_at TIMESTAMPTZ,
  category_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pp.id AS profile_id,
    pp.display_name,
    pp.business_name,
    pp.slug,
    pp.nin_number,
    pp.nin_verified,
    pp.phone_number,
    pp.mobile_number,
    pp.mobile_otp_verified,
    pp.verification_status,
    pp.created_at,
    (pc.name) AS category_name
  FROM pro_profiles pp
  LEFT JOIN pro_categories pc ON pp.category_id = pc.id
  WHERE pp.nin_number IS NOT NULL
    AND (
      p_status = 'all' OR
      (p_status = 'pending' AND pp.nin_verified = false AND pp.verification_status IN ('pending', 'unverified')) OR
      (p_status = 'verified' AND pp.nin_verified = true) OR
      (p_status = 'rejected' AND pp.verification_status = 'rejected')
    )
  ORDER BY pp.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_nin_submissions TO authenticated;

-- =========================================================
-- 15. RPC: Get NIN verification history (for report cases)
-- =========================================================
CREATE OR REPLACE FUNCTION admin_get_nin_history(
  p_profile_id UUID
)
RETURNS TABLE (
  id UUID,
  nin_number TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  status TEXT,
  notes TEXT,
  display_name_snapshot TEXT,
  business_name_snapshot TEXT,
  phone_number_snapshot TEXT,
  mobile_number_snapshot TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.nin_number, l.verified_by, l.verified_at, l.status, l.notes,
    l.display_name_snapshot, l.business_name_snapshot,
    l.phone_number_snapshot, l.mobile_number_snapshot
  FROM pro_nin_verification_log l
  WHERE l.profile_id = p_profile_id
  ORDER BY l.verified_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_nin_history TO authenticated;

-- =========================================================
-- 16. Update send_mobile_otp to also trigger SMS via edge function
-- =========================================================
-- Note: The edge function call happens from the client side
-- (after the RPC returns the OTP code) to avoid requiring pg_net
-- extension. The client calls supabase.functions.invoke('send-sms-otp')
-- This keeps the architecture simple and doesn't require DB extensions.

-- =========================================================
-- 17. Worker report table (for reports against workers,
--     references NIN verification log)
-- =========================================================
CREATE TABLE IF NOT EXISTS worker_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES worker_channels(id) ON DELETE SET NULL,
  message_id UUID REFERENCES worker_channel_messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'scam', 'misinformation', 'offensive', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  -- Link to NIN verification data for reference
  nin_verified_at_report_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_reports_reported ON worker_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_worker_reports_status ON worker_reports(status);

ALTER TABLE worker_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports about others
DROP POLICY IF EXISTS "worker_reports_insert_self" ON worker_reports;
CREATE POLICY "worker_reports_insert_self" ON worker_reports FOR INSERT WITH CHECK (
  reporter_id = auth.uid()
);

-- Admins can read and update all reports
DROP POLICY IF EXISTS "worker_reports_admin_read" ON worker_reports;
CREATE POLICY "worker_reports_admin_read" ON worker_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
DROP POLICY IF EXISTS "worker_reports_admin_update" ON worker_reports;
CREATE POLICY "worker_reports_admin_update" ON worker_reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Reporters can see their own reports
DROP POLICY IF EXISTS "worker_reports_self_read" ON worker_reports;
CREATE POLICY "worker_reports_self_read" ON worker_reports FOR SELECT USING (
  reporter_id = auth.uid()
);

GRANT SELECT, INSERT, UPDATE ON worker_reports TO authenticated;
-- =========================================================
-- 18. RPC: Get worker report details with NIN reference
-- =========================================================
CREATE OR REPLACE FUNCTION admin_get_worker_report_details(
  p_report_id UUID
)
RETURNS TABLE (
  report_id UUID,
  reporter_name TEXT,
  reported_user_id UUID,
  reported_name TEXT,
  reason TEXT,
  description TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  nin_number TEXT,
  nin_verified BOOLEAN,
  nin_verified_at TIMESTAMPTZ,
  nin_history JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reported_user UUID;
BEGIN
  PERFORM 1 FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT reported_user_id INTO v_reported_user
  FROM worker_reports WHERE id = p_report_id;
  IF v_reported_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    wr.id AS report_id,
    (rp.display_name) AS reporter_name,
    wr.reported_user_id,
    (wp.display_name) AS reported_name,
    wr.reason,
    wr.description,
    wr.status,
    wr.created_at,
    pp.nin_number,
    pp.nin_verified,
    pp.nin_verified_at,
    (
      SELECT COALESCE(json_agg(row_to_json(l)), '[]'::json)
      FROM (
        SELECT id, nin_number, verified_at, status, notes
        FROM pro_nin_verification_log
        WHERE profile_id = pp.id
        ORDER BY verified_at DESC
      ) l
    ) AS nin_history
  FROM worker_reports wr
  LEFT JOIN pro_profiles rp ON rp.user_id = wr.reporter_id
  LEFT JOIN pro_profiles wp ON wp.user_id = wr.reported_user_id
  LEFT JOIN pro_profiles pp ON pp.user_id = wr.reported_user_id
  WHERE wr.id = p_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_worker_report_details TO authenticated;
