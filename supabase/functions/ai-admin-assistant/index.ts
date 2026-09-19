// =========================================================
// AI Admin Assistant — Supabase Edge Function
// =========================================================
// Owner directive (2026-09-15): ARCHIE's own engine is PRIMARY.
// The Solas Superagent (Base44) remains wired as a fallback and
// is NOT removed. Admins describe issues and get AI responses.
//
// Flow:
//   1. Admin sends { message, conversationId?, history? }
//   2. ARCHIE's native engine answers first (advisory, no tools)
//   3. If ARCHIE is not operational / empty / erroring, cascade
//      to Solas (API key from env or DB, conversation + message)
//   4. ADMIN_AI_ENGINE=solas forces the fallback explicitly
//   5. Returns { response, engine, conversationId?, messageId? }
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  corsHeaders as _corsHeaders,
  jsonResponse,
  errorResponse,
  handleCors,
} from "../_shared/cors.ts";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import { resolveArchieCapabilityEngine } from "../_shared/archie-ai/runtime.ts";

const SUPERAGENT_BASE = "https://app.base44.com/api/agents";
const DEFAULT_AGENT_ID = "6a872e1df3b5e9fc45fc13fb";

interface RequestBody {
  message: string;
  conversationId?: string;
  // Recent chat turns for ARCHIE context (stateless engine)
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  // Optional: for tracking
  actionTitle?: string;
  actionCategory?: string;
}

// ARCHIE is advisory here by design: this surface explains,
// diagnoses and drafts. It NEVER mutates data, deploys or
// executes changes — same boundary as the public live chat.
const ADMIN_ARCHIE_SYSTEM_PROMPT = `You are the FRELUX Admin Copilot — ARCHIE's own intelligence serving the platform owner's admin panel.

Role: help the admin understand, diagnose and describe issues on the FRELUX platform (construction-cost estimation, PRO marketplace, rewards, integrations, edge functions). You may explain how features work, interpret error reports, draft fix descriptions and suggest what to check next.

Boundaries:
- You are ADVISORY. You do not execute changes, write to the database or trigger actions — you tell the admin what to do or what a fix would involve.
- Never fabricate platform facts. If you are not certain of a FRELUX behavior, say so and suggest where to verify it.
- Be concise and practical. Answer the admin's actual question.`;

async function getApiKey(
  supabaseClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  // 1. Try environment variable (Supabase secret)
  const envKey = Deno.env.get("SOLAS_API_KEY");
  if (envKey) return envKey;

  // 2. Fall back to site_settings table
  const { data, error } = await supabaseClient
    .from("site_settings")
    .select("solas_api_key")
    .limit(1)
    .single();

  if (error || !data?.solas_api_key) return null;
  return data.solas_api_key;
}

async function getAgentId(
  supabaseClient: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await supabaseClient
    .from("site_settings")
    .select("solas_agent_id")
    .limit(1)
    .single();
  return data?.solas_agent_id || DEFAULT_AGENT_ID;
}

async function createConversation(
  agentId: string,
  apiKey: string,
): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${SUPERAGENT_BASE}/${agentId}/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      console.error(
        "[ai-admin-assistant] createConversation failed:",
        res.status,
        await res.text(),
      );
      return null;
    }

    const data = await res.json();
    // The API might return { id } or { conversation: { id } } or similar
    return {
      id: data.id || data.conversation_id || data.conversation?.id || data._id,
    };
  } catch (err) {
    console.error("[ai-admin-assistant] createConversation error:", err);
    return null;
  }
}

