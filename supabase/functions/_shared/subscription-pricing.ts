// =========================================================
// Subscription Pricing Guard (shared edge-function module)
//
// SECURITY: subscription prices are ALWAYS resolved server-side
// from the `subscription_plan_prices` table. The client-supplied
// amount is never trusted. A transaction that does not match the
// configured price for its (plan, billing_cycle) must NOT activate
// a subscription — no fallback, no guessing.
//
// This closes the audit finding H1 (2026-09-10): the legacy
// subscription flow passed a client-controlled amount into
// Paystack checkout and activated on any successful transaction.
// =========================================================

export interface SubscriptionPlanPriceRow {
  plan: string;
  billing_cycle: string;
  price_kobo: number;
  active: boolean;
}

export interface SubscriptionPriceResolution {
  /** Configured price in kobo, or null when no active plan row exists. */
  priceKobo: number | null;
}

/**
 * Resolves the canonical server-side price for a plan + billing cycle.
 * Returns null unless an exact active row exists — never guesses.
 */
export function resolveSubscriptionPriceKobo(
  rows: SubscriptionPlanPriceRow[],
  plan: string,
  billingCycle: string,
): SubscriptionPriceResolution {
  const row = rows.find(
    (r) =>
      r.plan === plan && r.billing_cycle === billingCycle && r.active === true,
  );
  if (!row) return { priceKobo: null };
  const price = Number(row.price_kobo);
  if (!Number.isFinite(price) || price <= 0) return { priceKobo: null };
  return { priceKobo: Math.round(price) };
}

export type SubscriptionValidationReason =
  "PLAN_NOT_CONFIGURED" | "AMOUNT_MISMATCH";

/**
 * Validates that a Paystack transaction's paid amount matches the
 * canonical server-side price for the plan it claims to purchase.
 *
 * Returns { ok: true } only when an active price row exists AND the
 * transaction amount equals it exactly (kobo-precise).
 */
export function validateSubscriptionPayment(input: {
  rows: SubscriptionPlanPriceRow[];
  plan: string;
  billingCycle: string;
  transactionAmountKobo: number;
}):
  | { ok: true; priceKobo: number }
  | { ok: false; reason: SubscriptionValidationReason } {
  const { priceKobo } = resolveSubscriptionPriceKobo(
    input.rows,
    input.plan,
    input.billingCycle,
  );
  if (priceKobo === null) {
    return { ok: false, reason: "PLAN_NOT_CONFIGURED" };
  }
  if (Math.round(input.transactionAmountKobo) !== priceKobo) {
    return { ok: false, reason: "AMOUNT_MISMATCH" };
  }
  return { ok: true, priceKobo };
}

/**
 * Constant-time string comparison for signature verification.
 * Compares hex digests without early-exit timing leakage.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
