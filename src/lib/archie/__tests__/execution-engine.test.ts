// =========================================================
// ARCHIE EXECUTION & RUNTIME ENGINE — core unit tests
// src/lib/archie/__tests__/execution-engine.test.ts
//
// Covers the pure engine helpers and the full pipeline with an
// injected fake environment (no network, no DB): validation,
// redaction, backoff, initiator policy, authority gates,
// retries, timeouts, compensation/rollback, and audit states.
// =========================================================
import { describe, it, expect, vi } from "vitest";
import {
  validateAgainstSchema,
  redactDeep,
  computeBackoffMs,
  checkInitiatorPolicy,
  executeTarget,
  EngineDeps,
  ExecutionTarget,
} from "@studio-shared/archie-ai/execution/engine.ts";

// ---------------------------------------------------------
// Fakes
// ---------------------------------------------------------
function makeTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    key: "test-target",
    label: "Test Target",
    description: null,
    kind: "EDGE_FUNCTION",
    function_name: "fake-fn",
    endpoint: null,
    http_method: "POST",
    secret_headers: {},
    environment: "SANDBOX",
    requires_owner_secret: false,
    allowed_initiators: ["ARCHIE_CHAT", "OWNER_PWA"],
    input_schema: {},
    result_schema: null,
    timeout_ms: 5000,
    max_retries: 2,
    retry_backoff_ms: 10,
    idempotent: true,
    compensation_key: null,
    enabled: true,
    risk_class: "STANDARD",
    ...overrides,
  };
}

interface RecordedRun {
  id: string;
  status: string;
  input: unknown;
  result?: unknown;
  error?: string | null;
  attempts?: number;
  http_status?: number | null;
  result_validated?: boolean | null;
  compensation_run_id?: string | null;
  initiator_system: string;
  authority_method: string;
}

function makeDeps(opts: {
  target?: ExecutionTarget | null;
  fetchImpl?: typeof fetch;
  verifySecret?: (userId: string, secret: string) => Promise<boolean>;
  failCompensation?: boolean;
} = {}) {
  const runs: RecordedRun[] = [];
  const securityEvents: { userId: string; type: string; message: string }[] = [];
  let idCounter = 0;

  const deps: EngineDeps = {
    getTarget: async () => (opts.target === undefined ? makeTarget() : opts.target),
    createRun: async (rec) => {
      const id = `run-${++idCounter}`;
      runs.push({
        id,
        status: rec.status,
        input: rec.input,
        initiator_system: rec.initiator_system,
        authority_method: rec.authority_method,
      });
      return { id };
    },
    updateRun: async (id, patch) => {
      const r = runs.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
    verifyOwnerSecret: opts.verifySecret ?? (async () => true),
    recordSecurityEvent: async (userId, type, _sev, message) => {
      securityEvents.push({ userId, type, message });
    },
    getSecret: (name) => `env-value-for-${name}`,
    fetchFn:
      opts.fetchImpl ??
      (async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })),
    supabaseUrl: "https://fake.supabase.co",
    serviceRoleKey: "test-service-role-key",
    now: () => Date.now(),
    sleep: async () => {},
    log: () => {},
  };
  return { deps, runs, securityEvents };
}

const OWNER = { userId: "user-1", isAdmin: true };

// ---------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------
describe("redactDeep", () => {
  it("strips secret-shaped keys at every depth", () => {
    const out = redactDeep({
      ok: true,
      api_key: "abc123",
      nested: { user_token: "t", safe: "yes" },
      arr: [{ Authorization: "Bearer x", id: 7 }],
    }) as Record<string, unknown>;
    expect(out.api_key).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).user_token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).safe).toBe("yes");
    expect(((out.arr as Record<string, unknown>[])[0]).Authorization).toBe("[REDACTED]");
  });

  it("truncates very long strings and caps depth", () => {
    const long = "x".repeat(5000);
    const out = redactDeep({ long }) as Record<string, unknown>;
    expect((out.long as string).length).toBeLessThan(650);
    expect((out.long as string)).toContain("[truncated 5000]");
  });

  it("never redacts safe business keys", () => {
    const out = redactDeep({ status: "healthy", count: 3 }) as Record<string, unknown>;
    expect(out.status).toBe("healthy");
    expect(out.count).toBe(3);
  });
});

describe("validateAgainstSchema", () => {
  it("enforces type + required + additionalProperties", () => {
    const schema = {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" }, n: { type: "integer", minimum: 0 } },
    };
    expect(validateAgainstSchema(schema, { name: "a", n: 3 }).ok).toBe(true);
    const bad = validateAgainstSchema(schema, { name: 5, extra: true });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes("expected string"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("additional property"))).toBe(true);
    const missing = validateAgainstSchema(schema, {});
    expect(missing.errors.some((e) => e.includes("required"))).toBe(true);
  });

  it("handles enum, maximum, arrays and empty schema", () => {
    expect(
      validateAgainstSchema({ type: "string", enum: ["a", "b"] }, "c").ok,
    ).toBe(false);
    expect(
      validateAgainstSchema({ type: "number", maximum: 10 }, 11).ok,
    ).toBe(false);
    expect(
      validateAgainstSchema({ type: "array", minItems: 2 }, [1]).ok,
    ).toBe(false);
    expect(validateAgainstSchema(null, { anything: true }).ok).toBe(true);
    expect(validateAgainstSchema({}, { anything: true }).ok).toBe(true);
  });
});

describe("computeBackoffMs", () => {
  it("exponentially backs off and caps", () => {
    expect(computeBackoffMs(1, 500)).toBe(500);
    expect(computeBackoffMs(2, 500)).toBe(1000);
    expect(computeBackoffMs(3, 500)).toBe(2000);
    expect(computeBackoffMs(20, 500, 30_000)).toBe(30_000);
  });
});

