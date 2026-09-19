// =========================================================
// Health Check Endpoint
// GET /health — returns 200 if healthy, 503 if degraded
// =========================================================

import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { serveWithCors } from "../_shared/serve.ts";

interface HealthStatus {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  version: string;
  checks: {
    database: "up" | "down" | "unknown";
    ai_providers: "up" | "down" | "unknown";
    payment: "up" | "down" | "unknown";
  };
  uptime_seconds: number;
}

const startTime = Date.now();

serveWithCors(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const checks: HealthStatus["checks"] = {
    database: "unknown",
    ai_providers: "unknown",
    payment: "unknown",
  };

  let overallStatus: "healthy" | "degraded" | "down" = "healthy";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (supabaseUrl) {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" },
        signal: AbortSignal.timeout(3000),
      });
      checks.database = res.ok ? "up" : "down";
      if (!res.ok) overallStatus = "degraded";
    }
  } catch {
    checks.database = "down";
    overallStatus = "degraded";
  }

  checks.ai_providers = Deno.env.get("GEMINI_API_KEY") ? "up" : "unknown";
  checks.payment = Deno.env.get("PAYSTACK_SECRET_KEY") ? "up" : "unknown";

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  };

  return jsonResponse(
    health,
    overallStatus === "down" ? 503 : 200,
    corsHeaders,
  );
});
