// FRELUX Error Reporting Edge Function
// Secure ingestion endpoint with validation, rate limiting,
// deduplication, and error grouping via fingerprinting.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Allowed fields from client ──
const ALLOWED_FIELDS = new Set([
  "severity",
  "error_type",
  "message",
  "stack_trace",
  "route",
  "feature",
  "calculator",
  "http_status",
  "service",
  "browser",
  "operating_system",
  "device_type",
  "app_version",
  "session_id",
  "metadata",
]);

// ── Sensitive patterns to sanitize ──
const SENSITIVE_PATTERNS = [
  /password[=: ]+\S+/gi,
  /token[=: ]+\S+/gi,
  /api[_-]?key[=: ]+\S+/gi,
  /secret[=: ]+\S+/gi,
  /authorization[=: ]+\S+/gi,
  /bearer\s+\S+/gi,
  /sk_live_\S+/gi,
  /sk_test_\S+/gi,
  /pk_live_\S+/gi,
  /pk_test_\S+/gi,
];

function sanitize(text: string | null | undefined): string | null {
  if (!text) return null;
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  // Truncate extremely long strings
  if (result.length > 4000) {
    result = result.substring(0, 4000) + "...[truncated]";
  }
  return result;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      cleaned[key] = sanitize(value);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ── Compute error fingerprint ──
// Based on error_type + message (first line) + route + feature
// Not based on stack trace (which varies) or user data.
function computeFingerprint(error: {
  error_type: string;
  message: string;
  route?: string;
  feature?: string;
}): string {
  const firstLine = error.message.split("\n")[0].trim().substring(0, 200);
  const parts = [
    error.error_type || "runtime",
    firstLine,
    error.route || "unknown",
    error.feature || "unknown",
  ];
  // Simple hash (djb2) — consistent, no crypto needed
  const str = parts.join("|");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}

// ── Validate severity ──
const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serveWithCors(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  // ── Parse payload ──
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // ── Reject oversized payloads (max 10KB) ──
  const payloadSize = JSON.stringify(payload).length;
  if (payloadSize > 10240) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  // ── Extract user ID from JWT if present ──
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  // If user is authenticated, get their ID
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // Not authenticated — that's fine, anonymous errors are allowed
    }
  }

  // ── Filter to allowed fields only ──
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (ALLOWED_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }

  // ── Reject client attempts to set privileged fields ──
  // resolved, resolved_by, resolved_at are NEVER accepted from client
  delete filtered.resolved;
  delete filtered.resolved_by;
  delete filtered.resolved_at;
  delete filtered.id;
  delete filtered.created_at;
  delete filtered.occurrence_count;
  delete filtered.first_seen;
  delete filtered.last_seen;
  delete filtered.fingerprint;

  // ── Validate required fields ──
  const message = sanitize(String(filtered.message ?? ""));
  if (!message) {
    return jsonResponse({ error: "message is required" }, 400);
  }

  // ── Validate severity ──
  let severity = String(filtered.severity ?? "medium").toLowerCase();
  if (!VALID_SEVERITIES.has(severity)) {
    severity = "medium";
  }

  // ── Validate HTTP status ──
  let httpStatus = null;
  if (filtered.http_status !== undefined && filtered.http_status !== null) {
    const s = Number(filtered.http_status);
    if (Number.isInteger(s) && s >= 100 && s <= 599) {
      httpStatus = s;
    }
  }

  // ── Sanitize all string fields ──
  const error_type =
    sanitize(String(filtered.error_type ?? "runtime")) ?? "runtime";
  const stack_trace = sanitize(
    filtered.stack_trace ? String(filtered.stack_trace) : null,
  );
  const route = sanitize(filtered.route ? String(filtered.route) : null);
  const feature = sanitize(filtered.feature ? String(filtered.feature) : null);
  const calculator = sanitize(
    filtered.calculator ? String(filtered.calculator) : null,
  );
  const service = sanitize(filtered.service ? String(filtered.service) : null);
  const browser = sanitize(filtered.browser ? String(filtered.browser) : null);
  const operating_system = sanitize(
    filtered.operating_system ? String(filtered.operating_system) : null,
  );
  const device_type = sanitize(
    filtered.device_type ? String(filtered.device_type) : null,
  );
  const app_version = sanitize(
    filtered.app_version ? String(filtered.app_version) : null,
  );
  const session_id = sanitize(
    filtered.session_id ? String(filtered.session_id) : null,
  );

  // ── Sanitize metadata ──
  let metadata = {};
  if (
    filtered.metadata &&
    typeof filtered.metadata === "object" &&
    !Array.isArray(filtered.metadata)
  ) {
    metadata = sanitizeObject(filtered.metadata as Record<string, unknown>);
    const metaSize = JSON.stringify(metadata).length;
    if (metaSize > 2048) {
      metadata = {
        error: "metadata too large, truncated",
        original_size: metaSize,
      };
    }
  }

  // ── Compute fingerprint ──
  const fingerprint = computeFingerprint({
    error_type,
    message,
    route: route ?? undefined,
    feature: feature ?? undefined,
  });

  // ── Rate limiting: deduplication ──
  // Check if the same fingerprint was seen in the last 5 minutes
  const _fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const dedupUrl = `${supabaseUrl}/rest/v1/application_errors?select=id,occurrence_count,last_seen,resolved&fingerprint=eq.${fingerprint}&order=last_seen.desc&limit=1`;
  const dedupResp = await fetch(dedupUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const dedupData = dedupResp.ok ? await dedupResp.json() : [];
  const existing =
    Array.isArray(dedupData) && dedupData.length > 0 ? dedupData[0] : null;

  if (existing) {
    // ── Deduplicate: update existing record ──
    // Only increment if the existing record is within the dedup window
    const lastSeenDate = new Date(existing.last_seen);
    const now = Date.now();
    const minutesSinceLast = (now - lastSeenDate.getTime()) / (1000 * 60);

    // If within 5 minutes, just increment occurrence count
    if (minutesSinceLast < 5 && !existing.resolved) {
      await fetch(
        `${supabaseUrl}/rest/v1/application_errors?id=eq.${existing.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            occurrence_count: (existing.occurrence_count ?? 1) + 1,
            last_seen: new Date().toISOString(),
          }),
        },
      );
      return jsonResponse({
        status: "deduplicated",
        occurrence_count: (existing.occurrence_count ?? 1) + 1,
      });
    }

    // If resolved but same error reappears, reopen it
    if (existing.resolved && minutesSinceLast < 60) {
      await fetch(
        `${supabaseUrl}/rest/v1/application_errors?id=eq.${existing.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            occurrence_count: (existing.occurrence_count ?? 1) + 1,
            last_seen: new Date().toISOString(),
            resolved: false,
            resolved_at: null,
            resolved_by: null,
          }),
        },
      );
      return jsonResponse({
        status: "reopened",
        occurrence_count: (existing.occurrence_count ?? 1) + 1,
      });
    }
  }

  // ── Rate limiting per session ──
  // Max 50 errors per session per hour
  if (session_id) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rateUrl = `${supabaseUrl}/rest/v1/application_errors?session_id=eq.${session_id}&created_at=gte.${oneHourAgo}`;
    const rateResp = await fetch(rateUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact",
      },
    });
    const count = rateResp.ok
      ? parseInt(rateResp.headers.get("content-range")?.split("/")[1] ?? "0")
      : 0;

    if (count && count >= 50) {
      // Drop the error — rate limited
      return jsonResponse({ status: "rate_limited" }, 429);
    }
  }

  // ── Insert new error record via PostgREST directly ──
  const insertPayload = {
    severity,
    error_type,
    message,
    stack_trace,
    fingerprint,
    route,
    feature,
    calculator,
    http_status: httpStatus,
    service,
    browser,
    operating_system,
    device_type,
    app_version,
    session_id,
    user_id: userId,
    metadata,
    occurrence_count: 1,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    resolved: false,
  };

  const insertResp = await fetch(`${supabaseUrl}/rest/v1/application_errors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(insertPayload),
  });

  if (!insertResp.ok) {
    return jsonResponse({ error: "Failed to store error" }, 500);
  }

  return jsonResponse({ status: "logged" });
});
