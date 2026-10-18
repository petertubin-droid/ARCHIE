// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — TYPE DEFINITIONS
//
// Full-agent architecture: DAG-based dependency scheduling,
// Hierarchical Task Networks (HTN), dynamic contingency
// branching, adaptive telemetry & reliability calibration,
// multi-criteria decision analysis, risk assessment,
// resource-bounded allocation, Owner Authority gates,
// and Unified Memory integration.
//
// INVARIANTS:
// - Deterministic throughout: no hallucinated steps or fake costs.
// - Consequential & external actions stop at Owner Authorization.
// - Honest gap reporting: missing operators/preconditions are
//   reported, never magically assumed satisfied.
// - Clear distinction: proposed -> approved -> scheduled ->
//   started -> completed -> verified.
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
  | "proposed"
  | "approved"
  | "scheduled"
  | "started"
  | "in_progress"
  | "completed"
  | "executed"
  | "awaiting_verification"
  | "awaiting_owner"
  | "contingency_active"
  | "failed"
  | "blocked"
  | "skipped"
  | "cancelled"
  | "pending";

export type ContingencyTrigger =
  | "step_failure"
  | "precondition_unmet"
  | "timeout"
  | "owner_denied"
  | "resource_exhausted"
  | "invalid_assumption";

export type ContingencyActionKind =
  | "fallback_operator"
  | "relax_constraint"
  | "request_owner_guidance"
  | "skip_optional"
  | "isolate_and_replan";

export interface ContingencyStrategy {
  triggerOn: ContingencyTrigger;
  action: ContingencyActionKind;
  fallbackOperatorId?: string;
  fallbackDescription?: string;
  rationale: string;
}

// ------------------- RESOURCE ALLOCATION -------------------

export type ResourceType =
  | "time"
  | "compute"
  | "storage"
  | "tool_call"
  | "budget"
  | "human_effort"
  | "quota"
  | "authorized_access";

export interface ResourceRequirement {
  resourceType: ResourceType;
  amount: number;
  unit: string;
  mandatory: boolean;
}

export interface ResourceBudget {
  timeLimitMs?: number;
  maxCost?: number;
  maxComputeTokens?: number;
  toolCallQuota?: number;
  storageBytesLimit?: number;
  maxConcurrentTasks?: number;
  financialBudget?: number;
}

export interface ResourceAllocation {
  resourceType: ResourceType;
  allocated: number;
  available: number;
  limit: number;
  unit: string;
}

export interface ResourceConflict {
  resourceType: ResourceType;
  requested: number;
  available: number;
  deficit: number;
  affectedStepIds: string[];
  recommendation: string;
}

// ------------------- STRUCTURED GOALS -------------------

export type GoalPriority = "critical" | "high" | "medium" | "low";

export interface GoalConstraint {
  id: string;
  type: "HARD" | "SOFT";
  kind: "USER" | "RESOURCE" | "TEMPORAL" | "SECURITY" | "POLICY";
  statement: string;
  bound?: {
    dimension: string;
    value: number;
    unit?: string;
    op: "<=" | ">=" | "==" | "<" | ">";
  } | null;
  satisfied?: boolean;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  metric?: string;
  targetValue?: string | number;
  verificationMethod: "automated" | "manual_owner" | "corroboration" | "heuristic";
  satisfied: boolean;
}

export interface StructuredGoal {
  id: string;
  title: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  desiredOutcomes: string[];
  constraints: GoalConstraint[];
  priority: GoalPriority;
  targetDate?: string | null;
  resourceBudget: ResourceBudget;
  qualityRequirements: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  explicitExclusions: string[];
  successConditions: string[];
  failureConditions: string[];
  assumptions: string[];
  isAmbiguous: boolean;
  ambiguityQuestions: string[];
  provenance: {
    source: "user_utterance" | "owner_directive" | "operational_requirement";
    rawInput: string;
    timestamp: string;
  };
  verificationRequirements: string[];
}

// ------------------- DECISION INTELLIGENCE -------------------

export interface DecisionCriterion {
  id: string;
  name: string;
  weight: number;
  direction: "maximize" | "minimize";
  description: string;
}

export interface DecisionAlternative {
  id: string;
  name: string;
  description: string;
  scores: Record<string, number>;
  qualitativeNotes?: Record<string, string>;
  reversibility: "high" | "medium" | "low";
  operationalComplexity: "high" | "medium" | "low";
  estimatedCost?: number;
  estimatedTimeMs?: number;
  securityRisk?: "none" | "low" | "medium" | "high";
  requiresOwnerApproval?: boolean;
}

export interface EvaluatedAlternative {
  alternative: DecisionAlternative;
  compositeScore: number;
  rank: number;
  paretoOptimal: boolean;
  tradeOffs: string[];
  sensitivityNotes?: string[];
}

export interface DecisionEvaluationResult {
  criteria: DecisionCriterion[];
  rankedAlternatives: EvaluatedAlternative[];
  recommendedOptionId: string | null;
  tradeOffSummary: string;
  methodology: "MCDA_WEIGHTED_SUM" | "PARETO_DOMINANCE" | "DIRECT_REASONING";
  sensitivityAnalysis?: Record<string, string>;
}

// ------------------- RISK ASSESSMENT -------------------

export type RiskCategory =
  | "dependency"
  | "security"
  | "resource"
  | "schedule"
  | "operational"
  | "irreversible_action";

