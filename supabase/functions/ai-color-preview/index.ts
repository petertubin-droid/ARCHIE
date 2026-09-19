import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitHeaders,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-2.0-flash";

interface PreviewRequest {
  imageDataUrl?: string;
  roomDescription?: string;
  targetColors: Array<{ name: string; hex: string }>;
  roomType?: string;
  lightingCondition?: string;
  mood?: string;
  style?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthenticatedUserId(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function getAiConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<{ ai_enabled: boolean; gemini_api_key: string } | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["ai_enabled", "gemini_api_key"]);
  if (!data || data.length === 0) return null;
  const map: Record<string, string> = {};
  for (const row of data) map[row.key] = row.value;
  return {
    ai_enabled: map["ai_enabled"] !== "false",
    gemini_api_key: map["gemini_api_key"] ?? "",
  };
}

function extractBase64FromDataUrl(dataUrl: string): {
  data: string;
  mimeType: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { data: dataUrl, mimeType: "image/jpeg" };
  return { data: match[2], mimeType: match[1] };
}

async function callGeminiForPreview(
  apiKey: string,
  req: PreviewRequest,
): Promise<{
  previewDescription: string;
  colorSuggestions: Array<{
    hex: string;
    name: string;
    reasoning: string;
    coverageArea: string;
  }>;
  applicationTips: string[];
}> {
  const colors = req.targetColors.map((c) => `${c.name} (${c.hex})`).join(", ");
  const context = [
    req.roomType ? `Room type: ${req.roomType}` : "",
    req.lightingCondition ? `Lighting: ${req.lightingCondition}` : "",
    req.mood ? `Desired mood: ${req.mood}` : "",
    req.style ? `Interior style: ${req.style}` : "",
    req.roomDescription ? `Room description: ${req.roomDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const textPrompt = `You are an expert interior designer and color consultant for FRELUX.
The user wants to preview how these paint colors would look in their room:

Colors to preview: ${colors}

Room context:
${context}

${req.imageDataUrl ? "The user has uploaded a photo of their room." : "No photo uploaded — analyze based on the description."}

Provide a JSON response with:
{
  "previewDescription": "Detailed description of how the room would look with each color, considering lighting and room type. Describe the visual transformation.",
  "colorSuggestions": [
    {
      "hex": "#RRGGBB",
      "name": "Color name",
      "reasoning": "Why this color works for this room — consider lighting, mood, and style",
      "coverageArea": "Recommended surface for this color (walls, accent wall, trim, ceiling)"
    }
  ],
  "applicationTips": ["Specific tips for applying this color — primer needs, number of coats, finish type, surface preparation"]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let parts: unknown[];
  if (req.imageDataUrl) {
    const { data, mimeType } = extractBase64FromDataUrl(req.imageDataUrl);
    parts = [{ text: textPrompt }, { inlineData: { mimeType, data } }];
  } else {
    parts = [{ text: textPrompt }];
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.8,
      topP: 0.9,
      maxOutputTokens: 1500,
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
    throw new Error(`${res.status}:${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("EMPTY_RESPONSE");

  try {
    return JSON.parse(text);
  } catch {
    return {
      previewDescription: text,
      colorSuggestions: [],
      applicationTips: [],
    };
  }
}

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const body: PreviewRequest = await req.json();

    // Verify auth
    await getAuthenticatedUserId(req, supabaseUrl, anonKey);

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const config = await getAiConfig(adminSupabase);
    if (!config?.ai_enabled) {
      return jsonResponse(
        { error: "AI features are currently disabled", code: "AI_DISABLED" },
        403,
      );
    }
    if (!config.gemini_api_key) {
      return jsonResponse(
        { error: "AI service not configured", code: "NO_API_KEY" },
        503,
      );
    }

    const result = await callGeminiForPreview(config.gemini_api_key, body);
    return jsonResponse({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("AI Color Preview error:", message);
    return jsonResponse({ error: message, code: "INTERNAL_ERROR" }, 500);
  }
});
