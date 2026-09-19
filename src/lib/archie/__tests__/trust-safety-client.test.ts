// =========================================================
// TRUST-SAFETY-CLIENT TESTS (batch 27, fix 119)
// Persistence for the trust/safety records: events and
// pauses store real evidence; owner review is applied by the
// owner's session; isAccountPaused fails OPEN on transport
// errors (persistent enforcement stays with RLS/CHECK bounds);
// empty account id never blocks a marketplace write.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

import {
  applyOwnerReview,
  assertNotPaused,
  fetchAccountPauses,
  fetchTrustSafetyEvents,
  isAccountPaused,
  persistAccountPause,
  persistTrustSafetyEvent,
  recordAccountAppeal,
} from "@/lib/archie/trust-safety-client";
import { isPauseActive } from "@/lib/archie/account-pause";
import type { TrustSafetyAssessment } from "@/lib/archie/trust-safety";

beforeEach(() => fromMock.mockReset());

const q = (opts: {
  rows?: unknown[] | null;
  err?: { message: string } | null;
  capture?: (u: Record<string, unknown>) => void;
}) => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = (u: Record<string, unknown>) => {
    opts.capture?.(u);
    return chain;
  };
  chain.update = (u: Record<string, unknown>) => {
    opts.capture?.(u);
    return chain;
  };
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () =>
    Promise.resolve({ data: opts.rows ?? null, error: opts.err ?? null });
  chain.maybeSingle = () =>
    Promise.resolve({
      data: opts.err ? null : { id: "row-1" },
      error: opts.err ?? null,
    });
  return chain;
};

const ASSESSMENT: TrustSafetyAssessment = {
  account_id: "acct1",
  signals: ["scam_attempt", "coordinated_manipulation"],
  evidence: [
    {
      observed: "scam dm",
      source_ref: "m1",
      captured_at: "2026-09-15T00:00:00Z",
    },
  ],
  risk_score: 8.4,
  risk_level: "HIGH",
  detection_record: {
    account_identity: "acct1",
    detected_behaviors: ["scam_attempt"],
    evidence: [
      {
        observed: "scam dm",
        source_ref: "m1",
        captured_at: "2026-09-15T00:00:00Z",
      },
    ],
    risk_level: "HIGH",
    risk_score: 8.4,
    assessed_at: "2026-09-15T00:00:00Z",
    assessor: "ARCHIE",
    review_status: "REVIEWED",
  },
};

describe("events", () => {
  it("persists an assessment with its real evidence and returns the row id", async () => {
    const inserted: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(inserted, u) }),
    );
    const r = await persistTrustSafetyEvent(ASSESSMENT);
    expect(r).toEqual({ ok: true, id: "row-1" });
    expect(fromMock.mock.calls[0][0]).toBe("frelux_trust_safety_events");
    expect(inserted.risk_level).toBe("HIGH");
    expect(inserted.evidence).toHaveLength(1);
  });

  it("returns honest errors and maps fetched rows into assessments", async () => {
    fromMock.mockImplementationOnce(() =>
      q({ err: { message: "rls denied" } }),
    );
    expect(await persistTrustSafetyEvent(ASSESSMENT)).toEqual({
      ok: false,
      error: "rls denied",
    });
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [
          {
            account_id: "acct1",
            signals: ["scam_attempt"],
            evidence: [],
            risk_score: 5,
            risk_level: "MEDIUM",
            created_date: "2026-09-15T01:00:00Z",
          },
        ],
      }),
    );
    const events = await fetchTrustSafetyEvents("acct1");
    expect(events[0].account_id).toBe("acct1");
    expect(events[0].risk_score).toBe(5);
  });
});

