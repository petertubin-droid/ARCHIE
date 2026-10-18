// =========================================================
// ARCHIE UNIFIED GENERAL COGNITIVE INTELLIGENCE ENGINE — CORE TYPES
// supabase/functions/_shared/archie-ai/cognitive/types.ts
//
// The highest-level intelligence architecture of ARCHIE
// (owner directive, 2026-09-10). ONE unified ARCHIE
// intelligence — never multiple sub-agents. These types
// define the epistemic taxonomy, world model, perception,
// meta-cognition, verification, security/audit and cognitive
// loop structures shared by every cognitive subsystem.
//
// Real production architecture: every type here is created,
// flowed, persisted and tested by real code. No mocks.
// =========================================================

import type { Fact } from "../native-engine/types.ts";

/** Epistemic taxonomy — owner-mandated. Every claim ARCHIE
 *  makes is classified into exactly one status, honestly. */
export type EpistemicStatus =
  | "KNOWN" // stored knowledge, single unchallenged source
  | "VERIFIED" // independently re-derived / executed / cross-checked
  | "INFERRED" // derived by reasoning from premises
  | "ASSUMED" // stated as a premise, not established
  | "UNKNOWN"; // not in knowledge — never fabricated

export const EPISTEMIC_ORDER: Record<EpistemicStatus, number> = {
  VERIFIED: 4,
  KNOWN: 3,
  INFERRED: 2,
  ASSUMED: 1,
  UNKNOWN: 0,
};

/** Modality support is reported honestly — never faked.
 * Unified across text, code, document, structured-data, website,
 * system-info, image, audio, video, sensor, and multimodal fusion. */
export type PerceptionModality =
  | "text"
  | "code"
  | "document"
  | "structured-data"
  | "website"
  | "system-info"
  | "image"
  | "audio"
  | "video"
  | "sensor"
  | "multimodal";

/** Epistemic status of an observation: distinguishing direct sensory
 * evidence from derived hypotheses and human/ground-truth verified facts. */
export type ObservationEpistemicStatus =
  | "DIRECT_OBSERVATION"
  | "INFERRED_HYPOTHESIS"
  | "VERIFIED_FACT";

/** Source origin of perceptual inputs. */
export type PerceptionSourceType =
  | "user_upload"
  | "camera"
  | "microphone"
  | "screen"
  | "external_api"
  | "system"
  | "iot_sensor"
  | "conversation";

/** Canonical structured observation format across all modalities. */
export interface StructuredObservation {
  id: string;
  modality: PerceptionModality;
  sourceType: PerceptionSourceType;
  capturedAt: string;
  processedAt: string;
  language?: string;
  epistemicStatus: ObservationEpistemicStatus;
  confidence: number; // 0..1
  uncertainties: string[];
  limitations: string[];
  provenance: {
    origin: string;
    algorithmOrModel: string;
    rawHash?: string;
    processingMs: number;
  };
  features: {
    entities?: string[];
    detectedObjects?: Array<{
      label: string;
      confidence: number;
      boundingBox?: [number, number, number, number];
      attributes?: Record<string, unknown>;
    }>;
    extractedText?: {
      text: string;
      confidence: number;
      isFlaggedUncertain?: boolean;
      ocrLayout?: unknown;
    };
    audioEvents?: Array<{
      kind: string;
      startSec: number;
      endSec: number;
      confidence: number;
      speaker?: string;
    }>;
    motionAndScenes?: {
      cutsCount: number;
      averageMotionEnergy: number;
      durationSec?: number;
      fpsEstimate?: number;
    };
    spatialRelationships?: Array<{
      subject: string;
      relation: string;
      object: string;
      estimated: boolean;
    }>;
    constructionEstimates?: {
      elements: string[];
      defects: string[];
      note: string;
      validated: boolean;
    };
    sensorReadings?: Record<
      string,
      { value: number | string; unit: string; calibrated?: boolean; location?: string; timestamp?: string }
    >;
    documentOutline?: {
      title?: string;
      sections: Array<{ level: number; heading: string }>;
      tablesCount: number;
      codeBlocksCount: number;
      wordCount: number;
      metadata?: Record<string, string>;
    };
    composition?: {
      aspectRatioCategory: string;
      brightnessCategory: string;
      contrastCategory?: string;
      blurScore?: number;
      gridZones?: Record<string, string>;
    };
    telemetryAnalysis?: {
      anomaliesDetected: string[];
      uncalibratedSensors: string[];
      outOfBoundsSensors: string[];
      overallHealthScore: number;
    };
  };
  crossModalCorrelations?: Array<{
    targetObservationId: string;
    correlationType: "corroborates" | "contradicts" | "supplements";
    confidence: number;
    explanation: string;
  }>;
  contradictionsDetected?: string[];
  clarificationPrompt?: string;
  securityClassification: "public" | "internal" | "sensitive" | "owner_only";
  secretsRedactedCount: number;
  retentionPolicy: "ephemeral" | "session" | "retained_by_policy";
  recommendedDownstreamAction?:
    | "semantic_reasoning"
    | "knowledge_graph"
    | "world_model_update"
    | "frelux_verification"
    | "clarification_needed"
    | "security_escalation";
}

