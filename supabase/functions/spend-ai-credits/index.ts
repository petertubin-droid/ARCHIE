import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitHeaders,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { serveWithCors } from "../_shared/serve.ts";

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

/**
 * Tiered AI credit pricing — costs are read from the ai_feature_costs table.
 * Each rewarded video ad grants 5 credits.
 * AI features are tiered: 5 / 8 / 12 credits per use.
 * Credits are the gate, not daily access caps.
 */

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  // Rate limit: 10 credit operations per minute per user/IP
  const rlKey = getRateLimitKey(req, req.headers.get("x-user-id") || undefined);
  const rl = checkRateLimit(rlKey, RATE_LIMITS.PAYMENT);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }
  const _rlHeaders = rateLimitHeaders(rl.remaining, rl.resetAt);

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
    featureKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON", code: "BAD_REQUEST" }, 400);
  }

  const { featureKey, idempotencyKey, metadata = {} } = payload;
  if (!featureKey || !idempotencyKey)
    return jsonResponse(
      {
        error: "featureKey and idempotencyKey are required",
        code: "BAD_REQUEST",
      },
      400,
    );

  // Get the server-side feature config (includes credit_cost from DB)
  const { data: feature, error: featError } = await admin
    .from("ai_feature_costs")
    .select("*")
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (featError || !feature)
    return jsonResponse(
      { error: "AI feature not found", code: "NOT_FOUND" },
      404,
    );
  if (!feature.is_enabled)
    return jsonResponse(
      { error: "This feature is currently disabled", code: "DISABLED" },
      403,
    );
  if (!feature.requires_credits)
    return jsonResponse({
      success: true,
      message: "Feature is free",
      newBalance: 0,
      cost: 0,
    });

  // Tiered cost: read credit_cost from the database (5/8/12 per feature tier)
  const cost = feature.credit_cost;

  // Call the atomic spend function
  const { data: result, error: fnError } = await admin.rpc("spend_credits", {
    p_user_id: user.id,
    p_feature_key: featureKey,
    p_amount: cost,
    p_idempotency_key: idempotencyKey,
    p_metadata: { ...metadata, tiered_cost: cost },
  });

  if (fnError)
    return jsonResponse(
      {
        error: "Failed to spend credits",
        code: "SPEND_FAILED",
        details: fnError.message,
      },
      500,
    );

  const row = result?.[0];
  if (!row?.success) {
    if (row?.error === "insufficient_credits") {
      return jsonResponse(
        {
          success: false,
          error: "Not enough FRELUX Credits",
          code: "INSUFFICIENT_CREDITS",
          currentBalance: row?.new_balance ?? 0,
          requiredCredits: cost,
          adUnlockEnabled: feature.ad_unlock_enabled,
        },
        402,
      );
    }
    if (row?.error === "daily_limit_reached")
      return jsonResponse(
        {
          success: false,
          error: "Daily usage limit reached for this feature",
          code: "DAILY_LIMIT",
        },
        429,
      );
    if (row?.error === "already_spent")
      return jsonResponse({
        success: true,
        message: "Already paid",
        newBalance: row?.new_balance ?? 0,
        cost: 0,
      });
    return jsonResponse(
      {
        success: false,
        error: row?.error ?? "Unknown error",
        code: "SPEND_FAILED",
      },
      400,
    );
  }

  return jsonResponse({
    success: true,
    message: "Credits spent",
    newBalance: row.new_balance,
    cost,
  });
});