async function sendMessage(
  agentId: string,
  conversationId: string,
  apiKey: string,
  message: string,
): Promise<{ response: string; messageId: string } | null> {
  try {
    const res = await fetch(
      `${SUPERAGENT_BASE}/${agentId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: apiKey,
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!res.ok) {
      console.error(
        "[ai-admin-assistant] sendMessage failed:",
        res.status,
        await res.text(),
      );
      return null;
    }

    const data = await res.json();
    // Extract the assistant's response text
    const responseText =
      data.response ||
      data.message ||
      data.content ||
      data.text ||
      (typeof data === "string" ? data : JSON.stringify(data));
    const messageId = data.id || data.message_id || data._id || "";

    return { response: responseText, messageId };
  } catch (err) {
    console.error("[ai-admin-assistant] sendMessage error:", err);
    return null;
  }
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

  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Authentication required", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return errorResponse("Invalid authentication", 401);
    }

    // Verify admin role
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return errorResponse("Admin access required", 403);
    }

    const body: RequestBody = await req.json();
    if (!body.message || !body.message.trim()) {
      return errorResponse("Message is required", 400);
    }

    // ── ENGINE SELECTION (owner directive 2026-09-15) ──
    // ARCHIE first. Solas remains as fallback. Forcing Solas via
    // ADMIN_AI_ENGINE=solas is explicit config, never a silent swap.
    const enginePref = (
      Deno.env.get("ADMIN_AI_ENGINE") ?? "archie"
    ).toLowerCase();

    if (enginePref !== "solas") {
      const { runtime, engine } = resolveArchieCapabilityEngine({
        engineId: Deno.env.get("ARCHIE_ENGINE"),
      });
      if (runtime) {
        try {
          const historyTurns = (Array.isArray(body.history) ? body.history : [])
            .slice(-10)
            .filter(
              (m) =>
                (m?.role === "user" || m?.role === "assistant") &&
                typeof m?.content === "string" &&
                m.content.trim(),
            )
            .map((m) => ({
              role: (m.role === "user" ? "owner" : "archie") as
                "owner" | "archie",
              parts: [{ text: m.content.slice(0, 2000) }],
            }));

          const result = await runtime.generate({
            turns: [
              ...historyTurns,
              {
                role: "owner" as const,
                parts: [{ text: body.message.slice(0, 4000) }],
              },
            ],
            systemInstruction: ADMIN_ARCHIE_SYSTEM_PROMPT,
            // Advisory surface — no tools, no mutations, ever.
            tools: [],
            conversationId: `admin-assistant:${user.id}`,
          });

          const archieText = result.parts
            .map((p) => (p as { text?: string }).text ?? "")
            .filter(Boolean)
            .join("")
            .trim();

          if (archieText) {
            if (body.actionTitle) {
              await supabaseClient.from("admin_ai_actions").insert({
                reported_by: user.id,
                title: body.actionTitle,
                description: body.message,
                category: body.actionCategory || "bug",
                conversation_id: null,
                message_id: null,
                status: "in_progress",
                resolution: archieText,
              });
            }
            return jsonResponse({
              response: archieText,
              engine: "archie-native",
              engineNote: engine.note,
              conversationId: null,
              messageId: null,
            });
          }
          console.error(
            "[ai-admin-assistant] ARCHIE returned an empty reply — cascading to Solas",
          );
        } catch (archieErr) {
          console.error(
            "[ai-admin-assistant] ARCHIE generate failed — cascading to Solas:",
            archieErr,
          );
        }
      } else {
        console.error(
          "[ai-admin-assistant] ARCHIE engine not operational — cascading to Solas",
        );
      }
    }

    // ── SOLAS FALLBACK (unchanged behavior, explicitly retained) ──
    const apiKey = await getApiKey(supabaseClient);
    if (!apiKey) {
      return jsonResponse(
        {
          error:
            "Solas API key not configured. Go to Admin → AI Assistant → Settings to add it.",
          needsConfig: true,
        },
        400,
      );
    }

    const agentId = await getAgentId(supabaseClient);

    // Create or reuse conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const conv = await createConversation(agentId, apiKey);
      if (!conv) {
        return errorResponse(
          "Failed to create conversation with Solas. Check the API key.",
          502,
        );
      }
      conversationId = conv.id;
    }

    // Send message and get response
    const result = await sendMessage(
      agentId,
      conversationId,
      apiKey,
      body.message,
    );
    if (!result) {
      return errorResponse(
        "Failed to get response from Solas. The request may have timed out.",
        502,
      );
    }

    // Log the action
    if (body.actionTitle) {
      await supabaseClient.from("admin_ai_actions").insert({
        reported_by: user.id,
        title: body.actionTitle,
        description: body.message,
        category: body.actionCategory || "bug",
        conversation_id: conversationId,
        message_id: result.messageId,
        status: "in_progress",
        resolution: result.response,
      });
    }

    return jsonResponse({
      response: result.response,
      engine: "solas",
      conversationId,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error("[ai-admin-assistant] Unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});
