// =========================================================
// FRELUX Edge Function: ai-construction-extraction
//
// AI Construction Document & Image Extraction Layer.
//
// Receives an architectural plan / roof plan / building photo
// (image or PDF) and/or a text description, and returns STRICT
// structured construction data — never prose, never prices,
// never calculations. Each field carries a confidence score and
// a verification status; values the model could not reliably
// determine come back as "requires_confirmation" or are omitted
// entirely. The deterministic Build-to-Roof engine (client-side)
// remains the only source of quantities, materials and costs.
//
// Access mirrors ai-building-estimation: gated by the
// estimation_enabled site setting, rate limited per client.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";

// ── Rate limiting (inlined mirror of supabase/functions/_shared/rate-limit.ts) ──
// The Management API deploys this function as a single self-contained file,
// so the shared module is inlined verbatim to keep repo and deployed code
// identical. Keep in sync with _shared/rate-limit.ts if it ever changes.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: now + options.windowMs,
    };
  }

  if (entry.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

function getRateLimitKey(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
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

const RATE_LIMITS = {
  PAYMENT: { maxRequests: 10, windowMs: 60_000 },
  AI: { maxRequests: 20, windowMs: 60_000 },
  AUTH: { maxRequests: 5, windowMs: 60_000 },
  GENERAL: { maxRequests: 60, windowMs: 60_000 },
  AD: { maxRequests: 30, windowMs: 60_000 },
} as const;

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";

type DocumentKind =
  "architectural_plan" | "roof_plan" | "building_photo" | "text_description";

interface ExtractionRequest {
  documentKind?: DocumentKind;
  documentDataUrl?: string;
  textDescription?: string;
  clientId?: string;
  regionContext?: string;
}

// ── Field catalog (strict whitelist — anything else is dropped) ──

interface FieldSpec {
  key: string;
  label: string;
  type: "number" | "enum";
  unit?: string; // canonical unit after normalization (lengths → m, angles → deg, counts → pcs)
  enums?: string[];
  min?: number;
  max?: number;
}

const FIELD_CATALOG: FieldSpec[] = [
  {
    key: "building_type",
    label: "Building type",
    type: "enum",
    enums: [
      "bungalow",
      "duplex",
      "two_storey",
      "apartment",
      "office",
      "shop",
      "custom",
    ],
  },
  {
    key: "building_length",
    label: "Building length",
    type: "number",
    unit: "m",
    min: 1,
    max: 300,
  },
  {
    key: "building_width",
    label: "Building width",
    type: "number",
    unit: "m",
    min: 1,
    max: 300,
  },
  {
    key: "number_of_floors",
    label: "Number of floors",
    type: "number",
    unit: "floors",
    min: 1,
    max: 100,
  },
  {
    key: "floor_to_floor_height",
    label: "Floor-to-floor height",
    type: "number",
    unit: "m",
    min: 2,
    max: 8,
  },
  {
    key: "wall_thickness",
    label: "External wall thickness",
    type: "number",
    unit: "m",
    min: 0.05,
    max: 0.6,
  },
  {
    key: "internal_wall_length",
    label: "Internal wall length (total)",
    type: "number",
    unit: "m",
    min: 0,
    max: 2000,
  },
  {
    key: "perimeter",
    label: "Building perimeter",
    type: "number",
    unit: "m",
    min: 0,
    max: 1200,
  },
  {
    key: "floor_area",
    label: "Floor footprint area",
    type: "number",
    unit: "m2",
    min: 0,
    max: 10000,
  },
  {
    key: "room_count",
    label: "Room count",
    type: "number",
    unit: "rooms",
    min: 0,
    max: 500,
  },
  {
    key: "block_size",
    label: "Block size",
    type: "enum",
    enums: ["9inch", "6inch", "5inch", "custom"],
  },
  {
    key: "foundation_type",
    label: "Foundation type",
    type: "enum",
    enums: ["strip_footing", "pad_footing", "raft", "pile", "custom"],
  },
  {
    key: "roof_type",
    label: "Roof type",
    type: "enum",
    enums: ["gable", "hip", "mono_pitch", "flat", "custom"],
  },
  {
    key: "roof_pitch_degrees",
    label: "Roof pitch",
    type: "number",
    unit: "deg",
    min: 0,
    max: 60,
  },
  {
    key: "roof_overhang",
    label: "Roof overhang",
    type: "number",
    unit: "m",
    min: 0,
    max: 2,
  },
  {
    key: "roofing_material",
    label: "Roofing material",
    type: "enum",
    enums: [
      "long_span_aluminium",
      "stone_coated",
      "gi_sheet",
      "shingle",
      "custom",
    ],
  },
  {
    key: "ridge_length",
    label: "Ridge length",
    type: "number",
    unit: "m",
    min: 0,
    max: 300,
  },
  {
    key: "valleys_count",
    label: "Number of valleys",
    type: "number",
    unit: "pcs",
    min: 0,
    max: 50,
  },
  {
    key: "hips_count",
    label: "Number of hips",
    type: "number",
    unit: "pcs",
    min: 0,
    max: 50,
  },
  {
    key: "doors_count",
    label: "Door count",
    type: "number",
    unit: "pcs",
    min: 0,
    max: 200,
  },
  {
    key: "door_width",
    label: "Typical door width",
    type: "number",
    unit: "m",
    min: 0.5,
    max: 4,
  },
  {
    key: "door_height",
    label: "Typical door height",
    type: "number",
    unit: "m",
    min: 1.5,
    max: 4,
  },
  {
    key: "windows_count",
    label: "Window count",
    type: "number",
    unit: "pcs",
    min: 0,
    max: 500,
  },
  {
    key: "window_width",
    label: "Typical window width",
    type: "number",
    unit: "m",
    min: 0.2,
    max: 6,
  },
  {
    key: "window_height",
    label: "Typical window height",
    type: "number",
    unit: "m",
    min: 0.2,
    max: 6,
  },
];

const LENGTH_KEYS = new Set([
  "building_length",
  "building_width",
  "floor_to_floor_height",
  "wall_thickness",
  "internal_wall_length",
  "perimeter",
  "roof_overhang",
  "ridge_length",
  "door_width",
  "door_height",
  "window_width",
  "window_height",
]);

// Unit conversion to meters
function toMeters(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "mm":
      return value / 1000;
    case "cm":
      return value / 100;
    case "in":
    case "inch":
    case "inches":
      return value * 0.0254;
    case "ft":
    case "feet":
    case "foot":
      return value * 0.3048;
    default:
      return value; // already meters
  }
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

// ── Server-side sanitization: the client never sees unvalidated model output ──

interface RawField {
  key?: string;
  value?: unknown;
  unit?: unknown;
  confidence?: unknown;
  source?: unknown;
  evidence?: unknown;
  notes?: unknown;
}

export interface SanitizedField {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  confidence: number; // 0-1
  verification: "ai_detected" | "requires_confirmation";
  source: string; // dimension_annotation | scale_derived | visual_estimate | text_description | inferred
  evidence?: string;
}

function sanitizeFields(raw: unknown): SanitizedField[] {
  if (!Array.isArray(raw)) return [];
  const out: SanitizedField[] = [];
  const seen = new Set<string>();

  for (const item of raw as RawField[]) {
    if (!item || typeof item.key !== "string") continue;
    const spec = FIELD_CATALOG.find((f) => f.key === item.key);
    if (!spec || seen.has(spec.key)) continue; // strict whitelist, no duplicates

    let value: number | string | null = null;
    if (spec.type === "number") {
      let num =
        typeof item.value === "number"
          ? item.value
          : parseFloat(String(item.value ?? ""));
      if (!Number.isFinite(num)) continue;
      const unit =
        typeof item.unit === "string" ? item.unit : (spec.unit ?? "m");
      if (LENGTH_KEYS.has(spec.key)) num = toMeters(num, unit);
      // counts never arrive as lengths; floors/pitch/area untouched
      if (spec.min !== undefined && num < spec.min) continue;
      if (spec.max !== undefined && num > spec.max) continue;
      value = Math.round(num * 1000) / 1000;
    } else {
      const str = String(item.value ?? "")
        .trim()
        .toLowerCase();
      if (!spec.enums || !spec.enums.includes(str)) continue;
      value = str;
    }

    let confidence =
      typeof item.confidence === "number"
        ? item.confidence
        : parseFloat(String(item.confidence ?? ""));
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));

    const source = typeof item.source === "string" ? item.source : "inferred";
    // A field is only "ai_detected" (auto-accept candidate) when the model
    // is highly confident AND the value came from an explicit dimension
    // annotation or an explicit statement in the text. Anything scale-derived,
    // visually estimated or merely inferred always requires confirmation.
    const verification: SanitizedField["verification"] =
      confidence >= 0.9 &&
      (source === "dimension_annotation" || source === "text_description")
        ? "ai_detected"
        : "requires_confirmation";

    seen.add(spec.key);
    out.push({
      key: spec.key,
      label: spec.label,
      value,
      unit: spec.type === "number" ? (spec.unit ?? "m") : "",
      confidence,
      verification,
      source,
      evidence:
        typeof item.evidence === "string"
          ? item.evidence.slice(0, 400)
          : undefined,
    });
  }
  return out;
}