describe("pauses", () => {
  const PAUSE = {
    id: "p1",
    account_identity: "acct1",
    reason: "coordinated scam",
    evidence: ASSESSMENT.evidence,
    detected_behaviors: ASSESSMENT.signals,
    risk_level: "HIGH" as const,
    risk_score: 8.4,
    paused_at: "2026-09-15T00:00:00Z",
    expires_at: "2026-09-18T00:00:00Z",
    archie_decision:
      "TEMPORARY PAUSE (authorized, pending Owner review)" as const,
    review_status: "PENDING_OWNER_REVIEW" as const,
    final_owner_decision: "PENDING" as const,
    notification: {
      owner_notified_at: "2026-09-15T00:00:00Z",
      account_notified: true as const,
      appeal_available: true as const,
      appeal_to: "OWNER" as const,
    },
  };

  it("persists a pause with all review fields", async () => {
    const inserted: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(inserted, u) }),
    );
    const r = await persistAccountPause(PAUSE);
    expect(r.ok).toBe(true);
    expect(inserted.expires_at).toBe("2026-09-18T00:00:00Z");
    expect(inserted.review_status).toBe("PENDING_OWNER_REVIEW");
  });

  it("maps fetched rows back into complete pause records with honest defaults", async () => {
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [
          {
            id: "p1",
            account_id: "acct1",
            reason: "scam",
            evidence: [],
            detected_behaviors: [],
            risk_level: "HIGH",
            risk_score: 9,
            paused_at: "2026-09-15T00:00:00Z",
            expires_at: "2026-09-16T00:00:00Z",
            review_status: "REVIEWED",
            final_owner_decision: "REINSTATE",
            created_date: "2026-09-15T00:00:00Z",
          },
        ],
      }),
    );
    const pauses = await fetchAccountPauses("acct1");
    expect(pauses[0].final_owner_decision).toBe("REINSTATE");
    expect(pauses[0].notification.appeal_to).toBe("OWNER");
    expect(isPauseActive(pauses[0]).stage).toBe("REINSTATED");
  });

  it("applies owner review as a real decision transition, and records appeals to the Owner", async () => {
    const updated: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated, u) }),
    );
    const r = await applyOwnerReview("p1", "RESTRICT");
    expect(r.ok).toBe(true);
    expect(updated.review_status).toBe("REVIEWED");
    expect(updated.final_owner_decision).toBe("RESTRICT");

    const appealUpdate: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(appealUpdate, u) }),
    );
    expect(await recordAccountAppeal("p1", "")).toMatchObject({ ok: false });
    const ok = await recordAccountAppeal("p1", "I was framed");
    expect(ok.ok).toBe(true);
    expect(appealUpdate.appeal_text).toBe("I was framed");
    expect(appealUpdate.review_status).toBe("PENDING_OWNER_REVIEW");
  });
});

describe("enforcement gate", () => {
  it("is paused while an active pause exists, not after expiry", async () => {
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [
          {
            id: "p1",
            account_id: "acct1",
            reason: "scam",
            evidence: [],
            detected_behaviors: [],
            risk_level: "HIGH",
            risk_score: 9,
            paused_at: "2026-09-15T00:00:00Z",
            expires_at: "2999-01-01T00:00:00Z",
            review_status: "PENDING_OWNER_REVIEW",
            final_owner_decision: "PENDING",
          },
        ],
      }),
    );
    expect(await isAccountPaused("acct1")).toBe(true);
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [
          {
            id: "p2",
            account_id: "acct1",
            reason: "scam",
            evidence: [],
            detected_behaviors: [],
            risk_level: "HIGH",
            risk_score: 9,
            paused_at: "2026-09-15T00:00:00Z",
            expires_at: "2026-09-15T01:00:00Z",
            review_status: "REVIEWED",
            final_owner_decision: "REINSTATE",
          },
        ],
      }),
    );
    expect(await isAccountPaused("acct1")).toBe(false);
  });

  it("fails OPEN on transport errors (RLS/CHECK bounds keep persistent enforcement)", async () => {
    const boom = q({ rows: [] });
    boom.limit = () => Promise.reject(new Error("network down"));
    fromMock.mockImplementationOnce(() => boom);
    expect(await isAccountPaused("acct1")).toBe(false);
  });

  it("never blocks an empty account id and blocks a paused account with the appeal path", async () => {
    expect(await assertNotPaused("")).toEqual({ ok: true });
    fromMock.mockImplementationOnce(() =>
      q({
        rows: [
          {
            id: "p1",
            account_id: "acct1",
            reason: "scam",
            evidence: [],
            detected_behaviors: [],
            risk_level: "HIGH",
            risk_score: 9,
            paused_at: "2026-09-15T00:00:00Z",
            expires_at: "2999-01-01T00:00:00Z",
            review_status: "PENDING_OWNER_REVIEW",
            final_owner_decision: "PENDING",
          },
        ],
      }),
    );
    const r = await assertNotPaused("acct1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/appeal/i);
  });
});
