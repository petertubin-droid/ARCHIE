// Unit tests for the archie-status edge function.
//
// archie-status is the owner-only system telemetry endpoint. The
// E2E probes of 2026-09-15 verified its live behaviour against
// production; these tests pin the contract in CI:
//
//   * owner gate: 401 unauthenticated, 403 non-admin
//   * owner path returns the telemetry JSON
//   * OPTIONS preflight handled at the CORS boundary (204)

import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  givenUser,
  req,
  OWNER_AUTH,
  OWNER_ID,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-status — owner gate", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("GET", "", undefined));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/Unauthorized/i);
  });

  it("rejects an invalid JWT with 401", async () => {
    givenUser(null);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin with 403", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    givenUser({ id: userId, email: "visitor@test.local" });
    givenRows("profiles", [{ id: userId, role: "user" }]);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(403);
  });
});

describe("archie-status — owner path", () => {
  it("returns telemetry for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    // status reports engine/uptime facts as JSON — assert it is a
    // structured payload, not a bare string
    expect(typeof body).toBe("object");
    expect(body.error).toBeUndefined();
  });

  it("surfaces the knowledge repository fail-safe (Phase 5)", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    // KNOWLEDGE_* secrets are absent in CI, so the repository
    // reports NOT_CONFIGURED honestly — the endpoint must NOT
    // 500, and the block must be present (never fabricated OK).
    const kr = body.status.knowledge_repository;
    expect(kr).toBeDefined();
    expect(kr.state).toBe("NOT_CONFIGURED");
    expect(String(kr.note)).not.toContain("service_role");
  });
});

describe("archie-status — CORS boundary", () => {
  it("answers OPTIONS preflights with 204 at the boundary", async () => {
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "OPTIONS",
        headers: {
          Origin: "https://freluxtools.netlify.app",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://freluxtools.netlify.app",
    );
  });

  it("does not leak CORS to an unlisted origin", async () => {
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
