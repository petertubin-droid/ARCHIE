// =========================================================
// FRELUX AI COPILOT — Edge Function (Deno)
//
// NATURAL-LANGUAGE INTERPRETATION ONLY.
//
//   AI interprets, extracts, classifies, summarizes, identifies
//   missing information, proposes scenarios.
//
//   The DETERMINISTIC FRELUX ENGINES calculate quantities,
//   geometry, materials and costs — on the CLIENT, through the
//   authoritative engine registry. This function is FORBIDDEN from
//   computing or estimating any construction number.
//
// Security:
//   - Google AI key stays server-side (Deno env) — never shipped to the client
//   - Supabase JWT auth required
//   - Output is schema-constrained JSON; the client-side orchestrator
//     validates and clamps every fact before use
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-2.0-flash";

interface CopilotRequest {
  text: string;
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

// Schema-constrained output — the model can ONLY fill these fields.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    interpretation: {
      type: "object",
      properties: {
        taskType: {
          type: "string",
          enum: [
            "building_estimate",
            "roof_estimate",
            "painting_estimate",
            "painting_materials",
            "screeding_estimate",
            "tile_estimate",
            "pop_estimate",
            "tyrolene_estimate",
            "finish_compare",
            "scenario_compare",
            "project_question",
            "unsupported",
          ],
        },
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                enum: [
                  "bedrooms",
                  "number_of_floors",
                  "building_type",
                  "building_length",
                  "building_width",
                  "floor_to_floor_height",
                  "length",
                  "width",
                  "height",
                  "location",
                  "roof_type",
                  "roof_pitch_degrees",
                  "roof_overhang",
                ],
              },
              label: { type: "string" },
              value: { type: ["number", "string"] },
              unit: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["key", "label", "value"],
          },
        },
        followUpQuestion: { type: "string" },
      },
      required: ["taskType", "facts"],
    },
  },
  required: ["interpretation"],
};

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!geminiKey) {
    return jsonResponse(
      {
        error:
          "AI provider is not configured. The Copilot falls back to deterministic parsing.",
      },
      503,
    );
  }

  try {
    const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { text } = (await req.json()) as CopilotRequest;
    if (!text || typeof text !== "string" || text.length > 2000) {
      return jsonResponse({ error: "Invalid request text" }, 400);
    }

    const prompt = `You are the FRELUX Copilot interpreter. FRELUX is a construction & property intelligence platform with DETERMINISTIC calculation engines (build-to-roof building estimation, roof geometry, painting, tyrolene finishing).

Your ONLY job: interpret the user's request and extract stated facts. 

ABSOLUTE RULES:
1. NEVER calculate, estimate or invent quantities, materials, costs or areas. If a number is not explicitly stated by the user, do not produce it.
2. Extract ONLY facts the user explicitly stated (dimensions, room counts, building type, location names).
3. Convert explicitly stated feet dimensions to meters and note the conversion in evidence.
4. If required information is missing, set a single short followUpQuestion. Do not answer construction questions yourself.
5. Use taskType "unsupported" for anything the deterministic engines cannot do.
6. Facts have confidence handled downstream — mark evidence with the exact phrase the user said.

User request: """${text.replace(/"/g, "'")}"""

Return JSON matching the schema.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      return jsonResponse(
        { error: "AI interpretation temporarily unavailable" },
        502,
      );
    }

    const gemini = await response.json();
    const raw = gemini?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return jsonResponse({ error: "Empty AI response" }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Malformed AI response" }, 502);
    }

    // Defensive validation — trust nothing beyond the schema shape.
    const interpretation = (
      parsed as { interpretation?: Record<string, unknown> }
    )?.interpretation;
    if (!interpretation || typeof interpretation !== "object") {
      return jsonResponse({ error: "Malformed interpretation" }, 502);
    }

    return jsonResponse({ interpretation });
  } catch (error) {
    console.error("ai-copilot error:", error);
    return jsonResponse({ error: "ai-copilot failed" }, 500);
  }
});