// ── Prompt ──

function buildPrompt(
  documentKind: DocumentKind,
  textDescription?: string,
  regionContext?: string,
): string {
  const catalog = FIELD_CATALOG.map((f) =>
    f.type === "enum"
      ? `  - "${f.key}" (enum: ${f.enums!.join(" | ")})`
      : `  - "${f.key}" (number, unit: ${f.unit ?? "m"})`,
  ).join("\n");

  const kindGuidance: Record<DocumentKind, string> = {
    architectural_plan: `This is an ARCHITECTURAL DRAWING (floor plan, elevation, section — image or PDF). This is the MOST RELIABLE source. READ DIMENSION LINES AND TEXT ANNOTATIONS FIRST: dimensions are usually written as plain numbers in mm (e.g. "18000" or "18 000" = 18m) or occasionally in meters ("18.0"). Match each dimension to the element it annotates (overall length/width, wall thicknesses, room sizes, door/window sizes). If a graphic scale bar exists, use it to derive un-annotated lengths and mark those values source "scale_derived" with honest lower confidence. Room layout: count rooms from the plan and sum internal partition wall lengths from wall centerlines.`,
    roof_plan: `This is a ROOF PLAN / ROOF DRAWING. Focus on roof geometry: overall roof dimensions, ridge length, hips, valleys, overhang (eaves), roof slope annotations (often written as degrees or as a rise ratio like 1:2). Identify roof type from the outline shape (rectangular with two slopes = gable; all sides sloping = hip; single slope = mono_pitch). Read annotated dimensions exactly; derive un-annotated ones from scale and mark "scale_derived".`,
    building_photo: `This is a BUILDING PHOTOGRAPH. Photos CANNOT show exact dimensions — never claim "dimension_annotation" for a photo. Estimate scale from visual cues (a door is ~0.9m wide and 2.1m tall, windows ~1.2m wide, floor height ~3m) and mark every value "visual_estimate" with honest confidence (usually below 0.85 → these will require user confirmation).`,
    text_description: `The user DESCRIBED the building in text. Extract ONLY what the text explicitly states, with source "text_description". For anything the text implies but does not state numerically (e.g. "a standard 3 bedroom bungalow"), provide a widely-used conservative standard value for the building's stated location — or a neutral international default when no location is stated — mark it "inferred" with confidence no higher than 0.5 and state the assumption in the evidence.`,
  };

  const regionLine = regionContext?.trim()
    ? `\nThe building is located in: ${regionContext.trim()}. Apply that region's drawing conventions, units and terminology where relevant. NEVER use the region to invent prices, materials availability or market data — you extract document facts only.`
    : "";

  return `You are a construction document analyst. You read architectural drawings, roof plans and building photos from any country with engineering precision. Plans may be dimensioned in millimetres, metres, feet/inches or other local units — report lengths in the unit the drawing actually uses, and say so in the evidence.${regionLine}

${kindGuidance[documentKind]}

CRITICAL HONESTY RULES:
1. NEVER invent a dimension. If you cannot read or derive a value, omit the field entirely — a missing field is handled gracefully; a wrong field is not.
2. Report confidence as a fraction between 0 and 1, reflecting how certain you are.
3. "evidence" must quote the actual annotation text or describe the exact element on the document that supports the value (e.g. "Dimension line '18000' along grid line A-F, ground floor plan"). For photos describe the visual cue.
4. Prefer dimension annotations ("dimension_annotation") > graphic scale ("scale_derived") > visual estimate ("visual_estimate") > inference ("inferred").
5. Wall thickness: common block/brick conventions are 9-inch = 0.225m, 6-inch = 0.15m, 5-inch = 0.125m; if the plan/schedule annotates a different thickness (any unit), report that instead. If a plan shows wall hatching without annotation, use the drawn thickness from scale.
6. Roof pitch: only report when explicitly annotated (degrees or rise ratio) or clearly shown in a section; otherwise omit it.

Return ONLY a JSON object with this exact shape:
{
  "fields": [
    {
      "key": "<one of the keys below>",
      "value": <number or enum string>,
      "unit": "<unit as shown in the catalog, or the unit you read e.g. mm, ft — lengths are normalized server-side>",
      "confidence": 0.0-1.0,
      "source": "dimension_annotation" | "scale_derived" | "visual_estimate" | "text_description" | "inferred",
      "evidence": "<short quote/description>"
    }
  ],
  "notes": ["<observations about the document: title block, scale, drawing number, what is visible>"],
  "warnings": ["<limitations, unreadable areas, values that need verification>"]
}

Allowed field keys (use EXACTLY these keys, omit any you cannot determine):
${catalog}
${textDescription ? `\nThe user's description:\n"""${textDescription.slice(0, 2000)}"""` : ""}`;
}

