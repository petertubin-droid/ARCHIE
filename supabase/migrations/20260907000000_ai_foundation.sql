-- =========================================================
-- FRELUX AI FOUNDATION — schema migration
--
-- 1. ai_facts      — durable AI/extracted facts with FULL provenance
--                    (value, unit, source, confidence, trust, evidence,
--                    timestamps). Powers the unified building/property
--                    model: AI-extracted AND manual facts live here.
-- 2. agent_events  — auditable history of agent decisions/actions.
--
-- Row-level security: users can only ever see their own facts and
-- agent events. No service-role shortcut in client code.
-- =========================================================

-- ── ai_facts ──
create table if not exists public.ai_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid, -- optional link to user_projects (no FK — projects may also be local)
  scope text not null default 'project', -- project | property | session
  key text not null,
  label text not null,
  value jsonb not null,
  unit text,
  origin text not null, -- user_input | ai_interpretation | document_extraction | image_extraction | …
  source text not null, -- producing system id
  confidence real not null default 0 check (confidence >= 0 and confidence <= 1),
  trust text not null default 'detected'
    check (trust in ('detected','needs_confirmation','user_confirmed','system_verified','rejected','corrected','unknown','insufficient_evidence')),
  evidence text,
  detected_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_facts_user_project
  on public.ai_facts(user_id, project_id, key);
create index if not exists idx_ai_facts_trust
  on public.ai_facts(user_id, trust);

alter table public.ai_facts enable row level security;

drop policy if exists "Users manage own ai_facts" on public.ai_facts;
create policy "Users manage own ai_facts" on public.ai_facts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── agent_events (auditable agent history) ──
create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  action text not null,
  status text not null check (status in ('proposed','approved','rejected','executed','failed')),
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_events_user_agent
  on public.agent_events(user_id, agent_id, created_at desc);

alter table public.agent_events enable row level security;

drop policy if exists "Users read own agent_events" on public.agent_events;
create policy "Users read own agent_events" on public.agent_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own agent_events" on public.agent_events;
create policy "Users insert own agent_events" on public.agent_events
  for insert
  with check (auth.uid() = user_id);

-- ── Copilot credit feature (basic-AI tier; admin-configurable) ──
insert into public.ai_feature_costs
  (feature_key, feature_name, description, credit_cost, requires_credits, ad_unlock_enabled, ad_unlock_credits, daily_usage_limit, sort_order)
values
  ('ai_copilot', 'FRELUX Copilot', 'AI request interpretation for the Copilot', 5, true, true, 0, 20, 7)
on conflict (feature_key) do nothing;
