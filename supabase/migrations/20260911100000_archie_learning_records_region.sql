-- =========================================================
-- Converge frelux_learning_records with ARCHIE phase-8 ingestion
-- =========================================================
-- AUDIT FIX (2026-09-09): src/lib/archie/archie-client.ts writes a
-- `region` column on every learning-record insert, but the phase-6.5
-- DDL (20260908090000_phase65_learning_engine.sql) never defined it.
-- Every ARCHIE ingestion insert failed on fresh databases with
-- PGRST204 ("column not found") — the code only worked on prod
-- because the live schema was hand-converged.
--
-- Mirrors the phase-8 convergent pattern used for
-- frelux_knowledge_items.domain/region/knowledge_type
-- (20260908140000_phase8_archie_foundation.sql) so this is a
-- backward-compatible, idempotent no-op on databases that already
-- carry the column.

ALTER TABLE public.frelux_learning_records
  ADD COLUMN IF NOT EXISTS region text;

COMMENT ON COLUMN public.frelux_learning_records.region IS
  'Regional scope of the ARCHIE learning record (convergent with frelux_knowledge_items.region from phase 8).';

CREATE INDEX IF NOT EXISTS idx_learning_records_region
  ON public.frelux_learning_records (region)
  WHERE region IS NOT NULL;
