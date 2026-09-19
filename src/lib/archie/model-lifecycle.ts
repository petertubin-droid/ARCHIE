// =========================================================
// FRELUX ARCHIE STAGE 2 — ARCHIE MODEL / INFERENCE LIFECYCLE
//
// Architectural interface for ARCHIE's eventual independent
// model (spec §10): datasets, cleaning, versioning,
// tokenization, embeddings, training, evaluation, registry,
// serving, monitoring, rollback.
//
// HONESTY CONTRACT (spec §40): nothing here simulates training
// or inference. Every capability that is not yet implemented
// returns status NOT_YET_IMPLEMENTED — the correct interface
// exists, the capability is clearly marked unavailable, and
// no placeholder is ever presented as functioning.
// =========================================================

export type LifecycleStatus =
  "READY" | "NOT_YET_IMPLEMENTED" | "NOT_YET_AVAILABLE";

export interface LifecycleCapability {
  capability: string;
  status: LifecycleStatus;
  note: string;
}

export interface TrainingDataset {
  id: string;
  name: string;
  version: number;
  scope: "ARCHIE_GLOBAL" | "FRELUX";
  item_count: number;
}

export interface ModelVersion {
  id: string;
  runtimeId: "ARCHIE_OWN_MODEL";
  version: string;
  status:
    "REGISTERED" | "IN_TRAINING" | "EVALUATED" | "SERVING" | "ROLLED_BACK";
}

// ---------------------------------------------------------
// The complete future-model capability map. All interfaces
// exist; none pretend to be live yet.
// ---------------------------------------------------------
export const MODEL_LIFECYCLE_CAPABILITIES: readonly LifecycleCapability[] = [
  {
    capability: "Training dataset registry",
    status: "NOT_YET_IMPLEMENTED",
    note: "Dataset schema + versioning interface defined.",
  },
  {
    capability: "Dataset ingestion",
    status: "NOT_YET_IMPLEMENTED",
    note: "Owner-approved knowledge items are the future training corpus.",
  },
  {
    capability: "Data cleaning",
    status: "NOT_YET_IMPLEMENTED",
    note: "Deterministic cleaning rules over approved knowledge.",
  },
  {
    capability: "Dataset versioning",
    status: "NOT_YET_IMPLEMENTED",
    note: "Immutable dataset versions with lineage.",
  },
  {
    capability: "Tokenization",
    status: "NOT_YET_IMPLEMENTED",
    note: "Token pipeline interface; language set not fixed (spec §16).",
  },
  {
    capability: "Embeddings",
    status: "NOT_YET_IMPLEMENTED",
    note: "Retrieval interface compatible with future embeddings.",
  },
  {
    capability: "Model experiments",
    status: "NOT_YET_IMPLEMENTED",
    note: "Experiment tracking interface.",
  },
  {
    capability: "Supervised training",
    status: "NOT_YET_IMPLEMENTED",
    note: "Runs only in an authorized training environment.",
  },
  {
    capability: "Fine-tuning",
    status: "NOT_YET_IMPLEMENTED",
    note: "Base-model choice remains open.",
  },
  {
    capability: "Evaluation",
    status: "NOT_YET_IMPLEMENTED",
    note: "Benchmark + regression evaluation interface.",
  },
  {
    capability: "Benchmark testing",
    status: "NOT_YET_IMPLEMENTED",
    note: "Deterministic benchmark suites.",
  },
  {
    capability: "Multimodal training",
    status: "NOT_YET_IMPLEMENTED",
    note: "Image/document/video corpus handling interface.",
  },
  {
    capability: "Model registry",
    status: "READY",
    note: "ARCHIE_OWN_MODEL registered in the runtime registry with honest NOT_YET_AVAILABLE status.",
  },
  {
    capability: "Model versioning",
    status: "READY",
    note: "Runtime descriptors carry id/kind/status; versioned by design.",
  },
  {
    capability: "Inference serving",
    status: "READY",
    note: "All inference serves through the ARCHIE AI Abstraction (adapter isolated).",
  },
  {
    capability: "Model monitoring",
    status: "NOT_YET_IMPLEMENTED",
    note: "Runtime cost + error telemetry interface exists (frelux_infrastructure_costs).",
  },
  {
    capability: "Model rollback",
    status: "READY",
    note: "Runtime registry preference order: falling back to an adapter is a rollback by design.",
  },
];

/**
 * Honest capability report. The Owner-facing System pages call
 * this directly — the UI renders exactly these statuses, it
 * never invents progress (spec §40).
 */
export function modelLifecycleReport(): LifecycleCapability[] {
  return [...MODEL_LIFECYCLE_CAPABILITIES];
}

/**
 * Validation used by the runtime registry when ARCHIE's own
 * model graduates: a model version may only be registered as
 * SERVING when its evaluation record exists. The check is
 * deliberately strict — no fabricated graduation.
 */
export function canRegisterOwnModelServing(
  evaluatedVersions: ModelVersion[],
  candidateVersion: string,
): { ok: boolean; reason: string } {
  const evaluated = evaluatedVersions.some(
    (v) => v.version === candidateVersion && v.status === "EVALUATED",
  );
  if (!evaluated) {
    return {
      ok: false,
      reason:
        "A model version may serve only after passing evaluation — refusing to register an unevaluated model.",
    };
  }
  return {
    ok: true,
    reason: "Evaluated version may be registered as serving.",
  };
}
