// =========================================================
// CONSTRUCTION DOMAIN — SEEDED CONSTANT RECORDS
// (audit phase 2 completion, 2026-09-11)
//
// The construction skill's constants are DATA RECORDS, not
// code literals: this module is the typed projection of the
// rows seeded by migration
// 20260916000000_archie_construction_domain_data.sql
// (public.frelux_archie_domain_constants). The calculator
// (construction.ts) looks records up BY ID and never inlines
// a raw number — changing a coverage rule or a block spec is
// a data change, not an engine change.
//
// The in-code record set remains the deterministic source the
// calculator reads (it must stay offline-capable and
// reproducible in tests); the DB rows are the auditable,
// admin-visible copy of the same values. The migration seeds
// from this list verbatim.
// =========================================================

export interface DomainConstantRecord {
  /** Stable identifier — the calculator's lookup key. */
  id: string;
  /** Domain this constant belongs to. */
  domain: string;
  /** Human-readable label. */
  label: string;
  /** The value itself. */
  value: number;
  /** Unit of the value. */
  unit: string;
  /** What the value assumes — quoted to the user, never
   *  silently applied. */
  notes: string;
}

export const CONSTRUCTION_CONSTANT_RECORDS: DomainConstantRecord[] = [
  {
    id: "ft_to_m",
    domain: "construction",
    label: "Feet to meters conversion factor",
    value: 0.3048,
    unit: "m per ft",
    notes: "Exact international foot definition",
  },
  {
    id: "block_face_m2",
    domain: "construction",
    label: "Effective face area of a standard block",
    value: 0.1081,
    unit: "m2",
    notes: "450x225mm block with a 10mm mortar joint (0.46 x 0.235)",
  },
  {
    id: "block_waste_allowance",
    domain: "construction",
    label: "Block breakage and waste allowance",
    value: 1.05,
    unit: "multiplier",
    notes: "5% allowance over the theoretical count",
  },
  {
    id: "paint_m2_per_litre_coat",
    domain: "construction",
    label: "Paint coverage per litre per coat",
    value: 10,
    unit: "m2 per litre per coat",
    notes: "Smooth plaster surface only — rough or textured surfaces need more",
  },
  {
    id: "paint_coats_standard",
    domain: "construction",
    label: "Standard number of paint coats",
    value: 2,
    unit: "coats",
    notes: "Standard two-coat application",
  },
  {
    id: "concrete_dry_volume_factor",
    domain: "construction",
    label: "Concrete dry volume factor",
    value: 1.54,
    unit: "multiplier",
    notes: "Dry volume of 1:2:4 concrete relative to wet volume",
  },
  {
    id: "concrete_mix_sum",
    domain: "construction",
    label: "1:2:4 concrete mix part sum",
    value: 7,
    unit: "parts",
    notes: "Cement is 1 of 7 parts by volume in a 1:2:4 mix",
  },
  {
    id: "cement_kg_per_m3",
    domain: "construction",
    label: "Cement density",
    value: 1440,
    unit: "kg per m3",
    notes: "Standard loose cement density",
  },
  {
    id: "cement_bag_kg",
    domain: "construction",
    label: "Standard cement bag mass",
    value: 50,
    unit: "kg per bag",
    notes: "Standard bag size",
  },
  {
    id: "cement_waste_allowance",
    domain: "construction",
    label: "Cement waste allowance",
    value: 1.05,
    unit: "multiplier",
    notes: "5% allowance over the theoretical requirement",
  },
];

/** Deterministic lookup by record id — throws loudly on an
 *  unknown id rather than silently defaulting (an unknown
 *  constant is a data-integrity failure, not a guess). */
export function constructionConstant(id: string): DomainConstantRecord {
  const rec = CONSTRUCTION_CONSTANT_RECORDS.find((r) => r.id === id);
  if (!rec) {
    throw new Error(
      `construction constant '${id}' is not seeded — check frelux_archie_domain_constants`,
    );
  }
  return rec;
}

/** All records — used by the migration generator to seed the
 *  DB verbatim and by tests to assert the DB copy matches. */
export function constructionConstants(): DomainConstantRecord[] {
  return [...CONSTRUCTION_CONSTANT_RECORDS];
}
