// =========================================================
// FRELUX AI FOUNDATION, Orchestrator
//
// The single coordinator for every AI capability in FRELUX:
//   conversational AI, document/image extraction, project &
//   property intelligence, scenario analysis and future agents.
//
// It decides when to:
//   - retrieve existing project data          (resolve_context)
//   - request missing information             (request_missing_info)
//   - call a deterministic engine             (run_engine, registry only)
//   - use location intelligence               (region/market resolution)
//   - request user confirmation               (ask_confirmation)
//   - REFUSE an unsupported request           (refuse, never guess)
//
// The deterministic interpretation layer means the Copilot works
// end-to-end with ZERO AI API calls; the optional ai-copilot edge
// function (same schema) only enriches extraction. AI never computes
// construction mathematics, see engines-registry.ts.
// =========================================================

import type {
  AiFact,
  CopilotPlan,
  CopilotTaskType,
  EngineResult,
  FreluxContext,
  InterpretationResult,
  PlanStep,
} from "./types";
import { createFact } from "./trust";
import {
  executeEngine,
  EngineNotRegisteredError,
  getEngineDescriptor,
} from "./engines-registry";
import {
  buildEngineInput,
  engineExistsForTask,
  resolveRequirements,
  TASK_REQUIREMENTS,
} from "./requirements";

// =========================================================
// DETERMINISTIC NATURAL-LANGUAGE INTERPRETATION
// No API call, no invented values, only what the user wrote.
// =========================================================

