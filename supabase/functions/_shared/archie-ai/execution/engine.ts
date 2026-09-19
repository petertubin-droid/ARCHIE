// =========================================================
// FRELUX ARCHIE — EXECUTION & RUNTIME ENGINE (SHARED CORE)
// supabase/functions/_shared/archie-ai/execution/engine.ts
//
// THE EXECUTION LAYER. Connects ARCHIE's intelligence to real,
// authorized backend execution:
//
//   ARCHIE INTELLIGENCE
//     → REASON        (initiator decides a target + input)
//     → VERIFY        (schema validation of input)
//     → AUTHORITY     (admin JWT +, for protected targets,
//                      server-verified Owner Secret)
//     → EXECUTION     (edge function / API call, timeout,
//                      retries with backoff)
//     → RESULT VERIFY (schema validation of the response)
//     → MEMORY        (immutable audit run record)
//
// HARD RULES:
//   * Only targets registered in frelux_archie_execution_targets
//     (enabled=true) can ever run. There is no code execution
//     path for unverified or unregistered "code".
//   * Secrets NEVER appear in results, run records, logs or
//     errors: redactDeep() strips anything secret-shaped, and
//     secret env values are only attached to outbound requests
//     inside the server-side invoke step.
//   * Production targets require the Owner Secret, verified
//     server-side with PBKDF2 + constant-time compare. The
//     plaintext secret is never stored or logged.
//   * Every attempt is audited: PENDING → RUNNING → terminal
//     (SUCCESS | FAILED | TIMEOUT | ROLLED_BACK | REJECTED).
//   * Retries happen ONLY for idempotent targets and only for
//     network/5xx/429 failures — never for 4xx logic errors.
//   * Rollback: a target may declare a compensation_key; on
//     terminal failure the compensation target runs with the
//     failed run's reference. If compensation succeeds, the run
//     is marked ROLLED_BACK. Compensation is itself an audited
//     execution (recursion depth 1, no further compensation).
//
// This engine does NOT replace or bypass any existing ARCHIE
// system: it is the single, audited path those systems use to
// reach real backend execution. It runs under Owner Authority
// (admin JWT) in every calling system: ARCHIE PWA, Coding
// Studio, FRELUX, archie-chat (non-production only) and
// future ARCHIE systems.
// =========================================================

// ---------------------------------------------------------
// 1. Types
// ---------------------------------------------------------
export type ExecutionEnvironment = "SANDBOX" | "STAGING" | "PRODUCTION";
export type TargetKind = "EDGE_FUNCTION" | "HTTP_API";

export interface ExecutionTarget {
  key: string;
  label: string;
  description?: string | null;
  kind: TargetKind;
  /** Edge function name (kind=EDGE_FUNCTION). */
  function_name?: string | null;
  /** Absolute URL (kind=HTTP_API). */
  endpoint?: string | null;
  http_method: string;
  /** header name → ENV var name. Values stay server-side. */
  secret_headers: Record<string, string>;
  environment: ExecutionEnvironment;
  requires_owner_secret: boolean;
  allowed_initiators: string[];
  input_schema: Record<string, unknown>;
  result_schema?: Record<string, unknown> | null;
  timeout_ms: number;
  max_retries: number;
  retry_backoff_ms: number;
  idempotent: boolean;
  /** Target key to invoke (rollback) when this run terminally fails. */
  compensation_key?: string | null;
  enabled: boolean;
  risk_class?: string | null;
}

export type RunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "ROLLED_BACK"
  | "REJECTED";

export interface CallerAuthority {
  userId: string;
  isAdmin: boolean;
  /** Owner Secret — required only for protected targets. */
  ownerSecret?: string;
  deviceFingerprint?: string | null;
}

export interface RunOutcome {
  ok: boolean;
  runId?: string;
  status:
    | RunStatus
    | "NOT_FOUND"
    | "POLICY_REJECTED"
    | "INPUT_REJECTED"
    | "UNAUTHORIZED";
  error?: string;
  /** Redacted, schema-validated result payload. */
  result?: unknown;
  attempts?: number;
  duration_ms?: number;
}

