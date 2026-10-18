// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — FRELUX BRIDGE
// supabase/functions/_shared/archie-ai/semantic-engine/frelux-bridge.ts
//
// Extracts construction task specifications without fabricating
// coverage rates, formulas, or prices. Maps recognized requests
// to authoritative FRELUX calculation engine IDs.
// =========================================================

import type { SemanticEntity, DownstreamRoutingRecommendation } from "./types.ts";

interface FreluxTaskSpec {
  task: string;
  engineId: string;
  requiredParameters: string[];
  optionalParameters: string[];
}

const FRELUX_TASK_REGISTRY: Record<string, FreluxTaskSpec> = {
  paint: {
    task: "painting",
    engineId: "painting_materials",
    requiredParameters: ["length", "width", "height"],
    optionalParameters: ["coats", "doors", "windows", "paintType", "wasteMargin"],
  },
  painting: {
    task: "painting",
    engineId: "painting_materials",
    requiredParameters: ["length", "width", "height"],
    optionalParameters: ["coats", "doors", "windows", "paintType", "wasteMargin"],
  },
  screed: {
    task: "floor_screeding",
    engineId: "floor_screed_materials",
    requiredParameters: ["length", "width", "thickness"],
    optionalParameters: ["mixRatio", "wasteMargin"],
  },
  tiles: {
    task: "tiling",
    engineId: "floor_tile_materials",
    requiredParameters: ["length", "width"],
    optionalParameters: ["tileSize", "wasteMargin"],
  },
  sandcrete: {
    task: "masonry_blockwork",
    engineId: "blockwork_masonry",
    requiredParameters: ["wallLength", "wallHeight", "thickness"],
    optionalParameters: ["mortarRatio", "openingsArea", "wasteMargin"],
  },
};

export function bridgeFreluxCalculation(
  text: string,
  entities: SemanticEntity[]
): DownstreamRoutingRecommendation {
  const lower = text.toLowerCase();
  let matchedTask: FreluxTaskSpec | undefined;

  for (const [key, spec] of Object.entries(FRELUX_TASK_REGISTRY)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(text)) {
      matchedTask = spec;
      break;
    }
  }

  if (!matchedTask) {
    return {
      recommendedModule: "REASONING_LOOP",
      requiredParametersProvided: true,
      missingParameters: [],
    };
  }

  // Check extracted entities for required parameters
  const providedParams = new Set<string>();
  const payload: Record<string, unknown> = {};

  for (const ent of entities) {
    if (ent.category === "DIMENSION") {
      const dimType = ent.normalizedValue.dimensionType || ent.attributes.dimensionType;
      if (dimType === "length" && ent.normalizedValue.amount) {
        providedParams.add("length");
        payload.length = ent.normalizedValue.amount;
      } else if (dimType === "width" && ent.normalizedValue.amount) {
        providedParams.add("width");
        payload.width = ent.normalizedValue.amount;
      } else if (dimType === "height" && ent.normalizedValue.amount) {
        providedParams.add("height");
        payload.height = ent.normalizedValue.amount;
      } else if (dimType === "thickness" && ent.normalizedValue.amount) {
        providedParams.add("thickness");
        payload.thickness = ent.normalizedValue.amount;
      } else if (ent.attributes.length && ent.attributes.width) {
        providedParams.add("length");
        providedParams.add("width");
        payload.length = ent.attributes.length;
        payload.width = ent.attributes.width;
        if (ent.attributes.height) {
          providedParams.add("height");
          payload.height = ent.attributes.height;
        }
      }
    }
  }

  const missing = matchedTask.requiredParameters.filter((p) => !providedParams.has(p));

  return {
    recommendedModule: "DETERMINISTIC_ENGINE",
    targetEngineId: matchedTask.engineId,
    requiredParametersProvided: missing.length === 0,
    missingParameters: missing,
    suggestedActionPayload: {
      task: matchedTask.task,
      engineId: matchedTask.engineId,
      ...payload,
    },
  };
}
