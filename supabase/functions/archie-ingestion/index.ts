// =========================================================
// FRELUX PHASE 6.5 — ARCHIE REFERENCE INTELLIGENCE INGESTION
//
// Backend-only secure ingestion endpoint for intentionally
// supplied ARCHIE/ChatGPT reference material.
//
// Security (Phase 6.5 §6):
//   * requires the caller's Supabase JWT AND an admin profile
//   * payload size limits, full validation + sanitization
//   * duplicate detection (content hash), rate limiting
//   * provenance + audit logging, immutable record insertion
//   * AUTONOMOUS PROMOTION (owner directive 2026-09-12):
//     knowledge accumulation is FREE — ARCHIE filters and
//     promotes material on its own (see _shared/archie-ai/
//     knowledge/autonomous.ts). Owner-gated surfaces (code,
//     decisions, certified math rules, quarantined material)
//     still HOLD for owner review. Full audit trail.
//
// There is no "ARCHIE API" and no access to ChatGPT internals:
// this endpoint receives explicitly supplied reference material
// through an authorized admin workflow only. No provider API keys
// exist in this code; the service role key is server-side env.
// =========================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import {
  evaluateAutonomy,
  autonomouslyPromote,
} from "../_shared/archie-ai/knowledge/autonomous.ts";
import { verifyAuthorityJwt } from "../_shared/archie-ai/security/cross-project-auth.ts";

