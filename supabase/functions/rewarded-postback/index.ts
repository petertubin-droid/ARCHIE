import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Rewarded Ad Postback Handler
 *
 * Receives server-to-server postback callbacks from web rewarded ad providers
 * (AdGate Media, OfferToro, AdGem, CPX Research, Ayet Studios, RevU,
 * Wannads, MyLead, AdWork Media, RevenueHits, Notik, Bitcot Rewards).
 *
 * Each provider sends a different callback format. This function:
 * 1. Identifies the provider from the URL path or query params
 * 2. Validates the postback using provider-specific signatures/secrets
 * 3. Extracts the user identifier (client hash) and reward amount
 * 4. Grants the unlock via the rewarded_unlock_logs table
 * 5. The client polls checkRewardedUnlock and detects the unlock
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if both strings are equal in length and content.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Offerwall postback secret verification (standard providers).
 *
 * The identifier checks alone (gateway_id / app_id / placement …) are NOT
 * authentication — those values are public: they appear in the offerwall
 * URL rendered in the user's iframe. Anyone who completed one offer (or
 * read the URL) could previously forge
 *   /rewarded-postback/<slug>?user_id=<hash>&amount=100&app_id=<public>…
 * and mint unlocks/credits without watching anything.
 *
 * Real fix, phased so live postbacks don't break before the provider
 * dashboards are updated:
 *  - When the provider row has a SECRET credential configured
 *    (api_key / secret / secure_hash / app_signature / sdk_key), the
 *    postback URL must carry it as &sig=<secret> (or &secret=<secret>).
 *    The URL is configured in the provider's dashboard server-side, so
 *    the secret never appears in the browser. Mismatch → rejected.
 *  - When no secret is stored yet, the postback is allowed but a
 *    `postback_secret_missing` analytics event is logged so the admin
 *    sees which providers still need a secret added to their postback URL.
 */
async function offerwallSecretOk(
  supabase: ReturnType<typeof createClient>,
  providerSlug: string,
  provider: { credentials?: Record<string, unknown> } | null,
  url: URL,
): Promise<boolean> {
  const creds = provider?.credentials ?? {};
  let storedSecret =
    (typeof creds.api_key === "string" && creds.api_key) ||
    (typeof creds.secret === "string" && creds.secret) ||
    (typeof creds.secure_hash === "string" && creds.secure_hash) ||
    (typeof creds.app_signature === "string" && creds.app_signature) ||
    (typeof creds.sdk_key === "string" && creds.sdk_key) ||
    "";

  // Fall back to the Integrations page (integration_settings.config) when
  // the ad_providers row has no secret — admins may keep credentials in
  // either place. Service role can read both tables.
  if (!storedSecret) {
    const { data: integration } = await supabase
      .from("integration_settings")
      .select("config")
      .eq("integration_key", providerSlug)
      .maybeSingle();
    const iCreds = (integration?.config ?? {}) as Record<string, unknown>;
    storedSecret =
      (typeof iCreds.api_key === "string" && iCreds.api_key) ||
      (typeof iCreds.secret === "string" && iCreds.secret) ||
      (typeof iCreds.secure_hash === "string" && iCreds.secure_hash) ||
      "";
  }

  if (!storedSecret) {
    await supabase
      .from("ad_analytics_events")
      .insert({
        event_type: "postback_secret_missing",
        tool_key: "offerwall_security",
        metadata: {
          provider_slug: providerSlug,
          note: "Postback accepted without secret — add the provider's api_key/secret to its credentials and append &sig=<secret> to the postback URL in the provider dashboard.",
        },
      })
      .catch(() => {});
    return true;
  }

  const provided =
    url.searchParams.get("sig") ?? url.searchParams.get("secret") ?? "";
  if (provided && timingSafeEqual(provided, storedSecret)) {
    return true;
  }

  await supabase
    .from("ad_analytics_events")
    .insert({
      event_type: "postback_secret_mismatch",
      tool_key: "offerwall_security",
      client_hash:
        url.searchParams.get("user_id") ?? url.searchParams.get("uid") ?? "",
      metadata: {
        provider_slug: providerSlug,
        note: "Rejected offerwall postback: missing/incorrect secret param.",
      },
    })
    .catch(() => {});
  return false;
}

