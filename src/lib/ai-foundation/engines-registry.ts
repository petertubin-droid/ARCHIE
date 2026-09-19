// =========================================================
// FRELUX AI FOUNDATION, Authoritative Engine Registry
//
// THE AI → DETERMINISTIC BOUNDARY.
//
// Every engine registered here is an EXISTING, authoritative FRELUX
// calculator. The AI orchestration layer may ONLY obtain quantities,
// geometry, material requirements and costs by calling a registered
// engine with `executeEngine`. There is no other sanctioned path and
// no code path for the AI to compute construction mathematics itself.
//
// Existing engines are reused as-is, their formulas are untouched
// and remain the single source of truth.
// =========================================================

import type {
  EngineCostSummary,
  EngineQuantityLine,
  EngineResult,
} from './types';

export interface EngineDescriptor {
  /** Stable id. The orchestrator/agents reference engines by this id only. */
  id: string;
  domain: string; // building | painting | roofing | finishing | measurement
  title: string;
  /** Authoritative, always true; registered engines are THE truth for their math. */
  authoritative: true;
  /** Human note shown in AI surfaces: who calculated this. */
  creditedAs: string;
  /**
   * Deterministic execution. `input` is validated/normalized by the
   * requirements layer before it reaches the engine; the engine output
   * is normalized to EngineResult (quantities + costs + raw).
   */
  run: (input: unknown) => Promise<EngineResult>;
}

export class EngineNotRegisteredError extends Error {
  constructor(public engineId: string) {
    super(
      `Engine "${engineId}" is not registered. FRELUX AI may only call registered deterministic engines and will not approximate its mathematics.`,
    );
    this.name = 'EngineNotRegisteredError';
  }
}

// =========================================================
// Build-to-Roof input defaults
//
// Mirrors the defaults the existing BuildToRoofEstimator page ships
// (the same smart defaults users already see). Reused, not reinvented.
// Wastage/prices/labour constants come from the engine itself, so the
// engine stays the single source of truth for its own configuration.
// =========================================================

export interface BuildToRoofInputLike {
  project_name: string;
  location: string;
  building_type: string;
  number_of_floors: number;
  measurement_unit: 'm' | 'ft';
  building_length: number;
  building_width: number;
  floor_to_floor_height: number;
  wall_thickness: number;
  internal_wall_length: number;
  internal_wall_thickness: number;
  openings: Array<{ type: string; width: number; height: number; count: number }>;
  foundation_type: string;
  foundation_depth: number;
  foundation_width: number;
  footing_thickness: number;
  blinding_thickness: number;
  hardcore_thickness: number;
  dpc_length: number;
  block_size: string;
  block_length: number;
  block_height: number;
  block_width: number;
  concrete_mix_cement: number;
  concrete_mix_sand: number;
  concrete_mix_granite: number;
  mortar_mix_cement: number;
  mortar_mix_sand: number;
  roof_type: string;
  roof_pitch_degrees: number;
  roof_overhang: number;
  roofing_material: string;
  structural_members: unknown[];
  has_engineer_schedule: boolean;
  contingency_percent: number;
  wastage?: unknown;
  prices?: unknown;
  labour?: unknown;
}

/**
 * Smart defaults, identical to the values the existing estimator page
 * pre-fills. Every value filled from here is labelled as an assumption
 * by the requirements layer (origin: smart_default).
 */
