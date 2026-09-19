// Unit tests for archie-social-connect (social brand center).
// E2E-verified live 2026-09-15: owner/admin gate (403), route-based
// API, honest platform validation.
import { describe, it, expect } from "vitest";
import { givenUser, givenRows, req } from "../_shared/testing/harness.ts";
import "./index.ts";
import { getHandler } from "../_shared/testing/harness.ts";

const handler = getHandler();

const OWNER = { Authorization: "Bearer owner-jwt" };

describe("archie-social-connect — gate + routes", () => {
  it("rejects unauthenticated callers with 403 (owner/admin only)", async () => {
    const res = await handler(req("GET", "/authorize", undefined));
    expect(res.status).toBe(403);
  });

  it("rejects POST to the root with unknown-route honesty", async () => {
    givenUser({ id: "11111111-1111-4111-8111-111111111111" });
    givenRows("profiles", [
      { id: "11111111-1111-4111-8111-111111111111", role: "admin" },
    ]);
    const res = await handler(req("POST", "", { platform: "x" }, OWNER));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown route/i);
  });

  it("rejects authorize for an unconfigured platform — never guesses", async () => {
    givenUser({ id: "11111111-1111-4111-8111-111111111111" });
    givenRows("profiles", [
      { id: "11111111-1111-4111-8111-111111111111", role: "admin" },
    ]);
    const res = await handler(req("GET", "/authorize", undefined, OWNER));
    expect([400, 404]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown platform/i);
  });
});
