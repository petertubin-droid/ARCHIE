// =========================================================
// FRELUX AI FOUNDATION, Requirements Resolution
//
// "It must not ask unnecessary questions when reliable
//  information already exists."
//
// For each task, required information is resolved in a strict
// priority order, the FIRST source that yields a usable value wins:
//
//   1. Facts the user stated in this request (user_input)
//   2. Values the user confirmed (user_confirmed / corrected)
//   3. Existing project data / saved calculations (project_data,
//      saved_calculation, location_data, market_data)
//   4. Existing FRELUX smart defaults, surfaced as ASSUMPTIONS,
//      never silently hidden
//
// Only when no source yields a value does the field become
// "missing" and the Copilot asks the user.
// =========================================================

import type { AiFact, CopilotTaskType, FreluxContext, RequirementFieldLite } from './types';
import { canUseInCalculation, createFact } from './trust';
import { defaultBuildToRoofInput, getEngineDescriptor } from './engines-registry';
import { normalizeLengthUnit, convertToEngineUnit } from './units';

/** Priority order, lower number wins. */
const ORIGIN_PRIORITY: Record<AiFact['origin'], number> = {
  user_input: 0,
  user_confirmed: 1,
  project_data: 2,
  saved_calculation: 2,
  location_data: 3,
  market_data: 3,
  document_extraction: 4,
  image_extraction: 4,
  ai_interpretation: 5,
  smart_default: 9,
  engine_calculation: 2,
  unknown: 10,
};

/** Required fields per task. Keys match the registered engine input. */
export interface RequirementField extends RequirementFieldLite {
  /** Assumption text shown to the user when a smart default is used. */
  assumption?: string;
}

export const TASK_REQUIREMENTS: Record<Exclude<CopilotTaskType, 'unsupported'>, {
  engineId: string;
  fields: RequirementField[];
}> = {
  building_estimate: {
    engineId: 'build_to_roof',
    fields: [
      { key: 'building_length', label: 'Building length', unit: 'm' },
      { key: 'building_width', label: 'Building width', unit: 'm' },
      { key: 'number_of_floors', label: 'Number of floors', unit: 'count' },
      { key: 'building_type', label: 'Building type' },
      { key: 'location', label: 'Location (town/city)' },
    ],
  },
  roof_estimate: {
    engineId: 'roof_geometry',
    fields: [
      { key: 'building_length', label: 'Building length', unit: 'm' },
      { key: 'building_width', label: 'Building width', unit: 'm' },
      { key: 'roof_type', label: 'Roof type' },
      { key: 'roof_pitch_degrees', label: 'Roof pitch', unit: 'degrees' },
      { key: 'roof_overhang', label: 'Roof overhang', unit: 'm' },
    ],
  },
  painting_estimate: {
    engineId: 'painting_wall_area',
    fields: [
      { key: 'length', label: 'Room length', unit: 'm' },
      { key: 'width', label: 'Room width', unit: 'm' },
      { key: 'height', label: 'Wall height', unit: 'm' },
    ],
  },
  tyrolene_estimate: {
    engineId: 'tyrolene_partition_area',
    fields: [
      { key: 'width', label: 'Partition width', unit: 'm' },
      { key: 'height', label: 'Partition height', unit: 'm' },
    ],
  },
  painting_materials: {
    engineId: 'painting_project',
    fields: [
      { key: 'length', label: 'Room length', unit: 'm' },
      { key: 'width', label: 'Room width', unit: 'm' },
      { key: 'wallHeight', label: 'Wall height', unit: 'm' },
      // Defaultable inputs, resolved from TASK_SMART_DEFAULTS and shown
      // as editable assumptions, never asked unless the user overrides.
      { key: 'doors', label: 'Doors', unit: 'count' },
      { key: 'windows', label: 'Windows', unit: 'count' },
      { key: 'coats', label: 'Coats', unit: 'count' },
      { key: 'wasteMargin', label: 'Waste margin', unit: '%' },
      { key: 'includeCeiling', label: 'Include ceiling' },
    ],
  },
  screeding_estimate: {
    engineId: 'screeding_system',
    fields: [
      { key: 'areaM2', label: 'Screeding area', unit: 'm²' },
      { key: 'systemType', label: 'Screeding system' },
    ],
  },
  tile_estimate: {
    engineId: 'tile_estimate',
    fields: [
      { key: 'surfaceType', label: 'Surface type (floor or wall)' },
      { key: 'length', label: 'Surface length', unit: 'm' },
      { key: 'width', label: 'Surface width', unit: 'm' },
      { key: 'tileWidthMm', label: 'Tile width', unit: 'mm' },
      { key: 'tileHeightMm', label: 'Tile height', unit: 'mm' },
      { key: 'tilesPerBox', label: 'Tiles per box', unit: 'count' },
      { key: 'tilePricePerBox', label: 'Tile price per box' },
      { key: 'method', label: 'Installation method' },
      { key: 'wasteMargin', label: 'Waste margin', unit: '%' },
    ],
  },
  pop_estimate: {
    engineId: 'pop_ceiling',
    fields: [
      { key: 'roomLength', label: 'Room length', unit: 'm' },
      { key: 'roomWidth', label: 'Room width', unit: 'm' },
      { key: 'wasteMargin', label: 'Waste margin', unit: '%' },
      { key: 'includeDecorative', label: 'Include decorative' },
      { key: 'includeOptional', label: 'Include optional items' },
      { key: 'workflow', label: 'Material workflow' },
    ],
  },
  finish_compare: { engineId: 'finish_compare', fields: [] }, // config-backed, future phase
  scenario_compare: { engineId: 'build_to_roof', fields: [] }, // resolved per scenario
  project_question: { engineId: '', fields: [] }, // answered from context, no engine
};

