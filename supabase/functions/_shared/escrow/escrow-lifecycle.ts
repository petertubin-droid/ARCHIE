// =========================================================
// FRELUX ESCROW — DETERMINISTIC LIFECYCLE CORE (spec §23)
// supabase/functions/_shared/escrow/escrow-lifecycle.ts
//
// The canonical state machines for FRELUX escrow transactions
// and milestones. One implementation shared by the app, the
// edge functions and the tests — the database CHECK
// constraints in migration 20260916190000_archie_escrow_23.sql
// mirror these states exactly.
//
// FUNDS AUTHORITY (constitution amendment §8):
//   * Custody of funds ALWAYS remains with the authorized
//     payment/escrow provider (Paystack) and the applicable
//     business controls. FRELUX escrow is a milestone-gated
//     release WORKFLOW on top of the provider, never a claim
//     of custody.
//   * RELEASE of a milestone is executed ONLY by the provider
//     (a Paystack transfer), only AFTER client acceptance (or
//     the configured acceptance-window lapse) has produced
//     RELEASE_PENDING.
//   * ARCHIE monitors, flags, recommends and assists dispute
//     analysis (escrow-intelligence). ARCHIE can NEVER move,
//     release, seize or refund funds. AI confidence is never
//     financial truth.
// =========================================================

// ---------------------------------------------------------
// Actors and states
// ---------------------------------------------------------

export type EscrowActor =
  "CLIENT" | "CONTRACTOR" | "OWNER" | "ARCHIE" | "PROVIDER";

export type EscrowTransactionStatus =
  | "DRAFT"
  | "AWAITING_FUNDS"
  | "FUNDED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

export type EscrowMilestoneStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "ACCEPTED"
  | "RELEASE_PENDING"
  | "RELEASED"
  | "REJECTED"
  | "DISPUTED";

export const ESCROW_TRANSACTION_STATUSES: readonly EscrowTransactionStatus[] = [
  "DRAFT",
  "AWAITING_FUNDS",
  "FUNDED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
];

export const ESCROW_MILESTONE_STATUSES: readonly EscrowMilestoneStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "DELIVERED",
  "ACCEPTED",
  "RELEASE_PENDING",
  "RELEASED",
  "REJECTED",
  "DISPUTED",
];

// ---------------------------------------------------------
// Funds authority boundary (hard, never configurable)
// ---------------------------------------------------------

export const ESCROW_FUNDS_AUTHORITY = {
  custody: "authorized payment/escrow provider (Paystack) + business controls",
  /** Who executes a funds movement. Only ever the provider. */
  funds_executor: "PROVIDER",
  /** Who authorizes a milestone release. The client, or the
   *  acceptance-window lapse configured in the terms. */
  acceptance_authority: "CLIENT (or acceptance-window lapse per terms)",
  /** Who adjudicates disputes. Never ARCHIE. */
  dispute_adjudication: "OWNER + provider/business controls",
  archie_may_move_funds: false,
  archie_may_release_funds: false,
  archie_may_refund_funds: false,
  archie_may_seize_funds: false,
} as const;

/** Absolute guard mirroring escrow-intelligence.canArchieMoveFunds:
 *  every code path can assert ARCHIE never executes a funds
 *  action. The answer is always NO. */
export function canArchieExecuteFundsAction(action?: string): {
  allowed: false;
  error: string;
} {
  return {
    allowed: false,
    error: `ARCHIE must never execute escrow funds actions ("${action ?? "funds action"}"). Custody, movement, release and refund belong to the authorized payment/escrow provider and applicable human/business controls.`,
  };
}

// ---------------------------------------------------------
// Milestone shape (amounts are integer kobo, never floats)
// ---------------------------------------------------------

export interface EscrowMilestoneInput {
  sequence: number;
  title: string;
  description?: string;
  deliverables: readonly string[];
  amount_kobo: number;
  due_date?: string;
}

export interface EscrowMilestone extends EscrowMilestoneInput {
  status: EscrowMilestoneStatus;
  accepted_at?: string;
  acceptance_window_lapsed?: boolean;
  paystack_transfer_ref?: string;
}

export interface EscrowTerms {
  /** Days the client has to accept delivered work before the
   *  window lapses (per the agreed terms). 0 = no lapse. */
  acceptance_window_days: number;
  /** Days a funder has to complete payment before the
   *  AWAITING_FUNDS transaction expires. */
  funding_window_days: number;
  currency: "NGN";
}

export const DEFAULT_ESCROW_TERMS: EscrowTerms = {
  acceptance_window_days: 7,
  funding_window_days: 3,
  currency: "NGN",
};

// ---------------------------------------------------------
// Transaction transitions
// ---------------------------------------------------------

interface TransactionRule {
  to: EscrowTransactionStatus;
  actors: readonly EscrowActor[];
}

/** Allowed transaction transitions with their authorized actors.
 *  Note the pattern: only the PROVIDER produces FUNDED (a
 *  verified charge), only the PROVIDER produces REFUNDED (an
 *  executed refund). Clients, contractors, ARCHIE and the
 *  Owner never produce money states directly. */
