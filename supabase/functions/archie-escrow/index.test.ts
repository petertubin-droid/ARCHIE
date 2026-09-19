// Unit tests for archie-escrow (§23 Stage B workflow enforcement).
//
// The REAL handler runs against the harness's chainable fake:
// every authorized path AND every denial is exercised, with the
// append-only events ledger asserted for both.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenRows,
  givenUser,
  json,
  req,
  tableFixtures,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const CONTRACTOR_ID = "33333333-3333-4333-8333-333333333333";
const OUTSIDER_ID = "44444444-4444-4444-8444-444444444444";
const TXN = "txn-0001";
const MS = "ms-0001";

const CLIENT_AUTH = { Authorization: "Bearer client-jwt" };
const CONTRACTOR_AUTH = { Authorization: "Bearer contractor-jwt" };
const OUTSIDER_AUTH = { Authorization: "Bearer outsider-jwt" };
const OWNER_AUTH = { Authorization: "Bearer owner-jwt" };

function givenUserWithRole(id: string, role: string) {
  givenUser({ id });
  givenRows("profiles", [{ id, role }]);
}

function givenTransaction(overrides: Record<string, unknown> = {}) {
  givenRows("frelux_escrow_events", []);
  givenRows("frelux_escrow_transactions", [
    {
      id: TXN,
      client_id: CLIENT_ID,
      contractor_user_id: CONTRACTOR_ID,
      contractor_name: "Test Contractor Ltd",
      project_title: "Duplex build",
      total_amount_kobo: 200_000,
      status: "ACTIVE",
      terms: { acceptance_window_days: 7, funding_window_days: 3 },
      ...overrides,
    },
  ]);
}

function givenMilestone(overrides: Record<string, unknown> = {}) {
  givenRows("frelux_escrow_milestones", [
    {
      id: MS,
      transaction_id: TXN,
      sequence: 1,
      title: "Foundation",
      deliverables: ["Setting out"],
      amount_kobo: 100_000,
      status: "PENDING",
      ...overrides,
    },
  ]);
}

/** rows logged for this transaction (denials included). */
function events() {
  return tableFixtures.get("frelux_escrow_events") ?? [];
}

describe("archie-escrow — gate + validation", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "create_transaction" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with 400", async () => {
    givenUserWithRole(CLIENT_ID, "user");
    const res = await handler(
      req("POST", "", { action: "nope" }, CLIENT_AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-party with 403 and records the denial in the ledger", async () => {
    givenUserWithRole(OUTSIDER_ID, "user");
    givenTransaction();
    givenMilestone();
    const res = await handler(
      req("POST", "", { action: "accept_milestone", transaction_id: TXN, milestone_id: MS }, OUTSIDER_AUTH),
    );
    expect(res.status).toBe(403);
    const denied = events().find((e) => e.result === "denied");
    expect(denied).toBeTruthy();
  });
});

