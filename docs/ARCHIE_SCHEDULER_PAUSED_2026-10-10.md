# ARCHIE Scheduler — PAUSED (2026-10-10)

## Status

The hourly ARCHIE maintenance cron (`archie-maintenance-hourly`, defined in
`supabase/migrations/20260916040000_archie_scheduler.sql`) is **PAUSED** as of
2026-10-10 to conserve the Gemini API quota. It was the only automated,
around-the-clock consumer: it fired every hour (`5 * * * *`) regardless of
site traffic, running `mode: "all"` (consolidate + reflect).

All other ARCHIE functionality is unaffected — chat, learning, and manual
maintenance calls still work; only the scheduled heartbeat is stopped.

## How to pause (what was done / needs doing)

Run in the ARCHIE Supabase project SQL editor
(dashboard → SQL Editor → project `hqhvlkunkdrxyuvziorm`):

```sql
SELECT cron.unschedule('archie-maintenance-hourly');
```

Verify it is gone:

```sql
SELECT jobid, jobname, schedule FROM cron.job;
```

## How to RE-ACTIVATE when ready

Run the same scheduling block from the migration
(`20260916040000_archie_scheduler.sql`, step 5) — reproduced here for
convenience. It is idempotent: it unschedules any existing version first,
then re-registers the hourly heartbeat. The token is read from
`public.archie_scheduler_tokens` at runtime, so no secret is stored in the
job definition:

```sql
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
  $$
);
```

Confirm it is live again:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

The first run happens at the next hour with minute 5 (e.g. xx:05). Check
recent results with:

```sql
SELECT mode, ok, created_at FROM archie_scheduler_runs
ORDER BY created_at DESC LIMIT 10;
```

## Alternative pause (no SQL editor)

If you cannot reach the SQL editor, the gate can be disabled instead: delete
the row(s) in `public.archie_scheduler_tokens`. Every scheduled call is then
refused with 401 before any work (logged as `gate-stop` in
`archie_scheduler_runs` — one row per hour). Re-insert a token to resume;
the job reads it dynamically, so a freshly generated one works:

```sql
DO $$
DECLARE new_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.archie_scheduler_tokens) THEN
    INSERT INTO public.archie_scheduler_tokens (token)
    VALUES (encode(gen_random_bytes(32), 'hex'));
  END IF;
END $$;
```
