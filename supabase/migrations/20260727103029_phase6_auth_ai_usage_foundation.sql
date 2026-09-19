/*
# Phase 6 — Authenticated AI Usage Foundation

This migration prepares the database for authenticated user AI access while
preserving the existing anonymous usage system.

1. Modified Table: `ai_usage_daily`
   Adds an optional `user_id` column so authenticated users' usage can be
   associated with their Supabase Auth user ID. When `user_id` is null,
   the row belongs to an anonymous browser (identified by `client_hash`).

   - `user_id` uuid nullable — links to auth.users when the user is logged in
   - New unique constraint: (user_id, usage_date) so each authenticated
     user has exactly one row per day
   - The existing (client_hash, usage_date) unique constraint is preserved
     for anonymous users

   IMPORTANT: The edge function (server-side, using the service role key)
   is the ONLY code that writes usage rows. RLS is tightened so the anon
     key client can SELECT but can NO LONGER INSERT or UPDATE usage rows.
     This prevents users from manipulating their own usage count from the
     browser to obtain additional AI access.

2. New Table: `user_paid_status`
   Foundation for future paid AI access. Stores payment/premium status per
   authenticated user. NOT activated in this task — no payment provider is
   connected. The table exists so future payment integration can write
   verified payment status here.

   - `user_id` uuid primary key — links to auth.users
   - `is_paid` boolean default false — whether the user has verified paid access
   - `plan` text nullable — future plan name (e.g. 'monthly', 'yearly')
   - `paid_until` timestamptz nullable — when paid access expires
   - `payment_provider` text nullable — future provider identifier
   - `provider_customer_id` text nullable — future provider customer reference
   - `updated_at` timestamptz default now()

3. Security

   ai_usage_daily:
   - SELECT: anon + authenticated can read (needed for usage display)
   - INSERT/UPDATE/DELETE: REMOVED for anon + authenticated.
     Only the service role (edge function) can write usage rows.
     This is the critical security fix: users can no longer reset or
     decrement their own usage count from the browser.

   user_paid_status:
   - SELECT: authenticated users can read their OWN row only.
   - INSERT/UPDATE/DELETE: NOT allowed from the anon key client.
     Only the service role (edge function / admin) can write paid status.
     This ensures payment status is never set by the client.
*/

-- Add user_id to ai_usage_daily
alter table ai_usage_daily
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Unique constraint for authenticated users (one row per user per day)
-- Only applies when user_id is not null
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_usage_daily_user_date_unique'
  ) then
    DROP INDEX IF EXISTS ai_usage_daily_user_date_unique;
      create unique index ai_usage_daily_user_date_unique
      on ai_usage_daily (user_id, usage_date)
      where user_id is not null;
  end if;
end $$;

-- Tighten RLS on ai_usage_daily: remove INSERT and UPDATE for anon/authenticated
-- Only the service role (edge function) can write usage rows now.
drop policy if exists "anon_insert_ai_usage_daily" on ai_usage_daily;
drop policy if exists "anon_update_ai_usage_daily" on ai_usage_daily;

-- Keep SELECT for anon + authenticated (needed to display remaining uses)
drop policy if exists "anon_select_ai_usage_daily" on ai_usage_daily;
create policy "anon_select_ai_usage_daily"
on ai_usage_daily for select
to anon, authenticated
using (true);

-- Create user_paid_status table
create table if not exists user_paid_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_paid boolean not null default false,
  plan text,
  paid_until timestamptz,
  payment_provider text,
  provider_customer_id text,
  updated_at timestamptz not null default now()
);

alter table user_paid_status enable row level security;

-- Authenticated users can read their own paid status only
drop policy if exists "select_own_paid_status" on user_paid_status;
create policy "select_own_paid_status"
on user_paid_status for select
to authenticated
using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for anon/authenticated.
-- Only the service role (edge function / admin) can write paid status.