export function defaultBuildToRoofInput(): BuildToRoofInputLike {
  return {
    project_name: 'My building',
    location: '',
    building_type: 'bungalow',
    number_of_floors: 1,
    measurement_unit: 'm',
    building_length: 15,
    building_width: 10,
    floor_to_floor_height: 3,
    wall_thickness: 0.225,
    internal_wall_length: 25,
    internal_wall_thickness: 0.15,
    openings: [
      { type: 'door', width: 0.9, height: 2.1, count: 4 },
      { type: 'window', width: 1.2, height: 1.2, count: 6 },
    ],
    foundation_type: 'strip_footing',
    foundation_depth: 0.9,
    foundation_width: 0.675,
    footing_thickness: 0.225,
    blinding_thickness: 0.075,
    hardcore_thickness: 0.15,
    dpc_length: 50,
    block_size: '9inch',
    block_length: 18,
    block_height: 9,
    block_width: 9,
    concrete_mix_cement: 1,
    concrete_mix_sand: 2,
    concrete_mix_granite: 4,
    mortar_mix_cement: 1,
    mortar_mix_sand: 6,
    roof_type: 'gable',
    roof_pitch_degrees: 25,
    roof_overhang: 0.6,
    roofing_material: 'long-span_aluminium',
    structural_members: [],
    has_engineer_schedule: false,
    contingency_percent: 5,
  };
}

// =========================================================
// Result normalization helpers
// =========================================================


/** Guard: all numeric engine inputs must be finite, else error, never NaN math. */
export function requireFiniteNumbers(values: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(values)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return `Invalid numeric input for "${key}"`;
  }
  return null;
}

export function quantityLine(label: string, quantity: number, unit: string): EngineQuantityLine {
  return { label, quantity, unit };
}

// =========================================================
// THE REGISTRY
// =========================================================

const REGISTRY = new Map<string, EngineDescriptor>();

export function registerEngine(descriptor: EngineDescriptor): void {
  REGISTRY.set(descriptor.id, descriptor);
}

// ── Build-to-Roof: whole-building quantities & costs (existing engine) ──
registerEngine({
  id: 'build_to_roof',
  domain: 'building',
  title: 'FRELUX Build-to-Roof Engine',
  authoritative: true,
  creditedAs: 'Calculated by the authoritative FRELUX Build-to-Roof engine',
  async run(rawInput) {
    const { calculateBuildToRoof, DEFAULT_PRICES, DEFAULT_LABOUR, DEFAULT_WASTAGE } = await import(
      '@/lib/estimation/build-to-roof-engine'
    );
    // Smart defaults; wastage/prices/labour always come from the engine.
    const input = {
      ...defaultBuildToRoofInput(),
      ...(rawInput as Partial<BuildToRoofInputLike>),
      wastage: DEFAULT_WASTAGE,
      labour: DEFAULT_LABOUR,
      prices: DEFAULT_PRICES,
    } as never; // the engine owns the authoritative input type

    const result = calculateBuildToRoof(input);
    const quantities: EngineQuantityLine[] = [];
    const costLines: Array<{ label: string; amount: number }> = [];

    for (const stage of result.stages ?? []) {
      for (const m of stage.materials ?? []) {
        quantities.push(quantityLine(m.label, m.final_quantity, m.unit));
        costLines.push({ label: m.label, amount: m.total_cost });
      }
      const labourCost = stage.labour_total ?? 0;
      if (labourCost > 0) {
        costLines.push({ label: `Labour, ${stage.stage_label}`, amount: labourCost });
      }
    }

    const costs: EngineCostSummary = {
      total: result.grand_total,
      currency: 'NGN',
      lines: costLines,
      // Engine ships price staleness, surface it honestly.
      regionalDataAvailable: !result.price_stale,
    };

    return {
      ok: true,
      engine: 'build_to_roof',
      calculatedAt: new Date().toISOString(),
      quantities,
      costs,
      raw: result,
    };
  },
});

// ── Roof geometry (existing engine function) ──
registerEngine({
  id: 'roof_geometry',
  domain: 'roofing',
  title: 'FRELUX Roof Geometry Engine',
  authoritative: true,
  creditedAs: 'Calculated by the authoritative FRELUX roof geometry functions',
  async run(rawInput) {
    const { calculateRoofArea } = await import('@/lib/estimation/build-to-roof-engine');
    const input = rawInput as {
      building_length: number;
      building_width: number;
      roof_type: string;
      roof_pitch_degrees: number;
      roof_overhang: number;
    };
    const invalidR = requireFiniteNumbers({
      building_length: input.building_length,
      building_width: input.building_width,
      roof_pitch_degrees: input.roof_pitch_degrees,
      roof_overhang: input.roof_overhang,
    });
    if (invalidR) {
      return { ok: false, engine: 'roof_geometry', calculatedAt: new Date().toISOString(), quantities: [], costs: null, raw: null, error: invalidR };
    }
    // Authoritative signature: (length, width, pitch, overhang, roofType)
    const area = calculateRoofArea(
      input.building_length,
      input.building_width,
      input.roof_pitch_degrees,
      input.roof_overhang,
      input.roof_type,
    );
    return {
      ok: true,
      engine: 'roof_geometry',
      calculatedAt: new Date().toISOString(),
      quantities: [quantityLine('Roof area', Number(area), 'm²')],
      costs: null,
      raw: { roofArea: area },
    };
  },
});