/** Image is now SUPPORTED natively but BOUNDED: PNG pixel
 *  analysis (colors/brightness/structure), JPEG/GIF structure
 *  only. No object recognition exists — and none is claimed. */
export const IMAGE_CAPABILITY_BOUNDS =
  "native vision: PNG, baseline-JPEG and GIF first-frame pixels analyzed (colors/brightness/composition statistics + bounded scene feature scores); native template-match OCR reads clean machine-rendered text (charset 0-9 A-Z . , : -, calibrated refusals); progressive JPEG dimensions only; NO object recognition exists — never claimed";

export const UNSUPPORTED_MODALITIES: ReadonlyArray<{
  modality: string;
  note: string;
}> = [
  {
    modality: "audio",
    note: "audio EVENTS are implemented natively where raw PCM lives (on-device voice session: voice-activity detection, bounded diarization, honest ambient labels) — but full semantic audio understanding (what a sound MEANS) is not implemented; reported honestly, never faked",
  },
];

/** A normalized percept — the single input currency of the
 *  cognitive loop, whatever its modality. */
export interface Percept {
  id: string;
  modality: PerceptionModality;
  content: unknown;
  /** Where this percept came from. */
  origin: string;
  observedAt: string;
  /** Honest parse/extract notes (e.g. detected language, code language). */
  metadata: Record<string, unknown>;
  /** Structured observation data complying with ARCHIE's perception contract. */
  observation?: StructuredObservation;
}

/** World model entity: a person, organization, system,
 *  software, project, object, event or environment ARCHIE
 *  knows about. Unbounded — no hardcoded entity ceiling. */
export interface WorldEntity {
  id: string;
  name: string;
  /** Person | Organization | System | Software | Project | Object | Event | Environment | Concept | Outcome */
  kind: string;
  /** Confidence in this entity's existence/identity. */
  confidence: number;
  provenance: string;
  createdAt: string;
}

/** A typed relation between two world entities.
 *
 *  TEMPORAL AXIS (audit phase 7, 2026-09-11): relations are
 *  VERSIONED — observedAt carries the time this version was
 *  observed, and supersededBy points at the relation that
 *  replaced it (null = current). The world model keeps the
 *  full history; currentView() projects the present. */
export interface WorldRelation {
  id: string;
  subject: string;
  relation: string;
  object: string;
  confidence: number;
  provenance: string;
  createdAt: string;
  /** Time this observation was made (defaults to createdAt for
   *  pre-migration rows). */
  observedAt?: string;
  /** Id of the relation that superseded this version — null
   *  for current observations. */
  supersededBy?: string | null;
}

export interface WorldModelQuery {
  about?: string;
  relation?: string;
  depth?: number;
}

/** The permanent cognitive loop phases (owner-mandated order). */
export type LoopPhase =
  | "PERCEIVE"
  | "UNDERSTAND"
  | "RETRIEVE"
  | "REASON"
  | "MODEL"
  | "PLAN"
  | "CREATE"
  | "VERIFY"
  | "ACT"
  | "OBSERVE"
  | "EVALUATE"
  | "LEARN"
  | "REMEMBER"
  | "IMPROVE"
  | "REPEAT";

export const LOOP_PHASES: ReadonlyArray<LoopPhase> = [
  "PERCEIVE",
  "UNDERSTAND",
  "RETRIEVE",
  "REASON",
  "MODEL",
  "PLAN",
  "CREATE",
  "VERIFY",
  "ACT",
  "OBSERVE",
  "EVALUATE",
  "LEARN",
  "REMEMBER",
  "IMPROVE",
  "REPEAT",
];

