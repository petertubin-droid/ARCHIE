// =========================================================
// FRELUX SMS OTP Sender — Termii Gateway
// Called by the send_mobile_otp RPC via pg_net or directly
// =========================================================

import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
const corsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AUTH,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { phone_number, otp_code } = await req.json();

  if (!phone_number || !otp_code) {
    return new Response(
      JSON.stringify({ error: "Missing phone_number or otp_code" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const termiiKey = Deno.env.get("TERMII_API_KEY") ?? "";
  const termiiSender = Deno.env.get("TERMII_SENDER_ID") ?? "FRELUX";

  if (!termiiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "SMS gateway not configured — TERMII_API_KEY missing",
        dev_otp: otp_code, // Return OTP in dev for testing
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Format phone for Nigeria
  let formattedPhone = phone_number.replace(/\s/g, "");
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "234" + formattedPhone.slice(1);
  } else if (formattedPhone.startsWith("+234")) {
    formattedPhone = formattedPhone.slice(1);
  } else if (!formattedPhone.startsWith("234")) {
    formattedPhone = "234" + formattedPhone;
  }

  const message = `FRELUX: Your verification code is ${otp_code}. Do not share this code with anyone.`;

  try {
    const response = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: termiiKey,
        to: formattedPhone,
        from: termiiSender,
        sms: message,
        type: "plain",
        channel: "generic",
      }),
    });

    const result = await response.json();

    if (!response.ok || (result.code && result.code !== "ok")) {
      return new Response(
        JSON.stringify({
          success: false,
          message: result.message ?? "SMS delivery failed",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "OTP sent via SMS",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Network error: " + String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
