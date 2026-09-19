// =========================================================
// FRELUX Roof View — Imagery Edge Function
// Feature 2: Roof View (audit item F3)
//
// Activates the roof-view imagery feature. The frontend hook
// (src/lib/roof/use-roof-view.ts) has always called this
// function, but it was never implemented — the feature was
// dead UI. This function:
//   1. Verifies the caller is authenticated (never anonymous —
//      this proxies a paid provider API)
//   2. Reads the admin-configured provider from roof_view_config
//   3. Reads the provider API key SERVER-SIDE from
//      integration_settings (admin-configured) — the key is
//      NEVER returned to the client
//   4. Fetches imagery from the provider, and returns it as a
//      data URL so the provider URL (which embeds the key) is
//      never exposed
//
// NEVER fabricates imagery. Every failure returns an honest,
// machine-readable result ({ available: false, error }).
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

// Imagery fetch ceiling — protects the platform from oversized
// provider responses (and honest abuse in the reverse direction).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 30_000;

interface RoofViewRequest {
  location: {
    address?: string;
    latitude?: number;
    longitude?: number;
    label?: string;
  };
  provider_type?: string; // informational only — server config is authoritative
}

interface RoofViewConfigRow {
  provider_type: string;
  enabled: boolean;
  api_key_configured: boolean;
  display_name: string;
  settings: Record<string, unknown> | null;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

/** Honest unavailable result — mirrors the frontend RoofViewImageryResult contract. */
function unavailable(
  error: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ available: false, error, ...extra });
}

// =========================================================
// Auth
// =========================================================

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

// =========================================================
// Config (server-side, service role)
// =========================================================

async function loadProviderConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<RoofViewConfigRow | null> {
  const { data, error } = await supabase
    .from("roof_view_config")
    .select(
      "provider_type, enabled, api_key_configured, display_name, settings",
    )
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as RoofViewConfigRow;
}

/**
 * Resolve the provider API key. Lookup order:
 *   1. integration_settings row `roof_view` (config.api_key) — what the
 *      admin Roof View page writes
 *   2. integration_settings row `roof_view_<provider>` (config.api_key)
 *   3. Deno env fallbacks (GOOGLE_MAPS_API_KEY / MAPBOX_ACCESS_TOKEN)
 * The key never leaves the server.
 */
async function loadProviderApiKey(
  supabase: ReturnType<typeof createClient>,
  providerType: string,
): Promise<string> {
  for (const key of ["roof_view", `roof_view_${providerType}`]) {
    const { data } = await supabase
      .from("integration_settings")
      .select("config")
      .eq("integration_key", key)
      .maybeSingle();
    const config = (data?.config ?? {}) as Record<string, unknown>;
    if (typeof config.api_key === "string" && config.api_key)
      return config.api_key;
  }
  const envFallback =
    providerType === "google_maps"
      ? Deno.env.get("GOOGLE_MAPS_API_KEY")
      : providerType === "mapbox"
        ? Deno.env.get("MAPBOX_ACCESS_TOKEN")
        : undefined;
  return envFallback ?? "";
}

// =========================================================
// Providers
// =========================================================

interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  /** web-mercator bounds for the returned image, if computable */
  bounds?: { north: number; south: number; east: number; west: number };
}

/** Web-mercator bounds for a static map centered at lat/lng with size W×H at zoom z. */
function mercatorBounds(
  lat: number,
  lng: number,
  zoom: number,
  widthPx: number,
  heightPx: number,
): { north: number; south: number; east: number; west: number } {
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const halfWm = (metersPerPixel * widthPx) / 2;
  const halfHm = (metersPerPixel * heightPx) / 2;
  const metersPerDegLat = 111_320;
  const dLat = halfHm / metersPerDegLat;
  const dLng = halfWm / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lng + dLng,
    west: lng - dLng,
  };
}

