// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — GOAL FORMALIZATION
//
// Translates raw user requests and operational directives into
// structured, constraint-aware, unambiguous goal specifications.
//
// Invariants:
// - Never invents deadlines, budgets, or success criteria without evidence.
// - Explicitly separates stated objectives from ARCHIE inferences.
// - Detects genuine ambiguities that materially change the plan.
// =========================================================

import type {
  GoalConstraint,
  GoalPriority,
  ResourceBudget,
  StructuredGoal,
  TrackedAcceptanceCriterion,
} from "./types.ts";

export type GoalFormalizationInput = string | {
  objective: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
  explicitExclusions?: string[];
  priority?: GoalPriority;
  explicitDeadlines?: string | null;
  budget?: ResourceBudget;
  requestedBy?: string;
  ownerAuthorized?: boolean;
};

export class GoalFormalizer {
  /**
   * Formalizes a raw objective string into a complete StructuredGoal.
   */
  formalize(
    rawInput: string,
    options: {
      priority?: GoalPriority;
      explicitDeadlines?: string | null;
      resourceBudget?: ResourceBudget;
      context?: string;
    } = {},
  ): StructuredGoal {
    const inputTrimmed = rawInput.trim();
    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Objectives and Outlines
    const { primaryObjective, secondaryObjectives, explicitExclusions } =
      this.extractObjectivesAndExclusions(inputTrimmed);

    // 2. Constraints Extraction
    const constraints: GoalConstraint[] = this.extractConstraints(inputTrimmed);

    // 3. Acceptance Criteria Extraction
    const acceptanceCriteria: TrackedAcceptanceCriterion[] =
      this.extractAcceptanceCriteria(inputTrimmed);

    // 4. Ambiguity Identification
    const ambiguityQuestions: string[] = this.identifyAmbiguities(inputTrimmed);

    return {
      id,
      primaryObjective,
      secondaryObjectives,
      status: "DRAFT",
      priority: options.priority ?? this.inferPriority(inputTrimmed),
      constraints,
      acceptanceCriteria,
      explicitExclusions,
      deadline: options.explicitDeadlines ?? undefined,
      resourceBudget: options.resourceBudget,
      ambiguityQuestions,
      provenance: {
        source: "USER_DIRECT",
        timestamp: new Date().toISOString(),
        ownerAuthorized: false,
      },
    };
  }

  /**
   * Overloaded method accepting either a string or a structured input object.
   */
  formalizeGoal(input: GoalFormalizationInput): StructuredGoal {
    if (typeof input === "string") {
      return this.formalize(input);
    }

    const baseGoal = this.formalize(input.objective, {
      priority: input.priority,
      explicitDeadlines: input.explicitDeadlines,
      resourceBudget: input.budget,
    });

    if (input.constraints && input.constraints.length > 0) {
      baseGoal.constraints = input.constraints.map((c, i) => ({
        id: `c_${i + 1}`,
        type: "HARD",
        dimension: "operational",
        description: c,
        rationale: "Explicitly specified user constraint",
      }));
    }

    if (input.acceptanceCriteria && input.acceptanceCriteria.length > 0) {
      baseGoal.acceptanceCriteria = input.acceptanceCriteria.map((ac, i) => ({
        id: `ac_${i + 1}`,
        description: ac,
        verificationMethod: "automated_check",
        status: "pending",
      }));
    }

    if (input.explicitExclusions && input.explicitExclusions.length > 0) {
      baseGoal.explicitExclusions = [...input.explicitExclusions];
    }

    if (input.requestedBy) {
      baseGoal.provenance.requestedBy = input.requestedBy;
    }
    if (input.ownerAuthorized !== undefined) {
      baseGoal.provenance.ownerAuthorized = input.ownerAuthorized;
    }

    return baseGoal;
  }

  private extractObjectivesAndExclusions(input: string): {
    primaryObjective: string;
    secondaryObjectives: string[];
    explicitExclusions: string[];
  } {
    const exclusions: string[] = [];
    const secondary: string[] = [];

    // Check exclusions
    const exclusionRegex = /(?:do not|exclude|without|avoid|never|no)\s+([^.,;]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = exclusionRegex.exec(input)) !== null) {
      exclusions.push(match[1].trim());
    }

    return {
      primaryObjective: input,
      secondaryObjectives: secondary,
      explicitExclusions: exclusions,
    };
  }

  private extractConstraints(input: string): GoalConstraint[] {
    const constraints: GoalConstraint[] = [];
    const lower = input.toLowerCase();

    if (lower.includes("zero downtime") || lower.includes("no downtime")) {
      constraints.push({
        id: "c_zero_downtime",
        type: "HARD",
        dimension: "operational",
        description: "Zero downtime deployment required",
        rationale: "Service availability continuity",
      });
    }

    if (lower.includes("backward compatibility") || lower.includes("backwards compatible")) {
      constraints.push({
        id: "c_backward_compat",
        type: "HARD",
        dimension: "quality",
        description: "Must retain backward compatibility with previous versions",
        rationale: "API and contract preservation",
      });
    }

    return constraints;
  }

  private extractAcceptanceCriteria(input: string): TrackedAcceptanceCriterion[] {
    const criteria: TrackedAcceptanceCriterion[] = [];
    const lower = input.toLowerCase();

    if (lower.includes("all tests pass") || lower.includes("integration tests pass")) {
      criteria.push({
        id: "ac_tests",
        description: "All automated integration and unit tests pass",
        verificationMethod: "automated_check",
        status: "pending",
      });
    }

    return criteria;
  }

  private inferPriority(input: string): GoalPriority {
    const lower = input.toLowerCase();
    if (lower.includes("urgent") || lower.includes("critical") || lower.includes("p0") || lower.includes("production outage")) {
      return "CRITICAL";
    }
    if (lower.includes("high priority") || lower.includes("asap") || lower.includes("p1")) {
      return "HIGH";
    }
    if (lower.includes("low priority") || lower.includes("whenever") || lower.includes("backlog")) {
      return "LOW";
    }
    return "NORMAL";
  }

  private identifyAmbiguities(input: string): string[] {
    const questions: string[] = [];
    const lower = input.toLowerCase();

    if (
      (lower.includes("database") || lower.includes("db")) &&
      (lower.includes("update") || lower.includes("upgrade") || lower.includes("migrate"))
    ) {
      if (!lower.includes("postgres") && !lower.includes("supabase") && !lower.includes("sqlite")) {
        questions.push("Target database and migration strategy need specification (schema migration vs version upgrade).");
      }
      if (!lower.includes("backup") && !lower.includes("rollback")) {
        questions.push("What is the required backup and rollback procedure for this database operation?");
      }
    }

    if (lower.includes("deploy") && !lower.includes("staging") && !lower.includes("production")) {
      questions.push("Which target environment should this deployment target (staging, preview, or production)?");
    }

    return questions;
  }
}
