// FRELUX Market Intelligence — Crawl Edge Function
//
// Server-side crawl execution. Supports:
//   - Manual crawl (admin-triggered via POST)
//   - Scheduled crawl (triggered by pg_cron or Supabase scheduled function)
//   - Test crawl (fetch + extract only, no price publication)
//
// This edge function runs server-side. No browser required.
// The FRELUX Direct Crawler requires no external API key.
//
// Security:
//   - Requires authentication (Authorization header)
//   - Admin role verification via is_admin()
//   - SSRF protection in the fetcher
//   - Rate limiting in the fetcher
//   - Only crawls active, approved sources from mi_sources
//
// Usage:
//   POST /functions/v1/market-intelligence-crawl
//   {
//     "sourceId": "uuid",
//     "mode": "test" | "production",
//     "targetUrl": "optional specific URL"
//   }
//
//   GET /functions/v1/market-intelligence-crawl?schedule=true
//   (Called by pg_cron scheduler — no body needed)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Crawler configuration
const CRAWLER_CONFIG = {
  requestTimeoutMs: 15000,
  maxResponseSizeBytes: 5_242_880,
  maxRedirects: 5,
  minDelayBetweenRequestsMs: 2000,
  maxPagesPerCrawl: 10,
  maxCrawlDurationMs: 120_000,
  anomalyDeviationThreshold: 0.35,
  autoApproveEnabled: false,
  userAgent: "FRELUX-Market-Intelligence-Bot/1.0 (+https://freluxtools.com)",
  acceptedContentTypes: [
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/plain",
  ],
};

// ============================================================
// MAIN HANDLER
// ============================================================

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AI,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);

    // Scheduled crawl trigger
    if (url.searchParams.get("schedule") === "true") {
      return await handleScheduledCrawl();
    }

    // Manual crawl trigger (admin only)
    if (req.method === "POST") {
      return await handleManualCrawl(req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse(
      { error: "Internal server error", message: error.message },
      500,
    );
  }
});

// ============================================================
// MANUAL CRAWL (Admin-triggered)
// ============================================================

async function handleManualCrawl(req: Request): Promise<Response> {
  // Verify authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized — no auth header" }, 401);
  }

  // Create client with user's auth to verify admin status
  const userSupabase = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: userData, error: userError } =
    await userSupabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Unauthorized — invalid session" }, 401);
  }

  // Verify admin status
  const { data: isAdmin } = await supabase.rpc("is_admin", {
    user_id: userData.user.id,
  });
  if (!isAdmin) {
    return jsonResponse({ error: "Forbidden — admin access required" }, 403);
  }

  // Parse request body
  const body = await req.json();
  const { sourceId, mode = "test", targetUrl } = body;

  if (!sourceId) {
    return jsonResponse({ error: "sourceId is required" }, 400);
  }

  // Fetch source from database
  const { data: source, error: sourceError } = await supabase
    .from("mi_sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (sourceError || !source) {
    return jsonResponse({ error: "Source not found" }, 404);
  }

  // Verify source is active
  if (!source.is_active) {
    return jsonResponse({ error: "Source is not active" }, 400);
  }

  // Execute crawl
  const result = await executeCrawlServerSide(
    source,
    mode,
    targetUrl,
    userData.user.id,
  );

  return jsonResponse(result, 200);
}

// ============================================================
// SCHEDULED CRAWL (pg_cron triggered)
// ============================================================

