-- =========================================================
-- ARCHIE WORLD MODEL — OWNER SCOPE
--
-- Adds the owner scope the world model was missing. Every row
-- carries user_id, matching ARCHIE's memory tables
-- (user_id text DEFAULT 'owner'). Existing rows are the owner's
-- facts and are backfilled to 'owner'; no row is deleted or
-- rewritten beyond that stamp.
--
-- Idempotent: safe on a fresh database and on one that already
-- has the table and earlier migrations applied; re-running it
-- changes nothing once applied.
-- =========================================================

-- 1. Add the column nullable first so the backfill can run.
ALTER TABLE public.frelux_archie_world_model
  ADD COLUMN IF NOT EXISTS user_id text;

-- 2. Backfill: pre-existing rows belong to the owner.
UPDATE public.frelux_archie_world_model
   SET user_id = 'owner'
 WHERE user_id IS NULL;

-- 3. Tighten to the final shape for new writes.
ALTER TABLE public.frelux_archie_world_model
  ALTER COLUMN user_id SET DEFAULT 'owner',
  ALTER COLUMN user_id SET NOT NULL;

-- 4. Scoped reads filter on (user_id, subject).
CREATE INDEX IF NOT EXISTS idx_archie_world_model_user_subject
  ON public.frelux_archie_world_model (user_id, subject);
