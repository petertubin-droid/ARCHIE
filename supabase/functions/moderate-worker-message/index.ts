// =========================================================
// FRELUX AI Moderation Bot — Worker Channel Messages
// Analyzes messages for spam, offensive content, misinformation,
// and controversy. Auto-flags or removes based on admin thresholds.
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
  channelId: string;
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

  // Verify the user is a pro_worker
  const { data: profile } = await admin
    .from("profiles")
    .select("account_type, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) {
    return jsonResponse({ error: "Profile not found" }, 403);
  }

  const isWorker = profile.account_type === "pro_worker";
  const isAdmin = profile.role === "admin";
  if (!isWorker && !isAdmin) {
    return jsonResponse(
      { error: "Only worker accounts can access worker channels" },
      403,
    );
  }

  // Parse the request body
  let body: ModerationRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!body.messageId || !body.content) {
    return jsonResponse({ error: "Missing messageId or content" }, 400);
  }

  // Fetch moderation config
  const { data: config } = await admin
    .from("worker_moderation_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!config || !config.is_enabled) {
    // Moderation disabled — allow everything
    return jsonResponse({
      action: "allow",
      score: 0,
      categories: [],
      reason: "Moderation disabled",
    } satisfies ModerationResult);
  }

  // Step 1: Check banned words list
  const content_lower = body.content.toLowerCase();
  const bannedWords: string[] = config.banned_words ?? [];
  const matchedBanned = bannedWords.filter(
    (w) => w && content_lower.includes(w.toLowerCase()),
  );

  let result: ModerationResult = {
    action: "allow",
    score: 0,
    categories: [],
    reason: "No issues detected",
  };

  if (matchedBanned.length > 0) {
    result = {
      action: "remove",
      score: 1.0,
      categories: ["banned_word"],
      reason: `Matched banned word(s): ${matchedBanned.join(", ")}`,
    };
  }

  // Step 2: Check banned regex patterns
  if (result.action === "allow") {
    const patterns: string[] = config.banned_patterns ?? [];
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(body.content)) {
          result = {
            action: "remove",
            score: 1.0,
            categories: ["banned_pattern"],
            reason: `Matched banned pattern: ${pattern}`,
          };
          break;
        }
      } catch {
        // Skip invalid patterns
      }
    }
  }

  // Step 3: ARCHIE native analysis (no external provider, no
  // quota, no key). Runs for every message that passed the
  // DB-configured banned patterns.
  if (result.action === "allow") {
    try {
      const archieResult = moderateWithArchie(body.content, {
        surface: "worker-channel",
      });
      if (archieResult.action !== "allow" || archieResult.score > 0) {
        result = archieResult;
      }
    } catch (err) {
      console.error("[moderation] ARCHIE analysis failed:", err);
      // Fall through to heuristic analysis
    }

    // Step 4: Heuristic fallback (if ARCHIE analysis unavailable)
    if (result.action === "allow" && result.score === 0) {
      result = heuristicAnalysis(body.content);
    }
  }

  // Step 5: Apply thresholds
  const autoRemoveThreshold = config.auto_remove_threshold ?? 0.85;
  const autoFlagThreshold = config.auto_flag_threshold ?? 0.6;

  if (result.score >= autoRemoveThreshold) {
    result.action = "remove";
  } else if (result.score >= autoFlagThreshold) {
    result.action = "flag";
  } else {
    result.action = "allow";
  }

  // Step 6: Take action
  if (result.action === "remove") {
    // Remove the message
    await admin
      .from("worker_channel_messages")
      .update({
        is_removed: true,
        is_flagged: true,
        flag_reason: result.reason,
        flagged_by: "ai_bot",
        removed_at: new Date().toISOString(),
      })
      .eq("id", body.messageId);

    // Log the moderation action
    await admin.from("worker_moderation_log").insert({
      message_id: body.messageId,
      channel_id: body.channelId,
      action: "remove",
      reason: result.reason,
      performed_by: "ai_bot",
      ai_score: result.score,
      ai_categories: result.categories,
    });

    // Post a system message in the channel
    await admin.from("worker_channel_messages").insert({
      channel_id: body.channelId,
      user_id: userData.user.id,
      content: config.warning_message,
      message_type: "moderation",
      is_flagged: false,
      is_removed: false,
    });
  } else if (result.action === "flag") {
    // Flag the message but don't remove it
    await admin
      .from("worker_channel_messages")
      .update({
        is_flagged: true,
        flag_reason: result.reason,
        flagged_by: "ai_bot",
      })
      .eq("id", body.messageId);

    // Log the moderation action
    await admin.from("worker_moderation_log").insert({
      message_id: body.messageId,
      channel_id: body.channelId,
      action: "flag",
      reason: result.reason,
      performed_by: "ai_bot",
      ai_score: result.score,
      ai_categories: result.categories,
    });
  }

  return jsonResponse(result);
});

// =========================================================
// Heuristic Analysis (fallback when AI unavailable)
// =========================================================
function heuristicAnalysis(content: string): ModerationResult {
  const lower = content.toLowerCase();
  let score = 0;
  const categories: string[] = [];

  // Excessive caps (shouting)
  const capsRatio =
    (content.match(/[A-Z]/g) ?? []).length / Math.max(1, content.length);
  if (capsRatio > 0.6 && content.length > 20) {
    score += 0.15;
    categories.push("excessive_caps");
  }

  // Excessive repetition
  const words = lower.split(/\s+/);
  const uniqueWords = new Set(words);
  const repetitionRatio = 1 - uniqueWords.size / Math.max(1, words.length);
  if (repetitionRatio > 0.5 && words.length > 10) {
    score += 0.2;
    categories.push("repetition");
  }

  // Suspicious URLs
  const urlCount = (content.match(/https?:\/\/\S+/g) ?? []).length;
  if (urlCount > 3) {
    score += 0.3;
    categories.push("link_spam");
  }

  // Common scam patterns
  const scamPatterns = [
    "make money fast",
    "get rich quick",
    "double your money",
    "investment opportunity",
    "send money to",
    "click here to claim",
    "you have won",
    "free money",
    "crypto giveaway",
    "bitcoin investment",
  ];
  for (const pattern of scamPatterns) {
    if (lower.includes(pattern)) {
      score += 0.5;
      categories.push("scam");
      break;
    }
  }

  // Aggressive/hostile language
  const hostilePatterns = [
    "stupid",
    "idiot",
    "useless",
    "worthless",
    "shut up",
    "nonsense",
    "fool",
    "crazy",
  ];
  let hostileCount = 0;
  for (const pattern of hostilePatterns) {
    if (lower.includes(pattern)) hostileCount++;
  }
  if (hostileCount >= 2) {
    score += 0.35;
    categories.push("harassment");
  } else if (hostileCount >= 1) {
    score += 0.15;
    categories.push("aggressive_language");
  }

  // Very long messages (potential spam flood)
  if (content.length > 2000) {
    score += 0.15;
    categories.push("excessive_length");
  }

  return {
    action: "allow",
    score: Math.min(1, score),
    categories,
    reason:
      categories.length > 0
        ? `Heuristic: ${categories.join(", ")}`
        : "No issues detected",
  };
}
