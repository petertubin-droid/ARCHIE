// Unit tests for archie-engines (engine registry + owner toggles).
// E2E-verified live 2026-09-15: 401 gate, owner GET list 200.
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

describe("archie-engines — owner gate", () => {
  it("rejects missing authorization with 401", async () => {
    const res = await handler(req("GET", "", undefined));
    expect(res.status).toBe(401);
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
  });
});

describe("archie-engines — GET", () => {
  it("lists engine manifest + live states for the owner", async () => {
    givenOwnerIsAdmin();
    givenRows("archie_engine_states", [
      { capability_id: "paint_engine", enabled: true },
    ]);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body).toBe("object");
  });
});

describe("archie-engines — POST validation", () => {
  it("rejects invalid JSON with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...OWNER_AUTH },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing capability_id with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { enabled: true }, OWNER_AUTH));
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean enabled with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        { capability_id: "paint_engine", enabled: "yes" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown capability with an honest error", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        { capability_id: "not-a-real-engine", enabled: false },
        OWNER_AUTH,
      ),
    );
    expect([400, 404]).toContain(res.status);
  });
});
