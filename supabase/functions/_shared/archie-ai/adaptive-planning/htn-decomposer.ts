// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — HTN DECOMPOSER
//
// Hierarchical Task Networks (HTN) milestone decomposition,
// sub-goal stratification, deliverable checkpoints, and
// domain template expansions.
// =========================================================

import type {
  HierarchicalMilestone,
  MilestoneCheckpoint,
  StructuredGoal,
} from "./types.ts";

interface MilestoneTemplate {
  id: string;
  title: string;
  subGoals: string[];
  dependsOnPrevious: boolean;
  deliverables: string[];
  validationCheckpoint: string;
}

export class HtnDecomposer {
  private templates: Record<string, MilestoneTemplate[]> = {
    research: [
      {
        id: "ms_research_prerequisites",
        title: "Knowledge Base Inventory & Gap Identification",
        subGoals: [
          "Query verified stored facts",
          "Identify missing knowledge predicates",
        ],
        dependsOnPrevious: false,
        deliverables: ["Fact inventory", "Identified knowledge gaps"],
        validationCheckpoint: "All initial facts queried and missing slots recorded",
      },
      {
        id: "ms_research_retrieval",
        title: "Targeted External Information & Evidence Retrieval",
        subGoals: [
          "Execute web search queries",
          "Extract candidate snippets",
        ],
        dependsOnPrevious: true,
        deliverables: ["Raw extracted candidate claims"],
        validationCheckpoint: "At least two independent sources retrieved per gap",
      },
      {
        id: "ms_research_corroboration",
        title: "Multi-Source Corroboration & Contradiction Checking",
        subGoals: [
          "Cross-check snippet claims against established knowledge",
          "Detect contradictions and flag uncertainties",
        ],
        dependsOnPrevious: true,
        deliverables: ["Corroborated fact candidates", "Contradiction report"],
        validationCheckpoint: "No unverified high-impact assumptions promoted",
      },
      {
        id: "ms_research_synthesis",
        title: "Synthesis & Owner Proposal Preparation",
        subGoals: [
          "Format synthesized knowledge into structured summary",
          "Submit candidate facts for owner approval",
        ],
        dependsOnPrevious: true,
        deliverables: ["Final synthesized research report"],
        validationCheckpoint: "Complete transparent proposal formatted",
      },
    ],
    software: [
      {
        id: "ms_software_spec",
        title: "Static Code Analysis & Architecture Review",
        subGoals: [
          "Analyze existing codebase structure and test harness",
          "Formalize constraints, interfaces, and dependencies",
        ],
        dependsOnPrevious: false,
        deliverables: ["Dependency graph", "Vulnerability & gap summary"],
        validationCheckpoint: "Baseline tests and build integrity confirmed",
      },
      {
        id: "ms_software_test_first",
        title: "Test-Driven Specification & Edge Case Modeling",
        subGoals: [
          "Author test suite covering primary requirements",
          "Define adversarial, boundary, and regression tests",
        ],
        dependsOnPrevious: true,
        deliverables: ["Baseline test harness", "Mock interfaces"],
        validationCheckpoint: "Tests authored and failing for missing implementation",
      },
      {
        id: "ms_software_implementation",
        title: "Core Implementation & Modular Refactoring",
        subGoals: [
          "Implement requested engine components",
          "Maintain backward compatibility and zero regressions",
        ],
        dependsOnPrevious: true,
        deliverables: ["Implemented code modules", "Updated type definitions"],
        validationCheckpoint: "All tests pass cleanly with zero build errors",
      },
      {
        id: "ms_software_audit",
        title: "Security, Authority Gate & Verification Review",
        subGoals: [
          "Verify Owner Authority boundaries on protected actions",
          "Validate against production deployment checklist",
        ],
        dependsOnPrevious: true,
        deliverables: ["Security audit report", "Owner authorization package"],
        validationCheckpoint: "All security and authority invariants satisfied",
      },
    ],
    construction: [
      {
        id: "ms_construction_foundation",
        title: "Phase 1: Site Survey, Feasibility & Prerequisites Gaps",
        subGoals: [
          "Review site constraints and regulatory requirements",
          "Identify unverified materials or missing quotes",
        ],
        dependsOnPrevious: false,
        deliverables: ["Site checklist", "Constraint map"],
        validationCheckpoint: "Site parameters confirmed and documented",
      },
      {
        id: "ms_construction_procurement",
        title: "Phase 2: Quantity Estimation & Cost Calibration",
        subGoals: [
          "Calculate bills of quantities and material dimensions",
          "Verify pricing against supplier database or historical inflation",
        ],
        dependsOnPrevious: true,
        deliverables: ["Bill of quantities", "Calibrated cost estimate"],
        validationCheckpoint: "All prices backed by dated quotes or explicit disclaimers",
      },
      {
        id: "ms_construction_execution",
        title: "Phase 3: Phased Trade Sequencing & Weather Scheduling",
        subGoals: [
          "Sequence structural dependencies in strict physical order",
          "Align high-vulnerability trades with dry weather windows",
        ],
        dependsOnPrevious: true,
        deliverables: ["Trade execution schedule", "Material delivery timeline"],
        validationCheckpoint: "No roof or foundation work scheduled during high-risk rain periods",
      },
      {
        id: "ms_construction_review",
        title: "Phase 4: Master Construction Plan Proposal & Authorization",
        subGoals: [
          "Assemble complete construction schedule and budget",
          "Flag critical path bottlenecks for owner sign-off",
        ],
        dependsOnPrevious: true,
        deliverables: ["Master construction plan proposal"],
        validationCheckpoint: "Owner authorization package completed",
      },
    ],
    operations: [
      {
        id: "ms_ops_anchoring",
        title: "Commitment Inventory & Calendar Anchoring",
        subGoals: [
          "Map hard calendar meetings and fixed commitments",
          "Identify non-negotiable operational deadlines",
        ],
        dependsOnPrevious: false,
        deliverables: ["Anchor commitment matrix"],
        validationCheckpoint: "All immovable calendar slots mapped",
      },
      {
        id: "ms_ops_task_prioritization",
        title: "Dynamic Task Ranking & Slot Allocation",
        subGoals: [
          "Rank tasks by urgency, value, and dependency status",
          "Fit flexible tasks around fixed anchor commitments",
        ],
        dependsOnPrevious: true,
        deliverables: ["Prioritized task sequence"],
        validationCheckpoint: "Buffer times reserved between intense work blocks",
      },
      {
        id: "ms_ops_review",
        title: "Schedule Synthesis & Check-in",
        subGoals: [
          "Generate final daily/weekly operational schedule",
          "Highlight high-leverage goals for owner review",
        ],
        dependsOnPrevious: true,
        deliverables: ["Operational schedule proposal"],
        validationCheckpoint: "Actionable schedule produced",
      },
    ],
  };

