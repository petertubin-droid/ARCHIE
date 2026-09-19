// =========================================================
// CONTRIBUTORS TESTS (batch 28, fix 122)
// Contributor permissions are enforced, not cosmetic:
// OBSERVER may never submit; DOMAIN_CONTRIBUTOR is scope-
// isolated; only ARCHIE_ADMIN may review/approve/reject;
// every non-admin submission is reviewed.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  canManageIngestion,
  canSubmitDomain,
  canSubmitInput,
  isTerminalState,
  requiresReview,
} from "@/lib/archie/contributors";
import type { ArchieContributor } from "@/lib/archie/types";

const ADMIN: ArchieContributor = {
  user_id: "u1",
  display_name: "Admin",
  role: "ARCHIE_ADMIN",
  allowed_domains: ["construction"],
  must_review: false,
  active: true,
};
const CONTRIBUTOR: ArchieContributor = {
  user_id: "u2",
  display_name: "Domi",
  role: "DOMAIN_CONTRIBUTOR",
  allowed_domains: ["construction"],
  must_review: true,
  active: true,
};
const OBSERVER: ArchieContributor = {
  user_id: "u3",
  display_name: "Looker",
  role: "OBSERVER",
  allowed_domains: [],
  must_review: true,
  active: true,
};

describe("canSubmitInput", () => {
  it("lets admins submit every modality and blocks everything for OBSERVER", () => {
    expect(canSubmitInput(ADMIN, "SOURCE_CODE").ok).toBe(true);
    expect(canSubmitInput(ADMIN, "WEB_INTELLIGENCE").ok).toBe(true);
    expect(canSubmitInput(OBSERVER, "TEXT").ok).toBe(false);
    expect(canSubmitInput(CONTRIBUTOR, "SOURCE_CODE").ok).toBe(false); // code is admin-only
    expect(canSubmitInput(CONTRIBUTOR, "ENGINEERING_DRAWING").ok).toBe(true);
  });

  it("refuses inactive contributors outright", () => {
    expect(canSubmitInput({ ...ADMIN, active: false }, "TEXT").ok).toBe(false);
  });
});

describe("canSubmitDomain — scope isolation", () => {
  it("binds DOMAIN_CONTRIBUTORs to their allowed domains; admins span the registry", () => {
    expect(canSubmitDomain(CONTRIBUTOR, "construction").ok).toBe(true);
    expect(canSubmitDomain(CONTRIBUTOR, "cybersecurity").ok).toBe(false);
    expect(canSubmitDomain(ADMIN, "cybersecurity").ok).toBe(true);
  });
});

describe("requiresReview", () => {
  it("reviews every non-admin; admin review follows must_review", () => {
    expect(requiresReview(CONTRIBUTOR)).toBe(true);
    expect(requiresReview(OBSERVER)).toBe(true);
    expect(requiresReview(ADMIN)).toBe(false);
    expect(requiresReview({ ...ADMIN, must_review: true })).toBe(true);
  });
});

describe("canManageIngestion", () => {
  it("restricts REVIEW/APPROVE/REJECT to active ARCHIE_ADMINs", () => {
    expect(canManageIngestion(CONTRIBUTOR, "CREATE").ok).toBe(true);
    expect(canManageIngestion(CONTRIBUTOR, "APPROVE").ok).toBe(false);
    expect(canManageIngestion(ADMIN, "REJECT").ok).toBe(true);
    expect(canManageIngestion({ ...ADMIN, active: false }, "REVIEW").ok).toBe(
      false,
    );
  });
});

describe("isTerminalState", () => {
  it("ends the pipeline at APPROVED/REJECTED", () => {
    expect(isTerminalState("APPROVED")).toBe(true);
    expect(isTerminalState("REJECTED")).toBe(true);
    expect(isTerminalState("AWAITING_APPROVAL")).toBe(false);
  });
});
