// =========================================================
// FRELUX Edge Function: ai-plan-extraction (Phase 3)
//
// ELEMENT-LEVEL construction document extraction:
// rooms, openings, roof geometry, building facts — every element
// with provenance (page + bbox + quote), confidence and dimension
// classification (explicit / derived / inferred). Values the
// model cannot reliably determine are OMITTED — a missing field
// is handled gracefully; a fabricated field is not.
//
// FORBIDDEN (same rules as the whole AI Foundation):
//   - computing quantities, materials or costs
//   - inventing dimensions to fill gaps
//   - labelling an inferred value "dimension_annotation"
//   - structural/foundation adequacy claims (§21 — identify only,
//     never certify)
//
// Security mirrors ai-construction-extraction: site-setting gate,
// per-client rate limit, strict server-side whitelist + clamps,
// Gemini key server-side only. Requires an authenticated Supabase
// JWT (private project documents must not be processable by anon).
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";

// ── Rate limiting (inlined mirror of _shared/rate-limit.ts) ──

interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, RateLimitEntry>();

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

function rateLimitHeaders(
  remaining: number,
  resetAt: number,
): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";

type DocumentKind =
  | "architectural_pdf"
  | "floor_plan"
  | "roof_plan"
  | "elevation"
  | "section"
  | "construction_drawing"
  | "scanned_plan"
  | "photograph"
  | "screenshot";

