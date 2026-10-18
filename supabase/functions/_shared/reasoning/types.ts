// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE — TYPES
//
// The fifth permanent intelligence layer (spec §§1–40).
// It sits ABOVE and CONSUMES the four existing layers:
//   * Universal Lexicon Engine         (sense resolution)
//   * Semantic Knowledge Graph Engine   (concept retrieval)
//   * Context & Inference Engine        (FACT/INFERENCE
//                                        premises, rules,
//                                        contradictions)
//   * Evidence & Truth Engine           (verification states,
//                                        provenance, conflicts)
// It NEVER duplicates or re-stamps their data: reasoning
// records REFERENCE concept keys, claim ids and evidence ids
// produced by the lower layers (spec §34 storage rule).
//
// EPISTEMIC DISCIPLINE (spec §9, §18):
//   FACT        — established by the lower layers with
//                 evidence, or user-provided (labeled)
//   ASSUMPTION  — explicitly tracked, NEVER promoted to fact
//   INFERENCE   — derived by an allowed reasoning step,
//                 provenance retained
//   UNKNOWN     — honestly reported, never invented
// =========================================================

/** Problem classification categories (spec §5). */
export const PROBLEM_CATEGORIES = [
  "DEDUCTIVE",
  "INDUCTIVE",
  "ABDUCTIVE",
  "CAUSAL",
  "COMPARATIVE",
  "MATHEMATICAL",
  "SPATIAL",
  "TEMPORAL",
  "CONSTRAINT",
  "DIAGNOSTIC",
  "PLANNING",
  "OPTIMIZATION",
  "MULTI_DOMAIN",
  "GENERIC",
] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

/** Epistemic state of any premise used in reasoning. */
export const KNOWLEDGE_STATES = [
  "FACT",
  "ASSUMPTION",
  "INFERENCE",
  "UNKNOWN",
] as const;
export type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];

/** A premise entering reasoning, with its epistemic state and
 *  source reference (never a duplicated lower-layer record). */
export interface ReasoningPremise {
  id: string;
  statement: string;
  state: KnowledgeState;
  /** Where it came from: LEXICON | SEMANTIC_GRAPH | INFERENCE |
   *  EVIDENCE | USER_PROVIDED | FRELUX_ENGINE | CALCULATION. */
  source: string;
  /** Lower-layer row reference (claim id, concept key, engine
   *  id…) — a reference, not a copy (spec §34). */
  ref?: string;
  /** Numeric value when the premise is quantitative. */
  quantity?: Quantity;
  /** Confidence 0..1 from the producing layer, if any. */
  confidence?: number;
}

/** Assumption tracking (spec §9). */
export interface Assumption {
  id: string;
  statement: string;
  reason: string;
  source: string;
  userProvided: boolean;
  necessary: boolean;
  /** What changes in the solution if the assumption is wrong. */
  effect: string;
}

/** Constraints (spec §8). */
export type ConstraintKind = "HARD" | "SOFT";
export type ConstraintType =
  | "DOMAIN"
  | "MATHEMATICAL"
  | "TEMPORAL"
  | "RESOURCE"
  | "USER"
  | "SAFETY"
  | "SYSTEM";

export interface ProblemConstraint {
  id: string;
  kind: ConstraintKind;
  type: ConstraintType;
  statement: string;
  /** Machine-readable bound extracted from the statement, when
   *  deterministic extraction succeeded; null otherwise. */
  bound: { quantity: Quantity; op: "<=" | ">=" | "<" | ">" | "=" } | null;
}

export interface ConstraintOutcome {
  constraintId: string;
  satisfied: boolean;
  /** How much room remains for a HARD constraint (margin), or
   *  null when the check is not numeric. */
  margin: number | null;
}

