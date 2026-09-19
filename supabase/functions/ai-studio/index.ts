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

const GEMINI_MODEL = "gemini-2.0-flash";

interface ErrorContext {
  errorId?: string;
  errorData?: {
    message: string;
    error_type: string;
    severity: string;
    stack_trace: string | null;
    route: string | null;
    feature: string | null;
    calculator: string | null;
    http_status: number | null;
    service: string | null;
    browser: string | null;
    operating_system: string | null;
    device_type: string | null;
    app_version: string | null;
    occurrence_count: number;
    first_seen: string;
    last_seen: string;
    metadata: Record<string, unknown>;
  };
  sourceCode?: {
    fileName: string;
    content: string;
  };
}

interface StudioRequest {
  tool: string;
  prompt: string;
  context?: {
    fileName?: string;
    fileContent?: string;
    artifactType?: string;
    sessionHistory?: { role: string; content: string }[];
    errorContext?: ErrorContext;
  };
  sessionId?: string;
  /** When tool is "error_analysis", this controls what the AI should produce */
  errorAction?: "diagnose" | "generate_fix";
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

// ── Protected FRELUX patterns — the AI must flag these ──
const PROTECTED_PATTERNS = [
  "calc.ts",
  "finish-calc.ts",
  "pop-tile-calc.ts",
  "smart-waste.ts",
  "smart-defaults.ts",
  "measurement",
  "roof",
  "engine-integration",
  "auth.tsx",
  "supabase.ts",
  "subscription.ts",
  "premium-access.ts",
  "paystack.ts",
  "credits.ts",
  "credits-context.tsx",
  "achievements.ts",
  "rewards-integration.ts",
  "rewarded-access.ts",
  "pro-connect.ts",
];

function _isProtectedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return PROTECTED_PATTERNS.some((p) => lower.includes(p));
}

