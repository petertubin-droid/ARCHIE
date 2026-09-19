// =========================================================
// DEVELOPMENT-WORKFLOW TESTS (batch 25, fix 98)
// ARCHIE may READ→…→PROPOSE across all dev domains; only the
// Owner moves past ARCHIE PROPOSES. Everything ARCHIE writes
// is a proposal.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  developmentAction,
  DEVELOPMENT_CAPABILITY,
  DEVELOPMENT_DOMAINS,
  DEV_STAGES,
  nextProductionStage,
  PRODUCTION_WORKFLOW,
} from "@/lib/archie/development-workflow";

describe("developmentAction", () => {
  it("always yields proposals through the fixed production gate", () => {
    const r = developmentAction("build a paint calculator screen");
    expect(r.archie_may).toEqual([...DEV_STAGES]);
    expect(r.output).toBe("proposal");
    expect(r.gate).toContain("ARCHIE PROPOSES");
    expect(r.gate).toContain("DEPLOY");
  });

  it("lists web/pwa/mobile/backend domains and the honest may/may-not split", () => {
    expect(DEVELOPMENT_DOMAINS).toContain("pwa");
    expect(DEVELOPMENT_DOMAINS).toContain("ios");
    expect(DEVELOPMENT_CAPABILITY.may_generate).toContain("tests");
    expect(DEVELOPMENT_CAPABILITY.may_not).toContain(
      "independently apply protected production changes",
    );
  });
});

describe("nextProductionStage", () => {
  it("advances presentation to OWNER REVIEWS automatically", () => {
    expect(nextProductionStage("ARCHIE PROPOSES", "ARCHIE")).toEqual({
      ok: true,
      next: "OWNER REVIEWS",
    });
  });

  it("refuses ARCHIE past the gate — only the Owner advances", () => {
    const r = nextProductionStage("OWNER REVIEWS", "ARCHIE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Only the Owner advances/i);
    expect(nextProductionStage("OWNER REVIEWS", "OWNER")).toEqual({
      ok: true,
      next: "OWNER AUTHORIZES",
    });
  });

  it("rejects unknown stages and completion past DEPLOY", () => {
    expect(nextProductionStage("NOT_A_STAGE", "OWNER").ok).toBe(false);
    expect(nextProductionStage("DEPLOY", "OWNER").ok).toBe(false);
    expect(PRODUCTION_WORKFLOW).toHaveLength(8);
  });
});
