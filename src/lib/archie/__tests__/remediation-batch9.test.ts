import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { table } from "@studio-shared/archie-ai/tables.ts";

/**
 * Remediation batch 9 — Level 6 (security/authority layer) findings,
 * fixes 26-29 (2026-09-13).
 *
 * Fixes 26 (partially — the chain-compromise persistence half is
 * asserted behaviorally in remediation-batch8.test.ts), 27, 28 and 29
 * live in Supabase edge functions and migrations, which the vitest
 * suite cannot import (Deno runtime). These tests pin the source
 * contracts the same way domain-capture.test.ts pins the engine core:
 * if a future edit reintroduces a dark writer, a missing gateway
 * header, an FK-violating fallback or an isolate-local-only throttle,
 * the corresponding test fails here.
 */

const ROOT = process.cwd();

function edge(name: string): string {
  return readFileSync(join(ROOT, "supabase/functions", name), "utf8");
}

function shared(name: string): string {
  return readFileSync(
    join(ROOT, "supabase/functions/_shared/archie-ai", name),
    "utf8",
  );
}

function migration(name: string): string {
  const p = join(ROOT, "supabase/migrations", name);
  expect(existsSync(p), `migration ${name} must exist`).toBe(true);
  return readFileSync(p, "utf8");
}

describe("fix 26 — frelux_security_events split-brain (dark writers)", () => {
  it("archie-execute writes the `kind` column, never `event_type`", () => {
    const src = edge("archie-execute/index.ts");
    expect(src).toContain('from("frelux_security_events").insert');
    expect(src).toMatch(/kind:\s*type/);
    expect(src).not.toMatch(/event_type:\s*type/);
    // the brute-force throttle (fix 24) counts the real column
    expect(src).toContain('.eq("kind", "EXECUTION_OWNER_SECRET_INVALID")');
    expect(src).not.toContain('.eq("event_type"');
  });

  it("archie-chat's recordSecurityEvent writes `kind`", () => {
    const src = edge("archie-chat/index.ts");
    // the helper body (not the audit_events table, which legitimately
    // uses event_type)
    expect(src).toMatch(
      /recordSecurityEvent: async \(userId, type, severity, message\)/,
    );
    const helper = src.slice(
      src.indexOf(
        "recordSecurityEvent: async (userId, type, severity, message)",
      ),
      src.indexOf("getSecret: (name)"),
    );
    expect(helper).toContain('from("frelux_security_events").insert');
    expect(helper).toMatch(/kind:\s*type/);
    expect(helper).not.toMatch(/event_type:/);
  });

  it("the audit-chain-compromise critical persists as a SYSTEM event", () => {
    const src = shared("cognitive/security-integrity.ts");
    const fn = src.slice(src.indexOf("recordChainCompromise"));
    // Audit #4 (2026-09-13): physical table names are resolved
    // through the tables.ts indirection, not hardcoded here.
    // The contract is two-sided: the call site uses the
    // LOGICAL name, and the indirection resolves it to the
    // frelux_security_events physical table.
    expect(fn).toContain('from(table("security_events")).insert');
    expect(fn).toContain("user_id: null");
    expect(fn).toMatch(/kind:\s*"audit_chain_compromised"/);
    expect(fn).not.toMatch(/event_type:/);
    // Behavioral half of the contract: the indirection resolves
    // the logical name to the physical frelux_security_events
    // table with the default prefix.
    expect(table("security_events")).toBe("frelux_security_events");
  });

  it("migration 20260913030000 makes user_id nullable for SYSTEM events", () => {
    const sql = migration("20260913030000_security_events_system_rows.sql");
    expect(sql).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(sql).toContain("frelux_security_events");
  });
});

describe("fix 27 — gateway-required apikey header on raw REST fetches", () => {
  it("archie-crypto's service() sends apikey + bearer", () => {
    const src = edge("archie-crypto/index.ts");
    const svc = src.slice(
      src.indexOf("async function service<T>"),
      src.indexOf("serveWithCors(async"),
    );
    expect(svc).toContain("apikey: SERVICE_ROLE");
    expect(svc).toContain("Authorization: `Bearer ${SERVICE_ROLE}`");
  });

  it("archie-agents' service() sends apikey + bearer", () => {
    const src = edge("archie-agents/index.ts");
    const svc = src.slice(
      src.indexOf("async function service<T>"),
      src.indexOf("serveWithCors(async"),
    );
    expect(svc).toContain("apikey: SERVICE_ROLE");
    expect(svc).toContain("Authorization: `Bearer ${SERVICE_ROLE}`");
  });
});

describe("fix 28 — FK-violating UNKNOWN_OWNER fallback", () => {
  it("recordAudit persists SYSTEM events instead of a fake user id", () => {
    const src = shared("security/api-credential-store.ts");
    const fn = src.slice(
      src.indexOf("async recordAudit(event: ApiAuditEvent)"),
    );
    expect(fn).toContain("UNKNOWN_OWNER ? null");
    // the sentinel is still attributed to the real owner when one exists
    expect(fn).toContain("resolveOwnerId()");
  });

  it("archie-credentials passes the sentinel instead of hand-rolling a uuid", () => {
    const src = edge("archie-credentials/index.ts");
    expect(src).toContain("ownerId: UNKNOWN_OWNER");
    expect(src).not.toContain('"00000000-0000-0000-0000-000000000000"');
  });
});

describe("fix 29 — durable cross-isolate owner-auth throttle", () => {
  const OWNER_AUTH = "archie-owner-auth/index.ts";

  it("a DB-backed windowed throttle exists and is used by both secret gates", () => {
    const src = edge(OWNER_AUTH);
    expect(src).toContain("async function dbThrottleHit");
    // both secret-verified actions call it before the PBKDF2 compare
    const authorizeChange = src.slice(
      src.indexOf('case "authorize-change"'),
      src.indexOf('case "record-rollback"'),
    );
    const recordRollback = src.slice(
      src.indexOf('case "record-rollback"'),
      src.indexOf('case "list"'),
    );
    expect(authorizeChange).toContain("dbThrottleHit(userId)");
    expect(recordRollback).toContain("dbThrottleHit(userId)");
  });

  it("the throttle counts OWNER_AUTH_FAILED in a 15-minute window and fails open", () => {
    const src = edge(OWNER_AUTH);
    const fn = src.slice(
      src.indexOf("async function dbThrottleCount"),
      src.indexOf("const DB_THROTTLE_ATTEMPTS"),
    );
    expect(fn).toContain("kind=eq.OWNER_AUTH_FAILED");
    expect(fn).toContain("created_date=gte.");
    expect(fn).toMatch(/if \(error\) return 0;/);
    // 15-minute window
    expect(src).toContain("15 * 60 * 1000");
  });

  it("the rollback rate-limit path records its critical event", () => {
    const src = edge(OWNER_AUTH);
    const recordRollback = src.slice(
      src.indexOf('case "record-rollback"'),
      src.indexOf('case "list"'),
    );
    expect(recordRollback).toContain("RATE_LIMIT_HIT");
    expect(recordRollback).toContain("OWNER_AUTH_THROTTLED");
  });
});
