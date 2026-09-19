// Supabase Edge Function: archie-credentials
// =========================================================
// ARCHIE API CREDENTIAL MANAGEMENT (owner directive 2026-09-12)
//
// The OWNER-ONLY management surface for ARCHIE API credentials
// — the same authority model as archie-owner-auth:
//
//   * Only the authenticated user with is_admin = true may
//     call any action here. Non-admins get 403 and a security
//     event. There is NO path by which ARCHIE (an API
//     credential holder) can call this function: API
//     credentials are NEVER valid here — only a real Supabase
//     session of the owner works.
//   * Secrets are shown EXACTLY ONCE (create + rotate) and
//     never stored, never logged, never echoed again.
//   * Every action is audited into the EXISTING security
//     events system.
//   * Least privilege: scopes are validated against the fixed
//     registry; wildcards are impossible; no scope grants
//     owner/admin/authority powers.
//   * Emergency killswitch (action: "killswitch") rejects
//     every credential immediately.
//
// HARD RULES (same as archie-owner-auth):
//   * Raw keys exist ONLY inside the createCredential return
//     value, then they are gone.
//   * No secret ever reaches a log line, an error message, or
//     a list response.
// =========================================================

import { verifyAuthorityJwt } from "../_shared/archie-ai/security/cross-project-auth.ts";
import { serveWithCors } from "../_shared/serve.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  CredentialEnvironment,
  createCredential,
  revokeCredential,
  rotateCredential,
  safeCredentialView,
  setKillswitch,
  validateScopes,
} from "../_shared/archie-ai/security/api-credentials.ts";
import {
  UNKNOWN_OWNER,
  createSupabaseCredentialStore,
} from "../_shared/archie-ai/security/api-credential-store.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional server-side pepper: when set, verifiers are
// HMAC-SHA256(pepper, key) — a database-only compromise does
// not enable credential forgery.
const PEPPER = Deno.env.get("ARCHIE_API_PEPPER") ?? "";

// ---- minimal fetch helpers (service role) ----------------
async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  // Trailing-slash-safe join (see api-credential-store.ts).
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // Supabase gateway requires apikey on every request
      // (supabase-js sends both; raw fetch must too).
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      data: null,
      error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  return { data: body as T, error: null };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------
// Storage — the ONE shared Supabase backend (service role
// only; the credential tables have RLS FORCED with no client
// policies), identical to the backend archie-chat
// authenticates against. No duplicate authority surface.
// ---------------------------------------------------------
const store = createSupabaseCredentialStore(SUPABASE_URL, SERVICE_ROLE);

