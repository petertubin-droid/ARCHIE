// =========================================================
// FRELUX AI LIVE CHAT — powered by ARCHIE
// =========================================================
// ARCHIE native intelligence (no external AI provider — no
// OpenAI, no quota, no key): the same inference boundary as
// archie-chat's public visitor mode, exposed through the
// ai-livechat contract (Admin AI settings + any direct
// integrations). Knowledge base from learn_articles is
// injected into the system instruction.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitHeaders,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { resolveArchieCapabilityEngine } from "../_shared/archie-ai/runtime.ts";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_REQUESTS_PER_HOUR = 20;

interface LiveChatRequest {
  question: string;
  clientId?: string;
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

async function checkHourlyRateLimit(
  supabase: ReturnType<typeof createClient>,
  clientHash: string,
): Promise<{ allowed: boolean; count: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_request_log")
    .select("*", { count: "exact", head: true })
    .eq("client_hash", clientHash)
    .eq("request_type", "livechat")
    .gte("created_at", oneHourAgo);
  if (error) return { allowed: true, count: 0 };
  return { allowed: (count ?? 0) < MAX_REQUESTS_PER_HOUR, count: count ?? 0 };
}

async function logAiRequest(
  supabase: ReturnType<typeof createClient>,
  clientHash: string,
  status: "success" | "error" | "rate_limited",
  providerError?: string,
): Promise<void> {
  await supabase.from("ai_request_log").insert({
    request_type: "livechat",
    client_hash: clientHash,
    status,
    provider_error: providerError ?? null,
  });
}

async function fetchKnowledgeBase(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await supabase
    .from("learn_articles")
    .select("title, excerpt, content, category_slug")
    .eq("status", "published")
    .limit(20);
  if (!data || data.length === 0) return "";
  return data
    .map(
      (a) =>
        `## ${a.title}\nCategory: ${a.category_slug}\n${a.excerpt ?? ""}\n${a.content.slice(0, 800)}`,
    )
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `You are ARCHIE, the FRELUX live chat assistant (frelux.tools) — a Nigerian building, painting and finishing platform. You help website visitors with questions about painting, POP ceiling installation, tile installation, screeding, color selection, and paint products.

Your job:
- Answer questions clearly, concisely, and practically
- Keep responses short — this is a chat, not an article. 2-4 sentences max unless the user asks for detail.
- Reference the website's knowledge base when relevant
- Cover painting, POP ceiling, tiles, screeding, color psychology, surface preparation, and DIY topics
- Be specific and actionable, avoid generic advice
- If a user asks about pricing, guide them to the relevant calculator (e.g. /painting-estimator for paint, /tile-calculator for tiles, /cost-estimator for cost breakdowns)
- If a question is outside the scope of painting, POP ceiling, tiles, or home improvement, politely redirect and suggest they contact support on WhatsApp
- Use a friendly, conversational tone — like a knowledgeable friend helping out
- NEVER invent current prices or give exact cost figures — direct users to the relevant cost estimator for live numbers

Knowledge base context from the website:

{{KNOWLEDGE_BASE}}

When the knowledge base has relevant content, reference it. When it doesn't, provide general expert guidance.`;

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Rate limit: per user/IP
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

  let parsedBody: LiveChatRequest | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server not configured" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: LiveChatRequest;
    try {
      parsedBody = (await req.json()) as LiveChatRequest;
      body = parsedBody;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const question = String(body.question ?? "").trim();
    if (!question) {
      return jsonResponse({ error: "Question is required" }, 400);
    }
    const clientId = String(body.clientId ?? "anon").slice(0, 80);
    const clientHash = await sha256(clientId);

    // hourly per-client budget (same policy as before)
    const budget = await checkHourlyRateLimit(supabase, clientHash);
    if (!budget.allowed) {
      await logAiRequest(supabase, clientHash, "rate_limited");
      return jsonResponse(
        {
          error:
            "You've reached the hourly chat limit. Please try again later.",
        },
        429,
      );
    }

    // knowledge base injection (same source as before)
    const kb = await fetchKnowledgeBase(supabase);
    const systemPrompt = SYSTEM_PROMPT.replace("{{KNOWLEDGE_BASE}}", kb);

    // ---- ARCHIE native inference (no external provider) ----
    const { runtime, engine } = resolveArchieCapabilityEngine({
      engineId: Deno.env.get("ARCHIE_ENGINE"),
    });
    if (!runtime) {
      await logAiRequest(
        supabase,
        clientHash,
        "error",
        "ARCHIE engine unavailable",
      );
      return jsonResponse(
        {
          error:
            "The FRELUX assistant is briefly unavailable. Please try again shortly.",
        },
        503,
      );
    }

    const result = await runtime.generate({
      turns: [
        {
          role: "owner" as const,
          parts: [{ text: question.slice(0, 4000) }],
        },
      ],
      systemInstruction: systemPrompt,
      // livechat has ZERO tools — guidance only, same as
      // archie-chat's public visitor mode.
      tools: [],
    });

    const text = result.parts
      .map((p) => (p as { text?: string }).text ?? "")
      .filter(Boolean)
      .join("")
      .trim();

    if (!text) {
      await logAiRequest(supabase, clientHash, "error", "empty ARCHIE reply");
      return jsonResponse(
        { error: "The assistant produced no response. Please try again." },
        502,
      );
    }

    await logAiRequest(supabase, clientHash, "success");

    return jsonResponse({ result: text, engine: engine.path });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Live chat error:", errorMsg);

    const isDown = errorMsg.includes("engine unavailable");
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const clientHash = await sha256(
          parsedBody?.clientId || crypto.randomUUID(),
        );
        await logAiRequest(
          supabase,
          clientHash,
          "error",
          errorMsg.slice(0, 500),
        );
      }
    } catch {
      // logging must never mask the original failure
    }

    return jsonResponse(
      {
        error: isDown
          ? "The FRELUX assistant is briefly unavailable. Please try again shortly."
          : "Sorry, something went wrong. Please try again.",
      },
      isDown ? 503 : 500,
    );
  }
});
