// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — TYPE DEFINITIONS
//
// Full-agent architecture: DAG-based dependency scheduling,
// Hierarchical Task Networks (HTN), dynamic contingency
// branching, adaptive telemetry & reliability calibration,
// partial checkpoint repair, and Unified Memory integration.
//
// INVARIANTS:
// - Deterministic throughout: no hallucinated steps or fake costs.
// - Consequential & external actions stop at Owner Authorization.
// - Honest gap reporting: missing operators/preconditions are
//   reported, never magically assumed satisfied.
// =========================================================

import type {
  Fact,
  FactPattern,
  Operator,
  Plan,
  PlanAlternative,
  PlanLesson,
  PlanStep,
} from "../native-engine/types.ts";

export type PlanningObjectiveProfile =
  | "balanced"
  | "fastest"
  | "lowest_cost"
  | "highest_reliability"
  | "conservative";

export type PlanExecutionStatus =
  | "pending"
  | "in_progress"
  | "executed"
  | "awaiting_owner"
  | "contingency_active"
  | "failed"
  | "blocked"
  | "skipped";

export type ContingencyTrigger =
  | "step_failure"
  | "precondition_unmet"
  | "timeout"
  | "owner_denied";

export type ContingencyActionKind =
  | "fallback_operator"
  | "relax_constraint"
  | "request_owner_guidance"
  | "skip_optional";

export interface ContingencyStrategy {
  triggerOn: ContingencyTrigger;
  action: ContingencyActionKind;
  fallbackOperatorId?: string;
  fallbackDescription?: string;
  rationale: string;
}

export interface AdaptivePlanStepNode {
  id: string;
  operatorId: string;
  title: string;
  achieves: string;
  satisfies: string;
  dependsOn: string[];
  estimatedDurationMs: number;
  optimisticDurationMs: number;
  pessimisticDurationMs: number;
  baseCost: number;
  adaptiveCost: number;
  reliabilityScore: number;
  requiresOwnerAuthorization: boolean;
  milestoneId?: string;
  status: PlanExecutionStatus;
  result?: string;
  error?: string;
  contingency?: ContingencyStrategy;
  executedAt?: string;
}

export interface CriticalPathAnalysis {
  criticalPathStepIds: string[];
  totalEstimatedDurationMs: number;
  slackPerStep: Record<string, number>;
  parallelExecutionWaves: string[][];
  bottlenecks: Array<{
    stepId: string;
    reason: string;
  }>;
}

export interface HierarchicalMilestone {
  id: string;
  title: string;
  order: number;
  subGoals: string[];
  stepIds: string[];
  status: "pending" | "active" | "completed" | "blocked";
  dependsOnMilestones?: string[];
}

export interface AdaptivePlan {
  id: string;
  goal: string;
  goalSubject: string;
  profile: PlanningObjectiveProfile;
  nodes: AdaptivePlanStepNode[];
  milestones: HierarchicalMilestone[];
  criticalPath: CriticalPathAnalysis;
  executable: boolean;
  totalCost: number;
  adaptiveTotalCost: number;
  overallReliability: number;
  gapReport: string[];
  alternatives: PlanAlternative[];
  requiresOwnerAuthorization: boolean;
  activeConstraints: string[];
  relevantLessons: PlanLesson[];
  contingencyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorTelemetry {
  operatorId: string;
  domain: string;
  invocations: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastExecutedAt: string;
  recentFailureReasons: string[];
}

export interface ExecutionCheckpoint {
  planId: string;
  timestamp: string;
  completedStepIds: string[];
  stepResults: Record<string, string>;
  currentWaveIndex: number;
  resumedFromCheckpoint: boolean;
}

export interface AdaptivePlanRequest {
  goal: string | FactPattern;
  profile?: PlanningObjectiveProfile;
  depth?: number;
  workingMemoryConstraints?: string[];
  domainContext?: string;
  checkpoint?: ExecutionCheckpoint;
}

export interface WaveExecutionResult {
  waveIndex: number;
  stepResults: Array<{
    stepId: string;
    operatorId: string;
    status: PlanExecutionStatus;
    result?: string;
    error?: string;
    contingencyTriggered?: boolean;
  }>;
  waveCompleted: boolean;
  blockedForOwner: boolean;
  nextWaveIndex?: number;
}

export interface AdaptivePlanningDiagnostics {
  totalPlansGenerated: number;
  successfulExecutions: number;
  failedExecutions: number;
  contingenciesTriggered: number;
  repairsPerformed: number;
  trackedOperatorsCount: number;
  averagePlanReliability: number;
}