interface ExtractionRequest {
  documentKind?: DocumentKind;
  documentDataUrl?: string;
  regionContext?: string;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

// ── Prompt ──

const KIND_GUIDANCE: Record<DocumentKind, string> = {
  architectural_pdf:
    "ARCHITECTURAL PDF — may contain multiple pages (cover, floor plans, roof plan, elevations, sections). Read every page; report the page number for each element. Dimensions are usually mm (18000 = 18 m) — report them in the drawing's unit.",
  floor_plan:
    "FLOOR PLAN — read dimension lines and room labels exactly. Count rooms from labels, not guesses. Report each room's dimensions from its dimension annotations; unknown dimensions stay null.",
  roof_plan:
    "ROOF PLAN — identify roof type from the outline (two slopes = gable; all sides sloping = hip; single slope = mono_pitch). Report ridge length, hips, valleys, eaves/overhang, pitch (degrees or ratio) ONLY when annotated or shown in a section. If the roof geometry is not uniquely determinable, set geometrySufficient=false with a reason.",
  elevation:
    "ELEVATION — read floor-to-floor heights, openings (doors/windows with sizes), finishes, roof profile and pitch from annotations. Do NOT extract footprint dimensions from an elevation (they are not visible).",
  section:
    "SECTION — read floor heights, wall thicknesses, foundation depths, slab thicknesses from annotated dimension lines. Foundation/structural elements: IDENTIFY ONLY, never comment on adequacy or compliance.",
  construction_drawing:
    "CONSTRUCTION DRAWING — extract whatever is explicitly annotated: rooms, dimensions, openings, roof data, schedules.",
  scanned_plan:
    "SCANNED PLAN — quality may be degraded. Extract only what is clearly readable; add warnings for unreadable areas. NEVER guess degraded dimensions.",
  photograph:
    "BUILDING PHOTOGRAPH — a photo CANNOT show exact dimensions. You may report visual observations (materials, apparent finishes, construction stage, visible elements) and scale estimates from common cues (door ≈ 0.9×2.1 m, floor ≈ 3 m) with source 'visual_estimate' and confidence ≤ 0.7. Never claim dimension_annotation for a photo.",
  screenshot:
    "SCREENSHOT of a plan/design tool — extract only what is clearly readable on screen; quality/zoom may mislead. Treat pixel-derived sizes as visual estimates.",
};

function buildPrompt(kind: DocumentKind, regionContext?: string): string {
  const regionLine = regionContext?.trim()
    ? `\\nThe building is located in: ${regionContext.trim()}. Apply that region's drawing conventions and terminology where relevant. NEVER invent prices or market data — you extract document facts only.`
    : "";
  return `You are a construction plan analyst. You read architectural documents with engineering precision and report ONLY what the document actually shows.

${KIND_GUIDANCE[kind]}
${regionLine}

CRITICAL HONESTY RULES:
1. NEVER invent a dimension. If a value is not readable or derivable, use null. A missing field is handled gracefully; a fabricated field is a defect.
2. Dimension classification (per element field):
   - "dimension_annotation" — the value is written on the document (dimension line, room label like "3.6 X 4.2", schedule).
   - "scale_derived" — derived using a drawn/written scale.
   - "visual_estimate" — estimated from visual cues (photos only, or unsealed drawings).
   - "text_description" — explicitly stated in accompanying text.
   Never claim "dimension_annotation" for a value you derived or estimated.
3. Report each element's page number (PDF) and, when possible, a normalized bbox {x,y,w,h} (0..1 of page) so the user can SEE where it came from.
4. "evidence" must quote the actual annotation/label text.
5. Structural/foundation elements: identify and report what is drawn ONLY. NEVER judge structural adequacy, reinforcement adequacy, load-bearing safety or engineering compliance.
6. Scale: report the written scale (e.g. "1:100") or graphic scale bar when present, with your confidence in reading it correctly.

Return ONLY JSON with this exact shape:
{
  "scale": { "source": "written_scale" | "graphic_scale_bar" | "unknown", "text": "1:100", "confidence": 0.0-1.0 } | null,
  "nativeUnit": "m" | "ft",
  "rooms": [
    { "id": "r1", "name": "BEDROOM 1", "spaceType": "bedroom|parlour|living_room|dining|kitchen|bathroom|toilet|corridor|store|staircase|office|garage|balcony|veranda|other",
      "page": 1, "bbox": {"x":0.1,"y":0.2,"w":0.3,"h":0.2},
      "length": {"value": 3600, "unit": "mm", "source": "dimension_annotation", "confidence": 0.95},
      "width": {...} | null, "height": {...} | null,
      "floor": 1,
      "openings": [ { "id": "o1", "type": "door"|"window", "count": 1,
        "width": {"value": 900, "unit": "mm", "source": "dimension_annotation", "confidence": 0.9} | null,
        "height": {...} | null, "confidence": 0.85 } ],
      "evidence": "Dimension annotation '3600' + room label 'BEDROOM 1'",
      "confidence": 0.9, "notes": "optional" }
  ],
  "roof": { "roofType": "gable|hip|mono_pitch|flat|pyramid|unknown", "page": 2,
    "pitchDegrees": {...} | null, "overhang": {...} | null, "ridgeLength": {...} | null,
    "planeCount": 2, "hipsCount": 0, "valleysCount": 0,
    "evidence": "...", "confidence": 0.8 } | null,
  "buildingFacts": [
    { "id": "f1", "key": "building_length|building_width|number_of_floors|floor_to_floor_height|wall_thickness|internal_wall_length|roof_type|roofing_material|building_type|foundation_type",
      "label": "Building length", "page": 1,
      "dimension": {"value": 15000, "unit": "mm", "source": "dimension_annotation", "confidence": 0.95} | null,
      "enumValue": null, "evidence": "Overall dimension line", "confidence": 0.95 }
  ],
  "notes": ["title block, drawing number, what is visible"],
  "warnings": ["unreadable areas, missing scale, values needing verification"]
}`;
}

// ── Main ──

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const geminiApiKey =
    Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return jsonResponse(
      { error: "Server not configured.", code: "NOT_CONFIGURED" },
      500,
    );
  }

  // AUTH: private project documents require an authenticated user.
  const authHeader = req.headers.get("Authorization");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return jsonResponse(
      { error: "Authentication required.", code: "UNAUTHORIZED" },
      401,
    );
  }

  // Rate limit per user.
  const rlKey = `user:${userId}`;
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) {
    return jsonResponse(
      {
        error: "Too many requests. Please try again later.",
        code: "RATE_LIMITED",
      },
      429,
      { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    );
  }
  const rlH = rateLimitHeaders(rl.remaining, rl.resetAt);

  let body: ExtractionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, rlH);
  }

  const documentKind: DocumentKind =
    body.documentKind && KIND_GUIDANCE[body.documentKind]
      ? body.documentKind
      : "floor_plan";
  const documentDataUrl =
    typeof body.documentDataUrl === "string" ? body.documentDataUrl : "";
  const regionContext =
    typeof body.regionContext === "string"
      ? body.regionContext.slice(0, 200)
      : "";

  if (!documentDataUrl) {
    return jsonResponse(
      { error: "Provide a document image/PDF.", code: "NO_INPUT" },
      400,
      rlH,
    );
  }

  // Base64 payload check (~10MB).
  const base64 = documentDataUrl.includes(",")
    ? documentDataUrl.split(",")[1]
    : documentDataUrl;
  if (!base64 || base64.length > 14_000_000) {
    return jsonResponse(
      { error: "Document too large (max ~10MB).", code: "TOO_LARGE" },
      413,
      rlH,
    );
  }
  const mimeMatch = documentDataUrl.match(/^data:([^;,]+)[;,]/);
  const mimeType = mimeMatch?.[1] ?? "image/jpeg";
  if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mimeType)) {
    return jsonResponse(
      { error: "Unsupported file type.", code: "UNSUPPORTED_TYPE" },
      415,
      rlH,
    );
  }

  // Feature gate (same as the rest of the estimation feature set).
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: settings } = await admin
    .from("site_settings")
    .select("estimation_enabled, estimation_access_mode")
    .maybeSingle();
  if (
    !settings?.estimation_enabled ||
    settings.estimation_access_mode === "disabled"
  ) {
    return jsonResponse(
      { error: "Plan extraction is currently disabled.", code: "AI_DISABLED" },
      403,
      rlH,
    );
  }

  if (!geminiApiKey) {
    return jsonResponse(
      { error: "AI service not configured.", code: "NO_API_KEY" },
      503,
      rlH,
    );
  }

  // ── Gemini call ──
  const parts: Array<Record<string, unknown>> = [
    { text: buildPrompt(documentKind, regionContext) },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );
  } catch (e) {
    console.error("[ai-plan-extraction] fetch error:", e);
    return jsonResponse(
      {
        error: "The AI service is temporarily unavailable.",
        code: "PROVIDER_ERROR",
      },
      502,
      rlH,
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      "[ai-plan-extraction] Gemini error:",
      response.status,
      errText.slice(0, 500),
    );
    return jsonResponse(
      {
        error: "The AI service is temporarily unavailable.",
        code: "PROVIDER_ERROR",
      },
      502,
      rlH,
    );
  }

  let parsed: unknown;
  try {
    const geminiData = await response.json();
    const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) throw new Error("No response text");
    parsed = JSON.parse(textContent);
  } catch (e) {
    console.error("[ai-plan-extraction] parse error:", e);
    return jsonResponse(
      { error: "The AI response could not be read.", code: "INVALID_RESPONSE" },
      502,
      rlH,
    );
  }

  // Server-side element whitelist + clamps (the client re-validates
  // as well — defense in depth; the sanitizer never trusts model
  // self-assessment of dimension classification).
  const clamped = clampElements(parsed);

  return jsonResponse(
    {
      documentKind,
      ...clamped,
      processedAt: new Date().toISOString(),
    },
    200,
    rlH,
  );
});

