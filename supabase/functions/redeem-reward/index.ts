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

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Server not configured", code: "CONFIG_ERROR" },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  let payload: {
    rewardKey: string;
    idempotencyKey: string;
    clientHash?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  const { rewardKey, idempotencyKey, clientHash } = payload;

  if (!rewardKey || !idempotencyKey) {
    return jsonResponse(
      {
        error: "rewardKey and idempotencyKey are required",
        code: "BAD_REQUEST",
      },
      400,
    );
  }

  // Verify reward exists and is enabled
  const { data: reward, error: rewardError } = await admin
    .from("reward_catalogue")
    .select("*")
    .eq("reward_key", rewardKey)
    .eq("is_enabled", true)
    .maybeSingle();

  if (rewardError || !reward) {
    return jsonResponse(
      { error: "Reward not found or disabled", code: "NOT_FOUND" },
      404,
    );
  }

  // Call the secure RPC function. clientHash lets calc_unlock rewards
  // grant real, immediate access via the existing ad-unlock table.
  const { data, error } = await admin.rpc("redeem_reward", {
    p_user_id: user.id,
    p_reward_key: rewardKey,
    p_idempotency_key: idempotencyKey,
    p_client_hash: clientHash ?? null,
  });

  if (error) {
    return jsonResponse({ error: error.message, code: "REDEEM_FAILED" }, 500);
  }

  const result = data?.[0];
  if (!result) {
    return jsonResponse({ error: "No result returned", code: "UNKNOWN" }, 500);
  }

  if (!result.success) {
    const statusCode =
      result.error === "insufficient_credits"
        ? 402
        : result.error === "already_redeemed"
          ? 409
          : 400;
    return jsonResponse(
      {
        success: false,
        error: result.error,
        newBalance: result.new_balance,
      },
      statusCode,
    );
  }

  return jsonResponse({
    success: true,
    newBalance: result.new_balance,
    reward: {
      key: reward.reward_key,
      name: reward.name,
      description: reward.description,
      type: reward.reward_type,
    },
  });
});
