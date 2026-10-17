-- ============================================================
-- ARCHIE DISTRIBUTED RATE-LIMIT ENGINE (audit gap F-3)
-- Token-bucket table + atomic take RPC, shared by ALL Deno
-- isolates. Until ARCHIE's new database is wired, callers run
-- on the in-memory store (per-isolate honesty preserved); this
-- table makes the distributed store a drop-in when it is.
-- ============================================================

create table if not exists public.archie_rate_limit_buckets (
  bucket_key text primary key,
  tokens double precision not null,
  last_refill_ms bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.archie_rate_limit_buckets enable row level security;
alter table public.archie_rate_limit_buckets force row level security;

-- Service role only: no anon/authenticated policies at all.
revoke all on public.archie_rate_limit_buckets from anon, authenticated;

-- Atomic take-if-affordable. Returns the post-decision balance:
--   >= 0 → allowed (remaining tokens)
--    < 0 → refused (negative deficit)
-- Single UPDATE ... RETURNING = one source of truth for every
-- isolate; no read-modify-write race window.
create or replace function public.archie_rate_limit_take(
  p_key text,
  p_capacity double precision,
  p_refill_per_second double precision,
  p_cost integer,
  p_now_ms bigint
) returns double precision
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tokens double precision;
  v_last bigint;
  v_new_tokens double precision;
begin
  insert into archie_rate_limit_buckets (bucket_key, tokens, last_refill_ms)
  values (p_key, p_capacity, p_now_ms)
  on conflict (bucket_key) do nothing;

  select tokens, last_refill_ms into v_tokens, v_last
  from archie_rate_limit_buckets where bucket_key = p_key for update;

  v_new_tokens := least(p_capacity, v_tokens + greatest(0, (p_now_ms - v_last)) / 1000.0 * p_refill_per_second);

  if v_new_tokens < p_cost then
    update archie_rate_limit_buckets
    set tokens = v_new_tokens, last_refill_ms = p_now_ms, updated_at = now()
    where bucket_key = p_key;
    return -(p_cost - v_new_tokens);
  end if;

  update archie_rate_limit_buckets
  set tokens = v_new_tokens - p_cost, last_refill_ms = p_now_ms, updated_at = now()
  where bucket_key = p_key;
  return v_new_tokens - p_cost;
end;
$$;

revoke all on function public.archie_rate_limit_take from anon, authenticated;
grant execute on function public.archie_rate_limit_take to service_role;

-- TTL hygiene: idle buckets (24h+) drop on a schedule.
create or replace function public.archie_rate_limit_sweep()
returns void
language sql
security definer
set search_path = public
as $$
  delete from archie_rate_limit_buckets
  where last_refill_ms < (extract(epoch from now()) * 1000 - 86400000)::bigint;
$$;

grant execute on function public.archie_rate_limit_sweep to service_role;
