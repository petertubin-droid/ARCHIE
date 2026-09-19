// =========================================================
// FRELUX AI FOUNDATION, Core Vocabulary
//
// One shared vocabulary for every AI capability in FRELUX:
//   conversational AI, document/image extraction, project &
//   property intelligence, scenario analysis and future agents.
//
// Design rule (final rule of the AI Foundation):
//   AI interprets, extracts, classifies, summarizes and proposes.
//   ONLY deterministic FRELUX engines calculate quantities,
//   geometry, materials and costs. See engines-registry.ts for
//   the single sanctioned path from AI to numbers.
//
// This module is additive, it reuses, and does not replace,
// the existing verification vocabularies in
//   - src/lib/measurement/verification-states.ts
//   - src/lib/construction-extraction.ts
// (interop lives in trust.ts).
// =========================================================

/** Where a fact came from. Never guessed, always recorded. */
export type Provenance =
  | "user_input" // typed / spoken by the user in this session
  | "user_confirmed" // user explicitly confirmed an AI/extracted value
  | "project_data" // retrieved from an existing FRELUX project
  | "saved_calculation" // retrieved from a saved deterministic calculation
  | "document_extraction" // extracted from an uploaded plan / PDF
  | "image_extraction" // extracted from a photo
  | "ai_interpretation" // extracted from natural language by AI
  | "location_data" // canonical Location Intelligence
  | "market_data" // verified market intelligence (price, rate…)
  | "engine_calculation" // produced by an authoritative FRELUX engine
  | "smart_default" // existing FRELUX product default (assumption)
  | "unknown";

/**
 * Trust / verification state for every AI-derived value.
 * State machine lives in trust.ts. Never silently upgraded.
 */
export type TrustStatus =
  | "detected" // AI (or any non-authoritative source) detected it
  | "needs_confirmation" // must be confirmed before it counts as a fact
  | "user_confirmed" // the user confirmed it
  | "system_verified" // a deterministic FRELUX validator verified it
  | "rejected" // the user rejected it
  | "corrected" // the user corrected it (value holds the correction)
  | "unknown" // origin cannot be established
  | "insufficient_evidence"; // AI could not support the inference

/** A single piece of information flowing through the AI foundation. */
export interface AiFact {
  key: string; // canonical field key, e.g. "building_length"
  label: string; // human label, e.g. "Building length"
  value: number | string | boolean;
  unit?: string; // "m" | "ft" | "count" | "NGN" | …
  origin: Provenance;
  source: string; // id of the system that produced it, e.g. "build-to-roof-engine"
  confidence: number; // 0..1 (1 = authoritative)
  trust: TrustStatus;
  evidence?: string; // why/how, shown to users when important
  detectedAt?: string; // ISO timestamp
  verifiedAt?: string; // ISO timestamp
  scope?: string; // project id / session id this fact belongs to
}

// =========================================================
// TASKS, what a user can ask the Copilot to do
// =========================================================

export type CopilotTaskType =
  | "building_estimate" // whole-building materials & cost (Build-to-Roof engine)
  | "roof_estimate" // roof geometry / materials
  | "painting_estimate" // painting wall area
  | "painting_materials" // full painting materials/containers (classic calculator)
  | "tyrolene_estimate" // tyrolene finishing
  | "screeding_estimate" // screeding system materials & cost
  | "tile_estimate" // tile quantities & cost
  | "pop_estimate" // POP ceiling materials & cost
  | "finish_compare" // compare finishing systems
  | "scenario_compare" // compare named scenarios via deterministic engines
  | "project_question" // answer from existing project data
  | "unsupported"; // no engine / no capability → refuse

export interface InterpretationResult {
  taskType: CopilotTaskType;
  facts: AiFact[];
  /** Free-text follow-up only when genuinely required information is missing. */
  followUpQuestion?: string;
  /** Deterministic parse (no AI call) or AI-assisted interpretation. */
  interpretedBy: "deterministic" | "ai_assisted";
}

// =========================================================
// CONTEXT, what the Copilot already knows
// =========================================================