// ---------------------------------------------------------
// 2. Injectable dependencies (Deno + vitest compatible)
// ---------------------------------------------------------
export interface EngineDeps {
  getTarget(key: string): Promise<ExecutionTarget | null>;
  createRun(rec: {
    target_key: string;
    environment: ExecutionEnvironment;
    status: RunStatus;
    input: unknown;
    initiator_system: string;
    initiated_by: string | null;
    device_fingerprint: string | null;
    authority_method: string;
  }): Promise<{ id: string }>;
  updateRun(
    id: string,
    patch: Partial<{
      status: RunStatus;
      result: unknown;
      error: string | null;
      http_status: number | null;
      result_validated: boolean | null;
      attempts: number;
      duration_ms: number;
      compensation_run_id: string | null;
    }>,
  ): Promise<void>;
  /** Server-side verification of the Owner Secret. */
  verifyOwnerSecret(userId: string, secret: string): Promise<boolean>;
  /** FIX 24 (remediation batch 8): how many invalid owner-
   *  secret attempts this user logged recently — used to
   *  throttle brute force before the PBKDF2 comparison. */
  countRecentSecretFailures?(userId: string): Promise<number>;
  recordSecurityEvent(
    userId: string,
    type: string,
    severity: "info" | "warning" | "critical",
    message: string,
  ): Promise<void>;
  /** Reads env values; only used to attach outbound headers. */
  getSecret(name: string): string | undefined;
  /** Performs the actual HTTP request (injectable for tests). */
  fetchFn: typeof fetch;
  /** Supabase project URL (edge-function target base). */
  supabaseUrl: string;
  /** Service role key — server-side only, attached to outbound
   *  edge-function invocations; never logged or returned. */
  serviceRoleKey: string;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

// ---------------------------------------------------------
// 3. Pure helpers (unit-tested)
// ---------------------------------------------------------
const SECRET_KEY_RE =
  /(secret|token|password|passwd|credential|authorization|api[-_]?key|private)/i;
const MAX_STRING = 600;

/** Deep-redact secret-shaped keys + truncate long strings. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? value.slice(0, MAX_STRING) + `…[truncated ${value.length}]`
      : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redactDeep(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

const TYPE_ORDER = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "integer",
  "null",
];

/**
 * Minimal, dependency-free JSON-Schema-Lite validation.
 * Supports: type, required, properties, enum, minimum/maximum,
 * minItems, additionalProperties:false.
 */
export function validateAgainstSchema(
  schema: Record<string, unknown> | null | undefined,
  input: unknown,
): { ok: boolean; errors: string[] } {
  if (!schema || Object.keys(schema).length === 0)
    return { ok: true, errors: [] };
  const errors: string[] = [];
  walk(schema, input, "$", errors);
  return { ok: errors.length === 0, errors };

  function walk(
    s: Record<string, unknown>,
    v: unknown,
    path: string,
    errs: string[],
  ): void {
    if (typeof s.type === "string") {
      const t = s.type;
      let actual = Array.isArray(v)
        ? "array"
        : v === null
          ? "null"
          : typeof v === "number"
            ? Number.isInteger(v)
              ? "integer"
              : "number"
            : typeof v;
      if (t === "number" && actual === "integer") actual = "number";
      // FIX 25 (remediation batch 8, Level 5 execution audit
      // 2026-09-13): the type-coercion exception was written
      // backwards — schema type "integer" ACCEPTED non-integer
      // numbers (3.5 passed an integer input/result schema).
      // The only legitimate coercion is the reverse: an
      // integral value under a "number" schema.
      if (actual !== t && !(t === "number" && actual === "integer")) {
        errs.push(`${path}: expected ${t}, got ${actual}`);
        return;
      }
    }
    if (Array.isArray(s.enum) && !s.enum.some((e) => e === v)) {
      errs.push(`${path}: value not in enum [${s.enum.join(", ")}]`);
    }
    if (
      typeof s.minimum === "number" &&
      typeof v === "number" &&
      v < s.minimum
    ) {
      errs.push(`${path}: ${v} < minimum ${s.minimum}`);
    }
    if (
      typeof s.maximum === "number" &&
      typeof v === "number" &&
      v > s.maximum
    ) {
      errs.push(`${path}: ${v} > maximum ${s.maximum}`);
    }
    if (
      s.type === "object" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const obj = v as Record<string, unknown>;
      for (const req of (s.required as string[] | undefined) ?? []) {
        if (!(req in obj))
          errs.push(`${path}.${req}: required property missing`);
      }
      const props = (s.properties as Record<string, unknown> | undefined) ?? {};
      for (const [k, child] of Object.entries(props)) {
        if (k in obj && obj[k] !== undefined) {
          walk(child as Record<string, unknown>, obj[k], `${path}.${k}`, errs);
        }
      }
      if (s.additionalProperties === false) {
        for (const k of Object.keys(obj)) {
          if (!(k in props))
            errs.push(`${path}.${k}: additional property not allowed`);
        }
      }
    }
    if (s.type === "array" && Array.isArray(v)) {
      if (typeof s.minItems === "number" && v.length < s.minItems) {
        errs.push(`${path}: needs at least ${s.minItems} items`);
      }
      if (s.items && typeof s.items === "object") {
        v.forEach((item, i) =>
          walk(s.items as Record<string, unknown>, item, `${path}[${i}]`, errs),
        );
      }
    }
  }
}

/** Exponential backoff with a cap; attempt is 1-based. */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  capMs = 30_000,
): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(baseMs * 2 ** (n - 1), capMs);
}