export type RiskSeverity = "negligible" | "low" | "medium" | "high" | "critical";
export type RiskLikelihood = "unlikely" | "possible" | "likely" | "almost_certain";

export interface IdentifiedRisk {
  id: string;
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: RiskLikelihood;
  impact: RiskSeverity;
  riskScore: number; // 1 to 25
  failureModes: string[];
  mitigationStrategy: string;
  contingencyAction: string;
  residualRiskSeverity: RiskSeverity;
  requiresOwnerApproval: boolean;
}

export interface PlanRiskProfile {
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  identifiedRisks: IdentifiedRisk[];
  ownerGatesRequired: string[];
  mitigationPlan: string[];
}

// ------------------- UNCERTAINTY & ASSUMPTIONS -------------------

export type EpistemicStatus = "FACT" | "ASSUMPTION" | "INFERENCE" | "UNKNOWN";

export interface TrackedAssumption {
  id: string;
  statement: string;
  status: EpistemicStatus;
  source: string;
  confidence: number;
  impactIfInvalid: "low" | "medium" | "high";
  validationMethod?: string;
  isVerified: boolean;
}

export type DecisionUnderUncertaintyPolicy =
  | "proceed"
  | "ask_clarification"
  | "gather_evidence"
  | "simulate"
  | "reversible_fallback"
  | "defer"
  | "stop";

export interface UncertaintyAssessment {
  assumptions: TrackedAssumption[];
  overallConfidence: number;
  missingInformation: string[];
  recommendedPolicy: DecisionUnderUncertaintyPolicy;
  rationale: string;
}

// ------------------- OWNER AUTHORITY GATES -------------------

export type ProtectedActionClassification =
  | "read_analysis"
  | "recommendation"
  | "patch_design"
  | "dev_file_modification"
  | "production_migration"
  | "production_data_change"
  | "release_deployment";

export interface OwnerAuthorityGate {
  actionClassification: ProtectedActionClassification;
  requiresApproval: boolean;
  isApproved: boolean;
  approver?: string;
  approvalTimestamp?: string;
  rationale: string;
}

// ------------------- PLAN STEP & DAG NODES -------------------

export interface AdaptivePlanStepNode {
  id: string;
  operatorId: string;
  title: string;
  achieves: string;
  satisfies: string;
  dependsOn: string[];
  softPreferences?: string[];
  estimatedDurationMs: number;
  optimisticDurationMs: number;
  pessimisticDurationMs: number;
  measuredDurationMs?: number;
  baseCost: number;
  adaptiveCost: number;
  reliabilityScore: number;
  requiresOwnerAuthorization: boolean;
  actionClassification?: ProtectedActionClassification;
  milestoneId?: string;
  status: PlanExecutionStatus;
  resourceRequirements?: ResourceRequirement[];
  verificationMethod?: "automated" | "manual_owner" | "corroboration" | "heuristic";
  verificationVerdict?: "PASS" | "FAIL" | "UNVERIFIED" | null;
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
  deliverables?: string[];
  validationCheckpoint?: string;
}

export interface AdaptivePlan {
  id: string;
  version: number;
  goal: string;
  goalSubject: string;
  structuredGoal?: StructuredGoal;
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
  evaluatedAlternatives?: EvaluatedAlternative[];
  riskProfile?: PlanRiskProfile;
  uncertaintyAssessment?: UncertaintyAssessment;
  resourceAllocations?: ResourceAllocation[];
  resourceConflicts?: ResourceConflict[];
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
  version: number;
  timestamp: string;
  completedStepIds: string[];
  stepResults: Record<string, string>;
  stepVerdicts: Record<string, "PASS" | "FAIL" | "UNVERIFIED">;
  currentWaveIndex: number;
  resumedFromCheckpoint: boolean;
}

export interface AdaptivePlanRequest {
  goal: string | FactPattern | StructuredGoal;
  profile?: PlanningObjectiveProfile;
  depth?: number;
  workingMemoryConstraints?: string[];
  resourceBudget?: ResourceBudget;
  domainContext?: string;
  checkpoint?: ExecutionCheckpoint;
  requireStrictValidation?: boolean;
}

export interface WaveExecutionResult {
  waveIndex: number;
  stepResults: Array<{
    stepId: string;
    operatorId: string;
    status: PlanExecutionStatus;
    verificationVerdict?: "PASS" | "FAIL" | "UNVERIFIED" | null;
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
  resourceConflictsEncountered: number;
  ownerGatesEnforced: number;
  verificationFailures: number;
}

// ------------------- REPLANNING -------------------

export type ReplanTrigger =
  | "step_failure"
  | "precondition_unmet"
  | "requirement_change"
  | "new_evidence"
  | "resource_exhausted"
  | "deadline_missed"
  | "invalid_assumption"
  | "security_restriction"
  | "world_state_change";

export interface ReplanRequest {
  plan: AdaptivePlan;
  trigger: ReplanTrigger;
  reason: string;
  failedStepId?: string;
  newConstraints?: string[];
  newObjectives?: string[];
}

export interface ReplanResult {
  originalPlanId: string;
  revisedPlan: AdaptivePlan;
  preservedStepIds: string[];
  discardedStepIds: string[];
  addedStepIds: string[];
  minimalPerturbation: boolean;
  reason: string;
}
