// =========================================================
// ARCHIE NATIVE INTELLIGENCE ENGINE — SHARED CORE TYPES
// supabase/functions/_shared/archie-ai/native-engine/types.ts
//
// The foundational processing layer of ARCHIE's own native
// intelligence (owner directive: "BUILD ARCHIE'S OWN NATIVE
// INDEPENDENT INTELLIGENCE ENGINE AS A FOUNDATIONAL CORE
// COMPONENT"). Zero external AI APIs. Every subsystem here is
// REAL executable code with measurable capabilities — no
// mocks, no scripts, no placeholders. Where a capability is
// not yet implemented, it is reported honestly (see
// capabilities.ts) instead of faked.
//
// Permanent architecture:
//   ARCHIE NATIVE ENGINE → MEMORY → KNOWLEDGE → REASONING →
//   TOOLS → LEARNING → VERIFICATION → IMPROVEMENT
// =========================================================

/** A knowledge fact. SPO triple + qualifiers, with
 *  confidence and full provenance. */
export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  /** Object value — string or structured JSON. */
  object: unknown;
  qualifiers?: Record<string, unknown>;
  /** 0..1 calibrated confidence. */
  confidence: number;
  /** Where this fact came from: owner teaching, inference, web research. */
  provenance: {
    // "cross-source:<domain>" is the documented label for a
    // corroboration from a specific external source — distinct
    // domains are DISTINCT sources for reinforcement, while a
    // bare "web-research" is one generic source.
    source:
      | "owner-taught"
      | "inferred"
      | "web-research"
      | "seed"
      | `cross-source:${string}`;
    /** Derivation chain for inferred facts (rule + premise fact ids). */
    derivation?: {
      ruleId: string;
      premiseIds: string[];
      /** Variable bindings used by general (variable) rules —
       * part of the honest proof record (P1 unification). */
      binding?: Record<string, string | number>;
    };
    /** Free-form origin note (e.g. "conversation 2026-09-10"). */
    note?: string;
  };
  // P8 derived-vs-taught separation: "derived" marks facts
  // produced by the forward chainer. They never auto-validate
  // (no matter how high their propagated confidence) and are
  // labeled as derived in answers; promotion to "validated"
  // only happens through the real verification-event gates.
  /** "owner-asserted" (audit fix H-1, 2026-09-11): taught by
   *  the owner but NOT yet independently verified — held on
   *  the owner's authority, citable with an honest label, and
   *  promoted to "validated" only through real verification
   *  events (explicit owner confirmation outcomes). Teaching
   *  no longer mints "validated" on arrival. */
  status:
    "candidate" | "validated" | "owner-asserted" | "uncertain" | "derived";
  validatedCount: number;
  /** Real verification events behind this fact (audit H1/H2):
   *  e.g. "owner-taught", "seed", "owner-confirm:<ts>",
   *  "cross-source:<domain>", "rule:<id>". Promotion to
   *  "validated" requires at least one — repetition or
   *  gratitude alone never establishes knowledge. */
  verifiedBy?: string[];
  createdAt: string;
  /** Valid-time interval (tr-2): the fact holds from
   *  validFrom (inclusive) until validUntil (exclusive).
   *  Expired facts are honestly demoted, never silently
   *  retained as current knowledge. */
  validFrom?: string;
  validUntil?: string;
}

/** Two facts assert different objects for the same SPO. */
export interface FactConflict {
  kind: "contradiction";
  subject: string;
  predicate: string;
  conflictingFactIds: string[];
}

export interface Rule {
  id: string;
  /** All conditions must match (conjunction). */
  conditions: FactPattern[];
  produces: { subject: string; predicate: string; object: unknown };
  /** 0..1 rule strength — derived confidence = min(premise conf) × weight. */
  weight: number;
  description: string;
  /** Numeric unification (audit Phase 2 item 4, 2026-09-11):
   *  when present, the conclusion's object is COMPUTED from the
   *  premises' bound values instead of taken verbatim from
   *  `produces.object`. Pure and deterministic — same bound
   *  inputs always produce the same output, no external call,
   *  no randomness. Lets a rule state a real relationship
   *  ("screed volume = thickness × area") instead of a static
   *  description string. Returning undefined refuses the
   *  conclusion (e.g. division by zero) rather than fabricating
   *  a number. */
  compute?: (bound: Record<string, string | number>) => number | undefined;
}

/** SPO pattern; "" / undefined = wildcard, regex-able values. */
export interface FactPattern {
  subject?: string;
  predicate?: string;
  /** Exact value match when a non-regex primitive is given. */
  object?: unknown;
}

export interface InferenceExplanation {
  derivedFactId: string;
  ruleId: string;
  premiseFacts: Fact[];
  confidence: number;
}

/** Planner operator: a real capability step ARCHIE can execute. */
export interface Operator {
  id: string;
  description: string;
  /** Goal this operator achieves (matched against a goal pattern). */
  achieves: FactPattern;
  /** Preconditions that must hold before execution. */
  preconditions: FactPattern[];
  /** Effects asserted after execution. */
  effects: Fact[];
  /** Lower is preferred; used for plan ranking. */
  cost: number;
}

