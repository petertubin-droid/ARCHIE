// =========================================================
// Paystack Verify — Verify Transaction & Activate Subscription
//
// Called by the frontend after the user returns from Paystack checkout.
// Verifies the transaction with Paystack and activates the user's
// subscription in user_paid_status.
//
// Required env:
// - PAYSTACK_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSubscriptionPayment } from "../_shared/subscription-pricing.ts";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_DURATIONS_DAYS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
};

const _PLAN_NAMES: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  premium: "Premium",
  enterprise: "Enterprise",
};

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.PAYMENT,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reference } = await req.json();

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Payment provider not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify transaction with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.status) {
      return new Response(
        JSON.stringify({ error: verifyData.message || "Verification failed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const transaction = verifyData.data;
    if (transaction.status !== "success") {
      return new Response(
        JSON.stringify({
          status: false,
          message: `Payment ${transaction.status}`,
          data: transaction,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract metadata
    const metadata = transaction.metadata || {};
    const purpose = (metadata.purpose as string) || "subscription";
    const plan = metadata.plan as string;
    const billingCycle = (metadata.billing_cycle as string) || "monthly";
    const userId = metadata.user_id as string;

    // Service-role client — needed by BOTH the token-purchase branch and the
    // subscription branch below. Previously it was only created inside the
    // subscription path, so the token branch crashed with
    // "supabase is not defined" (caught as a 500) on every manual verify
    // after returning from Paystack. The webhook still credited tokens,
    // masking the bug — the client showed a failure for a successful buy.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Token purchase: credit the wallet atomically (idempotent) ──
    if (purpose === "token_purchase") {
      const tokens = metadata.tokens as number;
      const priceKobo = (metadata.price_kobo as number) || transaction.amount;

      if (!userId || !tokens) {
        return new Response(
          JSON.stringify({
            error: "Missing user_id or tokens in transaction metadata",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Sanity: the amount actually paid must match the configured price
      if (transaction.amount !== priceKobo) {
        return new Response(
          JSON.stringify({
            status: false,
            message: "Amount paid does not match token price",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const rpc = await supabase.rpc("credit_token_purchase", {
        p_user_id: userId,
        p_reference: reference,
        p_tokens: tokens,
        p_amount_kobo: transaction.amount,
        p_metadata: {
          source: "paystack-verify",
          paystack_reference: reference,
        },
      });

      if (rpc.error) {
        return new Response(
          JSON.stringify({
            error: `Failed to credit tokens: ${rpc.error.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const row = (rpc.data as unknown as Record<string, unknown>[])?.[0];
      return new Response(
        JSON.stringify({
          status: true,
          message: row?.already_credited
            ? "Tokens were already credited for this payment"
            : `${tokens} tokens added to your balance`,
          data: {
            ...transaction,
            purpose: "token_purchase",
            tokens_credited: tokens,
            already_credited: row?.already_credited ?? false,
            new_balance: row?.new_balance ?? null,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!plan || !userId) {
      return new Response(
        JSON.stringify({
          error: "Missing plan or user_id in transaction metadata",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // (supabase client already created above, before the token branch)

    // ── Audit H1 fix (2026-09-10): subscriptions activate ONLY when ──
    //  1. the caller is authenticated and IS the user_id in metadata, and
    //  2. the amount actually paid equals the canonical server-side
    //     price for (plan, billing_cycle) from subscription_plan_prices.
    const authHeader =
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const tokenUser = authHeader
      ? await supabase.auth.getUser(authHeader)
      : { data: { user: null }, error: new Error("no auth header") };
    if (!tokenUser?.data?.user || tokenUser.data.user.id !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — user mismatch" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: priceRows, error: priceError } = await supabase
      .from("subscription_plan_prices")
      .select("plan, billing_cycle, price_kobo, active");
    if (priceError) {
      return new Response(
        JSON.stringify({ error: "Plan pricing unavailable" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const validation = validateSubscriptionPayment({
      rows: priceRows ?? [],
      plan,
      billingCycle,
      transactionAmountKobo: transaction.amount as number,
    });
    if (!validation.ok) {
      return new Response(
        JSON.stringify({
          error:
            validation.reason === "AMOUNT_MISMATCH"
              ? "Paid amount does not match the configured price for this plan"
              : "Plan is not configured for self-service activation",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const days = PLAN_DURATIONS_DAYS[billingCycle] ?? 30;
    const paidUntil = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: upsertError } = await supabase
      .from("user_paid_status")
      .upsert(
        {
          user_id: userId,
          is_paid: true,
          plan,
          paid_until: paidUntil,
          payment_provider: "paystack",
          provider_customer_id: transaction.customer?.customer_code || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      return new Response(
        JSON.stringify({
          error: `Failed to activate subscription: ${upsertError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        status: true,
        message: "Subscription activated successfully",
        data: {
          ...transaction,
          activated_plan: plan,
          paid_until: paidUntil,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
