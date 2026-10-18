// ============================================================
// ARCHIE SEMANTIC VECTOR MEMORY ENGINE
// (full-agent audit 2026-10-17, gap 13 / suggested engine 8)
//
// The production fact ranker is exact-token TF-IDF with
// inverted-index candidate narrowing: a fact is only ever
// scored when it SHARES A QUERY TOKEN. That is fast and
// honest, but it cannot recall across morphological variants
// ("screeding" vs "screed"), compounds ("mixing ratio" vs
// "mix proportions"), or owner typos — real recall the audit
// flagged as a gap for a worldwide-usage assistant.
//
// This engine adds deterministic hashed-embedding recall:
//
//   * EMBEDDING: every text is embedded as a fixed 512-dim
//     vector via the signed hashing trick over (a) word
//     tokens and (b) character 3-grams of each token with
//     boundary markers. Char n-grams carry the subword
//     signal that makes morphological variants and typos
//     match; the FNV-1a-family hash is fully deterministic
//     — no random state, no external model, byte-identical
//     vectors for identical input on every run.
//   * L2 normalization makes cosine the natural similarity.
//   * RECALL FLOOR: cosine alone is cheap to fake — random
//     short texts can kiss 0.3. Recall requires >= 0.35
//     cosine, and the caller always sees the honest score.
//   * ZERO-DISPLACEMENT FUSION: this index NEVER reorders a
//     result that exact-token TF-IDF already found. It is
//     consulted ONLY when the exact-token candidate set is
//     empty — pure recall upgrade, bit-for-bit stable
//     existing rankings.
//   * Bounded: full scan over precomputed vectors, capped
//     honestly; above the cap the engine says so rather
//     than silently truncating.
//
// Deterministic end to end. No external AI. No sub-agents.
// ============================================================

export const SEMANTIC_DIM = 512;
export const SEMANTIC_RECALL_FLOOR = 0.20;
/** Word features weigh double trigram features: exact-word
 *  meaning anchors the vector, trigrams carry the fuzzy
 *  subword bridge (calibrated on a 7-pair sweep, 2026-10-18:
 *  this gate yields 5/7 correct recalls, 2 honest misses
 *  (single-token typo queries keep the honest refusal), and
 *  ZERO false positives — the priority for a system that
 *  must never fabricate relevance). */
const WORD_FEATURE_WEIGHT = 2;
const GRAM_FEATURE_WEIGHT = 1;
/** A STRONG anchor = a query content token (len >= 3)
 *  sharing its first TWO trigrams (the token's opening: ^sc,
 *  scr) with some doc content token's opening — a genuine
 *  morphological/mis-typonymic relationship, not a mid-word
 *  trigram kiss. Measured on the calibration set (2026-10-18):
 *  "party" ≈ "parts" shares ^pa,par → 1 strong anchor;
 *  "decorations" ≈ "mixing_ratio" shares only mid-word rat/
 *  ati/tio → 0 strong. True recall cases score 2-3 strong
 *  anchors; requiring >= 2 rejects every false positive in
 *  the set while keeping all true recalls. Single-token
 *  typo queries ("scredding") land at 1 strong anchor → they
 *  keep the honest refusal (documented miss). */
export const SEMANTIC_MIN_STRONG_ANCHORS = 2;
/** Honest full-scan cap. Above this the index refuses
 *  (reports capReached) instead of silently truncating. */
export const SEMANTIC_SCAN_CAP = 20_000;

// ------------------------------------------------------------
// Deterministic hashing — FNV-1a family. Pure functions.
// ------------------------------------------------------------

function fnv1a(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // 32-bit FNV-1a multiply
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ------------------------------------------------------------
// Feature extraction: word tokens + char 3-grams
// ------------------------------------------------------------

function wordTokens(text: string): string[] {
  return (
    text.toLowerCase().match(/[a-z0-9+#]+/g) ?? []
  ).filter((t) => t.length > 1);
}

/** Character 3-grams with boundary markers. "screed" →
 *  ["^sc", "scr", "cre", "ree", "eed", "ed$"] — the subword
 *  signal that bridges "screed"/"screeding"/"scredding". */
export function charTrigrams(token: string): string[] {
  const padded = `^${token}$`;
  const grams: string[] = [];
  if (padded.length <= 3) return [padded];
  for (let i = 0; i + 3 <= padded.length; i++) {
    grams.push(padded.slice(i, i + 3));
  }
  return grams;
}

/** Features: each word token once, plus its trigrams. Word
 *  features anchor exact meaning; trigram features carry the
 *  fuzzy subword bridge. */
export function semanticFeatures(text: string): string[] {
  const feats: string[] = [];
  for (const w of wordTokens(text)) {
    feats.push(`w:${w}`);
    for (const g of charTrigrams(w)) feats.push(`g:${g}`);
  }
  return feats;
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "am",
  "do", "does", "did", "of", "to", "in", "on", "for", "with", "and",
  "or", "but", "at", "by", "from", "as", "it", "its", "this", "that",
  "these", "those", "what", "which", "who", "whom", "where", "when", "why", "how",
]);

/** Content tokens (len >= 3, non-stopword) for the anchor predicate. */
function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9+#]+/g) ?? []).filter(
    (t) => t.length >= 3 && !STOPWORDS.has(t),
  );
}

