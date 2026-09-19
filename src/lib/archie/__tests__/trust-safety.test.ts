// =========================================================
// TRUST & SAFETY TESTS (batch 22, fix 76)
// Evidence is mandatory; risk is computed only from
// evidence-backed signals; high risk forces owner review.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assessTrustSafety,
  isEvidenceValid,
  riskLevelForScore,
} from "@/lib/archie/trust-safety";

const EV = {
  observed: "sent 40 identical promo messages in 10 minutes",
  source_ref: "msg_abc123",
  captured_at: "2026-09-15T09:00:00Z",
};

describe("isEvidenceValid", () => {
  it("requires observation, source ref and parseable timestamp", () => {
    expect(isEvidenceValid(EV)).toBe(true);
    expect(isEvidenceValid({ ...EV, observed: " " })).toBe(false);
    expect(isEvidenceValid({ ...EV, source_ref: "" })).toBe(false);
    expect(isEvidenceValid({ ...EV, captured_at: "not-a-date" })).toBe(false);
  });
});

describe("riskLevelForScore boundaries", () => {
  it("maps 0-100 onto the four levels at exact thresholds", () => {
    expect(riskLevelForScore(0)).toBe("LOW");
    expect(riskLevelForScore(24)).toBe("LOW");
    expect(riskLevelForScore(25)).toBe("MEDIUM");
    expect(riskLevelForScore(49)).toBe("MEDIUM");
    expect(riskLevelForScore(50)).toBe("HIGH");
    expect(riskLevelForScore(69)).toBe("HIGH");
    expect(riskLevelForScore(70)).toBe("CRITICAL");
    expect(riskLevelForScore(100)).toBe("CRITICAL");
  });
});

describe("assessTrustSafety", () => {
  it("refuses assessments with no valid evidence — never flags on confidence alone", () => {
    const r = assessTrustSafety({
      account_id: "acct_1",
      signals: ["scam_attempt"],
      evidence: [{ ...EV, source_ref: "" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot rely on confidence alone/i);
  });

  it("refuses assessments without an account identity", () => {
    const r = assessTrustSafety({
      account_id: "  ",
      signals: ["scam_attempt"],
      evidence: [EV],
    });
    expect(r.ok).toBe(false);
  });

  it("computes risk from evidence-backed signals with repeat escalation", () => {
    const r = assessTrustSafety({
      account_id: "acct_1",
      signals: ["scam_attempt", "scam_attempt"],
      evidence: [EV, { ...EV, source_ref: "msg_def456" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 30 base + 30 base + 5 escalation bump = 65 → HIGH
      expect(r.assessment.risk_score).toBe(65);
      expect(r.assessment.risk_level).toBe("HIGH");
      expect(r.assessment.detection_record.review_status).toBe(
        "PENDING_OWNER_REVIEW",
      );
      expect(r.assessment.detection_record.assessor).toBe("ARCHIE");
    }
  });

  it("caps the score at 100", () => {
    const r = assessTrustSafety({
      account_id: "acct_2",
      signals: [
        "scam_attempt",
        "malicious_link_or_file",
        "account_takeover_indicator",
        "coordinated_manipulation",
        "repeated_fraudulent_behavior",
        "impersonation",
      ],
      evidence: [EV],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.assessment.risk_score).toBeLessThanOrEqual(100);
  });

  it("marks low-risk assessments REVIEWED (no owner escalation)", () => {
    const r = assessTrustSafety({
      account_id: "acct_3",
      signals: ["spam_message_flooding"],
      evidence: [EV],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assessment.risk_score).toBe(15);
      expect(r.assessment.risk_level).toBe("LOW");
      expect(r.assessment.detection_record.review_status).toBe("REVIEWED");
    }
  });
});
