-- =========================================================
-- ARCHIE PHASE 8 — DERIVED-VS-TAUGHT KNOWLEDGE SEPARATION
-- The fact store gains the 'derived' status: facts produced
-- by the forward chainer are stored as DERIVED knowledge —
-- they never auto-enter the validated KB (the old >= 0.6
-- confidence shortcut is gone), they are labeled as derived
-- in answers, and when they contradict owner-taught/seed
-- knowledge the DERIVED fact is parked (owner wins).
-- Promotion out of 'derived' still requires the real
-- verification-event gates in the engine.
-- =========================================================

ALTER TABLE public.frelux_archie_native_facts
  DROP CONSTRAINT IF EXISTS frelux_archie_native_facts_status_check;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frelux_archie_native_facts_status_check'
                 AND conrelid = 'public.frelux_archie_native_facts'::regclass) THEN
ALTER TABLE public.frelux_archie_native_facts
  ADD CONSTRAINT frelux_archie_native_facts_status_check
  CHECK (status IN ('candidate', 'validated', 'uncertain', 'derived'));
  END IF;
END
$mig$;