const DIMENSION_RE =
  /(\d+(?:\.\d+)?)\s*(?:m\b|meters?\b|metres?\b|ft\b|feet\b|')?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i;

export function interpretRequest(
  text: string,
  now = new Date().toISOString(),
): InterpretationResult {
  const facts: AiFact[] = [];
  const lower = text.toLowerCase();

  // ── Task classification (keyword-based, deterministic) ──
  let taskType: CopilotTaskType;
  if (/(tyrolene|tyro)/.test(lower)) taskType = "tyrolene_estimate";
  else if (/\bpop\b|plaster of paris|p\.o\.p/.test(lower))
    taskType = "pop_estimate";
  else if (/tile|tiling|ceramic|porcelain/.test(lower))
    taskType = "tile_estimate";
  else if (/screed|screeding/.test(lower)) taskType = "screeding_estimate";
  else if (
    /paint|painting|emulsion|wall paint/.test(lower) &&
    /need|buy|purchase|bucket|container|litre|liter|how much/.test(lower)
  )
    taskType = "painting_materials";
  else if (/paint|painting|emulsion|wall paint/.test(lower))
    taskType = "painting_estimate";
  else if (
    /(roof|roofing)/.test(lower) &&
    !/(build to roof|whole building|complete building|entire building)/.test(
      lower,
    )
  )
    taskType = "roof_estimate";
  else if (
    /(compare|versus|vs\.?)\b.*\b(bedroom|scenario|design|option)/.test(
      lower,
    ) ||
    /\bscenario\b/.test(lower)
  )
    taskType = "scenario_compare";
  else if (
    /(estimate|cost|material|build|house|home|duplex|bungalow|bedroom)/.test(
      lower,
    )
  )
    taskType = "building_estimate";
  else if (/\?$/.test(text.trim())) taskType = "project_question";
  else taskType = "unsupported";

  // ── Fact extraction: ONLY values the user actually stated ──
  const bedrooms = lower.match(/(\d+)\s*(?:-?\s*)bed(?:room)?s?/);
  if (bedrooms) {
    facts.push(
      createFact({
        key: "bedrooms",
        label: "Bedrooms",
        value: Number(bedrooms[1]),
        unit: "count",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: `Stated in your request: "${bedrooms[0]}"`,
        detectedAt: now,
      }),
    );
  }

  const floors =
    lower.match(/(\d+)\s*(?:-?\s*)store?y(?:s|ed)?\b/) ??
    lower.match(/(\d+)\s*(?:-?\s*)floors?\b/);
  if (floors) {
    facts.push(
      createFact({
        key: "number_of_floors",
        label: "Number of floors",
        value: Number(floors[1]),
        unit: "count",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: `Stated in your request: "${floors[0]}"`,
        detectedAt: now,
      }),
    );
  }

  if (/\b(bungalow|single[- ]storey|one[- ]storey)\b/.test(lower)) {
    facts.push(
      createFact({
        key: "building_type",
        label: "Building type",
        value: "bungalow",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: "Stated in your request",
        detectedAt: now,
      }),
    );
    facts.push(
      createFact({
        key: "number_of_floors",
        label: "Number of floors",
        value: 1,
        unit: "count",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: "Bungalow = single floor",
        detectedAt: now,
      }),
    );
  } else if (
    /\b(duplex|two[- ]storey|2[- ]storey|double[- ]storey)\b/.test(lower)
  ) {
    facts.push(
      createFact({
        key: "building_type",
        label: "Building type",
        value: "duplex",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: "Stated in your request",
        detectedAt: now,
      }),
    );
    facts.push(
      createFact({
        key: "number_of_floors",
        label: "Number of floors",
        value: 2,
        unit: "count",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence: "Duplex = two floors",
        detectedAt: now,
      }),
    );
  }

  const dims = text.match(DIMENSION_RE);
  if (dims) {
    const feet = /ft|feet|'/i.test(dims[0]);
    const toM = (v: string) => (feet ? Number(v) * 0.3048 : Number(v));
    const first = Math.round(toM(dims[1]) * 100) / 100;
    const second = Math.round(toM(dims[2]) * 100) / 100;
    const evidence = `Stated in your request: "${dims[0]}"${feet ? " (converted from ft)" : ""}`;
    // Key names follow the target engine's input schema so stated
    // dimensions resolve without re-asking.
    const dimKeys: Record<string, [string, string]> = {
      building_estimate: ["building_length", "building_width"],
      scenario_compare: ["building_length", "building_width"],
      roof_estimate: ["building_length", "building_width"],
      painting_estimate: ["length", "width"],
      painting_materials: ["length", "width"],
      screeding_estimate: ["length", "width"],
      tile_estimate: ["length", "width"],
      pop_estimate: ["roomLength", "roomWidth"],
      tyrolene_estimate: ["width", "height"],
    };
    const [keyA, keyB] = dimKeys[taskType] ?? [
      "building_length",
      "building_width",
    ];
    facts.push(
      createFact({
        key: keyA,
        label: keyA.replace(/_/g, " "),
        value: first,
        unit: "m",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence,
        detectedAt: now,
      }),
    );
    facts.push(
      createFact({
        key: keyB,
        label: keyB.replace(/_/g, " "),
        value: second,
        unit: "m",
        origin: "user_input",
        source: "copilot-deterministic-parse",
        confidence: 1,
        evidence,
        detectedAt: now,
      }),
    );
  }

  return { taskType, facts, interpretedBy: "deterministic" };
}

// =========================================================
// PLANNING
// =========================================================

export function planTask(
  taskType: CopilotTaskType,
  context: FreluxContext,
  facts: AiFact[],
): CopilotPlan {
  if (taskType === "unsupported") {
    return refusePlan(
      "FRELUX AI can't support that request yet. It will not guess an answer, try asking for a building, roof, painting, screeding, tile or POP estimate.",
    );
  }

  if (taskType === "project_question") {
    const steps: PlanStep[] = [
      {
        kind: "resolve_context",
        detail: "Retrieve your existing project data",
      },
      {
        kind: "present_result",
        detail: context.calculations?.length
          ? "Answer from your saved projects and calculations"
          : "Answer from your project data (none saved yet, offer to start an estimate)",
      },
    ];
    return { taskType, engineId: null, steps };
  }

  if (taskType === "finish_compare") {
    // Config-backed engine (finish materials from DB), future phase.
    return refusePlan(
      "Finish-system comparison needs the finishing-materials configuration, which is not wired into the Copilot yet. Use the Finish System Comparison calculator meanwhile.",
    );
  }

  const spec =
    TASK_REQUIREMENTS[taskType as Exclude<CopilotTaskType, "unsupported">];
  if (
    !spec ||
    !engineExistsForTask(taskType as Exclude<CopilotTaskType, "unsupported">)
  ) {
    return refusePlan(
      "No authoritative FRELUX engine is registered for this request, FRELUX AI will not approximate construction mathematics.",
    );
  }

  const resolution = resolveRequirements(
    taskType as Exclude<CopilotTaskType, "unsupported">,
    context,
    facts,
  );

  const steps: PlanStep[] = [
    {
      kind: "resolve_context",
      detail:
        "Use your existing project, location and saved calculations where reliable",
    },
  ];
  if (resolution.missing.length > 0) {
    steps.push({
      kind: "request_missing_info",
      detail: `Ask for ${resolution.missing.length} missing detail(s), everything else is already resolved`,
      missingFields: resolution.missing,
    });
  }
  steps.push({
    kind: "run_engine",
    detail: `Run the authoritative ${getEngineDescriptor(spec.engineId)?.title ?? spec.engineId}`,
  });
  steps.push({
    kind: "present_result",
    detail:
      resolution.assumptions.length > 0
        ? `Present results with ${resolution.assumptions.length} clearly-labelled assumption(s) and provenance`
        : "Present results with provenance",
  });
  steps.push({
    kind: "ask_confirmation",
    detail: "Ask before saving anything to your project",
  });

  return { taskType, engineId: spec.engineId, steps };
}

function refusePlan(reason: string): CopilotPlan {
  return {
    taskType: "unsupported",
    engineId: null,
    steps: [{ kind: "refuse", detail: reason }],
    reason,
  };
}

// =========================================================
// EXECUTION
// =========================================================

export interface TaskRunOutcome {
  plan: CopilotPlan;
  /** Present when the engine ran. */
  result?: EngineResult;
  /** Engine input actually used, with provenance per field. */
  engineInput?: Record<string, unknown>;
  /** Assumptions in effect, shown to the user. */
  assumptions?: AiFact[];
  /** Facts still needing user confirmation. */
  needsConfirmation?: AiFact[];
  /** Refusal / error message. */
  refusal?: string;
}

export async function runTask(
  taskType: CopilotTaskType,
  context: FreluxContext,
  facts: AiFact[],
  options: { overrides?: Record<string, unknown> } = {},
): Promise<TaskRunOutcome> {
  const plan = planTask(taskType, context, facts);
  if (plan.steps.some((s) => s.kind === "refuse")) {
    return { plan, refusal: plan.reason };
  }
  if (plan.engineId === null) {
    // project_question, answered from context by the caller/UI.
    return { plan };
  }

  const resolution = resolveRequirements(
    taskType as Exclude<CopilotTaskType, "unsupported">,
    context,
    facts,
  );
  if (resolution.missing.length > 0) {
    return {
      plan,
      refusal: `Still missing: ${resolution.missing.map((f) => f.label).join(", ")}. FRELUX AI won't guess these values.`,
    };
  }

  const engineInput = buildEngineInput(resolution, options.overrides ?? {});
  try {
    const result = await executeEngine(plan.engineId, engineInput);
    if (!result.ok) {
      return {
        plan,
        engineInput,
        refusal: `The authoritative engine failed: ${result.error ?? "unknown error"}. No approximate AI substitute is available.`,
      };
    }
    return {
      plan,
      result,
      engineInput,
      assumptions: resolution.assumptions,
      needsConfirmation: resolution.needsConfirmation,
    };
  } catch (error) {
    if (error instanceof EngineNotRegisteredError) {
      return { plan, refusal: error.message };
    }
    return {
      plan,
      refusal:
        "The calculation engine could not run. Your inputs are preserved, please try again.",
    };
  }
}