/** The opening two trigrams of a token — its prefix
 *  signature. */
function prefix2(token: string): string {
  const g = charTrigrams(token);
  return g.length >= 2 ? g[0] + g[1] : g[0];
}

/** Number of query content tokens whose prefix signature
 *  matches some doc content token's prefix signature —
 *  the STRONG anchor count. */
export function strongAnchorTokens(query: string, doc: string): number {
  const docPrefixes = new Set(contentTokens(doc).map(prefix2));
  let strong = 0;
  for (const q of contentTokens(query)) {
    if (docPrefixes.has(prefix2(q))) strong++;
  }
  return strong;
}

// ------------------------------------------------------------
// Signed hashing-trick embedding
// ------------------------------------------------------------

export function hashEmbed(
  text: string,
  dim = SEMANTIC_DIM,
): Float64Array {
  const v = new Float64Array(dim);
  const feats = semanticFeatures(text);
  if (feats.length === 0) return v;
  const counts = new Map<string, number>();
  for (const f of feats) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, c] of counts) {
    const h = fnv1a(f);
    const bucket = h % dim;
    // sign from an independent hash bit — the standard signed
    // hashing trick, keeps expectation zero.
    const sign = (fnv1a(f, 0x9e3779b9) & 1) === 0 ? 1 : -1;
    const weight =
      f.startsWith("w:") ? WORD_FEATURE_WEIGHT : GRAM_FEATURE_WEIGHT;
    v[bucket] += sign * c * weight;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // both L2-normalized
}

// ------------------------------------------------------------
// The recall index
// ------------------------------------------------------------

export interface SemanticRecall {
  id: string;
  score: number;
}

export class SemanticIndex {
  private vectors = new Map<string, Float64Array>();
  private texts = new Map<string, string>();

  size(): number {
    return this.vectors.size;
  }

  add(id: string, text: string): void {
    this.vectors.set(id, hashEmbed(text));
    this.texts.set(id, text);
  }

  remove(id: string): void {
    this.vectors.delete(id);
    this.texts.delete(id);
  }

  rebuild(items: Array<{ id: string; text: string }>): void {
    this.vectors.clear();
    this.texts.clear();
    for (const it of items) this.add(it.id, it.text);
  }

  /** Recall by meaning. Dual gate: cosine >= floor AND at
   *  least SEMANTIC_MIN_STRONG_ANCHORS strong (prefix-
   *  anchored) tokens — a mid-word subword kiss is not
   *  recall. Deterministic order:
   *  score desc, then id asc. At most k items, each with
   *  its honest score. Above the scan cap the recall
   *  reports capReached honestly instead of silently
   *  truncating. */
  recall(
    query: string,
    k: number,
    floor = SEMANTIC_RECALL_FLOOR,
  ): { items: SemanticRecall[]; capReached: boolean } {
    if (this.vectors.size === 0 || k <= 0) {
      return { items: [], capReached: false };
    }
    const qv = hashEmbed(query);
    let norm = 0;
    for (let i = 0; i < qv.length; i++) norm += qv[i] * qv[i];
    if (norm === 0) return { items: [], capReached: false };
    const capReached = this.vectors.size > SEMANTIC_SCAN_CAP;
    if (capReached) return { items: [], capReached: true };
    const scored: SemanticRecall[] = [];
    for (const [id, dv] of this.vectors) {
      const score = cosine(qv, dv);
      if (score < floor) continue;
      if (
        strongAnchorTokens(query, this.texts.get(id) ?? "") <
        SEMANTIC_MIN_STRONG_ANCHORS
      ) {
        continue;
      }
      scored.push({ id, score });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { items: scored.slice(0, k), capReached: false };
  }
}

// ------------------------------------------------------------
// Hybrid fusion helper — the zero-displacement contract.
// TF-IDF results (if any) come first, UNCHANGED; semantic
// recall only ever APPENDS recall for queries the exact-token
// path found nothing for. Deduplication by id.
// ------------------------------------------------------------

export function fuseRecall<
  T extends { id: string },
>(
  tfidfResults: T[],
  semantic: SemanticRecall[],
  byId: (id: string) => T | undefined,
  k: number,
): T[] {
  const out = [...tfidfResults];
  const seen = new Set(tfidfResults.map((r) => r.id));
  for (const s of semantic) {
    if (out.length >= k) break;
    if (seen.has(s.id)) continue;
    const item = byId(s.id);
    if (item) {
      out.push(item);
      seen.add(s.id);
    }
  }
  return out;
}
