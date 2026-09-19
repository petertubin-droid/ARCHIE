// =========================================================
// ARCHIE — FRELUX CALCULATOR INTELLIGENCE
//
// ARCHIE is the intelligent interface and orchestration layer for
// the FRELUX calculator engine. ARCHIE never computes construction
// mathematics itself: it UNDERSTANDS a request, determines which
// authoritative engine applies, identifies missing critical
// inputs, INVOICES the REAL deterministic engine through the
// ai-foundation registry, and EXPLAINS the returned result.
//
// Hard guarantees, enforced by construction:
//   * No duplicate calculation logic — every number in a report
//     is the SAME object the engine returned (reference-identical,
//     never re-derived, reformatted or rounded by ARCHIE).
//   * No invented precision — when critical inputs are missing,
//     the report is "needs_input" and carries NO quantities and
//     NO costs. ARCHIE states what is missing instead.
//   * Verified vs assumed separation — assumptions are the
//     requirements layer's origin-labelled AiFacts (smart_default
//     etc.); configured-vs-default pricing is disclosed from the
//     engine's own flags.
//   * Detection, not silent fixing — open code-intelligence
//     findings affecting an engine's source files are surfaced as
//     report limitations, never patched silently.
//
// Engines remain the calculation authority. ARCHIE is the
// reasoning, reporting and verification layer around them.
// =========================================================

import type {
  AiFact,
  CopilotTaskType,
  EngineCostSummary,
  EngineQuantityLine,
  TaskRunOutcome,
} from "@/lib/ai-foundation";
import { FRELUX_AUDIT_BASELINE, type CodeFinding } from "./code-intelligence";

// ---------------------------------------------------------
// Calculator knowledge base
//
// ARCHIE's persistent understanding of every registered FRELUX
// calculator: what it computes, which inputs it needs, and where
// its authority lives. Methodology summaries describe the
// engine's role; the engine itself remains the single source of
// truth for its formulas — ARCHIE does not restate internal
// formulas it has not verified line-by-line.
// ---------------------------------------------------------

export type EngineBackedTask = Exclude<
  CopilotTaskType,
  "finish_compare" | "scenario_compare" | "project_question" | "unsupported"
>;

export interface CalculatorKnowledgeEntry {
  taskType: EngineBackedTask;
  /** Registry engine id — matches the ai-foundation engine registry. */
  engineId: string;
  title: string;
  /** What the engine actually computes. */
  computes: string;
  /** Critical inputs; the orchestrator refuses to run without them. */
  requiredInputs: Array<{ key: string; label: string; unit?: string }>;
  /** Honest methodology note; the engine owns the full truth. */
  methodology: string;
  /** Where the engine's business values come from. */
  configProvenance: string;
  /** Source files — used to cross-reference code-intelligence findings. */
  sourceFiles: string[];
}

export const ARCHIE_CALCULATOR_KNOWLEDGE: Record<
  EngineBackedTask,
  CalculatorKnowledgeEntry
