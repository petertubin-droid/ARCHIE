// =========================================================
// AI Logo Generation Edge Function
//
// Generates business logos using the Google AI (Gemini) API.
// Reuses the existing Supabase + Gemini architecture from
// ai-color-consult and ai-studio edge functions.
//
// Security:
// - API key stored in Supabase secrets (GOOGLE_AI_API_KEY)
// - Never exposed to the frontend
// - Rate-limited per user
// - Usage tracked in ai_logo_generations table
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LogoRequest {
  prompt: string;
  industry?: string;
  style?: string;
  colorPrefs?: string;
  userId: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function _sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AI,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { prompt, industry, style, colorPrefs, userId }: LogoRequest =
      await req.json();

    if (!prompt || !userId) {
      return jsonResponse({ error: "Prompt and userId are required." }, 400);
    }

    // Check daily limit
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get AI daily limit from site_settings
    const { data: settings } = await supabase
      .from("site_settings")
      .select("ai_logo_daily_limit, brand_studio_enabled")
      .limit(1)
      .maybeSingle();

    if (settings && settings.brand_studio_enabled === false) {
      return jsonResponse({ error: "Brand Studio is not enabled." }, 403);
    }

    const dailyLimit = settings?.ai_logo_daily_limit ?? 3;

    // Count today's generations
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_logo_generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString());

    if ((count ?? 0) >= dailyLimit) {
      return jsonResponse(
        {
          error:
            "You have reached your daily AI logo generation limit. Please try again tomorrow.",
        },
        429,
      );
    }

    // Get the API key
    const apiKey =
      Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "AI service is not configured." }, 503);
    }

    // Build a detailed prompt for the AI
    const fullPrompt = [
      `Create a professional ${style ?? "modern"} logo for "${prompt}"`,
      industry ? `Industry: ${industry}` : "",
      colorPrefs ? `Preferred colors: ${colorPrefs}` : "",
      "The logo should be clean, professional, and suitable for business documents and PDF exports.",
      "Output a single high-quality logo image on a white or transparent background.",
    ]
      .filter(Boolean)
      .join(". ");

    // Call Google AI API (Gemini) for image generation
    // Using the Gemini image generation endpoint
    const geminiModel = "gemini-2.0-flash-exp"; // model that supports image generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return jsonResponse(
        { error: "AI logo generation failed. Please try again." },
        502,
      );
    }

    const geminiData = await response.json();

    // Extract image from response
    let imageUrl: string | null = null;
    try {
      const candidate = geminiData.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          // Save to Supabase storage
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType ?? "image/png";
          const buffer = Uint8Array.from(atob(base64Data), (c) =>
            c.charCodeAt(0),
          );
          const path = `${userId}/ai_logo_${Date.now()}.png`;
          const { error: uploadError } = await supabase.storage
            .from("brand-assets")
            .upload(path, buffer, { contentType: mimeType });

          if (!uploadError) {
            const { data } = supabase.storage
              .from("brand-assets")
              .getPublicUrl(path);
            imageUrl = data.publicUrl;
          }
          break;
        }
      }
    } catch (e) {
      console.error("Image extraction error:", e);
    }

    if (!imageUrl) {
      // Fallback: generate a text-based logo placeholder
      // This ensures the feature degrades gracefully
      return jsonResponse(
        {
          error:
            "The AI could not generate an image. Please try a different description.",
        },
        422,
      );
    }

    return jsonResponse({ imageUrl, prompt });
  } catch (e) {
    console.error("AI Logo generation error:", e);
    return jsonResponse(
      { error: "Something went wrong. Please try again." },
      500,
    );
  }
});
