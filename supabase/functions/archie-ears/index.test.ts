// Unit tests for archie-ears (voice transcription).
// E2E-verified live 2026-09-15: 401 gate, honest validation.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  req,
  OWNER_AUTH,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-ears — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", {}));
    expect(res.status).toBe(401);
  });

  it("validates honestly rather than crashing on empty input", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", {}, OWNER_AUTH));
    expect(res.status).toBeLessThan(500);
  });
});