> = {
  building_estimate: {
    taskType: "building_estimate",
    engineId: "build_to_roof",
    title: "Build-to-Roof Estimator",
    computes:
      "Whole-building material quantities and cost, from foundation through walls to roof.",
    requiredInputs: [
      { key: "building_length", label: "Building length", unit: "m" },
      { key: "building_width", label: "Building width", unit: "m" },
      { key: "number_of_floors", label: "Number of floors", unit: "count" },
      { key: "building_type", label: "Building type" },
      { key: "location", label: "Location (town/city)" },
    ],
    methodology:
      "Deterministic quantity take-off over the building envelope (foundation, blockwork, concrete, roofing) with configurable wastage, prices and labour. The build-to-roof engine owns every formula; ARCHIE reports its output verbatim.",
    configProvenance:
      "Prices, labour and wastage defaults come from the engine's own configuration (DB-configurable). Non-configured values are labelled as assumptions by the requirements layer.",
    sourceFiles: ["src/lib/estimation/build-to-roof-engine.ts"],
  },
  roof_estimate: {
    taskType: "roof_estimate",
    engineId: "roof_geometry",
    title: "Roof Area & Materials",
    computes:
      "Roof geometry (pitch, overhang) and the resulting roof area and materials.",
    requiredInputs: [
      { key: "building_length", label: "Building length", unit: "m" },
      { key: "building_width", label: "Building width", unit: "m" },
      { key: "roof_type", label: "Roof type" },
      { key: "roof_pitch_degrees", label: "Roof pitch", unit: "degrees" },
      { key: "roof_overhang", label: "Roof overhang", unit: "m" },
    ],
    methodology:
      "Roof area is computed from the building footprint, roof type, pitch and overhang by the engine's geometric rules; ARCHIE never approximates roof areas.",
    configProvenance:
      "Roofing rules and prices come from engine configuration; missing values are labelled as assumptions.",
    sourceFiles: ["src/lib/estimation/build-to-roof-engine.ts"],
  },
  painting_estimate: {
    taskType: "painting_estimate",
    engineId: "painting_wall_area",
    title: "Painting Wall Area",
    computes: "Net paintable wall area for a room (openings deducted).",
    requiredInputs: [
      { key: "length", label: "Room length", unit: "m" },
      { key: "width", label: "Room width", unit: "m" },
      { key: "height", label: "Wall height", unit: "m" },
    ],
    methodology:
      "Wall area = perimeter × height minus door/window openings, computed by the painting engine's calculateWallArea; the same geometry the Painting Estimator page uses.",
    configProvenance:
      "Geometry is pure deterministic math from your inputs; no price assumptions are involved in the area result.",
    sourceFiles: ["src/lib/estimation/painting-engine.ts"],
  },
  painting_materials: {
    taskType: "painting_materials",
    engineId: "painting_project",
    title: "Painting Materials & Containers",
    computes:
      "Full painting materials estimate: theoretical litres, containers, waste and cost.",
    requiredInputs: [
      { key: "length", label: "Room length", unit: "m" },
      { key: "width", label: "Room width", unit: "m" },
      { key: "wallHeight", label: "Wall height", unit: "m" },
      { key: "doors", label: "Doors", unit: "count" },
      { key: "windows", label: "Windows", unit: "count" },
      { key: "coats", label: "Coats", unit: "count" },
      { key: "wasteMargin", label: "Waste margin", unit: "%" },
      { key: "includeCeiling", label: "Include ceiling" },
    ],
    methodology:
      "Room-based estimation through the FRELUX painting engine: measured area → configured coverage → theoretical litres → waste and rounding rules → practical purchase quantity → configured unit prices. Coverage, pack size, waste and prices are engine configuration, never ARCHIE guesses.",
    configProvenance:
      "Coverage, pack sizes, wastage and unit prices come from admin-configured estimation data (DB), with engine defaults labelled as assumptions when configuration is absent.",
    sourceFiles: [
      "src/lib/estimation/painting-engine.ts",
      "src/lib/estimation/paint-engine.ts",
      "src/lib/calc.ts",
    ],
  },
  tyrolene_estimate: {
    taskType: "tyrolene_estimate",
    engineId: "tyrolene_partition_area",
    title: "Tyrolene Partition Finishing",
    computes: "Tyrolene/tyrolean finishing area for partitions or walls.",
    requiredInputs: [
      { key: "width", label: "Partition width", unit: "m" },
      { key: "height", label: "Partition height", unit: "m" },
    ],
    methodology:
      "Partition area computed by the tyrolene engine's geometry, then materials from its configured rules.",
    configProvenance:
      "Material rules and prices come from the tyrolene engine's configuration.",
    sourceFiles: ["src/lib/estimation/tyrolene-engine.ts"],
  },
  screeding_estimate: {
    taskType: "screeding_estimate",
    engineId: "screeding_system",
    title: "Screeding System (Putty / White Cement)",
    computes:
      "Screeding system materials and cost for an area, per selected system type and coats.",
    requiredInputs: [
      { key: "areaM2", label: "Screeding area", unit: "m²" },
      { key: "systemType", label: "Screeding system" },
    ],
    methodology:
      "The screeding engine computes material quantities per system type (putty or white-cement-paint), coats and configured mix rates; costs apply configured unit prices.",
    configProvenance:
      "Mix configuration and prices come from the screeding system configuration (DB-configurable); defaults are labelled as assumptions.",
    sourceFiles: ["src/lib/calc.ts"],
  },
  tile_estimate: {
    taskType: "tile_estimate",
    engineId: "tile_estimate",
    title: "Tile Quantities & Cost",
    computes:
      "Tile quantities (with cut/waste allowance) and cost for an area.",
    requiredInputs: [
      { key: "surfaceType", label: "Surface type (floor or wall)" },
      { key: "length", label: "Surface length", unit: "m" },
      { key: "width", label: "Surface width", unit: "m" },
      { key: "tileWidthMm", label: "Tile width", unit: "mm" },
      { key: "tileHeightMm", label: "Tile height", unit: "mm" },
      { key: "tilesPerBox", label: "Tiles per box", unit: "count" },
      { key: "tilePricePerBox", label: "Tile price per box" },
      { key: "method", label: "Installation method" },
      { key: "wasteMargin", label: "Waste margin", unit: "%" },
    ],
    methodology:
      "Tile counts derived from the area, tile dimensions and the engine's waste allowance; costs from configured tile prices.",
    configProvenance: "Tile sizes and prices come from configured tile data.",
    sourceFiles: ["src/lib/pop-tile-calc.ts"],
  },
  pop_estimate: {
    taskType: "pop_estimate",
    engineId: "pop_ceiling",
    title: "POP Ceiling Materials & Cost",
    computes: "POP ceiling materials and cost for a ceiling area.",
    requiredInputs: [
      { key: "roomLength", label: "Room length", unit: "m" },
      { key: "roomWidth", label: "Room width", unit: "m" },
      { key: "wasteMargin", label: "Waste margin", unit: "%" },
      { key: "includeDecorative", label: "Include decorative" },
      { key: "includeOptional", label: "Include optional items" },
      { key: "workflow", label: "Material workflow" },
    ],
    methodology:
      "POP material quantities computed by the POP engine from the area and configured material rates; costs from configured prices.",
    configProvenance:
      "POP material rates and prices come from configured POP data.",
    sourceFiles: ["src/lib/pop-tile-calc.ts"],
  },
};

