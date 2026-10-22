// =========================================================
// QUERY TERM EXTRACTION (batch 44).
// Web search engines rank keyword queries well and
// natural-language questions badly. Live-verified
// 2026-10-21: MediaWiki CirrusSearch returns "Straight
// razor" and "Filipino cuisine" for "what is a good
// whetstone for kitchen knives", but on-topic cutlery
// articles for "whetstone kitchen knives". The research
// pipeline hands raw user questions to adapters; this
// module extracts the CONTENT WORDS of a question so
// keyword-oriented endpoints get keyword-shaped queries,
// and provides the topical overlap check that keeps
// drifted search results out of candidate knowledge.
// =========================================================

/** Interrogative lead-ins that carry no topical content. */
const LEADINS: RegExp[] = [
  /^(?:please\s+)?(?:can|could|will|would|do|does|did)\s+you\s+(?:please\s+)?(?:tell|give|show|find|teach)\s+(?:me\s+)?/i,
  /^(?:please\s+)?(?:can|could|will|would|do|does|did)\s+(?:you\s+)?/i,
  /^i\s+(?:want|need|would\s+like)\s+to\s+(?:know|learn|find\s+out)\s+/i,
  /^what(?:'s|s\s+is|\s+is|\s+are|\s+was|\s+were)?\s+/i,
  /^whats\s+/i,
  /^which(?:\s+(?:one|is))?\s+/i,
  /^who(?:'s|\s+is|\s+are|\s+was)?\s+/i,
  /^where(?:'s|\s+is|\s+are|\s+was)?\s+/i,
  /^when(?:'s|\s+is|\s+did)?\s+/i,
  /^why\s+(?:is\s+)?(?:it\s+)?(?:that\s+)?/i,
  /^how\s+(?:do|does|did|can|could|would|should|to)\s+(?:i|you|we|one)?\s*/i,
  /^how\s+/i,
  /^(?:tell|show|give)\s+(?:me\s+)?(?:about\s+|the\s+)?/i,
  /^(?:define|explain|describe|research|search\s+for|look\s+up|find\s+out)\s+/i,
];

/** Words that never discriminate a topic by themselves. */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "am", "do", "does", "did", "doing", "done", "have", "has", "had",
  "will", "would", "shall", "should", "can", "could", "may", "might",
  "must", "of", "for", "to", "in", "on", "at", "by", "with", "from",
  "as", "and", "or", "but", "not", "no", "nor", "so", "than", "then",
  "too", "very", "just", "about", "into", "over", "under", "up",
  "down", "out", "off", "again", "there", "here", "it", "its", "this",
  "that", "these", "those", "i", "you", "he", "she", "we", "they",
  "me", "him", "her", "us", "them", "my", "your", "our", "their",
  "what", "which", "who", "whom", "whose", "when", "where", "why",
  "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "own", "same", "s", "t", "re", "ve", "ll", "d", "m",
  "good", "best", "better", "top", "nice", "recommend", "please",
  "tell", "know", "want", "need",
]);

/** Crude singular normalizer for overlap matching only. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ves")) return w.slice(0, -3) + "fe";
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (
    w.length > 4 &&
    (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") ||
      w.endsWith("ches") || w.endsWith("shes"))
  ) {
    return w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Match normalization: singular plus trailing silent-e
 * stripped, so "knife"/"knives", "cuisine"/"cuisines" and
 * "stone"/"stones" all collide regardless of which form the
 * question and the result text each use.
 */
function matchStem(w: string): string {
  const s = singular(w);
  if (s.length > 4 && s.endsWith("e")) return s.slice(0, -1);
  return s;
}

/**
 * Content words of a user question: lowercased alphanumeric
 * tokens with interrogative lead-ins and stopwords removed,
 * singular-normalized, deduplicated, order preserved.
 * Returns [] when nothing topical survives (caller falls
 * back to the raw query).
 */
export function contentWordsOf(query: string): string[] {
  let q = query.trim();
  let changed = true;
  // Lead-ins can stack ("what is a good" after "can you tell me").
  while (changed) {
    changed = false;
    for (const re of LEADINS) {
      const next = q.replace(re, "");
      if (next !== q) {
        q = next;
        changed = true;
      }
    }
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of q.toLowerCase().split(/[^a-z0-9+]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    const s = singular(raw);
    if (!seen.has(s)) {
      seen.add(s);
      words.push(s);
    }
  }
  return words;
}

/**
 * Topical overlap: true when at least one content word
 * appears in the candidate text (title + snippet), matched
 * on the same singular normalization. A search result that
 * shares zero content words with the question is a ranking
 * artifact, not an answer, and must not enter candidate
 * knowledge.
 */
export function topicallyMatches(text: string, words: string[]): boolean {
  if (words.length === 0) return true;
  const tokens = new Set(
    text.toLowerCase().split(/[^a-z0-9+]+/).map(matchStem),
  );
  for (const w of words) if (tokens.has(matchStem(w))) return true;
  return false;
}

/**
 * BATCH 44: time-sensitive query detection. Live-verified
 * 2026-10-21: "current palm oil price in Nigeria" was
 * classified general-knowledge and answered with
 * encyclopedic history pages — the user asked for a live
 * figure. When no live source class exists in the registry,
 * the least dishonest answer is to say so: the research
 * reply must flag that reference archives cannot confirm
 * current values. Signals are deliberately phrase-tight so
 * physics "electric current" or "rate of reaction" do not
 * trip it.
 */
const TIME_SENSITIVE_TOKENS = new Set([
  "price", "prices", "priced", "pricing",
  "forecast", "forecasts", "forecasted",
  "weather", "today", "tonight",
  "latest", "news",
  "quote", "quotes", "quoted",
]);

const TIME_SENSITIVE_PHRASES: RegExp[] = [
  /current\s+(?:value|price|prices|rate|rates|level|status|exchange|figure|figures|market)/i,
  /exchange\s+rate/i,
  /interest\s+rate/i,
  /stock\s+price/i,
  /how\s+much\s+(?:is|are|does|do|was|were)/i,
  /right\s+now|at\s+the\s+moment|these\s+days/i,
];

export function isTimeSensitiveQuery(query: string): boolean {
  const q = query.toLowerCase();
  for (const token of q.split(/[^a-z0-9+]+/)) {
    if (TIME_SENSITIVE_TOKENS.has(token)) return true;
  }
  for (const re of TIME_SENSITIVE_PHRASES) {
    if (re.test(q)) return true;
  }
  return false;
}
