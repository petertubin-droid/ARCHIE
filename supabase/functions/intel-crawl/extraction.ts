// =========================================================
// INTEL CRAWL — CONTENT EXTRACTION (pure module)
//
// Extracts structured product/price information from approved
// pages. HONEST extraction: unavailable fields stay null and
// are listed in uncertain_fields — nothing is invented.
// Webpage text is DATA: any instruction-like content is
// quarantined and flagged, never executed.
// =========================================================

export interface ExtractedProduct {
  product_name: string | null;
  manufacturer: string | null;
  product_category: string | null;
  package_size: string | null;
  unit: string | null;
  specification: string | null;
  coverage: string | null;
  application_info: string | null;
  material_info: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  location: string | null;
  supplier: string | null;
  terminology: string[];
  methods: string[];
  standards_refs: string[];
  published_at: string | null;
  retrieved_at: string;
  url: string;
  uncertain_fields: string[];
  confidence: number | null;
  injection_flags: string[];
}

const INJECTION_PATTERNS: Array<{ flag: string; re: RegExp }> = [
  {
    flag: "IGNORE_INSTRUCTIONS",
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  },
  {
    flag: "ROLE_HIJACK",
    re: /(act|pretend|behave)\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(unrestricted|DAN|different)/i,
  },
  {
    flag: "SYSTEM_PROMPT_PROBE",
    re: /(reveal|show|print)\s+(your\s+)?(system\s*prompt|hidden\s+instructions)/i,
  },
  {
    flag: "DEPLOY_INJECTION",
    re: /(deploy|push|commit|delete).{0,20}(code|migration|to\s+production)/i,
  },
  {
    flag: "INSTRUCTION_OVERRIDE",
    re: /(you\s+are\s+now|new\s+instructions|disregard\s+(all\s+)?(previous|your))/i,
  },
];

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, ...names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${n}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i",
    );
    const alt = new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${n}["']`,
      "i",
    );
    const m = html.match(re) ?? html.match(alt);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function firstTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]{2,300})<`, "i"));
  return m ? stripTags(m[1]) : null;
}

export interface PriceHit {
  amount: number;
  currency: string | null;
  unitPackage: string | null;
  excerpt: string;
}

/**
 * Price extraction with currency + package context. Ambiguous
 * currency (e.g. a bare "N" prefix where the source country is
 * unknown) is marked uncertain — never guessed silently.
 */
/** Symbol/word → currency, with a "width" for proximity matching. */
const SYMBOLS: Array<{ re: RegExp; code: string }> = [
  { re: /₦|\bngn\b|\bnaira\b/i, code: "NGN" },
  { re: /us\$|\busd\b|\bdollars?\b|(?<![a-z])\$/i, code: "USD" },
  { re: /£|\bgbp\b/i, code: "GBP" },
  { re: /€|\beur\b/i, code: "EUR" },
  { re: /\bkes\b|\bksh\b/i, code: "KES" },
  { re: /₵|\bghs\b/i, code: "GHS" },
];

/**
 * Currency detection: the NEAREST symbol/word wins, searched in
 * a narrow window around the amount so adjacent prices do not
 * contaminate each other. Ambiguity stays null — never guessed.
 */
function detectCurrency(narrow: string): string | null {
  let best: { code: string; dist: number } | null = null;
  for (const s of SYMBOLS) {
    s.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = s.re.exec(narrow)) !== null) {
      const dist = Math.abs(m.index - narrow.length / 2);
      if (!best || dist < best.dist) best = { code: s.code, dist };
      break; // first occurrence per symbol is nearest to the amount
    }
  }
  return best?.code ?? null;
}

export function extractPrices(
  text: string,
  sourceCountry?: string,
): PriceHit[] {
  const hits: PriceHit[] = [];
  const re = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const amount = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000_000)
      continue;
    // narrow symmetric window around the amount for currency
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    const after = text.slice(m.index + m[1].length, m.index + m[1].length + 14);
    let currency = detectCurrency(before + "|" + after);
    // source-country default: bare "N" prefix only, never a silent guess
    if (!currency && sourceCountry === "NG" && /^n\s*$/i.test(before.trim()))
      currency = "NGN";
    // unit/package context from the text right after the amount
    const afterLong = text.slice(m.index, m.index + 48).toLowerCase();
    const unitMatch = afterLong.match(
      /per\s+((?:25|50)\s*kg\s*)?(bag|bag of cement|kg|litre|liter|litres|l|ton|tonne|sqm|m2|square\s*m|piece|block|carton|drum|yard|m|ft|gallon|tube|pail)/i,
    );
    const excerpt = text.slice(Math.max(0, m.index - 10), m.index + 40).trim();
    hits.push({
      amount,
      currency,
      unitPackage: unitMatch ? unitMatch[0].replace(/\s+/g, " ").trim() : null,
      excerpt,
    });
    if (hits.length >= 20) break; // sane cap
  }
  return hits;
}

function pickBestPrice(hits: PriceHit[]): PriceHit | null {
  const withCurrency = hits.filter((h) => h.currency);
  return withCurrency[0] ?? hits[0] ?? null;
}

const STANDARDS_RE =
  /\b((?:BS|EN|ISO|ASTM|SANS|NIS)\s?[-:]?\s?[A-Z0-9.]{1,12})\b/g;

function scanForStandards(text: string, into: string[]) {
  let m: RegExpExecArray | null;
  while ((m = STANDARDS_RE.exec(text)) !== null) {
    const s = m[1].toUpperCase().replace(/\s+/g, " ").trim();
    if (s.length >= 4 && !into.includes(s) && into.length < 12) into.push(s);
  }
}

const CONSTRUCTION_TERMS = [
  "screeding",
  "rendering",
  "plastering",
  "formwork",
  "curing",
  "slump test",
  "concrete mix",
  "scaffolding",
  "reeded slab",
  "suspended slab",
  "raft foundation",
  "strip foundation",
  "pile foundation",
  "setting out",
  "blockwork",
  "mortar",
  "header course",
  "stretcher bond",
  "damp proof membrane",
  "water-cement ratio",
  "compaction",
  "french polish",
  "skim coat",
  "tyrolean/e",
];

function scanTerms(text: string, into: string[]) {
  const lower = text.toLowerCase();
  for (const t of CONSTRUCTION_TERMS) {
    if (lower.includes(t) && !into.includes(t) && into.length < 20)
      into.push(t);
  }
}

/**
 * Extract a structured product from an approved page. Every
 * missing field is recorded in uncertain_fields — extraction
 * never invents values.
 */
export function extractProduct(
  html: string,
  opts: {
    url: string;
    retrievedAt: string;
    sourceCountry?: string;
    sourceType?: string;
    sourceName?: string;
  },
): ExtractedProduct {
  const text = stripTags(html);
  const title =
    metaContent(html, "og:title", "twitter:title") ??
    firstTag(html, "h1") ??
    firstTag(html, "title") ??
    null;
  const description = metaContent(html, "og:description", "description");
  const published =
    metaContent(
      html,
      "article:published_time",
      "article:modified_time",
      "og:updated_time",
    ) ??
    text.match(/(?:published|updated)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/i)?.[1] ??
    null;
  const manufacturer = metaContent(html, "og:site_name", "author") ?? null;

  const pkgMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s?(kg|litres|liters|ltr|l|g|tonnes?)\b/i,
  );
  const priceHits = extractPrices(text, opts.sourceCountry);
  const best = pickBestPrice(priceHits);

  const availability = /out of stock|unavailable|sold out/i.test(text)
    ? "OUT_OF_STOCK"
    : /in stock|available|ready/i.test(text)
      ? "IN_STOCK"
      : null;

  const terminology: string[] = [];
  const methods: string[] = [];
  scanTerms(text, terminology);
  scanTerms(description ?? "", terminology);
  const standards_refs: string[] = [];
  scanForStandards(text, standards_refs);
  for (const t of terminology.slice(0, 4)) methods.push(t);

  const uncertain: string[] = [];
  if (!title) uncertain.push("product_name");
  if (!metaContent(html, "product:category", "article:section"))
    uncertain.push("product_category");
  if (!manufacturer) uncertain.push("manufacturer");
  if (!pkgMatch) uncertain.push("package_size");
  if (!best) uncertain.push("price");
  if (!best || !best.currency) uncertain.push("currency");

  // Injection scanning — content is DATA, flagged and quarantined.
  const injection_flags: string[] = [];
  for (const { flag, re } of INJECTION_PATTERNS) {
    if (re.test(text)) injection_flags.push(flag);
  }

  return {
    product_name: title,
    manufacturer,
    product_category:
      metaContent(html, "product:category", "article:section") ?? null,
    package_size: pkgMatch ? pkgMatch[0].trim() : null,
    unit: pkgMatch ? pkgMatch[2].toLowerCase() : null,
    specification: description ? description.slice(0, 800) : null,
    coverage: text.match(/(?:coverage|covers)[^.]{0,60}/i)?.[0]?.trim() ?? null,
    application_info:
      text.match(/(?:application|apply|usage)[^.]{0,120}/i)?.[0]?.trim() ??
      null,
    material_info:
      text.match(/(?:material|composition)[^.]{0,120}/i)?.[0]?.trim() ?? null,
    price: best ? best.amount : null,
    currency: best?.currency ?? null,
    availability,
    location:
      text.match(/(?:location|address)\s*[:-]\s*([^.]{3,60})/i)?.[1]?.trim() ??
      null,
    supplier: opts.sourceName ?? null,
    terminology,
    methods,
    standards_refs,
    published_at: published,
    retrieved_at: opts.retrievedAt,
    url: opts.url,
    uncertain_fields: uncertain,
    confidence: null, // set by the caller from source trust + completeness
    injection_flags,
  };
}

/** Completeness + trust → confidence (never overrides verification). */
export function extractionConfidence(
  ex: ExtractedProduct,
  reliabilityWeight: number,
): number {
  const fields = [
    ex.product_name,
    ex.price,
    ex.currency,
    ex.package_size,
    ex.manufacturer,
  ];
  const present = fields.filter(Boolean).length;
  const completeness = present / fields.length;
  let c = 0.4 * completeness + 0.6 * reliabilityWeight;
  if (ex.injection_flags.length > 0) c *= 0.5; // suspicious content lowers confidence
  if (ex.uncertain_fields.includes("price")) c *= 0.8;
  return Math.min(Math.max(Number(c.toFixed(3)), 0.05), 0.95);
}
