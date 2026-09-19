// =========================================================
// OPERATING-MODEL TESTS (batch 24, fix 96)
// The 80/20 responsibility split: owner-reserved patterns
// match FIRST; a both-autonomous-and-protected operation is
// always protected; no override, no privilege decay.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  areasRequireOwner,
  AUTONOMOUS_OPERATIONS,
  classifyOperation,
  OPERATING_MODEL,
  OWNER_RESERVED_OPERATIONS,
} from "@/lib/archie/operating-model";

describe("classifyOperation", () => {
  it("protects owner-reserved operations with the right gate", () => {
    expect(classifyOperation("deploy to production")).toMatchObject({
      verdict: "OWNER_APPROVAL_REQUIRED",
      gate: "p3-change-pipeline",
    });
    expect(
      classifyOperation("change the deterministic math formula"),
    ).toMatchObject({
      verdict: "OWNER_APPROVAL_REQUIRED",
      gate: "p3-change-pipeline",
    });
    expect(classifyOperation("rotate the api key")).toMatchObject({
      verdict: "OWNER_APPROVAL_REQUIRED",
      gate: "owner-auth (server-side)",
    });
    expect(
      classifyOperation("promote this insight to global knowledge"),
    ).toMatchObject({
      verdict: "OWNER_APPROVAL_REQUIRED",
      gate: "governance promotion",
    });
    expect(classifyOperation("wipe the database")).toMatchObject({
      verdict: "OWNER_APPROVAL_REQUIRED",
    });
  });

  it("treats an operation that is both autonomous and protected as protected", () => {
    const r = classifyOperation("deployment analysis");
    expect(r.verdict).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("lets ARCHIE act autonomously on the 80% list", () => {
    for (const op of AUTONOMOUS_OPERATIONS.slice(0, 5)) {
      const r = classifyOperation(op);
      expect(r.verdict).toBe("ARCHIE_MAY_ACT");
      expect(r.gate).toBe("none (autonomous operation)");
    }
  });

  it("allows unknown-but-unprotected operations within standard guards", () => {
    const r = classifyOperation("summarize today's leads");
    expect(r.verdict).toBe("ARCHIE_MAY_ACT");
    expect(r.rationale).toMatch(/standard guards/i);
  });
});

describe("areasRequireOwner", () => {
  it("maps P3 change areas onto the owner gate", () => {
    expect(areasRequireOwner(["ui polish"])).toBe(false);
    expect(areasRequireOwner(["production code changes"])).toBe(true);
    expect(areasRequireOwner(["credentials and secrets"])).toBe(true);
  });
});

describe("the stated model", () => {
  it("documents the no-bypass invariants", () => {
    expect(OPERATING_MODEL.archie_never_bypasses_owner_gate).toBe(true);
    expect(OPERATING_MODEL.archie_cannot_self_approve).toBe(true);
    expect(OPERATING_MODEL.learned_knowledge_is_not_authoritative).toBe(true);
    expect(OWNER_RESERVED_OPERATIONS).toContain(
      "irreversible or high-impact actions",
    );
  });
});
