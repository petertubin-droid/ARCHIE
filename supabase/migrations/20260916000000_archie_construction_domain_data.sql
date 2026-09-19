-- =========================================================
-- ARCHIE DOMAIN CONSTANTS — construction skill seed data
-- (audit phase 2 completion, 2026-09-11)
--
-- The construction domain skill's constants are SEEDED DATA
-- RECORDS, not code literals. This table is the auditable,
-- admin-visible copy of the in-code deterministic source
-- (supabase/functions/_shared/archie-ai/native-engine/domains/
--  construction.data.ts) — the calculator looks constants up
-- by id; changing a coverage rule or a block spec is a data
-- change, not an engine change.
--
-- Service-role only (same posture as the rest of the ARCHIE
-- cognitive tables): RLS enabled, no anon/authenticated
-- policies.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_domain_constants (
  id text PRIMARY KEY,
  domain text NOT NULL,
  label text NOT NULL,
  value double precision NOT NULL,
  unit text NOT NULL,
  notes text NOT NULL DEFAULT '',
  seeded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_domain_constants
  ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role only.

-- Seed the construction records verbatim from
-- construction.data.ts (CONSTRUCTION_CONSTANT_RECORDS).
INSERT INTO public.frelux_archie_domain_constants
  (id, domain, label, value, unit, notes)
VALUES
  ('ft_to_m', 'construction', 'Feet to meters conversion factor',
   0.3048, 'm per ft', 'Exact international foot definition'),
  ('block_face_m2', 'construction', 'Effective face area of a standard block',
   0.1081, 'm2', '450x225mm block with a 10mm mortar joint (0.46 x 0.235)'),
  ('block_waste_allowance', 'construction', 'Block breakage and waste allowance',
   1.05, 'multiplier', '5% allowance over the theoretical count'),
  ('paint_m2_per_litre_coat', 'construction', 'Paint coverage per litre per coat',
   10, 'm2 per litre per coat', 'Smooth plaster surface only — rough or textured surfaces need more'),
  ('paint_coats_standard', 'construction', 'Standard number of paint coats',
   2, 'coats', 'Standard two-coat application'),
  ('concrete_dry_volume_factor', 'construction', 'Concrete dry volume factor',
   1.54, 'multiplier', 'Dry volume of 1:2:4 concrete relative to wet volume'),
  ('concrete_mix_sum', 'construction', '1:2:4 concrete mix part sum',
   7, 'parts', 'Cement is 1 of 7 parts by volume in a 1:2:4 mix'),
  ('cement_kg_per_m3', 'construction', 'Cement density',
   1440, 'kg per m3', 'Standard loose cement density'),
  ('cement_bag_kg', 'construction', 'Standard cement bag mass',
   50, 'kg per bag', 'Standard bag size'),
  ('cement_waste_allowance', 'construction', 'Cement waste allowance',
   1.05, 'multiplier', '5% allowance over the theoretical requirement')
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label,
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      notes = EXCLUDED.notes,
      updated_at = now();

CREATE INDEX IF NOT EXISTS idx_archie_domain_constants_domain
  ON public.frelux_archie_domain_constants (domain);
