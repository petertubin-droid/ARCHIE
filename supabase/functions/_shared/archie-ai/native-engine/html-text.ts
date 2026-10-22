// BATCH 48 Defect 8 (live-verified 2026-10-22): research
// snippets and titles arrived in chat with raw HTML
// entities ("r&#233;aumur") because the adapters strip TAGS
// but never decode entities. Shared decoder for all snippet
// extraction paths. Runs in the edge runtime (no DOM), so
// this is a deterministic table + codepoint decoder, not
// innerHTML parsing.
// ---------------------------------------------------------

/** Common named entities. Anything not in this table is
 *  left untouched (honest pass-through, never a guess). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "\u00e9",
  egrave: "\u00e8",
  ecirc: "\u00ea",
  agrave: "\u00e0",
  acirc: "\u00e2",
  ccedil: "\u00e7",
  uuml: "\u00fc",
  ugrave: "\u00f9",
  ouml: "\u00f6",
  oacute: "\u00f3",
  auml: "\u00e4",
  ntilde: "\u00f1",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  deg: "\u00b0",
  pound: "\u00a3",
  euro: "\u20ac",
  middot: "\u00b7",
  bull: "\u2022",
  dagger: "\u2020",
  sect: "\u00a7",
  para: "\u00b6",
};

function safeCodePoint(cp: number): string {
  // Invalid, out-of-range or surrogate-half code points are
  // dropped rather than crashing the reply.
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  if (cp >= 0xd800 && cp <= 0xdfff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Decode numeric and known named HTML entities. Unknown
 *  entities pass through unchanged. */
export function decodeHtmlEntities(text: string): string {
  if (!text || text.indexOf("&") === -1) return text;
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) =>
      safeCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_m, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? m,
    );
}
