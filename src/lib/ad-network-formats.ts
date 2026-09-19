/**
 * Ad network format catalog & site-wide script injection helpers.
 *
 * Adsterra and Monetag both offer more than the classic banner:
 *   Adsterra, Banner (atOptions + invoke.js, per-slot iframe, see AdSlot),
 *              Native Banner (native.js, renders in-place), Interstitial,
 *              Popunder, Social Bar (all site-wide script tags).
 *   Monetag , Display/auto zones via tag.min.js (data-zone), Rewarded
 *              (src/lib/monetag-rewarded.ts), plus Interstitial / Popunder /
 *              Vignette auto zones.
 *
 * Every field is dormant until the admin fills it, empty credentials never
 * inject anything. Keys are strictly validated (32-char hex for Adsterra,
 * numeric zone IDs for Monetag) and script URLs must sit on an allowlisted
 * Adsterra serve domain, so a pasted value can never smuggle arbitrary
 * script origins into the page.
 */
import type { DbAdProvider } from "@/types/database";

/**
 * Monetag delivery domain + tag URL — the single source of truth for
 * the whole app (AdSlot, Layout, monetag-rewarded). Monetag assigns a
 * per-publisher delivery domain; if it ever rotates, change it HERE and
 * in the CSP allowlists (public/_headers, netlify.toml, vercel.json).
 */
export const MONETAG_TAG_DOMAIN = "quge5.com";
export const MONETAG_TAG_URL = `https://${MONETAG_TAG_DOMAIN}/88/tag.min.js`;

/**
 * Monetag vignette delivery domain + script URL. Monetag serves the
 * vignette format through a per-publisher script (the dashboard snippet
 * is <script>(function(s){s.dataset.zone='...',s.src='https://n6wxm.com/
 * vignette.min.js'})(…)</script>). Requesting the zone through the generic
 * multi-tag instead can silently no-serve the vignette, so the format
 * gets its own script URL. If the delivery domain rotates, change it HERE
 * and in the CSP allowlists (public/_headers, netlify.toml). A per-format
 * credential override (<format>_script_url) wins when set in Admin.
 */
export const MONETAG_VIGNETTE_DOMAIN = "n6wxm.com";
export const MONETAG_VIGNETTE_URL = `https://${MONETAG_VIGNETTE_DOMAIN}/vignette.min.js`;

/** Whether a provider's VISUAL display ads are enabled (mirrors AdSlot's rule). */
export function displayAdsEnabled(provider: DbAdProvider): boolean {
  return provider.settings?.display_ads_enabled !== false;
}

/** Hostnames Adsterra serves ad scripts from. */
export const ADSTERRA_SERVE_HOSTS = [
  "highperformanceformat.com",
  "highrevenueformat.com",
  "profitabledisplaynetwork.com",
  "profitablecpmrate.com",
  "profitableratecpmnetwork.com",
  "adsterrapremium.com",
];

/** Default Adsterra serve host when none is configured/valid. */
export const ADSTERRA_DEFAULT_SERVE_HOST = "www.highperformanceformat.com";

/**
 * Normalize a configured Adsterra serve domain to a bare, allowlisted
 * hostname. Accepts "www.highperformanceformat.com", bare or full-URL
 * forms, and strips scheme/path. Anything that is not a known Adsterra
 * serve host (typos, unrelated domains) falls back to the default so a
 * bad admin value can never break every banner on the site.
 */
export function normalizeAdsterraServeDomain(raw: unknown): string {
  if (typeof raw !== "string") return ADSTERRA_DEFAULT_SERVE_HOST;
  let host = raw.trim().toLowerCase();
  if (host.includes("//")) {
    try {
      host = new URL(raw.trim()).hostname;
    } catch {
      return ADSTERRA_DEFAULT_SERVE_HOST;
    }
  }
  host = host.replace(/\/.*$/, "").replace(/:\d+$/, "");
  const ok = ADSTERRA_SERVE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  return ok ? host : ADSTERRA_DEFAULT_SERVE_HOST;
}