// ---------------------------------------------------------
// Verification: engine health from the code-intelligence
// baseline. ARCHIE detects problems and surfaces them — it does
// not silently fix production calculation logic (corrections go
// through the owner-authorized change pipeline).
// ---------------------------------------------------------

export interface EngineHealthReport {
  engineId: string;
  /** Findings whose location references one of the engine's source files. */
  openFindings: CodeFinding[];
  /** Human-readable disclosures for the report's limitations section. */
  disclosures: string[];
}

/** Was this finding resolved? */
function isOpen(f: CodeFinding): boolean {
  return f.status === "OPEN" || f.status === "OWNER_REVIEW";
}

/**
 * Cross-reference the engine's source files against the ARCHIE
 * code-intelligence audit baseline. Only findings with real
 * evidence and a matching location are returned.
 */
export function calculatorHealth(
  taskType: EngineBackedTask,
): EngineHealthReport {
  const entry = ARCHIE_CALCULATOR_KNOWLEDGE[taskType];
  const openFindings = FRELUX_AUDIT_BASELINE.filter(
    (f) =>
      isOpen(f) && entry.sourceFiles.some((file) => f.location.includes(file)),
  );
  return {
    engineId: entry.engineId,
    openFindings,
    disclosures: openFindings.map(
      (f) =>
        `Open audit finding on this calculator's code (${f.location}): ${f.evidence}`,
    ),
  };
}

// ---------------------------------------------------------
// The structured ARCHIE calculation report.
//
// Directive format: assumptions, measurements, materials,
// quantities, waste, unit prices, estimated costs, methodology,
// confidence/limitations — with verified/configured data clearly
// separated from assumptions.
// ---------------------------------------------------------

export interface ArchieCalculationReport {
  status: "ok" | "needs_input" | "refused";
  /** The engine that owns the numbers (or would own them). */
  engine: { id: string; title: string };
  /** Inputs actually sent to the engine, labelled. */
  measurements: AiFact[];
  /** Origin-labelled assumptions in effect (smart defaults etc.). */
  assumptions: AiFact[];
  /** Facts needing user confirmation before the result is firm. */
  needsConfirmation: AiFact[];
  /** VERBATIM engine quantities (same references, never recomputed). */
  materials: EngineQuantityLine[];
  /** Waste/wastage lines, split out of the verbatim quantities. */
  waste: EngineQuantityLine[];
  /** VERBATIM engine cost summary. */
  costs: EngineCostSummary | null;
  /** Whether unit prices were verified configuration or defaults. */
  pricingBasis: { configured: boolean; disclosure: string };
  /** Honest methodology note; the engine owns the formulas. */
  methodology: string;
  confidence: {
    level: "high" | "medium" | "low";
    limitations: string[];
  };
  /** What the user still needs to supply (needs_input only). */
  missingInputs: string[];
  /** Refusal reason (refused only). Never a fake number. */
  refusal?: string;
}

const WASTE_LABEL = /wast|waste|contingenc|overhead/i;

/**
 * Generate ARCHIE's structured report from an orchestrator run.
 *
 * Integrity guarantee: `materials`, `waste` and `costs` are the
 * engine's own objects (or slices of them) — ARCHIE never
 * re-derives a number. When the run has no result (missing
 * inputs / refusal), the report carries no quantities and no
 * costs at all: no invented precision.
 */