async function handleScheduledCrawl(): Promise<Response> {
  // Find sources that need crawling based on crawl_frequency
  const now = new Date();
  const _today = now.toISOString().split("T")[0];

  // Get active sources with scheduled frequency (not manual)
  const { data: sources, error } = await supabase
    .from("mi_sources")
    .select("*")
    .eq("is_active", true)
    .in("crawl_frequency", ["daily", "weekly", "monthly"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(5); // Max 5 sources per scheduled run

  if (error || !sources || sources.length === 0) {
    return jsonResponse({ message: "No sources due for crawling", sources: 0 });
  }

  // Filter sources that are actually due
  const dueSources = sources.filter((source) => {
    if (!source.last_checked_at) return true;
    const lastChecked = new Date(source.last_checked_at);
    const daysSince =
      (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60 * 24);
    if (source.crawl_frequency === "daily") return daysSince >= 1;
    if (source.crawl_frequency === "weekly") return daysSince >= 7;
    if (source.crawl_frequency === "monthly") return daysSince >= 30;
    return false;
  });

  if (dueSources.length === 0) {
    return jsonResponse({ message: "No sources due for crawling", sources: 0 });
  }

  // Execute crawls sequentially (not parallel — rate limiting)
  const results = [];
  for (const source of dueSources) {
    try {
      const result = await executeCrawlServerSide(
        source,
        "production",
        null,
        null,
      );
      results.push({
        sourceId: source.id,
        sourceName: source.source_name,
        status: result.status,
      });
    } catch (error) {
      results.push({
        sourceId: source.id,
        sourceName: source.source_name,
        status: "failed",
        error: error.message,
      });
    }
  }

  return jsonResponse({
    message: "Scheduled crawl completed",
    sources: dueSources.length,
    results,
  });
}

// ============================================================
// SERVER-SIDE CRAWL EXECUTION
// ============================================================

async function executeCrawlServerSide(
  source: Record<string, unknown>,
  mode: string,
  targetUrl: string | null,
  _adminUserId: string | null,
): Promise<Record<string, unknown>> {
  const jobId = crypto.randomUUID();
  const startedAt = Date.now();

  const job: Record<string, unknown> = {
    jobId,
    sourceId: source.id,
    sourceName: source.source_name,
    providerName: "FRELUX Crawler",
    status: "pending",
    mode,
    startedAt: new Date(startedAt).toISOString(),
    pagesRequested: 0,
    pagesFetched: 0,
    productsDiscovered: 0,
    pricesDiscovered: 0,
    pricesAccepted: 0,
    pricesReviewRequired: 0,
    pricesRejected: 0,
    anomaliesDetected: 0,
    errors: [],
    warnings: [],
    message: "",
  };

  // Determine URL
  const crawlUrl = targetUrl ?? source.source_url;
  if (!crawlUrl) {
    job.status = "failed";
    job.message = "No URL to crawl";
    job.errors = [
      { type: "INVALID_URL", message: "Source has no URL configured" },
    ];
    return finishAndLog(job, startedAt, source, supabase);
  }

  // Validate URL
  const urlValidation = validateUrlServerSide(crawlUrl as string);
  if (!urlValidation.valid) {
    job.status = "failed";
    job.message = `URL validation failed: ${urlValidation.reason}`;
    job.errors = [
      { type: "SSRF_BLOCKED", message: urlValidation.reason, url: crawlUrl },
    ];
    return finishAndLog(job, startedAt, source, supabase);
  }

  // Fetch the page
  job.status = "fetching";
  job.pagesRequested = 1;

  try {
    const fetchResult = await fetchPageServerSide(
      urlValidation.sanitized!,
      CRAWLER_CONFIG,
      source.domain as string,
    );

    if (!fetchResult.success) {
      job.status = "failed";
      job.message = `Fetch failed: ${fetchResult.error}`;
      job.errors = [
        {
          type: fetchResult.errorType,
          message: fetchResult.error,
          url: crawlUrl,
        },
      ];

      // Update source health
      await supabase
        .from("mi_sources")
        .update({
          last_checked_at: new Date().toISOString(),
          last_error: fetchResult.error,
        })
        .eq("id", source.id);

      return finishAndLog(job, startedAt, source, supabase);
    }

    job.pagesFetched = 1;

    // Extract products
    const extraction = extractFromHtmlServerSide(
      fetchResult.html,
      urlValidation.sanitized!,
    );
    job.productsDiscovered = extraction.products.length;

    if (extraction.renderingRequired && extraction.products.length === 0) {
      job.status = "skipped";
      job.warnings = ["Page requires JavaScript rendering"];
      job.errors = [
        {
          type: "RENDERING_REQUIRED",
          message: "JavaScript rendering required",
        },
      ];
      job.message = "Rendering required — direct crawler cannot extract data";

      await supabase
        .from("mi_sources")
        .update({
          last_checked_at: new Date().toISOString(),
          last_error: "RENDERING_REQUIRED",
        })
        .eq("id", source.id);

      return finishAndLog(job, startedAt, source, supabase);
    }

    if (extraction.products.length === 0) {
      job.status = "completed";
      job.warnings = ["No products found"];
      job.message = "Crawl completed — no products found";

      await supabase
        .from("mi_sources")
        .update({
          last_checked_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
        })
        .eq("id", source.id);

      return finishAndLog(job, startedAt, source, supabase);
    }

    // Process products — create observations
    job.status = "validating";
    const observationIds = [];

    for (const product of extraction.products) {
      if (product.price === null || product.price <= 0) {
        (job.warnings as string[]).push(
          `Product "${product.productName}" — no price`,
        );
        continue;
      }

      (job as Record<string, unknown>).pricesDiscovered =
        (job.pricesDiscovered as number) + 1;

      // Determine currency
      let currency = product.currency;
      if (!currency) {
        currency = deriveCurrency(source.country_code as string);
      }

      // Insert observation
      const { data: observation, error: obsError } = await supabase
        .from("mi_price_observations")
        .insert({
          market_code: source.country_code,
          country_code: source.country_code,
          region: source.region,
          city: source.city,
          source_id: source.id,
          original_product_name: product.productName,
          normalized_name: product.productName,
          normalized_brand: product.brand,
          normalized_category: product.category,
          package_size: product.packageSize,
          package_unit: product.packageUnit,
          price: product.price,
          currency_code: currency,
          match_confidence: product.confidence,
          validation_status:
            mode === "test" ? "review_required" : "review_required",
          freshness: "fresh",
          source_url: urlValidation.sanitized,
          collected_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (obsError) {
        (job.errors as unknown[]).push({
          type: "PARSE_ERROR",
          message: `Failed to create observation: ${obsError.message}`,
        });
        continue;
      }

      observationIds.push(observation.id);

      if (mode === "production" && product.confidence === "high") {
        // Auto-approve high-confidence observations only in production mode
        await supabase
          .from("mi_price_observations")
          .update({
            validation_status: "approved",
            reviewed_at: new Date().toISOString(),
            review_action: "auto_approved",
          })
          .eq("id", observation.id);

        (job as Record<string, unknown>).pricesAccepted =
          (job.pricesAccepted as number) + 1;

        // Upsert approved price
        await supabase.from("mi_approved_prices").upsert(
          {
            market_code: source.country_code,
            product_name: product.productName,
            brand: product.brand,
            category: product.category ?? "uncategorized",
            package_size: product.packageSize ?? 1,
            package_unit: product.packageUnit ?? "unit",
            price: product.price,
            currency_code: currency,
            source_count: 1,
            confidence: product.confidence,
            freshness: "fresh",
            source_observations: [observation.id],
            auto_approved: true,
            region: source.region,
            city: source.city,
            is_active: true,
          },
          {
            onConflict:
              "market_code,canonical_product_id,package_size,package_unit",
          },
        );
      } else {
        (job as Record<string, unknown>).pricesReviewRequired =
          (job.pricesReviewRequired as number) + 1;
      }
    }

    (job as Record<string, unknown>).observationIds = observationIds;

    // Final status
    if ((job.errors as unknown[]).length > 0 && observationIds.length > 0) {
      job.status = "partial";
    } else if (
      (job.errors as unknown[]).length > 0 &&
      observationIds.length === 0
    ) {
      job.status = "failed";
    } else {
      job.status = "completed";
    }

    job.message = `Crawl ${job.status} — ${extraction.products.length} products, ${observationIds.length} observations`;

    // Update source health
    const success = job.status === "completed" || job.status === "partial";
    await supabase
      .from("mi_sources")
      .update({
        last_checked_at: new Date().toISOString(),
        last_success_at: success ? new Date().toISOString() : null,
        last_error: success
          ? null
          : ((job.errors as Array<{ message: string }>)[0]?.message ?? null),
      })
      .eq("id", source.id);

    return finishAndLog(job, startedAt, source, supabase);
  } catch (error) {
    job.status = "failed";
    job.message = `Crawl failed: ${error.message}`;
    (job.errors as unknown[]).push({ type: "UNKNOWN", message: error.message });

    await supabase
      .from("mi_sources")
      .update({
        last_checked_at: new Date().toISOString(),
        last_error: error.message,
      })
      .eq("id", source.id);

    return finishAndLog(job, startedAt, source, supabase);
  }
}

// ============================================================
// URL VALIDATION (Server-Side)
// ============================================================

function validateUrlServerSide(rawUrl: string): {
  valid: boolean;
  reason: string | null;
  sanitized: string | null;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, reason: "URL is empty", sanitized: null };
  }

  const trimmed = rawUrl.trim();

  // Reject dangerous protocols
  if (
    /^(file|ftp|gopher|ws|wss|ldap|dict|sftp|tftp|jar|netdoc)/i.test(trimmed)
  ) {
    return { valid: false, reason: "Protocol not allowed", sanitized: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Invalid URL format", sanitized: null };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      reason: `Protocol "${parsed.protocol}" not allowed`,
      sanitized: null,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private/internal hosts
  const blocked = [
    "localhost",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
  ];
  if (blocked.includes(hostname)) {
    return {
      valid: false,
      reason: `Blocked hostname: ${hostname}`,
      sanitized: null,
    };
  }

  // Check for private IPs
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    const parts = hostname.split(".").map((p) => parseInt(p));
    const [a, b] = parts;
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      return {
        valid: false,
        reason: `Private IP blocked: ${hostname}`,
        sanitized: null,
      };
    }
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: "URLs with credentials are not allowed",
      sanitized: null,
    };
  }

  return { valid: true, reason: null, sanitized: parsed.toString() };
}

// ============================================================
// PAGE FETCHER (Server-Side)
// ============================================================

async function fetchPageServerSide(
  url: string,
  config: typeof CRAWLER_CONFIG,
  _allowedDomain: string | null,
): Promise<{
  success: boolean;
  html: string;
  error: string | null;
  errorType: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.requestTimeoutMs,
    );

    // Check robots.txt first
    const robotsUrl = `${new URL(url).protocol}//${new URL(url).hostname}/robots.txt`;
    let robotsAllowed = true;
    try {
      const robotsResponse = await fetch(robotsUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": config.userAgent },
      });
      if (robotsResponse.ok) {
        const robotsText = await robotsResponse.text();
        // Simple check: if our user-agent or * is explicitly disallowed for the path
        const path = new URL(url).pathname;
        const disallowLines = robotsText
          .split("\n")
          .filter((l) => /^\s*Disallow:/i.test(l));
        for (const line of disallowLines) {
          const disallowPath = line.replace(/^\s*Disallow:\s*/i, "").trim();
          if (disallowPath === "/") {
            robotsAllowed = false;
            break;
          }
          if (disallowPath && path.startsWith(disallowPath)) {
            robotsAllowed = false;
            break;
          }
        }
      }
    } catch {
      // If robots.txt can't be fetched, proceed (conservative)
    }

    if (!robotsAllowed) {
      return {
        success: false,
        html: "",
        error: "Blocked by robots.txt",
        errorType: "ROBOTS_DISALLOWED",
      };
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": config.userAgent,
        Accept: config.acceptedContentTypes.join(", "),
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "close",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorType =
        response.status === 403
          ? "HTTP_403"
          : response.status === 404
            ? "HTTP_404"
            : response.status >= 500
              ? "HTTP_500"
              : "HTTP_OTHER";
      return {
        success: false,
        html: "",
        error: `HTTP ${response.status}`,
        errorType,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isAccepted = config.acceptedContentTypes.some((t) =>
      contentType.toLowerCase().includes(t),
    );
    if (!isAccepted) {
      return {
        success: false,
        html: "",
        error: `Unsupported content type: ${contentType}`,
        errorType: "UNSUPPORTED_CONTENT_TYPE",
      };
    }

    const contentLength = parseInt(
      response.headers.get("content-length") ?? "0",
      10,
    );
    if (contentLength > config.maxResponseSizeBytes) {
      return {
        success: false,
        html: "",
        error: "Content too large",
        errorType: "CONTENT_TOO_LARGE",
      };
    }

    const html = await response.text();
    if (html.length > config.maxResponseSizeBytes) {
      return {
        success: false,
        html: "",
        error: "Content too large",
        errorType: "CONTENT_TOO_LARGE",
      };
    }

    return { success: true, html, error: null, errorType: null };
  } catch (error) {
    const errorType =
      error.name === "AbortError" ? "FETCH_TIMEOUT" : "CONNECTION_ERROR";
    return { success: false, html: "", error: error.message, errorType };
  }
}

