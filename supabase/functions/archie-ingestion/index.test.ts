// Unit tests for archie-ingestion (data ingestion pipeline).
// E2E-verified live 2026-09-15: 401/403 gates, honest 400 validation.
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

describe("archie-ingestion — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", {}));
    expect(res.status).toBe(401);
  });

  it("does not accept GET (405 method honesty)", async () => {
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(405);
  });

  it("validates the body honestly (400, never a silent noop)", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("POST", "", {}, OWNER_AUTH));
    expect(res.status).toBe(400);
    const body = await json(res);
    // honest structured rejection — never a silent noop
    expect(body.accepted === false || body.error || body.message).toBeTruthy();
  });
});
