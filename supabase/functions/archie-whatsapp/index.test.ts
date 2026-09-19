// Unit tests for archie-whatsapp (WhatsApp assistant console).
// E2E-verified live 2026-09-15: 401 gate, status action 200.
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

describe("archie-whatsapp — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "status" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", { action: "spam" }, OWNER_AUTH));
    expect(res.status).toBe(400);
  });

  it("returns assistant status for the owner", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "status" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
  });
});
