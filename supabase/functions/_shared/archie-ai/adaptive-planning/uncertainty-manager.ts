// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — UNCERTAINTY MANAGER
//
// Tracks assumptions, evaluates epistemic status, and selects
// defensible decision policies under incomplete information.
//
// Invariants:
// - Keeps FACT, ASSUMPTION, INFERENCE, and UNKNOWN strictly distinct.
// - Assumptions never magically become facts without evidence.
// - Explicitly selects policies: proceed, clarify, gather, simulate,
//   fallback, defer, or stop.
// =========================================================

import type {
  AdaptivePlanStepNode,
  DecisionUnderUncertaintyPolicy,
  EpistemicStatus,
  TrackedAssumption,
  UncertaintyAssessment,
} from "./types.ts";

export interface UncertaintyReport {
  overallConfidence: number;
  averageConfidence: number;
  recommendedPolicy: "PROCEED_AUTONOMOUSLY" | "PROCEED_WITH_DISCLAIMER" | "GATHER_MORE_INFO" | "REPLAN";
  criticalUncertainties: string[];
  rationale: string;
}

export class UncertaintyManager {
  /**
   * Assesses uncertainty for a proposed plan or goal and determines the appropriate policy.
   */
  assessUncertainty(
    assumptions: Array<Omit<TrackedAssumption, "id" | "isVerified">>,
    missingKnowledge: string[] = [],
    isCriticalPathAffected = false,
  ): UncertaintyAssessment {
    const tracked: TrackedAssumption[] = assumptions.map((a, i) => ({
      id: `asm_${i + 1}`,
      ...a,
      isVerified: a.status === "FACT",
    }));

    // Missing information list
    const missingInformation = [...missingKnowledge];
    for (const a of tracked) {
      if (a.status === "UNKNOWN" || a.status === "ASSUMPTION") {
        if (!missingInformation.includes(a.statement)) {
          missingInformation.push(a.statement);
        }
      }
    }

    // Compute overall confidence
    const confidenceValues = tracked.map((t) => t.confidence);
    const overallConfidence =
      confidenceValues.length > 0
        ? Number((confidenceValues.reduce((s, c) => s + c, 0) / confidenceValues.length).toFixed(3))
        : 1.0;

    // Determine Policy
    let recommendedPolicy: DecisionUnderUncertaintyPolicy = "proceed";
    let rationale = "Sufficient verified facts available to proceed safely.";

    const highImpactUnverified = tracked.some(
      (t) => !t.isVerified && t.impactIfInvalid === "high",
    );

    if (highImpactUnverified && isCriticalPathAffected) {
      if (missingKnowledge.length > 0) {
        recommendedPolicy = "gather_evidence";
        rationale = "High-impact assumptions affect the critical path. Gather verifiable evidence before committing.";
      } else {
        recommendedPolicy = "ask_clarification";
        rationale = "Critical assumptions lack factual grounding. Request Owner clarification.";
      }
    } else if (overallConfidence < 0.5) {
      recommendedPolicy = "reversible_fallback";
      rationale = "Confidence is low. Select a reversible, low-risk course of action.";
    } else if (missingKnowledge.length > 3) {
      recommendedPolicy = "gather_evidence";
      rationale = "Multiple knowledge gaps detected. Perform targeted research first.";
    }

    return {
      assumptions: tracked,
      overallConfidence,
      missingInformation,
      recommendedPolicy,
      rationale,
    };
  }

  /**
   * Assesses plan-level uncertainty across steps.
   */
  assessPlanUncertainty(
    nodes: AdaptivePlanStepNode[],
    goal?: unknown,
  ): UncertaintyReport {
    const assumptions: Array<Omit<TrackedAssumption, "id" | "isVerified">> = [];
    const missingKnowledge: string[] = [];

    for (const node of nodes) {
      if (node.reliabilityScore < 0.8 || node.operatorId.includes("research")) {
        assumptions.push({
          statement: `Operator ${node.operatorId} will execute reliably for "${node.title}"`,
          confidence: node.reliabilityScore,
          source: "TELEMETRY",
          status: "ASSUMPTION",
          impactIfInvalid: node.reliabilityScore < 0.7 ? "high" : "medium",
        });
        missingKnowledge.push(`Reliability verification for step "${node.title}"`);
      }
    }

    if (assumptions.length === 0) {
      assumptions.push({
        statement: "Baseline operational assumptions",
        confidence: 0.95,
        source: "FACT_STORE",
        status: "FACT",
        impactIfInvalid: "low",
      });
    }

    const assessment = this.assessUncertainty(assumptions, missingKnowledge, true);

    const policyMap: Record<string, UncertaintyReport["recommendedPolicy"]> = {
      proceed: "PROCEED_AUTONOMOUSLY",
      gather_evidence: "GATHER_MORE_INFO",
      ask_clarification: "GATHER_MORE_INFO",
      reversible_fallback: "PROCEED_WITH_DISCLAIMER",
      halt_unexecutable: "REPLAN",
    };

    const recPolicy = policyMap[assessment.recommendedPolicy] ?? "PROCEED_WITH_DISCLAIMER";

    return {
      overallConfidence: assessment.overallConfidence,
      averageConfidence: assessment.overallConfidence,
      recommendedPolicy: recPolicy,
      criticalUncertainties: assessment.missingInformation,
      rationale: assessment.rationale,
    };
  }

  /**
   * Promotes an assumption to FACT when corroborated by verified evidence.
   */
  verifyAssumption(
    assumption: TrackedAssumption,
    evidenceProvenance: string,
  ): TrackedAssumption {
    return {
      ...assumption,
      status: "FACT",
      isVerified: true,
      confidence: 1.0,
      source: `${assumption.source} [verified via ${evidenceProvenance}]`,
    };
  }
}
