// Unit tests for archie-agent-worker (internal execution target).
// E2E-verified live 2026-09-15: internal-only — rejects even
// authenticated owner calls; only the audited engine may invoke it.
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

describe("archie-agent-worker — internal-only boundary", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { agent_id: "x", run_id: "y" }));
    expect(res.status).toBe(401);
  });

  it("rejects even the owner — internal execution target only", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { agent_id: "a1", run_id: "r1" }, OWNER_AUTH),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await json(res);
    expect(JSON.stringify(body)).toMatch(/internal execution target/i);
  });
});
