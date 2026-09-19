// =========================================================
// FRELUX PHASE 8 P3, ARCHIE TOOL SELECTION
//
// ARCHIE's reasoning layer must select the RIGHT tool for a
// question, and for construction mathematics the ONLY right
// tools are FRELUX's canonical deterministic engines. This
// module layers ARCHIE's tool-selection policy OVER the
// existing Phase 2 AI Foundation engine registry, it does
// not duplicate or replace it.
//
// Enforced invariants:
//   * A calculation answer is produced by a registered engine
//     or NOT AT ALL. ARCHIE never computes construction math
//     itself (EngineNotRegisteredError semantics, reused).
//   * Any numeric answer without engine provenance is an
//     AI_EXTRACTED ESTIMATE that must be labeled as such and
//     can never be presented as a final calculated result.
//   * Non-math project systems (timeline, quotations, shopping
//     lists, weather, market, property intelligence) are
//     addressable capabilities with their own deterministic
//     entry points, ARCHIE orchestrates, never fabricates.
// =========================================================

import type { ArchieCandidate } from "./types";
import { listEngines } from "@/lib/ai-foundation/engines-registry";

/** The systems ARCHIE can reason across (FRELUX's existing
 *  project intelligence, reused, not rebuilt here). */
export interface CapabilityDescriptor {
  key: string;
  label: string;
  domain: string;
  /** true → backed by a deterministic engine/implementation;
   *  ARCHIE may relay its output but never replace its math. */
  deterministic: boolean;
  /** Registered engine id when the capability is engine-backed. */
  engine_id?: string;
}

export const ARCHIE_CAPABILITIES: readonly CapabilityDescriptor[] = [
  { key: "build_to_roof", label: "Build-to-Roof Estimator", domain: "construction", deterministic: true, engine_id: "build_to_roof" },
  { key: "roof_geometry", label: "Roof Geometry", domain: "roofing", deterministic: true, engine_id: "roof_geometry" },
  { key: "painting", label: "Painting Calculators", domain: "painting_finishes", deterministic: true, engine_id: "painting_wall_area" },
  { key: "tyrolene_partition", label: "Tyrolene Partition Area", domain: "painting_finishes", deterministic: true, engine_id: "tyrolene_partition_area" },
  { key: "timeline", label: "Project Timeline", domain: "project_planning", deterministic: true },
  { key: "quotations", label: "Quotation Engine", domain: "costing", deterministic: true },
  { key: "shopping_lists", label: "Shopping Lists", domain: "procurement", deterministic: true },
  { key: "material_planning", label: "Material Planning", domain: "construction", deterministic: true },
  { key: "contractor_library", label: "Contractor Library", domain: "construction", deterministic: false },
  { key: "weather_intelligence", label: "Weather Intelligence", domain: "project_planning", deterministic: false },
  { key: "market_intelligence", label: "Market / Material Prices", domain: "costing", deterministic: false },
  { key: "property_intelligence", label: "Property Intelligence", domain: "property", deterministic: false },
  { key: "construction_intelligence", label: "Construction Intelligence", domain: "construction", deterministic: false },
  { key: "image_estimation", label: "AI Image Estimator", domain: "construction", deterministic: false },
];

/** Intent classification for tool selection. */
export type ArchieIntent =
  | "CALCULATION"
  | "PROJECT_DATA"
  | "GENERAL_KNOWLEDGE";

export interface ToolSelection {
  intent: ArchieIntent;
  /** The single capability ARCHIE should hand the question to. */
  capability?: CapabilityDescriptor;
  /** When true ARCHIE MUST relay the engine's result verbatim
   *  and may only add explanation around it. */
  must_use_deterministic_engine: boolean;
  rationale: string;
}

const CALCULATION_PATTERNS: readonly RegExp[] = [
  /how much/i,
  /how many/i,
  /quantity|quantities/i,
  /calculate|calculator/i,
  /estimate.*(paint|block|tile|screed|cement|sand|roof|area|cost)/i,
  /area|volume|coverage/i,
  /bags of cement|litres? of paint|blocks? needed/i,
];

const CAPABILITY_HINTS: ReadonlyArray<{ rx: RegExp; key: string }> = [
  { rx: /roof|timber|rafter|fascia|hip|ridge/i, key: "roof_geometry" },
  { rx: /paint|primer|coats? of paint|emulsion/i, key: "painting" },
  { rx: /tyrolene|partition/i, key: "tyrolene_partition" },
  { rx: /timeline|how long|duration|schedule/i, key: "timeline" },
  { rx: /quotation|quote|invoice/i, key: "quotations" },
  { rx: /shopping list|buy list/i, key: "shopping_lists" },
  { rx: /price of|current price|market/i, key: "market_intelligence" },
  { rx: /weather|rain|season/i, key: "weather_intelligence" },
  { rx: /property value|valuation|land/i, key: "property_intelligence" },
  { rx: /contractor|artisan|pro connect/i, key: "contractor_library" },
  { rx: /photo|image|picture|plan/i, key: "image_estimation" },
  { rx: /build|foundation|block|cement|sand|building/i, key: "build_to_roof" },
];

