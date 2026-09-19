// Cross-project owner identity verification (owner directive 2026-09-12).
//
// ARCHIE's database lives on its own Supabase project while the owner's
// account — the single admin identity — lives on the FRELUX authority
// project. Modern Supabase projects sign auth JWTs with per-project
// ES256 keys (private keys are not exportable), so a local GoTrue
// /auth/v1/user call rejects FRELUX-issued session tokens before the
// function's own gate even runs.
//
// This module verifies those tokens directly against the AUTHORITY
// project's public JWKS (ES256, public keys only — no secrets shared
// between projects). It checks signature and expiry only. WHO the
// owner is remains decided exclusively by public.profiles.role =
// 'admin' in ARCHIE's OWN database, exactly as before: a valid
// authority token without an admin profile row grants nothing, and an
// admin profile row without a valid signed token grants nothing.
//
// Feature flag: set ARCHIE_AUTHORITY_JWKS_URL on the ARCHIE project to
// the authority's /auth/v1/.well-known/jwks.json. Absent/empty →
// cross-project verification disabled (standalone behaviour unchanged).

export interface VerifiedAuthorityJwt {
  sub: string;
  email?: string;
  exp: number;
}

interface JwtParts {
  header: { alg?: string; kid?: string; typ?: string };
  payload: {
    sub?: string;
    email?: string;
    exp?: number;
    [key: string]: unknown;
  };
  signingInput: Uint8Array;
  signature: Uint8Array;
}

// CI gotcha (seen 5× now): tsconfig.app.json has no Deno types, so
// referencing the bare `Deno` global breaks the app typecheck —
// read the edge-runtime env through a typed globalThis lookup.
const JWKS_URL: string =
  (
    globalThis as {
      Deno?: { env?: { get(name: string): string | undefined } };
    }
  ).Deno?.env?.get("ARCHIE_AUTHORITY_JWKS_URL") ?? "";
const JWKS_TTL_MS = 10 * 60 * 1000;

let jwksCache: { keys: Record<string, unknown>[]; at: number } | null = null;

// REMEDIATION batch 1 (2026-09-12, auth resilience):
//   * in-flight coalescing — concurrent verifications share
//     ONE JWKS request instead of stampeding the authority
//     endpoint at edge-function fan-in.
//   * negative caching — a failed refresh is not retried for
//     60s (failures previously re-fetched on EVERY request).
//   * stale-if-error — an endpoint blip serves the last good
//     keys (ES256 keys rotate on the order of hours, not
//     minutes) instead of locking the owner out. Stale keys
//     older than 24h are never served.
const JWKS_NEG_TTL_MS = 60 * 1000;
const JWKS_STALE_MAX_MS = 24 * 60 * 60 * 1000;
let jwksInflight: Promise<Record<string, unknown>[] | null> | null = null;
let jwksFailedAt = 0;

function b64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function b64urlToJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(value))) as T;
}

function splitJwt(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: JwtParts["header"];
  let payload: JwtParts["payload"];
  try {
    header = b64urlToJson<JwtParts["header"]>(parts[0]);
    payload = b64urlToJson<JwtParts["payload"]>(parts[1]);
  } catch {
    return null;
  }
  if (!header || !payload) return null;
  return {
    header,
    payload,
    signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    signature: b64urlToBytes(parts[2]),
  };
}

export async function fetchJwks(
  url: string,
): Promise<Record<string, unknown>[] | null> {
  const now = Date.now();
  if (jwksCache !== null && now - jwksCache.at <= JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  // Negative cache: don't hammer a failing endpoint.
  if (jwksFailedAt !== 0 && now - jwksFailedAt < JWKS_NEG_TTL_MS) {
    return jwksCache ? jwksCache.keys : null;
  }
  if (jwksInflight !== null) return jwksInflight;
  jwksInflight = (async () => {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.keys)) {
        throw new Error("jwks body malformed: keys[] missing");
      }
      jwksCache = { keys: body.keys, at: Date.now() };
      jwksFailedAt = 0;
      return jwksCache.keys;
    } catch {
      jwksFailedAt = Date.now();
      // Stale-if-error, bounded: never serve keys older than 24h.
      if (jwksCache && Date.now() - jwksCache.at <= JWKS_STALE_MAX_MS) {
        return jwksCache.keys;
      }
      return null;
    } finally {
      jwksInflight = null;
    }
  })();
  return jwksInflight;
}

/** Test seam: reset module-level cache state (never used by
 *  production paths). */
export function __resetJwksCacheForTests(): void {
  jwksCache = null;
  jwksInflight = null;
  jwksFailedAt = 0;
}

// Low-level: verify an ES256 JWT against one specific public JWK.
// Exported for unit tests.
export async function verifyJwtWithJwk(
  token: string,
  jwk: { kid?: string; kty?: string; crv?: string; x?: string; y?: string },
): Promise<VerifiedAuthorityJwt | null> {
  const parts = splitJwt(token);
  if (!parts || parts.header.alg !== "ES256") return null;
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    return null;
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      key,
      parts.signature as BufferSource,
      parts.signingInput as BufferSource,
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  const { sub, exp } = parts.payload;
  if (typeof sub !== "string" || !sub) return null;
  if (typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return {
    sub,
    email:
      typeof parts.payload.email === "string" ? parts.payload.email : undefined,
    exp,
  };
}

// High-level: verify against the configured authority JWKS.
export async function verifyAuthorityJwt(
  token: string,
): Promise<VerifiedAuthorityJwt | null> {
  if (!JWKS_URL || !token) return null;
  const parts = splitJwt(token);
  if (!parts) return null;
  const keys = await fetchJwks(JWKS_URL);
  if (!keys) return null;
  const kid = parts.header.kid;
  const candidates = kid
    ? keys.filter((k) => (k as { kid?: string }).kid === kid)
    : keys;
  for (const jwk of candidates) {
    const verified = await verifyJwtWithJwk(
      token,
      jwk as Parameters<typeof verifyJwtWithJwk>[1],
    );
    if (verified) return verified;
  }
  return null;
}
