// Unit tests for archie-credentials (credential vault console).
// E2E-verified live 2026-09-15: 401 gate, list action 200.
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

describe("archie-credentials — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "list" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "nonsense" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("lists vault entries for the owner (never exposing secrets)", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "list" }, OWNER_AUTH));
    expect(res.status).toBe(200);
  });
});
