// =========================================================
// FRELUX ARCHIE — EXECUTION & RUNTIME ENGINE (HTTP SURFACE)
// supabase/functions/archie-execute/index.ts
//
// The single audited path from ARCHIE systems to real backend
// execution. Actions:
//
//   list     — registry of enabled execution targets
//   run      — execute a registered target through the full
//              engine pipeline (verify → authority → execute
//              → verify → audit); returns REDACTED results
//   history  — recent audited runs (redacted)
//
// AUTHORITY MODEL:
//   * Valid Supabase JWT whose profile role is 'admin' (Owner)
//     is required for every action — no anonymous access.
//   * Targets flagged requires_owner_secret additionally
//     verify the Owner Secret server-side (PBKDF2 + constant-
//     time compare against frelux_owner_credentials). The
//     plaintext secret is never stored, logged or echoed.
//   * Failed secret attempts are rate-limited and produce
//     security events (same posture as archie-owner-auth).
//
// The engine core is _shared/archie-ai/execution/engine.ts —
// shared with archie-chat and future ARCHIE systems. Secrets
// live only in edge-runtime env vars, server-side.
// =========================================================

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  ExecutionTarget,
  EngineDeps,
  executeTarget,
} from "../_shared/archie-ai/execution/engine.ts";
import {
  RecoveryDeps,
  recoverRun,
} from "../_shared/archie-ai/recovery/engine.ts";
import { createClient, User } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// service client — the engine writes audit rows through it
const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------
// Owner-secret verification (PBKDF2, constant-time compare)
// — same posture as archie-owner-auth; never log values.
// ---------------------------------------------------------
function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function deriveVerifier(
  secret: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(saltB64), (c) =>
        c.charCodeAt(0),
      ) as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );
  return b64encode(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyOwnerSecret(
  userId: string,
  secret: string,
): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/frelux_owner_credentials?user_id=eq.${userId}&select=secret_hash,salt,iterations`,
    {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    },
  );
  if (!res.ok) return false;
  const rows = (await res.json()) as {
    secret_hash: string;
    salt: string;
    iterations: number;
  }[];
  const cred = rows[0];
  if (!cred) return false;
  const verifier = await deriveVerifier(secret, cred.salt, cred.iterations);
  return constantTimeEqual(verifier, cred.secret_hash);
}

// failed-secret rate limiting (in-memory per instance, 10 min)
const failedSecrets = new Map<string, { n: number; until: number }>();
function secretRateLimited(userId: string): boolean {
  const e = failedSecrets.get(userId);
  return !!e && Date.now() < e.until && e.n >= 5;
}
function recordSecretFailure(userId: string): void {
  const e = failedSecrets.get(userId) ?? { n: 0, until: 0 };
  e.n += 1;
  e.until = Date.now() + 10 * 60 * 1000;
  failedSecrets.set(userId, e);
}

// ---------------------------------------------------------
// Security events (audit posture parity)
// ---------------------------------------------------------
async function securityEvent(
  userId: string,
  type: string,
  severity: "info" | "warning" | "critical",
  message: string,
): Promise<void> {
  try {
    await db.from("frelux_security_events").insert({
      user_id: userId,
      // FIX 26: the table column is `kind` — the old
      // `event_type` inserts were rejected by PostgREST and
      // silently swallowed, leaving execution security
      // events dark.
      kind: type,
      severity,
      message,
    });
  } catch {
    // audit must never break execution flow
  }
}

// ---------------------------------------------------------
// Engine dependencies — bound to the live service client
// ---------------------------------------------------------
async function getTarget(key: string): Promise<ExecutionTarget | null> {
  const { data } = await db
    .from("frelux_archie_execution_targets")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  return (data as unknown as ExecutionTarget) ?? null;
}

const engineDeps: EngineDeps = {
  getTarget,
  createRun: async (rec) => {
    const { data, error } = await db
      .from("frelux_archie_execution_runs")
      .insert(rec)
      .select("id")
      .single();
    if (error || !data) throw new Error("audit insert failed");
    return data as { id: string };
  },
  updateRun: async (id, patch) => {
    const { error } = await db
      .from("frelux_archie_execution_runs")
      .update({ ...patch, updated_date: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("audit update failed");
  },
  // FIX 24 (remediation batch 8): invalid owner-secret
  // attempts in the last 15 minutes power the brute-force
  // throttle. (frelux_security_events carries user_id +
  // created_date with an index.) Fails open on DB error —
  // never locks the owner out over an infrastructure hiccup.
  countRecentSecretFailures: async (userId: string) => {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("frelux_security_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "EXECUTION_OWNER_SECRET_INVALID")
      .gte("created_date", since);
    if (error) return 0;
    return count ?? 0;
  },
  verifyOwnerSecret,
  recordSecurityEvent: securityEvent,
  getSecret: (name: string) => Deno.env.get(name),
  fetchFn: fetch,
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_ROLE,
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  log: (m: string) => console.log(`[archie-execute] ${m}`),
};

// ---------------------------------------------------------
// Recovery engine deps — the recovery layer re-enters the
// execution engine above (every authority gate re-runs);
// its decisions land in the append-only recovery ledger.
// ---------------------------------------------------------
const recoveryDeps: RecoveryDeps = {
  getRun: async (id) => {
    const { data, error } = await db
      .from("frelux_archie_execution_runs")
      .select(
        "id,target_key,status,input,error,http_status,attempts,compensation_run_id,initiator_system,updated_date",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("run read failed");
    return (data ?? null) as Awaited<ReturnType<RecoveryDeps["getRun"]>>;
  },
  getTarget,
  executeTarget: (req) => executeTarget(engineDeps, req),
  // Circuit breaker (remediation batch 4): how many runs of
  // the same target failed in the last 15 minutes.
  countRecentTargetFailures: async (targetKey: string) => {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("frelux_archie_execution_runs")
      .select("id", { count: "exact", head: true })
      .eq("target_key", targetKey)
      .in("status", ["FAILED", "TIMEOUT"])
      .gte("updated_date", since);
    if (error) throw new Error("target failure count failed");
    return count ?? 0;
  },
  countRecoveryAttempts: async (runId) => {
    const { count, error } = await db
      .from("frelux_archie_recovery_events")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId);
    if (error) throw new Error("recovery ledger read failed");
    return count ?? 0;
  },
  recordRecoveryEvent: async (ev) => {
    const { error } = await db.from("frelux_archie_recovery_events").insert(ev);
    if (error) throw new Error("recovery ledger insert failed");
  },
  recordSecurityEvent: securityEvent,
  log: (m: string) => console.log(`[archie-recovery] ${m}`),
};

// ---------------------------------------------------------
// Auth: Owner = valid JWT + admin profile role
// ---------------------------------------------------------
async function authenticate(
  req: Request,
): Promise<{ user: User | null; isOwner: boolean }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { user: null, isOwner: false };
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser();
  const user = (userData?.user ?? null) as User | null;
  if (userError || !user) return { user: null, isOwner: false };
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { user, isOwner: profile?.role === "admin" };
}

// ---------------------------------------------------------
// Handler
// ---------------------------------------------------------
interface ExecuteBody {
  action: "list" | "run" | "history" | "recover" | "recovery";
  targetKey?: string;
  runId?: string;
  input?: unknown;
  ownerSecret?: string;
  deviceFingerprint?: string;
  limit?: number;
}

serveWithCors(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed — POST only.", 405);
  }

  const { user, isOwner } = await authenticate(req);
  if (!user || !isOwner) {
    if (user) {
      await securityEvent(
        user.id,
        "EXECUTION_NON_OWNER_ACCESS",
        "critical",
        "A non-owner account called the execution engine.",
      );
    }
    return errorResponse("Owner authority required.", 401);
  }

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }

  switch (body.action) {
    case "list": {
      const { data, error } = await db
        .from("frelux_archie_execution_targets")
        .select(
          "key,label,description,kind,environment,requires_owner_secret,allowed_initiators,risk_class,enabled,http_method,idempotent",
        )
        .order("environment", { ascending: true });
      if (error) return errorResponse("Registry read failed.", 500);
      return jsonResponse({
        ok: true,
        // secret_headers, endpoint internals, function internals — never exposed
        targets: data,
      }, 200);
    }

    case "run": {
      const targetKey = String(body.targetKey ?? "").trim();
      if (!targetKey) return errorResponse("targetKey is required.", 400);
      if (secretRateLimited(user.id)) {
        await securityEvent(
          user.id,
          "EXECUTION_RATE_LIMITED",
          "critical",
          "Too many failed owner-secret attempts — locked for 10 minutes.",
        );
        return errorResponse(
          "Too many failed attempts. Try again in 10 minutes.",
          429,
        );
      }
      // verify secret out-of-band so failures rate-limit BEFORE any run
      const target = await getTarget(targetKey);
      if (target?.requires_owner_secret && body.ownerSecret) {
        const ok = await verifyOwnerSecret(user.id, body.ownerSecret);
        if (!ok) {
          recordSecretFailure(user.id);
          await securityEvent(
            user.id,
            "EXECUTION_OWNER_SECRET_INVALID",
            "critical",
            `Invalid owner secret for target '${targetKey}'.`,
          );
          return errorResponse("Invalid owner secret.", 403);
        }
      }
      const outcome = await executeTarget(engineDeps, {
        targetKey,
        input: body.input ?? {},
        initiatorSystem: "OWNER_PWA",
        caller: {
          userId: user.id,
          isAdmin: true,
          ownerSecret: body.ownerSecret,
          deviceFingerprint: body.deviceFingerprint ?? null,
        },
      });
      return jsonResponse(
        {
          ...outcome, // already redacted by the engine
        },
        outcome.ok ? 200 : outcome.status === "UNAUTHORIZED" ? 403 : 422,
      );
    }

    case "history": {
      const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
      const { data, error } = await db
        .from("frelux_archie_execution_runs")
        .select(
          "id,target_key,environment,status,error,http_status,attempts,duration_ms,initiator_system,authority_method,created_date",
        )
        .order("created_date", { ascending: false })
        .limit(limit);
      if (error) return errorResponse("History read failed.", 500);
      return jsonResponse({ ok: true, runs: data }, 200);
    }

    case "recover": {
      // Recovery of a terminal run (engine inventory #18).
      // Owner authority is required; the recovery engine
      // re-verifies everything and never bypasses a gate.
      const runId = String(body.runId ?? "").trim();
      if (!runId) return errorResponse("runId is required.", 400);
      const report = await recoverRun(recoveryDeps, {
        runId,
        caller: {
          userId: user.id,
          isAdmin: true,
          ownerSecret: body.ownerSecret,
          deviceFingerprint: body.deviceFingerprint ?? null,
        },
      });
      return jsonResponse(
        {
          ...report,
        },
        report.recovered || report.action === "CLOSE" ? 200 : 422,
      );
    }

    case "recovery": {
      // Recovery ledger — append-only audit history.
      const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
      const { data, error } = await db
        .from("frelux_archie_recovery_events")
        .select(
          "id,run_id,target_key,classification,action,outcome,detail,created_by,created_date",
        )
        .order("created_date", { ascending: false })
        .limit(limit);
      if (error) return errorResponse("Recovery ledger read failed.", 500);
      return jsonResponse({ ok: true, events: data }, 200);
    }

    default:
      return errorResponse(
        "Unknown action. Use: list | run | history | recover | recovery.",
        400,
      );
  }
});