/** Initiator policy gate — is this calling system allowed at all? */
export function checkInitiatorPolicy(
  target: ExecutionTarget,
  initiatorSystem: string,
): { ok: boolean; reason?: string } {
  if (!target.enabled) return { ok: false, reason: "target is disabled" };
  if (!target.allowed_initiators?.includes(initiatorSystem)) {
    return {
      ok: false,
      reason: `initiator '${initiatorSystem}' not allowed for this target`,
    };
  }
  return { ok: true };
}

/** Retriable failures: network errors, 5xx, 429 — never 4xx. */
function isRetriable(status: number | null): boolean {
  if (status === null) return true; // network/timeout class
  return status >= 500 || status === 429;
}

// ---------------------------------------------------------
// 4. The execution pipeline
// ---------------------------------------------------------
export async function executeTarget(
  deps: EngineDeps,
  req: {
    targetKey: string;
    input: unknown;
    initiatorSystem: string;
    caller: CallerAuthority;
  },
  /** FIX 22 (remediation batch 8, Level 5 execution audit
   *  2026-09-13): compensation was DOCUMENTED as "recursion
   *  depth 1, no further compensation" but never enforced —
   *  two targets compensating each other would recurse
   *  without bound. Internal guard: a compensation execution
   *  may never spawn its own compensation. */
  depth = 0,
): Promise<RunOutcome> {
  const started = deps.now();

  // --- REASON/VERIFY: target must exist ---
  const target = await deps.getTarget(req.targetKey);
  if (!target) {
    return {
      ok: false,
      status: "NOT_FOUND",
      error: `Unknown execution target: ${req.targetKey}`,
    };
  }

  // --- policy gate ---
  const policy = checkInitiatorPolicy(target, req.initiatorSystem);
  if (!policy.ok) {
    await auditRejected(deps, target, req, policy.reason ?? "policy rejected");
    return { ok: false, status: "POLICY_REJECTED", error: policy.reason };
  }

  // --- AUTHORITY: admin JWT required always ---
  if (!req.caller.isAdmin) {
    await deps.recordSecurityEvent(
      req.caller.userId ?? "anonymous",
      "EXECUTION_NON_ADMIN_ATTEMPT",
      "critical",
      `Non-admin attempted to execute target '${req.targetKey}'.`,
    );
    await auditRejected(deps, target, req, "non-admin caller");
    return {
      ok: false,
      status: "UNAUTHORIZED",
      error: "Owner authority required.",
    };
  }

  // --- AUTHORITY: owner secret for protected targets ---
  let authorityMethod = "JWT_ADMIN";
  if (target.requires_owner_secret) {
    // FIX 24: brute-force throttle. Invalid owner-secret
    // attempts were recorded as critical security events but
    // never limited — an attacker could keep guessing with
    // only log lines to show for it. Five recent failures
    // (deps-defined window) lock the target behind a
    // POLICY_REJECTED with an explicit reason.
    if (deps.countRecentSecretFailures) {
      const recent = await deps.countRecentSecretFailures(req.caller.userId);
      if (recent >= 5) {
        await deps.recordSecurityEvent(
          req.caller.userId,
          "EXECUTION_OWNER_SECRET_THROTTLED",
          "critical",
          `Owner-secret attempts exhausted for target '${req.targetKey}' — ${recent} recent failures. Throttled without verification.`,
        );
        await auditRejected(
          deps,
          target,
          req,
          "owner secret attempts exhausted — throttled",
        );
        return {
          ok: false,
          status: "POLICY_REJECTED",
          error:
            "Too many invalid owner-secret attempts — wait before trying again.",
        };
      }
    }
    const secret = (req.caller.ownerSecret ?? "").trim();
    if (!secret) {
      await auditRejected(
        deps,
        target,
        req,
        "owner secret required but not provided",
      );
      return {
        ok: false,
        status: "UNAUTHORIZED",
        error: "This target requires the Owner Secret.",
      };
    }
    const ok = await deps.verifyOwnerSecret(req.caller.userId, secret);
    if (!ok) {
      await deps.recordSecurityEvent(
        req.caller.userId,
        "EXECUTION_OWNER_SECRET_INVALID",
        "critical",
        `Invalid owner secret supplied for target '${req.targetKey}'.`,
      );
      await auditRejected(deps, target, req, "invalid owner secret");
      return {
        ok: false,
        status: "UNAUTHORIZED",
        error: "Invalid owner secret.",
      };
    }
    authorityMethod = "JWT_ADMIN_OWNER_SECRET";
  }

  // --- VERIFY: input schema ---
  const inputCheck = validateAgainstSchema(target.input_schema, req.input);
  if (!inputCheck.ok) {
    await auditRejected(
      deps,
      target,
      req,
      `input rejected: ${inputCheck.errors.join("; ")}`,
    );
    return {
      ok: false,
      status: "INPUT_REJECTED",
      error: `Input failed validation: ${inputCheck.errors.slice(0, 10).join("; ")}`,
    };
  }

  // --- MEMORY: audit run created BEFORE execution ---
  const run = await deps.createRun({
    target_key: target.key,
    environment: target.environment,
    status: "PENDING",
    input: redactDeep(req.input),
    initiator_system: req.initiatorSystem,
    initiated_by: req.caller.userId,
    device_fingerprint: req.caller.deviceFingerprint ?? null,
    authority_method: authorityMethod,
  });
  await deps.updateRun(run.id, { status: "RUNNING" });

  // --- EXECUTION: attempts with timeout + bounded retries ---
  let attempts = 0;
  let lastStatus: number | null = null;
  let lastError = "";
  let lastBody: unknown = null;
  const maxAttempts = 1 + (target.idempotent ? target.max_retries : 0);

  while (attempts < maxAttempts) {
    attempts += 1;
    const ac = new AbortController();
    const timer = setTimeout(
      () => ac.abort(),
      Math.max(1000, target.timeout_ms),
    );
    try {
      const url =
        target.kind === "EDGE_FUNCTION"
          ? `${deps.supabaseUrl}/functions/v1/${target.function_name}`
          : (target.endpoint ?? "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (target.kind === "EDGE_FUNCTION") {
        headers["Authorization"] = `Bearer ${deps.serviceRoleKey}`;
      }
      for (const [h, envName] of Object.entries(target.secret_headers ?? {})) {
        const v = deps.getSecret(envName);
        if (v) headers[h] = v; // server-side only; never logged
      }
      const res = await deps.fetchFn(url, {
        method: target.http_method,
        headers,
        body:
          target.http_method === "GET" || target.http_method === "DELETE"
            ? undefined
            : JSON.stringify(req.input ?? {}),
        signal: ac.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      const text = await res.text();
      try {
        lastBody = text ? JSON.parse(text) : null;
      } catch {
        lastBody = { raw: text.slice(0, 500) };
      }
      if (res.ok) break;
      lastError = `HTTP ${res.status} from target`;
      if (!isRetriable(res.status)) break; // 4xx: logic error, no retry
    } catch (err) {
      clearTimeout(timer);
      lastStatus = null;
      const msg = err instanceof Error ? err.message : String(err);
      lastError = /abort/i.test(msg)
        ? `timeout after ${target.timeout_ms}ms`
        : msg;
      // timeouts & network errors are retriable for idempotent targets
    }
    if (attempts < maxAttempts) {
      await deps.sleep(computeBackoffMs(attempts, target.retry_backoff_ms));
    }
  }

  const duration_ms = deps.now() - started;

  // --- TIMEOUT / FAILED terminal handling ---
  const succeeded =
    lastStatus !== null && lastStatus >= 200 && lastStatus < 300;
  const timedOut = !succeeded && /timeout/.test(lastError);

  // --- RESULT VERIFY ---
  let result_validated: boolean | null = null;
  if (succeeded) {
    const rc = validateAgainstSchema(target.result_schema ?? null, lastBody);
    result_validated = rc.ok;
    if (!rc.ok) {
      lastError = `Result failed schema validation: ${rc.errors.slice(0, 10).join("; ")}`;
    }
  }

  const finalStatus: RunStatus =
    succeeded && result_validated !== false
      ? "SUCCESS"
      : timedOut
        ? "TIMEOUT"
        : "FAILED";

  // --- ROLLBACK (compensation), depth 1 ---
  let compensationRunId: string | null = null;
  if (finalStatus !== "SUCCESS" && target.compensation_key) {
    if (depth >= 1) {
      deps.log(
        `compensation target '${target.key}' also failed; depth-1 limit reached — no further compensation. ` +
          `Owner attention required.`,
      );
    } else
      try {
        const comp = await executeTarget(
          deps,
          {
            targetKey: target.compensation_key,
            input: {
              failed_run_id: run.id,
              target_key: target.key,
              original_input: redactDeep(req.input),
            },
            initiatorSystem: "EXECUTION_ROLLBACK",
            caller: req.caller, // authority carries over; comp targets declare their own gates
          },
          depth + 1,
        );
        compensationRunId = comp.runId ?? null;
        if (comp.ok) {
          await deps.updateRun(run.id, {
            status: "ROLLED_BACK",
            error: `${lastError} (rolled back via ${target.compensation_key})`,
            http_status: lastStatus,
            attempts,
            duration_ms,
            compensation_run_id: compensationRunId,
          });
          return {
            ok: false,
            runId: run.id,
            status: "ROLLED_BACK",
            error: lastError,
            attempts,
            duration_ms,
          };
        }
      } catch (compErr) {
        deps.log(`compensation failed for run ${run.id}: ${String(compErr)}`);
      }
  }

  // --- MEMORY: terminal audit update ---
  await deps.updateRun(run.id, {
    status: finalStatus,
    result: succeeded ? redactDeep(lastBody) : null,
    error: finalStatus === "SUCCESS" ? null : lastError || "execution failed",
    http_status: lastStatus,
    result_validated,
    attempts,
    duration_ms,
    compensation_run_id: compensationRunId,
  });

  if (finalStatus !== "SUCCESS") {
    return {
      ok: false,
      runId: run.id,
      status: finalStatus,
      error: lastError || "execution failed",
      attempts,
      duration_ms,
    };
  }
  return {
    ok: true,
    runId: run.id,
    status: "SUCCESS",
    result: redactDeep(lastBody),
    attempts,
    duration_ms,
  };

  // --- helpers ---
  async function auditRejected(
    d: EngineDeps,
    t: ExecutionTarget,
    r: {
      targetKey: string;
      input: unknown;
      initiatorSystem: string;
      caller: CallerAuthority;
    },
    reason: string,
  ): Promise<void> {
    try {
      const rec = await d.createRun({
        target_key: t.key,
        environment: t.environment,
        status: "REJECTED",
        input: redactDeep(r.input),
        initiator_system: r.initiatorSystem,
        initiated_by: r.caller.userId,
        device_fingerprint: r.caller.deviceFingerprint ?? null,
        authority_method: r.caller.isAdmin ? "JWT_ADMIN" : "NONE",
      });
      await d.updateRun(rec.id, {
        status: "REJECTED",
        error: reason.slice(0, 500),
        attempts: 0,
        duration_ms: 0,
      });
    } catch (e) {
      d.log(`audit-rejected failed: ${String(e)}`);
    }
  }
}

/** Sanity re-export: TYPE_ORDER keeps the type list auditable. */
export const EXECUTION_TYPE_ORDER = TYPE_ORDER;
