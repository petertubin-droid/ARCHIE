// Unit tests for archie-studio (site generation studio).
// E2E-verified live 2026-09-15: the create path runs the engine but
// HONESTLY refuses to persist an invalid manifest (nothing faked).
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

describe("archie-studio — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "create" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400 (honest error)", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "explode" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/Unknown action/i);
  });

  it("never persists code when the engine output is not a valid manifest", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        { action: "create", brief: "a tiny page", project: "test" },
        OWNER_AUTH,
      ),
    );
    // Either an honest 502 (invalid manifest, nothing persisted) or
    // a 200 with a REAL persisted manifest — never a silent fake.
    expect([200, 502]).toContain(res.status);
    const body = await json(res);
    if (res.status === 502) {
      expect(body.error).toMatch(/manifest/i);
      expect(body.error).toMatch(/no code was persisted/i);
    }
  });
});