const TOOL_SYSTEM_PROMPTS: Record<string, string> = {
  chat: "You are an expert AI development assistant for the FRELUX PAINT CALC platform. You help with React, TypeScript, Tailwind CSS, Supabase, and general web development questions. Provide clear, actionable answers with code examples when relevant.",
  page_builder:
    "You are an expert React page builder. Generate complete, production-ready React page components using TypeScript, Tailwind CSS, and lucide-react icons. Always include: proper imports, TypeScript types, responsive design, loading/error states, SEO meta tags, and clean component structure. Use the @/ path alias for imports.",
  crud_generator:
    "You are an expert full-stack CRUD module generator. Generate complete CRUD modules with: TypeScript types, Supabase query functions, React list/create/edit/delete components, form validation, and error handling. Use the existing AdminUi components (AdminCard, AdminButton, AdminField, StateMessage, Toggle) from @/components/admin/AdminUi.",
  db_designer:
    "You are a PostgreSQL database architect. Generate clean, idempotent SQL migrations with: CREATE TABLE IF NOT EXISTS, proper data types, primary keys, foreign keys, indexes, constraints, RLS policies (4 per table: SELECT, INSERT, UPDATE, DELETE), and helpful comments.",
  api_builder:
    "You are an expert Deno/Supabase Edge Function developer. Generate Edge Functions with: proper CORS headers (Access-Control-Allow-Origin: (restrict to known domains), etc.), OPTIONS preflight handling, input validation, try/catch error handling, JSON responses, and type safety. Use npm: prefixed imports.",
  dashboard_builder:
    "You are an expert dashboard builder. Generate React dashboard components with: charts (using inline SVG or CSS-based visualizations), stat cards, data tables, filters, responsive grid layouts, and real-time updates. Use Tailwind CSS for styling.",
  form_builder:
    "You are an expert form builder. Generate React forms with: TypeScript types, validation (required, email, min/max length, pattern), error messages, loading states, success states, accessibility (ARIA labels, focus management), and Tailwind CSS styling.",
  workflow_builder:
    "You are an expert workflow/automation builder. Design automation workflows with: triggers, conditions, actions, data transformations, and error handling. Output as a structured JSON workflow definition plus a visual description.",
  feature_generator:
    "You are an expert feature architect. Design complete feature specifications with: user stories, API contracts, database schema changes, UI components needed, edge cases, and implementation plan.",
  component_generator:
    "You are an expert React component generator. Generate reusable, well-typed React components with: props interface, Tailwind CSS styling, responsive design, accessibility, hover/focus states, and clean composition.",
  code_generator:
    "You are an expert code generator. Generate clean, production-ready code in the requested language. Always include proper types, error handling, and follow best practices.",
  bug_detection:
    "You are a senior code reviewer and bug detector. Analyze code for: logic errors, security vulnerabilities (XSS, injection, CSRF), race conditions, memory leaks, type errors, missing error handling, and accessibility issues. Rate each issue by severity (critical, high, medium, low) and provide a fix.",
  refactoring:
    "You are a refactoring expert. Improve code quality while preserving behavior. Focus on: readability, performance, maintainability, DRY principles, proper abstraction, and naming conventions. Show the refactored code and explain changes.",
  test_generator:
    "You are a QA engineer. Generate comprehensive test suites with: unit tests, integration tests, edge cases, error scenarios, and mocks. Use descriptive test names and cover both happy and unhappy paths.",
  docs_generator:
    "You are a technical writer. Generate clear, comprehensive documentation with: overview, installation, API reference, usage examples, configuration, troubleshooting, and integration guides. Use Markdown format.",
  deploy_assistant:
    "You are a deployment assistant. Help with: build optimization, environment configuration, deployment checklists, rollback procedures, and monitoring setup. Provide step-by-step instructions.",
  // ── Error Analysis Tools ──
  error_analysis: `You are a senior FRELUX platform error diagnostician. You analyze application errors and provide structured diagnoses.

PROTECTED FRELUX FUNCTIONALITY (never auto-modify without explicit admin approval):
- Painting, Screeding, Tyrolene, POP, Tile calculation rules and formulas
- Building-to-Roof, Structural, Foundation, Construction calculations
- FRELUX pricing rules
- Authentication (auth.tsx)
- Supabase RLS policies
- Payment systems (paystack.ts)
- Admin authorization
- FRELUX Credits, Achievements, Reward logic
- Pro Connect verification

Your diagnosis MUST be returned as a JSON object with these fields:
{
  "what_failed": "Brief description of what failed",
  "where_failed": "Where in the application the failure occurred",
  "root_cause": "The probable root cause",
  "affected_file": "The likely file/component responsible (or 'unknown' if unclear)",
  "category": "frontend | backend | database | api | authentication | configuration | deployment",
  "proposed_solution": "The safest proposed fix",
  "risk_level": "low | medium | high | critical",
  "protected_functionality_affected": true/false,
  "recommended_action": "What the administrator should do next"
}

If you do not have sufficient code context to safely identify the affected file or propose a fix, set affected_file to "unknown" and say "Insufficient code context to safely propose a fix." in the proposed_solution field. Do NOT hallucinate file names or code.

Always respond with ONLY the JSON object, no markdown formatting around it.`,
  error_fix: `You are a senior FRELUX platform code fix generator. Given an error diagnosis and optionally source code context, generate a proposed code fix.

PROTECTED FRELUX FUNCTIONALITY — if the fix touches any of these, you MUST set protected_functionality_affected to true:
- Painting, Screeding, Tyrolene, POP, Tile calculation rules and formulas (calc.ts, finish-calc.ts, pop-tile-calc.ts)
- Building-to-Roof, Structural, Foundation, Construction calculations
- FRELUX pricing rules
- Authentication (auth.tsx), Supabase RLS
- Payment systems (paystack.ts)
- Admin authorization
- FRELUX Credits, Achievements, Reward logic

Your fix MUST be returned as a JSON object:
{
  "file": "The file to modify",
  "existing_code": "The existing code that needs to change (or 'see source' if too long)",
  "proposed_code": "The new code",
  "explanation": "Why this fix works",
  "risk_level": "low | medium | high",
  "expected_effect": "What should happen after applying this fix",
  "protected_functionality_affected": true/false
}

If you cannot safely generate a fix, respond with { "file": "none", "existing_code": "", "proposed_code": "", "explanation": "Insufficient code context to safely propose a fix.", "risk_level": "unknown", "expected_effect": "none", "protected_functionality_affected": false }

Respond with ONLY the JSON object.`,
};

function buildSystemPrompt(tool: string): string {
  return TOOL_SYSTEM_PROMPTS[tool] ?? TOOL_SYSTEM_PROMPTS.chat;
}