export interface PlanStep {
  operatorId: string;
  achieves: string;
  satisfies: string;
  missingPreconditions: string[];
  /** Phase 3.2 (audit): what the engine ACTUALLY did with this
   *  step after planning. "executed" = a real subsystem ran and
   *  `result` carries its real output; "awaiting-owner" = needs
   *  owner input (teach/research choice); "proposed" = presented
   *  for owner authorization, never auto-executed; "blocked" =
   *  a bound subsystem ran but could not complete — the gap is
   *  reported, never papered over. Absent = not executed. */
  status?: "executed" | "awaiting-owner" | "proposed" | "blocked";
  /** Real output of the executed subsystem (never fabricated). */
  result?: string;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  /** Honest: false when preconditions are missing. */
  executable: boolean;
  totalCost: number;
  gapReport: string[];
  /** Alternative real capability chains that also achieve the
   * goal (pl-3) — ranked after the primary, never fabricated
   * options. Empty when no other operator chain exists. */
  alternatives: PlanAlternative[];
  /** Risk assessment of the primary plan (pl-3) — honest,
   * derived from the operators involved and (Phase 4.4) from
   * owner-recorded evolution-memory lessons that match. */
  risk: { level: "low" | "medium" | "high"; notes: string[] };
  /** Phase 4.4 (lessons → behavior): owner-recorded lessons
   * relevant to this goal, retrieved deterministically from
   * archie_evolution_memory. CONTEXT ONLY — never asserted as
   * facts, never auto-block an operator. Undefined when no
   * lesson provider is wired (e.g. in-memory engine runs). */
  relevantLessons?: PlanLesson[];
}

/** An owner-recorded evolution-memory lesson surfaced into a
 *  plan (Phase 4.4). Provenance is explicit and dated. */
export interface PlanLesson {
  id: string;
  problem: string;
  /** The lesson text as the owner recorded it. */
  lesson: string;
  /** ISO timestamp of the evolution-memory row. */
  recordedAt: string;
  /** The salient tokens the lesson and the goal share — the
   *  retrieval evidence, surfaced for inspection. */
  matchedTokens: string[];
  /** True when the recorded attempt carries failure or
   *  rollback information — repeats are risk-flagged. */
  failedBefore: boolean;
}

export interface PlanAlternative {
  /** Operator chain (ids, in execution order). */
  operatorIds: string[];
  description: string;
  totalCost: number;
  /** Honest tradeoff vs the primary plan. */
  tradeoff: string;
}

export interface ToolSpecInternal {
  name: string;
  description: string;
  parameters: Record<string, string>;
  /**
   * Trust classification (ts-2): "deterministic" — output is
   * recomputable exactly (arithmetic, unit conversion);
   * "single-source" — fetched from one external source and
   * needs cross-checking before it becomes knowledge. An
   * unclassified tool is treated as unverified.
   */
  trust?: "deterministic" | "single-source";
}

export interface ToolInvocation {
  tool: string;
  ok: boolean;
  output: unknown;
  /** Honest failure reason — never a fake result. */
  error?: string;
  durationMs: number;
}

/** Working-memory conversation turn. */
export interface MemoryTurn {
  role: "owner" | "archie";
  text: string;
  at: number;
  /** Token-bag vector for salience retrieval. */
  vector: Map<string, number>;
  /** Raw TF-IDF cosine relevance to the retrieval query.
   *  Episodic recall must clear a relevance floor — recency
   *  alone never counts as remembering. */
  relevance?: number;
}

export interface RetrievedContext {
  salientTurns: MemoryTurn[];
  salientFacts: Fact[];
}

/** Outcome of an engine action, used for reinforcement learning. */
export interface LearningOutcome {
  id: string;
  /**
   * "success"/"failure"/"correction" carry REAL outcome
   * evidence and reinforce accordingly. "cited" means
   * knowledge was merely cited in an answer — citing is NOT
   * a verified outcome and must never reinforce (audit C3).
   */
  kind: "success" | "failure" | "correction" | "cited" | "acknowledged";
  /** What was being attempted. */
  task: string;
  /** Contributing fact/rule/operator ids for credit assignment. */
  contributing: string[];
  /** Deterministic cause-of-error taxonomy for failures. */
  cause?: string;
  /** Actionable lesson extracted from the failure. */
  lesson?: string;
  timestamp: string;
}

/** Honest capability maturity — the heart of "never pretend". */
export type CapabilityMaturity =
  "OPERATIONAL" | "DEVELOPING" | "NOT_IMPLEMENTED";

export interface CapabilityReport {
  id: string;
  description: string;
  maturity: CapabilityMaturity;
  /** How this claim is measured (test file(s)). */
  measuredBy: string;
}

export interface EngineDiagnostics {
  engineId: string;
  uptimeMs: number;
  capabilities: CapabilityReport[];
  counts: {
    facts: number;
    validatedFacts: number;
    rules: number;
    operators: number;
    tools: number;
    memoryTurns: number;
    /** P7 — prior-session turns hydrated from episodic
     *  persistence (cross-isolate context). */
    episodicTurns: number;
    outcomes: number;
    inferences: number;
    /** P7 — cross-isolate calibration counters. */
    unknownTopicHits: number;
    verificationFails: number;
  };
  calibration: {
    /** Mean predicted confidence of completed inferences. */
    meanConfidence: number;
    /** Self-checks run / contradictions caught. */
    selfChecksRun: number;
    contradictionsCaught: number;
  };
  persistence: {
    facts: boolean;
    outcomes: boolean;
    /** P7 — episodic-turn persistence (same consent gate). */
    episodic: boolean;
    note: string;
  };
}
