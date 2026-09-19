-- Teaching status (audit fix H-1, 2026-09-11) introduced the
-- 'owner-asserted' status in the engine's Fact type, but the
-- table's CHECK constraint was never widened — every chat-taught
-- fact insert failed the constraint (and the fallback UPDATE
-- matched nothing), so owner teaching silently never persisted.
-- Widen the constraint to match the Fact union. Idempotent
-- (same pattern as 20260915220000_archie_derived_status.sql) so
-- it is safe on databases already patched out-of-band.
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'frelux_archie_native_facts_status_check'
               AND conrelid = 'public.frelux_archie_native_facts'::regclass) THEN
    ALTER TABLE public.frelux_archie_native_facts
      DROP CONSTRAINT frelux_archie_native_facts_status_check;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'frelux_archie_native_facts_status_check'
                   AND conrelid = 'public.frelux_archie_native_facts'::regclass) THEN
    ALTER TABLE public.frelux_archie_native_facts
      ADD CONSTRAINT frelux_archie_native_facts_status_check
      CHECK (status IN ('candidate', 'validated', 'uncertain', 'derived', 'owner-asserted'));
  END IF;
END
$mig$;
