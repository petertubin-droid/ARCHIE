// =========================================================
// FRELUX PHASE 8 — ARCHIE MULTIMODAL EXTRACTION (edge function)
//
// The EXTRACT/ANALYZE stage of the ARCHIE training pipeline.
//
// NATIVE-ONLY (audit fix C-3, owner directive 2026-09-11):
//   Zero external AI. The previous implementation hardcoded a
//   Gemini call — the last ARCHIE-branded external dependency.
//   Extraction is now performed by ARCHIE's own deterministic
//   native extractor (structural statement parsing, the same
//   SPO pattern family the native engine's memory subsystem
//   uses). Binary media (image/audio/video/PDF) is honestly
//   refused as NOT OPERATIONAL until ARCHIE's native
//   perception supports it — never faked, never delegated.
//
// Security:
//   * requires the caller's Supabase JWT AND an admin profile
//     or an active ARCHIE contributor record
//   * media ownership is enforced before any handling
//   * material is treated as DATA only (injection-proof by
//     construction: deterministic regex extraction cannot be
//     steered by instructions inside the material)
//   * size limits + rate limiting
//   * NEVER promotes knowledge — extraction only; promotion is
//     a separate human approval flow
// =========================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const MAX_PER_HOUR = 30;
const RATE_WINDOW_MS = 3_600_000;
const MAX_TEXT_CHARS = 80_000;
const MAX_EXTRACTED_FACTS = 100;

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

const ALLOWED_INPUT_TYPES = new Set([
  "TEXT",
  "IMAGE",
  "PDF_DOCUMENT",
  "SCANNED_TECHNICAL",
  "ENGINEERING_DRAWING",
  "TABLE_CALCULATION",
  "AUDIO_VOICE",
  "VIDEO_DEMONSTRATION",
  "PROJECT_OUTCOME",
  "SOURCE_CODE",
  "WEB_INTELLIGENCE",
]);

/** Input types that carry meaning only in binary media —
 *  native perception does not implement these modalities yet. */
const MEDIA_ONLY_TYPES = new Set([
  "IMAGE",
  "PDF_DOCUMENT",
  "SCANNED_TECHNICAL",
  "ENGINEERING_DRAWING",
  "AUDIO_VOICE",
  "VIDEO_DEMONSTRATION",
]);

// ---------------------------------------------------------
// NATIVE DETERMINISTIC EXTRACTOR (zero external AI)
//
// Honest by construction: it reports exactly what it can
// parse (SVO statements, measurements, labelled lines, code
// definitions) and says so in `warnings`. Nothing invented.
// ---------------------------------------------------------

const SVO_RE =
  /^([A-Z0-9][A-Za-z0-9 &/-]{1,60}?)\s+(?:is|are|has|uses|requires|costs|contains|means|converts|measures|weighs|covers|lasts)\s+(.{2,200}?)[.;]?$/;

const MEASUREMENT_RE =
  /^(?:the\s+)?([A-Za-z0-9 &/-]{1,60}?)\s+(?:is|was|measures?|requires?|costs?|spans?|covers?)?\s*(?:about\s+|approximately\s+|around\s+|up to\s+)?([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z%°][A-Za-z0-9°/%²³-]*)(?:\s+(?:per|for|each)\s+(.+))?[.;]?$/;

const CONSTRUCTION_TERMS = [
  "cement",
  "concrete",
  "mortar",
  "screed",
  "screeding",
  "plaster",
  "paint",
  "primer",
  "putty",
  "grout",
  "tile",
  "tiling",
  "block",
  "brick",
  "rebar",
  "beam",
  "column",
  "slab",
  "foundation",
  "roofing",
  "plumbing",
  "wiring",
  "drywall",
  "pop",
  "ceiling",
  "rendering",
  "waterproofing",
  "sanding",
  "sealer",
  "coating",
  "mixture",
  "mix ratio",
];

interface ExtractedFact {
  statement: string;
  kind: "svo" | "measurement" | "labelled" | "definition";
  confidence: number;
}

