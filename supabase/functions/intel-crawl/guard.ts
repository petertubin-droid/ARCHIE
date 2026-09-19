// =========================================================
// INTEL CRAWL — URL / SSRF / DOMAIN GUARDS (pure module)
//
// Shared by the edge function and the automated tests.
// Blocks localhost, private, internal and metadata addresses;
// restricts crawling to the registered origin + allowed paths.
// =========================================================

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_V4.some((re) => re.test(ip));
}

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return (
    v === "::" ||
    v === "::1" ||
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    v.startsWith("fe80") ||
    v.startsWith("::ffff:127.") ||
    v.startsWith("::ffff:10.") ||
    v.startsWith("::ffff:192.168.") ||
    v.startsWith("::ffff:172.")
  );
}

/** Is this resolved IP address off-limits? (SSRF prevention) */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/** Hostnames that must never be fetched regardless of DNS. */
export function isForbiddenHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "0.0.0.0" ||
    h.endsWith(".svc") ||
    h === "metadata.google.internal" ||
    /^[0-9.]+$/.test(h) || // raw IPv4 — also blocked below
    h.includes("[")
  );
}

export interface UrlCheck {
  ok: boolean;
  error?: string;
  host?: string;
  origin?: string;
  path?: string;
}

/** Validate a source base URL. Only public http(s) origins. */
export function validateSourceUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are allowed." };
  }
  if (u.username || u.password) {
    return { ok: false, error: "Credentials in URLs are not allowed." };
  }
  if (isForbiddenHost(u.hostname)) {
    return { ok: false, error: "Localhost/internal hosts are not allowed." };
  }
  return { ok: true, host: u.hostname, origin: u.origin, path: u.pathname };
}

/** Is a target URL inside the registered origin and allowed paths? */
export function isUrlAllowed(
  url: string,
  origin: string,
  allowedPaths: string[],
): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false; // strict same-origin only
  if (isForbiddenHost(u.hostname)) return false;
  const paths = allowedPaths.length > 0 ? allowedPaths : ["/"];
  return paths.some((p) => {
    const base = p === "/" ? "/" : p.replace(/\/+$/, "");
    return (
      u.pathname === base ||
      u.pathname.startsWith(base === "/" ? "/" : `${base}/`)
    );
  });
}

/** Redirects are safe only when the chain stays on the same origin. */
export function isRedirectSafe(fromOrigin: string, toUrl: string): boolean {
  try {
    return new URL(toUrl).origin === fromOrigin;
  } catch {
    return false;
  }
}

/** Extract same-origin, allowed links from HTML (depth-limited). */
export function extractLinks(
  html: string,
  origin: string,
  allowedPaths: string[],
  seen: Set<string>,
): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], origin + "/").toString();
      if (!seen.has(abs) && isUrlAllowed(abs, origin, allowedPaths)) {
        seen.add(abs);
        out.push(abs);
      }
    } catch {
      /* skip malformed hrefs */
    }
  }
  return out;
}

/** FNV-1a content hash (same family as the learning engine). */
export function hashContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a_${h.toString(16)}_${input.length}`;
}

// ---------------------------------------------------------
// Crawl planning (pure — same functions the edge function uses)
// ---------------------------------------------------------

/** Can this source be crawled in this mode? Disabled sources are
 *  never crawled; TEST mode only needs a registered source. */
export function shouldCrawlSource(
  source: { enabled: boolean },
  mode: "CRAWL" | "TEST",
): boolean {
  if (mode === "TEST") return true;
  return source.enabled === true;
}

/** Build the initial target list from allowed paths, deduped and
 *  capped at maxPages. Only same-origin allowed paths qualify. */
export function buildCrawlTargets(
  origin: string,
  allowedPaths: string[],
  maxPages: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of (allowedPaths.length > 0 ? allowedPaths : ["/"]).slice(
    0,
    maxPages,
  )) {
    let u: URL;
    try {
      u = new URL(p, origin + "/");
    } catch {
      continue;
    }
    const abs = u.toString();
    if (!seen.has(abs) && isUrlAllowed(abs, origin, allowedPaths)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out.slice(0, maxPages);
}

/** Next-crawl scheduling for a frequency (ms from now). MANUAL → 0 (no auto re-crawl). */
export function nextCrawlMs(freq: string): number {
  switch (freq) {
    case "HOURLY":
      return 3_600_000;
    case "DAILY":
      return 86_400_000;
    case "WEEKLY":
      return 7 * 86_400_000;
    case "MONTHLY":
      return 30 * 86_400_000;
    default:
      return 0;
  }
}
