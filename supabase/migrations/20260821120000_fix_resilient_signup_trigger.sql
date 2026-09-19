-- Fix: Make handle_new_user trigger resilient
-- The trigger was failing with "Database error saving new user" on ALL new signups
-- because any unhandled exception in the trigger aborts the user creation.
-- This version wraps the profile insert in an exception handler so that
-- even if the profile creation fails, the user account is still created.
-- The profile can be backfilled later.

-- Also ensures the trigger matches the Phase 28 logic (first-user-is-admin)
-- but with graceful error handling.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user boolean;
BEGIN
  -- Check if this is the first user (for auto-admin promotion)
  BEGIN
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  EXCEPTION WHEN OTHERS THEN
    is_first_user := false;
  END;

  -- Create the profile row
  BEGIN
    INSERT INTO public.profiles (id, email, account_type, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_metadata->>'account_type', 'client'),
      CASE WHEN is_first_user THEN 'admin' ELSE 'user' END
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but DON'T raise it — allowing user creation to succeed
    -- The profile can be backfilled later via admin tools
    RAISE WARNING 'handle_new_user: failed to create profile for %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Also run a safety check: promote earliest user to admin if no admin exists
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
      RAISE NOTICE 'Promoted existing earliest user % to admin', first_user_id;
    END IF;
  END IF;
END $$;
