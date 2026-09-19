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

/**
 * SERVER-SIDE REWARD EVENT CATALOG.
 *
 * SECURITY: the client-supplied `amount` is IGNORED. Amounts are granted
 * only from this server-side catalog. Previously any authenticated user
 * could POST { amount: 999999, referenceId: <unique> } and mint unlimited
 * credits (the RPC's idempotency key was client-controlled, so the rate
 * limit was the only bound). Amounts here mirror REWARD_EVENTS in
 * src/lib/credits.ts — keep the two in sync when tuning the reward economy.
 */
const REWARD_EVENT_CATALOG: Record<string, { amount: number; reason: string }> =
  {
    first_calc: { amount: 2, reason: "Completed first calculator" },
    three_different_calcs: {
      amount: 5,
      reason: "Completed 3 different calculators",
    },
    save_estimate: { amount: 3, reason: "Saved an estimate" },
    return_3_days: { amount: 5, reason: "Returned on 3 different days" },
    streak_7_day: { amount: 15, reason: "7-day activity streak" },
    build_to_roof: { amount: 10, reason: "Completed a Build-to-Roof estimate" },
    ai_photo_estimator: {
      amount: 5,
      reason: "Successfully used AI Photo Estimator",
    },
    five_estimates: { amount: 15, reason: "Completed 5 estimates" },
    referral: { amount: 25, reason: "Referred a new user to FRELUX" },
    ach_builder_10: {
      amount: 25,
      reason: "Achievement: FRELUX Builder (10 estimates)",
    },
    ach_estimator_25: {
      amount: 50,
      reason: "Achievement: Estimator Pro (25 estimates)",
    },
    ach_master_5: {
      amount: 100,
      reason: "Achievement: FRELUX Master (5 categories)",
    },
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

  // Create service role client — bypasses RLS
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Create user-scoped client using the caller's JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Get the authenticated user
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  let payload: {
    eventType: string;
    referenceId: string;
    // `amount`/`reason` in the body are accepted but IGNORED — the
    // server-side catalog decides what an event is worth.
    amount?: number;
    reason?: string;
    metadata?: Record<string, unknown>;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  const { eventType, referenceId, metadata } = payload;

  if (!eventType || !referenceId) {
    return jsonResponse(
      { error: "eventType and referenceId are required", code: "BAD_REQUEST" },
      400,
    );
  }

  // Unknown event types are rejected — only catalogued events can earn credits.
  const catalogEntry = REWARD_EVENT_CATALOG[eventType];
  if (!catalogEntry) {
    return jsonResponse(
      {
        error: `Unknown reward event type: ${eventType}`,
        code: "UNKNOWN_EVENT_TYPE",
      },
      400,
    );
  }

  // SECURITY: amount and reason come from the server-side catalog,
  // never from the request body.
  const amount = catalogEntry.amount;
  const reason = catalogEntry.reason;

  // Call the secure RPC function (SECURITY DEFINER, bypasses RLS)
  const { data, error } = await admin.rpc("award_credits", {
    p_user_id: user.id,
    p_event_type: eventType,
    p_reference_id: referenceId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: metadata ?? {},
  });

  if (error) {
    return jsonResponse({ error: error.message, code: "AWARD_FAILED" }, 500);
  }

  const result = data?.[0];
  if (!result) {
    return jsonResponse({ error: "No result returned", code: "UNKNOWN" }, 500);
  }

  return jsonResponse({
    success: result.success,
    newBalance: result.new_balance,
    alreadyAwarded: result.already_awarded,
  });
});
