// =========================================================
// FRELUX Edge Function: ai-building-estimation
// Phase 31
//
// Receives a building photo, uses Google Gemini Vision to analyze
// building characteristics, then runs the Build-to-Roof engine
// logic to produce a full construction cost estimate.
//
// Access is premium-gated via site_settings configuration.
// Usage is consumed server-side only on success.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  checkRateLimit,
  getRateLimitKey,
  rateLimitHeaders,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";

interface EstimationRequest {
  imageDataUrl?: string;
  imageUrl?: string;
  clientId?: string;
  /** Rewarded-unlock client hash (frelux_client_hash) — checked against rewarded_unlock_log */
  clientHash?: string;
  projectName?: string;
  location?: string;
}

interface SiteEstimationConfig {
  estimation_enabled: boolean;
  estimation_access_mode: string;
  estimation_daily_free_uses: number;
  estimation_admin_override: boolean;
  estimation_paid_enabled: boolean;
  estimation_paid_price: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Check for an active rewarded unlock (granted by grant-rewarded-unlock
 * after a real Monetag rewarded ad). If the client (or, when signed in,
 * the user) has an unexpired unlock for the image_estimator tool, the
 * daily free-usage limit does not apply.
 */
async function hasActiveRewardedUnlock(
  supabase: ReturnType<typeof createClient>,
  clientHash: string | undefined,
  userId: string | null,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  // Anonymous: match by client hash
  if (clientHash && clientHash !== "unknown") {
    const { data } = await supabase
      .from("rewarded_unlock_log")
      .select("expires_at")
      .eq("tool_key", "image_estimator")
      .eq("client_hash", clientHash)
      .gt("expires_at", nowIso)
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }

  // Signed-in: match by user so the unlock follows the account
  if (userId) {
    const { data } = await supabase
      .from("rewarded_unlock_log")
      .select("expires_at")
      .eq("tool_key", "image_estimator")
      .eq("user_id", userId)
      .gt("expires_at", nowIso)
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }

  return false;
}

async function getAuthenticatedUserId(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function isUserAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

async function getUserPaidStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_paid_status")
    .select("is_paid, paid_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.is_paid) return false;
  if (data.paid_until) {
    const expiry = new Date(data.paid_until).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

async function getEstimationConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<SiteEstimationConfig | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select(
      "estimation_enabled, estimation_access_mode, estimation_daily_free_uses, estimation_admin_override, estimation_paid_enabled, estimation_paid_price",
    )
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    estimation_enabled: data.estimation_enabled ?? false,
    estimation_access_mode: data.estimation_access_mode ?? "disabled",
    estimation_daily_free_uses: data.estimation_daily_free_uses ?? 0,
    estimation_admin_override: data.estimation_admin_override ?? true,
    estimation_paid_enabled: data.estimation_paid_enabled ?? false,
    estimation_paid_price: Number(data.estimation_paid_price) || 0,
  };
}

async function getDailyUsage(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  userId: string | null,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  let query;
  if (userId) {
    query = supabase
      .from("estimation_usage_daily")
      .select("uses_consumed")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
  } else {
    query = supabase
      .from("estimation_usage_daily")
      .select("uses_consumed")
      .eq("client_hash", clientId)
      .eq("usage_date", today)
      .maybeSingle();
  }
  const { data } = await query;
  return data?.uses_consumed ?? 0;
}

async function consumeDailyUse(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  userId: string | null,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  if (userId) {
    const { data: existing } = await supabase
      .from("estimation_usage_daily")
      .select("id, uses_consumed")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("estimation_usage_daily")
        .update({ uses_consumed: (existing.uses_consumed ?? 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("estimation_usage_daily").insert({
        user_id: userId,
        client_hash: clientId,
        usage_date: today,
        uses_consumed: 1,
      });
    }
  } else {
    const { data: existing } = await supabase
      .from("estimation_usage_daily")
      .select("id, uses_consumed")
      .eq("client_hash", clientId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("estimation_usage_daily")
        .update({ uses_consumed: (existing.uses_consumed ?? 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("estimation_usage_daily").insert({
        client_hash: clientId,
        usage_date: today,
        uses_consumed: 1,
      });
    }
  }
}

// ── Gemini Vision API call ──

async function analyzeBuildingImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const prompt = `You are an expert construction engineer and architect specializing in Nigerian building construction. You have deep knowledge of Nigerian building codes, construction practices, material specifications, and cost estimation.

Analyze this building image with engineering precision. Extract building characteristics that will be used for a full construction cost estimate.

IMPORTANT: Be extremely precise and honest about what you can and cannot determine from a single photo. Do not hallucinate measurements — if you cannot determine something, provide your best conservative estimate and flag it as uncertain.

Return a JSON object with these exact fields:
{
  "detected_building_type": "bungalow" | "duplex" | "two_storey" | "apartment" | "office" | "shop" | "custom",
  "detected_building_type_confidence": 0.0-1.0,
  "estimated_length": number (meters — use visual scale cues: doors are ~0.9m wide, windows ~1.2m, floor height ~3m),
  "estimated_width": number (meters — if only one facade visible, estimate from building proportions),
  "estimated_floors": number (count visible floor levels — look for window rows, floor lines),
  "estimated_height_per_floor": number (meters — typically 3.0-3.5m for residential, 3.5-4.5m for commercial),
  "detected_roof_type": "gable" | "hip" | "mono_pitch" | "flat" | "custom",
  "detected_roof_type_confidence": 0.0-1.0,
  "estimated_roof_pitch": number (degrees — gable: 15-30°, hip: 15-25°, flat: 0-5°),
  "detected_roofing_material": "long_span_aluminium" | "stone_coated" | "gi_sheet" | "shingle" | "custom",
  "detected_roofing_material_confidence": 0.0-1.0,
  "detected_block_type": "9inch" | "6inch" | "5inch" | "custom",
  "detected_wall_finish": "unplastered" | "plastered" | "painted" | "faced_brick" | "stone" | "custom",
  "estimated_internal_wall_length": number (meters — for bungalows: 40-60% of external perimeter; for duplexes: 60-80%),
  "detected_openings": [{"type": "door" | "window", "estimated_width": number, "estimated_height": number, "estimated_count": number}],
  "detected_foundation_type": "strip_footing" | "pad_footing" | "raft" | "pile" | "custom",
  "detected_structural_frame": "unreinforced_blockwork" | "framed_with_columns" | "hybrid" | "uncertain",
  "estimated_bays": number (number of structural bays/columns visible, 0 if uncertain),
  "detected_condition": "under_construction" | "completed" | "renovation" | "dilapidated",
  "estimated_number_of_rooms": number (visible rooms based on openings, 0 if uncertain),
  "ai_confidence": "high" | "moderate" | "low",
  "confidence_factors": {
    "image_quality": 0.0-1.0,
    "angle_quality": 0.0-1.0,
    "scale_reference_visible": boolean,
    "multiple_facades_visible": boolean
  },
  "analysis_notes": [array of detailed strings explaining your observations and reasoning],
  "structural_observations": [array of strings about structural elements visible: columns, beams, lintels, cracks, etc.],
  "warnings": [array of strings about limitations and risks of this estimate],
  "verification_checklist": [array of strings — items the user should verify on-site or from drawings before proceeding]
}

PRECISION GUIDELINES:
1. Scale estimation: Use doors (0.9m wide, 2.1m tall), windows (1.2-1.5m wide, 1.2m tall), and floor heights (3m) as reference
2. If only one facade is visible, DO NOT guess the width — estimate based on building type proportions (bungalow L:W typically 1.5:1)
3. Roof pitch: Estimate from the visible roof slope angle relative to horizontal
4. Roofing material: Look for panel width, corrugation pattern, color, and reflectivity
5. Block type: Nigerian blocks come in 5-inch (solid only), 6-inch (solid or hollow), and 9-inch (hollow). Default to 9-inch unless you can clearly see thinner blocks. 9-inch is standard for foundations and load-bearing external walls. 6-inch is common for internal partitions. 5-inch is solid-only, used for non-load-bearing walls.
6. Internal walls: Cannot be seen — estimate based on building size and type
7. Foundation: Cannot be seen — ALWAYS default to "strip_footing" and add to warnings
8. Structural frame: Look for visible columns, beams, or column starter bars in unfinished buildings
9. Opening count: Count only visible openings, add a warning that hidden sides may have more
10. Condition: Look for scaffolding, fresh mortar, unpainted surfaces, or weathering
11. Be HONEST about confidence — if the image is blurry or at a poor angle, say "low" confidence

Always include in warnings:
- "Dimensions estimated from photo are approximate. Verify from architectural drawings."
- "Foundation type is not visible — defaulting to strip footing. Geotechnical investigation required."
- "Internal wall layout estimated statistically — verify from floor plans."

Always include in verification_checklist:
- "Confirm actual building dimensions from approved drawings"
- "Verify soil type and bearing capacity with geotechnical report"
- "Engage structural engineer for reinforcement design"
- "Verify roof structure and pitch from architectural drawings"`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageDataUrl.split(",")[1] ?? imageDataUrl,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      "[ai-building-estimation] Gemini API error:",
      response.status,
      errText,
    );
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const geminiData = await response.json();
  const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) throw new Error("No response text from Gemini");

  return JSON.parse(textContent);
}

// ── Default prices/labour/wastage (mirror of engine defaults) ──

// Mirrors src/lib/estimation/build-to-roof-engine.ts DEFAULT_PRICES/DEFAULT_LABOUR/DEFAULT_WASTAGE.
// IMPORTANT: keep these in sync with the engine — this edge function runs in Deno and
// cannot import the frontend module directly. Missing/misnamed fields here silently
// produce NaN totals (undefined * number = NaN) in the calculator.
const DEFAULT_PRICES = {
  cement_per_bag: 10000,
  block_per_piece: 450,
  sand_per_m3: 55000,
  sand_per_trip: 192500,
  granite_per_m3: 110000,
  granite_per_trip: 385000,
  hardcore_per_m3: 40000,
  reinforcement_per_tonne: 1350000,
  rebar_12mm_per_length: 9500,
  rebar_16mm_per_length: 16500,
  rebar_20mm_per_length: 25500,
  rebar_25mm_per_length: 38000,
  binding_wire_per_kg: 3000,
  timber_per_m: 3500,
  roofing_sheet_per_piece: 12000,
  ridge_cap_per_meter: 4500,
  roofing_screws_per_piece: 200,
  fascia_per_meter: 3000,
  dpc_per_meter: 1000,
  dpm_per_m2: 1500,
  formwork_per_m2: 5500,
  price_date: new Date().toISOString().split("T")[0],
  price_source: "FRELUX default — Nigerian market (auto-updated)",
};

const DEFAULT_LABOUR = {
  excavation_per_m3: 4000,
  blockwork_per_block: 200,
  concrete_per_m3: 30000,
  reinforcement_per_tonne: 180000,
  formwork_per_m2: 6000,
  roofing_per_m2: 6000,
  blinding_per_m3: 10000,
  hardcore_per_m3: 7000,
  sand_filling_per_m3: 6000,
  compaction_per_m3: 3500,
  backfilling_per_m3: 3000,
  general_labour_per_day: 12000,
  general_labour_days: 5,
  bricklayer_per_day: 10000,
  bricklayer_days: 20,
  contractor_fee: 600000,
  contractor_fee_type: "contract",
  contractor_days: 30,
  supervisor_per_day: 12000,
  supervisor_days: 30,
  foreman_per_day: 8000,
  foreman_days: 25,
  carpenter_per_day: 10000,
  carpenter_days: 15,
  concrete_labourer_per_day: 7000,
  concrete_labourer_days: 15,
};

const DEFAULT_WASTAGE = {
  blocks: 5,
  cement: 5,
  sand: 10,
  granite: 10,
  reinforcement: 3,
  timber: 10,
  roofing_sheets: 5,
  hardcore: 5,
};

// ── Build the estimate input from AI analysis ──

function buildEstimateInput(
  analysis: Record<string, unknown>,
  projectName: string,
  location: string,
) {
  const openings = Array.isArray(analysis.detected_openings)
    ? analysis.detected_openings.map((o: Record<string, unknown>) => ({
        type: (o.type as "door" | "window") ?? "window",
        width: Number(o.estimated_width) || 1.2,
        height: Number(o.estimated_height) || 1.2,
        count: Math.floor(Number(o.estimated_count) || 1),
      }))
    : [];

  // Ensure at least some openings if none detected
  if (openings.length === 0) {
    openings.push(
      { type: "door", width: 0.9, height: 2.1, count: 4 },
      { type: "window", width: 1.2, height: 1.2, count: 6 },
    );
  }

  return {
    project_name: projectName || "AI-Estimated Building",
    location: location || "Nigeria",
    building_type: (analysis.detected_building_type as string) || "bungalow",
    number_of_floors: Math.max(
      1,
      Math.floor(Number(analysis.estimated_floors) || 1),
    ),
    building_length: Math.max(1, Number(analysis.estimated_length) || 15),
    building_width: Math.max(1, Number(analysis.estimated_width) || 10),
    floor_to_floor_height: Math.max(
      2.5,
      Number(analysis.estimated_height_per_floor) || 3,
    ),
    wall_thickness: 0.225,
    internal_wall_length: Math.max(
      0,
      Number(analysis.estimated_internal_wall_length) || 25,
    ),
    internal_wall_thickness: 0.15,
    openings,
    foundation_type:
      (analysis.detected_foundation_type as string) || "strip_footing",
    foundation_depth: 0.9,
    foundation_width: 0.675,
    footing_thickness: 0.225,
    blinding_thickness: 0.075,
    hardcore_thickness: 0.15,
    dpc_length: 50,
    block_size: (analysis.detected_block_type as string) || "9inch",
    block_length: 18,
    block_height: 9,
    block_width: 9,
    concrete_mix_cement: 1,
    concrete_mix_sand: 2,
    concrete_mix_granite: 4,
    mortar_mix_cement: 1,
    mortar_mix_sand: 6,
    roof_type: (analysis.detected_roof_type as string) || "gable",
    roof_pitch_degrees: Number(analysis.estimated_roof_pitch) || 25,
    roof_overhang: 0.6,
    roofing_material:
      (analysis.detected_roofing_material as string) || "long_span_aluminium",
    structural_members: [],
    has_engineer_schedule: false,
    wastage: DEFAULT_WASTAGE,
    prices: DEFAULT_PRICES,
    labour: DEFAULT_LABOUR,
    contingency_percent: 5,
  };
}

// ── AI output validation ──

interface ValidationWarning {
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
}

function validateAiAnalysis(
  analysis: Record<string, unknown>,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check required fields
  const requiredFields = [
    "detected_building_type",
    "estimated_length",
    "estimated_width",
    "estimated_floors",
  ];
  for (const field of requiredFields) {
    if (analysis[field] === undefined || analysis[field] === null) {
      warnings.push({
        field,
        message: `Missing required field: ${field}`,
        severity: "error",
      });
    }
  }

  // Sanity checks on dimensions
  const length = Number(analysis.estimated_length) || 0;
  const width = Number(analysis.estimated_width) || 0;
  const floors = Number(analysis.estimated_floors) || 1;
  const height = Number(analysis.estimated_height_per_floor) || 3;

  if (length < 3)
    warnings.push({
      field: "estimated_length",
      message: `Length ${length}m is unusually small. Verify.`,
      severity: "warning",
    });
  if (length > 50)
    warnings.push({
      field: "estimated_length",
      message: `Length ${length}m is unusually large. Verify.`,
      severity: "warning",
    });
  if (width < 3)
    warnings.push({
      field: "estimated_width",
      message: `Width ${width}m is unusually small. Verify.`,
      severity: "warning",
    });
  if (width > 50)
    warnings.push({
      field: "estimated_width",
      message: `Width ${width}m is unusually large. Verify.`,
      severity: "warning",
    });
  if (height < 2.5)
    warnings.push({
      field: "height",
      message: `Floor height ${height}m is below 2.5m minimum.`,
      severity: "warning",
    });
  if (height > 5)
    warnings.push({
      field: "height",
      message: `Floor height ${height}m is above typical. Verify.`,
      severity: "info",
    });
  if (floors > 5)
    warnings.push({
      field: "floors",
      message: `${floors} floors — high-rise requires specialist design.`,
      severity: "warning",
    });

  // Roof pitch sanity
  const pitch = Number(analysis.estimated_roof_pitch) || 0;
  const roofType = analysis.detected_roof_type as string;
  if (roofType === "flat" && pitch > 5) {
    warnings.push({
      field: "roof_pitch",
      message: `Flat roof with ${pitch}° pitch — should be near 0°.`,
      severity: "warning",
    });
  }
  if (roofType === "gable" && (pitch < 10 || pitch > 40)) {
    warnings.push({
      field: "roof_pitch",
      message: `Gable roof pitch ${pitch}° is outside typical 15-30° range.`,
      severity: "warning",
    });
  }

  // Opening count sanity
  const openings = analysis.detected_openings as unknown[];
  if (openings && Array.isArray(openings)) {
    const totalOpenings = openings.reduce(
      (sum: number, o: unknown) =>
        sum +
        Math.floor(Number((o as Record<string, unknown>).estimated_count) || 0),
      0,
    );
    const buildingArea = length * width * floors;
    if (buildingArea > 0 && totalOpenings > buildingArea / 2) {
      warnings.push({
        field: "openings",
        message: `Opening count (${totalOpenings}) seems high for building size. Verify.`,
        severity: "info",
      });
    }
  }

  return warnings;
}

// ── Main handler ──

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limit: 20 AI requests per minute per user/IP
  const rlKey = getRateLimitKey(req, req.headers.get("x-user-id") || undefined);
  const rl = checkRateLimit(rlKey, RATE_LIMITS.AI);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }
  const _rlHeaders = rateLimitHeaders(rl.remaining, rl.resetAt);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const geminiApiKey =
    Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      { error: "Server not configured.", code: "NOT_CONFIGURED" },
      500,
    );
  }