const TRANSACTION_RULES: Readonly<
  Record<EscrowTransactionStatus, readonly TransactionRule[]>
> = {
  DRAFT: [
    { to: "AWAITING_FUNDS", actors: ["CLIENT"] },
    { to: "CANCELLED", actors: ["CLIENT", "OWNER"] },
  ],
  AWAITING_FUNDS: [
    { to: "FUNDED", actors: ["PROVIDER"] },
    { to: "EXPIRED", actors: ["PROVIDER", "OWNER"] },
    { to: "CANCELLED", actors: ["CLIENT", "OWNER"] },
  ],
  FUNDED: [
    { to: "ACTIVE", actors: ["CLIENT", "CONTRACTOR", "OWNER"] },
    { to: "REFUNDED", actors: ["PROVIDER"] },
    { to: "CANCELLED", actors: ["OWNER"] },
  ],
  ACTIVE: [
    { to: "COMPLETED", actors: ["PROVIDER"] },
    { to: "REFUNDED", actors: ["PROVIDER"] },
  ],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export interface TransitionContext {
  /** Evidence in seconds since epoch; window math uses the
   *  caller-provided clock, never Date.now() inside the core. */
  now?: string;
  /** All milestones of the transaction (needed for completion). */
  milestones?: readonly EscrowMilestone[];
  /** True when the acceptance window has lapsed without a
   *  dispute (computed by the caller from terms + now). */
  acceptance_window_lapsed?: boolean;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

export function validateTransactionTransition(input: {
  from: EscrowTransactionStatus;
  to: EscrowTransactionStatus;
  actor: EscrowActor;
  context?: TransitionContext;
}): TransitionResult {
  const rules = TRANSACTION_RULES[input.from] ?? [];
  const rule = rules.find((r) => r.to === input.to);
  if (!rule) {
    return {
      ok: false,
      error: `Invalid transaction transition: ${input.from} → ${input.to}`,
    };
  }
  if (!rule.actors.includes(input.actor)) {
    return {
      ok: false,
      error: `Actor ${input.actor} is not authorized for ${input.from} → ${input.to} (allowed: ${rule.actors.join(", ")})`,
    };
  }
  // COMPLETED requires every milestone released (the provider
  // closes the transaction only when the work is fully settled).
  if (input.to === "COMPLETED") {
    const milestones = input.context?.milestones ?? [];
    if (milestones.length === 0) {
      return {
        ok: false,
        error: "A transaction with no milestones cannot complete",
      };
    }
    if (!milestones.every((m) => m.status === "RELEASED")) {
      return {
        ok: false,
        error: "A transaction completes only when every milestone is RELEASED",
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------
// Milestone transitions
// ---------------------------------------------------------

interface MilestoneRule {
  to: EscrowMilestoneStatus;
  actors: readonly EscrowActor[];
  /** Extra invariant required by this transition. */
  requires?: "acceptance_window_lapsed" | "not_released" | "evidence_required";
}

/** Allowed milestone transitions. RELEASE_PENDING is produced
 *  ONLY by client acceptance (or the acceptance-window lapse);
 *  RELEASED is produced ONLY by the provider confirming a
 *  transfer. ARCHIE appears nowhere in the money path. */
const MILESTONE_RULES: Readonly<
  Record<EscrowMilestoneStatus, readonly MilestoneRule[]>
> = {
  PENDING: [{ to: "IN_PROGRESS", actors: ["CONTRACTOR", "OWNER"] }],
  IN_PROGRESS: [
    { to: "DELIVERED", actors: ["CONTRACTOR"], requires: "evidence_required" },
    { to: "DISPUTED", actors: ["CLIENT", "CONTRACTOR", "OWNER"] },
  ],
  DELIVERED: [
    { to: "ACCEPTED", actors: ["CLIENT"] },
    {
      // acceptance-window lapse: the agreed terms, not a person,
      // produce acceptance — the caller must have computed the
      // lapse from terms + the real clock.
      to: "ACCEPTED",
      actors: ["OWNER"],
      requires: "acceptance_window_lapsed",
    },
    { to: "REJECTED", actors: ["CLIENT"] },
    { to: "DISPUTED", actors: ["CLIENT", "CONTRACTOR", "OWNER"] },
  ],
  ACCEPTED: [
    { to: "RELEASE_PENDING", actors: ["OWNER", "PROVIDER"] },
    { to: "DISPUTED", actors: ["CLIENT", "OWNER"] },
  ],
  RELEASE_PENDING: [
    { to: "RELEASED", actors: ["PROVIDER"] },
    { to: "DISPUTED", actors: ["OWNER"] },
  ],
  RELEASED: [],
  REJECTED: [
    { to: "IN_PROGRESS", actors: ["CONTRACTOR"] },
    { to: "DISPUTED", actors: ["CLIENT", "CONTRACTOR", "OWNER"] },
  ],
  DISPUTED: [
    // Resolution paths: back to work, or to acceptance by the
    // adjudicating authority (OWNER with the provider).
    { to: "IN_PROGRESS", actors: ["OWNER"] },
    { to: "ACCEPTED", actors: ["OWNER"] },
    { to: "REJECTED", actors: ["OWNER"] },
  ],
};

export function validateMilestoneTransition(input: {
  from: EscrowMilestoneStatus;
  to: EscrowMilestoneStatus;
  actor: EscrowActor;
  context?: TransitionContext;
  evidence_provided?: boolean;
}): TransitionResult {
  const rules = MILESTONE_RULES[input.from] ?? [];
  // A transition may carry several rules (e.g. DELIVERED →
  // ACCEPTED by the client OR by window lapse): select the one
  // that matches both destination AND actor.
  const rule = rules.find(
    (r) => r.to === input.to && r.actors.includes(input.actor),
  );
  if (!rule) {
    return {
      ok: false,
      error: `Invalid milestone transition: ${input.from} → ${input.to}`,
    };
  }
  if (!rule.actors.includes(input.actor)) {
    return {
      ok: false,
      error: `Actor ${input.actor} is not authorized for ${input.from} → ${input.to} (allowed: ${rule.actors.join(", ")})`,
    };
  }
  if (rule.requires === "acceptance_window_lapsed") {
    if (!input.context?.acceptance_window_lapsed) {
      return {
        ok: false,
        error:
          "Acceptance by window lapse requires the acceptance window to have actually lapsed (computed from the agreed terms and the real clock)",
      };
    }
  }
  if (rule.requires === "evidence_required") {
    if (!input.evidence_provided) {
      return {
        ok: false,
        error:
          "Marking a milestone DELIVERED requires delivery/acceptance evidence, never a bare claim",
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------
// Acceptance window math
// ---------------------------------------------------------

/** Has the acceptance window lapsed for a delivered milestone?
 *  Deterministic: the caller supplies the clock. */
export function acceptanceWindowLapsed(
  milestone: Pick<EscrowMilestone, "status"> & { delivered_at?: string },
  delivered_at: string,
  terms: EscrowTerms,
  now: string,
): boolean {
  if (milestone.status !== "DELIVERED") return false;
  if (terms.acceptance_window_days <= 0) return false;
  const delivered = Date.parse(delivered_at);
  const nowMs = Date.parse(now);
  if (Number.isNaN(delivered) || Number.isNaN(nowMs) || nowMs < delivered) {
    return false;
  }
  const windowMs = terms.acceptance_window_days * 24 * 60 * 60 * 1000;
  return nowMs - delivered >= windowMs;
}

// ---------------------------------------------------------
// Milestone amount validation
// ---------------------------------------------------------

/** Milestone amounts must be positive integers (kobo) and their
 *  sum may never exceed the funded total. The remainder (if
 *  any) is refundable to the client at completion — it is
 *  never released to the contractor. */
export function validateMilestoneAmounts(
  milestones: readonly Pick<EscrowMilestoneInput, "amount_kobo">[],
  total_amount_kobo: number,
): TransitionResult {
  if (!Number.isInteger(total_amount_kobo) || total_amount_kobo <= 0) {
    return {
      ok: false,
      error: "The transaction total must be a positive integer amount in kobo",
    };
  }
  if (milestones.length === 0) {
    return {
      ok: false,
      error: "A transaction requires at least one milestone",
    };
  }
  for (const m of milestones) {
    if (!Number.isInteger(m.amount_kobo) || m.amount_kobo <= 0) {
      return {
        ok: false,
        error: "Every milestone amount must be a positive integer in kobo",
      };
    }
  }
  const sum = milestones.reduce((acc, m) => acc + m.amount_kobo, 0);
  if (sum > total_amount_kobo) {
    return {
      ok: false,
      error: `Milestone amounts (${sum} kobo) exceed the transaction total (${total_amount_kobo} kobo)`,
    };
  }
  return { ok: true };
}

/** The unreleased remainder that returns to the client when the
 *  transaction completes (provider-executed refund). */
export function clientRefundableRemainder(
  milestones: readonly Pick<EscrowMilestone, "status" | "amount_kobo">[],
  total_amount_kobo: number,
): number {
  const released = milestones
    .filter((m) => m.status === "RELEASED")
    .reduce((acc, m) => acc + m.amount_kobo, 0);
  return Math.max(0, total_amount_kobo - released);
}

// ---------------------------------------------------------
// Release readiness (deterministic preconditions the edge
// function re-checks before asking Paystack for a transfer)
// ---------------------------------------------------------

export type ReleaseReadiness =
  | { ready: true; milestone: EscrowMilestone }
  | { ready: false; reason: string };

export function releaseReadiness(input: {
  milestone: EscrowMilestone;
  transaction_status: EscrowTransactionStatus;
  transaction_funded: boolean;
}): ReleaseReadiness {
  const { milestone, transaction_status, transaction_funded } = input;
  if (!transaction_funded || transaction_status !== "ACTIVE") {
    return {
      ready: false,
      reason:
        "Funds must be verified FUNDED and the transaction ACTIVE before any release",
    };
  }
  if (milestone.status !== "RELEASE_PENDING") {
    return {
      ready: false,
      reason: `Milestone is ${milestone.status}; only ACCEPTED milestones (client acceptance or window lapse) reach RELEASE_PENDING`,
    };
  }
  return { ready: true, milestone };
}
