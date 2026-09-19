// =========================================================
// FRELUX INTEL CRAWL — controlled crawler (edge function)
//
// Crawls ONLY Admin-approved sources. Respects robots.txt,
// rate limits, same-origin redirect policy, response size and
// page caps. SSRF-hardened. Never bypasses CAPTCHA/auth/paywall
// protections. Extracted information enters the EXISTING
// Phase 6.5 learning pipeline as CRAWLED → EXTRACTED records
// and can never be promoted without the existing human review.
// Price observations are append-only history. No API keys exist
// in this code; the service role key is server-side env only.
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isPrivateAddress,
  isForbiddenHost,
  validateSourceUrl,
  isRedirectSafe,
  extractLinks,
  hashContent,
  shouldCrawlSource,
  buildCrawlTargets,
  nextCrawlMs,
} from "./guard.ts";
import {
  parseRobots,
  isAllowedByRobots,
  CRAWLER_USER_AGENT,
  politenessDelaySeconds,
} from "./robots.ts";
import {
  extractProduct,
  extractionConfidence,
  stripTags,
} from "./extraction.ts";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const RELIABILITY_WEIGHT: Record<string, number> = {
  AUTHORITATIVE: 0.9,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.3,
  UNVERIFIED: 0.15,
};

const CORS = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function fetchWithLimits(
  url: string,
  origin: string,
): Promise<
  | { ok: true; html: string; finalUrl: string; status: number }
  | { ok: false; error: string; status?: number }
> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
          Accept: "text/html,text/plain",
        },
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: `request failed: ${current}` };
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc)
        return {
          ok: false,
          error: "redirect without location",
          status: res.status,
        };
      const next = new URL(loc, current).toString();
      if (!isRedirectSafe(origin, next))
        return {
          ok: false,
          error: `cross-origin redirect blocked: ${next}`,
          status: res.status,
        };
      current = next;
      continue;
    }
    if (res.status !== 200)
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(ct))
      return {
        ok: false,
        error: `unsupported content-type: ${ct}`,
        status: res.status,
      };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "no body" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value!.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          error: "response exceeds size limit",
          status: res.status,
        };
      }
      chunks.push(value!);
    }
    const html = new TextDecoder().decode(concat(chunks));
    return { ok: true, html, finalUrl: current, status: res.status };
  }
  return { ok: false, error: "too many redirects" };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AI,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "POST only." });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer "))
    return json(401, { ok: false, error: "Authentication required." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerToken = authHeader.replace("Bearer ", "");

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user)
    return json(401, { ok: false, error: "Invalid session." });
  const service = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile?.role !== "admin")
    return json(403, { ok: false, error: "Admin authorization required." });

  let body: { sourceId?: string; mode?: "CRAWL" | "TEST" };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body must be JSON." });
  }
  const mode = body.mode ?? "CRAWL";
  const sourceId = body.sourceId;
  if (!sourceId)
    return json(400, { ok: false, error: "sourceId is required." });

  const { data: source } = await service
    .from("frelux_intelligence_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source) return json(404, { ok: false, error: "Source not found." });
  if (!shouldCrawlSource(source, mode)) {
    return json(403, {
      ok: false,
      error: "Source is disabled — enable it before crawling.",
    });
  }

  const check = validateSourceUrl(source.base_url);
  if (!check.ok)
    return json(400, {
      ok: false,
      error: `Registered URL rejected: ${check.error}`,
    });

  // SSRF: resolve DNS and refuse private/internal addresses.
  let addr: string;
  try {
    const records = await Deno.resolveDns(check.host!, "A");
    addr = records[0] ?? "";
  } catch {
    addr = "";
  }
  if (!addr || isPrivateAddress(addr) || isForbiddenHost(check.host!)) {
    await service.from("frelux_crawl_runs").insert({
      source_id: source.id,
      status: "BLOCKED",
      trigger_kind: "MANUAL",
      failure_reason: `SSRF guard: host ${check.host} resolves to ${addr || "nothing"} (private/forbidden).`,
      triggered_by: auth.user.id,
      finished_at: new Date().toISOString(),
    });
    return json(400, {
      ok: false,
      error: `SSRF guard blocked host ${check.host}.`,
    });
  }

  // TEST mode: validate reachability + robots only; no writes, no ingestion.
  const origin = check.origin!;
  const robotsRes = await fetchWithLimits(`${origin}/robots.txt`, origin);
  const robots = robotsRes.ok ? parseRobots(robotsRes.html) : null;
  if (mode === "TEST") {
    const homeRes = await fetchWithLimits(`${origin}/`, origin);
    return json(200, {
      ok: true,
      mode,
      url: origin,
      resolvedIp: addr,
      robotsStatus: robotsRes.ok ? robotsRes.status : robotsRes.error,
      homepage: homeRes.ok
        ? { status: homeRes.status, bytes: homeRes.html.length }
        : { error: homeRes.error },
      message: "Source connectivity validated. No data was ingested.",
    });
  }

  // ---- CRAWL ----
  const { data: run } = await service
    .from("frelux_crawl_runs")
    .insert({
      source_id: source.id,
      status: "RUNNING",
      trigger_kind: "MANUAL",
      triggered_by: auth.user.id,
    })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id;
  const errors: string[] = [];
  let attempted = 0,
    processed = 0,
    rejected = 0,
    unchanged = 0,
    newFacts = 0,
    changedFacts = 0,
    candidates = 0;

  const allowedPaths: string[] = Array.isArray(source.allowed_paths)
    ? source.allowed_paths
    : ["/"];
  const seen = new Set<string>();
  const targets: string[] = buildCrawlTargets(
    origin,
    allowedPaths,
    source.max_pages,
  );
  for (const t of targets) seen.add(t);

  const delayMs = politenessDelaySeconds(robots) * 1000;
  const retrievedAt = new Date().toISOString();
  const reliabilityWeight = RELIABILITY_WEIGHT[source.reliability] ?? 0.15;

  for (const url of targets) {
    attempted++;
    const path = new URL(url).pathname;
    if (!isAllowedByRobots(robots, path)) {
      rejected++;
      errors.push(`robots.txt disallows ${path}`);
      continue;
    }
    const res = await fetchWithLimits(url, origin);
    if (!res.ok) {
      rejected++;
      errors.push(`${url}: ${res.error}`);
      continue;
    }
    const contentHash = hashContent(res.html);
    const { data: page } = await service
      .from("frelux_crawled_pages")
      .select("id, content_hash")
      .eq("url", url)
      .maybeSingle();
    const changed = !page || page.content_hash !== contentHash;
    if (!changed) {
      unchanged++;
      continue; // identical content: no reprocessing, no duplicate ingestion
    }
    if (page) {
      await service
        .from("frelux_crawled_pages")
        .update({
          content_hash: contentHash,
          retrieved_at: retrievedAt,
          changed: true,
          size_bytes: res.html.length,
          status_code: res.status,
        })
        .eq("id", (page as { id: string }).id);
    } else {
      await service.from("frelux_crawled_pages").insert({
        source_id: source.id,
        url,
        content_hash: contentHash,
        retrieved_at: retrievedAt,
        changed: true,
        size_bytes: res.html.length,
        status_code: res.status,
      });
    }

    // depth-limited link discovery (same-origin + allowed paths only)
    if (targets.length < source.max_pages) {
      for (const link of extractLinks(
        res.html,
        origin,
        allowedPaths,
        seen,
      ).slice(0, source.max_pages - targets.length)) {
        targets.push(link);
      }
    }

    const ex = extractProduct(res.html, {
      url,
      retrievedAt,
      sourceCountry: source.country,
      sourceType: source.source_type,
      sourceName: source.name,
    });
    const confidence = extractionConfidence(ex, reliabilityWeight);
    const textSample = stripTags(res.html).slice(0, 400);

    if (ex.injection_flags.length > 0) {
      errors.push(
        `${url}: injection flags ${ex.injection_flags.join(",")} — content quarantined as data`,
      );
    }

    // Price observation — append-only history, never an overwrite.
    if (ex.price != null && source.is_price_source) {
      const { data: lastObs } = await service
        .from("frelux_price_observations")
        .select("price")
        .eq("url", url)
        .order("retrieved_at", { ascending: false })
        .limit(1);
      const prior = (lastObs as Array<{ price: number }> | null)?.[0]?.price;
      const isChanged = prior != null && prior !== ex.price;
      if (prior == null) newFacts++;
      else if (isChanged) changedFacts++;
      await service.from("frelux_price_observations").insert({
        source_id: source.id,
        product_name: ex.product_name ?? "unidentified product",
        price: ex.price,
        currency: ex.currency ?? "UNKNOWN",
        unit_package: ex.unit,
        region: source.region,
        country: source.country,
        supplier: ex.supplier,
        url,
        retrieved_at: retrievedAt,
        published_at: ex.published_at,
        source_reliability: source.reliability,
        evidence: {
          excerpt: textSample,
          extraction_method: "server-side rule extraction",
          content_hash: contentHash,
          changed: isChanged,
          prior_price: prior ?? null,
        },
        confidence,
        verification_status: "PENDING",
        content_hash: contentHash,
      });
    }

    // Extracted product record (honest gaps preserved).
    if (source.is_product_source && (ex.product_name || ex.price)) {
      const { data: dupProd } = await service
        .from("frelux_extracted_products")
        .select("id")
        .eq("url", url)
        .eq("content_hash", contentHash)
        .limit(1);
      if ((dupProd?.length ?? 0) === 0) {
        await service.from("frelux_extracted_products").insert({
          source_id: source.id,
          url,
          product_name: ex.product_name,
          manufacturer: ex.manufacturer,
          product_category: ex.product_category,
          package_size: ex.package_size,
          unit: ex.unit,
          specification: ex.specification,
          coverage: ex.coverage,
          application_info: ex.application_info,
          material_info: ex.material_info,
          price: ex.price,
          currency: ex.currency,
          availability: ex.availability,
          location: ex.location,
          supplier: ex.supplier,
          terminology: ex.terminology,
          methods: ex.methods,
          standards_refs: ex.standards_refs,
          published_at: ex.published_at,
          retrieved_at: retrievedAt,
          content_hash: contentHash,
          uncertain_fields: ex.uncertain_fields,
          confidence,
          verification_status: "PENDING",
        });
      }
    }

    // Learning record → EXISTING pipeline (CRAWLED → EXTRACTED).
    if (source.learning_eligible) {
      const recHash = hashContent(["WEB", url, contentHash]);
      const { data: dupRec } = await service
        .from("frelux_learning_records")
        .select("id")
        .eq("content_hash", recHash)
        .limit(1);
      if ((dupRec?.length ?? 0) === 0) {
        const capability =
          source.source_type === "STANDARD_CODE"
            ? "standards_references"
            : source.source_type === "CONSTRUCTION_KNOWLEDGE"
              ? "construction_knowledge"
              : "market_prices";
        const { data: rec } = await service
          .from("frelux_learning_records")
          .insert({
            source: "WEB",
            source_type: "WEB_CRAWL",
            provider: source.name,
            model_version: "rule-extraction-v1",
            topic: (ex.product_name ?? source.name).slice(0, 200),
            capability,
            request_context: textSample,
            recommendation:
              ex.price != null
                ? `Observed price ${ex.price} ${ex.currency ?? "?"} for ${ex.product_name ?? "product"} (${ex.package_size ?? "package unknown"})`
                : `Extracted product information from ${source.name}`,
            conclusion: ex.specification?.slice(0, 800) ?? null,
            evidence: [
              `url: ${url}`,
              `retrieved_at: ${retrievedAt}`,
              `reliability: ${source.reliability}`,
            ],
            cited_sources: [url],
            assumptions: source.country
              ? [`Region context: ${source.country}`]
              : [],
            proposed_scope: "REGIONAL",
            scope_key: source.country,
            provenance: {
              url,
              retrieved_at: retrievedAt,
              published_at: ex.published_at,
              extraction_method: "server-side rule extraction",
              content_hash: contentHash,
              source_type: source.source_type,
              source_reliability: source.reliability,
              country: source.country,
              region: source.region,
              injection_flags: ex.injection_flags,
              crawl_run_id: runId,
            },
            confidence,
            lifecycle_status: "EXTRACTED",
            verification_status: "PENDING",
            evaluation_status: "NOT_EVALUATED",
            content_hash: recHash,
            payload_size: res.html.length,
            created_by: auth.user.id,
          })
          .select("id")
          .single();
        if (rec) {
          candidates++;
          await service.from("frelux_learning_audit").insert({
            record_id: (rec as { id: string }).id,
            action: "INGESTED",
            actor: auth.user.id,
            details: {
              via: "intel-crawl",
              url,
              injection_flags: ex.injection_flags,
            },
          });
        }
        if (ex.price != null) newFacts++;
      }
    }
    processed++;
    await new Promise((r) => setTimeout(r, delayMs)); // politeness rate limit
  }

  const nextCrawl =
    source.crawl_frequency === "MANUAL"
      ? null
      : new Date(
          Date.now() + nextCrawlMs(source.crawl_frequency),
        ).toISOString();
  await service
    .from("frelux_crawl_runs")
    .update({
      status:
        processed > 0
          ? rejected > 0
            ? "PARTIAL"
            : "SUCCESS"
          : attempted === 0
            ? "FAILED"
            : "FAILED",
      finished_at: new Date().toISOString(),
      pages_attempted: attempted,
      pages_processed: processed,
      pages_rejected: rejected,
      pages_unchanged: unchanged,
      new_facts: newFacts,
      changed_facts: changedFacts,
      candidates_generated: candidates,
      errors,
      failure_reason:
        processed === 0 && attempted === 0 ? "no allowed pages" : null,
    })
    .eq("id", runId);
  await service
    .from("frelux_intelligence_sources")
    .update({
      last_crawl: new Date().toISOString(),
      next_crawl: nextCrawl,
      updated_date: new Date().toISOString(),
    })
    .eq("id", source.id);

  return json(200, {
    ok: true,
    mode: "CRAWL",
    runId,
    pages: { attempted, processed, rejected, unchanged },
    newFacts,
    changedFacts,
    candidates,
    errors: errors.slice(0, 20),
    message: `Crawled ${processed}/${attempted} pages. ${candidates} learning candidates created in the existing pipeline (lifecycle EXTRACTED — human review required before any production use).`,
  });
});
