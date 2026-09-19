/*
# FRELUX PAINT CALC — Phase 2a: Security Hardening

Addresses findings from the Phase 2 security audit:

1. CRITICAL — profiles.role privilege escalation:
   The "profiles_update_own" policy allowed any authenticated user
   to update ALL columns on their own profile, including the `role`
   column. A user could set role = 'admin' and gain full admin access.

   FIX: Tighten the UPDATE policy + add a BEFORE UPDATE trigger that
   prevents non-admin users from changing their role.

2. MEDIUM — ai_usage_daily SELECT exposes all users' data:
   The "anon_select_ai_usage_daily" policy used USING (true), letting
   any client read every user's daily AI usage. Tighten to owner-only.

3. MEDIUM — FORCE ROW LEVEL SECURITY on all public tables:
   Without FORCE RLS, the table owner (postgres) bypasses RLS.

4. LOW — Add DB-level input validation on contact_messages:
   Defense in depth — frontend validation can be bypassed.

5. MEDIUM — user_paid_status: allow admin to view all paid statuses.
*/

-- =========================================================
-- 1. CRITICAL: Prevent privilege escalation on profiles.role
-- =========================================================

-- Drop the old policy that allowed unrestricted self-updates
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Recreate with a restrictive check: user can only update their own row
-- AND the role must not change (unless they are an admin)
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (
  id = auth.uid()
  AND (
    -- The role is unchanged...
    role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    -- ...or the updater is an admin
    OR public.is_admin()
  )
);

-- Second layer of defense: trigger blocks role changes by non-admins
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "profiles_prevent_role_escalation" ON public.profiles;
CREATE TRIGGER "profiles_prevent_role_escalation"
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- =========================================================
-- 2. MEDIUM: Tighten ai_usage_daily SELECT to owner-only
-- =========================================================

DROP POLICY IF EXISTS "anon_select_ai_usage_daily" ON ai_usage_daily;
DROP POLICY IF EXISTS "ai_usage_daily_select_own" ON ai_usage_daily;

CREATE POLICY "ai_usage_daily_select_own"
ON ai_usage_daily FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- =========================================================
-- 3. MEDIUM: user_paid_status — add admin read access
-- =========================================================

DROP POLICY IF EXISTS "select_own_paid_status" ON user_paid_status;
DROP POLICY IF EXISTS "user_paid_status_select_own" ON user_paid_status;

CREATE POLICY "user_paid_status_select_own"
ON user_paid_status FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- =========================================================
-- 4. MEDIUM: FORCE ROW LEVEL SECURITY on all public tables
-- =========================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Also force RLS on non-public-schema tables we created
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'ai_request_log', 'ai_usage_daily', 'user_paid_status',
      'screeding_materials', 'screeding_mix_config',
      'rewarded_tool_config', 'rewarded_unlock_log',
      'rewarded_ad_events', 'advanced_estimates',
      'ai_studio_chat'
    )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- =========================================================
-- 5. LOW: DB-level input validation on contact_messages
-- =========================================================

CREATE OR REPLACE FUNCTION public.validate_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Basic email format check
  IF NEW.email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;
  -- Prevent empty/whitespace-only fields
  IF trim(NEW.name) = '' OR trim(NEW.subject) = '' OR trim(NEW.message) = '' THEN
    RAISE EXCEPTION 'Contact message fields cannot be empty';
  END IF;
  -- Reasonable length limits
  IF length(NEW.message) > 10000 THEN
    RAISE EXCEPTION 'Message too long (max 10000 characters)';
  END IF;
  IF length(NEW.name) > 200 OR length(NEW.subject) > 200 THEN
    RAISE EXCEPTION 'Name or subject too long (max 200 characters)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "contact_messages_validate" ON public.contact_messages;
CREATE TRIGGER "contact_messages_validate"
BEFORE INSERT ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_contact_message();
