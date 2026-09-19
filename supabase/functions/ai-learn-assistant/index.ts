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

const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_REQUESTS_PER_HOUR = 15;

interface AiLearnRequest {
  action:
    | "ask"
    | "generate_article"
    | "expand_outline"
    | "rewrite"
    | "improve"
    | "seo_optimize"
    | "generate_faq"
    | "generate_summary"
    | "image_prompts"
    | "alt_text"
    | "tutorial_steps"
    | "comparison"
    | "generate_insert";
  question?: string;
  content?: string;
  topic?: string;
  articleType?: string;
  targetKeywords?: string[];
  context?: string;
  clientId?: string;
  insertType?: string;
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
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

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
    request_type: "text",
    client_hash: clientHash,
    status,
    provider_error: providerError ?? null,
  });
}

// Fetch published learn articles as knowledge base context
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

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: systemPrompt }, { text: userPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 4000,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from AI");
  return text;
}

const ASK_SYSTEM_PROMPT = `You are the FRELUX PAINT CALC learning assistant. You help users with questions about painting, POP ceiling installation, tile installation, color selection, and paint products.

Your job:
- Answer questions clearly and practically
- Reference the website's knowledge base when relevant
- Cover painting, POP ceiling, tile installation, color psychology, surface preparation, and DIY topics
- Be specific and actionable, avoid generic advice
- If a question is outside the scope of painting, POP ceiling, tiles, or home improvement, politely redirect

Knowledge base context from the website:

{{KNOWLEDGE_BASE}}

When the knowledge base has relevant content, cite it. When it doesn't, provide general expert guidance.`;

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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey =
      Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

    if (!apiKey) {
      return jsonResponse(
        { error: "AI service is not configured.", code: "NO_API_KEY" },
        503,
      );
    }

    const body = (await req.json()) as AiLearnRequest;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Input validation — prevent oversized prompts
    const MAX_INPUT_LENGTH = 10000;
    const inputFields = [body.question, body.content, body.topic, body.context];
    for (const field of inputFields) {
      if (field && field.length > MAX_INPUT_LENGTH) {
        return jsonResponse(
          {
            error: "Input too long (max 10000 characters).",
            code: "BAD_REQUEST",
          },
          400,
        );
      }
    }
    if (!body.action) {
      return jsonResponse(
        { error: "Action is required.", code: "BAD_REQUEST" },
        400,
      );
    }
    if (body.action === "ask" && !body.question?.trim()) {
      return jsonResponse(
        { error: "Question is required.", code: "BAD_REQUEST" },
        400,
      );
    }

    // For admin-only actions, verify admin status
    if (body.action !== "ask") {
      const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
      if (!userId) {
        return jsonResponse(
          { error: "Authentication required.", code: "UNAUTHORIZED" },
          401,
        );
      }
      const admin = await isUserAdmin(supabase, userId);
      if (!admin) {
        return jsonResponse(
          { error: "Admin access required.", code: "FORBIDDEN" },
          403,
        );
      }
    }

    let systemPrompt = "";
    let userPrompt = "";

    switch (body.action) {
      case "ask": {
        const clientHash = await sha256(body.clientId || crypto.randomUUID());
        const { allowed, count } = await checkHourlyRateLimit(
          supabase,
          clientHash,
        );
        if (!allowed) {
          await logAiRequest(supabase, clientHash, "rate_limited");
          return jsonResponse(
            {
              error: `Rate limit exceeded (${count}/${MAX_REQUESTS_PER_HOUR} requests per hour). Please try again later.`,
              code: "RATE_LIMITED",
            },
            429,
          );
        }
        const knowledgeBase = await fetchKnowledgeBase(supabase);
        systemPrompt = ASK_SYSTEM_PROMPT.replace(
          "{{KNOWLEDGE_BASE}}",
          knowledgeBase ||
            "No published articles yet. Provide general expert guidance.",
        );
        userPrompt = `User question: ${body.question ?? ""}\n\nProvide a helpful, practical answer.`;
        break;
      }
      case "generate_article": {
        systemPrompt = `You are a professional content writer for FRELUX PAINT CALC. Generate a complete, well-structured article in Markdown format.

Article type: ${body.articleType ?? "painting guide"}
Topic: ${body.topic ?? ""}

The article should include:
- A compelling title (# Title)
- An engaging introduction
- Well-organized sections with ## headings
- Practical, actionable advice
- Step-by-step instructions where appropriate
- Safety considerations
- A conclusion or summary

Write in clear, accessible language. Use bullet points and numbered lists where helpful.`;
        userPrompt = `Generate a complete article about: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "expand_outline": {
        systemPrompt = `You are a content editor for FRELUX PAINT CALC. Expand the given outline into a detailed, well-structured article in Markdown format. Add practical examples, step-by-step instructions, and expert tips.`;
        userPrompt = `Expand this outline into a full article:\n\n${body.content ?? ""}`;
        break;
      }
      case "rewrite":
      case "improve": {
        systemPrompt = `You are a content editor for FRELUX PAINT CALC. Rewrite and improve the given content for clarity, grammar, readability, and flow. Keep the same meaning but enhance the writing quality. Return Markdown format.`;
        userPrompt = `Improve this content:\n\n${body.content ?? ""}`;
        break;
      }
      case "seo_optimize": {
        systemPrompt = `You are an SEO expert for FRELUX PAINT CALC. Analyze the given content and provide:
1. An optimized meta title (50-60 characters)
2. An optimized meta description (150-160 characters)
3. Target keyword suggestions (5-10 keywords)
4. Internal linking suggestions (3-5 relevant anchor texts)
5. Structured data recommendation (JSON-LD type)
6. Content optimization suggestions

Return as JSON: {"metaTitle": "...", "metaDescription": "...", "keywords": [...], "internalLinks": [...], "structuredData": "...", "suggestions": "..."}`;
        userPrompt = `Optimize this content for SEO:\n\n${body.content ?? ""}\n\nTarget keywords: ${body.targetKeywords?.join(", ") ?? "auto-detect"}`;
        break;
      }
      case "generate_faq": {
        systemPrompt = `You are a content writer for FRELUX PAINT CALC. Generate 5-7 relevant FAQ items about the given topic. Each FAQ should have a question and a clear, practical answer. Return as Markdown with ## Q: ... and A: ... format.`;
        userPrompt = `Generate FAQs about: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "generate_summary": {
        systemPrompt = `You are a content editor. Generate a concise 2-3 sentence summary of the given article suitable for use as an excerpt or meta description.`;
        userPrompt = `Summarize this article:\n\n${body.content ?? ""}`;
        break;
      }
      case "image_prompts": {
        systemPrompt = `You are a visual content strategist. Generate 3-5 image prompts that could be used with AI image generators to create illustrations for the given article. Each prompt should be detailed and specific.`;
        userPrompt = `Generate image prompts for: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "alt_text": {
        systemPrompt = `You are an accessibility expert. Generate descriptive alt text for images related to the given content. Return as a JSON array of strings.`;
        userPrompt = `Generate alt text for images about: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "tutorial_steps": {
        systemPrompt = `You are a DIY tutorial writer for FRELUX PAINT CALC. Generate detailed step-by-step tutorial instructions in Markdown format. Include materials needed, preparation, steps, and safety tips.`;
        userPrompt = `Generate a step-by-step tutorial for: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "comparison": {
        systemPrompt = `You are a product reviewer for FRELUX PAINT CALC. Generate a comparison article in Markdown format with a table comparing the key features, pros, and cons of the products or methods mentioned.`;
        userPrompt = `Compare: ${body.topic ?? body.content ?? ""}`;
        break;
      }
      case "generate_insert": {
        // In-article insert drafts (Summary, Key Takeaways, What to Watch,
        // Pro Tip, Stat Highlight, Quote) for Admin → Learn → Inserts.
        const insertType = body.insertType ?? "summary";
        const allowedTypes = [
          "summary",
          "key_takeaways",
          "what_to_watch",
          "pro_tip",
          "stat_highlight",
          "quote",
        ];
        if (!allowedTypes.includes(insertType)) {
          return jsonResponse(
            {
              error: `Unknown insert type: ${insertType}.`,
              code: "BAD_REQUEST",
            },
            400,
          );
        }
        const listTypes = ["summary", "key_takeaways", "what_to_watch"];
        const formatRule = listTypes.includes(insertType)
          ? `This is a list-style insert. Return 3-5 items, each a single line of at most 90 characters. Use one item per line with NO bullet markers, numbering, or markdown — plain lines only.`
          : insertType === "stat_highlight"
            ? `Return 1-3 lines. Each line MUST be exactly: <big number or short stat> | <one-line explanation>. The pipe character separates the stat from its label. No markdown.`
            : `Return a single short paragraph of 2-3 sentences. No markdown, no headings, no quotes.`;
        systemPrompt = `You are a professional content editor for FRELUX PAINT CALC (painting, POP ceiling, tiles, and home improvement). Draft an in-article insert card of type "${insertType}".

Rules:
- Base every statement ONLY on the article content provided. Do not invent facts, prices, or statistics.
- Nigerian context (₦, litres, bags) unless the article clearly says otherwise.
- Punchy, specific, professional copy — no fluff, no "In this article..." filler.
- ${formatRule}
- Tone: expert but friendly.

Return ONLY the card content as JSON, nothing else: {"title": "<short card title, max 6 words>", "body": "<the full body exactly as specified above with \n between lines if list-style>"}`;
        userPrompt = `Article content:

${body.content ?? ""}

Draft the "${insertType}" insert card for this article.`;
        break;
      }
      default:
        return jsonResponse(
          { error: "Unknown action.", code: "BAD_REQUEST" },
          400,
        );
    }

    const result = await callGemini(apiKey, systemPrompt, userPrompt);
    if (body.action === "ask") {
      const logHash = await sha256(body.clientId || "unknown");
      await logAiRequest(supabase, logHash, "success");
    }
    return jsonResponse({ result });
  } catch (err) {
    const isRateLimit =
      err instanceof Error && err.message.includes("Rate limit");
    const message = isRateLimit
      ? err.message
      : "AI service error. Please try again.";
    return jsonResponse({ error: message, code: "PROVIDER_ERROR" }, 502);
  }
});
