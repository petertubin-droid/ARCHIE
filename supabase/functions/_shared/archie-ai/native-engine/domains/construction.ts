// supabase/functions/_shared/archie-ai/native-engine/domains/construction.ts
// =========================================================
// CONSTRUCTION DOMAIN SKILL (audit fix 2026-09-11, domain-
// capture removal): the deterministic construction calculator,
// ARCHIE's three construction reasoning rules and the
// construction planning operator — moved VERBATIM out of the
// general engine (engine.ts / reasoning.ts / planning.ts) into
// this pluggable skill. Behavior is identical when the skill is
// registered (it is, by default); the core engine is now
// domain-neutral and future domains register the same way.
// The customer-facing FRELUX room-based paint estimator is a
// separate product surface and is NOT touched by this move.
// =========================================================

import type { Fact, Operator, Rule } from "../types.ts";
import type { NluDomainHints } from "../nlu.ts";
import type { SeedFact } from "../seed-corpus.ts";
import type { DomainSkill, DomainNluRule } from "./registry.ts";
import { constructionConstant } from "./construction.data.ts";

// ── Deterministic helpers (moved from engine.ts) ──

// ── EA-03 (audit 2026-10-17): measurement-aware parsing ──
// Every number the calculator uses is extracted WITH its
// unit and validated BEFORE any arithmetic. The old digit-
// substring scanner silently stripped negative signs, split
// grouped numbers ("1,200" -> 1 and 200) and converted mixed
// units with one request-wide flag ("12 ft x 3 m" applied
// feet to both). This parser refuses all three instead.

export interface ParsedMeasurement {
  value: number;
  /** Unit as stated on the number or inherited from the
   *  request's explicit units, normalized for conversion. */
  unit: "m" | "ft";
  /** True when the unit was stated on the number itself. */
  explicit: boolean;
}

export interface ParseOutcome {
  ok: boolean;
  /** Refusal note when ok is false — honest, never a guess. */
  note?: string;
  measurements?: ParsedMeasurement[];
}

const UNIT_WORD_RE = /^(meters?|metres?|m\b|feet|foot|ft\b|ft\.)/i;
const UNSUPPORTED_UNIT_RE =
  /^(centimeters?|centimetres?|cm\b|millimeters?|millimetres?|mm\b|inches|inch|in\b|yards?|yd\b|kilometers?|kilometres?|km\b|miles?|mi\b)/i;

/** Extract validated measurements from chat text. Refuses
 *  (ok:false, note) anything ambiguous or malformed. */
