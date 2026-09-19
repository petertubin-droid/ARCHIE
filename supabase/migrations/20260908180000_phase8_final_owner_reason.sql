-- =========================================================
-- FRELUX PHASE 8 FINAL — OWNER APPROVAL RECORD EXTENSION
--
-- The approval gate record must carry the reason/context of
-- the approval (prompt 3). The record is written ONLY by the
-- archie-owner-auth edge function (service role, PBKDF2-
-- verified owner secret) — the reason column is now required
-- for every new authorization.
-- =========================================================

ALTER TABLE public.frelux_owner_authorizations
  ADD COLUMN IF NOT EXISTS reason text;

-- Backfill legacy rows so the constraint below is safe.
UPDATE public.frelux_owner_authorizations
SET reason = 'Legacy authorization record (pre Phase 8 final)'
WHERE reason IS NULL;

ALTER TABLE public.frelux_owner_authorizations
  ALTER COLUMN reason SET NOT NULL;
