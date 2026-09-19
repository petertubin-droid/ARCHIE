import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface UnlockRequest {
  toolKey: string;
  clientHash: string;
  adToken?: string;
  adProvider?: string;
}

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AD,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const _anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Server not configured", code: "CONFIG_ERROR" },
      500,
    );
  }

  // Service role client — bypasses RLS for trusted server-side operations
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let payload: UnlockRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  const { toolKey, clientHash, adToken, adProvider } = payload;

  if (!toolKey || !clientHash) {
    return jsonResponse(
      { error: "toolKey and clientHash are required", code: "BAD_REQUEST" },
      400,
    );
  }

  // 1. Verify the tool is enabled
  const { data: toolConfig, error: cfgError } = await supabase
    .from("rewarded_tool_config")
    .select("*")
    .eq("tool_key", toolKey)
    .maybeSingle();

  if (cfgError || !toolConfig) {
    return jsonResponse({ error: "Tool not found", code: "NOT_FOUND" }, 404);
  }

  if (!toolConfig.is_enabled) {
    return jsonResponse(
      { error: "This feature is currently disabled", code: "DISABLED" },
      403,
    );
  }

  // Also check rewarded_feature_config for richer settings
  const { data: featureConfig } = await supabase
    .from("rewarded_feature_config")
    .select("*")
    .eq("feature_key", toolKey)
    .maybeSingle();

  const dailyLimit =
    featureConfig?.daily_usage_limit ?? toolConfig.daily_usage_limit ?? 0;
  const cooldownMinutes =
    featureConfig?.cooldown_minutes ?? toolConfig.cooldown_minutes ?? 0;
  const durationMinutes =
    featureConfig?.unlock_duration_minutes ??
    (toolConfig.unlock_duration_hours
      ? toolConfig.unlock_duration_hours * 60
      : 1440);

  // 2. Server-side ad verification
  // When a real rewarded ad SDK is integrated, the adToken will be a verification
  // token from the provider (e.g., AdMob's server-side verification callback).
  // For now, we check if the token is present and valid.
  //
  // To enable testing during development, set REWARDED_DEV_MODE=true in Supabase secrets.
  // In dev mode, a simple token is accepted without provider verification.
  const devMode = Deno.env.get("REWARDED_DEV_MODE") === "true";

  // ──────────────────────────────────────────────────────────
  // Ad verification
  // ──────────────────────────────────────────────────────────
  // Ad verification — generic provider attestation system.
  //
  // All ad providers (the 35 currently in ad_providers, plus any added
  // in the future) are linked through one mechanism: a client
  // attestation token in the format
  //
  //   att_<provider_slug>_<mode>_<timestamp>
  //
  // issued by the client bridge AFTER it actually showed the ad (see
  // src/lib/monetag-rewarded.ts for the Monetag implementation). Web
  // ad zones generally complete client-side — the SDK resolves a
  // completion promise and (optionally) fires a server-to-server
  // postback — but provide no server-verifiable token. The attestation
  // is accepted only for providers that are ACTIVE in the database,
  // and the daily limit, cooldown, and unlock duration below constrain
  // abuse server-side. When a provider offers true server-side
  // verification (e.g. AdMob's /verify endpoint), add that check in
  // verifyProviderToken() below and issue real SDK tokens instead.
  const parseAttestation = (token: string): { slug: string } | null => {
    if (!token.startsWith("att_")) return null;
    const parts = token.split("_");
    if (parts.length < 4) return null;
    const slug = parts[1];
    const timestamp = Number(parts[parts.length - 1]);
    if (!slug || !Number.isFinite(timestamp) || timestamp <= 0) return null;
    return { slug };
  };

  const providerName = (adProvider ?? "").trim().toLowerCase();

  // Legacy format from the first Monetag rollout:
  //   monetag_<mode>_<timestamp>
  const isLegacyMonetagAttestation =
    providerName === "monetag" &&
    typeof adToken === "string" &&
    adToken.startsWith("monetag_");

  const attestation =
    typeof adToken === "string" ? parseAttestation(adToken) : null;

  if (!devMode) {
    if (!adToken) {
      return jsonResponse(
        {
          error: "Ad verification required. No ad completion token provided.",
          code: "AD_NOT_VERIFIED",
        },
        403,
      );
    }

    if (isLegacyMonetagAttestation) {
      // Accepted — client-attested Monetag completion (legacy format).
    } else if (attestation) {
      // The attested provider must be ACTIVE in the database. This
      // links every active provider (current and future) without code
      // changes — admins activate a provider in the dashboard and the
      // rewarded flow accepts it immediately.
      const { data: providerRow } = await supabase
        .from("ad_providers")
        .select("id, slug, provider_type, is_active")
        .eq("slug", attestation.slug)
        .eq("is_active", true)
        .maybeSingle();

      if (!providerRow) {
        return jsonResponse(
          {
            error: `The ad provider "${attestation.slug}" is not active.`,
            code: "PROVIDER_INACTIVE",
          },
          403,
        );
      }
    } else {
      // Raw SDK verification tokens: when a provider with server-side
      // verification is integrated, verify the adToken against the
      // provider's API here. Example for AdMob:
      //   GET https://www.gstatic.com/rewardedads/verify/<token>
      return jsonResponse(
        {
          error:
            "No rewarded ad provider is configured for server-side verification.",
          code: "NO_PROVIDER",
        },
        503,
      );
    }
  }

  // 3. Server-side daily limit enforcement
  const today = new Date().toISOString().split("T")[0];
  if (dailyLimit > 0) {
    const { count } = await supabase
      .from("rewarded_unlock_log")
      .select("id", { count: "exact", head: true })
      .eq("tool_key", toolKey)
      .eq("client_hash", clientHash)
      .gte("unlock_date", today);

    if ((count ?? 0) >= dailyLimit) {
      return jsonResponse(
        {
          error: `Daily limit reached (${dailyLimit} unlocks per day). Please try again tomorrow.`,
          code: "DAILY_LIMIT",
        },
        429,
      );
    }
  }

  // 4. Server-side cooldown enforcement
  if (cooldownMinutes > 0) {
    const cooldownStart = new Date(
      Date.now() - cooldownMinutes * 60_000,
    ).toISOString();
    const { data: recentUnlock } = await supabase
      .from("rewarded_unlock_log")
      .select("unlocked_at")
      .eq("tool_key", toolKey)
      .eq("client_hash", clientHash)
      .gte("unlocked_at", cooldownStart)
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentUnlock) {
      const elapsed = Date.now() - new Date(recentUnlock.unlocked_at).getTime();
      const remainingMs = cooldownMinutes * 60_000 - elapsed;
      const remainingMin = Math.ceil(remainingMs / 60_000);
      return jsonResponse(
        {
          error: `Please wait ${remainingMin} minute${remainingMin > 1 ? "s" : ""} before trying again.`,
          code: "COOLDOWN",
        },
        429,
      );
    }
  }

  // 5. Check if already unlocked and still valid
  const { data: existingUnlock } = await supabase
    .from("rewarded_unlock_log")
    .select("expires_at")
    .eq("tool_key", toolKey)
    .eq("client_hash", clientHash)
    .gte("unlock_date", today)
    .order("unlocked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingUnlock && new Date(existingUnlock.expires_at) > new Date()) {
    // Already unlocked — return existing expiry
    // Log analytics for the re-grant
    await supabase.from("ad_analytics_events").insert({
      event_type: "reward",
      tool_key: toolKey,
      client_hash: clientHash,
      revenue_estimated: 0,
      metadata: { provider: adProvider ?? "unknown", note: "already_unlocked" },
    });
    return jsonResponse({
      success: true,
      expiresAt: existingUnlock.expires_at,
      alreadyUnlocked: true,
    });
  }

  // 6. Calculate expiry
  let expiry: string;
  if (durationMinutes >= 1440) {
    // End of day in the user's timezone (default to UTC+1 for Nigeria)
    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    expiry = end.toISOString();
  } else {
    expiry = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  }

  // 7. Get revenue estimate from config (configurable, not hardcoded)
  const revenueEstimate = featureConfig?.reward_rules?.reward_amount ?? 0;

  // 8. Insert unlock record using service role (bypasses RLS)
  const { error: insertError } = await supabase
    .from("rewarded_unlock_log")
    .insert({
      tool_key: toolKey,
      client_hash: clientHash,
      expires_at: expiry,
      ad_provider: adProvider ?? "adsense",
      ad_revenue_estimated: revenueEstimate,
    });

  if (insertError) {
    return jsonResponse(
      {
        error: "Failed to grant unlock. Please try again.",
        code: "INSERT_FAILED",
      },
      500,
    );
  }

  // 9. Log analytics to the unified table only (no duplicate legacy logging)
  await supabase.from("ad_analytics_events").insert({
    event_type: "reward",
    tool_key: toolKey,
    client_hash: clientHash,
    revenue_estimated: revenueEstimate,
    metadata: { provider: adProvider ?? "unknown", expires_at: expiry },
  });

  return jsonResponse({
    success: true,
    expiresAt: expiry,
    alreadyUnlocked: false,
  });
});
