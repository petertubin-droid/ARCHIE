// =========================================================
// REMEDIATION BATCH 8 TESTS (2026-09-13, Level 5 execution)
//
// Fix 22 — compensation depth-1 guard is ENFORCED: a failed
//          compensation never spawns its own compensation.
// Fix 23 — audit chains are partitioned per kernel instance:
//          concurrent isolates no longer overwrite each
//          other's rows or trip false chain-compromise events.
// Fix 24 — owner-secret brute force is throttled before the
//          PBKDF2 comparison after 5 recent failures.
// Fix 25 — integer schemas reject non-integer numbers (3.5
//          used to pass {"type": "integer"}).
// =========================================================

import { describe, it, expect } from "vitest";
import {
  executeTarget,
  validateAgainstSchema,
  type EngineDeps,
  type ExecutionTarget,
} from "@studio-shared/archie-ai/execution/engine.ts";
import { SecurityIntegrityEngine } from "@studio-shared/archie-ai/cognitive/security-integrity.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";

// ---------------------------------------------------------
// Fix 25 — integer schema honesty
// ---------------------------------------------------------
describe("Fix 25 — integer schemas reject non-integer numbers", () => {
  it("3.5 fails an integer schema", () => {
    const { ok, errors } = validateAgainstSchema(
      { type: "integer", minimum: 0, maximum: 10 },
      3.5,
    );
    expect(ok).toBe(false);
    expect(errors[0]).toContain("expected integer");
  });

  it("4 passes an integer schema", () => {
    expect(validateAgainstSchema({ type: "integer" }, 4).ok).toBe(true);
  });

  it("3.5 still passes a NUMBER schema (legitimate coercion kept)", () => {
    expect(validateAgainstSchema({ type: "number" }, 3.5).ok).toBe(true);
  });

  it("4 still passes a NUMBER schema", () => {
    expect(validateAgainstSchema({ type: "number" }, 4).ok).toBe(true);
  });

  it("integer property inside an execution input schema is enforced", () => {
    const schema = {
      type: "object",
      required: ["qty"],
      properties: { qty: { type: "integer", minimum: 1 } },
    };
    expect(validateAgainstSchema(schema, { qty: 2.5 }).ok).toBe(false);
    expect(validateAgainstSchema(schema, { qty: 3 }).ok).toBe(true);
  });
});

// ---------------------------------------------------------
// Execution test helpers (engine = real production code)
// ---------------------------------------------------------
function makeTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    key: "test-target",
    label: "Test Target",
    description: null,
    kind: "EDGE_FUNCTION",
    function_name: "fn-a",
    endpoint: null,
    http_method: "POST",
    secret_headers: {},
    environment: "SANDBOX",
    requires_owner_secret: false,
    allowed_initiators: ["ARCHIE_CHAT"],
    input_schema: {},
    result_schema: null,
    timeout_ms: 5000,
    max_retries: 0,
    retry_backoff_ms: 10,
    idempotent: true,
    compensation_key: null,
    enabled: true,
    risk_class: "STANDARD",
    ...overrides,
  };
}

const OWNER = { userId: "user-1", isAdmin: true };