function isAllowedAdsterraHost(hostname: string, serveDomain: string): boolean {
  const host = hostname.toLowerCase();
  if (host === serveDomain.toLowerCase()) return true;
  return ADSTERRA_SERVE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Accepts either a bare Adsterra zone key (32-char hex) or the full script
 * URL from the dashboard snippet. Returns the absolute https script URL, or
 * null when the value doesn't look like either shape.
 */
/** Extract the src URL from a pasted dashboard <script> snippet, if any.
 *  Admins frequently paste the entire snippet from the Adsterra dashboard
 *  ("<script src=\"...\"></script>") instead of the bare key/URL, pull the
 *  https URL back out so the integration still works. Returns null when the
 *  value contains no URL at all. */
export function extractAdsterraScriptSrc(raw: string): string | null {
  const m = raw.match(/src=\\?["']([^"'\\]+)["']/i);
  if (m && /^[a-z]/i.test(m[1])) return m[1];
  const bare = raw.match(/(?:https?:)?\/\/[^\s"'<>]+/i);
  return bare ? bare[0] : null;
}

export function resolveAdsterraScriptUrl(
  raw: unknown,
  opts: { serveDomain: string; defaultScript: string },
): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;

  // Pasted dashboard snippet → extract the embedded script URL first
  if (value.includes("<script")) {
    const extracted = extractAdsterraScriptSrc(value);
    if (!extracted) return null;
    value = extracted.trim();
  }

  // Bare key → construct the URL on the serve domain
  if (/^[a-f0-9]{20,40}$/i.test(value)) {
    return `https://${opts.serveDomain}/${value}/${opts.defaultScript}`;
  }

  // Full URL → validate protocol, host and a clean path
  const candidate = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    if (!isAllowedAdsterraHost(url.hostname, opts.serveDomain)) return null;
    // Path must be /<key>/<script>.js, or the hashed /xx/xx/xx/<hash>.js
    // shape newer Adsterra Social Bar snippets use (no query, no fragment)
    const cleanPath =
      /^\/[a-z0-9-]{4,64}\/[a-z0-9-]+\.js$/i.test(url.pathname) ||
      /^\/([0-9a-f]{2}\/){2,3}[0-9a-f]{16,}\.js$/i.test(url.pathname);
    if (!cleanPath) return null;
    if (url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Adsterra per-slot + site-wide format catalog (config-driven, additive). */
export const ADSTERRA_FORMATS = [
  {
    credentialKey: "native_banner_key",
    format: "native_banner",
    defaultScript: "native.js",
    siteWide: false,
  },
  {
    credentialKey: "interstitial_key",
    format: "interstitial",
    defaultScript: "invoke.js",
    siteWide: true,
  },
  {
    credentialKey: "popunder_key",
    format: "popunder",
    defaultScript: "invoke.js",
    siteWide: true,
  },
  {
    credentialKey: "social_bar_key",
    format: "social_bar",
    defaultScript: "invoke.js",
    siteWide: true,
  },
] as const;

/**
 * Resolved site-wide Adsterra scripts (Interstitial / Popunder / Social Bar).
 * Each entry is injected exactly once per page session by Layout.
 */
export function getAdsterraSiteWideScripts(
  provider: DbAdProvider,
  serveDomain: string,
): Array<{ format: string; src: string }> {
  if (!displayAdsEnabled(provider)) return [];
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const out: Array<{ format: string; src: string }> = [];
  for (const f of ADSTERRA_FORMATS) {
    if (!f.siteWide) continue;
    const src = resolveAdsterraScriptUrl(creds[f.credentialKey], {
      serveDomain,
      defaultScript: f.defaultScript,
    });
    if (src) out.push({ format: f.format, src });
  }
  return out;
}

/**
 * Monetag auto-zone format catalog. These are website zones (Popunder,
 * Interstitial, Vignette) that run automatically via the SDK tag, injected
 * with data-sdk-ignore so they don't create a global show_ function.
 */
export const MONETAG_AUTO_ZONES = [
  { credentialKey: "interstitial_zone_id", format: "interstitial" },
  { credentialKey: "popunder_zone_id", format: "popunder" },
  { credentialKey: "vignette_zone_id", format: "vignette" },
] as const;

function validMonetagZoneId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const zone = String(raw).trim();
  return /^\d{4,10}$/.test(zone) ? zone : null;
}

/**
 * Resolved Monetag auto zones from credentials. Each becomes its own
 * tag.min.js script tag with a unique data-zone.
 */
export function getMonetagAutoZoneScripts(
  provider: DbAdProvider,
): Array<{ format: string; zone: string; src: string }> {
  if (!displayAdsEnabled(provider)) return [];
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const out: Array<{ format: string; zone: string; src: string }> = [];
  for (const f of MONETAG_AUTO_ZONES) {
    const zone = validMonetagZoneId(creds[f.credentialKey]);
    if (zone) {
      out.push({
        format: f.format,
        zone,
        src: getMonetagFormatScriptUrl(provider, f.format),
      });
    }
  }
  return out;
}

/**
 * Script URL that serves a Monetag auto-zone format. The vignette format
 * has its own dashboard-delivered script (MONETAG_VIGNETTE_URL); other
 * formats ride the generic multi-tag. An admin-set credential
 * `<format>_script_url` (e.g. the full URL from the dashboard snippet)
 * overrides the default, as long as it is a clean https URL.
 */
export function getMonetagFormatScriptUrl(
  provider: DbAdProvider,
  format: string,
): string {
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const override = creds[`${format}_script_url`];
  if (typeof override === "string") {
    const url = override.trim();
    if (/^https:\/\/[a-z0-9.-]+\/[a-z0-9.-]+\.js$/i.test(url)) return url;
  }
  return format === "vignette" ? MONETAG_VIGNETTE_URL : MONETAG_TAG_URL;
}

/**
 * Native Banner key resolution for AdSlot: a slot renders the native unit
 * when its resolved key matches the native_banner_key credential.
 */
export function getAdsterraNativeBannerKey(
  provider: DbAdProvider,
): string | null {
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const raw = creds.native_banner_key;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (/^[a-f0-9]{20,40}$/i.test(value)) return value.toLowerCase();
  // Pasted dashboard snippet → extract the zone key out of it
  const m = value.match(/([a-f0-9]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Which Adsterra script product the Native Banner credential points at.
 * Adsterra serves two in-place formats: the newer native.js unit and the
 * classic "container-<key>" Native Banner that loads invoke.js. The admin's
 * pasted snippet tells us which one the zone actually is, rendering a
 * native.js tag for an invoke.js zone (or vice versa) silently no-fills.
 */
/** Whether the Adsterra Native Banner renders site-wide (Layout injects
 * the container + tag on every public page; admin pages never see it).
 * When true, native placements resolve "none" in AdSlot so the unit
 * never renders twice on a page. */
export function getAdsterraNativeBannerSitewide(
  provider: DbAdProvider,
): boolean {
  return (provider.settings ?? {}).native_banner_sitewide === true;
}

export function getAdsterraNativeBannerScript(
  provider: DbAdProvider,
): "native" | "invoke" {
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const raw = creds.native_banner_key;
  return typeof raw === "string" && raw.includes("invoke.js")
    ? "invoke"
    : "native";
}

/**
 * Serve host for the Native Banner zone specifically. Adsterra binds each
 * zone to the host in its dashboard snippet (the Native Banner snippet
 * points at e.g. plNNNN.profitableratecpmnetwork.com while the banner
 * zone serves from www.highrevenueformat.com). Requesting the zone from a
 * different Adsterra host no-fills, so the pasted snippet's host wins when
 * it is an allowlisted Adsterra serve host; otherwise fall back to the
 * global serve_domain credential (validated), then the default host.
 */
export function getAdsterraNativeBannerServeDomain(
  provider: DbAdProvider,
): string {
  const creds = (provider.credentials ?? {}) as Record<string, unknown>;
  const raw =
    typeof creds.native_banner_key === "string" ? creds.native_banner_key : "";
  const m = raw.match(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})\//i);
  if (m) {
    const host = m[1].toLowerCase();
    const allowed = ADSTERRA_SERVE_HOSTS.some(
      (a) => host === a || host.endsWith("." + a),
    );
    if (allowed) return host;
  }
  return normalizeAdsterraServeDomain(creds.serve_domain);
}
