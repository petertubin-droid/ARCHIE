// Unit tests for archie-family (family assistant console).
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

describe("archie-family — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "list" }));
    expect(res.status).toBe(401);
    expect(
      (await json(res)).error ?? (await Promise.resolve("")).toString(),
    ).toBeTruthy();
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "party" }, OWNER_AUTH));
    expect(res.status).toBe(400);
  });

  it("lists family members for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "list" }, OWNER_AUTH));
    expect(res.status).toBe(200);
  });
});