export function extractMeasurements(input: string): ParseOutcome {
  // locale grouping ("1,200") and European decimal style
  // ("1.200") are ambiguous — refused rather than split/guessed
  if (/\d{1,3}(,\d{3})+/.test(input)) {
    return {
      ok: false,
      note: "grouped thousands (like 1,200) are ambiguous — write plain numbers, e.g. 1200",
    };
  }
  if (/\d\.\d{3}\b/.test(input)) {
    return {
      ok: false,
      note: "ambiguous decimal notation (like 1.200) — write plain numbers, e.g. 1.5 or 1200",
    };
  }

  const matches = [...input.matchAll(/-?\d+(?:\.\d+)?/g)];
  if (matches.length === 0) return { ok: true, measurements: [] };

  interface RawMeasurement {
    value: number;
    explicitUnit: "m" | "ft" | null;
  }
  const raw: RawMeasurement[] = [];
  for (const m of matches) {
    const value = Number(m[0]);
    if (!Number.isFinite(value)) {
      return { ok: false, note: "malformed number — refused" };
    }
    if (value < 0) {
      return {
        ok: false,
        note: "negative dimension refused — a length cannot be negative",
      };
    }
    if (value === 0) {
      return {
        ok: false,
        note: "zero dimension refused — a dimension must be positive",
      };
    }
    const rest = input.slice((m.index ?? 0) + m[0].length);
    if (/^\s*['’]/.test(rest)) {
      raw.push({ value, explicitUnit: "ft" });
      continue;
    }
    const nextWord = rest.match(/^\s*[a-zA-Z]+/);
    const word = nextWord ? nextWord[0].trim() : "";
    if (word && UNIT_WORD_RE.test(word)) {
      const unit = word.startsWith("m") || word.startsWith("M") ? "m" : "ft";
      raw.push({ value, explicitUnit: unit });
      continue;
    }
    if (word && UNSUPPORTED_UNIT_RE.test(word)) {
      return {
        ok: false,
        note: `unsupported unit "${word}" — give me meters or feet only, and I will convert honestly`,
      };
    }
    // bare number (connector word, end of string, or any
    // other word) — unit resolved below
    raw.push({ value, explicitUnit: null });
  }

  // Unit resolution: a bare number inherits from the
  // request's explicit units — but ONLY when every explicit
  // unit agrees. Mixed explicit units plus a bare number is
  // ambiguous, refused rather than guessed.
  const explicitUnits = [
    ...new Set(
      raw
        .filter((r) => r.explicitUnit !== null)
        .map((r) => r.explicitUnit as "m" | "ft"),
    ),
  ];
  if (explicitUnits.length > 1 && raw.some((r) => !r.explicitUnit)) {
    return {
      ok: false,
      note: "mixed units with an unmarked number — mark every number (e.g. 12 ft x 3 m) so no dimension is guessed",
    };
  }
  const inheritUnit: "m" | "ft" = explicitUnits.length === 1 ? explicitUnits[0] : "m";
  const measurements: ParsedMeasurement[] = raw.map((r) => ({
    value: r.value,
    unit: r.explicitUnit ?? inheritUnit,
    explicit: r.explicitUnit !== null,
  }));
  return { ok: true, measurements };
}

/** Numeric unification helper (Phase 2.4): a bound value is
 *  usable when it is a finite number, or a string carrying
 *  one parseable number ("0.05 m" -> 0.05). Anything else is
 *  undefined — the caller refuses rather than guesses. */
function parseNumeric(value: string | number | undefined): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const m = value.match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** Feet→meters per measurement, independently. */
const toMeters = (n: number, unit: "m" | "ft"): number =>
  unit === "ft" ? n * C.ftToM : n;

// ── Constants are SEEDED DATA RECORDS (audit phase 2
//    completion, 2026-09-11): every number the calculator
//    uses is looked up by record id from the seeded set —
//    data changes never touch the calculator's logic, and
//    an unseeded constant fails loudly instead of guessing.
//    Mirrored in DB by migration
//    20260916000000_archie_construction_domain_data.sql
//    (frelux_archie_domain_constants). ──
const C = {
  ftToM: constructionConstant("ft_to_m").value,
  blockFaceM2: constructionConstant("block_face_m2").value,
  blockWaste: constructionConstant("block_waste_allowance").value,
  paintM2PerLitreCoat: constructionConstant("paint_m2_per_litre_coat").value,
  paintCoats: constructionConstant("paint_coats_standard").value,
  dryVolumeFactor: constructionConstant("concrete_dry_volume_factor").value,
  mixSum: constructionConstant("concrete_mix_sum").value,
  cementKgPerM3: constructionConstant("cement_kg_per_m3").value,
  cementBagKg: constructionConstant("cement_bag_kg").value,
  cementWaste: constructionConstant("cement_waste_allowance").value,
};

/** Deterministic construction estimate with honest assumptions.
 *  Returns the fully-composed answer string. (Moved verbatim
 *  from engine.ts — audit 2026-09-11.) */
export function constructionEstimate(input: string): string {
  // EA-03: measurements are parsed WITH units and validated
  // before any arithmetic; ambiguous input is refused.
  const parsed = extractMeasurements(input);
  if (!parsed.ok) {
    return `I will not guess from that request: ${parsed.note}. Give me clean dimensions — for example "how many blocks for a 6 by 3 meter wall" — and I will compute.`;
  }
  const measurements = parsed.measurements ?? [];
  const meters = measurements.map((mm) => toMeters(mm.value, mm.unit));

  const wantsBlocks = /\b(?:blocks?|bricks?)\b/i.test(input);
  const wantsPaint = /\bpaint\b/i.test(input);
  const wantsCement = /\bcement\b/i.test(input) && !wantsBlocks && !wantsPaint;

  if (wantsBlocks) {
    if (measurements.length < 2) {
      return `To estimate blocks I need the wall length and height — for example "how many blocks for a 6 by 3 meter wall". I will not guess dimensions.`;
    }
    if (measurements.length > 2) {
      return `I see ${measurements.length} numbers but a wall needs exactly two dimensions (length and height). I will not pick two and ignore the rest — remove the extra numbers or mark them clearly.`;
    }
    const [l, h] = meters;
    const area = l * h;
    const base = area / C.blockFaceM2;
    const withWaste = Math.ceil(base * C.blockWaste);
    const dims = measurements
      .map((mm, i) => `${mm.value} ${mm.unit}${i < measurements.length - 1 ? " x" : ""}`)
      .join(" ");
    return (
      `For a ${dims} wall (${area.toFixed(2)} m2): approximately ${withWaste} blocks. ` +
      `Assumptions: standard 450x225mm block with 10mm mortar joints (${C.blockFaceM2} m2 face), plus ${Math.round((C.blockWaste - 1) * 100)}% breakage/waste allowance. This is a deterministic estimate — verify on site before ordering.`
    );
  }

  if (wantsPaint) {
    if (measurements.length < 1) {
      return `To estimate paint I need the surface area — for example "how much paint for a 4 by 5 meter wall". I will not guess dimensions.`;
    }
    if (measurements.length > 2) {
      return `I see ${measurements.length} numbers but a surface needs at most two dimensions (width and height). I will not pick two and ignore the rest.`;
    }
    const area = measurements.length >= 2 ? meters[0] * meters[1] : meters[0];
    const litres = Math.ceil((area / C.paintM2PerLitreCoat) * C.paintCoats);
    return (
      `For ${area.toFixed(2)} m2 of surface: approximately ${litres} litres for ${C.paintCoats} coats. ` +
      `Assumptions: smooth plaster at ~${C.paintM2PerLitreCoat} m2 per litre per coat, ${C.paintCoats} coats. Rough or textured surfaces need more — this is a deterministic estimate, not a guess.`
    );
  }

  if (wantsCement) {
    // BATCH 45 (area-as-volume honesty): "estimate cement for a
    // 20 square meter wall" parsed as volume 20 m3 — a wall
    // AREA silently read as a concrete VOLUME, a 100x-class
    // wrong answer. An area unit is refused explicitly; the
    // parser's bare-meter reading of "square meters" must
    // not become a volume.
    if (/\b(?:square|sq\.?|m2|m²|ft2)\b/i.test(input)) {
      return `A surface area is not a concrete volume, and I will not treat one as the other. For cement I need a concrete volume, for example "how many bags of cement for 2 cubic meters". For a wall area I can compute blocks ("how many blocks for a 6 by 3 meter wall") or paint ("how much paint for 20 square meters") instead.`;
    }
    if (measurements.length < 1) {
      return `To estimate cement I need the concrete volume — for example "how many bags of cement for 2 cubic meters of concrete". I will not guess volumes.`;
    }
    if (measurements.length > 1) {
      return `I see ${measurements.length} numbers but a concrete volume needs exactly one. I will not use the first and ignore the rest — give one volume, e.g. "2 cubic meters".`;
    }
    const volume = meters[0];
    const bags = Math.ceil(
      ((volume * C.dryVolumeFactor) / C.mixSum) *
        (C.cementKgPerM3 / C.cementBagKg) *
        C.cementWaste,
    );
    return (
      `For ${volume} cubic meter(s) of concrete: approximately ${bags} x ${C.cementBagKg}kg bags of cement. ` +
      `Assumptions: 1:2:4 mix (dry volume factor ${C.dryVolumeFactor}, cement at ${C.cementKgPerM3} kg/m3), plus ${Math.round((C.cementWaste - 1) * 100)}% waste. This is a deterministic estimate — verify with your engineer for structural work.`
    );
  }

  return `I can calculate three construction estimates deterministically: blocks for a wall ("how many blocks for a 6 by 3 meter wall"), paint for an area ("how much paint for 20 square meters"), and cement bags for a concrete volume ("how many bags of cement for 2 cubic meters"). Give me the numbers and I will compute — never guess.`;
}

// ── Construction reasoning rules (moved verbatim from
//    reasoning.ts DEFAULT_RULES — audit 2026-09-11) ──

export const CONSTRUCTION_RULES: Rule[] = [
  {
    id: "rule_concrete_mix_ratio",
    conditions: [
      { subject: "concrete", predicate: "grade" },
      { subject: "concrete", predicate: "mix-ratio" },
    ],
    produces: {
      subject: "concrete",
      predicate: "characteristic-strength",
      object: "determined by its mix ratio",
    },
    weight: 0.85,
    description: "Concrete grade strength follows from its mix ratio",
  },
  {
    // Phase 2.4 (numeric unification): the object variables
    // ?t/?a bind the premises' numeric (or numeric-string)
    // values, and `compute` derives the REAL screed volume.
    // Deterministic and honest: if either premise carries no
    // parseable number, compute returns undefined and the
    // rule REFUSES to conclude — it never guesses dimensions
    // or units.
    id: "rule_screeding_thickness_area",
    conditions: [
      { subject: "screed", predicate: "thickness", object: "?t" },
      { subject: "floor", predicate: "area", object: "?a" },
    ],
    produces: {
      subject: "screed",
      predicate: "volume",
      object:
        "thickness x floor area (cubic meters when thickness is in m and area in m2)",
    },
    weight: 0.9,
    description: "Screed volume = thickness x area (geometry)",
    compute: (bound) => {
      const t = parseNumeric(bound["?t"]);
      const a = parseNumeric(bound["?a"]);
      if (t === undefined || a === undefined) return undefined;
      const v = t * a;
      return Number.isFinite(v) ? v : undefined;
    },
  },
  {
    id: "rule_cement_bag_standard",
    conditions: [{ subject: "cement", predicate: "bag-mass" }],
    produces: {
      subject: "cement",
      predicate: "bag-volume",
      object: "0.035 m³ (50 kg standard bag)",
    },
    weight: 0.95,
    description: "A 50 kg cement bag has a standard volume of 0.035 m³",
  },
];

// ── Construction planning operator (moved verbatim from
//    planning.ts DEFAULT_OPERATORS — audit 2026-09-11) ──

export const CONSTRUCTION_OPERATORS: Operator[] = [
  {
    id: "op_plan_project_phases",
    description: "Decompose a construction project into phased tasks",
    achieves: { subject: "project", predicate: "planned" },
    preconditions: [{ subject: "project", predicate: "scope-defined" }],
    effects: [],
    cost: 3,
  },
  // Phase 3.2 (audit): $goal-scoped estimate operator. When the
  // request carries detected quantities, the engine asserts
  // {goal: quantities-detected} and this step enters the chain
  // — and it EXECUTES the real deterministic calculator
  // (constructionEstimate) rather than promising an estimate.
  {
    id: "op_estimate_materials",
    description:
      "Run the deterministic construction calculator for the goal's quantities",
    achieves: { subject: "$goal", predicate: "materials-estimated" },
    preconditions: [{ subject: "$goal", predicate: "quantities-detected" }],
    effects: [
      { subject: "$goal", predicate: "inputs-quantified" } as unknown as Fact,
    ],
    cost: 2,
  },
];

// ── Domain-capture completion (2026-09-11 pass 4): the
//    remaining construction knowledge that still lived in the
//    ENGINE CORE — the deterministic construction_calc NLU
//    rule, the construction seed facts, the planner's
//    quantities lexicon and the op_estimate_materials
//    execution — moved here VERBATIM. The engine core files
//    (engine.ts, nlu.ts, seed-corpus.ts) now contain zero
//    construction semantics; everything routes through the
//    DomainSkillRegistry. Behavior when the skill is
//    registered (it is, by default) is identical. ──

// The deterministic construction_calc cascade rule (moved
// verbatim from nlu.ts RULE_CASCADE). Requires BOTH a material
// keyword AND a quantity/dimension cue, so plain price
// questions ("how much is a bag of cement") are served by the
// general price rule and never land here. Phase 3 de-bias: a
// calculation inherently carries a QUANTITY signal (a digit, or
// how many/how much, or cubic/square/area/volume). Bare
// block+wall / paint+room mentions without quantities are
// HOW-TO questions ("steps to build a block wall", "how do i
// paint a room") and are excluded by the how-to guard — they
// must fall to Bayes, not be hijacked by the calc rule.
export const CONSTRUCTION_NLU_RULES: DomainNluRule[] = [
  {
    // BATCH 45 (live-verified routing gap 2026-10-22): "estimate
    // cement for 20 square meter wall" and "calculate screeding
    // materials for a 4 by 5 meter room" fell through to
    // howto_guidance/knowledge_query and got a knowledge dump
    // instead of the calculator. Estimation verbs
    // (estimate/calculate/compute) plus a material plus a number
    // route to the skill; the skill refuses or computes
    // honestly either way. The how-to guidance negative
    // lookahead stays — instructional questions are not
    // calculations.
    intent: "construction_calc",
    pattern:
      /^(?!.*\b(?:how do i|how to|steps to|walk me through|guide me through|best way to|teach me|plan|organize|schedule|remember|remembered|teaching|learn this|note that|keep this|don't forget|do not forget|price|prices|at most|at least|no more than|no less than|less than|more than|between|budget|afford|cost of|costs|wrong|actually|correction)\b)[\s\S]{0,120}?(?:\b(?:blocks?|bricks?)\b[^.?!]*\d|\d[^.?!]*\b(?:blocks?|bricks?)\b|\bhow (?:many|much)\b[^.?!]*\b(?:blocks?|bricks?)\b|\bpaint\b[^.?!]*\d|\d[^.?!]*\bpaint\b|\bhow much paint\b|\bcement\b[^.?!]*\b(?:cubic|volume|m3|concrete)\b|\bcement\b[^.?!]*\d[^.?!]*bags?\b|\d[^.?!]*bags?[^.?!]*\bcement\b|\bhow many (?:bags )?of? ?cement\b|\b(?:estimate|calculate|compute)\b[^.?!]*\b(?:blocks?|bricks?|paint|cement|screed(?:ing)?|plaster(?:ing)?|materials?|quantities)\b[^.?!]*\d|\b(?:screed(?:ing)?|plaster(?:ing)?)\b[^.?!]*\d|\bcement\b[^.?!]*\d)/i,
    confidence: 0.9,
  },
];

/** NLU hints for direct understand() callers (tests route
 *  construction exactly as the wired engine does). */
export const CONSTRUCTION_NLU_HINTS: NluDomainHints = {
  rules: CONSTRUCTION_NLU_RULES,
};

// Construction material seed facts (moved verbatim from
// seed-corpus.ts SEED_FACTS — same corpus constraints: no
// is-a/part-of, no duplicate subject+predicate pairs).
export const CONSTRUCTION_SEED_FACTS: SeedFact[] = [
  {
    subject: "cement",
    predicate: "bag-mass",
    object: "50 kg",
    confidence: 0.95,
  },
  {
    subject: "screeding",
    predicate: "definition",
    object:
      "a thin layer (typically 25–75 mm) of cement-sand mix applied over a structural slab to level, smooth or raise the floor",
    confidence: 0.9,
  },
  {
    subject: "concrete",
    predicate: "curing",
    object:
      "keeping concrete moist and at suitable temperature so hydration continues and strength develops, typically for at least 7 days",
    confidence: 0.9,
  },
  {
    subject: "portland-cement",
    predicate: "definition",
    object:
      "a hydraulic binder made by grinding clinker (calcium silicates) with gypsum; reacts with water and hardens",
    confidence: 0.85,
  },
  {
    subject: "mortar",
    predicate: "definition",
    object:
      "a workable paste of cement, sand and water used to bind masonry units",
    confidence: 0.85,
  },
];

// The planner's construction quantities lexicon (moved
// verbatim from engine.ts — the engine now asks the registry
// whether ANY domain sees quantities; it no longer knows the
// words).
const CONSTRUCTION_QUANTITY_RE =
  /\b(?:block|bricks?|cement|concrete|paint|tiles?|grout|walls?|floors?|roofs?|screed|plaster|met(?:er|re)s?|feet|area|m2|bags?)\b/i;

function constructionQuantifies(input: string): boolean {
  return CONSTRUCTION_QUANTITY_RE.test(input);
}

// The op_estimate_materials execution (moved verbatim from
// engine.ts executePlanSteps — the engine delegates operator
// execution to the owning skill).
function constructionExecuteOperator(
  operatorId: string,
  input: string,
): { status: "executed" | "blocked"; result: string } | null {
  if (operatorId !== "op_estimate_materials") return null;
  const estimate = constructionEstimate(input);
  if (/approximately|bags/i.test(estimate)) {
    return { status: "executed", result: estimate };
  }
  return {
    status: "blocked",
    result: `calculator needs dimensions — ${estimate}`,
  };
}

// ── The skill itself ──

export const constructionSkill: DomainSkill = {
  id: "construction",
  intents: ["construction_calc"],
  rules: CONSTRUCTION_RULES,
  operators: CONSTRUCTION_OPERATORS,
  nluRules: CONSTRUCTION_NLU_RULES,
  seedFacts: CONSTRUCTION_SEED_FACTS,
  quantifies: constructionQuantifies,
  executeOperator: constructionExecuteOperator,
  handler: (intent, input) => {
    if (intent !== "construction_calc") return null;
    return constructionEstimate(input);
  },
};