export interface PhaseRecord {
  phase: LoopPhase;
  /** Honest trace statuses (P9): "executed" = real work ran
   * HERE with a measured duration and a concrete record;
   * "delegated" = the work is done by a named substrate
   * component (reasoning loop, native engine, orchestrator) —
   * never claimed as executed; "skipped" = the route did not
   * need it. No phase is ever labeled executed without real
   * evidence. */
  status: "executed" | "delegated" | "skipped";
  summary: string;
  durationMs: number;
  /** The anatomical subsystem(s) this phase runs through —
   *  the anatomy is a live architectural model, not docs:
   *  every executed phase names its real organ. */
  organs?: string[];
}

/** One complete traversal of the cognitive loop. */
export interface CognitiveTrace {
  cycleId: string;
  task: string;
  phases: PhaseRecord[];
  route: CognitiveRoute;
  epistemic: EpistemicStatus;
  confidence: number;
  createdAt: string;
}

/** Meta-cognition — ARCHIE's explicit self-assessment. */
export interface MetaAssessment {
  whatIKnow: string[];
  whatIDontKnow: string[];
  supportingEvidence: Array<{ claim: string; factId?: string }>;
  couldBeWrong: Array<{ risk: string; mitigation: string }>;
  mustVerify: string[];
  /** Which approach was ranked most reliable, and why. */
  mostReliableApproach: { approach: string; rationale: string };
}

/** Formal verification verdict for an important output. */
export interface VerificationVerdict {
  target: string;
  verdict: "PASS" | "FAIL" | "UNVERIFIED";
  checks: Array<{
    check:
      | "correctness"
      | "consistency"
      | "completeness"
      | "security"
      | "source-quality"
      | "assumptions"
      | "uncertainty";
    passed: boolean;
    /** False means the check was not applicable or lacked a task contract. */
    applicable?: boolean;
    detail: string;
  }>;
}

/** Authority classification — learning NEVER grants execution. */
export type AuthorityLevel =
  | "autonomous-safe" // reasoning, learning, analysis, proposals
  | "owner-gated"; // consequential system change

export interface CognitiveRoute {
  /** Phases the orchestrator determined this task needs. */
  phases: LoopPhase[];
  reasoningModes: Array<
    | "logical"
    | "analytical"
    | "mathematical"
    | "causal"
    | "comparative"
    | "probabilistic"
    | "constraint"
  >;
  retrievalScope: {
    knowledge: boolean;
    memory: boolean;
    worldModel: boolean;
  };
  tools: string[];
  verificationLevel: "none" | "standard" | "strict";
  authority: AuthorityLevel;
  rationale: string;
}

/** Append-only, hash-chained security audit event. */
export interface AuditEvent {
  /** FIX 23: the owning chain — per kernel instance. */
  chainId?: string;
  seq: number;
  eventType:
    | "perception"
    | "memory-write"
    | "knowledge-write"
    | "world-model-write"
    | "tool-use"
    | "verification"
    | "authority-check"
    | "life-safety-stop"
    | "creation"
    | "learning"
    | "improvement-proposal";
  payload: Record<string, unknown>;
  at: string;
  prevHash: string;
  hash: string;
}

/** Self-improvement: a proposal, never an auto-applied change. */
export interface ImprovementProposal {
  id: string;
  weakness: string;
  proposal: string;
  expectedGain: string;
  status: "proposed";
  createdAt: string;
}

/** The unified response of one cognitive cycle. */
export interface CognitiveCycleResult {
  responseText: string;
  epistemic: EpistemicStatus;
  confidence: number;
  citedFactIds: string[];
  meta: MetaAssessment | null;
  verification: VerificationVerdict | null;
  trace: CognitiveTrace;
  toolResults: Array<{
    tool: string;
    ok: boolean;
    output: unknown;
    error?: string;
  }>;
  proposals: ImprovementProposal[];
  worldModelUpdates: number;
  /** Pending tool invocation delegated from the substrate
   *  (plan P1, audit C1) — the kernel relays it to the caller;
   *  it never executes tools itself. */
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

/** Facts reused from the native layer as the knowledge
 *  substrate of cognition. */
export type KnowledgeFact = Fact;