  /**
   * Decomposes a goal into ordered hierarchical milestones based on domain context.
   */
  decomposeGoal(goalSubject: string, domainContext = ""): HierarchicalMilestone[] {
    const text = `${goalSubject} ${domainContext}`.toLowerCase();

    let chosenTemplate = this.templates.operations;
    if (
      text.includes("roof") ||
      text.includes("build") ||
      text.includes("bungalow") ||
      text.includes("construct") ||
      text.includes("foundation")
    ) {
      chosenTemplate = this.templates.construction;
    } else if (
      text.includes("research") ||
      text.includes("investigate") ||
      text.includes("find") ||
      text.includes("study")
    ) {
      chosenTemplate = this.templates.research;
    } else if (
      text.includes("code") ||
      text.includes("software") ||
      text.includes("deploy") ||
      text.includes("auth") ||
      text.includes("feature") ||
      text.includes("bug") ||
      text.includes("refactor")
    ) {
      chosenTemplate = this.templates.software;
    }

    const milestones: HierarchicalMilestone[] = [];
    let previousMilestoneId: string | undefined;

    chosenTemplate.forEach((m, idx) => {
      const milestoneId = `ms_${idx + 1}_${m.id.replace(/^ms_/, "")}`;
      const checkpoints: MilestoneCheckpoint[] = [
        {
          id: `cp_${idx + 1}`,
          name: `${m.title} Validation Checkpoint`,
          criteria: [m.validationCheckpoint],
          targetState: "VERIFIED",
        },
      ];

      milestones.push({
        id: milestoneId,
        title: m.title,
        order: idx + 1,
        subGoals: [...m.subGoals],
        stepIds: [],
        status: idx === 0 ? "active" : "pending",
        dependsOnMilestones:
          m.dependsOnPrevious && previousMilestoneId
            ? [previousMilestoneId]
            : [],
        deliverables: [...m.deliverables],
        validationCheckpoint: m.validationCheckpoint,
        checkpoints,
      });
      previousMilestoneId = milestoneId;
    });

    return milestones;
  }

