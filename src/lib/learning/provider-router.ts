// =========================================================
// FRELUX PHASE 6.5, AI MODEL ROUTER (provider abstraction)
//
// Runtime provider selection for FRELUX AI features. Providers
// are registered capabilities, future providers slot in
// without rewriting FRELUX. Gemini stays available for
// multimodal/image/document intelligence; OpenAI for text and
// reasoning. ARCHIE/ChatGPT reference intelligence is a SEPARATE
// reference channel: it is never part of runtime routing unless
// an explicitly authorized OpenAI runtime integration is
// configured.
// =========================================================

export type AiTaskType =
  | "image_extraction"
  | "document_extraction"
  | "text_reasoning"
  | "chat"
  | "article_generation"
  | "recommendation"
  | "tool_selection"
  | "retrieval";

export interface ProviderProfile {
  id: string;
  runtime: boolean; // false = reference-only channel (e.g. ARCHIE)
  capabilities: AiTaskType[];
  /** lower is better */
  relativeCost: number;
  /** lower is better */
  relativeLatency: number;
  /** 0..1 historical evaluation accuracy, when measured */
  historicalAccuracy?: number;
  /** 0..1 availability */
  availability: number;
}

const REGISTRY = new Map<string, ProviderProfile>();

/** Built-in defaults, matching current production wiring. */
export function registerBuiltinProviders(): void {
  registerProvider({
    id: "GEMINI",
    runtime: true,
    capabilities: [
      "image_extraction",
      "document_extraction",
      "text_reasoning",
      "recommendation",
    ],
    relativeCost: 1,
    relativeLatency: 1,
    historicalAccuracy: undefined, // measured by the evaluation engine over time
    availability: 1,
  });
  registerProvider({
    id: "OPENAI",
    runtime: true,
    capabilities: [
      "chat",
      "text_reasoning",
      "article_generation",
      "recommendation",
      "tool_selection",
      "retrieval",
    ],
    relativeCost: 1.2,
    relativeLatency: 1,
    availability: 1,
  });
  // ARCHIE is a REFERENCE intelligence source, not a runtime model.
  registerProvider({
    id: "ARCHIE",
    runtime: false,
    capabilities: [],
    relativeCost: 0,
    relativeLatency: 0,
    availability: 1,
  });
}

export function registerProvider(profile: ProviderProfile): void {
  REGISTRY.set(profile.id, profile);
}

export function listProviders(): ProviderProfile[] {
  if (REGISTRY.size === 0) registerBuiltinProviders();
  return [...REGISTRY.values()];
}

export function resetProviders(): void {
  REGISTRY.clear();
}

export interface RouteOptions {
  task: AiTaskType;
  prefer?: "accuracy" | "cost" | "latency";
  maxCost?: number;
  maxLatency?: number;
  requireMultimodal?: boolean;
}

export interface RouteDecision {
  provider: string;
  score: number;
  reason: string;
  alternatives: string[];
}

/**
 * Route a task to the best runtime provider. The score balances
 * capability match, availability, historical evaluation results,
 * cost and latency. Reference-only channels (ARCHIE) are never
 * returned. Falls back to any capable provider when the preferred
 * one is unavailable, providers stay replaceable.
 */
export function routeTask(opts: RouteOptions): RouteDecision | null {
  if (REGISTRY.size === 0) registerBuiltinProviders();
  const prefer = opts.prefer ?? "accuracy";
  const scored: Array<{ p: ProviderProfile; score: number }> = [];
  for (const p of REGISTRY.values()) {
    if (!p.runtime) continue; // reference channels excluded from runtime routing
    if (p.availability <= 0) continue; // down providers are not candidates
    if (!p.capabilities.includes(opts.task)) continue;
    if (opts.maxCost != null && p.relativeCost > opts.maxCost) continue;
    if (opts.maxLatency != null && p.relativeLatency > opts.maxLatency)
      continue;
    const cap = 1;
    const acc = p.historicalAccuracy ?? 0.5;
    const costScore = 1 / (1 + p.relativeCost);
    const latencyScore = 1 / (1 + p.relativeLatency);
    const score =
      cap * 0.1 +
      p.availability * 0.1 +
      (prefer === "accuracy"
        ? acc * 0.6 + costScore * 0.1 + latencyScore * 0.1
        : prefer === "cost"
          ? costScore * 0.6 + acc * 0.2 + latencyScore * 0.1
          : latencyScore * 0.6 + acc * 0.2 + costScore * 0.1);
    scored.push({ p, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return {
    provider: best.p.id,
    score: best.score,
    reason: `Best ${prefer}-weighted match for ${opts.task} (score ${best.score.toFixed(3)}, availability ${best.p.availability}).`,
    alternatives: scored.slice(1).map((s) => s.p.id),
  };
}

/** Update a provider's measured accuracy from the evaluation engine. */
export function recordProviderEvaluation(
  providerId: string,
  accuracy: number,
): boolean {
  const p = REGISTRY.get(providerId);
  if (!p || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1)
    return false;
  p.historicalAccuracy = accuracy;
  return true;
}
