// Unit tests for archie-agents (agent orchestration + budget gates).
// E2E-verified live 2026-09-15: 401 gate, budget_status 200.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-agents — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "budget_status" }));
    expect(res.status).toBe(401);
  });

  it("rejects a non-JSON body with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "POST",
        headers: { "Content-Type": "text/plain", ...OWNER_AUTH },
        body: "hello",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "conquer" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("returns budget status for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "budget_status" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });
});