  if (!geminiApiKey) {
    return jsonResponse(
      { error: "AI service not configured.", code: "NO_API_KEY" },
      503,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ── Auth & access control ──
    const userId = await getAuthenticatedUserId(
      req,
      supabaseUrl,
      supabaseAnonKey,
    );
    const admin = userId ? await isUserAdmin(supabase, userId) : false;
    const paid = userId ? await getUserPaidStatus(supabase, userId) : false;

    const config = await getEstimationConfig(supabase);
    if (!config || !config.estimation_enabled) {
      return jsonResponse(
        {
          error: "Image estimation is currently disabled.",
          code: "AI_DISABLED",
        },
        403,
      );
    }

    if (config.estimation_access_mode === "disabled") {
      return jsonResponse(
        {
          error: "Image estimation is currently disabled.",
          code: "AI_DISABLED",
        },
        403,
      );
    }

    // Read body once (req.json() can only be called once)
    const body = (await req.json()) as EstimationRequest;

    // Admin override
    if (admin && config.estimation_admin_override) {
      // Admins can always use it
    } else {
      // Paid mode
      if (config.estimation_access_mode === "paid") {
        if (!paid) {
          return jsonResponse(
            {
              error: "This feature requires a premium subscription.",
              code: "NOT_SUBSCRIBED",
              price: config.estimation_paid_price,
            },
            403,
          );
        }
      } else {
        // Free/rewarded modes — check daily limit. An active rewarded
        // unlock (watched a Monetag rewarded ad) bypasses the limit.
        const clientId = body.clientId ?? "unknown";
        const unlocked = await hasActiveRewardedUnlock(
          supabase,
          body.clientHash,
          userId,
        );
        const usedToday = await getDailyUsage(supabase, clientId, userId);

        if (!unlocked && usedToday >= config.estimation_daily_free_uses) {
          const limitMsg =
            config.estimation_daily_free_uses === 0
              ? "Free AI estimations are no longer included in the Free plan. Use FRELUX Credits to access AI features."
              : "You have used all your free image estimations for today.";
          return jsonResponse(
            {
              error: limitMsg,
              code: "USAGE_LIMIT_REACHED",
              usedToday,
              limit: config.estimation_daily_free_uses,
            },
            429,
          );
        }
      }
    }

    // ── Process request ──
    const clientId = body.clientId ?? "unknown";
    const projectName = body.projectName ?? "AI-Estimated Building";
    const location = body.location ?? "Nigeria";

    if (!body.imageDataUrl && !body.imageUrl) {
      return jsonResponse(
        { error: "No image provided.", code: "NO_IMAGE" },
        400,
      );
    }

    // For image URLs, we'd need to fetch and convert to base64.
    // For now, we support imageDataUrl (base64 from frontend)
    const imageDataUrl = body.imageDataUrl;
    if (!imageDataUrl) {
      return jsonResponse(
        {
          error: "Image URL processing not yet supported.",
          code: "UNSUPPORTED",
        },
        400,
      );
    }

    // ── AI analysis ──
    const analysis = await analyzeBuildingImage(imageDataUrl, geminiApiKey);

    // ── Validate AI output ──
    const validationWarnings = validateAiAnalysis(analysis);
    if (validationWarnings.length > 0) {
      // Add validation warnings to the analysis
      const existingWarnings = (analysis.warnings as string[]) ?? [];
      analysis.warnings = [
        ...existingWarnings,
        ...validationWarnings.map(
          (w) => `[${w.severity.toUpperCase()}] ${w.field}: ${w.message}`,
        ),
      ];
    }
    analysis.validation_passed =
      validationWarnings.filter((w) => w.severity === "error").length === 0;

    // ── Consume usage (only on success) ──
    if (!admin || !config.estimation_admin_override) {
      await consumeDailyUse(supabase, clientId, userId);
    }

    // ── Build estimate input ──
    const estimateInput = buildEstimateInput(analysis, projectName, location);

    // ── Save to database if authenticated ──
    let savedId: string | null = null;
    if (userId) {
      const { data: saved } = await supabase
        .from("estimation_results")
        .insert({
          user_id: userId,
          project_name: projectName,
          analysis,
          estimate_summary: {
            building_type: analysis.detected_building_type,
            floors: analysis.estimated_floors,
            ai_confidence: analysis.ai_confidence,
          },
          full_estimate: estimateInput,
        })
        .select("id")
        .maybeSingle();

      savedId = saved?.id ?? null;
    }

    return jsonResponse({
      analysis,
      estimateInput,
      savedId,
    });
  } catch (err) {
    console.error("[ai-building-estimation] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message, code: "INTERNAL_ERROR" }, 500);
  }
});
