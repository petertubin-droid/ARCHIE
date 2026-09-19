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

interface ProjectAssistantRequest {
  action: "review" | "optimize" | "explain" | "qa" | "preview_suggestion";
  projectData: {
    name: string;
    project_type: string;
    building_type: string;
    finish_quality: string;
    budget_level: string;
    status: string;
    rooms?: Array<{
      name: string;
      calculation_type: string;
      surface_area: number;
      material_cost: number;
      labour_cost: number;
      input_data: Record<string, unknown>;
    }>;
    total_material_cost: number;
    total_labour_cost: number;
    total_project_cost: number;
    currency: string;
    currency_symbol: string;
    notes?: string;
  };
  question?: string;
  optimizationTarget?: string;
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

async function isUserAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
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

function buildReviewPrompt(
  projectData: ProjectAssistantRequest["projectData"],
): string {
  const rooms = projectData.rooms ?? [];
  const roomSummary =
    rooms.length > 0
      ? rooms
          .map(
            (r) =>
              `- ${r.name} (${r.calculation_type}): ${r.surface_area}m², materials: ₦${r.material_cost?.toLocaleString()}, labour: ₦${r.labour_cost?.toLocaleString()}`,
          )
          .join("\n")
      : "No rooms configured yet.";

  return `You are an expert construction estimator and project consultant for FRELUX, a Nigerian construction estimation platform. 
Analyze this construction project and provide a professional review.

PROJECT DETAILS:
- Name: ${projectData.name}
- Type: ${projectData.project_type}
- Building Type: ${projectData.building_type}
- Finish Quality: ${projectData.finish_quality}
- Budget Level: ${projectData.budget_level}
- Status: ${projectData.status}
- Total Material Cost: ${projectData.currency_symbol}${projectData.total_material_cost?.toLocaleString()}
- Total Labour Cost: ${projectData.currency_symbol}${projectData.total_labour_cost?.toLocaleString()}
- Total Project Cost: ${projectData.currency_symbol}${projectData.total_project_cost?.toLocaleString()}

ROOMS:
${roomSummary}

${projectData.notes ? `PROJECT NOTES: ${projectData.notes}` : ""}

Provide a JSON response with these fields:
{
  "summary": "Overall assessment in 2-3 sentences",
  "strengths": ["List of things done well"],
  "weaknesses": ["List of potential issues or risks"],
  "missingMaterials": ["Any materials that seem missing for this type of project"],
  "costAnalysis": "Analysis of whether costs seem reasonable for this project type in Nigeria",
  "recommendations": ["Specific actionable recommendations to improve the project"],
  "estimatedDurationNote": "Note about the timeline if the project has duration data",
  "industryStandards": ["Relevant Nigerian construction industry standards to consider"],
  "bestPractices": ["Best practices for this type of work"]
}`;
}

function buildOptimizePrompt(
  projectData: ProjectAssistantRequest["projectData"],
  target: string,
): string {
  const rooms = projectData.rooms ?? [];
  const roomSummary =
    rooms.length > 0
      ? rooms
          .map(
            (r) =>
              `- ${r.name} (${r.calculation_type}): ${r.surface_area}m², materials: ₦${r.material_cost?.toLocaleString()}, labour: ₦${r.labour_cost?.toLocaleString()}`,
          )
          .join("\n")
      : "No rooms configured.";

  return `You are an expert construction cost optimizer for FRELUX, a Nigerian construction estimation platform.
The user wants to: "${target}"

CURRENT PROJECT:
- Name: ${projectData.name}
- Type: ${projectData.project_type}
- Building Type: ${projectData.building_type}
- Finish Quality: ${projectData.finish_quality}
- Budget Level: ${projectData.budget_level}
- Total Material Cost: ${projectData.currency_symbol}${projectData.total_material_cost?.toLocaleString()}
- Total Labour Cost: ${projectData.currency_symbol}${projectData.total_labour_cost?.toLocaleString()}
- Total Project Cost: ${projectData.currency_symbol}${projectData.total_project_cost?.toLocaleString()}

ROOMS:
${roomSummary}

Provide optimization suggestions as JSON:
{
  "strategy": "Brief explanation of the optimization approach",
  "savings": "Estimated savings or cost change as a percentage and amount",
  "changes": [
    {
      "area": "What to change (e.g. 'material quality', 'waste margin', 'labour allocation')",
      "current": "Current approach",
      "recommended": "Recommended change",
      "impact": "Estimated cost impact"
    }
  ],
  "tradeOffs": ["What trade-offs the user should be aware of"],
  "newEstimate": "Rough new total cost estimate after optimization",
  "warnings": ["Any risks or quality concerns with this optimization"]
}`;
}

function buildExplainPrompt(
  projectData: ProjectAssistantRequest["projectData"],
): string {
  const rooms = projectData.rooms ?? [];
  const roomSummary =
    rooms.length > 0
      ? rooms
          .map(
            (r) =>
              `- ${r.name} (${r.calculation_type}): ${JSON.stringify(r.input_data)}`,
          )
          .join("\n")
      : "No rooms configured.";

  return `You are an expert construction educator for FRELUX. Explain every calculation in this project clearly.

PROJECT:
- Name: ${projectData.name}
- Type: ${projectData.project_type}
- Total Cost: ${projectData.currency_symbol}${projectData.total_project_cost?.toLocaleString()}

ROOMS:
${roomSummary}

Explain the calculations as JSON:
{
  "overview": "How the total project cost is calculated",
  "roomBreakdowns": [
    {
      "roomName": "Room name",
      "calculations": ["Step-by-step explanation of how each value was computed"]
    }
  ],
  "materialLogic": "How material quantities are derived from surface areas",
  "wasteFactor": "Explanation of waste margins and why they are applied",
  "labourLogic": "How labour costs are calculated",
  "proTips": ["Professional tips for accurate estimation"]
}`;
}

function buildQaPrompt(
  projectData: ProjectAssistantRequest["projectData"],
  question: string,
): string {
  return `You are an expert construction consultant for FRELUX. Answer the user's question about their project.

PROJECT CONTEXT:
- Name: ${projectData.name}
- Type: ${projectData.project_type}
- Building Type: ${projectData.building_type}
- Total Cost: ${projectData.currency_symbol}${projectData.total_project_cost?.toLocaleString()}

USER QUESTION: "${question}"

Provide a helpful, professional answer as JSON:
{
  "answer": "Direct answer to the question",
  "details": "Additional context and explanation",
  "recommendations": ["Specific recommendations based on the question"],
  "references": ["Relevant construction standards or practices"]
}`;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2000,
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
  return text;
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
    return new Response(null, { status: 204, headers: corsHeaders });
  }
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

