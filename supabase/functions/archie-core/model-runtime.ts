// =========================================================
// FRELUX ARCHIE STAGE 2 — ARCHIE AI ABSTRACTION / MODEL RUNTIME
//
// ARCHIE INTELLIGENCE CORE
//   → ARCHIE AI ABSTRACTION  (this module)
//     → PROVIDER-AGNOSTIC ENGINE REGISTRY (shared)
//
// PERMANENT PROVIDER INDEPENDENCE PRINCIPLE
// (src/lib/archie/provider-independence.ts): Gemini and any
// other external provider exist ONLY in the FRELUX
// application as a fallback service. ARCHIE Core contains ZERO
// provider wiring — no keys, no endpoints, no model names, no
// fallback logic. All inference resolves through ARCHIE's
// shared provider-agnostic engine registry by NEUTRAL engine
// id (ARCHIE_ENGINE), so future engines register without
// redesigning the Intelligence Core.
//
//   * ARCHIE is never described as provider-powered — results
//     report their honest engine origin.
//   * ARCHIE_OWN_MODEL is registered with honest status
//     NOT_YET_AVAILABLE (spec §40): it refuses with a clear
//     error, it never fakes inference.
// =========================================================

import { resolveArchieCapabilityEngine } from "../_shared/archie-ai/runtime.ts";

// ---------------------------------------------------------
// Contract (mirrors src/lib/archie/ai-abstraction.ts)
// ---------------------------------------------------------
export interface RuntimePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface InferenceTurn {
  role: "owner" | "archie";
  parts: RuntimePart[];
}

export interface InferenceRequest {
  /** Legacy flat form: a single owner turn built from parts. */
  parts?: RuntimePart[];
  /** Full conversation structure: history turns plus the
   *  owner's final turn. When present the engine receives the
   *  turns VERBATIM — the shared NLU classifies the owner's
   *  RAW message (identical to every other ARCHIE surface),
   *  never a flattened prompt blob. Single-brain contract
   *  (owner fix 2026-09-15). */
  turns?: InferenceTurn[];
  schema?: Record<string, unknown>;
  systemPrompt?: string;
}

export interface InferenceResult {
  /** Parsed JSON or { reply } from the runtime. */
  data: Record<string, unknown>;
  runtimeId: string;
  adapterId: string;
  model: string;
}

export interface RuntimeStatusEntry {
  id: string;
  kind: "ARCHIE_NATIVE" | "EXTERNAL_ADAPTER";
  label: string;
  status: "ACTIVE" | "NOT_YET_AVAILABLE";
}

// ---------------------------------------------------------
// ARCHIE OWN MODEL — the future primary runtime.
// Registered but honestly NOT YET AVAILABLE: no independent
// foundation model exists yet, so it refuses rather than
// pretending (spec §§10, 40).
// ---------------------------------------------------------
const ARCHIE_OWN_MODEL_ENTRY: RuntimeStatusEntry = {
  id: "ARCHIE_OWN_MODEL",
  kind: "ARCHIE_NATIVE",
  label: "ARCHIE own model (registered, not yet available)",
  status: "NOT_YET_AVAILABLE",
};

// ARCHIE'S OWN NATIVE INTELLIGENCE ENGINE — the operational
// foundational inference runtime (NLU, knowledge, reasoning,
// planning, tools, learning, self-evaluation). Zero external
// AI APIs. Registered and ACTIVE.
const ARCHIE_NATIVE_ENGINE_ENTRY: RuntimeStatusEntry = {
  id: "archie-native-engine",
  kind: "ARCHIE_NATIVE",
  label:
    "ARCHIE Native Intelligence Engine (own inference — NLU, knowledge, reasoning, planning, tools, learning)",
  status: "ACTIVE",
};

/** Honest runtime list for the Owner UI — never simulated (spec §40). */
export function listRuntimes(): RuntimeStatusEntry[] {
  return [ARCHIE_NATIVE_ENGINE_ENTRY, ARCHIE_OWN_MODEL_ENTRY];
}

// ---------------------------------------------------------
// One inference call through the shared provider-agnostic
// engine registry. No provider is ever referenced here.
// ---------------------------------------------------------
export async function infer(req: InferenceRequest): Promise<InferenceResult> {
  const { runtime, engine } = resolveArchieCapabilityEngine({
    engineId: Deno.env.get("ARCHIE_ENGINE"),
  });
  if (!runtime) {
    throw new Error(
      "No inference runtime is available. ARCHIE's own model is not yet built and no engine is registered in ARCHIE's provider-agnostic engine registry.",
    );
  }
  const mapPart = (p: RuntimePart) =>
    p.text !== undefined ? { text: p.text } : { inlineMedia: p.inlineData };
  const turns = req.turns ?? [
    { role: "owner" as const, parts: (req.parts ?? []).map(mapPart) },
  ];
  const result = await runtime.generate({
    turns,
    tools: [],
    systemInstruction: req.systemPrompt ?? "",
    ...(req.schema ? { responseSchema: req.schema } : {}),
  });
  const text = result.parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Inference runtime returned no content.");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { reply: text };
  }
  return {
    data: parsed,
    runtimeId: "ARCHIE_INTELLIGENCE_CORE",
    adapterId:
      engine.path === "external-adapter" && engine.adapter
        ? engine.adapter
        : engine.path,
    model: runtime.id,
  };
}
