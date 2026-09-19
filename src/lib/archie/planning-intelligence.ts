// =========================================================
// FRELUX PHASE 9, ARCHIE GENERAL PLANNING & DAILY-LIFE
// INTELLIGENCE
//
// ARCHIE assists with legitimate everyday planning (routines,
// tasks, study, fitness, travel, household, shopping, content,
// learning). Plans are PROPOSALS: structured, assumption-
// carrying, never irreversible actions (spec §12, §15).
//
// HIGH-CONSEQUENCE AREAS: health/fitness plans always carry
// the professional-care disclaimer; general information is
// never presented as medical fact (spec §12).
// =========================================================

import type { PlanningProposal } from "./phase9-types";

/** Disclaimers by plan type. Health-adjacent plans always
 *  include the professional-care boundary. */
const DISCLAIMER_PRESETS: Record<string, string[]> = {
  FITNESS_PLAN: [
    "General fitness information only. This is not medical advice, diagnosis or treatment. Consult a qualified health professional before starting any exercise or nutrition program, especially with existing medical conditions.",
  ],
  DAILY_ROUTINE: [
    "Routine suggestions are general guidance; adjust to your actual commitments and energy.",
  ],
  STUDY_PLAN: [
    "Study plans estimate effort from stated goals; results depend on consistency and materials used.",
  ],
  TRAVEL_PLAN: [
    "Travel plans rely on the information you provided; verify visas, transport schedules and local conditions before booking.",
  ],
  DEFAULT: [
    "Plan is a proposal based on stated inputs; review before acting on it.",
  ],
};

/** Step generators per plan type. Deterministic structuring. */
function stepsFor(
  plan_type: PlanningProposal["plan_type"],
  title: string,
  goals: string[],
): Array<{ order: number; description: string }> {
  const base: string[] = [];
  switch (plan_type) {
    case "DAILY_ROUTINE":
      base.push(
        "Define fixed anchor times (wake, work start, work end, sleep).",
        ...goals.map((g) => `Slot: ${g}`),
        "Reserve one buffer block for overflow tasks.",
        "Set a consistent sleep window aligned to the wake anchor.",
      );
      break;
    case "FITNESS_PLAN":
      base.push(
        "Define weekly frequency and realistic session length.",
        ...goals.map((g) => `Goal focus: ${g}`),
        "Schedule rest days between intense sessions.",
        "Track progress weekly against the stated goals.",
      );
      break;
    case "STUDY_PLAN":
    case "LEARNING_PLAN":
      base.push(
        "Break the subject into ordered modules from the stated goal.",
        ...goals.map((g) => `Learning goal: ${g}`),
        "Schedule spaced review sessions for retention.",
        "Set a checkpoint to test understanding at each module end.",
      );
      break;
    case "PROJECT_PLAN":
      base.push(
        "List deliverables and their acceptance criteria.",
        ...goals.map((g) => `Milestone: ${g}`),
        "Sequence activities and mark dependencies.",
        "Review the plan against available time and budget.",
      );
      break;
    case "TRAVEL_PLAN":
      base.push(
        "Confirm destination, dates and entry requirements.",
        ...goals.map((g) => `Priority: ${g}`),
        "Book transport and accommodation in sequence.",
        "Prepare a contingency for delays and cancellations.",
      );
      break;
    case "CONTENT_PLAN":
    case "TASK_PLAN":
    case "HOUSEHOLD_PLAN":
    case "SHOPPING_PLAN":
    default:
      base.push(
        "Clarify the outcome and its deadline.",
        ...goals.map((g) => `Item: ${g}`),
        "Order items by importance.",
        "Schedule a review after the first pass.",
      );
      break;
  }
  return base.map((description, i) => ({ order: i + 1, description }));
}

/**
 * Build a planning proposal. Pure logic: ARCHIE composes the
 * structure; the user confirms and executes. Always records the
 * assumptions the plan rests on, and attaches the correct
 * disclaimers — health-adjacent plans get the professional-care
 * boundary automatically.
 */
export function buildPlanningProposal(input: {
  plan_type: PlanningProposal["plan_type"];
  title: string;
  goals: string[];
  assumptions?: string[];
}): PlanningProposal {
  if (!input.title) throw new Error("A plan requires a title.");
  if (input.goals.length === 0) {
    throw new Error(
      "Insufficient planning input: at least one goal is required. ARCHIE does not invent goals.",
    );
  }
  const disclaimers =
    DISCLAIMER_PRESETS[input.plan_type] ?? DISCLAIMER_PRESETS.DEFAULT;
  return {
    plan_type: input.plan_type,
    title: input.title,
    steps: stepsFor(input.plan_type, input.title, input.goals),
    assumptions: [
      `Plan type: ${input.plan_type}`,
      "Goals as stated by the user.",
      ...(input.assumptions ?? []),
    ],
    disclaimers,
  };
}

/**
 * Boundary check for high-consequence areas (spec §12): any
 * plan touching health/fitness/medical topics must be
 * presented with its disclaimer; attempting to build such a
 * plan without the disclaimer path is refused.
 */
export function assertHealthBoundary(proposal: PlanningProposal): void {
  const healthAdjacent =
    proposal.plan_type === "FITNESS_PLAN" ||
    /health|medical|diagnos|treatment|symptom/i.test(proposal.title);
  if (healthAdjacent) {
    const hasMedicalDisclaimer = proposal.disclaimers.some((d) =>
      /not medical advice/i.test(d),
    );
    if (!hasMedicalDisclaimer) {
      throw new Error(
        "High-consequence topic requires the professional-care disclaimer before this plan can be presented.",
      );
    }
  }
}
