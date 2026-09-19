-- =========================================================
-- CRITICAL FIX: handle_new_user trigger was broken since Phase 37
-- =========================================================
-- Two bugs prevented ALL new signups (email/password AND Google OAuth)
-- from creating profiles:
--
-- 1. Column name typo: Phase 37 migration (20260822150000) referenced
--    `new.raw_user_metadata` — but the real column on auth.users is
--    `raw_user_meta_data` (underscore before "data"). This threw
--    "record new has no field raw_user_metadata" on every insert.
--
-- 2. gen_random_bytes not found: The function has
--    `SET search_path = public` but `gen_random_bytes` lives in the
--    `extensions` schema, not `public`. This threw
--    "function gen_random_bytes(integer) does not exist".
--
-- Both errors were silently swallowed by the exception handler in the
-- Phase 37b fix, so the user account was created but NO profile row
-- was inserted — meaning users appeared to sign up but had no profile,
-- marketplace_id, or account_type set.
--
-- Earlier (Phase 37) the first bug alone caused "Database error saving
-- new user" on ALL signups because there was no exception handler yet.
--
-- This migration:
--  1. Fixes the column name: raw_user_meta_data (not raw_user_metadata)
--  2. Adds 'extensions' to the search_path so gen_random_bytes resolves
--  3. Keeps the exception handler so a future unrelated failure can
--     never block account creation — the profile can be backfilled.
--  4. Backfills profiles for any auth.users missing one.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_marketplace_id text;
BEGIN
  BEGIN
    -- Generate unique marketplace ID
    new_marketplace_id := 'FRLX-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);

    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE marketplace_id = new_marketplace_id) LOOP
      new_marketplace_id := 'FRLX-' ||
        substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
        substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);
    END LOOP;

    INSERT INTO public.profiles (id, email, role, account_type, marketplace_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'role', 'user'),
      COALESCE(NEW.raw_user_meta_data ->> 'account_type', 'client'),
      new_marketplace_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never let a profile-row issue block user creation.
    RAISE WARNING 'handle_new_user: failed to create profile for %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Backfill: create profile rows for any auth.users that are missing one
-- because of signups that failed silently while these bugs were live.
INSERT INTO public.profiles (id, email, role, account_type, marketplace_id)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'role', 'user'),
  COALESCE(u.raw_user_meta_data ->> 'account_type', 'client'),
  'FRLX-' ||
    substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
    substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