// Offerwall.ad event context (set during parsing, used in processing)
let owEventType = "";
let owOriginalTxId = "";
let owIsReversal = false;

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AD,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const providerSlug =
    pathParts[pathParts.length - 1] || url.searchParams.get("provider") || "";

  // Get Supabase client with service role (server-side, bypasses RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase configuration");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse postback data based on provider and method
  let clientHash = "";
  let toolKey = "";
  let rewardAmount = 0;
  let providerName = "";
  let isValid = false;

  // Reset Offerwall.ad event context
  owEventType = "";
  owOriginalTxId = "";
  owIsReversal = false;

  try {
    if (providerSlug === "adgate_media" || url.searchParams.has("af")) {
      // AdGate Media postback
      // GET /rewarded-postback/adgate_media?user_id=USER&credits=AMOUNT&gateway_id=XXXX
      clientHash = url.searchParams.get("user_id") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("credits") ?? "0");
      providerName = "AdGate Media";
      const gatewayId = url.searchParams.get("gateway_id") ?? "";
      // Validate against ad_providers credentials
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "adgate_media")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.gateway_id === gatewayId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "offertoro" || url.searchParams.has("pub")) {
      // OfferToro postback
      // GET /rewarded-postback/offertoro?user_id=USER&amount=AMOUNT&app_id=XXXX&pub=PUB
      clientHash = url.searchParams.get("user_id") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "OfferToro";
      const appId = url.searchParams.get("app_id") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "offertoro")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.app_id === appId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "adgem" || url.searchParams.has("placement")) {
      // AdGem postback
      clientHash = url.searchParams.get("user_id") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "AdGem";
      const placementId = url.searchParams.get("placement") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "adgem")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.placement_id === placementId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "cpx_research") {
      // CPX Research postback
      clientHash = url.searchParams.get("ext_user_id") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("payout") ?? "0");
      providerName = "CPX Research";
      const secureHash = url.searchParams.get("secure_hash") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "cpx_research")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.secure_hash === secureHash &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "ayet_studios") {
      // Ayet Studios postback
      clientHash = url.searchParams.get("user") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "Ayet Studios";
      const appId = url.searchParams.get("appid") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "ayet_studios")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.app_id === appId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "revu") {
      // RevU postback
      clientHash = url.searchParams.get("user_id") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "RevU";
      const placementId = url.searchParams.get("placement_id") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "revu")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.placement_id === placementId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "wannads") {
      // Wannads postback
      clientHash = url.searchParams.get("userid") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "Wannads";
      const subId = url.searchParams.get("subid") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "wannads")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.sub_id === subId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "my_lead") {
      // MyLead postback
      clientHash = url.searchParams.get("uid") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("payout") ?? "0");
      providerName = "MyLead";
      const appId = url.searchParams.get("app") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "my_lead")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.app_id === appId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "adwork_media") {
      // AdWork Media postback
      clientHash = url.searchParams.get("uid") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "AdWork Media";
      const campId = url.searchParams.get("camp") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "adwork_media")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.campaign_id === campId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "revenuehits") {
      // RevenueHits postback
      clientHash = url.searchParams.get("user") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "RevenueHits";
      const clientId = url.searchParams.get("client") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "revenuehits")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.client_id === clientId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "notik") {
      // Notik postback
      clientHash = url.searchParams.get("user") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "Notik";
      const appId = url.searchParams.get("app") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "notik")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.app_id === appId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "bitcot") {
      // Bitcot postback
      clientHash = url.searchParams.get("user") ?? "";
      rewardAmount = parseFloat(url.searchParams.get("amount") ?? "0");
      providerName = "Bitcot Rewards";
      const appId = url.searchParams.get("app") ?? "";
      const { data: provider } = await supabase
        .from("ad_providers")
        .select("credentials")
        .eq("slug", "bitcot")
        .eq("is_active", true)
        .maybeSingle();
      if (
        provider?.credentials?.app_id === appId &&
        (await offerwallSecretOk(supabase, providerSlug, provider, url))
      ) {
        isValid = true;
      }
      toolKey = url.searchParams.get("tool_key") ?? "advanced_calculator";
    } else if (providerSlug === "offerwall_ad") {
      // ── Offerwall.ad HMAC-signed postback ──
      // The signing secret is stored as OFFERWALL_AD_SIGNING_SECRET
      // env var. It is NEVER read from the database or frontend.
      providerName = "Offerwall Ad";

      // Read query params
      const owUid = url.searchParams.get("uid") ?? "";
      const owAmountRaw = url.searchParams.get("amount") ?? "";
      const owTxId =
        url.searchParams.get("tx_id") ??
        url.searchParams.get("transaction_id") ??
        "";

      // Read HMAC + event headers
      const signatureHeader = req.headers.get("X-Offerwall-Ad-Signature") ?? "";
      const eventHeader = req.headers.get("X-Offerwall-Ad-Event") ?? "";
      const eventIdHeader = req.headers.get("X-Offerwall-Ad-Event-Id") ?? "";

      // Read shared password from query (if configured)
      const sharedPassword =
        url.searchParams.get("password") ??
        url.searchParams.get("secret") ??
        url.searchParams.get("token") ??
        url.searchParams.get("api_key") ??
        "";

      // ── Parameter validation ──
      if (!owUid) {
        console.error("Offerwall postback: missing uid");
        return jsonResponse({ error: "Missing uid" }, 400);
      }
      if (!owAmountRaw) {
        console.error("Offerwall postback: missing amount");
        return jsonResponse({ error: "Missing amount" }, 400);
      }
      if (!owTxId && !eventIdHeader) {
        console.error("Offerwall postback: missing transaction/event ID");
        return jsonResponse({ error: "Missing tx_id" }, 400);
      }

      const owAmount = parseFloat(owAmountRaw);
      if (isNaN(owAmount) || owAmount <= 0) {
        console.error("Offerwall postback: invalid amount", owAmountRaw);
        return jsonResponse({ error: "Invalid amount" }, 400);
      }

      // ── HMAC signature verification ──
      const signingSecret = Deno.env.get("OFFERWALL_AD_SIGNING_SECRET") ?? "";

      if (!signingSecret) {
        console.error(
          "Offerwall postback: OFFERWALL_AD_SIGNING_SECRET not configured",
        );
        return jsonResponse({ error: "Server configuration error" }, 500);
      }

      if (!signatureHeader) {
        console.error("Offerwall postback: missing X-Offerwall-Ad-Signature");
        return jsonResponse({ error: "Missing signature" }, 401);
      }

      // Read the raw body once — needed regardless of method since
      // Offerwall Ad's current published spec signs the raw request
      // body: X-Offerwall-Ad-Signature: sha256=HMAC_SHA256(raw_body, secret)
      // See: https://offerwall.ad/help/verify-publisher-webhook-signatures
      // For GET-configured callbacks the body is typically empty, so we
      // also try the URL / query-string as fallback candidates — this
      // keeps compatibility with GET deliveries that sign the request
      // line instead of an (empty) body, without weakening security
      // (every candidate still requires the correct shared secret to
      // produce a matching signature).
      let rawBody = "";
      try {
        rawBody = await req.text();
      } catch {
        rawBody = "";
      }

      const receivedSig = signatureHeader.startsWith("sha256=")
        ? signatureHeader.slice(7)
        : signatureHeader;

      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(signingSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      async function computeHmacHex(payload: string): Promise<string> {
        const sigBuf = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(payload),
        );
        return Array.from(new Uint8Array(sigBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      // Candidate payloads, tried in order of likelihood per current docs.
      // Offerwall Ad docs: "HMAC_SHA256(raw_body, secret)"
      // For GET callbacks raw_body is empty. But some implementations
      // sign the query string, the path+query, or other variants.
      const pathAndQuery = url.pathname + url.search;
      const pathOnly = url.pathname;
      const candidates: Array<{ label: string; payload: string }> = [
        { label: "raw_body", payload: rawBody },
        { label: "full_url", payload: req.url },
        { label: "query_string_with_qmark", payload: url.search },
        { label: "query_string_no_qmark", payload: url.search.slice(1) },
        { label: "path_plus_query", payload: pathAndQuery },
        { label: "path_only", payload: pathOnly },
        {
          label: "path_plus_query_no_provider",
          payload: url.pathname.replace("/offerwall_ad", "") + url.search,
        },
      ];

      let sigValid = false;
      let matchedCandidate = "";
      for (const candidate of candidates) {
        // Skip empty payloads except raw_body (an empty body is a
        // legitimate case for GET requests with no body at all).
        if (candidate.payload === "" && candidate.label !== "raw_body")
          continue;
        const computedHex = await computeHmacHex(candidate.payload);
        if (timingSafeEqual(computedHex, receivedSig)) {
          sigValid = true;
          matchedCandidate = candidate.label;
          break;
        }
      }

      if (!sigValid) {
        // Store debug info to ad_analytics_events so we can read it back
        const debugCandidates = await Promise.all(
          candidates.map(async (c) => ({
            label: c.label,
            payloadPreview: c.payload.slice(0, 300),
            payloadLength: c.payload.length,
            computedHex:
              c.payload === "" && c.label !== "raw_body"
                ? null
                : await computeHmacHex(c.payload),
          })),
        );
        const allHeaders: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          allHeaders[key] = key.toLowerCase().includes("secret")
            ? "[REDACTED]"
            : value;
        });
        const debugData = {
          method: req.method,
          receivedSig,
          receivedSigLen: receivedSig.length,
          secretByteLength: new TextEncoder().encode(signingSecret).length,
          reqUrl: req.url,
          reqPath: url.pathname,
          reqSearch: url.search,
          rawBodyLen: rawBody.length,
          rawBodyPreview: rawBody.slice(0, 300),
          allHeaders,
          candidates: debugCandidates,
        };
        // Write to ad_analytics_events for later retrieval
        await supabase.from("ad_analytics_events").insert({
          event_type: "sig_debug",
          tool_key: "offerwall_ad",
          client_hash: owUid || "unknown",
          metadata: debugData,
        });
        return jsonResponse(
          {
            error: "Invalid signature",
            debug: debugData,
          },
          403,
        );
      }

      console.log(
        `Offerwall postback: signature verified via "${matchedCandidate}"`,
      );

      // ── Shared password verification (if configured) ──
      const expectedPassword =
        Deno.env.get("OFFERWALL_AD_SHARED_PASSWORD") ?? "";
      if (expectedPassword && sharedPassword !== expectedPassword) {
        console.error("Offerwall postback: shared password mismatch");
        return jsonResponse({ error: "Invalid credentials" }, 403);
      }

      // ── Event type handling ──
      const eventType = eventHeader || "conversion.approved";
      const eventId = eventIdHeader || owTxId;

      // Determine if this event should award, reverse, or ignore
      const _isAwardable =
        eventType === "conversion.approved" ||
        eventType === "conversion.released";
      const isReversal = eventType === "conversion.reversed";
      const isIgnorable =
        eventType === "conversion.held" || eventType === "conversion.rejected";

      if (isIgnorable) {
        console.log(
          `Offerwall event ${eventType} for tx ${owTxId}, uid ${owUid} — not awarding`,
        );
        return jsonResponse({
          success: true,
          message: `Event ${eventType} acknowledged — no credits awarded`,
        });
      }

      // Store values for the processing section
      clientHash = owUid;
      rewardAmount = owAmount;
      isValid = true;
      toolKey = eventId; // Use event ID for idempotency

      // Store event type in a way the processing section can read
      owEventType = eventType;
      owOriginalTxId = isReversal ? owTxId : "";
      owIsReversal = isReversal;
    } else {
      return jsonResponse(
        { error: "Unknown provider", slug: providerSlug },
        400,
      );
    }
  } catch (e) {
    console.error("Postback parsing error:", e);
    return jsonResponse({ error: "Failed to parse postback" }, 400);
  }

  if (!isValid) {
    console.error("Postback validation failed for", providerName);
    return jsonResponse(
      { error: "Invalid postback — credential mismatch" },
      403,
    );
  }

  if (!clientHash) {
    return jsonResponse({ error: "Missing user identifier" }, 400);
  }

  // ── Offerwall.ad: HMAC-verified credit processing ──
  if (providerSlug === "offerwall_ad") {
    const userId = clientHash;
    const credits = Math.max(1, Math.round(rewardAmount));
    const eventId = toolKey;

    try {
      if (owIsReversal) {
        // ── Reversal: deduct previously awarded credits ──
        const { data: revResult, error: revError } = await supabase.rpc(
          "reverse_offerwall_credits",
          {
            p_user_id: userId,
            p_provider: "offerwall_ad",
            p_event_id: eventId,
            p_original_tx_id: owOriginalTxId,
            p_amount: credits,
            p_metadata: {
              postback: true,
              event_type: owEventType,
              raw_amount: rewardAmount,
            },
          },
        );

        if (revError) {
          console.error("Offerwall reversal RPC error:", revError);
          return jsonResponse({ error: "Failed to process reversal" }, 500);
        }

        const revRow = revResult?.[0];
        if (!revRow?.success) {
          // Idempotent — reversal already processed or original not found
          return jsonResponse({
            success: true,
            message: "Reversal already processed or original not found",
            already_reversed: true,
          });
        }

        // Log analytics
        const { data: owProviderData } = await supabase
          .from("ad_providers")
          .select("id")
          .eq("slug", "offerwall_ad")
          .maybeSingle();

        await supabase.from("ad_analytics_events").insert({
          event_type: "reversal",
          provider_id: owProviderData?.id ?? null,
          tool_key: "earn_credits",
          client_hash: userId,
          revenue_estimated: -rewardAmount,
          metadata: {
            provider_slug: providerSlug,
            event_type: owEventType,
            event_id: eventId,
            original_tx_id: owOriginalTxId,
            credits_reversed: credits,
          },
        });

        console.log(
          `Offerwall reversal processed: -${credits} from user ${userId}, event ${eventId}`,
        );
        return jsonResponse({
          success: true,
          message: "Reversal processed",
          credits_reversed: credits,
          new_balance: revRow.new_balance,
        });
      } else {
        // ── Award: credit approved/released conversion ──
        const { data: result, error: rpcError } = await supabase.rpc(
          "award_offerwall_credits",
          {
            p_user_id: userId,
            p_provider: "offerwall_ad",
            p_event_id: eventId,
            p_amount: credits,
            p_event_type: owEventType,
            p_metadata: {
              postback: true,
              provider_slug: providerSlug,
              raw_amount: rewardAmount,
            },
          },
        );

        if (rpcError) {
          console.error("Offerwall credit award RPC error:", rpcError);
          return jsonResponse({ error: "Failed to award credits" }, 500);
        }

        const row = result?.[0];
        if (!row?.success) {
          if (row?.error === "already_awarded") {
            // Idempotent — return 200 so Offerwall.ad doesn't retry
            return jsonResponse({
              success: true,
              message: "Already awarded",
              already_awarded: true,
            });
          }
          console.error("Offerwall award failed:", row?.error);
          return jsonResponse({ error: row?.error ?? "Award failed" }, 400);
        }

        // Log analytics
        const { data: owProviderData } = await supabase
          .from("ad_providers")
          .select("id")
          .eq("slug", "offerwall_ad")
          .maybeSingle();

        await supabase.from("ad_analytics_events").insert({
          event_type: "reward",
          provider_id: owProviderData?.id ?? null,
          tool_key: "earn_credits",
          client_hash: userId,
          revenue_estimated: rewardAmount,
          metadata: {
            provider_slug: providerSlug,
            event_type: owEventType,
            event_id: eventId,
            credits_awarded: credits,
          },
        });

        console.log(
          `Offerwall credits awarded: ${credits} to user ${userId}, event ${eventId}, type ${owEventType}`,
        );
        return jsonResponse({
          success: true,
          message: "Credits awarded",
          credits: credits,
          new_balance: row.new_balance,
        });
      }
    } catch (e) {
      console.error("Offerwall postback processing error:", e);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  }

  // ── Standard providers: Grant unlock ──
  const now = new Date();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  const expiresAt = endOfDay.toISOString();

  try {
    // Insert unlock record
    const { error: insertError } = await supabase
      .from("rewarded_unlock_log")
      .insert({
        tool_key: toolKey,
        client_hash: clientHash,
        ad_provider: providerName,
        unlock_date: now.toISOString().slice(0, 10),
        unlocked_at: now.toISOString(),
        expires_at: expiresAt,
        ad_revenue_estimated: rewardAmount,
      });

    if (insertError) {
      console.error("Failed to insert unlock:", insertError);
      return jsonResponse({ error: "Failed to grant unlock" }, 500);
    }

    // Log the ad event
    const { data: providerData } = await supabase
      .from("ad_providers")
      .select("id")
      .eq("slug", providerSlug)
      .maybeSingle();

    await supabase.from("ad_analytics_events").insert({
      event_type: "reward",
      provider_id: providerData?.id ?? null,
      tool_key: toolKey,
      client_hash: clientHash,
      revenue_estimated: rewardAmount,
      metadata: { provider_slug: providerSlug, postback: true },
    });

    console.log(
      `Unlock granted via ${providerName} postback for ${clientHash}`,
    );
    return jsonResponse({ success: true, message: "Unlock granted" });
  } catch (e) {
    console.error("Postback processing error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
