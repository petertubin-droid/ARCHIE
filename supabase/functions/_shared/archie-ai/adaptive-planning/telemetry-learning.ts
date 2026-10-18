// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — TELEMETRY & LEARNING
//
// Operator performance tracking, adaptive cost calibration,
// Laplace-smoothed reliability estimation, and expected-utility
// ranking for means-ends planning.
// =========================================================

import type { Operator } from "../native-engine/types.ts";
import type { OperatorTelemetry, PlanningObjectiveProfile } from "./types.ts";

export class OperatorTelemetryStore {
  private telemetry = new Map<string, OperatorTelemetry>();

  constructor() {
    this.seedDefaultTelemetry();
  }

  private seedDefaultTelemetry(): void {
    // Seed high-confidence baselines for core operators
    const seeds: Array<Partial<OperatorTelemetry> & { operatorId: string; domain: string }> = [
      {
        operatorId: "op_inventory_prerequisites",
        domain: "knowledge",
        invocations: 50,
        successes: 49,
        failures: 1,
        totalDurationMs: 2500,
      },
      {
        operatorId: "op_identify_gaps",
        domain: "knowledge",
        invocations: 45,
        successes: 45,
        failures: 0,
        totalDurationMs: 1800,
      },
      {
        operatorId: "op_answer_from_knowledge",
        domain: "knowledge",
        invocations: 80,
        successes: 78,
        failures: 2,
        totalDurationMs: 3200,
      },
      {
        operatorId: "op_reason_over_facts",
        domain: "reasoning",
        invocations: 60,
        successes: 58,
        failures: 2,
        totalDurationMs: 4800,
      },
      {
        operatorId: "op_web_research",
        domain: "research",
        invocations: 30,
        successes: 24,
        failures: 6,
        totalDurationMs: 15000,
      },
      {
        operatorId: "op_sequence_tasks",
        domain: "planning",
        invocations: 40,
        successes: 40,
        failures: 0,
        totalDurationMs: 1600,
      },
      {
        operatorId: "op_draft_plan",
        domain: "planning",
        invocations: 35,
        successes: 35,
        failures: 0,
        totalDurationMs: 1400,
      },
      {
        operatorId: "op_propose_execution",
        domain: "governance",
        invocations: 35,
        successes: 35,
        failures: 0,
        totalDurationMs: 700,
      },
    ];

    for (const seed of seeds) {
      const invocations = seed.invocations ?? 10;
      const totalDur = seed.totalDurationMs ?? 1000;
      this.telemetry.set(seed.operatorId, {
        operatorId: seed.operatorId,
        domain: seed.domain,
        invocations,
        successes: seed.successes ?? invocations,
        failures: seed.failures ?? 0,
        totalDurationMs: totalDur,
        averageDurationMs: Math.round(totalDur / Math.max(1, invocations)),
        lastExecutedAt: new Date().toISOString(),
        recentFailureReasons: [],
      });
    }
  }

  getTelemetry(operatorId: string, domain = "general"): OperatorTelemetry {
    let stat = this.telemetry.get(operatorId);
    if (!stat) {
      stat = {
        operatorId,
        domain,
        invocations: 0,
        successes: 0,
        failures: 0,
        totalDurationMs: 0,
        averageDurationMs: 150,
        lastExecutedAt: new Date().toISOString(),
        recentFailureReasons: [],
      };
      this.telemetry.set(operatorId, stat);
    }
    return stat;
  }

  /**
   * Computes Laplace-smoothed reliability:
   * (successes + 1) / (successes + failures + 2)
   */
  computeReliability(operatorId: string): number {
    const stat = this.getTelemetry(operatorId);
    const num = stat.successes + 1;
    const den = stat.successes + stat.failures + 2;
    return Number((num / den).toFixed(3));
  }

  /**
   * Computes dynamic adaptive cost adjusting base cost based
   * on failure history and duration penalties.
   */
  computeAdaptiveCost(op: Operator): number {
    const stat = this.getTelemetry(op.id);
    const baseCost = op.cost || 1;
    if (stat.invocations === 0) return baseCost;

    const failureRatio = stat.failures / Math.max(1, stat.invocations);
    // Increase cost by up to 3x if failure rate is high
    const costMultiplier = 1 + 2 * failureRatio;

    // Latency factor: slight cost penalty if average duration is > 1000ms
    const latencyPenalty = stat.averageDurationMs > 1000 ? 1.2 : 1.0;

    return Number((baseCost * costMultiplier * latencyPenalty).toFixed(2));
  }

  /**
   * Expected utility calculation based on objective profile.
   */
  computeUtility(
    op: Operator,
    profile: PlanningObjectiveProfile = "balanced",
  ): number {
    const reliability = this.computeReliability(op.id);
    const adaptiveCost = this.computeAdaptiveCost(op);
    const stat = this.getTelemetry(op.id);
    const avgDuration = Math.max(50, stat.averageDurationMs);

    switch (profile) {
      case "fastest":
        // Prioritize minimum duration and reliability
        return (reliability * 1000) / avgDuration;
      case "lowest_cost":
        // Prioritize minimum cost
        return 1 / Math.max(0.1, adaptiveCost);
      case "highest_reliability":
        // Heavily weight reliability
        return Math.pow(reliability, 3) / Math.max(0.5, adaptiveCost);
      case "conservative":
        // Severely penalize failures and external unvalidated sources
        return op.id.includes("research") || op.id.includes("external")
          ? 0.1
          : (reliability * 2) / Math.max(0.5, adaptiveCost);
      case "balanced":
      default:
        // Balanced utility = reliability / adaptiveCost
        return reliability / Math.max(0.1, adaptiveCost);
    }
  }

  /**
   * Records execution outcome and updates running averages.
   */
  recordExecution(
    operatorId: string,
    success: boolean,
    durationMs: number,
    failureReason?: string,
    domain = "general",
  ): void {
    const stat = this.getTelemetry(operatorId, domain);
    stat.invocations += 1;
    if (success) {
      stat.successes += 1;
    } else {
      stat.failures += 1;
      if (failureReason) {
        stat.recentFailureReasons = [
          failureReason,
          ...stat.recentFailureReasons.slice(0, 4),
        ];
      }
    }
    stat.totalDurationMs += durationMs;
    stat.averageDurationMs = Math.round(stat.totalDurationMs / stat.invocations);
    stat.lastExecutedAt = new Date().toISOString();
  }

  getAllTelemetry(): OperatorTelemetry[] {
    return Array.from(this.telemetry.values());
  }
}