// ── Main ──

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const rlKey = getRateLimitKey(req, req.headers.get("x-user-id") || undefined);
  const rl = checkRateLimit(rlKey, RATE_LIMITS.AI);
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
  const rlHeaders = rateLimitHeaders(rl.remaining, rl.resetAt);

  let body: ExtractionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, rlHeaders);
  }

  const documentKind: DocumentKind =
    body.documentKind === "roof_plan" ||
    body.documentKind === "building_photo" ||
    body.documentKind === "text_description"
      ? body.documentKind
      : "architectural_plan";
  const textDescription =
    typeof body.textDescription === "string" ? body.textDescription.trim() : "";
  const documentDataUrl =
    typeof body.documentDataUrl === "string" ? body.documentDataUrl : "";
  const regionContext =
    typeof body.regionContext === "string"
      ? body.regionContext.slice(0, 200)
      : "";

  if (!documentDataUrl && !textDescription) {
    return jsonResponse(
      {
        error: "Provide a document image/PDF or a text description.",
        code: "NO_INPUT",
      },
      400,
      rlHeaders,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const geminiApiKey =
    Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      { error: "Server not configured.", code: "NOT_CONFIGURED" },
      500,
      rlHeaders,
    );
  }
  if (!geminiApiKey) {
    return jsonResponse(
      { error: "AI service not configured.", code: "NO_API_KEY" },
      503,
      rlHeaders,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Same access gate as ai-building-estimation: the extraction layer is part
  // of the premium estimation feature set.
  const { data: settings } = await supabase
    .from("site_settings")
    .select("estimation_enabled, estimation_access_mode")
    .maybeSingle();
  if (
    !settings?.estimation_enabled ||
    settings.estimation_access_mode === "disabled"
  ) {
    return jsonResponse(
      { error: "AI extraction is currently disabled.", code: "AI_DISABLED" },
      403,
      rlHeaders,
    );
  }

  // ── Gemini call ──
  const prompt = buildPrompt(
    documentKind,
    textDescription || undefined,
    regionContext || undefined,
  );
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (documentDataUrl) {
    const mimeMatch = documentDataUrl.match(/^data:([^;,]+)[;,]/);
    const base64 = documentDataUrl.includes(",")
      ? documentDataUrl.split(",")[1]
      : documentDataUrl;
    if (!base64 || base64.length > 14_000_000) {
      return jsonResponse(
        { error: "Document too large (max ~10MB).", code: "TOO_LARGE" },
        413,
        rlHeaders,
      );
    }
    parts.push({
      inline_data: {
        mime_type: mimeMatch?.[1] ?? "image/jpeg",
        data: base64,
      },
    });
  }

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKeySafe(geminiApiKey)}`,
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
    console.error("[ai-construction-extraction] fetch error:", e);
    return jsonResponse(
      {
        error:
          "The AI service is temporarily unavailable. Please try again or enter your dimensions manually.",
        code: "PROVIDER_ERROR",
      },
      502,
      rlHeaders,
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      "[ai-construction-extraction] Gemini API error:",
      response.status,
      errText,
    );
    return jsonResponse(
      {
        error:
          "The AI service is temporarily unavailable. Please try again or enter your dimensions manually.",
        code: "PROVIDER_ERROR",
      },
      502,
      rlHeaders,
    );
  }

  let fields: SanitizedField[];
  let notes: string[] = [];
  let warnings: string[] = [];
  try {
    const geminiData = await response.json();
    const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) throw new Error("No response text from Gemini");
    const parsed = JSON.parse(textContent);
    fields = sanitizeFields(parsed?.fields);
    notes = Array.isArray(parsed?.notes)
      ? parsed.notes.filter((n: unknown) => typeof n === "string").slice(0, 12)
      : [];
    warnings = Array.isArray(parsed?.warnings)
      ? parsed.warnings
          .filter((w: unknown) => typeof w === "string")
          .slice(0, 12)
      : [];
  } catch (e) {
    console.error("[ai-construction-extraction] parse error:", e);
    return jsonResponse(
      {
        error:
          "The AI response could not be read. Please try again or enter your dimensions manually.",
        code: "INVALID_RESPONSE",
      },
      502,
      rlHeaders,
    );
  }

  return jsonResponse(
    {
      documentKind,
      fields,
      notes,
      warnings,
      processedAt: new Date().toISOString(),
    },
    200,
    rlHeaders,
  );
});

function apiKeySafe(key: string): string {
  return encodeURIComponent(key);
}
