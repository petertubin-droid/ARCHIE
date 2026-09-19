// Unit tests for archie-owner-auth (owner authorization console).
// E2E-verified live 2026-09-15: 401 gate, list 200.
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

describe("archie-owner-auth — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "list" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "elevate" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("lists authorization requests for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "list", limit: 5 }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });

  it("checks the owner authorization state", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "check" }, OWNER_AUTH));
    expect(res.status).toBe(200);
  });
});
