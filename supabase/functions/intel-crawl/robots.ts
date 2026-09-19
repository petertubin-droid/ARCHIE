// =========================================================
// INTEL CRAWL — ROBOTS.TXT PARSER (pure module)
//
// FRELUX always respects robots.txt and access restrictions.
// Never bypasses CAPTCHAs, auth, paywalls or anti-bot systems.
// =========================================================

export interface RobotsRules {
  // user-agent (lowercased, "*" default) → { allow: [], disallow: [] }
  agents: Record<string, { allow: string[]; disallow: string[] }>;
  crawlDelay?: number;
}

const USER_AGENT = "FRELUX-Crawler";

/** Parse robots.txt content (tolerant of malformed files). */
export function parseRobots(raw: string): RobotsRules {
  const rules: RobotsRules = { agents: {} };
  let current: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim();
    if (!clean) continue;
    const idx = clean.indexOf(":");
    if (idx < 0) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();
    if (field === "user-agent") {
      current = value.toLowerCase();
      if (!rules.agents[current])
        rules.agents[current] = { allow: [], disallow: [] };
    } else if (field === "crawl-delay") {
      const d = Number(value);
      if (Number.isFinite(d)) rules.crawlDelay = d;
    } else if ((field === "disallow" || field === "allow") && current) {
      rules.agents[current][field].push(value);
    }
  }
  return rules;
}

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  let pat = pattern;
  let anchorEnd = false;
  if (pat.endsWith("$")) {
    anchorEnd = true;
    pat = pat.slice(0, -1);
  }
  const p = pat.replace(/\*/g, "__W__").split("__W__");
  let idx = 0;
  for (let i = 0; i < p.length; i++) {
    if (i === 0) {
      if (!path.startsWith(p[0])) return false;
      idx = p[0].length;
    } else {
      const found = path.indexOf(p[i], idx);
      if (found < 0) return false;
      idx = found + p[i].length;
    }
  }
  if (anchorEnd && idx !== path.length) return false;
  return true;
}

function longestMatch(rules: string[], path: string): number {
  let best = -1;
  for (const r of rules)
    if (pathMatches(r, path)) best = Math.max(best, r.length);
  return best;
}

/** Is the FRELUX crawler allowed on this path? Longest-match wins. */
export function isAllowedByRobots(
  robots: RobotsRules | null,
  path: string,
  userAgent = USER_AGENT,
): boolean {
  if (!robots) return true; // no robots.txt → allowed (404)
  const specific = robots.agents[userAgent.toLowerCase()];
  const generic = robots.agents["*"];
  for (const agent of [specific, generic]) {
    if (!agent) continue;
    const dis = longestMatch(agent.disallow, path);
    const all = longestMatch(agent.allow, path);
    if (dis > all) return false;
    if (dis >= 0 && all >= 0 && all >= dis) return true;
  }
  return true;
}

export const CRAWLER_USER_AGENT = `${USER_AGENT}/1.0 (controlled crawl; contact: FRELUX admin)`;

/** Politeness: minimum seconds between requests to the same host. */
export function politenessDelaySeconds(robots: RobotsRules | null): number {
  const base = robots?.crawlDelay ?? 1;
  return Math.min(Math.max(base, 1), 30);
}
