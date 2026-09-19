-- =========================================================
-- PHASE 7 — ARCHIE KNOWLEDGE SOURCE (config-only cutover)
-- Owner-approved 2026-09-18.
--
-- site_settings.archie_knowledge_source selects where the
-- knowledge engines (lexicon / semantic graph / inference)
-- read for the live turn:
--
--   'A' (default) — this project's knowledge tables: the
--        pre-cutover behavior AND the emergency rollback path.
--   'B'           — the ARCHIE knowledge repository (Project
--        B, server-side only, Edge Function secrets).
--
-- Cutover and rollback are single-row configuration updates —
-- no redeploy, no code change (archie-core fail-safes to 'A'
-- on any error, missing column, or missing repository config).
--
-- This follows the established runtime-config house pattern
-- (site_settings columns, e.g. display_ads_enabled). It is
-- application configuration, NOT knowledge data: the nine
-- knowledge tables are untouched.
-- =========================================================

alter table public.site_settings
  add column if not exists archie_knowledge_source text not null default 'A';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_settings_archie_knowledge_source_check'
      and conrelid = 'public.site_settings'::regclass
  ) then
    alter table public.site_settings
      add constraint site_settings_archie_knowledge_source_check
      check (archie_knowledge_source in ('A', 'B'));
  end if;
end $$;