function makeDeps(
  opts: {
    targets?: Record<string, ExecutionTarget>;
    fetchImpl?: typeof fetch;
    secretFailures?: number;
    verifySecret?: (u: string, s: string) => Promise<boolean>;
  } = {},
) {
  const runs: Array<Record<string, unknown>> = [];
  const securityEvents: string[] = [];
  let idCounter = 0;
  const deps: EngineDeps = {
    getTarget: async (key) => opts.targets?.[key] ?? null,
    createRun: async (rec) => {
      const id = `run-${++idCounter}`;
      runs.push({ id, ...rec });
      return { id };
    },
    updateRun: async (id, patch) => {
      const r = runs.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
    verifyOwnerSecret: opts.verifySecret ?? (async () => true),
    ...(opts.secretFailures !== undefined
      ? {
          countRecentSecretFailures: async () => opts.secretFailures!,
        }
      : {}),
    recordSecurityEvent: async (_u, type) => {
      securityEvents.push(type);
    },
    getSecret: () => undefined,
    fetchFn:
      opts.fetchImpl ??
      (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    supabaseUrl: "https://fake.supabase.co",
    serviceRoleKey: "test-key",
    now: () => Date.now(),
    sleep: async () => {},
    log: () => {},
  };
  return { deps, runs, securityEvents };
}

// ---------------------------------------------------------
// Fix 22 — compensation depth guard
// ---------------------------------------------------------
describe("Fix 22 — compensation recursion is capped at depth 1", () => {
  it("a mutual-compensation pair terminates instead of recursing", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      // identify the target by the body we send: main runs
      // carry {name}, compensation runs carry {failed_run_id}
      const body = JSON.parse(String(init?.body ?? "{}"));
      const who = body.failed_run_id ? "comp" : String(body.name ?? "main");
      calls.push(who);
      if (who === "comp") {
        // the compensation target ALSO fails
        return new Response(
          JSON.stringify({ name: "comp", error: "still down" }),
          {
            status: 500,
          },
        );
      }
      return new Response(JSON.stringify({ name: "main", error: "down" }), {
        status: 500,
      });
      void body;
    }) as unknown as typeof fetch;

    const targetA = makeTarget({
      key: "target-a",
      function_name: "fn-a",
      max_retries: 0,
      compensation_key: "target-b",
    });
    // target B compensates back to A — the mutual trap.
    const targetB = makeTarget({
      key: "target-b",
      function_name: "fn-b",
      max_retries: 0,
      compensation_key: "target-a",
      allowed_initiators: ["ARCHIE_CHAT", "EXECUTION_ROLLBACK"],
    });
    const { deps, runs } = makeDeps({
      targets: { "target-a": targetA, "target-b": targetB },
      fetchImpl,
    });
    const outcome = await executeTarget(deps, {
      targetKey: "target-a",
      input: { name: "main" },
      initiatorSystem: "ARCHIE_CHAT",
      caller: OWNER,
    });
    expect(outcome.status).toBe("FAILED");
    // A ran once, its compensation B ran once — and B's own
    // compensation (back to A) was REFUSED at depth 1.
    expect(calls.filter((c) => c === "main").length).toBe(1);
    expect(calls.filter((c) => c === "comp").length).toBe(1);
    const compRun = runs.find((r) => r.target_key === "target-b");
    expect(compRun).toBeDefined();
    expect(compRun!.status).toBe("FAILED");
    // A's run must NOT have been marked ROLLED_BACK (B failed)
    const mainRun = runs.find((r) => r.target_key === "target-a");
    expect(mainRun!.status).toBe("FAILED");
  });
});

// ---------------------------------------------------------
// Fix 24 — owner-secret throttle
// ---------------------------------------------------------
describe("Fix 24 — owner-secret brute force is throttled", () => {
  const target = makeTarget({ requires_owner_secret: true });

  it("5 recent failures lock the target without touching the secret", async () => {
    const { deps, runs, securityEvents } = makeDeps({
      targets: { "test-target": target },
      secretFailures: 5,
      verifySecret: async () => {
        throw new Error("must not be reached");
      },
    });
    const outcome = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: { ...OWNER, ownerSecret: "a-guess" },
    });
    expect(outcome.status).toBe("POLICY_REJECTED");
    expect(outcome.error).toContain("Too many invalid");
    expect(securityEvents).toContain("EXECUTION_OWNER_SECRET_THROTTLED");
    expect(runs[0].status).toBe("REJECTED");
  });

  it("fewer than 5 failures does not throttle", async () => {
    const { deps } = makeDeps({
      targets: { "test-target": target },
      secretFailures: 2,
    });
    const outcome = await executeTarget(deps, {
      targetKey: "test-target",
      input: {},
      initiatorSystem: "ARCHIE_CHAT",
      caller: { ...OWNER, ownerSecret: "the-real-one" },
    });
    expect(outcome.ok).toBe(true);
  });
});

