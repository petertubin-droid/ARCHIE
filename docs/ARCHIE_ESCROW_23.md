# FRELUX ESCROW — DESIGN & ARCHITECTURE (spec §23)

Status: core lifecycle + schema LIVE (this document). Edge
functions, Paystack wiring and UI surfaces are staged below.

## 1. What FRELUX escrow IS — and is not

FRELUX escrow is a **milestone-gated release workflow** on top
of the authorized payment provider (Paystack):

```
CLIENT ──funds──▶ PAYSTACK (custody) ──provider transfer──▶ CONTRACTOR
  │                                        ▲
  ▼                                        │ provider-executed,
milestone evidence ─▶ ACCEPTANCE ─▶ RELEASE_PENDING ──────┘ never ARCHIE
```

- **Custody of funds always remains with Paystack** and the
  applicable business controls. FRELUX never claims custody,
  and the schema stores no funds-movement instruction any code
  path could execute.
- **Every money state is provider-verified**: `FUNDED` only
  from a signed `charge.success` webhook, `RELEASED` only from
  a signed `transfer.success`, `REFUNDED` only from
  `refund.processed`. No client request, no ARCHIE action and
  no UI button can produce a money state directly.
- **ARCHIE's role is intelligence, not custody** (see
  `src/lib/archie/escrow-intelligence.ts`): monitoring
  transaction status, milestones, deliverables, payment
  conditions, delivery/acceptance evidence, disputes,
  suspicious transaction patterns and fraud indicators.
  ARCHIE flags with mandatory evidence, recommends actions and
  assists dispute analysis. `canArchieMoveFunds()` is hard
  false; `canArchieExecuteFundsAction()` in the lifecycle core
  mirrors the same boundary. AI confidence is never financial
  truth (constitution amendment §8, authority layer
  `PAYMENT_ESCROW_PROVIDER_AUTHORITY`).

## 2. The deterministic lifecycle core

Canonical implementation:
`supabase/functions/_shared/escrow/escrow-lifecycle.ts` — one
implementation shared by the app, edge functions and tests
(the DB CHECK constraints in
`20260916190000_archie_escrow_23.sql` mirror it exactly).

Transaction states:

```
DRAFT → AWAITING_FUNDS → FUNDED → ACTIVE → COMPLETED
              │                      │
              ├→ EXPIRED              └→ REFUNDED
              └→ CANCELLED
```

| Transition                           | Authorized actors                                    |
| ------------------------------------ | ---------------------------------------------------- |
| DRAFT → AWAITING_FUNDS               | CLIENT                                               |
| AWAITING_FUNDS → FUNDED              | **PROVIDER only** (verified charge)                  |
| AWAITING_FUNDS → EXPIRED / CANCELLED | PROVIDER, OWNER (CLIENT may cancel)                  |
| FUNDED → ACTIVE                      | CLIENT, CONTRACTOR, OWNER                            |
| FUNDED / ACTIVE → REFUNDED           | **PROVIDER only** (executed refund)                  |
| ACTIVE → COMPLETED                   | **PROVIDER only**, after EVERY milestone is RELEASED |

Milestone states:

```
PENDING → IN_PROGRESS → DELIVERED → ACCEPTED → RELEASE_PENDING → RELEASED
                 ▲           │           │
                 │           ├→ REJECTED ┘ (rework)
                 └────────── └→ DISPUTED ── adjudication → IN_PROGRESS /
                                             ACCEPTED / REJECTED
```

Rules that make the workflow honest:

- **Delivery requires evidence.** IN_PROGRESS → DELIVERED is
  refused without delivery/acceptance evidence (`evidence`
  table rows: photo, document, inspection, measurement — with
  provenance `submitted_by` and content hash).
- **Acceptance belongs to the client** — or to the agreed
  acceptance-window lapse, which the edge function computes
  from the terms and the real clock (`acceptanceWindowLapsed`,
  recorded honestly as `accepted_via = 'WINDOW_LAPSE'`; a
  zero-day window disables lapse entirely).
- **RELEASED is provider-only.** Only ACCEPTED milestones
  reach RELEASE_PENDING, and only the provider's verified
  transfer confirmation produces RELEASED. ARCHIE, CLIENT and
  CONTRACTOR are refused by the transition matrix — asserted
  exhaustively by tests.