// ============================================================
// HTML EXTRACTION (Server-Side)
// ============================================================

function extractFromHtmlServerSide(
  html: string,
  _url: string,
): {
  products: Array<Record<string, unknown>>;
  renderingRequired: boolean;
} {
  const products: Array<Record<string, unknown>> = [];

  // 1. JSON-LD extraction
  const jsonLdRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const graphItems = item["@graph"] ? item["@graph"] : [item];
        for (const graphItem of graphItems) {
          if (
            graphItem["@type"] &&
            String(graphItem["@type"]).toLowerCase().includes("product")
          ) {
            const name = graphItem.name;
            if (!name) continue;

            let price: number | null = null;
            let currency: string | null = null;
            const offers = graphItem.offers;
            if (offers) {
              const offerList = Array.isArray(offers) ? offers : [offers];
              for (const offer of offerList) {
                if (offer.price !== undefined) {
                  price =
                    typeof offer.price === "string"
                      ? parseFloat(offer.price)
                      : offer.price;
                } else if (offer.lowPrice !== undefined) {
                  price =
                    typeof offer.lowPrice === "string"
                      ? parseFloat(offer.lowPrice)
                      : offer.lowPrice;
                }
                if (offer.priceCurrency)
                  currency = String(offer.priceCurrency).toUpperCase();
                if (price !== null) break;
              }
            }

            products.push({
              productName: name,
              price,
              currency,
              brand:
                typeof graphItem.brand === "string"
                  ? graphItem.brand
                  : (graphItem.brand?.name ?? null),
              category:
                typeof graphItem.category === "string"
                  ? graphItem.category
                  : (graphItem.category?.name ?? null),
              packageSize: extractPackageServerSide(name),
              packageUnit: extractPackageUnitServerSide(name),
              stockStatus: null,
              confidence: price !== null ? "high" : "medium",
            });
          }
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  if (products.length > 0) {
    return { products, renderingRequired: false };
  }

  // 2. Open Graph extraction
  const getMeta = (prop: string): string | null => {
    const regex = new RegExp(
      `<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    const m = html.match(regex);
    return m ? m[1] : null;
  };

  const ogTitle = getMeta("og:title");
  if (ogTitle) {
    const priceStr =
      getMeta("product:price:amount") || getMeta("og:price:amount");
    const currency =
      getMeta("product:price:currency") || getMeta("og:price:currency");
    let price: number | null = null;
    if (priceStr) {
      price = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (isNaN(price)) price = null;
    }

    products.push({
      productName: ogTitle,
      price,
      currency: currency?.toUpperCase() ?? null,
      brand: null,
      category: null,
      packageSize: extractPackageServerSide(ogTitle),
      packageUnit: extractPackageUnitServerSide(ogTitle),
      stockStatus: null,
      confidence: price !== null ? "medium" : "low",
    });

    return { products, renderingRequired: false };
  }

  // 3. HTML element extraction
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const productName = h1Match[1].replace(/<[^>]+>/g, "").trim();
    // Only extract if it looks like a construction product
    const lower = productName.toLowerCase();
    const isConstruction = [
      "cement",
      "paint",
      "tile",
      "screeding",
      "pop",
      "roofing",
      "block",
      "white cement",
      "grout",
      "adhesive",
    ].some((kw) => lower.includes(kw));

    if (isConstruction) {
      // Try to find a price
      const priceInfo = extractPriceServerSide(html);
      products.push({
        productName,
        price: priceInfo.price,
        currency: priceInfo.currency,
        brand: null,
        category: null,
        packageSize: extractPackageServerSide(productName),
        packageUnit: extractPackageUnitServerSide(productName),
        stockStatus: null,
        confidence: "low",
      });
    }
  }

  // Check for JS rendering requirement
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const renderingRequired =
    textContent.length < 200 && (html.match(/<script\b/gi) || []).length > 5;

  return { products, renderingRequired };
}

function extractPackageServerSide(name: string): number | null {
  const match = name
    .toLowerCase()
    .match(
      /(\d+(?:\.\d+)?)\s*(kg|kilogram|l|litre|liters?|litres?|carton|pack|bag|bucket)/,
    );
  return match ? parseFloat(match[1]) : null;
}

function extractPackageUnitServerSide(name: string): string | null {
  const match = name
    .toLowerCase()
    .match(
      /\d+(?:\.\d+)?\s*(kg|kilogram|l|litre|liters?|litres?|carton|pack|bag|bucket)/,
    );
  if (!match) return null;
  const unit = match[1];
  if (unit === "kg" || unit === "kilogram") return "kg";
  if (unit === "l" || unit.startsWith("litre") || unit.startsWith("liter"))
    return "litres";
  return unit;
}

function extractPriceServerSide(html: string): {
  price: number | null;
  currency: string | null;
} {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ");
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /₦\s*([\d,]+(?:\.\d+)?)/, currency: "NGN" },
    { regex: /\bNGN\s*([\d,]+(?:\.\d+)?)/i, currency: "NGN" },
    { regex: /\bGHS\s*([\d,]+(?:\.\d+)?)/i, currency: "GHS" },
    { regex: /₵\s*([\d,]+(?:\.\d+)?)/, currency: "GHS" },
    { regex: /\bKES\s*([\d,]+(?:\.\d+)?)/i, currency: "KES" },
    { regex: /\bKSh\s*([\d,]+(?:\.\d+)?)/i, currency: "KES" },
    { regex: /\bZAR\s*([\d,]+(?:\.\d+)?)/i, currency: "ZAR" },
  ];
  for (const { regex, currency } of patterns) {
    const match = text.match(regex);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(price) && price > 0) return { price, currency };
    }
  }
  return { price: null, currency: null };
}

function deriveCurrency(marketCode: string): string {
  const map: Record<string, string> = {
    NG: "NGN",
    GH: "GHS",
    KE: "KES",
    ZA: "ZAR",
  };
  return map[marketCode] ?? "NGN";
}

// ============================================================
// LOG + FINISH
// ============================================================

async function finishAndLog(
  job: Record<string, unknown>,
  startedAt: number,
  source: Record<string, unknown>,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  job.endedAt = new Date().toISOString();
  job.durationMs = Date.now() - startedAt;

  // Log to mi_crawl_logs
  try {
    const eventType =
      job.status === "completed" ? "crawl_completed" : "crawl_failed";
    await supabaseClient.from("mi_crawl_logs").insert({
      event_type: eventType,
      message: job.message,
      details: {
        jobId: job.jobId,
        status: job.status,
        mode: job.mode,
        pagesRequested: job.pagesRequested,
        pagesFetched: job.pagesFetched,
        productsDiscovered: job.productsDiscovered,
        pricesDiscovered: job.pricesDiscovered,
        pricesAccepted: job.pricesAccepted,
        pricesReviewRequired: job.pricesReviewRequired,
        errors: (job.errors as Array<{ type: string }>).map((e) => e.type),
        warnings: job.warnings,
      },
      source_id: source.id,
    });
  } catch {
    // Non-fatal
  }

  return job;
}

// ============================================================
// HELPERS
// ============================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
