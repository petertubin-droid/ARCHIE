-- =========================================================
-- Phase 37b: Add FK from marketplace_listings.user_id to profiles.id
-- =========================================================
-- This enables Supabase's auto-detect join: 
--   .select('*, client:profiles!user_id(full_name, avatar_url, marketplace_id)')
-- The existing FK references auth.users(id); we add a complementary FK to profiles(id).

-- Add FK to profiles (profiles.id = auth.users.id, so this is safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ml_user_id_profiles_fk'
  ) THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT ml_user_id_profiles_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =========================================================
-- Also add the increment_view_count RPC (atomic counter)
-- =========================================================
CREATE OR REPLACE FUNCTION public.increment_view_count(listing_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_listings
  SET view_count = view_count + 1
  WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