- **Amounts are integer kobo.** Milestone amounts may never
  exceed the funded total; the unreleased remainder
  (`clientRefundableRemainder`) returns to the client at
  completion — never to the contractor.

## 3. Data model (migration 20260916190000, applied)

| Table                        | Purpose                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frelux_escrow_transactions` | The engagement: client, contractor, terms, total (kobo), status, Paystack refs                                                                                                |
| `frelux_escrow_milestones`   | Release units: deliverables, amount, due date, status, acceptance provenance, transfer ref                                                                                    |
| `frelux_escrow_evidence`     | Mandatory delivery/acceptance evidence with provenance and content hash                                                                                                       |
| `frelux_escrow_flags`        | ARCHIE monitoring flags (EXTENDS the phase-8 trust-safety table in place — existing admin surface and rows keep working) with an optional link to §23 transactions/milestones |
| `frelux_escrow_disputes`     | Positions, evidence reviewed, ARCHIE analysis as ASSISTANCE; decision authority = provider + human/business controls                                                          |
| `frelux_escrow_events`       | **Append-only** audit ledger: actor-attributed actions, denials recorded exactly like successes; no UPDATE/DELETE policy exists for any role                                  |

RLS: clients manage their own transactions; engaged contractors
read their counterparty transactions and work their milestones;
participants read flags/events/disputes on their own
transactions. ARCHIE's flags and all money-state writes flow
through the audited edge function with the service role —
never through a client policy.

## 4. Paystack flow

Funding and release reuse the existing, proven Paystack
integration (`paystack-checkout`, `paystack-verify`,
`paystack-webhook`, server-held `PAYSTACK_SECRET_KEY`):

1. **Funding.** Client confirms the milestone schedule →
   `purpose: "escrow"` checkout (amount resolved SERVER-SIDE
   from the transaction row, client amount advisory only —
   same hard rule as subscriptions and token purchases) →
   Paystack charge → signed `charge.success` webhook sets
   `FUNDED` + `funded_at`.
2. **Release.** Milestone ACCEPTED (client or window lapse) →
   RELEASE_PENDING → the audited edge function re-checks
   `releaseReadiness()` (funded + ACTIVE + RELEASE_PENDING) and
   requests a **Paystack Transfer** to the contractor's
   registered recipient → signed `transfer.success` sets
   `RELEASED` + `released_at` + `paystack_transfer_ref`.
   Transfer failures/reversals are recorded honestly and
   surface for review — never silently retried by ARCHIE.
3. **Completion/refund.** All milestones RELEASED → provider
   closes the transaction; the remainder (if any) is refunded to
   the client through the provider. Cancellation before
   funding expiry is client-side; after funding, refunds are
   provider-executed with Owner review.

## 5. ARCHIE monitoring surface (already live, §23 scope)

`src/lib/archie/escrow-intelligence.ts` — the eight monitored
topics (`ESCROW_MONITORING_SCOPE`), `flagTransaction` (evidence
mandatory), `assistDisputeAnalysis` (structured assistance for
human adjudication) and the hard-false funds guard. The
governance layer lives in `trust-safety.ts`
(`AUTHORITY_LAYERS.PAYMENT_ESCROW_PROVIDER_AUTHORITY`,
`FINAL_PRINCIPLE.ai_confidence_is_not_financial_truth`).

## 6. Staging plan

- **Stage A (done)**: lifecycle core + tests (18), schema +
  RLS, this design.
- **Stage B**: `archie-escrow` edge function — transaction
  create/milestone schedule, evidence submit, accept/reject/
  dispute, release request with `releaseReadiness` re-checks;
  full event-ledger writes; owner review of flags.
- **Stage C**: Paystack wiring — `purpose: "escrow"` in
  `paystack-checkout`, webhook handling for
  `charge.success`/`transfer.*`/`refund.processed` against
  escrow rows, contractor recipient registration flow.
- **Stage D**: surfaces — client escrow page (schedule,
  evidence, accept/dispute), contractor surface (work, deliver,
  evidence), Owner adjudication panel, ARCHIE flags feed.
- **Stage E**: ARCHIE monitoring turn — scheduled escrow
  intelligence pass (stale deliveries, window lapses, evidence
  gaps, suspicious patterns) writing honest flags for Owner
  review.

Every stage ships with the same guarantees: no fake capability,
no silent funds movement, and denials recorded in the ledger.
