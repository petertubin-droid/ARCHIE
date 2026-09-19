// =========================================================
// FRELUX AI FOUNDATION, Scenario Engine
//
// Foundation for scenario comparison, e.g.:
//   Scenario A: 3-bedroom design   vs   Scenario B: 4-bedroom design
//
// EVERY scenario is executed by the SAME registered deterministic
// engine with per-scenario inputs. There is no approximate AI-only
// construction mathematics in this module, it computes only deltas
// between authoritative engine results.
// =========================================================

import type { AiFact, ScenarioComparison, ScenarioDefinition } from './types';
import { executeEngine } from './engines-registry';
import { resolveRequirements, buildEngineInput, TASK_REQUIREMENTS } from './requirements';
import type { CopilotTaskType, FreluxContext } from './types';

function quantityDeltaKey(label: string): string {
  return label.toLowerCase().trim();
}

/**
 * Compare named scenarios for a task. Each scenario runs the registered
 * authoritative engine; deltas are computed against the FIRST scenario.
 *
 * `facts` supply the shared base values (user-stated dimensions etc.);
 * each scenario's `overrides` vary on top of them (e.g. bedrooms →
 * internal_wall_length / openings in a future refinement pass).
 */
export async function compareScenarios(
  taskType: Exclude<CopilotTaskType, 'unsupported'>,
  context: FreluxContext,
  facts: AiFact[],
  scenarios: ScenarioDefinition[],
): Promise<ScenarioComparison> {
  if (scenarios.length < 2) {
    throw new Error('Scenario comparison needs at least two scenarios.');
  }
  const engineId = TASK_REQUIREMENTS[taskType].engineId;

  const results: ScenarioComparison['scenarios'] = [];
  let firstCost: number | null = null;
  let firstQuantities: Map<string, number> | null = null;

  for (const scenario of scenarios) {
    // Merge scenario overrides into the fact set as user-confirmed values.
    const overrideFacts: AiFact[] = Object.entries(scenario.overrides).map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' '),
      value: value as AiFact['value'],
      origin: 'user_input' as const,
      source: 'copilot-scenario',
      confidence: 1,
      trust: 'user_confirmed' as const,
    }));

    const resolution = resolveRequirements(taskType, context, [...facts, ...overrideFacts]);
    if (resolution.missing.length > 0) {
      throw new Error(
        `Scenario "${scenario.name}" is missing: ${resolution.missing.map((f) => f.label).join(', ')}. FRELUX AI will not guess these values.`,
      );
    }

    const input = buildEngineInput(resolution);
    const result = await executeEngine(engineId, input);
    if (!result.ok) {
      throw new Error(`Scenario "${scenario.name}" failed in the authoritative engine: ${result.error ?? 'unknown error'}`);
    }

    const cost = result.costs?.total ?? 0;
    const quantities = new Map(result.quantities.map((q) => [quantityDeltaKey(q.label), q.quantity]));

    if (firstCost === null) {
      firstCost = cost;
      firstQuantities = quantities;
      results.push({ name: scenario.name, result, deltas: { costDelta: 0, costDeltaPercent: 0, quantityDeltas: [] } });
      continue;
    }

    const quantityDeltas = [...quantities.entries()]
      .map(([label, qty]) => {
        const baseQty = firstQuantities?.get(label) ?? 0;
        return { label, quantity: Math.round((qty - baseQty) * 100) / 100, unit: '' };
      })
      .filter((d) => Math.abs(d.quantity) > 0.001);

    results.push({
      name: scenario.name,
      result,
      deltas: {
        costDelta: Math.round((cost - firstCost) * 100) / 100,
        costDeltaPercent: firstCost > 0 ? Math.round(((cost - firstCost) / firstCost) * 1000) / 10 : 0,
        quantityDeltas,
      },
    });
  }

  // Assumptions, honest provenance of every assumed input.
  const resolution = resolveRequirements(taskType, context, facts);
  const assumptions = resolution.assumptions.map(
    (a) => `${a.label}: ${a.value}${a.unit ? ` ${a.unit}` : ''} (FRELUX standard assumption, editable)`,
  );

  // Risks, honest notes only, no invented predictions.
  const risks: string[] = [];
  const costs = results.map((r) => r.result.costs?.total ?? 0);
  const maxCost = Math.max(...costs);
  if (maxCost === 0) risks.push('No cost data was produced, verify inputs before relying on this comparison.');
  results.forEach((r) => {
    if (r.deltas.costDeltaPercent >= 25) {
      risks.push(`"${r.name}" costs ${r.deltas.costDeltaPercent}% more than "${results[0].name}", confirm the difference is intentional.`);
    }
  });
  risks.push('Estimates use standard FRELUX defaults unless you stated otherwise; a quantity surveyor should verify before contract decisions.');

  return { scenarios: results, assumptions, risks, engineId };
}