/** Deterministic statement-level extraction. Material is DATA:
 *  no instruction inside it can change what this code does. */
function nativeExtract(
  text: string,
  inputType: string,
): {
  facts: ExtractedFact[];
  summary: string;
  sentencesTotal: number;
} {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return { facts: [], summary: "", sentencesTotal: 0 };

  const sentences = normalized
    .split(/\n+|(?<=[.;])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && s.length < 400);

  const facts: ExtractedFact[] = [];
  for (const raw of sentences) {
    const s = raw.replace(/^[-*•]\s+/, "");
    // 1. Labelled lines — "Mix ratio: 1:3"
    const labelled = /^([A-Za-z][A-Za-z0-9 /&-]{1,50}):\s*(.{2,160})$/.exec(s);
    if (labelled) {
      facts.push({
        statement: `${labelled[1].trim()}: ${labelled[2].trim()}`,
        kind: "labelled",
        confidence: 0.72,
      });
      continue;
    }
    // 2. Measurements — "Screed thickness is 25 mm"
    const meas = MEASUREMENT_RE.exec(s);
    if (meas) {
      facts.push({
        statement: s,
        kind: "measurement",
        confidence: 0.7,
      });
      continue;
    }
    // 3. SVO statements — "Mortar is a mixture of cement and sand"
    const svo = SVO_RE.exec(s);
    if (svo) {
      facts.push({
        statement: s,
        kind: "svo",
        confidence: 0.65,
      });
      continue;
    }
    // 4. Code definitions (SOURCE_CODE) — "function foo(...)"
    if (inputType === "SOURCE_CODE") {
      const def =
        /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z0-9_$]+)/.exec(
          s,
        );
      if (def) {
        facts.push({
          statement: `defines ${def[1]}`,
          kind: "definition",
          confidence: 0.7,
        });
        continue;
      }
    }
    if (facts.length >= MAX_EXTRACTED_FACTS) break;
  }

  const summary = sentences.slice(0, 3).join(" ").slice(0, 2000);

  return { facts, summary, sentencesTotal: sentences.length };
}

function detectDomain(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  const hits = CONSTRUCTION_TERMS.filter((t) => lower.includes(t)).length;
  return hits >= 3 ? "construction" : fallback;
}

