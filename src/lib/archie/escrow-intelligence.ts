// =========================================================
// FRELUX ARCHIE AMENDMENT, ESCROW & TRANSACTION INTELLIGENCE
//
// FRELUX may provide an escrow workflow through an
// appropriately authorized payment/escrow provider. ARCHIE
// intelligently monitors:
//   transaction status, project milestones, agreed
//   deliverables, payment conditions, delivery/acceptance
//   evidence, disputes, suspicious transaction patterns and
//   fraud indicators.
//
// ARCHIE may flag transactions, recommend actions and assist
// with dispute analysis. ACTUAL custody, movement, release or
// refund of funds remains with the authorized payment/escrow
// provider and applicable human/business controls.
//
// ARCHIE MUST NOT independently move or seize funds. AI
// confidence alone is NEVER financial truth.
// =========================================================

export type EscrowMonitorTopic =
  | "transaction_status"
  | "project_milestones"
  | "agreed_deliverables"
  | "payment_conditions"
  | "delivery_acceptance_evidence"
  | "disputes"
  | "suspicious_transaction_patterns"
  | "fraud_indicators";

export const ESCROW_MONITORING_SCOPE: readonly EscrowMonitorTopic[] = [
  "transaction_status",
  "project_milestones",
  "agreed_deliverables",
  "payment_conditions",
  "delivery_acceptance_evidence",
  "disputes",
  "suspicious_transaction_patterns",
  "fraud_indicators",
];

/** What ARCHIE may do with escrow/transactions. */
export const ESCROW_AUTHORITY = {
  may_monitor: ESCROW_MONITORING_SCOPE,
  may_flag: true,
  may_recommend_actions: true,
  may_assist_dispute_analysis: true,
  may_move_funds: false, // hard-false, never flipped
  may_seize_funds: false, // hard-false, never flipped
  may_release_funds: false, // hard-false, never flipped
  may_refund_funds: false, // hard-false, never flipped
  funds_authority: "authorized payment/escrow provider + human/business controls",
} as const;

export interface EscrowFlag {
  transaction_ref: string;
  topic: EscrowMonitorTopic;
  reason: string;
  evidence: string;
  recommended_action: string;
  /** What actually happens to the funds, never ARCHIE. */
  fund_authority: "payment/escrow provider";
  created_at: string;
}

export type FlagResult = { ok: true; flag: EscrowFlag } | { ok: false; error: string };

/** Flag a transaction. Evidence is mandatory; the flag is a
 *  RECOMMENDATION to the provider/business controls, never a
 *  funds action. */
export function flagTransaction(input: {
  transaction_ref: string;
  topic: EscrowMonitorTopic;
  reason: string;
  evidence: string;
  recommended_action: string;
  now?: string;
}): FlagResult {
  if (!input.transaction_ref.trim()) {
    return { ok: false, error: "A flag requires the transaction reference" };
  }
  if (!input.evidence.trim()) {
    return {
      ok: false,
      error: "A transaction flag requires evidence, AI confidence alone is never financial truth",
    };
  }
  if (!input.recommended_action.trim()) {
    return { ok: false, error: "A flag carries a recommended action for review" };
  }
  return {
    ok: true,
    flag: {
      transaction_ref: input.transaction_ref,
      topic: input.topic,
      reason: input.reason,
      evidence: input.evidence,
      recommended_action: input.recommended_action,
      fund_authority: "payment/escrow provider",
      created_at: input.now ?? new Date().toISOString(),
    },
  };
}

export interface DisputeAnalysis {
  transaction_ref: string;
  positions: string[];
  evidence_reviewed: string[];
  analysis: string;
  recommended_resolution: string;
  /** The decision belongs to the provider/business controls. */
  decision_authority: "payment/escrow provider + human/business controls";
}

/** Assist dispute analysis, structured output for human
 *  adjudication. */
export function assistDisputeAnalysis(input: {
  transaction_ref: string;
  positions: string[];
  evidence_reviewed: string[];
  analysis: string;
  recommended_resolution: string;
}): { ok: boolean; error?: string; analysis?: DisputeAnalysis } {
  if (input.evidence_reviewed.length === 0) {
    return { ok: false, error: "Dispute analysis requires reviewed evidence" };
  }
  if (!input.analysis.trim()) {
    return { ok: false, error: "Dispute analysis requires the written analysis" };
  }
  return {
    ok: true,
    analysis: {
      transaction_ref: input.transaction_ref,
      positions: input.positions,
      evidence_reviewed: input.evidence_reviewed,
      analysis: input.analysis,
      recommended_resolution: input.recommended_resolution,
      decision_authority: "payment/escrow provider + human/business controls",
    },
  };
}

/** Absolute guard: can ARCHIE perform this funds action?
 *  Always NO. Exists so every code path can assert it. */
export function canArchieMoveFunds(action?: string): {
  allowed: false;
  error: string;
} {
  return {
    allowed: false,
    error: `ARCHIE must never independently move or seize funds ("${action ?? "funds action"}"). Custody, movement, release and refund belong to the authorized payment/escrow provider and applicable human/business controls.`,
  };
}
