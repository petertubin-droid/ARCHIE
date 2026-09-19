// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, TYPES
//
// Phase 4 core contract. EVERY prediction carries: prediction,
// evidence, inputs, assumptions, data freshness, confidence,
// timestamp and status. A result with insufficient evidence is
// `insufficient_data`, never a fabricated value (§18).
//
// AI vs deterministic boundary (§15):
//   - Everything in this module is DETERMINISTIC: comparisons,
//     sums, variances, intervals, thresholds. No AI calls.
//   - AI (the Copilot) only SUMMARIZES these results.
// =========================================================

import type { ShoppingItemWithActual } from "@/lib/project-intelligence";
export type { ShoppingItemWithActual };

/** Data-age classification for any dated value (§17). */
export type DataFreshness = "current" | "stale" | "outdated" | "unavailable";

/** Honest status, the only three outcomes of any analysis (§18). */
export type AnalysisStatus = "ok" | "insufficient_data" | "unsupported_region";

/** The kinds of predictive intelligence Phase 4 provides. */
export type PredictionKind =
  | "cost_overrun"
  | "schedule_risk"
  | "procurement_risk"
  | "material_price_trend"
  | "progress_variance"
  | "cashflow";

// ---------------------------------------------------------
// Evidence, "What is FRELUX basing this on?" (§14)
// ---------------------------------------------------------

export type EvidenceKind =
  | "project_record"
  | "progress_stage"
  | "shopping_item"
  | "price_record"
  | "market_observation"
  | "visual_observation"
  | "calculation"
  | "assumption";

export type EvidenceVerification =
  | "user_recorded" // entered by the project owner in FRELUX
  | "user_confirmed" // explicitly confirmed by the user in review
  | "system_verified" // validated by a deterministic check
  | "admin_verified" // market data verified by an admin
  | "unverified"; // presented but must not be treated as fact

export interface Evidence {
  kind: EvidenceKind;
  /** Row id of the underlying record, where one exists. */
  id?: string;
  /** Human-readable description referencing the ACTUAL record. */
  label: string;
  /** When this evidence was captured/recorded. */
  recordedAt: string | null;
  verification: EvidenceVerification;
}

// ---------------------------------------------------------
// Confidence, deterministic, never a single AI guess (§14/§18)
// ---------------------------------------------------------

export type ConfidenceBand = "high" | "medium" | "low";

export interface ConfidenceAssessment {
  /** 0–1, computed ONLY from data coverage, freshness and verification. */
  score: number;
  band: ConfidenceBand;
  /** Exactly how the score was computed, shown to the user. */
  method: string;
}

// ---------------------------------------------------------
// Prediction, the universal result envelope
// ---------------------------------------------------------

export interface PredictionResult<T = unknown> {
  kind: PredictionKind;
  status: AnalysisStatus;
  /** Human-readable statement. Only meaningful when status === 'ok'. */
  prediction: string;
  /** Structured numbers behind the statement (null when insufficient). */
  result: T | null;
  evidence: Evidence[];
  /** The concrete input values used. */
  inputs: Array<{
    key: string;
    label: string;
    value: number | string | boolean | null;
  }>;
  /** Explicit, visible assumptions, never hidden (§14). */
  assumptions: string[];
  freshness: DataFreshness;
  confidence: ConfidenceAssessment | null;
  /** What this prediction can NOT tell you. */
  limitations: string[];
  generatedAt: string;
  /** When status !== 'ok': the data sets that are missing. */
  missingData: string[];
  /** When status === 'unsupported_region': why. */
  regionNote?: string;
}

// ---------------------------------------------------------
// Risk register (§9)
// ---------------------------------------------------------

export type RiskCategory =
  | "Cost"
  | "Schedule"
  | "Procurement"
  | "Data quality"
  | "Market"
  | "Construction progress";

export type RiskSeverity = "low" | "medium" | "high";