serveWithCors(async (req) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "POST only." });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user) {
    return json(401, { ok: false, error: "Invalid session." });
  }
  const userId = auth.user.id;

  const service = createClient(supabaseUrl, serviceKey);

  // FIX 62 (2026-09-15, live E2E): profiles has a `role` column
  // ('admin'/'user') — there is NO `is_admin` column. Selecting it made
  // PostgREST error, the error was swallowed, and authorization silently
  // collapsed to false for EVERY caller — the owner himself got 403
  // "requires an active contributor profile" on training submissions.
  // Match archie-chat's proven check: profile?.role === "admin".
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  let authorized = profile?.role === "admin";
  if (!authorized) {
    const { data: contributor } = await service
      .from("frelux_archie_contributors")
      .select("active, role")
      .eq("user_id", userId)
      .maybeSingle();
    authorized =
      contributor?.active === true && contributor.role !== "OBSERVER";
  }
  if (!authorized) {
    return json(403, {
      ok: false,
      error: "ARCHIE training requires an active contributor profile.",
    });
  }

  const rateKey = `archie-extract:${userId}`;
  const now = Date.now();
  let hits = 0;
  try {
    const rl = await service
      .from("frelux_learning_rate_limits")
      .select("window_start, count")
      .eq("bucket_key", rateKey)
      .maybeSingle();
    const withinWindow =
      rl.data && now - Date.parse(rl.data.window_start) < RATE_WINDOW_MS;
    hits = withinWindow ? (rl.data?.count ?? 0) + 1 : 1;
    if (rl.data && withinWindow) {
      await service
        .from("frelux_learning_rate_limits")
        .update({ count: hits })
        .eq("bucket_key", rateKey);
    } else {
      await service.from("frelux_learning_rate_limits").upsert({
        bucket_key: rateKey,
        window_start: new Date(now).toISOString(),
        count: hits,
      });
    }
  } catch {
    /* rate limiting is best-effort */
  }
  if (hits > MAX_PER_HOUR) {
    return json(429, {
      ok: false,
      error: "Rate limit: too many extractions this hour.",
    });
  }

  // Payload validation.
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }
  const inputType = String(payload.input_type ?? "");
  if (!ALLOWED_INPUT_TYPES.has(inputType)) {
    return json(400, {
      ok: false,
      error: `Unsupported input_type "${inputType}"`,
    });
  }
  const domain = String(payload.domain ?? "").trim();
  if (!domain) return json(400, { ok: false, error: "A domain is required." });
  const region = payload.region ? String(payload.region) : null;
  const sourceRef = payload.source_ref
    ? String(payload.source_ref).slice(0, 500)
    : null;
  const text = payload.text
    ? String(payload.text).slice(0, MAX_TEXT_CHARS)
    : null;
  const mediaUri = payload.media_uri ? String(payload.media_uri) : null;

  if (!text && !mediaUri) {
    return json(400, {
      ok: false,
      error: "Provide text or media for extraction.",
    });
  }

  if (mediaUri) {
    const ownerFolder = mediaUri.split("/")[0];
    const isAdmin = profile?.role === "admin";
    if (ownerFolder !== userId && !isAdmin) {
      return json(403, { ok: false, error: "Media not owned by caller." });
    }
    // HONEST NATIVE LIMIT: ARCHIE's native perception does not
    // implement binary media modalities yet. Reported as NOT
    // OPERATIONAL — never faked, never delegated to an
    // external AI provider (owner directive: ARCHIE is
    // independent; no Gemini, no OpenAI).
    return json(503, {
      ok: false,
      error:
        "Native multimodal extraction is not yet operational. ARCHIE's independent engine does not yet parse binary media (image/audio/video/PDF), and ARCHIE never delegates to external AI providers. Provide the material as TEXT and ARCHIE will extract it natively.",
      code: "NATIVE_MULTIMODAL_NOT_OPERATIONAL",
    });
  }

  if (!text) {
    return json(400, {
      ok: false,
      error: "Provide text for native extraction.",
    });
  }

  if (MEDIA_ONLY_TYPES.has(inputType)) {
    return json(400, {
      ok: false,
      error: `input_type "${inputType}" requires media, but native multimodal extraction is not yet operational. Supply the material as TEXT (input_type "TEXT" or "WEB_INTELLIGENCE").`,
      code: "NATIVE_MULTIMODAL_NOT_OPERATIONAL",
    });
  }

  // ---- NATIVE DETERMINISTIC EXTRACTION (zero external AI) ----
  const { facts, summary, sentencesTotal } = nativeExtract(text, inputType);
  const detectedDomain = detectDomain(text, domain);

  const warnings: string[] = [
    "Native deterministic extraction: structural statements only (SVO statements, measurements, labelled lines" +
      (inputType === "SOURCE_CODE" ? ", code definitions" : "") +
      ").",
    `${sentencesTotal} sentence(s) scanned, ${facts.length} structural fact(s) extracted, ${Math.max(0, sentencesTotal - facts.length)} non-structural sentence(s) skipped — nothing was invented.`,
  ];

  const normalized = {
    summary: summary.slice(0, 4000),
    detected_domain: detectedDomain.slice(0, 100),
    detected_region: region ? region.slice(0, 100) : null,
    facts: facts.slice(0, MAX_EXTRACTED_FACTS).map((f) => ({
      statement: f.statement.slice(0, 500),
      kind: f.kind,
      confidence: f.confidence,
      source_ref: sourceRef,
    })),
    warnings: warnings.slice(0, 10),
    extractor: "archie-native-deterministic",
  };

  return json(200, { ok: true, extraction: normalized });
});
