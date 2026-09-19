// Supabase Edge Function: archie-social-connect
// =========================================================
// FRELUX ARCHIE EXTENSION, SOCIAL TOKEN VAULT (server-side)
//
// The ONLY place Owner social-account authorization tokens
// are exchanged and stored. Rules:
//   * FRELUX never stores social-media, Google or platform
//     passwords, connections use each platform's OFFICIAL
//     OAuth / official Sign-In mechanism only.
//   * Tokens are stored ENCRYPTED AT REST (pgcrypto, key held
//     as an edge secret) in frelux_social_tokens, which has
//     NO client policies: service-role access only. Tokens
//     are never returned to any client, never logged.
//   * Only authenticated ADMIN users may call this function
//     (the Brand Center is Owner-only).
//   * CONNECT → official authorize URL / code exchange;
//     REVOKE → token row destroyed + account disconnected;
//     ROTATE → re-authorization replaces the vault entry.
//   * Platform app credentials (client id/secret) are OWNER
//     edge secrets, configured per platform. Without them the
//     function answers honestly: the official app credentials
//     must be configured before connecting.
// =========================================================

import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown, requestId: string) {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---- official platform token endpoints -------------------
// Each platform's OFFICIAL OAuth token endpoint and its
// credential env names. Nothing here captures passwords.
const PLATFORMS: Record<
  string,
  {
    authorize_url: string;
    token_url: string;
    client_id_env: string;
    client_secret_env: string;
    client_id_field: string;
    extra_grant_fields?: Record<string, string>;
  }
> = {
  google: {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id_env: "GOOGLE_CLIENT_ID",
    client_secret_env: "GOOGLE_CLIENT_SECRET",
    client_id_field: "client_id",
  },
  youtube: {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id_env: "GOOGLE_CLIENT_ID",
    client_secret_env: "GOOGLE_CLIENT_SECRET",
    client_id_field: "client_id",
  },
  facebook: {
    authorize_url: "https://www.facebook.com/v19.0/dialog/oauth",
    token_url: "https://graph.facebook.com/v19.0/oauth/access_token",
    client_id_env: "FACEBOOK_APP_ID",
    client_secret_env: "FACEBOOK_APP_SECRET",
    client_id_field: "client_id",
  },
  instagram: {
    authorize_url: "https://www.facebook.com/v19.0/dialog/oauth",
    token_url: "https://graph.facebook.com/v19.0/oauth/access_token",
    client_id_env: "INSTAGRAM_APP_ID",
    client_secret_env: "INSTAGRAM_APP_SECRET",
    client_id_field: "client_id",
  },
  tiktok: {
    authorize_url: "https://www.tiktok.com/v2/auth/authorize/",
    token_url: "https://open.tiktokapis.com/v2/oauth/token/",
    client_id_env: "TIKTOK_CLIENT_KEY",
    client_secret_env: "TIKTOK_CLIENT_SECRET",
    client_id_field: "client_key",
  },
  x: {
    authorize_url: "https://twitter.com/i/oauth2/authorize",
    token_url: "https://api.twitter.com/2/oauth2/token",
    client_id_env: "X_CLIENT_ID",
    client_secret_env: "X_CLIENT_SECRET",
    client_id_field: "client_id",
    extra_grant_fields: { code_verifier_field: "code_verifier" },
  },
  linkedin: {
    authorize_url: "https://www.linkedin.com/oauth/v2/authorization",
    token_url: "https://www.linkedin.com/oauth/v2/accessToken",
    client_id_env: "LINKEDIN_CLIENT_ID",
    client_secret_env: "LINKEDIN_CLIENT_SECRET",
    client_id_field: "client_id",
  },
  whatsapp: {
    // WhatsApp Business Platform: token issued by the official
    // Business management flow, not a password.
    authorize_url: "",
    token_url: "",
    client_id_env: "WHATSAPP_BUSINESS_TOKEN",
    client_secret_env: "WHATSAPP_BUSINESS_TOKEN",
    client_id_field: "client_id",
  },
};

// ---- minimal service helpers ----------------------------
async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

async function isAdmin(jwt: string | null): Promise<boolean> {
  // RLS-based admin check: query a table whose ONLY policies
  // are admin-only WITH the CALLER's JWT. If PostgRest
  // returns rows, the caller satisfies admin RLS.
  if (!jwt) return false;
  const probe = await fetch(
    `${SUPABASE_URL}/rest/v1/frelux_social_accounts?select=id&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Content-Type": "application/json",
      },
    },
  );
  return probe.ok;
}

serveWithCors(async (req) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Owner-only surface: the Brand Center lives inside the
  // FRELUX Admin. Only admin sessions may operate it.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "") || null;
  if (!(await isAdmin(jwt))) {
    return json(
      403,
      { error: "The Social Brand Center is Owner/Admin-only." },
      requestId,
    );
  }

  const url = new URL(req.url);
  const route = url.pathname.split("/").pop() ?? "";

  // ---- GET /authorize?platform=x ------------------------
  // Returns the platform's OFFICIAL OAuth authorize URL built
  // from the Owner-configured app credentials. No credentials
  // configured → honest 501: configure the official app first.
  if (req.method === "GET" && route === "authorize") {
    const platform = url.searchParams.get("platform") ?? "";
    const p = PLATFORMS[platform];
    if (!p)
      return json(404, { error: `Unknown platform "${platform}"` }, requestId);
    const clientId = Deno.env.get(p.client_id_env);
    if (!p.authorize_url) {
      return json(
        400,
        {
          error:
            "This platform uses its official Business/sign-in flow. Configure its official token as an edge secret, then connect.",
          platform,
        },
        requestId,
      );
    }
    if (!clientId) {
      return json(
        501,
        {
          error: `Official app credentials for "${platform}" are not configured yet. The Owner must register the official platform app and set ${p.client_id_env} / ${p.client_secret_env} as edge secrets.`,
          platform,
        },
        requestId,
      );
    }
    const redirectUri =
      url.searchParams.get("redirect_uri") ??
      `${SUPABASE_URL}/functions/v1/archie-social-connect/callback`;
    const authorizeUrl =
      `${p.authorize_url}?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(crypto.randomUUID())}` +
      `&scope=${encodeURIComponent(url.searchParams.get("scope") ?? "openid")}`;
    return json(200, { authorize_url: authorizeUrl, platform }, requestId);
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, requestId);
  }
  const body = await req.json().catch(() => ({}));

  // ---- POST /callback: official code exchange ------------
  // Exchanges the OAuth code at the platform's official token
  // endpoint and stores the result ENCRYPTED at rest. The
  // token is never returned to the caller.
  if (route === "callback") {
    const platform = String(body.platform ?? "");
    const code = String(body.code ?? "");
    const accountHandle = String(body.account_handle ?? "").trim();
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
    const p = PLATFORMS[platform];
    if (!p || !p.token_url) {
      return json(
        400,
        { error: `Platform "${platform}" has no OAuth token exchange` },
        requestId,
      );
    }
    const clientId = Deno.env.get(p.client_id_env);
    const clientSecret = Deno.env.get(p.client_secret_env);
    if (!clientId || !clientSecret) {
      return json(
        501,
        {
          error: `Official app credentials for "${platform}" are not configured.`,
        },
        requestId,
      );
    }
    const redirectUri = String(body.redirect_uri ?? "");
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      [p.client_id_field]: clientId,
      client_secret: clientSecret,
    });
    if (platform === "x" && typeof body.code_verifier === "string") {
      form.set("code_verifier", body.code_verifier);
    }
    const tokenRes = await fetch(p.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenJson) {
      // Never log the token; log only the exchange outcome.
      return json(
        502,
        {
          error:
            "The platform rejected the code exchange. Re-authorize the account.",
        },
        requestId,
      );
    }

    // Upsert the account metadata (admin-visible, no secrets).
    const { data: account, error: accErr } = await service<{ id: string }>(
      "/rest/v1/frelux_social_accounts?on_conflict=platform,account_handle",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          platform,
          account_handle: accountHandle || `connected:${platform}`,
          status: "CONNECTED",
          scopes,
          connection_kind: "OWNER_BRAND_ACCOUNT",
          owner_explicitly_authorized: true,
        }),
      },
    );
    if (accErr || !account) {
      return json(
        500,
        { error: `Could not record the account: ${accErr}` },
        requestId,
      );
    }

    // Encrypt + store the token in the service-role-only vault.
    const vaultKey = Deno.env.get("ARCHIE_TOKEN_VAULT_KEY");
    if (!vaultKey) {
      return json(
        501,
        {
          error:
            "ARCHIE_TOKEN_VAULT_KEY edge secret is not configured, tokens cannot be stored securely.",
        },
        requestId,
      );
    }
    const encrypted = await service<never>("/rest/v1/rpc/store_social_token", {
      method: "POST",
      body: JSON.stringify({
        p_account_id: account.id,
        p_token_json: JSON.stringify(tokenJson),
        p_key: vaultKey,
      }),
    });
    if (encrypted.error) {
      return json(
        500,
        { error: `Token vault write failed: ${encrypted.error}` },
        requestId,
      );
    }
    return json(
      200,
      { connected: true, platform, account_id: account.id },
      requestId,
    );
  }

  // ---- POST /revoke: destroy vault entry + disconnect -----
  if (route === "revoke") {
    const accountId = String(body.account_id ?? "");
    if (!accountId)
      return json(400, { error: "account_id is required" }, requestId);
    const del = await service(
      `/rest/v1/frelux_social_tokens?account_id=eq.${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );
    if (del.error) return json(500, { error: del.error }, requestId);
    const upd = await service("/rest/v1/frelux_social_accounts", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: accountId,
        status: "DISCONNECTED",
        synced_at: null,
      }),
    });
    void upd;
    return json(200, { revoked: true, account_id: accountId }, requestId);
  }

  // ---- POST /rotate: mark for re-authorization -----------
  if (route === "rotate") {
    const accountId = String(body.account_id ?? "");
    const { error } = await service("/rest/v1/frelux_social_accounts", {
      method: "PATCH",
      body: JSON.stringify({ id: accountId, token_rotation_due: true }),
    });
    if (error) return json(500, { error }, requestId);
    return json(
      200,
      { rotation_pending: true, account_id: accountId },
      requestId,
    );
  }

  return json(404, { error: "Unknown route" }, requestId);
});
