-- =========================================================
-- Phase 42: AI Construction Document Extraction records
--
-- Stores the structured data extracted by the
-- ai-construction-extraction edge function after the user
-- reviews it. This is extraction metadata only — quantities,
-- materials and costs are always computed by the deterministic
-- Build-to-Roof engine, never stored from AI output.
--
-- The original uploaded document stays on the user's device;
-- only file name, kind, and the user-confirmed structured data
-- are persisted (for signed-in users).
-- =========================================================

create table if not exists public.construction_extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  document_kind text not null default 'architectural_plan',
  file_name text,
  -- The reviewed extraction: fields with confidence, verification,
  -- source and the user's accept/edit/reject decisions.
  extraction jsonb not null default '[]'::jsonb,
  applied_fields jsonb not null default '[]'::jsonb,
  applied_at timestamptz
);

-- Row-level security: users see and create only their own records.
alter table public.construction_extractions enable row level security;

DROP POLICY IF EXISTS "users_select_own_extractions" ON public.construction_extractions;

create policy "users_select_own_extractions"
  on public.construction_extractions for select
  to authenticated
  using (created_by = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_extractions" ON public.construction_extractions;

create policy "users_insert_own_extractions"
  on public.construction_extractions for insert
  to authenticated
  with check (created_by = auth.uid());

DROP POLICY IF EXISTS "users_update_own_extractions" ON public.construction_extractions;

create policy "users_update_own_extractions"
  on public.construction_extractions for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Prevent service-role-only accidental anon writes
revoke all on public.construction_extractions from anon;