    const body: ProjectAssistantRequest = await req.json();

    // Auth check
    const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const _isAdmin = userId ? await isUserAdmin(adminSupabase, userId) : false;

    // Get AI config
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

    // Build prompt based on action
    let prompt = "";
    switch (body.action) {
      case "review":
        prompt = buildReviewPrompt(body.projectData);
        break;
      case "optimize":
        prompt = buildOptimizePrompt(
          body.projectData,
          body.optimizationTarget ?? "Reduce cost by 10%",
        );
        break;
      case "explain":
        prompt = buildExplainPrompt(body.projectData);
        break;
      case "qa":
        if (!body.question)
          return jsonResponse(
            { error: "Question is required for QA action" },
            400,
          );
        prompt = buildQaPrompt(body.projectData, body.question);
        break;
      case "preview_suggestion":
        prompt = buildReviewPrompt(body.projectData);
        break;
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }

    const aiResponse = await callGemini(config.gemini_api_key, prompt);
    let parsed: unknown;
    try {
      parsed = JSON.parse(aiResponse);
    } catch {
      parsed = { rawResponse: aiResponse };
    }

    return jsonResponse({ result: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("AI Project Assistant error:", message);
    return jsonResponse({ error: message, code: "INTERNAL_ERROR" }, 500);
  }
});
