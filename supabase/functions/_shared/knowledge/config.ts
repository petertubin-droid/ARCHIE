// =========================================================
// ARCHIE KNOWLEDGE REPOSITORY — PROJECT B CONFIGURATION
// (Phase 5, server-side ONLY)
//
// Project B (the ARCHIE knowledge subsystem) is reached over
// PostgREST with its service-role key. The credentials live as
// Edge Function secrets on Project A (the caller), per
// migration-prep/phase2-secrets-procedure.md:
//
//   KNOWLEDGE_DB_URL            https://<project-b-ref>.supabase.co
//   KNOWLEDGE_SERVICE_ROLE_KEY  Project B's service-role secret
//   KNOWLEDGE_WRITES_ENABLED    optional; "true" unlocks the
//                               repository's gated ingestion path
//                               (default: DISABLED — the
//                               knowledge-write freeze)
//
// Safety rules (owner-approved architecture):
//   * NEVER hardcode the URL or the key in source.
//   * NEVER let either value reach the browser bundle — this
//     module lives only under supabase/functions/, which the
//     Netlify build never ships (verified in the phase-2 scan).
//   * NEVER log the key. Errors below carry NO key material.
//   * Fail safely: missing/bad configuration returns a typed
//     result the caller can turn into a clean degraded mode —
//     it never throws raw credentials, never fabricates a URL,
//     and never silently falls back to another database.
//   * Project A's own SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     (platform-injected) are NOT read here and stay unchanged.
// =========================================================

/** Project B REST hostnames always end in .supabase.co. */
const SUPABASE_HOST_SUFFIX = ".supabase.co";

export type KnowledgeConfigReason =
  "missing_url" | "missing_key" | "invalid_url";

export interface KnowledgeConfig {
  /** Project B REST base URL (https://…supabase.co). */
  readonly url: string;
  /** Project B service-role secret. Never logged, never echoed. */
  readonly serviceKey: string;
  /** Whether the gated ingestion path is unlocked (default false). */
  readonly writesEnabled: boolean;
}

export type KnowledgeConfigResult =
  | { ok: true; config: KnowledgeConfig }
  | { ok: false; reason: KnowledgeConfigReason; message: string };

/**
 * Runtime-agnostic env reader. The Deno edge runtime exposes
 * Deno.env; vitest's node environment exposes process.env (the
 * test shim's Deno.env only knows the fixture names, so the
 * fallback keeps repository tests controllable from process.env).
 */
export function readEnv(name: string): string | undefined {
  const deno = (
    globalThis as {
      Deno?: { env?: { get?: (n: string) => string | undefined } };
    }
  ).Deno;
  const fromDeno = deno?.env?.get?.(name);
  if (fromDeno !== undefined) return fromDeno;
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return proc?.env?.[name];
}

/** For logs: the URL host is not a secret; show only the origin. */
export function knowledgeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "<invalid-knowledge-url>";
  }
}

function isValidKnowledgeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname.endsWith(SUPABASE_HOST_SUFFIX)) return false;
  // No path/credentials/query baked into the base URL.
  return (
    parsed.pathname === "/" && parsed.username === "" && parsed.search === ""
  );
}

/**
 * Load and validate the Project B configuration. NEVER throws;
 * NEVER includes key material in any message.
 */
export function loadKnowledgeConfig(): KnowledgeConfigResult {
  const url = readEnv("KNOWLEDGE_DB_URL");
  const serviceKey = readEnv("KNOWLEDGE_SERVICE_ROLE_KEY");

  if (!url) {
    return {
      ok: false,
      reason: "missing_url",
      message:
        "KNOWLEDGE_DB_URL is not set — the ARCHIE knowledge subsystem (Project B) is not configured. Server-side knowledge access is unavailable.",
    };
  }
  if (!isValidKnowledgeUrl(url)) {
    return {
      ok: false,
      reason: "invalid_url",
      message:
        "KNOWLEDGE_DB_URL is invalid — it must be an https://…supabase.co origin with no path, credentials, or query. Knowledge access is disabled.",
    };
  }
  if (!serviceKey || serviceKey.length < 20) {
    return {
      ok: false,
      reason: "missing_key",
      message:
        "KNOWLEDGE_SERVICE_ROLE_KEY is not set — the ARCHIE knowledge subsystem (Project B) cannot authenticate server-side. Knowledge access is unavailable.",
    };
  }
  const writesFlag = readEnv("KNOWLEDGE_WRITES_ENABLED");
  return {
    ok: true,
    config: {
      url,
      serviceKey,
      writesEnabled: writesFlag === "true" || writesFlag === "1",
    },
  };
}
