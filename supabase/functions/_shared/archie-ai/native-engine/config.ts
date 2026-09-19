// =========================================================
// NATIVE ENGINE CONFIG (remediation batch 4, 2026-09-13)
//
// Runtime-configurable caps for the native core. Every value
// has a SAFE DEFAULT; env overrides must be positive integers
// — anything malformed falls back to the default, never to
// zero or an undefined value. Works under both the Deno edge
// runtime and Node (vitest).
// =========================================================

function envRaw(name: string): string | undefined {
  const g = globalThis as {
    Deno?: { env?: { get(n: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  try {
    return g.Deno?.env?.get(name) ?? g.process?.env?.[name];
  } catch {
    return undefined;
  }
}

/** Parse a positive integer env override; invalid or missing
 *  values honestly fall back to the default. */
export function envInt(name: string, def: number): number {
  const raw = envRaw(name);
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return n;
}

export const NATIVE_CONFIG = {
  /** Max facts hydrated per isolate (DB load guard). */
  factHydrateLimit: envInt("FRELUX_FACT_HYDRATE_LIMIT", 500),
  /** Max learning outcomes hydrated. */
  outcomeLimit: envInt("FRELUX_OUTCOME_LIMIT", 200),
  /** Max episodic turns hydrated. */
  episodicLimit: envInt("FRELUX_EPISODIC_LIMIT", 200),
  /** Default k for fact ranking. */
  rankK: envInt("FRELUX_RANK_K", 6),
} as const;