// ---------------------------------------------------------
// Handler
// ---------------------------------------------------------
interface Body {
  action?: string;
  // create
  name?: string;
  application?: string;
  environment?: CredentialEnvironment;
  scopes?: string[];
  expiresInDays?: number;
  rateLimitPerMinute?: number;
  // list
  filterApplication?: string;
  // revoke
  id?: string;
  reason?: string;
  // rotate
  expiresInDaysNew?: number;
  // killswitch
  active?: boolean;
  confirm?: string;
}

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Headers":
          "authorization, content-type, x-client-info, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  // ---- authenticate the caller (normal Supabase model) ----
  // API CREDENTIALS ARE NOT VALID HERE BY DESIGN: this
  // function must stay reachable only by the owner's own
  // session. Credential auth is a different path entirely
  // (see archie-chat) and can never reach this surface.
  const authHeader = req.headers.get("Authorization") ?? "";
  // GoTrue's /auth/v1/user returns the user object at the TOP
  // LEVEL (no {user: ...} wrapper — supabase-js adds that; raw
  // fetch does not). Accept both shapes defensively.
  const { data: authUser, error: authError } = await service<{
    id: string;
    user?: { id: string; email?: string };
    email?: string;
  }>("auth/v1/user", { headers: { Authorization: authHeader } });
  let userId = authUser?.user?.id ?? authUser?.id;
  if (authError || !userId) {
    // Cross-project owner identity (see cross-project-auth.ts): the
    // owner's sessions are issued by the FRELUX authority project;
    // verify such JWTs against the authority's public JWKS. Owner
    // authority is still decided by profiles.role='admin' below.
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const verified = token ? await verifyAuthorityJwt(token) : null;
    if (verified) userId = verified.sub;
    if (!userId) {
      return json(401, { ok: false, error: "Authentication required." });
    }
  }

  // Per-user management rate limit (abuse protection).
  const rl = checkRateLimit(`archie-credentials:manage:${userId}`, {
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json(429, { ok: false, error: "Too many requests — slow down." });
  }

  // ---- owner check: is_admin is the authoritative gate ----
  // Owner convention: public.profiles.role = 'admin' (the
  // server-side authority check, same as public.is_admin()).
  const profile = await service<{ role: string }[]>(
    `rest/v1/profiles?id=eq.${userId}&select=role`,
  );
  const isOwner =
    Array.isArray(profile.data) && profile.data[0]?.role === "admin";
  if (!isOwner) {
    // FIX 28: pass the UNKNOWN_OWNER sentinel — the store
    // resolves the real owner account, and if none resolves it
    // now persists as a SYSTEM event instead of the previous
    // FK-violating fake uuid that silently lost this critical.
    await store.recordAudit({
      ownerId: UNKNOWN_OWNER,
      kind: "archie_api_credential.unauthorized_access",
      severity: "critical",
      message:
        "A non-admin user attempted to access ARCHIE API credential management.",
      metadata: { attemptedBy: userId },
    });
    return json(403, { ok: false, error: "Owner authorization required." });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "Malformed request." });
  }

  try {
    switch (body.action) {
      // ---------------------------------------------------
      case "create": {
        if (!body.scopes) {
          return json(400, {
            ok: false,
            error:
              "Scopes are required — least privilege: a credential grants only what is explicitly listed.",
          });
        }
        const scopeCheck = validateScopes(body.scopes);
        if (!scopeCheck.ok) {
          return json(400, { ok: false, error: scopeCheck.reason });
        }
        const expiresAt = body.expiresInDays
          ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
          : null;
        const created = await createCredential(
          store,
          {
            name: String(body.name ?? ""),
            application: String(body.application ?? ""),
            environment: (body.environment ??
              "production") as CredentialEnvironment,
            scopes: body.scopes,
            expiresAt,
            rateLimitPerMinute: body.rateLimitPerMinute ?? 60,
            createdBy: userId,
          },
          PEPPER,
        );
        if (!created.ok) {
          return json(400, { ok: false, error: created.reason });
        }
        // The ONE response in the system that contains a
        // secret. Never persisted, never logged.
        return json(201, {
          ok: true,
          credential: safeCredentialView(created.credential.record),
          secret: created.credential.secret,
          secretNotice:
            "Store this secret now — it is shown ONCE and can never be retrieved again.",
        });
      }

      // ---------------------------------------------------
      case "list": {
        const records = await store.listByApplication(
          body.filterApplication?.trim() || null,
        );
        // Safe views only — no hashes, no secrets.
        return json(200, {
          ok: true,
          credentials: records.map(safeCredentialView),
        });
      }

      // ---------------------------------------------------
      case "revoke": {
        if (!body.id) {
          return json(400, { ok: false, error: "Credential id required." });
        }
        const revoked = await revokeCredential(
          store,
          body.id,
          String(body.reason ?? ""),
          userId,
        );
        if (!revoked.ok) return json(400, { ok: false, error: revoked.reason });
        return json(200, { ok: true });
      }

      // ---------------------------------------------------
      case "rotate": {
        if (!body.id) {
          return json(400, { ok: false, error: "Credential id required." });
        }
        const expiresAt = body.expiresInDaysNew
          ? new Date(
              Date.now() + body.expiresInDaysNew * 86_400_000,
            ).toISOString()
          : null;
        const rotated = await rotateCredential(
          store,
          body.id,
          userId,
          PEPPER,
          expiresAt,
        );
        if (!rotated.ok) return json(400, { ok: false, error: rotated.reason });
        return json(201, {
          ok: true,
          credential: safeCredentialView(rotated.credential!.record),
          secret: rotated.credential!.secret,
          secretNotice:
            "New secret shown ONCE. The old key is retired immediately.",
        });
      }

      // ---------------------------------------------------
      case "killswitch": {
        if (body.active === true) {
          // Emergency global revocation requires an explicit
          // confirmation so it can never happen by accident.
          if (body.confirm !== "EMERGENCY-REVOKE-ALL") {
            return json(400, {
              ok: false,
              error:
                'Enabling the killswitch requires confirm: "EMERGENCY-REVOKE-ALL".',
            });
          }
        }
        const flipped = await setKillswitch(
          store,
          body.active === true,
          userId,
        );
        if (!flipped.ok) return json(400, { ok: false, error: flipped.reason });
        return json(200, {
          ok: true,
          killswitch: body.active === true ? "ENABLED" : "DISABLED",
        });
      }

      // ---------------------------------------------------
      case "status": {
        return json(200, {
          ok: true,
          killswitch: (await store.getKillswitch()) ? "ENABLED" : "DISABLED",
          scopes: [
            "archie:chat",
            "archie:calculate",
            "archie:research",
            "archie:status",
          ],
        });
      }

      default:
        return json(400, {
          ok: false,
          error:
            "Unknown action. Valid: create, list, revoke, rotate, killswitch, status.",
        });
    }
  } catch (err) {
    // Log-free error surface: never include key material
    // (none exists here by construction).
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return json(500, { ok: false, error: message.slice(0, 200) });
  }
});
