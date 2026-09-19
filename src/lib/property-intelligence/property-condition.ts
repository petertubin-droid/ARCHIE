// =========================================================
// FRELUX PROPERTY INTELLIGENCE, CONDITION ASSESSMENT (§6)
//
// Observable property conditions from user-provided information,
// documents and images. Every observation is flagged with its
// data class; AI-detected observations are ALWAYS requires-
// confirmation, AI vision cannot certify anything.
//
// WORDING RULE (§6): findings are worded as
//   "Potential issue detected: …"
// NEVER as "This building is structurally unsafe." FRELUX does
// not certify structural integrity, safety or code compliance.
// =========================================================

import type { Provenance, PropertyDataClass } from "./types";

export const CONDITION_LIMITATION =
  "Condition observations describe only what is visible in user-supplied information. AI vision cannot certify structural integrity, safety or building-code compliance, qualified professional assessment is required before decisions that depend on condition.";

// =========================================================
// Observable condition categories (§6)
// =========================================================

export type ConditionCategory =
  | "unfinished_construction"
  | "apparent_deterioration"
  | "visible_cracks"
  | "roof_condition"
  | "visible_moisture_damage"
  | "visible_finish_condition"
  | "apparent_maintenance_requirement";

export const CONDITION_CATEGORY_LABELS: Record<ConditionCategory, string> = {
  unfinished_construction: "Unfinished construction",
  apparent_deterioration: "Apparent deterioration",
  visible_cracks: "Visible cracks",
  roof_condition: "Roof condition",
  visible_moisture_damage: "Visible moisture / water damage",
  visible_finish_condition: "Visible finish condition",
  apparent_maintenance_requirement: "Apparent maintenance requirement",
};

/** How the observation reached FRELUX, never invented. */
export type ConditionObservationSource =
  "user_reported" | "document" | "ai_vision" | "inspection_report";

export interface ConditionObservation {
  category: ConditionCategory;
  /** Free-text observation exactly as recorded. */
  observation: string;
  source: ConditionObservationSource;
  provenance?: Provenance;
  /** Optional relative severity of the OBSERVABLE sign only. */
  observableSeverity?: "minor" | "moderate" | "severe";
}

export interface ConditionFinding {
  category: ConditionCategory;
  categoryLabel: string;
  /** Careful, hedged wording, §6. */
  finding: string;
  source: ConditionObservationSource;
  dataClass: PropertyDataClass;
  /** AI-detected findings are never confirmed facts. */
  requiresConfirmation: boolean;
  evidence: ConditionObservation;
}

export interface ConditionAssessment {
  findings: ConditionFinding[];
  /** Categories with no recorded observation, explicit gaps. */
  unassessedCategories: ConditionCategory[];
  limitation: string;
  /** True when nothing observable has been recorded at all. */
  hasNoObservations: boolean;
}

function dataClassForObservation(o: ConditionObservation): PropertyDataClass {
  // Inspection reports / user statements are user-provided or source
  // derived; AI vision is ai_detected, never better.
  if (o.source === "ai_vision") return "ai_detected";
  if (o.source === "inspection_report")
    return o.provenance?.verificationStatus === "verified"
      ? "source_derived"
      : "unverified";
  return "user_provided";
}

function requiresConfirmationFor(o: ConditionObservation): boolean {
  if (o.source === "ai_vision") return true;
  const status = o.provenance?.verificationStatus;
  return status !== "verified";
}

function severityWord(s: ConditionObservation["observableSeverity"]): string {
  if (s === "minor") return "minor";
  if (s === "moderate") return "moderate";
  if (s === "severe") return "clearly visible";
  return "";
}

/**
 * Assess observable property conditions. Pure and deterministic:
 * the output contains exactly the observations supplied, nothing
 * is inferred, no condition is invented, no severity is upgraded.
 */
export function assessCondition(
  observations: ConditionObservation[],
): ConditionAssessment {
  const findings: ConditionFinding[] = observations.map((o) => {
    const dataClass = dataClassForObservation(o);
    const observable = severityWord(o.observableSeverity);
    const qualifier =
      o.source === "ai_vision"
        ? "in the supplied image(s)"
        : o.source === "document"
          ? "in the supplied document"
          : "";
    const finding = [
      `Potential issue detected: ${CONDITION_CATEGORY_LABELS[o.category].toLowerCase()}`,
      observable ? `(${observable})` : "",
      qualifier,
      `: recorded observation: "${o.observation}".`,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      category: o.category,
      categoryLabel: CONDITION_CATEGORY_LABELS[o.category],
      finding,
      source: o.source,
      dataClass,
      requiresConfirmation: requiresConfirmationFor(o),
      evidence: o,
    };
  });

  const observed = new Set(findings.map((f) => f.category));
  const unassessedCategories = (
    Object.keys(CONDITION_CATEGORY_LABELS) as ConditionCategory[]
  ).filter((c) => !observed.has(c));

  return {
    findings,
    unassessedCategories,
    limitation: CONDITION_LIMITATION,
    hasNoObservations: observations.length === 0,
  };
}
