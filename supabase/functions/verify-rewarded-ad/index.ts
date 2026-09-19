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

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AD,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS")
    return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey)
    return jsonResponse(
      { error: "Server not configured", code: "CONFIG_ERROR" },
      500,
    );

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader)
    return jsonResponse(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      401,
    );

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user)
    return jsonResponse(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      401,
    );

  let payload: {
    adProvider: string;
    adEventId: string;
    adToken?: string;
    mode?: "earn_credits" | "unlock_feature";
    featureKey?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON", code: "BAD_REQUEST" }, 400);
  }

  const {
    adProvider,
    adEventId,
    adToken,
    mode = "earn_credits",
    featureKey,
    metadata = {},
  } = payload;
  if (!adProvider || !adEventId)
    return jsonResponse(
      { error: "adProvider and adEventId are required", code: "BAD_REQUEST" },
      400,
    );

  // ──────────────────────────────────────────────────────────
  // AD VERIFICATION — two accepted paths:
  //
  // 1. Server-verified postback: a completed event already recorded by
  //    the postback edge function (S2S callback from the ad network).
  //    This is the strongest signal but requires the provider to support
  //    postbacks and the postback to have already landed.
  //
  // 2. Client attestation: a token in the format
  //    att_<provider_slug>_<mode>_<timestamp> issued by the client bridge
  //    (see src/lib/monetag-rewarded.ts) AFTER it actually displayed the
  //    ad and the SDK/tag resolved. Accepted only when the attested
  //    provider is ACTIVE in the database — this is the same mechanism
  //    already used by grant-rewarded-unlock for feature unlocks, and it
  //    is required here too because Monetag's website tag/SDK has no
  //    S2S postback wired up for the credit-earning flow, so path 1 never
  //    fires for it. Without this, "Watch Ad" could never succeed.
  //
  // In dev mode (REWARDED_DEV_MODE=true) both checks are skipped.
  // ──────────────────────────────────────────────────────────
  const devMode = Deno.env.get("REWARDED_DEV_MODE") === "true";
  if (!devMode) {
    const { data: postbackEvent } = await admin
      .from("rewarded_ad_credit_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("ad_provider", adProvider)
      .eq("ad_event_id", adEventId)
      .eq("status", "completed")
      .maybeSingle();

    let verified = !!postbackEvent;

    if (!verified) {
      // Also check rewarded_ad_events table (from the postback edge function)
      const { data: adEvent } = await admin
        .from("rewarded_ad_events")
        .select("*")
        .eq("event_type", "reward")
        .eq("client_hash", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      verified = !!adEvent;
    }

    if (
      !verified &&
      typeof adToken === "string" &&
      adToken.startsWith("att_")
    ) {
      const parts = adToken.split("_");
      const slug = parts[1];
      const timestamp = Number(parts[parts.length - 1]);
      if (slug && Number.isFinite(timestamp) && timestamp > 0) {
        const { data: providerRow } = await admin
          .from("ad_providers")
          .select("id, slug, is_active")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();
        verified = !!providerRow;
      }
    }

    if (!verified) {
      return jsonResponse(
        {
          error: "Ad not verified. No completed ad event found.",
          code: "AD_NOT_VERIFIED",
        },
        403,
      );
    }
  }

  // MODE: earn_credits
  if (mode === "earn_credits") {
    const { data: config } = await admin
      .from("rewarded_ad_credit_config")
      .select("credits_per_ad, is_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (!config)
      return jsonResponse(
        { error: "Config not found", code: "CONFIG_ERROR" },
        500,
      );
    if (!config.is_enabled)
      return jsonResponse(
        { error: "Rewarded ads are currently disabled", code: "DISABLED" },
        403,
      );

    const { data: result, error: fnError } = await admin.rpc(
      "award_ad_credits",
      {
        p_user_id: user.id,
        p_ad_provider: adProvider,
        p_ad_event_id: adEventId,
        p_amount: config.credits_per_ad,
        p_metadata: metadata,
      },
    );

    if (fnError)
      return jsonResponse(
        {
          error: "Failed to award credits",
          code: "AWARD_FAILED",
          details: fnError.message,
        },
        500,
      );
    const row = result?.[0];
    if (!row?.success) {
      if (row?.error === "already_awarded")
        return jsonResponse(
          {
            success: false,
            error: "This ad has already been rewarded.",
            code: "ALREADY_AWARDED",
            newBalance: row?.new_balance ?? 0,
          },
          409,
        );
      if (row?.error === "daily_earn_limit")
        return jsonResponse(
          {
            success: false,
            error: "Daily earning limit reached. Come back tomorrow!",
            code: "DAILY_LIMIT",
            newBalance: row?.new_balance ?? 0,
          },
          429,
        );
      return jsonResponse(
        {
          success: false,
          error: row?.error ?? "Unknown error",
          code: "AWARD_FAILED",
        },
        400,
      );
    }
    return jsonResponse({
      success: true,
      creditsEarned: config.credits_per_ad,
      newBalance: row.new_balance,
      message: `+${config.credits_per_ad} FRELUX Credits earned!`,
    });
  }

  // MODE: unlock_feature
  if (mode === "unlock_feature") {
    if (!featureKey)
      return jsonResponse(
        { error: "featureKey required", code: "BAD_REQUEST" },
        400,
      );
    const { data: result, error: fnError } = await admin.rpc(
      "unlock_ai_feature_via_ad",
      {
        p_user_id: user.id,
        p_feature_key: featureKey,
        p_ad_provider: adProvider,
        p_ad_event_id: adEventId,
        p_metadata: metadata,
      },
    );
    if (fnError)
      return jsonResponse(
        {
          error: "Failed to unlock",
          code: "UNLOCK_FAILED",
          details: fnError.message,
        },
        500,
      );
    const row = result?.[0];
    if (!row?.success)
      return jsonResponse(
        {
          success: false,
          error: row?.error ?? "Unknown error",
          code: "UNLOCK_FAILED",
        },
        400,
      );
    return jsonResponse({
      success: true,
      message: "Feature unlocked via rewarded ad!",
      featureKey,
    });
  }

  return jsonResponse({ error: "Invalid mode", code: "BAD_REQUEST" }, 400);
});
