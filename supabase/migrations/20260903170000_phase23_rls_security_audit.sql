-- =========================================================
-- Phase 23: Security Audit — RLS Tightening
-- 2026-09-03
--
-- Findings from audit of 553 policies across all migrations:
--
-- 1. HIGH — weather_cache open INSERT (cache poisoning):
--    "Anyone can insert weather cache" allowed any anon/authenticated
--    client to insert arbitrary forecast data. The SELECT policy serves
--    these rows to ALL users (expires_at > now()), so a malicious client
--    could poison weather intelligence shown to contractors. The client
--    code only READS this table (fetchWeatherInfo in src/lib/contractor.ts);
--    inserts belong to the edge function / service role, which bypasses
--    RLS. Fix: DROP the public INSERT policy.
--
-- 2. HIGH — em_ai_verification_states forged verified rows:
--    "em_ai_verification_user_create" allowed any authenticated user to
--    INSERT rows with state='verified', a fake reviewed_by admin UUID,
--    and arbitrary corrections — poisoning the admin review queue and
--    potentially marking bad measurements as admin-verified. Fix:
--    require new rows to be 'pending' with no review fields set.
--
-- 3. LOW — FORCE ROW LEVEL SECURITY on both tables so the table
--    owner cannot silently bypass policies.
-- =========================================================

-- =========================================================
-- 1. weather_cache — drop public INSERT (cache poisoning)
-- =========================================================
DROP POLICY IF EXISTS "Anyone can insert weather cache" ON public.weather_cache;
DROP POLICY IF EXISTS "weather_cache_public_insert" ON public.weather_cache;

-- Inserts now happen exclusively via service role (bypasses RLS)
-- or a future edge function.

-- =========================================================
-- 2. em_ai_verification_states — tighten public INSERT
-- =========================================================
DROP POLICY IF EXISTS "em_ai_verification_user_create" ON public.em_ai_verification_states;

-- Public can still create verification REQUESTS, but only as
-- fresh pending rows — no forged reviews or states.
CREATE POLICY "em_ai_verification_user_create"
  ON public.em_ai_verification_states FOR INSERT
  TO authenticated
  WITH CHECK (
    state = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND review_notes IS NULL
  );

-- =========================================================
-- 3. FORCE RLS on both tables
-- =========================================================
ALTER TABLE public.weather_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE public.em_ai_verification_states FORCE ROW LEVEL SECURITY;

-- =========================================================
-- 4. HIGH — Restore secure default privileges
--    Phase 21's ALTER DEFAULT PRIVILEGES granted
--    INSERT/UPDATE/DELETE to anon/authenticated on ALL FUTURE
--    tables. Any future migration that forgets ENABLE ROW LEVEL
--    SECURITY would be instantly world-writable. Restore the
--    secure default: new tables get NO implicit privileges —
--    each migration must GRANT explicitly alongside its RLS
--    policies. (Only affects tables created AFTER this
--    migration; existing tables keep their current grants.)
-- =========================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE UPDATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon, authenticated;
