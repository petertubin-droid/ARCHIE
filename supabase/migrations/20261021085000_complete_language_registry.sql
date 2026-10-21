-- ============================================================
-- BATCH 41: complete the language registry source of truth.
--
-- The phase-9 seed set (src/lib/archie/language-intelligence.ts
-- ARCHIE_SEED_LANGUAGES) includes the four Nigerian languages
-- pcm, ha, yo, ig, and the multilingual engine composes honest
-- limitation notices in all of them — but the production
-- registry (frelux_archie_languages, the documented source of
-- truth, spec section 4) never received them. The owner's
-- primary market is Nigeria: Yoruba, Igbo, Hausa and Nigerian
-- Pidgin must be selectable/suggestable, not just noticed.
--
-- Idempotent: inserts only missing codes.
-- ============================================================

INSERT INTO public.frelux_archie_languages (code, label, native_label, common_regions, active)
VALUES
  ('pcm', 'Nigerian Pidgin', 'Naija Pidgin', ARRAY['NG'], true),
  ('ha',  'Hausa',           'Hausa',        ARRAY['NG'], true),
  ('yo',  'Yoruba',          'Yorùbá',       ARRAY['NG'], true),
  ('ig',  'Igbo',            'Igbo',         ARRAY['NG'], true)
ON CONFLICT (code) DO NOTHING;

-- Loud self-verification: the four market-critical languages
-- must be present and active after this migration.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(code, ', ')
    INTO missing
    FROM (VALUES ('pcm'), ('ha'), ('yo'), ('ig')) AS wanted(code)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.frelux_archie_languages l
      WHERE l.code = wanted.code AND l.active
    );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH 41 language registry incomplete, missing: %', missing;
  END IF;
END $$;