const MAX_PER_HOUR = 20;
const RATE_WINDOW_MS = 3_600_000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const CORS = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const archieRateLimit = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!archieRateLimit.allowed)
    return rateLimitedResponse(archieRateLimit.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json(405, {
      accepted: false,
      code: "INVALID_PAYLOAD",
      message: "POST only.",
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, {
      accepted: false,
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerToken = authHeader.replace("Bearer ", "");

  // Caller-scoped client: authenticates AS the caller (JWT).
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  let callerId: string | null = auth?.user?.id ?? null;
  if (authErr || !callerId) {
    // Cross-project owner identity (cutover 2026-09-12, see
    // cross-project-auth.ts): the owner's sessions are issued
    // by the FRELUX authority project. Verify such JWTs against
    // the authority's public JWKS instead of this project's
    // GoTrue. Owner authority is still decided by
    // profiles.role='admin' below.
    const verified = await verifyAuthorityJwt(callerToken);
    if (verified) callerId = verified.sub;
    if (!callerId) {
      return json(401, {
        accepted: false,
        code: "UNAUTHORIZED",
        message: "Invalid session.",
      });
    }
  }
  const authUserId = callerId as string;

  // Service client: role/lookup checks + writes (server-side only).
  const service = createClient(supabaseUrl, serviceKey);

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", authUserId)
    .single();
  if (profile?.role !== "admin") {
    return json(403, {
      accepted: false,
      code: "UNAUTHORIZED",
      message: "Admin authorization required for ARCHIE ingestion.",
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, {
      accepted: false,
      code: "INVALID_PAYLOAD",
      message: "Body must be JSON.",
    });
  }

  // -------- OP: settle_backlog --------------------------------
  // Owner-triggered sweep: ARCHIE autonomously re-evaluates
  // every ARCHIE_RECEIVED / CANDIDATE record under the
  // 2026-09-12 knowledge-autonomy policy. ARCHIE makes each
  // promote/hold decision itself; the owner only triggers the
  // sweep and still receives the summary.
  if ((payload as { op?: string })?.op === "settle_backlog") {
    const { data: backlog, error: blErr } = await service
      .from("frelux_learning_records")
      .select("*")
      .in("lifecycle_status", ["ARCHIE_RECEIVED", "CANDIDATE"])
      .limit(200);
    if (blErr) {
      return json(500, { ok: false, code: "BACKLOG_READ_FAILED", message: blErr.message });
    }
    let promoted = 0, held = 0, rejected = 0;
    const heldReasons: string[] = [];
    for (const rec of backlog ?? []) {
      const evaluation = evaluateAutonomy(rec, []);
      if (evaluation.decision === "PROMOTE") {
        const r = await autonomouslyPromote(service, rec, authUserId, evaluation.reason);
        if (r.ok) promoted++;
        else held++;
      } else if (evaluation.decision === "HOLD") {
        held++;
        heldReasons.push(`${rec.topic ?? rec.id}: ${evaluation.reason}`);
      } else {
        rejected++;
      }
    }
    return json(200, {
      ok: true,
      code: "BACKLOG_SETTLED",
      evaluated: (backlog ?? []).length,
      promoted,
      held,
      rejected,
      held_reasons: heldReasons.slice(0, 25),
    });
  }

  // Validation + sanitization (shared module semantics; a small
  // server-side reimplementation of the same contract).
  const { validateArchiePayload } = await import("./validate.ts");
  const validated = validateArchiePayload(payload);
  if (!validated.ok) {
    await service.from("frelux_learning_audit").insert({
      action: "REJECTED_INVALID",
      actor: authUserId,
      details: { code: validated.code, message: validated.message },
    });
    return json(validated.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
      accepted: false,
      code: validated.code,
      message: validated.message,
      flags: validated.flags,
    });
  }

  // Rate limiting per admin, per hour (service-side table).
  const rlKey = `archie-ingest:${authUserId}`;
  const now = new Date();
  const { data: rl } = await service
    .from("frelux_learning_rate_limits")
    .select("window_start, count")
    .eq("key", rlKey)
    .maybeSingle();
  const windowStart = rl ? new Date(rl.window_start).getTime() : 0;
  const expired = now.getTime() - windowStart >= RATE_WINDOW_MS;
  const count = expired ? 0 : (rl?.count ?? 0);
  if (count >= MAX_PER_HOUR) {
    await service.from("frelux_learning_audit").insert({
      action: "RATE_BLOCKED",
      actor: authUserId,
      details: { key: rlKey, count },
    });
    return json(429, {
      accepted: false,
      code: "RATE_LIMITED",
      message: `Ingestion limit reached (${MAX_PER_HOUR}/hour). Try again later.`,
    });
  }
  await service.from("frelux_learning_rate_limits").upsert(
    {
      key: rlKey,
      window_start: expired
        ? now.toISOString()
        : new Date(windowStart).toISOString(),
      count: count + 1,
    },
    { onConflict: "key" },
  );

  // Duplicate detection by content hash.
  const { data: dup } = await service
    .from("frelux_learning_records")
    .select("id")
    .eq("content_hash", validated.record.content_hash)
    .limit(1);
  if ((dup?.length ?? 0) > 0) {
    await service.from("frelux_learning_audit").insert({
      action: "DUPLICATE_BLOCKED",
      actor: authUserId,
      details: { content_hash: validated.record.content_hash },
    });
    return json(200, {
      accepted: false,
      code: "DUPLICATE",
      message:
        "Duplicate submission: this reference material was already ingested.",
    });
  }

  // Insert as ARCHIE_RECEIVED. Ingestion alone NEVER promotes.
  const { data: inserted, error: insErr } = await service
    .from("frelux_learning_records")
    .insert({
      ...validated.record,
      created_by: authUserId,
      lifecycle_status: "ARCHIE_RECEIVED",
      verification_status: "PENDING",
      evaluation_status: "NOT_EVALUATED",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return json(500, {
      accepted: false,
      code: "INVALID_PAYLOAD",
      message: "Storage failure.",
    });
  }

  await service.from("frelux_learning_audit").insert({
    record_id: inserted.id,
    action: "INGESTED",
    actor: authUserId,
    details: {
      provider: validated.record.provider,
      model_version: validated.record.model_version,
      capability: validated.record.capability,
      proposed_scope: validated.record.proposed_scope,
      injection_flags: validated.flags,
    },
  });

  // -------- AUTONOMOUS PROMOTION (owner directive 2026-09-12)
  // ARCHIE evaluates the material itself and promotes whatever
  // passes its filters — no human review step. Owner-gated
  // surfaces HOLD. Everything is audited.
  const evaluation = evaluateAutonomy(
    { ...validated.record, id: inserted.id, created_by: authUserId },
    validated.flags,
  );
  if (evaluation.decision === "PROMOTE") {
    const promoted = await autonomouslyPromote(
      service,
      { ...validated.record, id: inserted.id, created_by: authUserId },
      authUserId,
      evaluation.reason,
    );
    if (promoted.ok) {
      return json(200, {
        accepted: true,
        code: "INGESTED_AUTONOMOUSLY_PROMOTED",
        record_id: inserted.id,
        knowledge_version: promoted.knowledge_version,
        message:
          `Ingested and autonomously promoted to ACTIVE knowledge (v${promoted.knowledge_version}) — ${evaluation.reason}.`,
        flags: validated.flags,
      });
    }
    // The material IS ingested; promotion itself failed (storage).
    await service.from("frelux_learning_audit").insert({
      record_id: inserted.id,
      action: "AUTONOMOUS_PROMOTION_FAILED",
      actor: authUserId,
      details: { reason: evaluation.reason, error: promoted.error },
    });
    return json(200, {
      accepted: true,
      code: "INGESTED_PROMOTION_FAILED",
      record_id: inserted.id,
      message: `Ingested, but autonomous promotion failed: ${promoted.error}`,
      flags: validated.flags,
    });
  }
  return json(200, {
    accepted: true,
    code: evaluation.decision === "HOLD" ? "INGESTED_HELD" : "INGESTED",
    record_id: inserted.id,
    message:
      evaluation.decision === "HOLD"
        ? `Ingested as ARCHIE_RECEIVED and held: ${evaluation.reason}.`
        : `Ingested but not stored as knowledge: ${evaluation.reason}.`,
    flags: validated.flags,
  });
});