// ---------------------------------------------------------
// Fix 23 — per-isolate audit chains
// ---------------------------------------------------------
/** Mock that models the REAL primary key: (chain_id, seq). */
class AuditMockDb implements SupabaseLike {
  public rows: Array<Record<string, unknown>> = [];
  public securityEvents: Array<Record<string, unknown>> = [];
  from(table: string) {
    const rows = () =>
      table === "frelux_security_events" ? this.securityEvents : this.rows;
    return {
      select: (_query: string) => {
        const data = [...rows()];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({
              data: data.slice(from, to + 1),
              error: null,
            }),
        });
      },
      insert: async (row: unknown) => {
        rows().push({ ...(row as Record<string, unknown>) });
        return { error: null };
      },
      update: (patch: unknown) => ({
        eq: async (_column: string, _value: unknown) => ({
          error: { message: "not used in these tests" },
          ...((patch ?? {}) as Record<string, unknown>),
        }),
      }),
      upsert: async (row: unknown) => {
        const r = row as Record<string, unknown>;
        const list = rows();
        const idx = list.findIndex(
          (x) => x.chain_id === r.chain_id && x.seq === r.seq,
        );
        if (idx >= 0) list[idx] = r;
        else list.push(r);
        return { error: null };
      },
    };
  }
}

describe("Fix 23 — concurrent isolate chains never collide", () => {
  it("two engines write independent chains; a third hydrates cleanly", async () => {
    const db = new AuditMockDb();
    const isolateA = new SecurityIntegrityEngine(db, "chain-a");
    const isolateB = new SecurityIntegrityEngine(db, "chain-b");
    await isolateA.audit("perception", { note: "a1" });
    await isolateA.audit("learning", { note: "a2" });
    await isolateB.audit("verification", { note: "b1" });
    await isolateB.audit("creation", { note: "b2" });
    // With the old seq-only PK, isolates A and B would have
    // overwritten each other's rows (4 events → 2 survive).
    expect(db.rows.length).toBe(4);

    const fresh = new SecurityIntegrityEngine(db, "chain-c");
    const { events, chainValid } = await fresh.hydrate();
    expect(events).toBe(4);
    expect(chainValid).toBe(true);
    expect(fresh.quarantined().length).toBe(0);
  });

  it("a genuine break inside ONE chain still compromises", async () => {
    const db = new AuditMockDb();
    const iso = new SecurityIntegrityEngine(db, "chain-x");
    await iso.audit("perception", { note: "one" });
    await iso.audit("learning", { note: "two" });
    // Tamper: mutate a persisted payload (breaks its hash).
    db.rows[1].payload = { note: "TAMPERED" };
    const fresh = new SecurityIntegrityEngine(db, "chain-y");
    const { chainValid } = await fresh.hydrate();
    expect(chainValid).toBe(false);
    expect(fresh.quarantined().length).toBe(2);
    // FIX 26: the compromise critical must actually persist —
    // with the right column (`kind`) and as a SYSTEM event
    // (user_id NULL). Pre-fix, this insert was silently
    // rejected by PostgREST on both counts.
    expect(db.securityEvents.length).toBe(1);
    expect(db.securityEvents[0].kind).toBe("audit_chain_compromised");
    expect(db.securityEvents[0].severity).toBe("critical");
    expect(db.securityEvents[0].user_id).toBeNull();
  });

  it("an engine with its own persisted chain CONTINUES it on hydrate", async () => {
    const db = new AuditMockDb();
    const first = new SecurityIntegrityEngine(db, "chain-z");
    await first.audit("perception", { note: "1" });
    await first.audit("learning", { note: "2" });
    const restart = new SecurityIntegrityEngine(db, "chain-z");
    const { events, chainValid } = await restart.hydrate();
    expect(events).toBe(2);
    expect(chainValid).toBe(true);
    // The restarted engine continues seq 3 on its own chain.
    await restart.audit("verification", { note: "3" });
    expect(db.rows.filter((r) => r.chain_id === "chain-z").length).toBe(3);
    const third = db.rows.find((r) => r.seq === 3);
    expect(third).toBeDefined();
  });
});