  /**
   * Decomposes a StructuredGoal dynamically into milestones reflecting
   * its specific primary, secondary, and acceptance requirements.
   */
  decomposeStructuredGoal(goal: StructuredGoal): HierarchicalMilestone[] {
    const milestones: HierarchicalMilestone[] = [];
    let order = 1;
    let prevId: string | undefined;

    // 1. Foundation & Prerequisites Milestone
    const m1Id = `ms_custom_prerequisites`;
    milestones.push({
      id: m1Id,
      title: "Prerequisites & Scope Clarification",
      order: order++,
      subGoals: [
        "Validate constraints and input assumptions",
        ...goal.constraints.map((c) => `Verify constraint: ${c.description}`),
      ],
      stepIds: [],
      status: "active",
      dependsOnMilestones: [],
      deliverables: ["Scope boundaries", "Verified constraints"],
      validationCheckpoint: "Hard constraints verified satisfied or satisfiable",
      checkpoints: [
        {
          id: "cp_prereq",
          name: "Prerequisites Checkpoint",
          criteria: ["All input constraints verified"],
          targetState: "VERIFIED",
        },
      ],
    });
    prevId = m1Id;

    // 2. Primary Objective Execution Milestone
    const m2Id = `ms_custom_primary_execution`;
    milestones.push({
      id: m2Id,
      title: `Primary Execution: ${goal.primaryObjective.slice(0, 40)}`,
      order: order++,
      subGoals: [
        `Execute core steps for: ${goal.primaryObjective}`,
        ...goal.secondaryObjectives,
      ],
      stepIds: [],
      status: "pending",
      dependsOnMilestones: prevId ? [prevId] : [],
      deliverables: ["Core deliverables"],
      validationCheckpoint: "Primary objective tasks completed",
      checkpoints: [
        {
          id: "cp_execution",
          name: "Core Execution Checkpoint",
          criteria: ["Primary objective tasks completed"],
          targetState: "VERIFIED",
        },
      ],
    });
    prevId = m2Id;

    // 3. Verification & Acceptance Milestone
    const m3Id = `ms_custom_verification`;
    milestones.push({
      id: m3Id,
      title: "Acceptance Verification & Review Gate",
      order: order++,
      subGoals: goal.acceptanceCriteria.map((ac) => `Verify: ${ac.description}`),
      stepIds: [],
      status: "pending",
      dependsOnMilestones: prevId ? [prevId] : [],
      deliverables: ["Verification report", "Owner authorization package"],
      validationCheckpoint: "All acceptance criteria verified",
      checkpoints: [
        {
          id: "cp_verification",
          name: "Acceptance Verification Checkpoint",
          criteria: goal.acceptanceCriteria.map((a) => a.description),
          targetState: "VERIFIED",
        },
      ],
    });

    return milestones;
  }
}