describe("checkInitiatorPolicy", () => {
  it("rejects disabled targets and disallowed initiators", () => {
    expect(checkInitiatorPolicy(makeTarget({ enabled: false }), "ARCHIE_CHAT").ok).toBe(false);
    expect(checkInitiatorPolicy(makeTarget({ allowed_initiators: ["OWNER_PWA"] }), "ARCHIE_CHAT").ok).toBe(false);
    expect(checkInitiatorPolicy(makeTarget(), "ARCHIE_CHAT").ok).toBe(true);
  });
});

// ---------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------
describe("executeTarget pipeline", () => {
  it("runs a healthy target end-to-end with SUCCESS audit", async () => {
    const { deps, runs } = makeDeps();
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: { q: 1 },
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(true);
    expect(out.status).toBe("SUCCESS");
    expect(out.attempts).toBe(1);
    const run = runs.find((r) => r.id === out.runId);
    expect(run?.status).toBe("SUCCESS");
    expect(run?.authority_method).toBe("JWT_ADMIN");
  });

  it("rejects non-admin callers with a security event + REJECTED audit", async () => {
    const { deps, runs, securityEvents } = makeDeps();
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: { userId: "u2", isAdmin: false },
    });
    expect(out.status).toBe("UNAUTHORIZED");
    expect(securityEvents.some((e) => e.type === "EXECUTION_NON_ADMIN_ATTEMPT")).toBe(true);
    expect(runs.some((r) => r.status === "REJECTED")).toBe(true);
  });

  it("requires the owner secret for protected targets", async () => {
    const { deps } = makeDeps({ target: makeTarget({ requires_owner_secret: true }) });
    const noSecret = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "OWNER_PWA",
      caller: { userId: "u1", isAdmin: true },
    });
    expect(noSecret.status).toBe("UNAUTHORIZED");
    expect(noSecret.error).toContain("Owner Secret");

    const bad = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "OWNER_PWA",
      caller: { userId: "u1", isAdmin: true, ownerSecret: "wrong" },
    });
    // deps.verifyOwnerSecret defaults to true → proceeds past the gate
    expect(bad.status).not.toBe("UNAUTHORIZED");
  });

  it("records INVALID secret attempts as security events", async () => {
    const { deps, securityEvents } = makeDeps({
      target: makeTarget({ requires_owner_secret: true }),
      verifySecret: async () => false,
    });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "OWNER_PWA",
      caller: { userId: "u1", isAdmin: true, ownerSecret: "wrong" },
    });
    expect(out.status).toBe("UNAUTHORIZED");
    expect(securityEvents.some((e) => e.type === "EXECUTION_OWNER_SECRET_INVALID")).toBe(true);
  });

  it("rejects schema-invalid input without executing", async () => {
    const fetchSpy = vi.fn();
    const { deps } = makeDeps({
      target: makeTarget({ input_schema: { type: "object", required: ["must"], properties: { must: { type: "string" } } } }),
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: { nope: true },
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.status).toBe("INPUT_REJECTED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries idempotent targets on 5xx then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 3) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { deps, runs } = makeDeps({ fetchImpl });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(runs.find((r) => r.id === out.runId)?.status).toBe("SUCCESS");
  });

  it("does NOT retry 4xx logic errors", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
    }) as unknown as typeof fetch;
    const { deps } = makeDeps({ fetchImpl });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe("FAILED");
    expect(out.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("marks timeout when the target aborts", async () => {
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("The operation was aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as unknown as typeof fetch;
    const { deps } = makeDeps({ fetchImpl });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.status).toBe("TIMEOUT");
  });

  it("marks FAILED when the result fails result-schema validation", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ wrong: "shape" }), { status: 200 })) as unknown as typeof fetch;
    const { deps } = makeDeps({
      fetchImpl,
      target: makeTarget({ result_schema: { type: "object", required: ["status"], properties: { status: { type: "string" } } } }),
    });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe("FAILED");
    expect(out.error).toContain("schema validation");
  });

  it("rolls back via compensation when compensation succeeds", async () => {
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      // main target always 500s; compensation (undo-target) returns ok
      if (fetched === 1) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ undone: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const targets = new Map<string, ExecutionTarget>([
      ["test-target", makeTarget({ idempotent: false, compensation_key: "undo-target", max_retries: 2 })],
      ["undo-target", makeTarget({ key: "undo-target", allowed_initiators: ["EXECUTION_ROLLBACK"] })],
    ]);
    const { deps, runs } = makeDeps({ fetchImpl });
    (deps as EngineDeps & { getTarget: (k: string) => Promise<ExecutionTarget | null> }).getTarget =
      async (k: string) => targets.get(k) ?? null;
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe("ROLLED_BACK");
    expect(runs.find((r) => r.id === out.runId)?.compensation_run_id).toBeTruthy();
  });

  it("never lets secret env values into the audited result", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ echo: "done", internal_token: "supersecret", nested: { password: "hunter2" } }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const { deps, runs } = makeDeps({
      fetchImpl,
      target: makeTarget({ secret_headers: { "X-Api-Key": "MY_SECRET_ENV" } }),
    });
    const out = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.ok).toBe(true);
    const stored = JSON.stringify(runs.find((r) => r.id === out.runId)?.result);
    expect(stored).toContain("[REDACTED]");
    expect(stored).not.toContain("hunter2");
    expect(stored).not.toContain("supersecret");
  });

  it("returns NOT_FOUND for unknown targets without creating runs", async () => {
    const { deps, runs } = makeDeps({ target: null });
    const out = await executeTarget(deps, {
      targetKey: "ghost",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(out.status).toBe("NOT_FOUND");
    expect(runs.length).toBe(0);
  });
});
