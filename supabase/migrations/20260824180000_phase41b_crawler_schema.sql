-- =========================================================
-- Phase 41b: FRELUX Direct Crawler — Schema Additions
-- =========================================================
-- STRICTLY ADDITIVE. No existing tables are modified destructively.
-- Adds columns to mi_sources for crawler health tracking.
-- Sets up pg_cron scheduled trigger (if available).
-- =========================================================

-- =========================================================
-- 1. ADD CRAWLER COLUMNS TO MI_SOURCES
-- =========================================================
-- These columns track crawl health and scheduling.
-- All are nullable / have defaults — existing rows are unaffected.

DO $$
BEGIN
  -- Next scheduled crawl time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'next_crawl_at'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN next_crawl_at timestamptz;
  END IF;

  -- Crawl status (current)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'crawl_status'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN crawl_status text DEFAULT 'idle'
      CHECK (crawl_status IN ('idle', 'crawling', 'completed', 'failed', 'skipped'));
  END IF;

  -- Target categories (for focused crawling)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'target_categories'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN target_categories text[];
  END IF;

  -- Target keywords (for focused crawling)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'target_keywords'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN target_keywords text[];
  END IF;

  -- Max pages per crawl (source-specific override)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'max_pages_per_crawl'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN max_pages_per_crawl int DEFAULT 10;
  END IF;

  -- Last crawl job ID (for tracking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'last_crawl_job_id'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN last_crawl_job_id text;
  END IF;

  -- Last crawl summary (JSONB for quick display)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mi_sources' AND column_name = 'last_crawl_summary'
  ) THEN
    ALTER TABLE mi_sources ADD COLUMN last_crawl_summary jsonb;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =========================================================
-- 2. UPDATE CRAWL_STATUS INDEX
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_mi_sources_crawl_status
  ON mi_sources(crawl_status, next_crawl_at);

CREATE INDEX IF NOT EXISTS idx_mi_sources_next_crawl
  ON mi_sources(next_crawl_at)
  WHERE next_crawl_at IS NOT NULL;

-- =========================================================
-- 3. PG_CRON SCHEDULED TRIGGER
-- =========================================================
-- If pg_cron is available, set up a scheduled job to trigger
-- the crawl edge function for sources with daily/weekly/monthly frequency.
--
-- The edge function handles the actual scheduling logic internally —
-- it checks which sources are due and crawls them.
--
-- Schedule: every 6 hours (4x daily)
-- The edge function will only crawl sources that are actually due.
-- =========================================================

-- =========================================================
-- 3. PG_CRON SCHEDULED TRIGGER (COMMENTED — REQUIRES MANUAL SETUP)
-- =========================================================
-- To enable scheduled crawling, the administrator must:
-- 1. Enable the pg_cron extension in Supabase dashboard
-- 2. Enable the net (pg_net) extension in Supabase dashboard
-- 3. Set the SUPABASE_ANON_KEY as a secret or use the service_role key
-- 4. Run the following SQL (with a real anon key):
--
-- SELECT cron.schedule(
--   'frelux_crawl_scheduler',
--   '0 */6 * * *',  -- every 6 hours
--   $$
--     SELECT net.http_post(
--       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/market-intelligence-crawl?schedule=true',
--       headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
--       body := '{}'::jsonb
--     );
--   $$
-- );
--
-- Until then, crawling is manual (admin-triggered via the UI).
-- The edge function supports both manual and scheduled modes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is available. Manual SQL setup required to enable scheduled crawling.';
  ELSE
    RAISE NOTICE 'pg_cron not available — scheduled crawling requires manual trigger or external scheduler';
  END IF;
END $$;

-- =========================================================
-- 4. GRANT ACCESS TO NEW COLUMNS
-- =========================================================
-- RLS policies from Phase 41 already cover the new columns.
-- No additional grants needed.

-- =========================================================
-- 5. SEED: UPDATE FRELUX CRAWLER PROVIDER
-- =========================================================
-- Enable the FRELUX Crawler provider (it's free, no API key needed)
-- Keep it disabled initially — admin can enable after testing.
-- This just ensures the provider record is properly configured.

UPDATE mi_providers
SET
  is_enabled = false,  -- stays disabled until admin tests and enables
  description = 'FRELUX-owned direct web crawler. Fetches publicly accessible pages server-side. Free to operate. No external API key required. Respects robots.txt. SSRF-protected.'
WHERE provider_name = 'FRELUX Crawler';
