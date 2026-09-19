// =========================================================
// FRELUX Moderation — Pro Connect Messages
// ARCHIE native moderation (no external AI provider): shared
// ARCHIE verdict — security gate + NLU + Nigerian-marketplace
// rule set. Auto-flags or removes based on severity.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  moderateWithArchie,
  type ModerationResult,
} from "../_shared/archie-ai/moderation/moderate.ts";
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

interface ModerationRequest {
  messageId: string;
  content: string;
  conversationId: string;
  userId: string;
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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const anon = createClient(supabaseUrl, anonKey);

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await anon.auth.getUser(token);
  if (!userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  let body: ModerationRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!body.messageId || !body.content) {
    return jsonResponse({ error: "Missing messageId or content" }, 400);
  }

  // Step 1: Basic banned word check (fast path)
  const lowerContent = body.content.toLowerCase();
  const obviousBanned = [
    "scam",
    "send me money",
    "bitcoin investment",
    "crypto giveaway",
    "nude",
    "sex chat",
  ];
  const matchedBanned = obviousBanned.filter((w) => lowerContent.includes(w));

  if (matchedBanned.length > 0) {
    await takeAction(
      admin,
      body,
      "remove",
      1.0,
      matchedBanned,
      `Matched banned content: ${matchedBanned.join(", ")}`,
      userData.user.id,
    );
    return jsonResponse({
      action: "remove",
      score: 1.0,
      categories: matchedBanned,
      reason: `Matched banned content: ${matchedBanned.join(", ")}`,
    } satisfies ModerationResult);
  }

  // Step 2: ARCHIE native analysis — the shared moderation
  // authority. Deterministic, no external provider, no quota.
  try {
    const result: ModerationResult = moderateWithArchie(body.content, {
      surface: "pro-connect",
    });

    // Apply thresholds
    const autoRemoveThreshold = 0.85;
    const autoFlagThreshold = 0.6;

    if (result.score >= autoRemoveThreshold) {
      result.action = "remove";
    } else if (result.score >= autoFlagThreshold) {
      result.action = "flag";
    } else {
      result.action = "allow";
    }

    // Take action on the message
    if (result.action !== "allow") {
      await takeAction(
        admin,
        body,
        result.action,
        result.score,
        result.categories,
        result.reason,
        userData.user.id,
      );
    }

    return jsonResponse(result);
  } catch (err) {
    console.error("[pro-moderation] ARCHIE analysis failed:", err);
    // FIX 61: a moderation outage must NEVER fabricate a
    // "safe" verdict. The old code failed OPEN — returned
    // action "allow", score 0, category "safe" — so any
    // content sailed through the moment the engine hiccuped.
    // The message now fails to FLAGGED: it stays visible but
    // is marked for human review, and if even the flag cannot
    // be written the endpoint reports 503 honestly instead
    // of pretending all is well.
    const failFlagged: ModerationResult = {
      action: "flag",
      score: 0,
      categories: ["moderation_unavailable"],
      reason: "Moderation temporarily unavailable — flagged for human review",
    };
    try {
      await takeAction(
        admin,
        body,
        "flag",
        0,
        failFlagged.categories,
        failFlagged.reason,
        userData.user.id,
      );
      return jsonResponse(failFlagged);
    } catch (flagErr) {
      console.error("[pro-moderation] could not flag for review:", flagErr);
      return jsonResponse(
        { error: "Moderation unavailable — message could not be flagged" },
        503,
      );
    }
  }
});

// =========================================================
// Take Action — flag or remove message
// =========================================================
async function takeAction(
  admin: ReturnType<typeof createClient>,
  body: ModerationRequest,
  action: "flag" | "remove",
  score: number,
  categories: string[],
  reason: string,
  userId: string,
): Promise<void> {
  if (action === "remove") {
    // Remove the message
    await admin
      .from("pro_messages")
      .update({
        is_removed: true,
        is_flagged: true,
        flag_reason: reason,
        flagged_by: "ai_bot",
        removed_at: new Date().toISOString(),
      })
      .eq("id", body.messageId);

    // Post a system message
    await admin.from("pro_messages").insert({
      conversation_id: body.conversationId,
      sender_id: userId,
      body: "⚠️ A message was removed by the AI moderator for violating community guidelines.",
      message_type: "moderation",
    });
  } else {
    // Flag the message but don't remove
    await admin
      .from("pro_messages")
      .update({
        is_flagged: true,
        flag_reason: reason,
        flagged_by: "ai_bot",
      })
      .eq("id", body.messageId);
  }

  // Log the moderation action
  await admin
    .from("pro_moderation_log")
    .insert({
      message_id: body.messageId,
      conversation_id: body.conversationId,
      action,
      reason,
      performed_by: "ai_bot",
      ai_score: score,
      ai_categories: categories,
    })
    .then(() => {})
    .catch(() => {
      // Table might not exist yet — don't fail
    });
}
