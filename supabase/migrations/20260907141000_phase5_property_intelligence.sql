-- =========================================================
-- FRELUX PHASE 5 — PROPERTY INTELLIGENCE (§2)
--
-- Extends the canonical `properties` table with the remaining
-- Property Profile fields. All columns are nullable: unknown stays
-- unknown — FRELUX never defaults or guesses. No sensitive
-- personal/ownership data is added (§21); ownership information
-- is only ever stored when legitimately supplied by the owner.
--
-- RLS: unchanged — the existing owner-only policies on
-- `properties` (created_by = auth.uid()) govern these columns.
-- =========================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS number_of_rooms integer,
  ADD COLUMN IF NOT EXISTS existing_condition text,
  ADD COLUMN IF NOT EXISTS development_status text;

COMMENT ON COLUMN public.properties.number_of_rooms IS 'Phase 5 §2: rooms where reliably known. NULL = not recorded.';
COMMENT ON COLUMN public.properties.existing_condition IS 'Phase 5 §6: user-observed condition summary. Observable description only — never a certified condition survey.';
COMMENT ON COLUMN public.properties.development_status IS 'Phase 5 §2: development stage of the property (greenfield | existing | developing | redeveloping | unknown).';
