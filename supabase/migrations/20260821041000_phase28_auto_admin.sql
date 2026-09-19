-- Phase 28: Permanent auto-admin for the first user
-- Extends handle_new_user() (defined in phase2_foundation, updated in phase26)
-- so that whichever account signs up FIRST is automatically made admin —
-- no manual SQL promotion step ever needed again. Every subsequent
-- signup still defaults to role='user' as before.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user boolean;
BEGIN
  -- True only if no profile rows exist yet (i.e. this is the very first signup)
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, email, account_type, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_metadata->>'account_type', 'client'),
    CASE WHEN is_first_user THEN 'admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Safety net: if you already have a profile (e.g. signed up before this
-- migration ran) and there's no admin yet at all, promote the earliest
-- profile now. Does nothing if an admin already exists.
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
    ELSE
      RAISE NOTICE 'No profiles exist yet — the next person to sign up will automatically become admin';
    END IF;
  END IF;
END $$;