// ── Painting wall area (existing engine function) ──
registerEngine({
  id: 'painting_wall_area',
  domain: 'painting',
  title: 'FRELUX Painting Engine, Wall Area',
  authoritative: true,
  creditedAs: 'Calculated by the authoritative FRELUX painting engine',
  async run(rawInput) {
    const { calculateWallArea } = await import('@/lib/estimation/painting-engine');
    const input = rawInput as { length: number; width: number; height: number };
    const invalid = requireFiniteNumbers(input as unknown as Record<string, unknown>);
    if (invalid) {
      return { ok: false, engine: 'painting_wall_area', calculatedAt: new Date().toISOString(), quantities: [], costs: null, raw: null, error: invalid };
    }
    const area = calculateWallArea(input.length, input.width, input.height);
    return {
      ok: true,
      engine: 'painting_wall_area',
      calculatedAt: new Date().toISOString(),
      quantities: [quantityLine('Paintable wall area', Number(area), 'm²')],
      costs: null,
      raw: { wallArea: area },
    };
  },
});

// ── Tyrolene partition area (existing engine function) ──
registerEngine({
  id: 'tyrolene_partition_area',
  domain: 'finishing',
  title: 'FRELUX Tyrolene Engine, Partition Area',
  authoritative: true,
  creditedAs: 'Calculated by the authoritative FRELUX tyrolene engine',
  async run(rawInput) {
    const { calculatePartitionArea } = await import('@/lib/estimation/tyrolene-engine');
    const input = rawInput as { width: number; height: number };
    const invalidT = requireFiniteNumbers(input as unknown as Record<string, unknown>);
    if (invalidT) {
      return { ok: false, engine: 'tyrolene_partition_area', calculatedAt: new Date().toISOString(), quantities: [], costs: null, raw: null, error: invalidT };
    }
    const area = calculatePartitionArea(input.width, input.height);
    return {
      ok: true,
      engine: 'tyrolene_partition_area',
      calculatedAt: new Date().toISOString(),
      quantities: [quantityLine('Tyrolene partition area', Number(area), 'm²')],
      costs: null,
      raw: { partitionArea: area },
    };
  },
});

// =========================================================
// PUBLIC API
// =========================================================

export function listEngines(): EngineDescriptor[] {
  return [...REGISTRY.values()];
}

export function getEngineDescriptor(engineId: string): EngineDescriptor | null {
  return REGISTRY.get(engineId) ?? null;
}

/**
 * The single sanctioned execution path for AI surfaces.
 * Unknown ids throw, the AI never falls back to its own math.
 */
export async function executeEngine(engineId: string, input: unknown): Promise<EngineResult> {
  const descriptor = REGISTRY.get(engineId);
  if (!descriptor) throw new EngineNotRegisteredError(engineId);
  try {
    return await descriptor.run(input);
  } catch (error) {
    return {
      ok: false,
      engine: engineId,
      calculatedAt: new Date().toISOString(),
      quantities: [],
      costs: null,
      raw: null,
      error: error instanceof Error ? error.message : 'Engine execution failed',
    };
  }
}

// Register the Phase-2 engines AFTER the registry map exists.
// (Import alone would hoist above the REGISTRY declaration, TDZ.)
import { registerPhase2Engines } from './engines-phase2';
registerPhase2Engines();
