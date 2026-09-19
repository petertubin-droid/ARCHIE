// =========================================================
// FRELUX ARCHIE AMENDMENT, CODING & APP DEVELOPMENT WORKFLOW
//
// ARCHIE may:
//
//   READ → UNDERSTAND → ANALYZE → DESIGN → WRITE → TEST →
//   REVIEW → PROPOSE
//
// across web, PWA, Android, iOS, desktop, backend, APIs and
// cloud application development: code, tests, documentation,
// architecture proposals and implementation plans.
//
// ARCHIE MUST NOT independently apply protected production
// changes or deploy them. The production workflow is fixed:
//
//   ARCHIE PROPOSES → OWNER REVIEWS → OWNER AUTHORIZES →
//   APPLY → TEST → AUDIT → VERSION → DEPLOY
//
// This is the 80/20 operating model in engineering form.
// =========================================================

export type DevStage =
  | "READ"
  | "UNDERSTAND"
  | "ANALYZE"
  | "DESIGN"
  | "WRITE"
  | "TEST"
  | "REVIEW"
  | "PROPOSE";

/** ARCHIE's autonomous development stages, all proposals. */
export const DEV_STAGES: readonly DevStage[] = [
  "READ",
  "UNDERSTAND",
  "ANALYZE",
  "DESIGN",
  "WRITE",
  "TEST",
  "REVIEW",
  "PROPOSE",
];

/** The production workflow, every stage after ARCHIE's
 *  proposal is owner-driven. Fixed, not configurable. */
export const PRODUCTION_WORKFLOW: readonly string[] = [
  "ARCHIE PROPOSES",
  "OWNER REVIEWS",
  "OWNER AUTHORIZES",
  "APPLY",
  "TEST",
  "AUDIT",
  "VERSION",
  "DEPLOY",
];

/** The app domains ARCHIE learns and works with. */
export const DEVELOPMENT_DOMAINS: readonly string[] = [
  "web",
  "pwa",
  "android",
  "ios",
  "desktop",
  "backend",
  "api",
  "cloud",
];

export interface DevelopmentCapability {
  /** What ARCHIE may generate autonomously. */
  may_generate: readonly string[];
  /** What ARCHIE may never do alone. */
  may_not: readonly string[];
}

export const DEVELOPMENT_CAPABILITY: DevelopmentCapability = {
  may_generate: [
    "code",
    "tests",
    "documentation",
    "architecture proposals",
    "implementation plans",
  ],
  may_not: [
    "independently apply protected production changes",
    "independently deploy",
    "bypass the owner approval gate",
  ],
};

/** What ARCHIE can produce from a coding task, and the gate
 *  its outputs must pass. */
export function developmentAction(task: string): {
  archie_may: DevStage[];
  output: "proposal";
  gate: string;
} {
  void task;
  return {
    archie_may: [...DEV_STAGES],
    output: "proposal",
    gate: PRODUCTION_WORKFLOW.join(" → "),
  };
}

/** Apply stages of the production workflow. Only the OWNER
 *  moves past REVIEW; ARCHIE cannot. */
export function nextProductionStage(
  current: string,
  actor: "ARCHIE" | "OWNER",
): { ok: boolean; error?: string; next?: string } {
  const idx = PRODUCTION_WORKFLOW.indexOf(current);
  if (idx === -1) return { ok: false, error: `Unknown workflow stage "${current}"` };
  const next = PRODUCTION_WORKFLOW[idx + 1];
  if (!next) return { ok: false, error: "Workflow is complete (DEPLOY)" };
  if (current === "ARCHIE PROPOSES") {
    // Moving to OWNER REVIEWS is automatic presentation, allowed.
    return { ok: true, next };
  }
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: `Only the Owner advances "${current}", ARCHIE proposes, the Owner authorizes`,
    };
  }
  return { ok: true, next };
}
