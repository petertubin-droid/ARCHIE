// =========================================================
// FRELUX PHASE 8b, FREE ON-DEVICE GENERATION PATHS
//
// ARCHIE text/code generation is a FREE mobile capability that
// requires NO paid AI/cloud service: deterministic templates
// compose text/code from FRELUX data. If the user wants full
// cloud LLM generation, that is a paid capability (disabled by
// default), see paid-services.ts. ARCHIE never silently
// consumes a paid service.
// =========================================================
import { checkPaidCapability } from "./paid-services";
import type { ArchiePaidCapability } from "./types";

export interface GenerationRequest {
  kind: "SUMMARY" | "TASK_LIST" | "MATERIAL_LIST" | "SNIPPET" | "CODE";
  title: string;
  /** Structured data the template composes from. */
  data: Record<string, unknown>;
}

export interface GenerationResult {
  text: string;
  /** Which path produced it, free/on-device, never paid. */
  path: "FREE_ON_DEVICE";
}

const UNSAFE_TEMPLATE_NAMES =
  /^(javascript|eval|function|import|require|window|globalthis|constructor|proto)$/i;

export function isSafeTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,40}$/i.test(name) && !UNSAFE_TEMPLATE_NAMES.test(name);
}

const TEMPLATES: Record<string, (r: GenerationRequest) => string> = {
  SUMMARY: (r) => {
    const parts = Object.entries(r.data)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${label(k)}: ${String(v).slice(0, 300)}`);
    return [
      `${r.title}`,
      "",
      ...parts,
      "",
      ": Composed on-device by ARCHIE (free path, no cloud AI).",
    ].join("\n");
  },
  TASK_LIST: (r) => {
    const tasks = r.data.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0)
      return `${r.title}\n\nNo tasks yet.`;
    return [
      `${r.title}`,
      "",
      ...tasks.map((t, i) => `${i + 1}. ${String(t).slice(0, 200)}`),
      "",
      ": Composed on-device by ARCHIE (free path, no cloud AI).",
    ].join("\n");
  },
  MATERIAL_LIST: (r) => {
    const mats = r.data.materials;
    if (!Array.isArray(mats) || mats.length === 0)
      return `${r.title}\n\nNo materials recorded.`;
    return [
      `${r.title}`,
      "",
      ...mats.map((m) => `• ${String(m).slice(0, 200)}`),
      "",
      ": Composed on-device by ARCHIE (free path, no cloud AI).",
    ].join("\n");
  },
  SNIPPET: (r) =>
    `${r.title}\n\n${String(r.data.snippet ?? "").slice(0, 4000)}`,
  CODE: (r) => {
    const lang = isSafeTemplateName(String(r.data.language ?? "text"))
      ? r.data.language
      : "text";
    const code = String(r.data.code ?? "").slice(0, 8000);
    return `${r.title}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n: Drafted on-device by ARCHIE (free path). Production changes still require owner authorization.`;
  },
};

function label(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Free generation, deterministic, on-device, zero paid services.
 * Injection-safe: templates treat all data as inert strings.
 */
export function generateFree(req: GenerationRequest): GenerationResult {
  const tpl = TEMPLATES[req.kind] ?? TEMPLATES.SUMMARY;
  return { text: tpl(req), path: "FREE_ON_DEVICE" };
}

/**
 * Cloud generation request, ONLY reachable when the user has
 * explicitly activated the paid capability. Returns the guard
 * message otherwise; the caller never invokes a cloud provider
 * without an explicit ok here.
 */
export function requestCloudGeneration(
  activations: Partial<Record<ArchiePaidCapability, boolean>>,
): { ok: boolean; error?: string } {
  return checkPaidCapability("CLOUD_AI_GENERATION", activations);
}
