-- =========================================================
-- ARCHIE WORLD MODEL — TEMPORAL AXIS (audit phase 7,
-- 2026-09-11)
--
-- Versioned relations: every observation carries the time it
-- was observed, and contradictions are SUPERSEDED (old row
-- points at its replacement via superseded_by) instead of
-- silently overwritten. Backward compatible:
--   - existing rows are backfilled from created_at (their
--     original observation time is preserved, not reset)
--   - superseded_by defaults to NULL → all existing rows are
--     current; currentView()/hydrate behaviour is unchanged
--     for pre-migration data.
-- Idempotent: safe to re-run (backfill only fills NULLs).
-- =========================================================

-- 1. Add the columns nullable first, so the backfill can
--    distinguish pre-migration rows (NULL) from new ones.
ALTER TABLE public.frelux_archie_world_model
  ADD COLUMN IF NOT EXISTS observed_at timestamptz;

ALTER TABLE public.frelux_archie_world_model
  ADD COLUMN IF NOT EXISTS superseded_by text
    REFERENCES public.frelux_archie_world_model (id);

-- 2. Backfill: the original observation time of an existing
--    row is when it was created — never silently "now".
UPDATE public.frelux_archie_world_model
   SET observed_at = created_at
 WHERE observed_at IS NULL;

-- 3. Tighten to the final shape for new writes.
ALTER TABLE public.frelux_archie_world_model
  ALTER COLUMN observed_at SET DEFAULT now(),
  ALTER COLUMN observed_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_archie_world_model_subject_time
  ON public.frelux_archie_world_model (subject, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_archie_world_model_superseded_by
  ON public.frelux_archie_world_model (superseded_by)
  WHERE superseded_by IS NOT NULL;
