// Unit tests for archie-infra (infrastructure cost + budget console).
// E2E-verified live 2026-09-15: 401 gate, costs + budgets 200.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-infra — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "costs" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "magic" }, OWNER_AUTH));
    expect(res.status).toBe(400);
  });

  it("returns infrastructure costs for the owner", async () => {
    givenOwnerIsAdmin();
    givenRows("frelux_infrastructure_costs", [
      { provider: "supabase", cost_usd: 25, occurred_at: "2026-09-01" },
    ]);
    const res = await handler(req("POST", "", { action: "costs" }, OWNER_AUTH));
    expect(res.status).toBe(200);
  });

  it("returns infrastructure budgets for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "budgets" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });
});