function num(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = settings[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

function str(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = settings[key];
  if (typeof v === "string" && v) return v;
  return fallback;
}

/**
 * Build the provider HTTP request. The API key is embedded in the URL or
 * headers here — this value is used server-side ONLY and is never returned.
 */
function buildProviderRequest(
  providerType: string,
  apiKey: string,
  settings: Record<string, unknown>,
  lat: number,
  lng: number,
): BuiltRequest {
  const zoom = num(settings, "zoom", 20);
  const size = str(settings, "size", "1200x1200");
  const [wStr, hStr] = size.split("x");
  const width = Number.parseInt(wStr, 10) || 1200;
  const height = Number.parseInt(hStr, 10) || 1200;

  switch (providerType) {
    case "google_maps": {
      const maptype = str(settings, "maptype", "satellite");
      const url =
        `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
        `&zoom=${zoom}&maptype=${encodeURIComponent(maptype)}&size=${width}x${height}` +
        `&key=${encodeURIComponent(apiKey)}`;
      return {
        url,
        headers: {},
        bounds: mercatorBounds(lat, lng, zoom, width, height),
      };
    }
    case "mapbox": {
      const highRes = settings.high_resolution !== false;
      const dims = highRes ? `@2x/${width}x${height}` : `/${width}x${height}`;
      const url =
        `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
        `${lng},${lat},${zoom}${dims}?access_token=${encodeURIComponent(apiKey)}`;
      return {
        url,
        headers: {},
        bounds: mercatorBounds(
          lat,
          lng,
          zoom,
          width * (highRes ? 0.5 : 1),
          height * (highRes ? 0.5 : 1),
        ),
      };
    }
    case "custom": {
      const endpoint = str(settings, "endpoint_url", "");
      if (!endpoint) {
        throw new Error("Custom provider has no endpoint_url configured.");
      }
      const headerName = str(settings, "api_key_header", "Authorization");
      const url = endpoint
        .replaceAll("{lat}", String(lat))
        .replaceAll("{lng}", String(lng))
        .replaceAll("{lon}", String(lng))
        .replaceAll("{zoom}", String(zoom))
        .replaceAll("{width}", String(width))
        .replaceAll("{height}", String(height));
      return {
        url,
        headers: apiKey ? { [headerName]: apiKey } : {},
      };
    }
    default:
      throw new Error(
        `Provider '${providerType}' retrieval is not implemented yet.`,
      );
  }
}

// =========================================================
// Handler
// =========================================================

serveWithCors(async (req: Request) => {
  // (OPTIONS preflight is answered by serveWithCors before this handler runs)
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // --- 1. Authenticated callers only (this proxies a paid provider API) ---
  const userId = await getAuthenticatedUserId(req, supabaseUrl, anonKey);
  if (!userId) {
    return jsonResponse(
      {
        available: false,
        error: "Sign in to use Roof View imagery.",
        code: "AUTH_REQUIRED",
      },
      401,
    );
  }

  // --- 2. Rate limit (per user, in-memory per isolate) ---
  const rl = checkRateLimit(getRateLimitKey(req, userId), {
    maxRequests: RATE_LIMITS.GENERAL.maxRequests,
    windowMs: RATE_LIMITS.GENERAL.windowMs,
  });
  if (!rl.allowed) {
    return jsonResponse(
      {
        available: false,
        error: "Too many imagery requests. Please wait a minute.",
        code: "RATE_LIMITED",
      },
      429,
      rateLimitHeaders(rl.remaining, rl.resetAt),
    );
  }

  // --- 3. Parse + validate input ---
  let payload: RoofViewRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      400,
    );
  }
  const { latitude, longitude } = payload.location ?? {};
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return unavailable(
      "A precise latitude/longitude is required for imagery. Address geocoding is not supported yet.",
      { code: "LOCATION_REQUIRED" },
    );
  }

  // --- 4. Server-side provider config is authoritative ---
  const config = await loadProviderConfig(supabase);
  if (!config) {
    return unavailable(
      "No imagery provider is configured. An admin must configure one in the admin panel (Roof View Imagery).",
      { code: "NOT_CONFIGURED" },
    );
  }
  if (!config.api_key_configured) {
    return unavailable(
      `The ${config.display_name} provider is enabled but its API key is not configured.`,
      { code: "KEY_MISSING", provider: config.provider_type },
    );
  }

  const apiKey = await loadProviderApiKey(supabase, config.provider_type);
  if (!apiKey) {
    return unavailable(
      `The ${config.display_name} provider is enabled but its API key could not be loaded.`,
      { code: "KEY_MISSING", provider: config.provider_type },
    );
  }

  // --- 5. Build + fetch (key stays server-side) ---
  let built: BuiltRequest;
  try {
    built = buildProviderRequest(
      config.provider_type,
      apiKey,
      config.settings ?? {},
      latitude,
      longitude,
    );
  } catch (e) {
    return unavailable(
      e instanceof Error ? e.message : "Provider request could not be built.",
      { provider: config.provider_type },
    );
  }

  let resp: Response;
  try {
    resp = await fetch(built.url, {
      headers: built.headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (_e) {
    return unavailable(
      `Could not reach ${config.display_name}. The provider may be down or the request timed out.`,
      { provider: config.provider_type, provider_error: true },
    );
  }

  if (!resp.ok) {
    // 4xx/5xx from the provider — honest, no detail leakage
    return unavailable(
      `${config.display_name} rejected the imagery request (HTTP ${resp.status}). Check the API key, quota, and billing.`,
      { provider: config.provider_type, provider_error: true },
    );
  }

  const contentType = resp.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length === 0) {
    return unavailable(`${config.display_name} returned an empty image.`, {
      provider: config.provider_type,
      provider_error: true,
    });
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return unavailable(
      `${config.display_name} returned an image larger than the 5 MB ceiling.`,
      { provider: config.provider_type, provider_error: true },
    );
  }
  if (!contentType.startsWith("image/")) {
    return unavailable(
      `${config.display_name} did not return an image (content-type ${contentType || "unknown"}).`,
      { provider: config.provider_type, provider_error: true },
    );
  }

  // --- 6. Return as a data URL so the provider URL (with the key) never reaches the client ---
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataUrl = `data:${contentType};base64,${btoa(binary)}`;

  return jsonResponse({
    available: true,
    imagery_url: dataUrl,
    provider: config.provider_type,
    provider_display_name: config.display_name,
    retrieved_at: new Date().toISOString(),
    bounds: built.bounds,
  });
});
