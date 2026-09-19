// =========================================================
// FRELUX ARCHIE, AI INFERENCE ABSTRACTION (SHARED)
// supabase/functions/_shared/archie-ai/runtime.ts
//
// THE ARCHIE AI LAYER. Provider-independent by design:
//
//   ARCHIE APPLICATION
//     → ARCHIE INTELLIGENCE CORE   (orchestration, tools,
//                                   validation, policy)
//     → ARCHIE AI INFERENCE LAYER  (this module: the single
//                                   boundary between ARCHIE
//                                   and any model)
//     → ARCHIE MODEL RUNTIME       (ARCHIE's own model/inference
//                                   implementation — the target
//                                   primary engine)
//
// HARD RULES:
//   * Gemini/OpenAI/any external provider is NEVER ARCHIE's
//     brain. External providers may only exist behind optional
//     ADAPTERS, explicitly labeled as external development
//     services during ARCHIE's independence roadmap.
//   * The ARCHIE-native runtime is an IMPLEMENTATION
//     BOUNDARY: when its capabilities are not implemented it
//     reports `operational: false` — it never pretends, and no
//     adapter is silently presented as ARCHIE.
//   * ARCHIE Knowledge, Learning, Memory and Tools are
//     ARCHIE-owned application data (Supabase, RLS-guarded).
//     Nothing is trapped inside a provider conversation.
//
// CAPABILITY BOUNDARIES RESERVED (roadmap surface — do not
// fake any of these until genuinely implemented):
//   model-loading, inference, tokenization, context-handling,
//   multimodal-processing, embeddings, retrieval, memory,
//   tool-calling, structured-output, model-versioning,
//   evaluation, training/fine-tuning, deployment, monitoring.
// =========================================================

// ---------------------------------------------------------
// 1. Generic, provider-neutral inference contract
// ---------------------------------------------------------
export type ArchieCapability =
  | "model-loading"
  | "inference"
  | "tokenization"
  | "context-handling"
  | "multimodal-processing"
  | "embeddings"
  | "retrieval"
  | "memory"
  | "tool-calling"
  | "structured-output"
  | "model-versioning"
  | "evaluation"
  | "training-fine-tuning"
  | "deployment"
  | "monitoring";

export interface ArchieToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ArchieToolCall {
  /** Provider round-trip signature, relayed verbatim for multi-turn tool flows. */
  signature?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ArchieToolResult {
  name: string;
  output: unknown;
}

export interface ArchieInferencePart {
  text?: string;
  toolCall?: ArchieToolCall;
  toolResult?: ArchieToolResult;
  /** Inline base64 media (image/audio/document bytes), provider-neutral. */
  inlineMedia?: { mimeType: string; data: string };
}

export interface ArchieInferenceTurn {
  role: "owner" | "archie";
  parts: ArchieInferencePart[];
}

export interface ArchieInferenceRequest {
  /** Conversation turns, provider-neutral. */
  turns: ArchieInferenceTurn[];
  /** ARCHIE's own tool registry, passed through this layer. */
  tools: ArchieToolSpec[];
  systemInstruction: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Optional structured-output hint (provider-neutral schema). */
  responseSchema?: Record<string, unknown>;
  /** Conversation id for request-scoped session isolation
   *  (audit fix C-1, 2026-09-11): concurrent conversations in
   *  one isolate never share working memory, episodic stamps
   *  or a tool surface. Optional — "default" when omitted. */
  conversationId?: string;
  /** Gap A-1 (2026-09-16): TRUE only on the owner's own turn.
   *  Unlocks the owner-gated local generative model at the
   *  honest-unknown path (owner's own server, labeled output,
   *  never stored as knowledge). Default absent/false: NO
   *  generation — the gate is opt-in, never opt-out. */
  ownerAuthorized?: boolean;
}

export type ArchieEnginePath =
  "archie-native" | "external-adapter" | "archie-unified-cognitive";

/** Honest engine identity attached to every inference result. */
export interface ArchieEngineInfo {
  path: ArchieEnginePath;
  /** Adapter name when path === "external-adapter". */
  adapter?: string;
  /** Human-readable, honest provenance line. */
  note: string;
}

export interface ArchieInferenceResult {
  parts: ArchieInferencePart[];
  engine: ArchieEngineInfo;
  /** Provider finish reason when available (e.g. "MAX_TOKENS" = output was truncated). */
  finishReason?: string;
}

// ---------------------------------------------------------
// 2. The runtime interface every engine must implement
// ---------------------------------------------------------
export interface ArchieRuntime {
  id: string;
  kind: "archie-native" | "external-adapter";
  label: string;
  /** True only when genuinely implemented and operational. */
  isOperational(): boolean;
  /** Implemented capabilities. Report honestly, never aspirationally. */
  capabilities(): ArchieCapability[];
  generate(req: ArchieInferenceRequest): Promise<ArchieInferenceResult>;
}

export class ArchieRuntimeNotImplementedError extends Error {
  capability: ArchieCapability;
  constructor(capability: ArchieCapability) {
    super(
      `ARCHIE-native runtime capability "${capability}" is an implementation boundary and is not implemented yet. ` +
        "No external provider is substituted for ARCHIE silently.",
    );
    this.capability = capability;
    this.name = "ArchieRuntimeNotImplementedError";
  }
}

// ---------------------------------------------------------
// 3. ARCHIE MODEL RUNTIME (the future primary engine)
//
// This is where ARCHIE's OWN model lives: model loading,
// tokenization, inference, multimodal processing, embeddings,
// retrieval, memory and training. Until those are genuinely
// built, this runtime reports operational: false. It is the
// roadmap stages 5-13 of ARCHIE independence, NOT a Gemini
// wrapper.
// ---------------------------------------------------------
export class ArchieModelRuntime implements ArchieRuntime {
  readonly id = "archie-model-runtime";
  readonly kind = "archie-native" as const;
  readonly label =
    "ARCHIE Model Runtime (own inference — implementation boundary)";

