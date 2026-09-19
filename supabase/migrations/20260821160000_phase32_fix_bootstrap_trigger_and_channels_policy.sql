-- =========================================================
-- Phase 32: Fix two migration bugs found in production
-- =========================================================
-- Bug 1: prevent_role_escalation() blocked the very first admin
--        bootstrap promotion (phase23/phase28), because it always
--        required public.is_admin() = true. When running raw SQL
--        via the Supabase SQL editor there is no authenticated
--        session, so auth.uid() is NULL and is_admin() is false —
--        even for the legitimate "promote the very first user"
--        case. Fix: allow the role change through when no admin
--        exists yet at all (one-time bootstrap window). Once an
--        admin exists, only admins can change roles, same as before.
--
-- Bug 2: The "worker_channels_read_pro" RLS policy in
--        phase30_worker_channels.sql had a missing parenthesis,
--        so the USING(...) clause closed one token too early and
--        left a dangling "OR EXISTS (...)" outside the clause —
--        a syntax error that rolled back the entire phase30 script
--        (and therefore phase31, which depends on phase30's
--        tables). This migration is idempotent and fixes the
--        policy in-place; the source file has also been corrected
--        so a from-scratch database will not hit this either.
-- =========================================================

-- ---------------------------------------------------------
-- Fix 1: bootstrap-safe role escalation guard
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin()
     AND EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
  THEN
    RAISE EXCEPTION 'Permission denied: only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------
-- Re-run the bootstrap admin promotion now that the trigger
-- allows it. No-op if an admin already exists.
-- ---------------------------------------------------------
DO $$
DECLARE
  first_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    SELECT id INTO first_user_id
    FROM public.profiles
    ORDER BY created_at ASC
    LIMIT 1;

    IF first_user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET role = 'admin', updated_at = now()
      WHERE id = first_user_id;

      RAISE NOTICE 'Promoted earliest user % to admin', first_user_id;
    ELSE
      RAISE NOTICE 'No profiles exist yet — the next person to sign up will automatically become admin';
    END IF;
  ELSE
    RAISE NOTICE 'An admin already exists — no action taken';
  END IF;
END $$;

-- ---------------------------------------------------------
-- Fix 2: repair the broken worker_channels_read_pro policy
-- (safe to run even if worker_channels doesn't exist yet —
-- only applies if the table/policy already exist; otherwise
-- run phase30_worker_channels.sql, which is now fixed at the
-- source, first)
-- ---------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_channels'
  ) THEN
    DROP POLICY IF EXISTS "worker_channels_read_pro" ON worker_channels;

    CREATE POLICY "worker_channels_read_pro" ON worker_channels FOR SELECT USING (
      (is_active = true AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.account_type = 'pro_worker'
      )) OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    );

    RAISE NOTICE 'Repaired worker_channels_read_pro policy';
  ELSE
    RAISE NOTICE 'worker_channels table does not exist yet — run phase30_worker_channels.sql (now fixed) first';
  END IF;
END $$;
