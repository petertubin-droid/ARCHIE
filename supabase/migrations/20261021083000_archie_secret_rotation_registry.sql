-- ============================================================
-- SECRETS ROTATION REGISTRY (audit gap F-6, batch 40)
--
-- The observability pass (archie-maintenance mode
-- "observe"/"all") reads this registry and raises
-- A6_SECRET_ROTATION_OVERDUE:{name} alerts for any secret
-- past its rotation interval. The registry is
-- OWNER-MAINTAINED: rows are seeded with the best-known
-- rotation dates as of 2026-10-21 and the owner updates
-- last_rotated_at (and the interval) on every manual
-- rotation. This makes rotation EXPIRY DETECTABLE and
-- reported in the daily metrics snapshot; the rotation
-- itself stays an owner action by design.
--
-- RLS: enabled + forced. No anon/authenticated policies —
-- service role only (edge functions read; the owner writes
-- via the SQL editor or a service-role tool).
-- ============================================================

create table if not exists public.archie_secret_registry (
  secret_name text primary key,
  description text not null default '',
  last_rotated_at timestamptz,
  rotation_interval_days integer,
  updated_at timestamptz not null default now()
);

alter table public.archie_secret_registry enable row level security;
alter table public.archie_secret_registry force row level security;

-- Seed the known production secrets with best-known dates
-- (idempotent: only inserted when absent).
insert into public.archie_secret_registry
  (secret_name, description, last_rotated_at, rotation_interval_days)
values
  ('GEMINI_API_KEY',
   'External Gemini knowledge source (research chain, LAST adapter; never in the reasoning path)',
   '2026-10-18T00:00:00Z', 90),
  ('ARCHIE_AUTHORITY_JWKS_URL',
   'Cross-project owner-identity JWKS verification endpoint',
   '2026-09-13T00:00:00Z', 180),
  ('ARCHIE_SCHEDULER_TOKEN',
   'Scheduler token gating archie-maintenance (table archie_scheduler_tokens)',
   '2026-09-16T00:00:00Z', 90),
  ('MASSIVE_MARKET_DATA_API_KEY',
   'Massive.com daily-aggregate market data (trading + market intelligence)',
   '2026-09-10T00:00:00Z', 90),
  ('BINANCE_API_KEY',
   'Binance venue integration (LIVE account order execution, owner-gated)',
   '2026-10-20T00:00:00Z', 90),
  ('TELEGRAM_BOT_TOKEN',
   'Telegram channel adapter (archie-telegram)',
   '2026-10-18T00:00:00Z', 180),
  ('WHATSAPP_TOKEN',
   'WhatsApp Business API adapter (archie-whatsapp)',
   '2026-10-18T00:00:00Z', 180)
on conflict (secret_name) do nothing;

-- Standard role grants (deploy workflow re-applies the
-- 20261020054500 reconcile block after every migration, but
-- this table must be usable the moment it is created).
GRANT ALL ON public.archie_secret_registry TO postgres;
GRANT ALL ON public.archie_secret_registry TO service_role;
