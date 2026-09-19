-- Auto-promote the first registered user to admin
-- This runs once: finds the earliest created profile and sets role = 'admin'
-- Subsequent users keep the default 'user' role

DO $$
DECLARE
  first_user_id uuid;
BEGIN
  SELECT id INTO first_user_id
  FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'admin',
        updated_at = now()
    WHERE id = first_user_id
      AND role = 'user';

    RAISE NOTICE 'Promoted user % to admin', first_user_id;
  ELSE
    RAISE NOTICE 'No profiles found yet — this migration will need to be re-run after the first user signs up';
  END IF;
END $$;

-- Also create a helper function so you can manually promote users later
-- Usage: SELECT promote_to_admin('someone@example.com');
CREATE OR REPLACE FUNCTION public.promote_to_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'admin',
      updated_at = now()
  WHERE email = user_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found with email: %', user_email;
  END IF;
END;
$$;

-- Grant execute to authenticated users (they can only promote if they can UPDATE profiles, which RLS restricts to admins)
GRANT EXECUTE ON FUNCTION public.promote_to_admin(text) TO authenticated;
