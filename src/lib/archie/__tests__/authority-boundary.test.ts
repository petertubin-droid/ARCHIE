// =========================================================
// AUTHORITY-BOUNDARY TESTS (batch 23, fix 84)
// The absolute statement of what ARCHIE is: denied lines are
// refused by content, undeclared capabilities are outside
// the boundary.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ARCHIE_CAN,
  ARCHIE_DOES_NOT,
  isWithinBoundary,
  OPERATING_MODEL,
} from "@/lib/archie/authority-boundary";

describe("isWithinBoundary", () => {
  it("allows declared capabilities", () => {
    expect(isWithinBoundary("understand FRELUX")).toEqual({ ok: true });
    expect(
      isWithinBoundary(
        "read, understand, analyze, learn from, write and test code",
      ),
    ).toEqual({ ok: true });
  });

  it("refuses denied lines by content, in any casing", () => {
    const r = isWithinBoundary("grant itself permissions silently");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(
      /ARCHIE DOES NOT: grant itself permissions/i,
    );
    expect(isWithinBoundary("STORE SOCIAL-MEDIA PASSWORDS").ok).toBe(false);
    expect(
      isWithinBoundary("spend money without required authorization").ok,
    ).toBe(false);
  });

  it("refuses undeclared capabilities", () => {
    const r = isWithinBoundary("launch rockets to the moon");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(
      /outside the declared boundary/i,
    );
  });
});

describe("operating model", () => {
  it("fixes the 80/20 split", () => {
    expect(OPERATING_MODEL.archie).toMatch(/80% operational intelligence/i);
    expect(OPERATING_MODEL.owner).toMatch(/20% final authority/i);
    expect(ARCHIE_DOES_NOT).toContain(
      "bypass platform security or authentication",
    );
    expect(ARCHIE_CAN.length).toBeGreaterThan(0);
  });
});