export interface RiskItem {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  /** Only present where genuinely measurable, measured rate, never invented. */
  probability: { value: number; basis: string } | null;
  title: string;
  evidence: Evidence[];
  affectedArea: string;
  recommendedAction: string;
  confidence: ConfidenceAssessment;
  status: "open";
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------
// Recommendation, Observation → Analysis → Recommendation (§10)
// ---------------------------------------------------------

export interface Recommendation {
  riskId: string;
  /** What was actually measured. */
  observation: string;
  /** Why it matters for this project. */
  analysis: string;
  /** Practical next step, decision support, never a guaranteed outcome. */
  recommendation: string;
  confidence: ConfidenceAssessment;
  basedOnRisk: string;
}

// ---------------------------------------------------------
// Scenario, explicitly hypothetical, never a prediction (§11)
// ---------------------------------------------------------

export interface ScenarioOutcome {
  id: string;
  question: string;
  status: AnalysisStatus;
  baseline: { label: string; value: number; basis: string } | null;
  changedAssumption: string | null;
  result: { label: string; value: number; basis: string } | null;
  difference: { value: number; percent: number } | null;
  assumptions: string[];
  /** Always true, a scenario is a what-if, NOT a forecast. */
  hypothetical: true;
  missingData: string[];
  generatedAt: string;
}

// ---------------------------------------------------------
// Project Health, dashboard rollup (§13)
// ---------------------------------------------------------

export type TriStateRating = "low" | "medium" | "high" | "insufficient_data";
export type ProgressRating =
  "on_track" | "at_risk" | "delayed" | "insufficient_data";
export type DataQualityRating = "high" | "medium" | "low";

export interface ProjectHealth {
  cost: { rating: TriStateRating; reason: string };
  schedule: { rating: TriStateRating; reason: string };
  procurement: { rating: TriStateRating; reason: string };
  progress: { rating: ProgressRating; reason: string };
  dataQuality: { rating: DataQualityRating; reason: string };
}

// ---------------------------------------------------------
// Snapshot, the real project data the analysis runs on
// ---------------------------------------------------------

/** A dated visual observation (§8). Only as evidence, never overrides
 *  verified records without user confirmation. */
export interface VisualObservation {
  id: string;
  /** What the observation says, e.g. "Roof framing visible in photo". */
  observation: string;
  observedAt: string;
  /** 0–1 from the vision/extraction layer. */
  confidence: number;
  verification: "user_confirmed" | "unverified";
  sourceLabel: string;
}

export interface PriceHistoryEntry {
  materialName: string;
  oldPrice: number | null;
  newPrice: number;
  changedAt: string;
  priceSource: string | null;
}

export interface MarketPricePoint {
  id: string;
  label: string;
  price: number;
  currencyCode: string;
  marketCode: string;
  region: string | null;
  collectedAt: string;
  freshness: "fresh" | "recent" | "stale" | "expired";
  verified: boolean;
}

export interface PredictiveProjectSnapshot {
  projectId: string;
  /** Analysis reference time (ISO). All freshness is relative to this. */
  now: string;
  project: {
    name: string;
    status: "draft" | "in_progress" | "on_hold" | "completed" | "archived";
    createdAt: string;
    updatedAt: string;
    /** User-entered progress % (0–100), may be stale; never trusted blindly. */
    progressPercentage: number | null;
  };
  stages: Array<{
    id: string;
    stageKey: string;
    stageName: string;
    sortOrder: number;
    isCompleted: boolean;
    completedAt: string | null;
    hasPhoto: boolean;
    updatedAt: string;
  }>;
  shoppingItems: ShoppingItemWithActual[];
  calculations: Array<{
    id: string;
    calculatorType: string;
    title: string;
    createdAt: string;
    /** Total cost of that saved calculation, when recorded. */
    estimatedTotal: number | null;
  }>;
  priceHistory: PriceHistoryEntry[];
  marketPrices: MarketPricePoint[];
  visualObservations: VisualObservation[];
  region: {
    marketCode: string | null;
    countryCode: string | null;
    city: string | null;
  };
}

// ---------------------------------------------------------
// The full analysis bundle
// ---------------------------------------------------------

export interface ProjectPredictiveAnalysis {
  projectId: string;
  generatedAt: string;
  /** Stable hash of every input the analysis depends on, cache key (§22). */
  inputHash: string;
  dataQuality: {
    rating: DataQualityRating;
    reason: string;
    coverage: Array<{ area: string; available: boolean; note: string }>;
  };
  predictions: PredictionResult[];
  risks: RiskItem[];
  recommendations: Recommendation[];
  health: ProjectHealth;
  scenarios: ScenarioOutcome[];
  /** Every limitation of this analysis run, shown, never hidden (§14). */
  limitations: string[];
}

export const INSUFFICIENT_DATA_MESSAGE = "Insufficient data.";