/** Units and dimensions (spec §15). */
export const DIMENSIONS = [
  "LENGTH",
  "AREA",
  "VOLUME",
  "MASS",
  "TIME",
  "CURRENCY",
  "QUANTITY",
  "RATE",
  "PERCENTAGE",
  "ANGLE",
  "TEMPERATURE",
  "DIMENSIONLESS",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface Quantity {
  value: number;
  unit: string;
  dimension: Dimension;
}

/** Structured problem representation (spec §4). Optional
 *  fields stay absent — no problem must fill every field. */
export interface ReasoningProblem {
  id: string;
  objective: string;
  inputs: Quantity[];
  knownFacts: ReasoningPremise[];
  unknowns: string[];
  assumptions: Assumption[];
  constraints: ProblemConstraint[];
  desiredOutput: string | null;
  domain: string;
  temporalContext: string | null;
  geographicContext: string | null;
  evidenceRequirements: string[];
  /** Subproblem DAG (spec §6) — empty for simple problems. */
  subproblems: SubProblem[];
  intermediateResults: ReasoningPremise[];
  candidates: CandidateSolution[];
  validationState: ValidationState;
  failure: FailureAnalysis | null;
  /** What-if / counterfactual framing (spec §§22–23). */
  hypothetical: boolean;
}

export interface SubProblem {
  id: string;
  objective: string;
  inputs: string[];
  /** Subproblem ids this one depends on (spec §7). */
  dependencies: string[];
  evidenceRequirements: string[];
  result: ReasoningPremise | null;
  validationState: ValidationState;
}

export interface CandidateSolution {
  id: string;
  description: string;
  /** Premise ids supporting this solution. */
  premiseIds: string[];
  assumptions: string[];
  constraintsSatisfied: ConstraintOutcome[];
  constraintsViolated: ConstraintOutcome[];
  evidenceState: "EVIDENCED" | "PARTIAL" | "UNEVIDENCED";
  risks: string[];
  validationState: ValidationState;
  final: boolean;
  hypothetical: boolean;
  /** FRELUX engine that computed it, when one did (spec §16). */
  freluxEngineId: string | null;
}

export type ValidationState =
  | "PENDING"
  | "VALIDATED"
  | "PARTIALLY_VALIDATED"
  | "FAILED"
  | "NOT_APPLICABLE";

export interface ValidationCheck {
  name:
    | "LOGICAL_CONSISTENCY"
    | "EVIDENCE_CONSISTENCY"
    | "CONSTRAINT_COMPLIANCE"
    | "MATHEMATICAL_CORRECTNESS"
    | "UNIT_CORRECTNESS"
    | "TEMPORAL_CONSISTENCY"
    | "DOMAIN_CONSISTENCY"
    | "CONTRADICTION"
    | "COMPLETENESS";
  passed: boolean;
  detail: string;
}

export interface ValidationReport {
  state: ValidationState;
  checks: ValidationCheck[];
  /** Which inputs were missing for completeness, if any. */
  missingInputs: string[];
}

/** Failure analysis (spec §20). */
export const FAILURE_KINDS = [
  "INSUFFICIENT_INFORMATION",
  "CONTRADICTORY_REQUIREMENTS",
  "IMPOSSIBLE_CONSTRAINTS",
  "UNAVAILABLE_EVIDENCE",
  "INVALID_ASSUMPTION",
  "MATHEMATICAL_IMPOSSIBILITY",
  "UNSUPPORTED_PREMISE",
  "SYSTEM_LIMITATION",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export interface FailureAnalysis {
  kind: FailureKind;
  statement: string;
  /** The specific blocking condition, stated for the owner. */
  blocking: string[];
  /** What information would unblock the problem, if any. */
  neededToUnblock: string[];
}

/** One reasoning step in a chain (spec §10). Provenance is
 *  retained; chain-of-thought NEVER leaves the audit trace. */
export interface ReasoningStep {
  id: string;
  /** Premise/step ids this step consumed. */
  fromIds: string[];
  operation: string;
  /** The result this step produced (an INFERENCE premise). */
  produces: ReasoningPremise;
}

/** Sensitivity analysis (spec §21). Only real computed values. */
export interface SensitivityResult {
  inputId: string;
  label: string;
  /** Result change for a ±10% input perturbation (or the
   *  caller-supplied delta). */
  sensitivityLow: number | null;
  sensitivityHigh: number | null;
  impact: "HIGH" | "MEDIUM" | "LOW";
}

/** FRELUX deterministic calculator integration (spec §16).
 *  The adapter is the ONLY path to FRELUX math. The reasoning
 *  engine NEVER re-derives FRELUX formulas. Wired to the
 *  canonical registry (frelix-api engines bundle) in
 *  production; tests may substitute the BOUNDARY only. */
export interface FreluxCalculationAdapter {
  listEngines(): Array<{ id: string; domain: string; title: string }>;
  executeEngine(
    engineId: string,
    input: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    result?: Record<string, unknown>;
    error?: string;
    validation?: unknown;
  }>;
}

/** Domain plug-in (spec §27). Domains contribute rules,
 *  constraints, terminology, evidence requirements, validation
 *  and the FRELUX engine ids they are entitled to invoke. */
export interface DomainPlugIn {
  id: string;
  name: string;
  keywords: string[];
  constraints: ProblemConstraint[];
  terminology: string[];
  evidenceRequirements: string[];
  /** FRELUX engine ids this domain may invoke (spec §16). */
  freluxEngineIds: string[];
  /** Domain-level validation hook, applied to candidates. */
  validate?(
    candidate: CandidateSolution,
    context: ReasoningProblem,
  ): ValidationCheck[];
}

/** Persistence client (supabase-js subset) — satisfied by the
 *  archie-core service client and the test harness fake. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReasoningClient {
  from: (table: string) => any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Reasoning metrics — real counted values only (spec §36). */
export interface ReasoningMetrics {
  problemsProcessed: number;
  solutionsValidated: number;
  unresolvedProblems: number;
  validationFailures: number;
  contradictionDetections: number;
  totalReasoningDepth: number;
  depthSamples: number;
  failedPaths: number;
  calculatorAssisted: number;
  evidenceAssisted: number;
  reasoningErrors: number;
}

export function emptyReasoningMetrics(): ReasoningMetrics {
  return {
    problemsProcessed: 0,
    solutionsValidated: 0,
    unresolvedProblems: 0,
    validationFailures: 0,
    contradictionDetections: 0,
    totalReasoningDepth: 0,
    depthSamples: 0,
    failedPaths: 0,
    calculatorAssisted: 0,
    evidenceAssisted: 0,
    reasoningErrors: 0,
  };
}

/** The per-turn reasoning outcome returned to the live ARCHIE
 *  pipeline (archie-core) — the same contract pattern as the
 *  lexicon/graph/inference/evidence layers. */
export interface ReasoningGroundTruth {
  /** Prompt block for the model: solution summary + constraints
   *  + assumptions + uncertainty. NEVER chain-of-thought. */
  block: string;
  applicable: boolean;
  category: ProblemCategory;
  /** The final validated solution, when one was reached. */
  solution: string | null;
  solutionQuantities: Quantity[];
  candidates: CandidateSolution[];
  assumptions: Assumption[];
  unknowns: string[];
  missingInputs: string[];
  failure: FailureAnalysis | null;
  /** User-facing concise explanation (spec §26). */
  explanation: string;
  /** Sensitivity/what-if/counterfactual results when run. */
  sensitivity: SensitivityResult[];
  metrics: ReasoningMetrics;
  /** Machine-readable audit trace — audit ledger ONLY, never
   *  exposed to users as reasoning (spec §16, §10). */
  trace: {
    problemId: string;
    steps: ReasoningStep[];
    subproblems: SubProblem[];
    validation: ValidationReport | null;
    freluxEnginesInvoked: string[];
    loopTerminations: string[];
    durationMs: number;
  };
}

export function emptyReasoningGroundTruth(): ReasoningGroundTruth {
  return {
    block: "",
    applicable: false,
    category: "GENERIC",
    solution: null,
    solutionQuantities: [],
    candidates: [],
    assumptions: [],
    unknowns: [],
    missingInputs: [],
    failure: null,
    explanation: "",
    sensitivity: [],
    metrics: emptyReasoningMetrics(),
    trace: {
      problemId: "",
      steps: [],
      subproblems: [],
      validation: null,
      freluxEnginesInvoked: [],
      loopTerminations: [],
      durationMs: 0,
    },
  };
}

/** Live-turn input assembled from the lower layers — every
 *  entry is a reference produced by a lower layer this turn,
 *  never a re-computation (spec §3). */
export interface ReasoningTurnInput {
  message: string;
  intent: string;
  /** FACT premises from the Context & Inference Engine. */
  facts: Array<{
    id: string;
    statement: string;
    source: string;
    conceptKey?: string;
  }>;
  /** Rule-derived conclusions from the inference layer. */
  inferences: Array<{
    id: string;
    ruleId: string;
    statement: string;
    confidence?: number;
    premiseIds: string[];
  }>;
  /** User premises detected this turn. */
  userPremises: Array<{ id: string; statement: string }>;
  /** Contradictions flagged by the inference layer. */
  contradictions: Array<{ statement: string }>;
  /** Evidence layer verification states (claim id → state). */
  evidenceStates: Array<{ claimId: string; state: string }>;
  /** Concept keys the graph identified this turn. */
  conceptKeys: string[];
  /** Domain candidates from the context model. */
  domainCandidates: string[];
}

/** Bounded budgets (spec §30) — runaway reasoning prevention. */
export interface ReasoningLimits {
  /** Max chained reasoning steps per problem. */
  maxSteps: number;
  /** Max decomposition depth. */
  maxDepth: number;
  /** Max candidate solutions enumerated. */
  maxCandidates: number;
  /** Max graph concepts consulted per problem. */
  maxConcepts: number;
  /** Max FRELUX engine invocations per problem. */
  maxEngineInvocations: number;
  /** Max characters of the prompt block (bounded payload). */
  maxBlockChars: number;
}

export const DEFAULT_REASONING_LIMITS: ReasoningLimits = {
  maxSteps: 24,
  maxDepth: 4,
  maxCandidates: 6,
  maxConcepts: 8,
  maxEngineInvocations: 2,
  maxBlockChars: 1800,
};

// =========================================================
// ADVANCED UNIFIED REASONING ENGINE — EXPANDED TYPES
// Spec Sections 3, 4, 8, 9, 10
// =========================================================

/** 1. Analytical Reasoning Types */
export interface ProblemVariable {
  name: string;
  type: "QUANTITATIVE" | "QUALITATIVE" | "BOOLEAN" | "CATEGORICAL";
  currentValue?: string | number | boolean;
  domain?: string;
  dependencies: string[];
}

export interface RootCauseFactor {
  factor: string;
  isRootCause: boolean;
  confidence: number;
  evidence: string[];
  symptoms: string[];
}

export interface AnalyticalResult {
  problemSummary: string;
  variables: ProblemVariable[];
  dependencies: Array<{ from: string; to: string; relation: string }>;
  rootCauses: RootCauseFactor[];
  symptoms: string[];
  correlationVsCausationNotes: string[];
  conclusion: string;
}

/** 2. Deductive Reasoning Types */
export type DeductiveRuleForm =
  | "MODUS_PONENS"
  | "MODUS_TOLLENS"
  | "HYPOTHETICAL_SYLLOGISM"
  | "DISJUNCTIVE_SYLLOGISM"
  | "UNIVERSAL_INSTANTIATION"
  | "CUSTOM_RULE";

export interface DeductiveRule {
  id: string;
  form: DeductiveRuleForm;
  antecedent: string;
  consequent: string;
  statement: string;
  source: string;
  weight?: number;
}

export interface DeductiveDeduction {
  conclusion: string;
  ruleId: string;
  premiseIds: string[];
  assumptionsUsed: string[];
  isValid: boolean;
  isSound: boolean;
  qualification?: string;
}

/** 3. Inductive Reasoning Types */
export interface Observation {
  id: string;
  statement: string;
  timestamp?: string;
  source: string;
  verified: boolean;
  metadata?: Record<string, unknown>;
}

export interface InductiveGeneralization {
  hypothesis: string;
  patternDetected: string;
  observationCount: number;
  supportingObservations: string[];
  counterExamples: string[];
  sampleSizeAdequate: boolean;
  potentialBiases: string[];
  confidenceScore: number;
  qualification: string;
}

/** 4. Abductive Reasoning Types */
export interface AbductiveHypothesis {
  id: string;
  explanation: string;
  explanatoryCoverage: number;
  assumptionsRequired: string[];
  contradictoryEvidence: string[];
  supportingEvidence: string[];
  plausibilityScore: number;
  isProven: boolean;
  discriminatingTest?: string;
}

export interface AbductiveResult {
  observedPhenomenon: string;
  hypotheses: AbductiveHypothesis[];
  mostPlausibleHypothesisId: string | null;
  competingAlternatives: string[];
  missingEvidenceNeeded: string[];
  recommendedInvestigation: string[];
}

/** 5. Causal Reasoning Types */
export interface CausalRelationship {
  cause: string;
  effect: string;
  type: "DIRECT" | "INDIRECT" | "CONTRIBUTING" | "COINCIDENTAL";
  necessary: boolean;
  sufficient: boolean;
  confoundingVariables: string[];
  evidenceWeight: number;
}

export interface CausalIntervention {
  variable: string;
  proposedChange: string;
  predictedDirectEffects: string[];
  predictedSideEffects: string[];
  reversibility: "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE";
  confidence: number;
}

export interface CausalResult {
  graphNodes: string[];
  relationships: CausalRelationship[];
  rootCauses: string[];
  feedbackLoops: Array<{ variables: string[]; loopType: "REINFORCING" | "BALANCING" }>;
  interventions: CausalIntervention[];
  caveats: string[];
}

/** 6. Comparative and Decision Reasoning Types */
export interface DecisionCriterion {
  id: string;
  name: string;
  weight: number;
  isHardConstraint: boolean;
  minThreshold?: number;
  maxThreshold?: number;
}

export interface AlternativeOption {
  id: string;
  name: string;
  description: string;
  scores: Record<string, number>;
  hardConstraintCompliant: boolean;
  estimatedCost?: Quantity;
  estimatedRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reversibility: "REVERSIBLE" | "ONE_WAY_DOOR";
  shortTermConsequences: string[];
  longTermConsequences: string[];
  opportunityCost: string[];
}

export interface ComparativeResult {
  criteria: DecisionCriterion[];
  alternatives: AlternativeOption[];
  recommendedOptionId: string | null;
  tradeOffSummary: string;
  paretoOptimalSet: string[];
  sensitivityToWeights: string[];
  uncertainties: string[];
}

/** 7. Probabilistic and Uncertainty Reasoning Types */
export interface ProbabilisticAssessment {
  uncertaintyType: "ALEATORIC" | "EPISTEMIC" | "MIXED";
  priorProbability?: number;
  posteriorProbability?: number;
  evidenceStrength?: "STRONG" | "MODERATE" | "WEAK" | "ANECDOTAL";
  confidenceInterval?: { low: number; high: number };
  scenarioAnalysis: {
    bestCase: { description: string; likelihood: string };
    expectedCase: { description: string; likelihood: string };
    worstCase: { description: string; likelihood: string };
  };
  assumptionsDependencies: string[];
  calibrationHonestyStatement: string;
}

/** 8. Bounded Recursive Review and Self-Correction Types */
export interface ReviewIteration {
  iteration: number;
  candidateSummary: string;
  checksExecuted: Array<{ checkName: string; passed: boolean; message: string }>;
  flawsIdentified: string[];
  correctionsApplied: string[];
  converged: boolean;
}

export interface RecursiveReviewReport {
  totalIterations: number;
  maxIterationsAllowed: number;
  converged: boolean;
  initialCandidate: string;
  finalCandidate: string;
  flawsFixed: string[];
  remainingUnresolvedFlaws: string[];
  iterations: ReviewIteration[];
}

/** 9. Owner Authority Operational Protection */
export type OwnerAuthorityStage =
  | "ANALYZE"
  | "DESIGN"
  | "PREPARE_PATCH"
  | "MODIFY_LOCAL"
  | "CHANGE_PRODUCTION"
  | "MIGRATE_PRODUCTION"
  | "DEPLOY_RELEASE";

export interface ProtectedSystemCheck {
  target: string;
  stage: OwnerAuthorityStage;
  requiresOwnerApproval: boolean;
  isAllowedAutonomously: boolean;
  rationale: string;
}
