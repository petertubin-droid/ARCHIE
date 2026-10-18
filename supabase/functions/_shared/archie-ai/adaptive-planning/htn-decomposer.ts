// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — HTN DECOMPOSER
//
// Hierarchical Task Network (HTN) decomposition: breaks
// composite objectives into phased milestones, sub-goals,
// and operator-ready subtasks across ARCHIE's domains.
// =========================================================

import type { HierarchicalMilestone } from "./types.ts";

export interface HtnTemplate {
  domain: string;
  matchPattern: RegExp;
  milestones: Array<{
    idSuffix: string;
    title: string;
    subGoals: string[];
    dependsOnPrevious: boolean;
  }>;
}

export class HtnDecomposer {
  private templates: HtnTemplate[] = [
    {
      domain: "research",
      matchPattern:
        /\b(research|investigate|explore|verify|truth|evidence|study|source)\b/i,
      milestones: [
        {
          idSuffix: "m1_gap_analysis",
          title: "Knowledge Gap Identification",
          subGoals: [
            "inventory verified stored facts",
            "delineate explicit unknown parameters",
          ],
          dependsOnPrevious: false,
        },
        {
          idSuffix: "m2_evidence_retrieval",
          title: "Multi-Source Evidence Gathering",
          subGoals: [
            "query priority web sources",
            "fetch and inspect primary page contents",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m3_corroboration",
          title: "Cross-Checking & Contradiction Detection",
          subGoals: [
            "corroborate claims across independent sources",
            "isolate conflicting or outdated claims",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m4_synthesis",
          title: "Synthesis & Candidate Store Insertion",
          subGoals: [
            "format structured claims with provenance",
            "present findings to user without truth exaggeration",
          ],
          dependsOnPrevious: true,
        },
      ],
    },
    {
      domain: "software_engineering",
      matchPattern:
        /\b(code|refactor|test|architecture|api|dependency|dependencies|module|analyze|security|audit|git)\b/i,
      milestones: [
        {
          idSuffix: "m1_static_analysis",
          title: "Static Code & Dependency Analysis",
          subGoals: [
            "inspect source AST and module imports",
            "detect circular imports and broken references",
          ],
          dependsOnPrevious: false,
        },
        {
          idSuffix: "m2_test_scaffolding",
          title: "Verification & Test Scaffolding",
          subGoals: [
            "generate dependency-isolated unit test mocks",
            "establish automated regression baseline",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m3_implementation",
          title: "Deterministic Code Composition",
          subGoals: [
            "synthesize bounded solution according to specification",
            "verify static types and syntax contracts",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m4_review_gate",
          title: "Security Review & Owner Gate",
          subGoals: [
            "audit credential security and permission scopes",
            "submit proposal for owner commit authorization",
          ],
          dependsOnPrevious: true,
        },
      ],
    },
    {
      domain: "construction",
      matchPattern:
        /\b(build|construct|roof|screed|wall|bungalow|foundation|concrete|mortar|plaster|masonry|house)\b/i,
      milestones: [
        {
          idSuffix: "m1_prerequisites",
          title: "Site & Technical Prerequisites",
          subGoals: [
            "inventory existing site knowledge",
            "identify regulatory and soil constraints",
          ],
          dependsOnPrevious: false,
        },
        {
          idSuffix: "m2_quantities_costing",
          title: "Quantities & Cost Estimation",
          subGoals: [
            "calculate structural material quantities",
            "calibrate costs against regional market rates",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m3_scheduling_weather",
          title: "Logistics & Weather Windows",
          subGoals: [
            "sequence wet trades around weather forecast",
            "schedule labor and material staging",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m4_owner_proposal",
          title: "Execution Proposal & Authorization",
          subGoals: [
            "compile comprehensive plan document",
            "present plan for owner authorization",
          ],
          dependsOnPrevious: true,
        },
      ],
    },
    {
      domain: "daily_operations",
      matchPattern: /.*/, // Fallback template for general planning
      milestones: [
        {
          idSuffix: "m1_anchoring",
          title: "Anchoring & Fixed Commitments",
          subGoals: [
            "map non-negotiable anchor constraints",
            "reserve buffer zones for unexpected variance",
          ],
          dependsOnPrevious: false,
        },
        {
          idSuffix: "m2_task_sequencing",
          title: "Goal Decomposition & Priority Allocation",
          subGoals: [
            "sequence high-impact tasks during focus windows",
            "link dependent subtasks",
          ],
          dependsOnPrevious: true,
        },
        {
          idSuffix: "m3_proposal_review",
          title: "Plan Review & Finalization",
          subGoals: [
            "synthesize proposal with stated assumptions",
            "provide explicit boundary disclaimers",
          ],
          dependsOnPrevious: true,
        },
      ],
    },
  ];

  /**
   * Decomposes a goal into structured hierarchical milestones.
   */
  decomposeGoal(goalSubject: string, inputContext = ""): HierarchicalMilestone[] {
    const combined = `${goalSubject} ${inputContext}`.trim();
    const template =
      this.templates.find((t) => t.matchPattern.test(combined)) ||
      this.templates[this.templates.length - 1];

    const milestones: HierarchicalMilestone[] = [];
    let previousMilestoneId: string | undefined;

    template.milestones.forEach((m, idx) => {
      const milestoneId = `ms_${template.domain}_${m.idSuffix}`;
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
      });
      previousMilestoneId = milestoneId;
    });

    return milestones;
  }
}