async function callGemini(
  apiKey: string,
  tool: string,
  prompt: string,
  context?: StudioRequest["context"],
  errorAction?: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(tool);
  const parts: unknown[] = [{ text: systemPrompt }];

  if (context?.fileContent) {
    parts.push({
      text: `Existing file (${context.fileName ?? "file"}):\n\`\`\`\n${context.fileContent}\n\`\`\``,
    });
  }
  if (context?.sessionHistory && context.sessionHistory.length > 0) {
    const history = context.sessionHistory
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    parts.push({ text: `Conversation history:\n${history}` });
  }

  // ── Error context ──
  if (context?.errorContext?.errorData) {
    const ed = context.errorContext.errorData;
    const errorInfo = `APPLICATION ERROR TO ANALYZE:
- Message: ${ed.message}
- Type: ${ed.error_type}
- Severity: ${ed.severity}
- Stack trace: ${ed.stack_trace ?? "N/A"}
- Route: ${ed.route ?? "N/A"}
- Feature: ${ed.feature ?? "N/A"}
- Calculator: ${ed.calculator ?? "N/A"}
- HTTP Status: ${ed.http_status ?? "N/A"}
- Service: ${ed.service ?? "N/A"}
- Browser: ${ed.browser ?? "N/A"}
- OS: ${ed.operating_system ?? "N/A"}
- Device: ${ed.device_type ?? "N/A"}
- App Version: ${ed.app_version ?? "N/A"}
- Occurrences: ${ed.occurrence_count}
- First seen: ${ed.first_seen}
- Last seen: ${ed.last_seen}
- Metadata: ${JSON.stringify(ed.metadata ?? {})}`;

    parts.push({ text: errorInfo });

    if (context.errorContext.sourceCode) {
      parts.push({
        text: `Source code context from ${context.errorContext.sourceCode.fileName}:\n\`\`\`\n${context.errorContext.sourceCode.content.slice(0, 5000)}\n\`\`\``,
      });
    }

    if (errorAction === "generate_fix") {
      parts.push({
        text: "Generate a proposed code fix for this error. Return ONLY the JSON fix object as specified in your instructions.",
      });
    } else {
      parts.push({
        text: "Diagnose this error. Return ONLY the JSON diagnosis object as specified in your instructions.",
      });
    }
  } else {
    parts.push({
      text: `${prompt}\n\nRespond with well-structured, production-ready output. Use markdown code blocks for code.`,
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 4096,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `AI provider error: ${res.status} ${errText.slice(0, 300)}`,
    );
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI returned empty response");
  return text;
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
      {
        error:
          "AI service not configured. Set GOOGLE_AI_API_KEY in Supabase secrets.",
        code: "NO_API_KEY",
      },
      503,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
  if (!userId) {
    return jsonResponse(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      401,
    );
  }

  const isAdmin = await isUserAdmin(supabase, userId);
  if (!isAdmin) {
    return jsonResponse(
      { error: "Admin access required", code: "FORBIDDEN" },
      403,
    );
  }

  let payload: StudioRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }

  if (!payload.tool || !payload.prompt?.trim()) {
    // For error analysis, prompt can be the error context
    if (!payload.context?.errorContext?.errorData) {
      return jsonResponse(
        { error: "Tool and prompt are required", code: "BAD_REQUEST" },
        400,
      );
    }
    payload.prompt = "Analyze this error";
  }

  try {
    const response = await callGemini(
      apiKey,
      payload.tool,
      payload.prompt,
      payload.context,
      payload.errorAction,
    );

    // ── If error analysis, record the fix history entry ──
    if (
      (payload.tool === "error_analysis" || payload.tool === "error_fix") &&
      payload.context?.errorContext?.errorId
    ) {
      try {
        let diagnosis = {};
        let proposedFix = {};
        try {
          diagnosis = JSON.parse(response);
        } catch {
          // AI might wrap in markdown, try to extract
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            diagnosis = JSON.parse(jsonMatch[0]);
          }
        }

        if (payload.tool === "error_fix") {
          proposedFix = diagnosis;
          diagnosis = {};
        }

        // Check if a record already exists for this error
        const existing = await supabase
          .from("error_fix_history")
          .select("id, status")
          .eq("error_id", payload.context.errorContext.errorId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (existing.data && existing.data.length > 0) {
          // Update existing record
          const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (payload.tool === "error_analysis") {
            updateData.diagnosis = diagnosis;
            updateData.status = "fix_proposed";
          } else {
            updateData.proposed_fix = proposedFix;
            updateData.status = "awaiting_approval";
          }
          await supabase
            .from("error_fix_history")
            .update(updateData)
            .eq("id", existing.data[0].id);
        } else {
          // Create new record
          const insertData: Record<string, unknown> = {
            error_id: payload.context.errorContext.errorId,
            error_message:
              payload.context.errorContext.errorData?.message ??
              "Unknown error",
            error_type:
              payload.context.errorContext.errorData?.error_type ?? null,
            error_severity:
              payload.context.errorContext.errorData?.severity ?? null,
            status:
              payload.tool === "error_analysis"
                ? "fix_proposed"
                : "awaiting_approval",
          };
          if (payload.tool === "error_analysis") {
            insertData.diagnosis = diagnosis;
          } else {
            insertData.proposed_fix = proposedFix;
          }
          await supabase.from("error_fix_history").insert(insertData);
        }
      } catch (dbErr) {
        // Don't fail the response if DB recording fails
        console.error("Failed to record error fix history:", dbErr);
      }
    }

    if (payload.sessionId) {
      await supabase.from("ai_studio_chat").insert({
        session_id: payload.sessionId,
        role: "user",
        content: payload.prompt,
      });
      await supabase.from("ai_studio_chat").insert({
        session_id: payload.sessionId,
        role: "assistant",
        content: response,
      });
      await supabase
        .from("ai_studio_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", payload.sessionId);
    }

    return jsonResponse({ response, tool: payload.tool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message, code: "AI_ERROR" }, 502);
  }
});
