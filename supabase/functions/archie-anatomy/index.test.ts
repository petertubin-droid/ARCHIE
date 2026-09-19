// Unit tests for archie-anatomy (owner-only system anatomy).
// E2E-verified live 2026-09-15: 401 gate, owner 200.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  givenUser,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-anatomy — owner gate", () => {
  it("rejects missing authorization with 401", async () => {
    const res = await handler(req("GET", "", undefined));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/authorization/i);
  });

  it("rejects an invalid session with 401", async () => {
    givenUser(null);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/session/i);
  });

  it("rejects a non-admin with 403", async () => {
    const userId = "55555555-5555-4555-8555-555555555555";
    givenUser({ id: userId });
    givenRows("profiles", [{ id: userId, role: "user" }]);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/Owner access only/i);
  });
});

describe("archie-anatomy — owner path", () => {
  it("returns the anatomy payload for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body).toBe("object");
  });

  it("rejects PUT with 405", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("PUT", "", {}, OWNER_AUTH));
    expect(res.status).toBe(405);
  });
});