// ── Server-side element clamps ──

function clampElements(parsed: unknown): Record<string, unknown> {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const clampConfidence = (c: unknown): number => {
    const n = typeof c === "number" ? c : parseFloat(String(c ?? ""));
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  };
  const clampDim = (d: unknown): Record<string, unknown> | null => {
    if (!d || typeof d !== "object") return null;
    const dim = d as Record<string, unknown>;
    const value =
      typeof dim.value === "number"
        ? dim.value
        : parseFloat(String(dim.value ?? ""));
    if (!Number.isFinite(value)) return null;
    const unit = ["mm", "cm", "m", "ft", "in"].includes(String(dim.unit))
      ? String(dim.unit)
      : "m";
    const source = [
      "dimension_annotation",
      "scale_derived",
      "visual_estimate",
      "text_description",
    ].includes(String(dim.source))
      ? String(dim.source)
      : "visual_estimate";
    return { value, unit, source, confidence: clampConfidence(dim.confidence) };
  };

  const rooms = Array.isArray(p.rooms)
    ? p.rooms.slice(0, 60).map((r) => {
        const room = (r ?? {}) as Record<string, unknown>;
        return {
          ...room,
          length: clampDim(room.length),
          width: clampDim(room.width),
          height: clampDim(room.height),
          confidence: clampConfidence(room.confidence),
          openings: Array.isArray(room.openings)
            ? room.openings.slice(0, 12).map((o) => {
                const op = (o ?? {}) as Record<string, unknown>;
                return {
                  ...op,
                  width: clampDim(op.width),
                  height: clampDim(op.height),
                  count: Math.max(
                    0,
                    Math.min(50, Math.round(Number(op.count) || 1)),
                  ),
                  confidence: clampConfidence(op.confidence),
                };
              })
            : [],
        };
      })
    : [];

  const roof =
    p.roof && typeof p.roof === "object"
      ? {
          ...(p.roof as Record<string, unknown>),
          pitchDegrees: clampDim(
            (p.roof as Record<string, unknown>).pitchDegrees,
          ),
          overhang: clampDim((p.roof as Record<string, unknown>).overhang),
          ridgeLength: clampDim(
            (p.roof as Record<string, unknown>).ridgeLength,
          ),
          confidence: clampConfidence(
            (p.roof as Record<string, unknown>).confidence,
          ),
        }
      : null;

  const buildingFacts = Array.isArray(p.buildingFacts)
    ? p.buildingFacts.slice(0, 40).map((f) => {
        const fact = (f ?? {}) as Record<string, unknown>;
        return {
          ...fact,
          dimension: clampDim(fact.dimension),
          confidence: clampConfidence(fact.confidence),
        };
      })
    : [];

  const scale =
    p.scale && typeof p.scale === "object"
      ? {
          ...(p.scale as Record<string, unknown>),
          confidence: clampConfidence(
            (p.scale as Record<string, unknown>).confidence,
          ),
        }
      : null;

  const strList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((s): s is string => typeof s === "string").slice(0, 12)
      : [];

  return {
    scale,
    nativeUnit: p.nativeUnit === "ft" ? "ft" : "m",
    rooms,
    roof,
    buildingFacts,
    notes: strList(p.notes),
    warnings: strList(p.warnings),
  };
}
