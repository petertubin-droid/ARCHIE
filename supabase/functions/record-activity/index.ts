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
    RATE_LIMITS.GENERAL,
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
    activityType: string;
    activityData?: Record<string, unknown>;
    missionTaskType?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  const { activityType, activityData, missionTaskType } = payload;

  if (!activityType) {
    return jsonResponse(
      { error: "activityType is required", code: "BAD_REQUEST" },
      400,
    );
  }

  // Generate weekly mission if needed
  await admin.rpc("generate_weekly_mission_if_needed");

  // Record activity (updates streak)
  const { data: streakData, error: _streakError } = await admin.rpc(
    "record_activity",
    {
      p_user_id: user.id,
      p_activity_type: activityType,
      p_activity_data: activityData ?? {},
    },
  );

  const streakResult = streakData?.[0];

  // Update mission progress if task type provided
  let missionResult = null;
  if (missionTaskType) {
    const { data: missionData, error: missionError } = await admin.rpc(
      "update_mission_progress",
      {
        p_user_id: user.id,
        p_task_type: missionTaskType,
        p_increment: 1,
      },
    );
    missionResult = missionData?.[0];
    if (missionError) {
      console.error(
        "[record-activity] mission progress error:",
        missionError.message,
      );
    }
  }

  return jsonResponse({
    success: true,
    streakAwarded: streakResult?.streak_awarded ?? 0,
    missionUpdated: missionResult?.success ?? false,
  });
});