/**
 * Per-task smart defaults. Unlike build_to_roof (whose defaults come from the
 * engine itself), these are surfaced as explicit, editable ASSUMPTIONS :
 * never silently applied.
 */
const TASK_SMART_DEFAULTS: Partial<Record<Exclude<CopilotTaskType, 'unsupported'>, Record<string, {
  value: AiFact['value'];
  unit?: string;
  assumption: string;
  confidence?: number;
}>>> = {
  painting_materials: {
    doors: { value: 1, unit: 'count', assumption: '1 standard door (0.9 × 2.1 m), the FRELUX manual calculator default', confidence: 0.5 },
    windows: { value: 2, unit: 'count', assumption: '2 standard windows (0.9 × 1.2 m), the FRELUX manual calculator default', confidence: 0.5 },
    coats: { value: 2, unit: 'count', assumption: '2 coats, standard for emulsion', confidence: 0.7 },
    wasteMargin: { value: 10, unit: '%', assumption: '10% waste margin, FRELUX standard', confidence: 0.7 },
    includeCeiling: { value: true, assumption: 'Ceiling included in the paint estimate', confidence: 0.6 },
  },
  screeding_estimate: {
    systemType: { value: 'white_cement_paint', assumption: 'White cement + screeding paint system, the common Nigerian screed finish', confidence: 0.6 },
  },
  tile_estimate: {
    method: { value: 'traditional', assumption: 'Traditional cement-and-sand installation method', confidence: 0.6 },
    wasteMargin: { value: 10, unit: '%', assumption: '10% waste margin, FRELUX standard', confidence: 0.7 },
  },
  pop_estimate: {
    wasteMargin: { value: 10, unit: '%', assumption: '10% waste margin, FRELUX standard', confidence: 0.7 },
    includeDecorative: { value: false, assumption: 'Plain POP ceiling (no decorative mouldings)', confidence: 0.7 },
    includeOptional: { value: false, assumption: 'Optional items excluded', confidence: 0.7 },
    workflow: { value: 'nigeria', assumption: 'Nigerian POP material workflow, the only material list currently configured', confidence: 0.8 },
  },
};

export interface RequirementResolution {
  /** Values keyed by engine input field, only from usable facts. */
  resolved: Record<string, AiFact>;
  /** Fields with NO usable value from any source, the only things to ask. */
  missing: RequirementField[];
  /** Smart-default assumptions in effect, shown to the user. */
  assumptions: AiFact[];
  /** Facts awaiting explicit user confirmation before engine use. */
  needsConfirmation: AiFact[];
  engineId: string;
}

function usableFact(fact: AiFact | undefined): AiFact | undefined {
  return fact && canUseInCalculation(fact) ? fact : undefined;
}

/**
 * Resolve the required fields for a task from (in order):
 * user-stated facts → context (project/location/calculations) →
 * smart defaults (assumptions).
 */
