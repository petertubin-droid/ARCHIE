-- ============================================================
-- RESUME THE ARCHIE HOURLY HEARTBEAT ON THE CURRENT PROJECT
-- (batch 40, 2026-10-21)
--
-- HISTORY: the heartbeat was paused on 2026-10-10
-- (docs/ARCHIE_SCHEDULER_PAUSED_2026-10-10.md) to conserve
-- the Gemini quota. Two things changed since:
--
-- 1. QUOTA-FREE BY CONSTRUCTION: archie-maintenance now
--    hard-disables the Gemini research adapter for its
--    entire invocation (gemini-research.ts guard, restored
--    in a finally), and every pass it runs — consolidate,
--    reflect, tune, observe, brief — is deterministic DB
--    work with no model call. The result carries the marker
--    "gemini_research: disabled for maintenance pass
--    (quota-free by construction)" as live evidence.
--
-- 2. DRIFT DISCOVERED: the pause only unscheduled this
--    project's copy. The LEGACY project (pjvtqkshewerpvggtgqx)
--    still runs `archie-maintenance-hourly`, POSTing hourly
--    to THIS project's function. This migration moves the
--    heartbeat home so the system owns its own schedule.
--
-- SEQUENCE OF THE LIVE SWAP (2026-10-21):
--   1. Deploy first (the guard must be live).
--   2. Apply this migration (schedule live on hqhvlkunkdrxyuvziorm).
--   3. Unschedule the legacy copy on pjvtqkshewerpvggtgqx
--      via its Management API (recorded in the runbook).
--
-- The job body is the original one: token read at runtime
-- from public.archie_scheduler_tokens (no secret in the job
-- definition), mode "all".
--
-- Idempotent: unschedules any existing version first, then
-- re-registers.
-- ============================================================

SELECT cron.unschedule('archie-maintenance-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archie-maintenance-hourly');

SELECT cron.schedule(
  'archie-maintenance-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hqhvlkunkdrxyuvziorm.supabase.co/functions/v1/archie-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-token', (SELECT token FROM public.archie_scheduler_tokens LIMIT 1)
    ),
    body := jsonb_build_object('mode', 'all')
  );
  $$);