export function generateArchieCalculationReport(
  outcome: TaskRunOutcome,
): ArchieCalculationReport {
  const knowledge: CalculatorKnowledgeEntry | null = outcome.plan.engineId
    ? (Object.values(ARCHIE_CALCULATOR_KNOWLEDGE).find(
        (k) => k.engineId === outcome.plan.engineId,
      ) ?? null)
    : null;

  const base = {
    engine: {
      id: knowledge?.engineId ?? outcome.plan.engineId ?? "unknown",
      title: knowledge?.title ?? "Authoritative FRELUX engine",
    },
  };

  // No engine result → never invent one.
  if (!outcome.result || !outcome.result.ok) {
    if (outcome.refusal && outcome.refusal.startsWith("Still missing:")) {
      const missing = outcome.refusal
        .replace(/^Still missing:\s*/, "")
        .split(",")
        .map((s) => s.trim().replace(/\.$/, ""))
        .filter(Boolean);
      return {
        status: "needs_input",
        ...base,
        measurements: [],
        assumptions: outcome.assumptions ?? [],
        needsConfirmation: [],
        materials: [],
        waste: [],
        costs: null,
        pricingBasis: {
          configured: false,
          disclosure: "No pricing was used — the engine did not run.",
        },
        methodology:
          knowledge?.methodology ??
          "The authoritative engine will compute the numbers once the missing inputs are provided.",
        confidence: {
          level: "low",
          limitations: [
            "No calculation was performed: ARCHIE does not guess critical inputs.",
          ],
        },
        missingInputs: missing,
      };
    }
    return {
      status: "refused",
      ...base,
      measurements: [],
      assumptions: outcome.assumptions ?? [],
      needsConfirmation: [],
      materials: [],
      waste: [],
      costs: null,
      pricingBasis: {
        configured: false,
        disclosure: "No pricing was used — the engine did not run.",
      },
      methodology:
        knowledge?.methodology ??
        "The authoritative engine owns this calculation.",
      confidence: {
        level: "low",
        limitations: [
          outcome.refusal ?? "The engine did not produce a result.",
        ],
      },
      missingInputs: [],
      refusal: outcome.refusal ?? "No result was produced.",
    };
  }

  // Engine ran — the result IS the report's numbers (reference-identical).
  const result = outcome.result;
  const waste = result.quantities.filter((q) => WASTE_LABEL.test(q.label));
  const materials = result.quantities.filter((q) => !WASTE_LABEL.test(q.label));

  const limitations: string[] = [];
  const configured = result.costs?.regionalDataAvailable ?? false;
  if (result.costs && !configured) {
    limitations.push(
      "Unit prices fell back to engine defaults — no verified regional pricing was available. Treat costs as an estimate and verify current prices.",
    );
  }
  if (outcome.needsConfirmation && outcome.needsConfirmation.length > 0) {
    limitations.push(
      `${outcome.needsConfirmation.length} input(s) still need your confirmation; the result may change when you confirm them.`,
    );
  }
  const health = knowledge ? calculatorHealth(knowledge.taskType) : null;
  if (health) limitations.push(...health.disclosures);

  const assumptionCount = outcome.assumptions?.length ?? 0;
  const level: "high" | "medium" | "low" =
    assumptionCount === 0 && configured
      ? "high"
      : assumptionCount <= 3 && (configured || !result.costs)
        ? "medium"
        : "low";

  return {
    status: "ok",
    ...base,
    measurements: (outcome.assumptions ?? []).concat(
      outcome.needsConfirmation ?? [],
    ),
    assumptions: outcome.assumptions ?? [],
    needsConfirmation: outcome.needsConfirmation ?? [],
    // VERBATIM from the engine — ARCHIE never recomputes these.
    materials,
    waste,
    costs: result.costs ?? null,
    pricingBasis: {
      configured,
      disclosure: configured
        ? "Unit prices come from configured FRELUX data."
        : "Unit prices use engine defaults (not verified configured pricing) — disclosed, not hidden.",
    },
    methodology:
      knowledge?.methodology ?? "Computed by the authoritative FRELUX engine.",
    confidence: { level, limitations },
    missingInputs: [],
  };
}

/**
 * ARCHIE's explanation of a calculator, for chat and reports.
 * Describes what the engine computes and what it needs — never
 * restates unverified internal formulas.
 */
export function explainCalculator(taskType: EngineBackedTask): string {
  const k = ARCHIE_CALCULATOR_KNOWLEDGE[taskType];
  const inputs = k.requiredInputs
    .map((i) => `${i.label}${i.unit ? ` (${i.unit})` : ""}`)
    .join(", ");
  return [
    `${k.title} (engine: ${k.engineId}).`,
    `Computes: ${k.computes}`,
    `Required inputs: ${inputs}.`,
    `Methodology: ${k.methodology}`,
    `Configuration: ${k.configProvenance}`,
  ].join("\n");
}
