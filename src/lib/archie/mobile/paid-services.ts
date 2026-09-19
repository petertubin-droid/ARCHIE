// =========================================================
// FRELUX PHASE 8b, PAID CAPABILITY GUARDS
//
// Paid services are modular, optional and DISABLED BY DEFAULT.
// ARCHIE NEVER silently consumes a paid service: every paid
// path funnels through checkPaidCapability(), which returns a
// clear, user-facing message when the capability is disabled.
//
// Basic Free-tier mobile capabilities never touch this module.
// =========================================================
import { supabase } from "@/lib/supabase";
import type { ArchiePaidActivation, ArchiePaidCapability } from "./types";

export interface PaidCapabilitySpec {
  capability: ArchiePaidCapability;
  label: string;
  description: string;
  /** What the user would be paying for (cloud AI/transcription). */
  provider: string;
}

export const PAID_CAPABILITIES: Readonly<
  Record<ArchiePaidCapability, PaidCapabilitySpec>
> = {
  CLOUD_AI_GENERATION: {
    capability: "CLOUD_AI_GENERATION",
    label: "Cloud AI generation",
    description:
      "Full LLM-quality text and code generation via cloud AI providers.",
    provider: "External cloud provider (FRELUX-authorized fallback)",
  },
  CLOUD_TRANSCRIPTION: {
    capability: "CLOUD_TRANSCRIPTION",
    label: "Cloud transcription",
    description: "Server-side transcription of long or noisy audio recordings.",
    provider: "External transcription provider (FRELUX-authorized fallback)",
  },
  WEB_SEARCH_INTEL: {
    capability: "WEB_SEARCH_INTEL",
    label: "Web search intelligence",
    description: "TAVILY-backed live web search for ARCHIE web intelligence.",
    provider: "TAVILY",
  },
};

export const PAID_CAPABILITY_KEYS: readonly ArchiePaidCapability[] =
  Object.keys(PAID_CAPABILITIES) as ArchiePaidCapability[];

/** The single enforcement point, never bypass it for a paid path. */
export function checkPaidCapability(
  capability: ArchiePaidCapability,
  activations: Partial<Record<ArchiePaidCapability, boolean>>,
): { ok: boolean; error?: string } {
  const spec = PAID_CAPABILITIES[capability];
  if (!activations[capability]) {
    return {
      ok: false,
      error:
        `${spec.label} is disabled and requires activation. ` +
        `This is an optional paid capability (${spec.provider}), ARCHIE never uses paid services silently. ` +
        `Activate it in ARCHIE Mobile → Security, or continue with the free on-device path.`,
    };
  }
  return { ok: true };
}

export async function fetchPaidActivations(
  userId: string,
): Promise<Partial<Record<ArchiePaidCapability, boolean>>> {
  const { data, error } = await supabase
    .from("frelux_archie_paid_capabilities")
    .select("capability, enabled")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const map: Partial<Record<ArchiePaidCapability, boolean>> = {};
  for (const row of data ?? []) {
    map[row.capability as ArchiePaidCapability] = row.enabled;
  }
  return map;
}

/** Activation is ALWAYS explicit, no code path flips this silently. */
export async function activatePaidCapability(
  userId: string,
  capability: ArchiePaidCapability,
): Promise<void> {
  const { error } = await supabase
    .from("frelux_archie_paid_capabilities")
    .upsert(
      { user_id: userId, capability, enabled: true },
      { onConflict: "user_id,capability" },
    );
  if (error) throw new Error(error.message);
}

export async function deactivatePaidCapability(
  userId: string,
  capability: ArchiePaidCapability,
): Promise<void> {
  const { error } = await supabase
    .from("frelux_archie_paid_capabilities")
    .upsert(
      { user_id: userId, capability, enabled: false },
      { onConflict: "user_id,capability" },
    );
  if (error) throw new Error(error.message);
}

export type { ArchiePaidActivation };