describe("archie-escrow — create_transaction", () => {
  it("creates a DRAFT transaction with the scheduled milestones", async () => {
    givenUserWithRole(CLIENT_ID, "user");
    givenRows("frelux_escrow_events", []);
    givenRows("frelux_escrow_transactions", []);
    givenRows("frelux_escrow_milestones", []);
    const res = await handler(
      req("POST", "", {
        action: "create_transaction",
        project_title: "Bungalow",
        contractor_name: "Ada & Sons",
        contractor_user_id: CONTRACTOR_ID,
        total_amount_kobo: 300_000,
        milestones: [
          { title: "Foundation", deliverables: ["Setting out"], amount_kobo: 100_000 },
          { title: "Roofing", deliverables: ["Trusses"], amount_kobo: 200_000 },
        ],
        terms: { acceptance_window_days: 5, funding_window_days: 2 },
      }, CLIENT_AUTH),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.transaction_id).toBeTruthy();

    const txns = tableFixtures.get("frelux_escrow_transactions") ?? [];
    const created = txns.find((t) => t.id === body.transaction_id);
    expect(created?.status).toBe("DRAFT");
    expect(created?.client_id).toBe(CLIENT_ID);
    expect(created?.terms.acceptance_window_days).toBe(5);

    const milestones = tableFixtures.get("frelux_escrow_milestones") ?? [];
    expect(milestones.length).toBe(2);
    expect(milestones.every((m) => m.status === "PENDING")).toBe(true);

    const logged = events();
    expect(logged.length).toBe(1);
    expect(logged[0].action).toBe("create_transaction");
    expect(logged[0].result).toBe("success");
  });

  it("refuses milestone amounts exceeding the total", async () => {
    givenUserWithRole(CLIENT_ID, "user");
    const res = await handler(
      req("POST", "", {
        action: "create_transaction",
        project_title: "Bungalow",
        contractor_name: "Ada & Sons",
        total_amount_kobo: 100_000,
        milestones: [{ title: "All", amount_kobo: 150_000 }],
      }, CLIENT_AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("refuses an empty schedule and non-integer kobo", async () => {
    givenUserWithRole(CLIENT_ID, "user");
    const empty = await handler(
      req("POST", "", {
        action: "create_transaction",
        project_title: "Bungalow",
        contractor_name: "Ada & Sons",
        total_amount_kobo: 100_000,
        milestones: [],
      }, CLIENT_AUTH),
    );
    expect(empty.status).toBe(400);

    const float = await handler(
      req("POST", "", {
        action: "create_transaction",
        project_title: "Bungalow",
        contractor_name: "Ada & Sons",
        total_amount_kobo: 100_000,
        milestones: [{ title: "One", amount_kobo: 100_000.5 }],
      }, CLIENT_AUTH),
    );
    expect(float.status).toBe(400);
  });
});

describe("archie-escrow — the honest workflow", () => {
  it("evidence → deliver → accept → release request, each by the right actor", async () => {
    givenTransaction();
    givenMilestone({ status: "IN_PROGRESS" });

    // Delivery without evidence is refused — a bare claim is not delivery.
    givenUserWithRole(CONTRACTOR_ID, "user");
    const noEvidence = await handler(
      req("POST", "", { action: "deliver_milestone", transaction_id: TXN, milestone_id: MS }, CONTRACTOR_AUTH),
    );
    expect(noEvidence.status).toBe(400);

    // The contractor submits real evidence, then delivers.
    const evidence = await handler(
      req("POST", "", {
        action: "submit_evidence",
        transaction_id: TXN,
        milestone_id: MS,
        kind: "PHOTO",
        description: "Setting out complete, pegs and profiles verified",
      }, CONTRACTOR_AUTH),
    );
    expect(evidence.status).toBe(200);
    expect(tableFixtures.get("frelux_escrow_evidence")?.length).toBe(1);

    const deliver = await handler(
      req("POST", "", { action: "deliver_milestone", transaction_id: TXN, milestone_id: MS }, CONTRACTOR_AUTH),
    );
    expect(deliver.status).toBe(200);
    expect((await json(deliver)).status).toBe("DELIVERED");

    // The contractor may NOT accept their own work.
    const selfAccept = await handler(
      req("POST", "", { action: "accept_milestone", transaction_id: TXN, milestone_id: MS }, CONTRACTOR_AUTH),
    );
    expect(selfAccept.status).toBe(403);

    // The client accepts.
    givenUserWithRole(CLIENT_ID, "user");
    const accept = await handler(
      req("POST", "", { action: "accept_milestone", transaction_id: TXN, milestone_id: MS }, CLIENT_AUTH),
    );
    expect(accept.status).toBe(200);
    expect((await json(accept)).status).toBe("ACCEPTED");

    // The client may NOT trigger the release pipeline.
    const clientRelease = await handler(
      req("POST", "", { action: "request_release", transaction_id: TXN, milestone_id: MS }, CLIENT_AUTH),
    );
    expect(clientRelease.status).toBe(403);

    // The Owner queues the release; the provider (Stage C) executes it.
    givenUserWithRole("11111111-1111-4111-8111-111111111111", "admin");
    const release = await handler(
      req("POST", "", { action: "request_release", transaction_id: TXN, milestone_id: MS }, OWNER_AUTH),
    );
    expect(release.status).toBe(200);
    expect((await json(release)).status).toBe("RELEASE_PENDING");

    // The ledger carries the whole story, denials included.
    const results = events().map((e) => `${e.action}:${e.result}`);
    expect(results).toContain("deliver_milestone:denied");
    expect(results).toContain("submit_evidence:success");
    expect(results).toContain("deliver_milestone:success");
    expect(results).toContain("accept_milestone:success");
    expect(results).toContain("request_release:denied");
    expect(results).toContain("request_release:success");
  });

  it("refuses a release request when funds are not provider-verified", async () => {
    givenTransaction({ status: "DRAFT" });
    givenMilestone({ status: "ACCEPTED" });
    givenUserWithRole("11111111-1111-4111-8111-111111111111", "admin");
    const res = await handler(
      req("POST", "", { action: "request_release", transaction_id: TXN, milestone_id: MS }, OWNER_AUTH),
    );
    expect(res.status).toBe(409);
    const denied = events().find((e) => e.result === "denied");
    expect(denied?.detail?.reason).toContain("funds not verified");
  });
});

describe("archie-escrow — acceptance window + disputes", () => {
  it("accepts by window lapse only when it has truly lapsed", async () => {
    const OLD = "2026-09-01T10:00:00Z";
    const RECENT = "2026-09-16T20:00:00Z";
    givenTransaction();
    givenMilestone({ status: "DELIVERED", delivered_at: RECENT });
    givenUserWithRole("11111111-1111-4111-8111-111111111111", "admin");

    const tooEarly = await handler(
      req("POST", "", { action: "acceptance_lapse", transaction_id: TXN, milestone_id: MS }, OWNER_AUTH),
    );
    expect(tooEarly.status).toBe(409);

    givenMilestone({ status: "DELIVERED", delivered_at: OLD });
    const lapsed = await handler(
      req("POST", "", { action: "acceptance_lapse", transaction_id: TXN, milestone_id: MS }, OWNER_AUTH),
    );
    expect(lapsed.status).toBe(200);
    expect((await json(lapsed)).status).toBe("ACCEPTED");

    const ms = tableFixtures.get("frelux_escrow_milestones")?.[0];
    expect(ms.accepted_via).toBe("WINDOW_LAPSE");
    expect(ms.acceptance_window_lapsed).toBe(true);
  });

  it("a dispute is raised by a party and adjudicated ONLY by the Owner", async () => {
    givenTransaction();
    givenMilestone({ status: "DELIVERED" });

    // The contractor raises a dispute with their position.
    givenUserWithRole(CONTRACTOR_ID, "user");
    const raise = await handler(
      req("POST", "", {
        action: "raise_dispute",
        transaction_id: TXN,
        milestone_id: MS,
        position: "Scope changed mid-milestone; extra work was requested verbally.",
      }, CONTRACTOR_AUTH),
    );
    expect(raise.status).toBe(200);
    expect((await json(raise)).status).toBe("DISPUTED");
    expect(tableFixtures.get("frelux_escrow_disputes")?.length).toBe(1);

    // The client cannot adjudicate.
    givenUserWithRole(CLIENT_ID, "user");
    const clientResolve = await handler(
      req("POST", "", {
        action: "resolve_dispute",
        transaction_id: TXN,
        milestone_id: MS,
        resolution: "IN_PROGRESS",
        resolution_note: "Back to work",
      }, CLIENT_AUTH),
    );
    expect(clientResolve.status).toBe(403);

    // The Owner adjudicates with a written resolution.
    givenUserWithRole("11111111-1111-4111-8111-111111111111", "admin");
    const badOutcome = await handler(
      req("POST", "", {
        action: "resolve_dispute",
        transaction_id: TXN,
        milestone_id: MS,
        resolution: "RELEASED",
        resolution_note: "no",
      }, OWNER_AUTH),
    );
    expect(badOutcome.status).toBe(400);

    const resolve = await handler(
      req("POST", "", {
        action: "resolve_dispute",
        transaction_id: TXN,
        milestone_id: MS,
        resolution: "IN_PROGRESS",
        resolution_note: "Documented site instruction; rework cost shared.",
      }, OWNER_AUTH),
    );
    expect(resolve.status).toBe(200);
    expect((await json(resolve)).status).toBe("IN_PROGRESS");
    expect(tableFixtures.get("frelux_escrow_disputes")?.[0].resolved_by).toBeTruthy();
  });

  it("rejection requires a reason and returns the milestone to work", async () => {
    givenTransaction();
    givenMilestone({ status: "DELIVERED" });
    givenUserWithRole(CLIENT_ID, "user");

    const noReason = await handler(
      req("POST", "", { action: "reject_milestone", transaction_id: TXN, milestone_id: MS }, CLIENT_AUTH),
    );
    expect(noReason.status).toBe(400);

    const reject = await handler(
      req("POST", "", {
        action: "reject_milestone",
        transaction_id: TXN,
        milestone_id: MS,
        reason: "DPC level is 50mm below the approved drawing.",
      }, CLIENT_AUTH),
    );
    expect(reject.status).toBe(200);
    expect((await json(reject)).status).toBe("REJECTED");

    const results = events().map((e) => `${e.action}:${e.result}`);
    expect(results).toContain("reject_reason:success");
  });
});