/** Select the tool for a question. The critical rule: a
 *  CALCULATION intent ALWAYS resolves to a deterministic
 *  engine, when no registered engine fits, ARCHIE must say so
 *  rather than approximate. */
export function selectTool(question: string): ToolSelection {
  const isCalculation = CALCULATION_PATTERNS.some((rx) => rx.test(question));
  const hint = CAPABILITY_HINTS.find((h) => h.rx.test(question));
  const capability = hint
    ? ARCHIE_CAPABILITIES.find((c) => c.key === hint.key)
    : undefined;
  if (!isCalculation) {
    if (capability && !capability.deterministic) {
      return {
        intent: "PROJECT_DATA",
        capability,
        must_use_deterministic_engine: false,
        rationale:
          `Question routed to ${capability.label} data; ARCHIE relays what the system records and never fabricates it`,
      };
    }
    return {
      intent: "GENERAL_KNOWLEDGE",
      must_use_deterministic_engine: false,
      rationale:
        "Not a construction-math question; ARCHIE may answer from governed knowledge",
    };
  }
  if (!capability) {
    return {
      intent: "CALCULATION",
      must_use_deterministic_engine: true,
      rationale:
        "This is a calculation question; ARCHIE will not approximate, a registered FRELUX engine must compute it",
    };
  }
  if (!capability.deterministic) {
    return {
      intent: "PROJECT_DATA",
      capability,
      must_use_deterministic_engine: false,
      rationale:
        `Calculation-flavoured question routed to ${capability.label}; its output is data, and any construction math inside it still requires a registered engine`,
    };
  }
  return {
    intent: "CALCULATION",
    capability,
    must_use_deterministic_engine: true,
    rationale: `Routed to the canonical deterministic engine for ${capability.label}; ARCHIE relays its result and never re-derives the math`,
  };
}

/** An answer ARCHIE wants to present to a user. */
export interface ArchieAnswer {
  text: string;
  /** Engine provenance, present iff numbers came from an engine. */
  engine_id?: string;
  numeric_values?: Record<string, number>;
}

export type AuthorityVerdict =
  | { presentation: "DETERMINISTIC_RESULT"; engine_id: string; verified: true }
  | {
      presentation: "AI_ESTIMATE";
      verified: false;
      must_label_as_estimate: true;
      requires_engineering_review: true;
      reason: string;
    };

/** Enforce the boundary at the point of presentation: a numeric
 *  answer is a final RESULT only when its engine is registered
 *  in the canonical registry. Everything else is an ESTIMATE
 *  that must be labeled and gated. */
export function assertAuthority(answer: ArchieAnswer): AuthorityVerdict {
  if (!answer.engine_id || !hasNumericValues(answer)) {
    return {
      presentation: "AI_ESTIMATE",
      verified: false,
      must_label_as_estimate: true,
      requires_engineering_review: true,
      reason: "No engine provenance: numeric output without a registered engine",
    };
  }
  const registered = listEngines().some((e) => e.id === answer.engine_id);
  if (!registered) {
    return {
      presentation: "AI_ESTIMATE",
      verified: false,
      must_label_as_estimate: true,
      requires_engineering_review: true,
      reason: `Engine "${answer.engine_id}" is not in the canonical registry`,
    };
  }
  return {
    presentation: "DETERMINISTIC_RESULT",
    engine_id: answer.engine_id,
    verified: true,
  };
}

function hasNumericValues(answer: ArchieAnswer): boolean {
  const vals = answer.numeric_values ?? {};
  return (
    Object.keys(vals).length > 0 &&
    Object.values(vals).some((v) => typeof v === "number" && Number.isFinite(v))
  );
}

/** Helper for the ingestion pipeline: a candidate that contains
 *  construction quantities is born as an AI_EXTRACTED estimate
 *  and can never claim engine authority. */
export function candidateMathDiscipline(
  candidate: Pick<ArchieCandidate, "content">,
): { flag: "QUANTITY_CANDIDATE" | "PLAIN_CANDIDATE" } {
  const quantityKeys = Object.keys(candidate.content ?? {}).filter((k) =>
    /(qty|quantity|bags|litres|meters|metres|area|volume|blocks)/i.test(k),
  );
  return quantityKeys.length > 0
    ? { flag: "QUANTITY_CANDIDATE" }
    : { flag: "PLAIN_CANDIDATE" };
}
