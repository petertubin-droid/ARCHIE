/*
# Phase 5 — AI Access Control, Usage Tracking, and Ad Configuration

1. Modified Table: `site_settings`
   Adds columns for configurable AI access control and ad management:
   - `ai_enabled` boolean default true — global AI on/off
   - `ai_access_mode` text default 'free' — one of: free, rewarded, paid, free_rewarded, disabled
   - `ai_daily_free_uses` integer default 3 — shared daily free AI uses per user
   - `ai_rewarded_enabled` boolean default false — rewarded access availability
   - `ai_paid_enabled` boolean default false — paid access availability (future)
   - `ai_paid_price` numeric default 0 — future paid price placeholder
   - `ai_paid_currency` text default 'NGN' — future paid currency
   - `ai_reset_period` text default 'daily' — usage reset period
   - `ai_admin_override` boolean default true — admins bypass limits
   - `ads_enabled` boolean default false — global ads on/off
   - `adsense_publisher_id` text nullable — real AdSense publisher ID
   - `ad_slots` jsonb default '{}' — map of placement key to slot ID

2. New Table: `ai_usage_daily`
   Tracks daily AI usage per client (anonymous users identified by a
   browser-generated fingerprint hash stored in localStorage). Only
   successful AI generations consume usage.
   - `id` uuid primary key
   - `client_hash` text not null — anonymous browser fingerprint
   - `usage_date` date not null — the calendar day
   - `uses_consumed` integer not null default 0
   - `last_used_at` timestamptz
   - Unique constraint on (client_hash, usage_date)

3. Security
   - RLS enabled on `ai_usage_daily`.
   - INSERT + SELECT + UPDATE for anon + authenticated (the browser and
     edge function both read and write here).
   - No DELETE for anon/authenticated (rows expire naturally).
   - `site_settings` policies unchanged (existing admin-only write,
     public read).

4. Indexes
   - `ai_usage_daily` on (client_hash, usage_date) for fast lookups.
*/

-- Add AI access control columns to site_settings
alter table site_settings
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ai_access_mode text not null default 'free'
    check (ai_access_mode in ('free', 'rewarded', 'paid', 'free_rewarded', 'disabled')),
  add column if not exists ai_daily_free_uses integer not null default 3,
  add column if not exists ai_rewarded_enabled boolean not null default false,
  add column if not exists ai_paid_enabled boolean not null default false,
  add column if not exists ai_paid_price numeric not null default 0,
  add column if not exists ai_paid_currency text not null default 'NGN',
  add column if not exists ai_reset_period text not null default 'daily',
  add column if not exists ai_admin_override boolean not null default true,
  add column if not exists ads_enabled boolean not null default false,
  add column if not exists adsense_publisher_id text,
  add column if not exists ad_slots jsonb not null default '{}'::jsonb;

-- Daily AI usage tracking table
create table if not exists ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null,
  usage_date date not null default current_date,
  uses_consumed integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_hash, usage_date)
);

alter table ai_usage_daily enable row level security;

drop policy if exists "anon_select_ai_usage_daily" on ai_usage_daily;
create policy "anon_select_ai_usage_daily"
on ai_usage_daily for select
to anon, authenticated
using (true);

drop policy if exists "anon_insert_ai_usage_daily" on ai_usage_daily;
create policy "anon_insert_ai_usage_daily"
on ai_usage_daily for insert
to anon, authenticated
with check (true);

drop policy if exists "anon_update_ai_usage_daily" on ai_usage_daily;
create policy "anon_update_ai_usage_daily"
on ai_usage_daily for update
to anon, authenticated
using (true) with check (true);

create index if not exists ai_usage_daily_client_date_idx
on ai_usage_daily (client_hash, usage_date);
