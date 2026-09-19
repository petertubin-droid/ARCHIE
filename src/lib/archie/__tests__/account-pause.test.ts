// =========================================================
// ACCOUNT-PAUSE TESTS (batch 26, fix 113)
// ARCHIE may open only an evidence-backed temporary pause
// (never the Owner), hard-bounded at 72h; expiry reinstates
// pending owner review; the Owner alone adjudicates.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  isPauseActive,
  MAX_SUSPENSION_HOURS,
  ownerReview,
  PAUSE_WORKFLOW,
  proposeAccountPause,
  recordAppeal,
  riskAssessment,
  type AccountPauseRecord,
} from "@/lib/archie/account-pause";
import type {
  TrustSafetyEvidence,
  TrustSafetySignal,
} from "@/lib/archie/trust-safety";

const SIGNALS: TrustSafetySignal[] = [
  "scam_attempt",
  "coordinated_manipulation",
  "repeated_fraudulent_behavior",
  "fraudulent_contractor_supplier_profile",
];
const EVIDENCE: TrustSafetyEvidence[] = SIGNALS.map((s, i) => ({
  observed: `observed ${s}`,
  source_ref: `ref_${i}`,
  captured_at: "2026-09-15T10:00:00Z",
}));

const NOW = "2026-09-15T12:00:00Z";

describe("proposeAccountPause — the temporary-pause contract", () => {
  it("can never pause the Owner, and requires a stated reason", () => {
    expect(
      proposeAccountPause({
        account_id: "owner",
        is_owner_account: true,
        reason: "testing",
        signals: SIGNALS,
        evidence: EVIDENCE,
      }).ok,
    ).toBe(false);
    expect(
      proposeAccountPause({
        account_id: "a1",
        is_owner_account: false,
        reason: " ",
        signals: SIGNALS,
        evidence: EVIDENCE,
      }).ok,
    ).toBe(false);
  });

  it("refuses pauses below the HIGH/CRITICAL evidence-backed threshold", () => {
    const r = proposeAccountPause({
      account_id: "a1",
      is_owner_account: false,
      reason: "spammy vibes",
      signals: ["spam_message_flooding"],
      evidence: [{ observed: "flood", source_ref: "m1", captured_at: NOW }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/does not meet the pause threshold/i);
  });

  it("opens a bounded, notified, appealable pause pending owner review", () => {
    const r = proposeAccountPause({
      account_id: "a1",
      is_owner_account: false,
      reason: "coordinated scam operation",
      signals: SIGNALS,
      evidence: EVIDENCE,
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = r.pause;
      expect(p.review_status).toBe("PENDING_OWNER_REVIEW");
      expect(p.final_owner_decision).toBe("PENDING");
      expect(p.paused_at).toBe(NOW);
      expect(p.expires_at).toBe("2026-09-18T12:00:00.000Z"); // 72h hard bound
      expect(p.notification.appeal_available).toBe(true);
      expect(p.notification.appeal_to).toBe("OWNER");
      expect(p.archie_decision).toMatch(/TEMPORARY PAUSE/);
    }
    expect(MAX_SUSPENSION_HOURS).toBe(72);
    expect(PAUSE_WORKFLOW).toContain("OWNER REVIEW");
  });
});

describe("isPauseActive — pauses are temporary, never extended by ARCHIE", () => {
  const base = (): AccountPauseRecord => {
    const r = proposeAccountPause({
      account_id: "a1",
      is_owner_account: false,
      reason: "scam",
      signals: SIGNALS,
      evidence: EVIDENCE,
      now: NOW,
    });
    return (r as { pause: AccountPauseRecord }).pause;
  };

  it("holds during the bounded window and expires after it", () => {
    const p = base();
    expect(isPauseActive(p, "2026-09-16T00:00:00Z")).toEqual({
      active: true,
      stage: "PAUSED",
    });
    expect(isPauseActive(p, "2026-09-19T12:00:01Z")).toEqual({
      active: false,
      stage: "EXPIRED",
    });
  });

  it("maps the owner's final decision to its stage (RESTRICT keeps access closed)", () => {
    const reinstated = ownerReview(base(), "REINSTATE", "OWNER", NOW) as {
      pause: AccountPauseRecord;
    };
    expect(isPauseActive(reinstated.pause)).toEqual({
      active: false,
      stage: "REINSTATED",
    });
    const restricted = ownerReview(base(), "RESTRICT", "OWNER", NOW) as {
      pause: AccountPauseRecord;
    };
    expect(isPauseActive(restricted.pause)).toEqual({
      active: true,
      stage: "RESTRICTED",
    });
    const terminated = ownerReview(base(), "TERMINATE", "OWNER", NOW) as {
      pause: AccountPauseRecord;
    };
    expect(isPauseActive(terminated.pause).stage).toBe("TERMINATED");
  });
});

describe("appeal and owner review — separation of powers", () => {
  it("records the appeal to the Owner without adjudicating it", () => {
    const r = proposeAccountPause({
      account_id: "a1",
      is_owner_account: false,
      reason: "scam",
      signals: SIGNALS,
      evidence: EVIDENCE,
      now: NOW,
    });
    const p = (r as { pause: AccountPauseRecord }).pause;
    expect(recordAppeal(p, "")).toMatchObject({ ok: false });
    const appealed = recordAppeal(p, "I was framed");
    expect(appealed.ok).toBe(true);
    expect(appealed.pause!.review_status).toBe("PENDING_OWNER_REVIEW"); // still the Owner's call
  });

  it("refuses ARCHIE adjudicating its own enforcement", () => {
    const r = proposeAccountPause({
      account_id: "a1",
      is_owner_account: false,
      reason: "scam",
      signals: SIGNALS,
      evidence: EVIDENCE,
      now: NOW,
    });
    const p = (r as { pause: AccountPauseRecord }).pause;
    expect(ownerReview(p, "TERMINATE", "ARCHIE").ok).toBe(false);
    const ok = ownerReview(p, "REINSTATE", "OWNER", NOW);
    expect(ok.ok).toBe(true);
    expect(ok.pause!.owner_reviewed_at).toBe(NOW);
  });

  it("exposes the risk assessment record before any pause decision", () => {
    const a = riskAssessment({
      account_id: "a1",
      signals: SIGNALS,
      evidence: EVIDENCE,
      now: NOW,
    });
    expect(a.ok).toBe(true);
    expect(["HIGH", "CRITICAL"]).toContain(a.assessment!.risk_level);
  });
});