export function resolveRequirements(
  taskType: Exclude<CopilotTaskType, 'unsupported'>,
  context: FreluxContext,
  facts: AiFact[],
): RequirementResolution {
  const spec = TASK_REQUIREMENTS[taskType];
  const byKey = new Map<string, AiFact>();
  for (const fact of facts) {
    const usable = usableFact(fact);
    if (!usable) continue;
    const existing = byKey.get(fact.key);
    if (!existing || ORIGIN_PRIORITY[usable.origin] < ORIGIN_PRIORITY[existing.origin]) {
      byKey.set(fact.key, usable);
    }
  }

  // Context-provided values (location intelligence, project data)
  if (context.location?.region || context.location?.city) {
    const locText = [context.location.city, context.location.region, context.location.country]
      .filter(Boolean)
      .join(', ');
    if (locText) {
      byKey.set(
        'location',
        createFact({
          key: 'location',
          label: 'Location',
          value: context.location.city || context.location.region || locText,
          origin: 'location_data',
          source: 'FRELUX-location-intelligence',
          confidence: 1,
          evidence: 'From your project location (Location Intelligence)',
        }),
      );
    }
  }

  const resolved: Record<string, AiFact> = {};
  const missing: RequirementField[] = [];
  const assumptions: AiFact[] = [];
  const needsConfirmation: AiFact[] = [];

  const defaults = defaultBuildToRoofInput() as unknown as Record<string, unknown>;

  for (const field of spec.fields) {
    const fact = usableFact(byKey.get(field.key));
    if (fact) {
      resolved[field.key] = fact;
      if (fact.trust === 'needs_confirmation') needsConfirmation.push(fact);
      continue;
    }
    // Smart default → assumption, clearly labelled, never hidden.
    const defaultValue = spec.engineId === 'build_to_roof' ? defaults[field.key] : undefined;
    const taskDefault = TASK_SMART_DEFAULTS[taskType]?.[field.key];
    if (defaultValue !== undefined || taskDefault !== undefined) {
      const originValue = taskDefault?.value ?? defaultValue;
      const assumptionText = taskDefault?.assumption ?? 'FRELUX standard assumption (editable)';
      const assumptionFact = createFact({
        key: field.key,
        label: field.label,
        value: originValue as AiFact['value'],
        unit: taskDefault?.unit ?? field.unit,
        origin: 'smart_default',
        source: 'FRELUX-smart-defaults',
        confidence: taskDefault?.confidence ?? 0.6,
        evidence: assumptionText,
      });
      resolved[field.key] = assumptionFact;
      assumptions.push(assumptionFact);
      continue;
    }
    // No default exists for this field, the ONLY correct move is to ask.
    missing.push(field);
  }

  return { resolved, missing, assumptions, needsConfirmation, engineId: spec.engineId };
}

/**
 * Engines that accept a `unit` parameter and convert internally per their
 * own established convention (Phase-2 contract point 6). For these, feet
 * are passed THROUGH, the engine converts them itself.
 */
const NATIVE_UNIT_ENGINES = new Set(['painting_project', 'tile_estimate', 'pop_ceiling']);

/** Unit conversions applied at the AI→engine boundary, for provenance. */
export interface EngineInputConversion {
  key: string;
  evidence: string;
}

/**
 * Convert resolved facts into the engine input object (deterministic).
 * - Facts whose unit matches the engine's expectation pass through.
 * - ft facts for metre-only engines are converted HERE with recorded
 *   provenance (never silently).
 * - ft facts for native-unit engines pass through with `unit: 'feet'`
 *   so the engine's own conversion convention applies.
 */
export function buildEngineInput(
  resolution: RequirementResolution,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const native = NATIVE_UNIT_ENGINES.has(resolution.engineId);
  let sawFeet = false;

  for (const [key, fact] of Object.entries(resolution.resolved)) {
    let value = fact.value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const from = normalizeLengthUnit(fact.unit ?? null);
      if (from === 'ft') {
        if (native) {
          sawFeet = true; // engine converts internally, its convention wins
        } else {
          const converted = convertToEngineUnit(value, 'ft', 'm');
          if (converted.converted) value = converted.value;
        }
      }
    }
    input[key] = value;
  }

  if (native) input.unit = sawFeet ? 'feet' : 'meters';
  return { ...input, ...extra };
}

/** Does the engine descriptor for this task actually exist? */
export function engineExistsForTask(taskType: Exclude<CopilotTaskType, 'unsupported'>): boolean {
  const engineId = TASK_REQUIREMENTS[taskType].engineId;
  if (!engineId) return taskType === 'project_question'; // no engine needed
  return getEngineDescriptor(engineId) !== null;
}
