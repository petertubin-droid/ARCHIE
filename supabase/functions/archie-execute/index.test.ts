// Unit tests for archie-execute (audited execution engine console).
// E2E-verified live 2026-09-15: 401 gate; list/history/recovery actions.
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

describe("archie-execute — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "list" }));
    expect(res.status).toBe(401);
  });

  it("rejects unknown actions with an honest 400 listing valid actions", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "nope" }, OWNER_AUTH));
    expect(res.status).toBe(400);
    const err = (await json(res)).error;
    expect(err).toMatch(/list \| run \| history \| recover/);
  });

  it("lists execution runs for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "list", limit: 5 }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });

  it("returns execution history for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "history", limit: 5 }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toHaveProperty("runs");
  });
});