export interface FreluxContext {
  userId: string | null;
  /** Active project, if any (from user_projects / local projects). */
  project?: {
    id: string;
    name: string;
    projectType?: string;
    buildingType?: string;
    location?: unknown; // canonical location-intelligence payload (jsonb)
    data?: Record<string, unknown>;
  } | null;
  /** Canonical Location Intelligence state for the session/project. */
  location?: {
    latitude?: number;
    longitude?: number;
    status?: string;
    source?: string;
    region?: string; // region/state resolved from regional-profile architecture
    country?: string;
    city?: string;
    marketProfileAvailable: boolean; // regional profile resolved?
  } | null;
  /** Recent saved calculations the user already has (never re-asked for). */
  calculations?: Array<{
    id: string;
    calculationType: string;
    projectName?: string;
    result?: Record<string, unknown>;
    createdAt?: string;
  }>;
  /** Verified market data availability for the resolved region. */
  marketDataAvailable: boolean;
}

// =========================================================
// PLANS, how the Copilot works a request
// =========================================================

export type PlanStepKind =
  | "resolve_context" // retrieve existing project/property data
  | "request_missing_info" // only for genuinely missing required fields
  | "run_engine" // call the authoritative deterministic engine
  | "present_result" // result + provenance + assumptions
  | "ask_confirmation" // user approval before any saved state changes
  | "save_to_project" // after explicit user confirmation
  | "refuse"; // unsupported request, never guess

export interface PlanStep {
  kind: PlanStepKind;
  detail: string;
  /** Facts that still need user input before the engine can run. */
  missingFields?: RequirementFieldLite[];
}

export interface RequirementFieldLite {
  key: string;
  label: string;
  unit?: string;
}

export interface CopilotPlan {
  taskType: CopilotTaskType;
  engineId: string | null; // null ⇒ no engine may run
  steps: PlanStep[];
  reason?: string; // for refusals
}

// =========================================================
// ENGINE RESULTS, the ONLY way numbers enter AI surfaces
// =========================================================

export interface EngineQuantityLine {
  label: string;
  quantity: number;
  unit: string;
}

export interface EngineCostSummary {
  total: number;
  currency: string;
  lines?: Array<{ label: string; amount: number }>;
  /** True when pricing fell back to defaults (no verified regional prices). */
  regionalDataAvailable: boolean;
}

export interface EngineResult {
  ok: boolean;
  engine: string; // engine id from the registry
  calculatedAt: string;
  quantities: EngineQuantityLine[];
  costs: EngineCostSummary | null;
  raw: unknown; // full engine output, for deep-linking into existing UIs
  error?: string;
}

// =========================================================
// SCENARIOS
// =========================================================

export interface ScenarioDefinition {
  name: string;
  /** Overrides applied on top of the base engine input. */
  overrides: Record<string, unknown>;
}

export interface ScenarioComparison {
  scenarios: Array<{
    name: string;
    result: EngineResult;
    deltas: {
      costDelta: number; // vs the first scenario
      costDeltaPercent: number;
      quantityDeltas: EngineQuantityLine[]; // signed, vs first scenario
    };
  }>;
  assumptions: string[]; // provenance of every assumed input
  risks: string[]; // honest notes, no invented predictions
  engineId: string;
}

// =========================================================
// AGENTS (future), bounded, audited, approval-first
// =========================================================

export type AgentActionDecision =
  | "read_allowed" // read-only, within the agent's domains
  | "proposal_allowed" // may PROPOSE an action for user approval
  | "forbidden"; // never allowed (financial, structural, safety, contracts…)

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  /** Domains the agent may READ (project, property, market, location…). */
  readDomains: string[];
  /** Actions the agent may PROPOSE (never execute without approval). */
  proposableActions: string[];
  enabled: boolean; // future agents ship disabled until a real capability lands
}

export interface AgentEvent {
  agentId: string;
  action: string;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: string;
}

// =========================================================
// PREDICTIONS (future), data readiness only, no fake outputs
// =========================================================

export type PredictionType =
  | "cost_overrun"
  | "schedule_delay"
  | "material_price_change"
  | "procurement_risk"
  | "project_risk"
  | "progress_variance";

export interface PredictionReadiness {
  supported: boolean; // false until sufficient data exists, NEVER faked
  missing: string[]; // data sets still required
  evidenceAvailable: string[]; // data sets already present
}

export interface PredictionRecord {
  type: PredictionType;
  prediction: string;
  evidence: string[]; // must be non-empty, else the record may not exist
  assumptions: string[];
  confidence: number; // 0..1
  dataFreshnessHours: number | null;
  generatedAt: string;
}
