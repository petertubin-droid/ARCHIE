// supabase/functions/_shared/archie-ai/tables.ts
// =========================================================
// TABLE-PREFIX INDIRECTION (audit finding #4, 2026-09-13)
//
// The "provider-independent" ARCHIE shared layer hardcodes
// `frelux_*` physical table names throughout — the ARCHIE
// layer was FRELUX-named, coupling a general intelligence
// stack to one host product. This module is the indirection
// point: shared code references LOGICAL table names
// (`archie_conversations`, `security_events`, …) and the
// physical prefix is resolved once, here, from the runtime
// environment (`ARCHIE_TABLE_PREFIX`, default `frelux_`).
//
// Zero behavior change with the default prefix — every
// existing deployment resolves to the same physical names.
// A future host product sets ARCHIE_TABLE_PREFIX and the
// whole shared layer follows, with no code sweep.
//
// Deno + Node/vitest compatible: the env read is guarded so
// the module is inert in tests (default prefix, no globals
// touched).
// =========================================================

const DEFAULT_PREFIX = "frelux_";

function resolvePrefix(): string {
  try {
    const g = globalThis as {
      Deno?: { env?: { get?: (k: string) => string | undefined } };
    };
    const raw = g.Deno?.env?.get?.("ARCHIE_TABLE_PREFIX");
    if (raw && /^[a-z_][a-z0-9_]*$/i.test(raw))
      return raw.endsWith("_") ? raw : `${raw}_`;
  } catch {
    /* never break table resolution over an env read */
  }
  return DEFAULT_PREFIX;
}

const PREFIX = resolvePrefix();

/** Logical table name → physical table name. */
export function table(logical: string): string {
  // Already-physical names pass through unchanged (safe to
  // call on values that may or may not carry the prefix).
  if (logical.startsWith(PREFIX)) return logical;
  return `${PREFIX}${logical}`;
}
