// Unit tests for archie-legal (GDPR / governance console).
// E2E-verified live 2026-09-15: 401 gate, governance + memory_list + history 200.
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

describe("archie-legal — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "governance" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400 (never silent)", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "shred_everything" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/Unknown action/);
  });

  it("returns the governance overview for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "governance" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });

  it("lists memory records for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "memory_list" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });

  it("returns audit history for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "history", limit: 5 }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });
});
