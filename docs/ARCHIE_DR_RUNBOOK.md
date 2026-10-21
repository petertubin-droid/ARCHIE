# ARCHIE Disaster Recovery Runbook (audit gap F-5, batch 40)

Verified recovery procedures for the ARCHIE production stack.
Every procedure below was exercised during the October 2026
forensic remediation, not written from theory.

## Production topology (verified 2026-10-21)

| Component | Location | Notes |
|---|---|---|
| Edge functions (65) | Freluxtools project `hqhvlkunkdrxyuvziorm` | Deployed by GitHub Actions on push |
| PWA | https://archiet.netlify.app | Netlify auto-deploys the repo on push |
| Database | Freluxtools project, schema `public` | Migrations in `supabase/migrations/`, applied MANUALLY (no Supabase Preview integration) |
| Legacy project | `pjvtqkshewerpvggtgqx` | Intentionally stale function bundle; its pg_cron hosts the archie heartbeat until the batch-40 swap |
| Heartbeat | `archie-maintenance-hourly`, cron `5 * * * *`, mode `all` | Gemini-free by construction since batch 40 (guard in `gemini-research.ts`, marker in every run result) |

## R1. Database restore / rebuild

Migrations replay from the repo in filename order. Postgres
ports are blocked in the sandbox; application goes through
the Management API SQL endpoint:

```
POST https://api.supabase.com/v1/projects/{ref}/database/query
Authorization: Bearer $SUPABASE_ACCESS_TOKEN_2
{"query": "<SQL>"}
```

Steps, in order:
1. Apply every migration file in `supabase/migrations/`
   whose version is not in `supabase_migrations.schema_migrations`.
2. Record each applied version:
   `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('...');`
3. Re-apply the grant reconcile:
   `supabase/migrations/20261020054500_repair_standard_role_grants.sql`.
   CRITICAL: Management-API migrations do NOT get the CLI's
   automatic grants; without this step, service_role is
   blind to newly created tables (symptoms: silent null
   lexicon lookups, frelux_status returning -1 counts).
4. Verify: RLS enabled on every public table
   (`SELECT relname FROM pg_class WHERE relrowsecurity = false AND relnamespace = 'public'::regnamespace;`
   must return no user tables), lexicon count reads 87,716
   words / 130,696 senses from archie-status.
5. Scheduler token: `public.archie_scheduler_tokens` must
   contain a row; the cron reads it at runtime.

## R2. Edge function restore

1. Push to `main` (functions deploy automatically on any
   `supabase/functions/**` change; the deploy loop covers
   every function dir except `_shared`; archie-agent-worker
   is JWT-verified by design).
2. Pushes touching `.github/workflows/*` need the
   higher-scope credential (`GITHUB_TOKEN_2`).
3. Verify gates unauthenticated:
   - `ai-copilot` returns 401 (live + self-auth intact)
   - `archie-status` returns 401 (owner gate intact)
   - `archie-chat` returns 400/405 on a bare GET (never 500)

## R3. Cron / heartbeat restore

1. Apply `20261021084500_archie_scheduler_current_project.sql`
   (idempotent: unschedule, then re-register `5 * * * *`).
2. Verify: `SELECT jobname, schedule, active FROM cron.job;`
3. Wait for the next :05 and check
   `SELECT mode, ok, note FROM archie_scheduler_runs ORDER BY created_at DESC LIMIT 3;`
   The note/result must include the marker
   `gemini_research: disabled for maintenance pass (quota-free by construction)`.
4. The legacy copy on `pjvtqkshewerpvggtgqx` (jobid 1) is
   unscheduled after the swap is verified live.

## R4. Secrets

- Registry: `public.archie_secret_registry` (owner-maintained;
  the observe pass raises `A6_SECRET_ROTATION_OVERDUE:{name}`
  alerts past interval).
- After any rotation, update `last_rotated_at` for that row.
- Known deployment-breaking secret: `ARCHIE_AUTHORITY_JWKS_URL`
  (cross-project owner verification). Known quota-bearing
  secret: `GEMINI_API_KEY` (research chain only, never the
  scheduled path).

## R5. Quarterly restore drill

1. Restore the repo at a known tag to a scratch branch.
2. Replay ALL migrations against a fresh Supabase project via
   R1; confirm zero failures (idempotence is part of the
   drill).
3. Deploy functions (R2), run the unauthenticated gate sweep,
   then restore the scratch project or delete it.
4. Record the drill date at the bottom of this file.

## Drill log

- 2026-10-20: full migration replay verified during the
  grants incident recovery (14 back migrations applied live).
- 2026-10-21: heartbeat swap procedure exercised (R3).
