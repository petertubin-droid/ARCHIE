// Unit tests for archie-extract (construction extraction + ARCHIE
// training ingestion). The contributor gate is BY DESIGN: only an
// active (non-OBSERVER) contributor profile may feed training data.
// Admins bypass it by role; ordinary users must hold an active
// contributor profile — observation alone is never training.
// E2E-verified live 2026-09-15: honest 403 without a contributor.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenUser,
  givenRows,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

const USER_ID = "11111111-1111-4111-8111-111111111111";

function givenNonAdminUser() {
  givenUser({ id: USER_ID });
  givenRows("profiles", [{ id: USER_ID, role: "user" }]);
}

describe("archie-extract — contributor gate", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { text: "hello" }));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin without a contributor profile — training integrity", async () => {
    givenNonAdminUser();
    // no contributor fixture → gate must hold
    const res = await handler(
      req(
        "POST",
        "",
        {
          input_type: "text",
          domain: "construction",
          text: "Lekki site needs 40 bags of cement.",
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/contributor/i);
  });

  it("rejects an OBSERVER contributor — observation is not training", async () => {
    givenNonAdminUser();
    givenRows("frelux_archie_contributors", [
      { user_id: USER_ID, active: true, role: "OBSERVER" },
    ]);
    const res = await handler(
      req(
        "POST",
        "",
        { input_type: "text", domain: "construction", text: "test" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/contributor/i);
  });

  it("rejects an inactive contributor — deactivation must revoke training", async () => {
    givenNonAdminUser();
    givenRows("frelux_archie_contributors", [
      { user_id: USER_ID, active: false, role: "CONTRIBUTOR" },
    ]);
    const res = await handler(
      req(
        "POST",
        "",
        { input_type: "text", domain: "construction", text: "test" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(403);
  });
});
