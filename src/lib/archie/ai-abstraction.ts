// =========================================================
// FRELUX ARCHIE STAGE 2 — ARCHIE AI ABSTRACTION (shared contract)
//
// ARCHIE INTELLIGENCE CORE
//   → ARCHIE AI ABSTRACTION (this contract)
//     → MODEL RUNTIME (replaceable)
//
// The server-side engine resolution lives in the shared
// provider-agnostic registry (supabase/functions/_shared/
// archie-ai/runtime.ts) and archie-core/model-runtime.ts
// mirrors these types. PERMANENT PROVIDER INDEPENDENCE
// PRINCIPLE: Gemini (and any external provider) exists ONLY in
// the FRELUX application as a fallback service — never inside
// ARCHIE. ARCHIE's own model is the designed primary runtime;
// until it exists it is registered with the honest status
// NOT_YET_AVAILABLE (spec §§1, 10, 11, 39, 40).
// =========================================================

export type RuntimeKind = "ARCHIE_NATIVE" | "EXTERNAL_ADAPTER";
export type RuntimeStatus = "ACTIVE" | "NOT_YET_AVAILABLE";

export interface RuntimePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface InferenceRequest {
  parts: RuntimePart[];
  schema?: Record<string, unknown>;
  systemPrompt?: string;
}

export interface InferenceResult {
  data: Record<string, unknown>;
  /** Always the ARCHIE Intelligence Core — never a provider. */
  runtimeId: string;
  /** The replaceable part that served this call. */
  adapterId: string;
  model: string;
}

export interface ModelRuntimeDescriptor {
  id: string;
  kind: RuntimeKind;
  label: string;
  status: RuntimeStatus;
}

export const ARCHIE_RUNTIME_CORE = "ARCHIE_INTELLIGENCE_CORE";

export const ARCHIE_OWN_MODEL_DESCRIPTOR: ModelRuntimeDescriptor = {
  id: "ARCHIE_OWN_MODEL",
  kind: "ARCHIE_NATIVE",
  label: "ARCHIE own model — registered, not yet available",
  status: "NOT_YET_AVAILABLE",
};

export const RUNTIME_REGISTRY: ModelRuntimeDescriptor[] = [
  ARCHIE_OWN_MODEL_DESCRIPTOR,
];

// ---------------------------------------------------------
// Model-independence invariants (spec §39). These are the
// guarantees the architecture gives the Owner; tests assert
// them and every new runtime must keep them true.
// ---------------------------------------------------------
export const PROVIDER_INDEPENDENCE: {
  invariant: string;
  detail: string;
}[] = [
  {
    invariant: "ARCHIE identity is the Intelligence Core",
    detail:
      "ARCHIE is never described as Gemini-powered, OpenAI-powered or Claude-powered; the runtime/adapter is reported as a replaceable part.",
  },
  {
    invariant: "Knowledge is provider-independent",
    detail:
      "The Knowledge Core (frelux_knowledge_items, scopes, provenance, versions) has no provider dependency.",
  },
  {
    invariant: "Learning is provider-independent",
    detail:
      "The EXTRACT → VALIDATE → APPROVE → KNOWLEDGE pipeline operates on candidates and is provider-free.",
  },
  {
    invariant: "Memory is provider-independent",
    detail:
      "Conversations, audit events and settings live in ARCHIE's own database.",
  },
  {
    invariant: "Tool routing is provider-independent",
    detail:
      "Deterministic FRELUX engines execute calculations; the runtime only explains results.",
  },
  {
    invariant: "The model runtime is replaceable",
    detail:
      "All inference flows through the provider-agnostic engine registry; registering a new engine requires no Intelligence Core changes — the replaceable adapter contract stays provider-free.",
  },
  {
    invariant: "No external adapter exists inside ARCHIE",
    detail:
      "Per the Provider Independence Principle, no provider key, endpoint, model or fallback exists anywhere in ARCHIE Core. Gemini exists only as a FRELUX application fallback service.",
  },
  {
    invariant: "Existing FRELUX functionality is preserved",
    detail:
      "Provider-backed FRELUX features keep working behind their adapters until replaced.",
  },
];

/** Honest label for UI display — never brands ARCHIE as a provider. */
export function runtimeIdentityLabel(activeAdapterId: string): string {
  return activeAdapterId
    ? "ARCHIE Intelligence Core (external inference adapter active, replaceable)"
    : "ARCHIE Intelligence Core";
}
