import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitHeaders,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_REQUESTS_PER_HOUR = 20;

interface ConsultRequest {
  mode: "text" | "image";
  description?: string;
  imageDataUrl?: string;
  clientId?: string;
}

interface AiColor {
  name: string;
  hex: string;
  role: "main" | "secondary" | "accent";
}

interface AiRecommendation {
  paletteSummary: string;
  colors: AiColor[];
  finishSuggestion: string;
  whyItWorks: string;
  additionalSuggestions: string;
}

interface SiteAiConfig {
  ai_enabled: boolean;
  ai_access_mode: string;
  ai_daily_free_uses: number;
  ai_admin_override: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Extract the authenticated user ID from the JWT in the Authorization header.
// Returns null for anonymous requests. NEVER trust a user-supplied userId
// in the request body — only the JWT is authoritative.
async function getAuthenticatedUserId(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Use the anon-key client to verify the JWT (not the service role key)
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Check if the authenticated user is an admin (from profiles table)
async function isUserAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

// Check if the authenticated user has verified paid status
async function getUserPaidStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_paid_status")
    .select("is_paid, paid_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.is_paid) return false;
  // Check if paid access has expired
  if (data.paid_until) {
    const expiry = new Date(data.paid_until).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

async function getAiConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<SiteAiConfig | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("ai_enabled, ai_access_mode, ai_daily_free_uses, ai_admin_override")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ai_enabled: data.ai_enabled ?? true,
    ai_access_mode: data.ai_access_mode ?? "free",
    ai_daily_free_uses: data.ai_daily_free_uses ?? 3,
    ai_admin_override: data.ai_admin_override ?? true,
  };
}

async function checkHourlyRateLimit(
  supabase: ReturnType<typeof createClient>,
  clientHash: string,
): Promise<{ allowed: boolean; count: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_request_log")
    .select("*", { count: "exact", head: true })
    .eq("client_hash", clientHash)
    .gte("created_at", oneHourAgo);
  if (error) return { allowed: false, count: 0 };
  return { allowed: (count ?? 0) < MAX_REQUESTS_PER_HOUR, count: count ?? 0 };
}

// Read daily usage. For authenticated users, look up by user_id.
// For anonymous users, look up by client_hash.
async function getDailyUsage(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  userId: string | null,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  let query;
  if (userId) {
    query = supabase
      .from("ai_usage_daily")
      .select("uses_consumed")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
  } else {
    query = supabase
      .from("ai_usage_daily")
      .select("uses_consumed")
      .eq("client_hash", clientId)
      .eq("usage_date", today)
      .maybeSingle();
  }
  const { data } = await query;
  return data?.uses_consumed ?? 0;
}

// Check for a still-unused "AI Estimate Token" reward redemption. Users can
// pre-pay FRELUX Credits for one of these on the Rewards page; when present,
// it should be spent instead of rejecting the request for hitting the daily
// free-use limit. Only applies to authenticated users (grants are tied to
// user_id, not anonymous client_hash).
async function getUnusedAiTokenGrant(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
): Promise<{ id: string; rewardKey: string } | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("reward_redemptions")
    .select("id, reward_key")
    .eq("user_id", userId)
    .eq("reward_type", "ai_token")
    .eq("status", "completed")
    .is("consumed_at", null)
    .order("granted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, rewardKey: data.reward_key } : null;
}

// Atomically mark one unused ai_token grant as consumed. Race-safe via the
// consume_reward_grant RPC (FOR UPDATE SKIP LOCKED under the hood).
async function consumeAiTokenGrant(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("consume_reward_grant", {
    p_user_id: userId,
    p_reward_type: "ai_token",
  });
  return Boolean(data?.[0]?.success);
}

// Consume a daily use. Only called on SUCCESS. Uses the service role client
// which bypasses RLS — the browser cannot write to this table.
async function consumeDailyUse(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  userId: string | null,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (userId) {
    // Authenticated user: upsert by user_id + date
    const { data: existing } = await supabase
      .from("ai_usage_daily")
      .select("id, uses_consumed")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("ai_usage_daily")
        .update({
          uses_consumed: (existing.uses_consumed ?? 0) + 1,
          last_used_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_usage_daily").insert({
        user_id: userId,
        client_hash: clientId,
        usage_date: today,
        uses_consumed: 1,
        last_used_at: now,
      });
    }
  } else {
    // Anonymous user: upsert by client_hash + date
    const { data: existing } = await supabase
      .from("ai_usage_daily")
      .select("id, uses_consumed")
      .eq("client_hash", clientId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("ai_usage_daily")
        .update({
          uses_consumed: (existing.uses_consumed ?? 0) + 1,
          last_used_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_usage_daily").insert({
        client_hash: clientId,
        usage_date: today,
        uses_consumed: 1,
        last_used_at: now,
      });
    }
  }
}

async function logRequest(
  supabase: ReturnType<typeof createClient>,
  requestType: "text" | "image",
  clientHash: string,
  status: "success" | "error" | "rate_limited" | "usage_limited" | "disabled",
  providerError?: string,
): Promise<void> {
  await supabase.from("ai_request_log").insert({
    request_type: requestType,
    client_hash: clientHash,
    status,
    provider_error: providerError ?? null,
  });
}

const SYSTEM_PROMPT = `You are a professional interior color consultant for a paint company called FRELUX PAINT CALC.
You help users choose paint colors for their spaces.

Your job:
- Analyze the user's room description or uploaded room photo.
- Recommend a cohesive color palette with exactly 3 colors: main, secondary, and accent.
- Each color MUST include a valid hexadecimal color code (e.g. #RRGGBB).
- Suggest an appropriate paint finish (e.g. matte, eggshell, satin, semi-gloss).
- Explain clearly why the combination works for the described space.
- Give practical coordination suggestions for furniture and decor.

Rules:
- Be specific and practical. Avoid generic advice like "use neutral colors."
- Consider lighting, room size, existing furniture, and desired mood.
- Only recommend colors that work well together.
- Every hex code must be a valid 6-digit hexadecimal starting with #.

You MUST respond with ONLY a valid JSON object matching this exact TypeScript type, no markdown, no explanation outside the JSON:

{
  "paletteSummary": string,
  "colors": [
    { "name": string, "hex": string, "role": "main" },
    { "name": string, "hex": string, "role": "secondary" },
    { "name": string, "hex": string, "role": "accent" }
  ],
  "finishSuggestion": string,
  "whyItWorks": string,
  "additionalSuggestions": string
}`;

function buildTextContents(description: string) {
  return [
    { text: SYSTEM_PROMPT },
    {
      text: `Room description from the user: "${description}"\n\nProvide your color recommendation as the JSON object.`,
    },
  ];
}

function buildImageContents(
  description: string | undefined,
  imageDataUrl: string,
  mimeType: string,
) {
  const parts: unknown[] = [
    { text: SYSTEM_PROMPT },
    {
      inlineData: {
        mimeType,
        data: imageDataUrl,
      },
    },
  ];
  const promptText = description
    ? `The user also provided this description: "${description}". Analyze the room in the image (wall color, furniture colors, lighting, dominant colors, overall style) and provide your color recommendation as the JSON object.`
    : `Analyze the room in this image (wall color, furniture colors, lighting, dominant colors, overall style) and provide your color recommendation as the JSON object.`;
  parts.push({ text: promptText });
  return parts;
}

function extractBase64FromDataUrl(dataUrl: string): {
  data: string;
  mimeType: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format");
  return { data: match[2], mimeType: match[1] };
}

async function callGemini(
  apiKey: string,
  mode: "text" | "image",
  description: string | undefined,
  imageDataUrl?: string,
): Promise<AiRecommendation> {
  const model = GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let parts: unknown[];
  if (mode === "image" && imageDataUrl) {
    const { data, mimeType: mt } = extractBase64FromDataUrl(imageDataUrl);
    parts = buildImageContents(description, data, mt);
  } else {
    parts = buildTextContents(description ?? "No description provided.");
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let code = "PROVIDER_ERROR";
    if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status === 400 || res.status === 401 || res.status === 403)
      code = "AUTH_ERROR";
    throw new Error(`${code}:${res.status}:${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text)
    throw new Error("EMPTY_RESPONSE:No content returned by AI provider");

  let parsed: AiRecommendation;
  try {
    let cleanText = text.trim();
    // Remove markdown code fences if present
    const fence = String.fromCharCode(96, 96, 96);
    if (cleanText.startsWith(fence)) {
      const lines = cleanText.split(String.fromCharCode(10));
      lines.shift(); // remove opening fence line
      if (lines[lines.length - 1].trim() === fence) lines.pop();
      cleanText = lines.join(String.fromCharCode(10));
    }
    cleanText = cleanText.trim();
    parsed = JSON.parse(cleanText);
  } catch (_e) {
    throw new Error("MALFORMED_JSON:AI returned non-JSON content");
  }

  if (
    !parsed.colors ||
    !Array.isArray(parsed.colors) ||
    parsed.colors.length === 0
  ) {
    throw new Error("INVALID_STRUCTURE:AI response missing colors array");
  }

  return parsed;
}

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Rate limit: 20 AI requests per minute per user/IP
  const rlKey = getRateLimitKey(req, req.headers.get("x-user-id") || undefined);
  const rl = checkRateLimit(rlKey, RATE_LIMITS.AI);
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

  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "AI service not configured", code: "NO_API_KEY" },
      503,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let payload: ConsultRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  if (!payload.mode || (payload.mode !== "text" && payload.mode !== "image")) {
    return jsonResponse({ error: "Invalid mode", code: "BAD_REQUEST" }, 400);
  }
  if (payload.mode === "text" && !payload.description?.trim()) {
    return jsonResponse(
      { error: "Description is required for text mode", code: "BAD_REQUEST" },
      400,
    );
  }
  if (payload.description && payload.description.length > 5000) {
    return jsonResponse(
      {
        error: "Description too long (max 5000 characters)",
        code: "BAD_REQUEST",
      },
      400,
    );
  }
  if (payload.mode === "image" && !payload.imageDataUrl) {
    return jsonResponse(
      { error: "Image is required for image mode", code: "BAD_REQUEST" },
      400,
    );
  }
  if (payload.mode === "image" && payload.imageDataUrl) {
    const { data: base64Data, mimeType } = extractBase64FromDataUrl(
      payload.imageDataUrl,
    );
    const ALLOWED_MIME_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return jsonResponse(
        {
          error: "Unsupported image format. Use JPEG, PNG, or WebP.",
          code: "BAD_REQUEST",
        },
        400,
      );
    }
    const byteLength = Math.ceil((base64Data.length * 3) / 4);
    if (byteLength > 5 * 1024 * 1024) {
      return jsonResponse(
        { error: "Image exceeds 5 MB limit", code: "IMAGE_TOO_LARGE" },
        400,
      );
    }
  }

  // Client fingerprint for rate limiting (always computed from request headers)
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const userAgent = req.headers.get("user-agent") ?? "";
  const clientHash = await sha256(`${forwarded}:${userAgent}`);

  // Determine user identity. The JWT in the Authorization header is the ONLY
  // authoritative source of user identity. The clientId in the body is used
  // only as a fallback for anonymous usage tracking — never for authenticated
  // users. A user cannot submit another user's ID to use their allowance.
  const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
  const clientId = userId ? clientHash : payload.clientId || clientHash;

  // 1. Check AI config from DB
  const config = await getAiConfig(supabase);
  if (!config) {
    return jsonResponse(
      { error: "AI configuration not available", code: "NOT_CONFIGURED" },
      503,
    );
  }
  if (!config.ai_enabled || config.ai_access_mode === "disabled") {
    await logRequest(supabase, payload.mode, clientHash, "disabled");
    return jsonResponse(
      { error: "AI features are currently disabled.", code: "AI_DISABLED" },
      403,
    );
  }

  // 2. Check if authenticated user is admin (bypasses limits)
  let isAdmin = false;
  if (userId && config.ai_admin_override) {
    isAdmin = await isUserAdmin(supabase, userId);
  }

  // 3. Check if authenticated user has verified paid status
  // Paid users bypass the daily free limit. This is the foundation for
  // future paid access — is_paid is only set server-side by a verified
  // payment provider, never by the client.
  let isPaid = false;
  if (userId) {
    isPaid = await getUserPaidStatus(supabase, userId);
  }

  // 4. Check daily shared usage limit (skip for paid users and admins)
  const bypassesLimit = isPaid || isAdmin;
  let useAiTokenGrant = false;
  if (!bypassesLimit) {
    const usedToday = await getDailyUsage(supabase, clientId, userId);
    if (usedToday >= config.ai_daily_free_uses) {
      // Before rejecting, check for a redeemed-but-unused "AI Estimate Token"
      // (FRELUX Rewards). If one exists, this request spends it instead of
      // the daily counter, and does NOT touch ai_usage_daily.
      const grant = await getUnusedAiTokenGrant(supabase, userId);
      if (grant) {
        useAiTokenGrant = true;
      } else {
        await logRequest(
          supabase,
          payload.mode,
          clientHash,
          "usage_limited",
          "DAILY_LIMIT",
        );
        const limitMsg =
          config.ai_daily_free_uses === 0
            ? "Free AI recommendations are no longer included in the Free plan. Use FRELUX Credits to access AI features."
            : `You have used all ${config.ai_daily_free_uses} free AI recommendations for today. Please come back tomorrow.`;
        return jsonResponse(
          {
            error: limitMsg,
            code: "USAGE_LIMIT_REACHED",
            dailyLimit: config.ai_daily_free_uses,
            usedToday,
          },
          429,
        );
      }
    }
  }

  // 5. Hourly rate limit (abuse prevention — applies to everyone)
  const { allowed, count } = await checkHourlyRateLimit(supabase, clientHash);
  if (!allowed) {
    await logRequest(
      supabase,
      payload.mode,
      clientHash,
      "rate_limited",
      "HOURLY_LIMIT",
    );
    return jsonResponse(
      {
        error: `Rate limit reached. Please try again later.`,
        code: "RATE_LIMITED",
        requestsMade: count,
      },
      429,
    );
  }

  // 6. Call AI provider
  try {
    const recommendation = await callGemini(
      apiKey,
      payload.mode,
      payload.description,
      payload.imageDataUrl,
    );
    // Only consume usage on SUCCESS, and only for non-paid, non-admin users.
    // Spend a pre-paid AI Estimate Token if one was used for this request,
    // otherwise fall back to the normal daily free-use counter.
    if (!bypassesLimit) {
      if (useAiTokenGrant && userId) {
        await consumeAiTokenGrant(supabase, userId);
      } else {
        await consumeDailyUse(supabase, clientId, userId);
      }
    }
    await logRequest(supabase, payload.mode, clientHash, "success");
    return jsonResponse({ recommendation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const [code] = message.split(":");
    await logRequest(supabase, payload.mode, clientHash, "error", code);
    const status =
      code === "RATE_LIMITED" ? 429 : code === "AUTH_ERROR" ? 503 : 502;
    return jsonResponse(
      {
        error:
          "The AI service could not process your request. Please try again later.",
        code: code || "PROVIDER_ERROR",
      },
      status,
    );
  }
});
