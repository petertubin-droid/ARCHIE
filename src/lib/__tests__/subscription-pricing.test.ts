// =========================================================
// Subscription Pricing Guard tests (audit H1 fix, 2026-09-10)
//
// Verifies the server-side pricing rules that close the Paystack
// subscription bypass: prices resolve only from configured active
// rows, tampered amounts are rejected, and unknown plans (free,
// enterprise) can never be self-serve activated.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  resolveSubscriptionPriceKobo,
  validateSubscriptionPayment,
  constantTimeEqual,
  type SubscriptionPlanPriceRow,
} from "@studio-shared/subscription-pricing";

// Canonical seed rows (mirrors migration 20260911090000)
const rows: SubscriptionPlanPriceRow[] = [
  { plan: "pro", billing_cycle: "monthly", price_kobo: 500000, active: true },
  { plan: "pro", billing_cycle: "yearly", price_kobo: 5000000, active: true },
  {
    plan: "premium",
    billing_cycle: "monthly",
    price_kobo: 1500000,
    active: true,
  },
  {
    plan: "premium",
    billing_cycle: "yearly",
    price_kobo: 15000000,
    active: true,
  },
];

describe("resolveSubscriptionPriceKobo", () => {
  it("resolves exact plan + cycle", () => {
    expect(resolveSubscriptionPriceKobo(rows, "pro", "monthly").priceKobo).toBe(
      500000,
    );
    expect(
      resolveSubscriptionPriceKobo(rows, "premium", "yearly").priceKobo,
    ).toBe(15000000);
  });

  it("returns null for unconfigured plans (free/enterprise)", () => {
    expect(
      resolveSubscriptionPriceKobo(rows, "free", "monthly").priceKobo,
    ).toBeNull();
    expect(
      resolveSubscriptionPriceKobo(rows, "enterprise", "monthly").priceKobo,
    ).toBeNull();
  });

  it("returns null for cycle mismatch", () => {
    expect(
      resolveSubscriptionPriceKobo(rows, "pro", "weekly").priceKobo,
    ).toBeNull();
  });

  it("returns null for inactive rows", () => {
    const inactive: SubscriptionPlanPriceRow[] = [
      {
        plan: "pro",
        billing_cycle: "monthly",
        price_kobo: 500000,
        active: false,
      },
    ];
    expect(
      resolveSubscriptionPriceKobo(inactive, "pro", "monthly").priceKobo,
    ).toBeNull();
  });

  it("returns null for non-positive prices", () => {
    const bad: SubscriptionPlanPriceRow[] = [
      { plan: "pro", billing_cycle: "monthly", price_kobo: 0, active: true },
    ];
    expect(
      resolveSubscriptionPriceKobo(bad, "pro", "monthly").priceKobo,
    ).toBeNull();
  });
});

describe("validateSubscriptionPayment", () => {
  it("accepts a transaction that paid the exact canonical price", () => {
    const r = validateSubscriptionPayment({
      rows,
      plan: "pro",
      billingCycle: "monthly",
      transactionAmountKobo: 500000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.priceKobo).toBe(500000);
  });

  it("rejects the ₦1 tamper attack (amount mismatch)", () => {
    const r = validateSubscriptionPayment({
      rows,
      plan: "premium",
      billingCycle: "monthly",
      transactionAmountKobo: 100,
    });
    expect(r).toEqual({ ok: false, reason: "AMOUNT_MISMATCH" });
  });

  it("rejects near-miss amounts (off-by-one kobo)", () => {
    const r = validateSubscriptionPayment({
      rows,
      plan: "pro",
      billingCycle: "yearly",
      transactionAmountKobo: 5000001,
    });
    expect(r).toEqual({ ok: false, reason: "AMOUNT_MISMATCH" });
  });

  it("rejects unconfigured plans outright", () => {
    const r = validateSubscriptionPayment({
      rows,
      plan: "free",
      billingCycle: "monthly",
      transactionAmountKobo: 0,
    });
    expect(r).toEqual({ ok: false, reason: "PLAN_NOT_CONFIGURED" });
  });

  it("never falls back to the client amount when the row is missing", () => {
    const r = validateSubscriptionPayment({
      rows: [],
      plan: "pro",
      billingCycle: "monthly",
      transactionAmountKobo: 500000,
    });
    expect(r).toEqual({ ok: false, reason: "PLAN_NOT_CONFIGURED" });
  });
});

describe("constantTimeEqual", () => {
  it("matches identical strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(constantTimeEqual(null as unknown as string, "abc")).toBe(false);
  });
});