  isOperational(): boolean {
    // ARCHIE's own model is not trained/served yet. Honest, not fake.
    return false;
  }

  capabilities(): ArchieCapability[] {
    // None implemented yet. Each entry lands here only when real.
    return [];
  }

  async generate(): Promise<ArchieInferenceResult> {
    throw new ArchieRuntimeNotImplementedError("inference");
  }
}

import { getNativeEngine } from "./native-engine/engine.ts";
import { getCognitiveEngine } from "./cognitive/kernel.ts";

// ---------------------------------------------------------
// 4. PROVIDER-AGNOSTIC CAPABILITY ENGINES
//
// Per the PERMANENT PROVIDER INDEPENDENCE PRINCIPLE
// (src/lib/archie/provider-independence.ts): ARCHIE Core,
// Coding Studio, Memory, Learning, Evolution and PWA contain
// ZERO external-provider wiring. Capabilities that need
// inference never reference a provider, provider key or model
// name. They resolve their engine through THIS registry by a
// neutral id, configured via the capability's own env var
// (e.g. ARCHIE_STUDIO_ENGINE, ARCHIE_ENGINE). Adding, changing
// or swapping a future engine happens in the registry alone —
// zero consumer redesign. Gemini and other external providers
// exist ONLY in the FRELUX application layer as fallback
// services, never inside ARCHIE.
// ---------------------------------------------------------

/** Registry of engine factories by NEUTRAL id. No provider names in consumer code. */
const CAPABILITY_ENGINE_REGISTRY: Record<string, () => ArchieRuntime> = {
  // ARCHIE's own model runtime — the future full model target.
  "archie-model-runtime": () => new ArchieModelRuntime(),
  // ARCHIE'S OWN NATIVE INTELLIGENCE ENGINE — the real,
  // operational in-engine inference runtime (NLU, knowledge,
  // reasoning, planning, tools, learning, self-evaluation).
  // Zero external AI APIs. Foundational core component.
  "archie-native-engine": () => getNativeEngine(),
  // ARCHIE'S UNIFIED GENERAL COGNITIVE INTELLIGENCE ENGINE —
  // the highest-level intelligence architecture of ARCHIE
  // (owner directive 2026-09-10). ONE unified intelligence
  // (never sub-agents) running the permanent cognitive loop
  // PERCEIVE→UNDERSTAND→RETRIEVE→REASON→MODEL→PLAN→CREATE→
  // VERIFY→ACT→OBSERVE→EVALUATE→LEARN→REMEMBER→IMPROVE.
  // Built on ARCHIE's own native engine — zero external AI.
  "archie-cognitive-engine": () => getCognitiveEngine(),
  // Future engines register here. Every entry must implement
  // the ArchieRuntime contract and report isOperational()
  // honestly. No silent substitutions, ever.
};

export function resolveArchieCapabilityEngine(env: {
  /** Neutral engine id from the capability's own configuration (e.g. ARCHIE_STUDIO_ENGINE). */
  engineId?: string;
}): { runtime: ArchieRuntime | null; engine: ArchieEngineInfo } {
  // 1. ARCHIE-native first, always.
  const model = new ArchieModelRuntime();
  if (model.isOperational()) {
    return {
      runtime: model,
      engine: {
        path: "archie-native",
        note: "Generated by ARCHIE's own model runtime.",
      },
    };
  }

  // 1a. ARCHIE'S UNIFIED GENERAL COGNITIVE INTELLIGENCE
  // ENGINE — the highest-level architecture (owner
  // directive). One unified intelligence over the native
  // substrate; outranks every other engine because it IS
  // the full architecture.
  const cognitive = getCognitiveEngine();
  if (cognitive.isOperational()) {
    return {
      runtime: cognitive,
      engine: {
        path: "archie-native",
        note: cognitive.label,
      },
    };
  }

  // 1b. ARCHIE's own NATIVE INTELLIGENCE ENGINE — the
  // operational foundational core (owner directive). It is
  // archie-native, so it outranks every configured engine.
  const nativeEngine = getNativeEngine();
  if (nativeEngine.isOperational()) {
    return {
      runtime: nativeEngine,
      engine: {
        path: "archie-native",
        note: nativeEngine.label,
      },
    };
  }

  // 2. Explicitly configured engine, resolved by NEUTRAL id.
  if (env.engineId) {
    const factory = CAPABILITY_ENGINE_REGISTRY[env.engineId];
    if (factory) {
      const runtime = factory();
      if (runtime.isOperational()) {
        return {
          runtime,
          engine: {
            path:
              runtime.kind === "archie-native"
                ? "archie-native"
                : "external-adapter",
            // The engine reports its own honest identity.
            note: runtime.label,
          },
        };
      }
    }
  }

  // 3. Honest not-operational state — the caller must report
  // this truthfully. ARCHIE never silently substitutes a
  // provider and never fakes a result.
  return {
    runtime: null,
    engine: {
      path: "archie-native",
      note: "ARCHIE's own model runtime is an implementation boundary. No engine is operational.",
    },
  };
}
