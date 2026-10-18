// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — RISK ASSESSMENT
//
// Identifies, scores, and mitigates risks across dependencies,
// security boundaries, resource caps, and irreversible side effects.
//
// Invariants:
// - Quantitative risk scoring derived from explicit likelihood & impact.
// - High-impact or irreversible operations require Owner Authorization.
// - Never ignores severe consequences because of low estimated probability.
// =========================================================

import type {
  AdaptivePlanStepNode,
  IdentifiedRisk,
  PlanRiskProfile,
  RiskCategory,
  RiskLikelihood,
  RiskSeverity,
} from "./types.ts";

export interface PlanRiskAssessment extends PlanRiskProfile {
  risks: Array<IdentifiedRisk & { mitigation: string }>;
}

export class RiskAssessmentEngine {
  private static LIKELIHOOD_VALUES: Record<RiskLikelihood, number> = {
    unlikely: 1,
    possible: 2,
    likely: 3,
    almost_certain: 4,
  };

  private static IMPACT_VALUES: Record<RiskSeverity, number> = {
    negligible: 1,
    low: 2,
    medium: 3,
    high: 4,
    critical: 5,
  };

  /**
   * Evaluates the risk profile of an entire plan and its constituent steps.
   */
  assessPlanRisks(nodes: AdaptivePlanStepNode[], goalContext = ""): PlanRiskAssessment {
    const identifiedRisks: IdentifiedRisk[] = [];
    const ownerGates: string[] = [];

    let riskCounter = 1;

    // 1. Check for Irreversible / Consequential Actions
    for (const node of nodes) {
      if (
        node.requiresOwnerAuthorization ||
        node.operatorId.includes("deploy") ||
        node.operatorId.includes("delete") ||
        node.operatorId.includes("migrate") ||
        node.operatorId.includes("trade") ||
        node.operatorId.includes("commit")
      ) {
        const risk: IdentifiedRisk = {
          id: `risk_${riskCounter++}`,
          title: `Consequential Action: ${node.title}`,
          description: `Step ${node.id} executes an action with external side effects or state persistence.`,
          category: "irreversible_action",
          likelihood: "possible",
          impact: "critical",
          riskScore: this.calculateRiskScore("possible", "critical"),
          failureModes: ["Unintended state mutation", "Production drift", "Non-recoverable modification"],
          mitigationStrategy: "Require explicit Owner Authorization gate before dispatching execution.",
          contingencyAction: "Halt at gate; maintain state snapshot for safe rollback.",
          residualRiskSeverity: "low",
          requiresOwnerApproval: true,
        };
        identifiedRisks.push(risk);
        ownerGates.push(`Step ${node.id} (${node.operatorId}): Requires explicit Owner Authority.`);
      }
    }

    // 2. Dependency Chain Risks (Deep dependencies or bottlenecks)
    for (const node of nodes) {
      if (node.dependsOn.length >= 3) {
        identifiedRisks.push({
          id: `risk_${riskCounter++}`,
          title: `High Dependency Convergence: ${node.title}`,
          description: `Step ${node.id} relies on ${node.dependsOn.length} preceding steps; failure in any prerequisite cascades.`,
          category: "dependency",
          likelihood: "possible",
          impact: "medium",
          riskScore: this.calculateRiskScore("possible", "medium"),
          failureModes: ["Cascading block", "Prerequisite unmet", "Stale prerequisite output"],
          mitigationStrategy: "Validate all prerequisite outputs topologically prior to starting step wave.",
          contingencyAction: "Trigger fallback operator or isolate failing sub-branch.",
          residualRiskSeverity: "low",
          requiresOwnerApproval: false,
        });
      }
    }

    // 3. Reliability Risks based on Operator Telemetry
    for (const node of nodes) {
      if (node.reliabilityScore < 0.7) {
        identifiedRisks.push({
          id: `risk_${riskCounter++}`,
          title: `Low Operator Reliability: ${node.operatorId}`,
          description: `Operator historical reliability score is ${(node.reliabilityScore * 100).toFixed(1)}%.`,
          category: "operational",
          likelihood: "likely",
          impact: "medium",
          riskScore: this.calculateRiskScore("likely", "medium"),
          failureModes: ["Execution timeout", "Subsystem error", "Malformed result"],
          mitigationStrategy: "Assign dynamic contingency branch with bounded retry and fallback operator.",
          contingencyAction: "Execute designated fallback operator if primary fails.",
          residualRiskSeverity: "low",
          requiresOwnerApproval: false,
        });
      }
    }

    // 4. Schedule Risks (Long durations)
    const totalEst = nodes.reduce((sum, n) => sum + (n.estimatedDurationMs || 0), 0);
    if (totalEst > 300_000) {
      identifiedRisks.push({
        id: `risk_${riskCounter++}`,
        title: "Extended Execution Duration",
        description: `Plan estimated duration is ${(totalEst / 1000).toFixed(1)}s, creating vulnerability to session interruptions.`,
        category: "schedule",
        likelihood: "possible",
        impact: "medium",
        riskScore: this.calculateRiskScore("possible", "medium"),
        failureModes: ["Session timeout", "Network partition during long-running work"],
        mitigationStrategy: "Checkpoint task state durably after each wave completion.",
        contingencyAction: "Hydrate last valid checkpoint upon session recovery.",
        residualRiskSeverity: "low",
        requiresOwnerApproval: false,
      });
    }

    // Determine Overall Risk Level
    let maxScore = 0;
    for (const r of identifiedRisks) {
      if (r.riskScore > maxScore) maxScore = r.riskScore;
    }

    const hasCriticalImpact = identifiedRisks.some(
      (r) => r.impact === "critical" || r.impact === "CRITICAL" || r.requiresOwnerApproval,
    );

    const rawOverall: "low" | "medium" | "high" | "critical" =
      maxScore >= 16
        ? "critical"
        : (maxScore >= 10 || hasCriticalImpact)
        ? "high"
        : maxScore >= 6
        ? "medium"
        : "low";

    const mitigationPlan = identifiedRisks.map(
      (r) => `[${r.category.toUpperCase()}] ${r.title}: ${r.mitigationStrategy}`,
    );

    const risks = identifiedRisks.map((r) => ({
      ...r,
      impact: typeof r.impact === "string" ? r.impact.toUpperCase() : r.impact,
      mitigation: r.mitigationStrategy,
    }));

    return {
      overallRiskLevel: rawOverall.toUpperCase() as any,
      identifiedRisks,
      risks,
      ownerGatesRequired: ownerGates,
      mitigationPlan,
    };
  }

  private calculateRiskScore(likelihood: RiskLikelihood, impact: RiskSeverity): number {
    const l = RiskAssessmentEngine.LIKELIHOOD_VALUES[likelihood];
    const i = RiskAssessmentEngine.IMPACT_VALUES[impact];
    return l * i;
  }
}
