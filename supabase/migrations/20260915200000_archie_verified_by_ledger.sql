-- =========================================================
-- ARCHIE NATIVE ENGINE — VERIFICATION-EVENT LEDGER (M1, audit H1/H2)
-- New column: verified_by text[] — the list of REAL verification
-- events behind a fact (owner-confirm:<ts>, cross-source:<domain>,
-- rule:<id>, owner-taught, seed). Promotion to "validated" now
-- requires at least one verification event — repetition alone
-- (gratitude, re-assertion) can no longer establish knowledge.
-- Additive + idempotent; backfills owner-taught and seed facts
-- (owner authority IS a verification event by design).
-- =========================================================

alter table public.frelux_archie_native_facts
  add column if not exists verified_by text[] not null default '{}';

-- Owner-taught and seed facts already carry owner/first-party
-- authority — that counts as one verification event.
update public.frelux_archie_native_facts
  set verified_by = array[coalesce(provenance->>'source', 'seed')]
  where verified_by = '{}'
    and provenance->>'source' in ('owner-taught', 'seed');
