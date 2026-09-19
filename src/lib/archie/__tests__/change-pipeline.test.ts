// =========================================================
// CHANGE-PIPELINE TESTS (batch 24, fix 90)
// REQUEST→APPLY advances one step at a time with mandatory
// evidence per stage; REVIEW is human-only; OWNER gates
// authorization and application.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  advanceChange,
  CHANGE_AUTHORITY,
  CHANGE_STAGES,
  classifyRisk,
  createChangeRequest,
  mayArchieAuthorize,
  type ChangeRequest,
} from "@/lib/archie/change-pipeline";

describe("createChangeRequest", () => {
  it("requires a title and starts at REQUEST", () => {
    expect(() =>
      createChangeRequest({ title: " ", areas: [], created_by: "ARCHIE" }),
    ).toThrow(/requires a title/i);
    const cr = createChangeRequest({
      title: "Fix paint math",
      areas: ["ui"],
      created_by: "ARCHIE",
    });
    expect(cr.stage).toBe("REQUEST");
    expect(cr.requires_engineering_review).toBe(false);
  });

  it("flags deterministic/structural/safety areas for engineering review", () => {
    const cr = createChangeRequest({
      title: "Adjust formula",
      areas: ["deterministic-math"],
      created_by: "ARCHIE",
    });
    expect(cr.requires_engineering_review).toBe(true);
    expect(cr.flags).toContain("ENGINEERING_REVIEW_REQUIRED");
  });
});

function atStage(
  stage: ChangeRequest["stage"],
  over: Partial<ChangeRequest> = {},
): ChangeRequest {
  return {
    id: "cr1",
    title: "T",
    areas: ["ui"],
    created_by: "ARCHIE",
    created_at: "2026-09-15T00:00:00Z",
    stage,
    requires_engineering_review: false,
    flags: [],
    ...over,
  };
}

describe("advanceChange", () => {
  it("rejects skipping stages", () => {
    const r = advanceChange(atStage("REQUEST"), "PLAN", "ARCHIE", {
      plan: "p",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/one step at a time/i);
  });

  it("requires written evidence for each work stage", () => {
    expect(advanceChange(atStage("REQUEST"), "UNDERSTAND", "ARCHIE").ok).toBe(
      false,
    );
    expect(advanceChange(atStage("UNDERSTAND"), "PLAN", "ARCHIE").ok).toBe(
      false,
    );
    const ok = advanceChange(atStage("REQUEST"), "UNDERSTAND", "ARCHIE", {
      understanding_summary: "The paint calculator mis-rounds",
    });
    expect(ok.ok).toBe(true);
  });

  it("REVIEW cannot be signed by ARCHIE", () => {
    const r = advanceChange(atStage("TEST"), "REVIEW", "ARCHIE", {
      review_signoff_by: "ARCHIE",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ARCHIE cannot sign/i);
  });

  it("forces engineer/owner sign-off for engineering-gated changes", () => {
    const eng = atStage("TEST", { requires_engineering_review: true });
    const contributor = advanceChange(eng, "REVIEW", "CONTRIBUTOR", {
      review_signoff_by: "CONTRIBUTOR",
    });
    expect(contributor.ok).toBe(false);
    const engineer = advanceChange(eng, "REVIEW", "ENGINEER", {
      review_signoff_by: "ENGINEER",
    });
    expect(engineer.ok).toBe(true);
  });

  it("OWNER_AUTHORIZATION is owner-only and requires review + rollback plan", () => {
    const pre = atStage("REVIEW", { review_signoff_by: "ENGINEER" });
    expect(
      advanceChange(pre, "OWNER_AUTHORIZATION", "ARCHIE", {
        rollback_plan: "r",
      }).ok,
    ).toBe(false);
    const noReview = advanceChange(
      atStage("REVIEW"),
      "OWNER_AUTHORIZATION",
      "OWNER",
      { rollback_plan: "r" },
    );
    expect(noReview.ok).toBe(false);
    const noRollback = advanceChange(pre, "OWNER_AUTHORIZATION", "OWNER");
    expect(noRollback.ok).toBe(false);
    const ok = advanceChange(pre, "OWNER_AUTHORIZATION", "OWNER", {
      rollback_plan: "git revert",
    });
    expect(ok.ok).toBe(true);
  });

  it("APPLY is owner-only and requires rollback plan + test evidence", () => {
    const ready = atStage("OWNER_AUTHORIZATION", {
      review_signoff_by: "ENGINEER",
      rollback_plan: "git revert",
    });
    expect(advanceChange(ready, "APPLY", "ARCHIE").ok).toBe(false);
    const noTests = advanceChange(ready, "APPLY", "OWNER");
    expect(noTests.ok).toBe(false);
    const ok = advanceChange(ready, "APPLY", "OWNER", {});
    // test evidence must be recorded on the change itself
    const withTests = advanceChange(
      atStage("OWNER_AUTHORIZATION", {
        review_signoff_by: "ENGINEER",
        rollback_plan: "git revert",
        test_evidence: "vitest 2200 green",
      }),
      "APPLY",
      "OWNER",
    );
    expect(withTests.ok).toBe(true);
    if (withTests.ok) expect(withTests.change.flags).toContain("OWNER_APPLIED");
    expect(ok.ok).toBe(false);
  });

  it("allows rejection from any stage", () => {
    const r = advanceChange(atStage("PLAN"), "REJECTED", "ARCHIE");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.change.stage).toBe("REJECTED");
  });
});

describe("authority model", () => {
  it("keeps ARCHIE out of authorization and application", () => {
    expect(mayArchieAuthorize()).toBe(false);
    expect(CHANGE_AUTHORITY.owner_is_final_gate).toBe(true);
    expect(CHANGE_STAGES).toContain("OWNER_AUTHORIZATION");
  });

  it("classifies risk from protected capabilities, not just areas", () => {
    const r = classifyRisk(["ui"], ["painting:coverage"]);
    expect(r.requires_engineering_review).toBe(true);
    expect(r.reasons).toHaveLength(1);
  });
});
