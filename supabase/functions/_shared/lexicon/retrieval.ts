// =========================================================
// ARCHIE UNIVERSAL LEXICON ENGINE — RETRIEVAL LAYER
//
// Deterministic, testable lexical retrieval between ARCHIE's
// language pathway and the lexicon tables:
//
//   word lookup · all senses · contextual sense selection ·
//   synonyms (synset members) · antonyms · related words ·
//   word forms · domain-specific senses · phrases ·
//   pronunciation · provenance · status/confidence
//
// Principles (spec §15): never fabricate — when context has
// no direct lexical evidence the result is AMBIGUOUS with
// ranked candidates, never invented certainty. Only VERIFIED
// (or explicitly requested) statuses are returned to ARCHIE.
//
// This module is pure TypeScript with zero runtime imports
// so it runs identically in the Deno edge runtime and vitest.
// =========================================================

// ---------- types ----------

export interface LexiconWordRow {
  id: string;
  canonical: string;
  normalized: string;
  spelling_variants: string[] | string;
  language: string;
  regional_usage: string | null;
  pronunciation: string | null;
  part_of_speech: string;
  unit_type: string;
  inflection_metadata: Record<string, unknown> | string;
  frequency: number | null;
}

export interface LexiconSenseRow {
  id: string;
  word_id: string;
  source_id: string | null;
  external_id: string;
  synset_key: string;
  definition: string;
  usage_examples: string[] | string;
  domain: string | null;
  register: string | null;
  region: string | null;
  grammatical: Record<string, unknown> | string;
  confidence: number | null;
  knowledge_status: string;
  version: number;
}

export interface LexiconSourceRow {
  id: string;
  name: string;
  dataset: string;
  version: string;
  license: string;
  attribution: string;
  url: string | null;
}

export interface LookupOptions {
  /** Only VERIFIED knowledge is authoritative by default;
   *  statuses can be widened explicitly, never silently. */
  statuses?: string[];
  language?: string;
  partOfSpeech?: string;
  limit?: number;
}

/** Structural client (supabase-js subset) — satisfied by the
 *  archie-core service client and the test harness fake. */
/* The chainable supabase query builder shape is intentionally
 * loose — the concrete service client and the test fake both
 * satisfy it. */
/* eslint-disable @typescript-eslint/no-explicit-any -- builder shape */
export interface LexiconClient {
  from: (table: string) => any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- text processing (deterministic) ----------

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "of",
  "at",
  "by",
  "for",
  "with",
  "about",
  "into",
  "to",
  "from",
  "in",
  "on",
  "out",
  "over",
  "under",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "not",
  "no",
  "yes",
  "so",
  "as",
  "than",
  "then",
  "too",
  "very",
  "just",
  "also",
  "up",
  "down",
  "all",
  "any",
  "some",
  "such",
  "own",
  "same",
  "other",
]);

/** The CURRENT knowledge-edition label from lexicon_sources
 *  (the source of truth — never hardcoded, so edition
 *  upgrades ride along automatically). One bounded query on
 *  a tiny table; honest fallback on failure. */
export async function latestSourceLabel(svc: LexiconClient): Promise<string> {
  try {
    const { data } = await svc
      .from("lexicon_sources")
      .select("dataset,version")
      .limit(10);
    const rows = (data ?? []) as Array<{ dataset?: string; version?: string }>;
    if (!rows.length) return "OEWN (no registered source)";
    const latest = rows.reduce((a, b) =>
      String(b.version ?? "") > String(a.version ?? "") ? b : a,
    );
    return `OEWN ${latest.version ?? "(unknown version)"}`;
  } catch {
    return "OEWN (source lookup failed)";
  }
}

export function lexicalTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Light deterministic stemming (surface-form families):
 *  running/runs/ran → run-ish family. Deliberately simple —
 *  never claims full morphological analysis. */
export function stem(token: string): string {
  let t = token;
  if (t.endsWith("ing") && t.length > 5) {
    t = t.slice(0, -3);
    // running → runn → run (undo doubled final consonant)
    if (/(\w)\1$/.test(t) && t.length > 3 && !/[aeiou]\1$/.test(t))
      t = t.slice(0, -1);
  } else if (t.endsWith("ies") && t.length > 4) t = t.slice(0, -3) + "y";
  else if (t.endsWith("es") && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3)
    t = t.slice(0, -1);
  else if (t.endsWith("ed") && t.length > 4) t = t.slice(0, -2);
  return t;
}

function jsonArr(v: string[] | string | null | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

// ---------- retrieval API ----------

/**
 * Exact/normalized word lookup: returns the word rows and
 * their senses for the requested forms. Bounded, indexed
 * (normalized, language), deterministic order.
 */
export async function lookupWords(
  svc: LexiconClient,
  forms: string[],
  opts: LookupOptions = {},
): Promise<Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }>> {
  const statuses = opts.statuses ?? ["VERIFIED"];
  const language = opts.language ?? "en";
  const normalized = Array.from(
    new Set(forms.map((f) => f.trim().toLowerCase()).filter(Boolean)),
  );
  if (!normalized.length) return [];

  const { data: words } = await svc
    .from("lexicon_words")
    .select(
      "id,canonical,normalized,spelling_variants,language,regional_usage,pronunciation,part_of_speech,unit_type,inflection_metadata,frequency",
    )
    .in("normalized", normalized)
    .eq("language", language)
    .order("part_of_speech")
    .limit(opts.limit ?? 24);
  const wordRows = (words ?? []) as LexiconWordRow[];
  if (!wordRows.length) return [];

  const { data: senses } = await svc
    .from("lexicon_senses")
    .select(
      "id,word_id,source_id,external_id,synset_key,definition,usage_examples,domain,register,region,grammatical,confidence,knowledge_status,version",
    )
    .in(
      "word_id",
      wordRows.map((w) => w.id),
    )
    .in("knowledge_status", statuses)
    .order("external_id")
    .limit(40 * wordRows.length);
  const senseRows = (senses ?? []) as LexiconSenseRow[];

  return wordRows.map((word) => ({
    word,
    senses: senseRows.filter((s) => s.word_id === word.id),
  }));
}

/** One word (all POS). Deterministic, honest when absent. */
export async function lookupWord(
  svc: LexiconClient,
  form: string,
  opts: LookupOptions = {},
): Promise<Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }>> {
  return lookupWords(svc, [form], opts);
}

// ---------- contextual sense selection ----------

export interface SenseCandidate {
  sense: LexiconSenseRow;
  score: number; // direct evidence (definition/example overlap)
  chainScore: number; // weak evidence (lexical chain via context words' senses)
  reason: string;
}

export interface ContextualSelection {
  candidates: SenseCandidate[]; // ranked, deterministic
  selected: SenseCandidate | null; // only with DIRECT evidence
  ambiguous: boolean;
  note: string; // honest explanation
}

/**
 * "word + surrounding context → candidate senses → contextual
 * sense selection" (spec §5). Deterministic Lesk-style:
 *
 *   direct score  — context tokens present in the sense's
 *                   definition (×2) or usage examples (×1),
 *                   matched with light stemming
 *   chain score   — context words' own definitions overlapping
 *                   the candidate's definition (×0.5) — weak
 *                   evidence, used ONLY to rank candidates
 *
 * Selection requires a direct-evidence margin; without it the
 * ambiguity is preserved, never resolved by invention.
 */
export async function selectContextualSenses(
  svc: LexiconClient,
  form: string,
  context: string,
  opts: LookupOptions = {},
): Promise<{ word: LexiconWordRow | null; selection: ContextualSelection }> {
  const entries = await lookupWord(svc, form, opts);
  if (!entries.length) {
    return {
      word: null,
      selection: {
        candidates: [],
        selected: null,
        ambiguous: true,
        note: "not in lexicon",
      },
    };
  }

  const contextTokens = lexicalTokens(context);
  // the word being disambiguated cannot disambiguate itself —
  // its own forms are excluded from the context signal
  const targetForm = form.trim().toLowerCase();
  const targetStems = new Set([targetForm, stem(targetForm)]);
  const contextStems = new Set(
    contextTokens.map(stem).filter((st) => !targetStems.has(st)),
  );

  // weak-evidence vocabulary: definitions of the context's
  // OTHER words (top sense each), for lexical-chain matching
  const chainStems = new Set<string>();
  for (const tok of contextTokens) {
    if (targetStems.has(tok) || targetStems.has(stem(tok))) continue;
    const chain = await lookupWords(svc, [tok, stem(tok)], {
      statuses: opts.statuses,
      language: opts.language,
    });
    for (const e of chain) {
      // head senses carry the word's core field vocabulary
      for (const s of e.senses.slice(0, 3)) {
        for (const t of lexicalTokens(`${s.definition}`)) {
          const st = stem(t);
          if (st.length >= 4 && !contextStems.has(st)) chainStems.add(st);
        }
      }
    }
  }

  const all: SenseCandidate[] = [];
  for (const { senses } of entries) {
    for (const sense of senses) {
      const defTokens = lexicalTokens(sense.definition).map(stem);
      const exTokens = jsonArr(sense.usage_examples).flatMap((ex) =>
        lexicalTokens(ex).map(stem),
      );
      let score = 0;
      const hits: string[] = [];
      for (const st of contextStems) {
        if (defTokens.includes(st)) {
          score += 2;
          hits.push(st);
        } else if (exTokens.includes(st)) {
          score += 1;
          hits.push(st);
        }
      }
      let chainScore = 0;
      for (const st of chainStems) {
        if (defTokens.includes(st)) chainScore += 0.5;
      }
      all.push({
        sense,
        score,
        chainScore,
        reason: hits.length ? `matches: ${hits.join(", ")}` : "",
      });
    }
  }

  // rank: direct evidence first, then chain, then stable id
  all.sort(
    (a, b) =>
      b.score - a.score ||
      b.chainScore - a.chainScore ||
      a.sense.external_id.localeCompare(b.sense.external_id),
  );

  const top = all[0];
  const second = all[1];
  if (!top) {
    return {
      word: entries[0].word,
      selection: {
        candidates: [],
        selected: null,
        ambiguous: true,
        note: "no senses loaded",
      },
    };
  }
  if (top.score >= 2 && (!second || top.score - second.score >= 2)) {
    return {
      word: entries[0].word,
      selection: {
        candidates: all,
        selected: top,
        ambiguous: false,
        note: top.reason,
      },
    };
  }
  const best = all
    .filter((c) => c.score === top.score || c.chainScore > 0)
    .slice(0, 5);
  return {
    word: entries[0].word,
    selection: {
      candidates: best.length ? best : all.slice(0, 5),
      selected: null,
      ambiguous: true,
      note:
        top.score > 0
          ? "multiple senses match the context"
          : chainHasSignal(best)
            ? "weak lexical-field evidence only — genuinely ambiguous"
            : "no direct lexical evidence — genuinely ambiguous",
    },
  };
}

function chainHasSignal(candidates: SenseCandidate[]): boolean {
  return candidates.some((c) => c.chainScore > 0);
}

// ---------- relationships ----------

/** Synonyms: senses sharing the synset (WordNet-style meaning
 *  cluster) → their words. Same meaning = same synset. */
export async function getSynonyms(
  svc: LexiconClient,
  synsetKey: string,
  excludeExternalId?: string,
  opts: LookupOptions = {},
): Promise<Array<{ word: string; partOfSpeech: string; definition: string }>> {
  const statuses = opts.statuses ?? ["VERIFIED"];
  const { data: senses } = await svc
    .from("lexicon_senses")
    .select("external_id,definition,word_id")
    .eq("synset_key", synsetKey)
    .in("knowledge_status", statuses)
    .limit(24);
  const rows = (senses ?? []) as Array<{
    external_id: string;
    definition: string;
    word_id: string;
  }>;
  const filtered = excludeExternalId
    ? rows.filter((r) => r.external_id !== excludeExternalId)
    : rows;
  if (!filtered.length) return [];
  const { data: words } = await svc
    .from("lexicon_words")
    .select("id,canonical,part_of_speech")
    .in("id", Array.from(new Set(filtered.map((r) => r.word_id))))
    .limit(24);
  const wordRows = (words ?? []) as Array<{
    id: string;
    canonical: string;
    part_of_speech: string;
  }>;
  return filtered.map((r) => {
    const w = wordRows.find((x) => x.id === r.word_id);
    return {
      word: w?.canonical ?? "(unknown)",
      partOfSpeech: w?.part_of_speech ?? "",
      definition: r.definition,
    };
  });
}

/** Antonyms via sense-level relations. */
export async function getAntonyms(
  svc: LexiconClient,
  senseExternalId: string,
  opts: LookupOptions = {},
): Promise<Array<{ word: string; definition: string }>> {
  const rel = await getSenseRelations(svc, senseExternalId, ["ANTONYM"], opts);
  const out: Array<{ word: string; definition: string }> = [];
  for (const r of rel) {
    const { data: senses } = await svc
      .from("lexicon_senses")
      .select("external_id,definition,word_id")
      .eq("external_id", r.to_sense_external_id)
      .in("knowledge_status", opts.statuses ?? ["VERIFIED"])
      .limit(1);
    const s = (
      (senses ?? []) as Array<{
        external_id: string;
        definition: string;
        word_id: string;
      }>
    )[0];
    if (!s) continue;
    const { data: words } = await svc
      .from("lexicon_words")
      .select("canonical")
      .eq("id", s.word_id)
      .limit(1);
    out.push({
      word:
        ((words ?? []) as Array<{ canonical: string }>)[0]?.canonical ??
        "(unknown)",
      definition: s.definition,
    });
  }
  return out;
}

/** Sense-level relations (ANTONYM, DERIVATION, PERTAINYM…). */
export async function getSenseRelations(
  svc: LexiconClient,
  senseExternalId: string,
  types?: string[],
  _opts: LookupOptions = {},
): Promise<Array<{ relation_type: string; to_sense_external_id: string }>> {
  let q = svc
    .from("lexicon_sense_relations")
    .select("relation_type,to_sense_external_id")
    .eq("from_sense_external_id", senseExternalId)
    .order("relation_type")
    .limit(48);
  if (types?.length) q = q.in("relation_type", types);
  const { data } = await q;
  return (data ?? []) as Array<{
    relation_type: string;
    to_sense_external_id: string;
  }>;
}

/** Related words by traversing the synset-level graph. */
export async function getRelatedWords(
  svc: LexiconClient,
  synsetKey: string,
  relationTypes?: string[],
  opts: LookupOptions = {},
): Promise<Array<{ relationType: string; word: string; definition: string }>> {
  let q = svc
    .from("lexicon_relationships")
    .select("relation_type,to_synset_key")
    .eq("from_synset_key", synsetKey)
    .order("relation_type")
    .limit(64);
  if (relationTypes?.length) q = q.in("relation_type", relationTypes);
  const { data: rels } = await q;
  const rows = (rels ?? []) as Array<{
    relation_type: string;
    to_synset_key: string;
  }>;
  if (!rows.length) return [];
  const { data: senses } = await svc
    .from("lexicon_senses")
    .select("synset_key,definition,word_id")
    .in("synset_key", Array.from(new Set(rows.map((r) => r.to_synset_key))))
    .in("knowledge_status", opts.statuses ?? ["VERIFIED"])
    .limit(200);
  const senseRows = (senses ?? []) as Array<{
    synset_key: string;
    definition: string;
    word_id: string;
  }>;
  if (!senseRows.length) return [];
  const { data: words } = await svc
    .from("lexicon_words")
    .select("id,canonical")
    .in("id", Array.from(new Set(senseRows.map((s) => s.word_id))))
    .limit(200);
  const wordRows = (words ?? []) as Array<{ id: string; canonical: string }>;
  return rows.flatMap((r) => {
    const s = senseRows.find((x) => x.synset_key === r.to_synset_key);
    if (!s) return [];
    const w = wordRows.find((x) => x.id === s.word_id);
    return [
      {
        relationType: r.relation_type,
        word: w?.canonical ?? "(unknown)",
        definition: s.definition,
      },
    ];
  });
}

/** Word forms: spelling variants + inflections + POS family. */
export async function getWordForms(
  svc: LexiconClient,
  form: string,
): Promise<
  Array<{
    partOfSpeech: string;
    variants: string[];
    inflections: Record<string, unknown>;
  }>
> {
  const { data } = await svc
    .from("lexicon_words")
    .select("part_of_speech,spelling_variants,inflection_metadata")
    .eq("normalized", form.trim().toLowerCase())
    .eq("language", "en")
    .order("part_of_speech")
    .limit(12);
  const rows = (data ?? []) as Array<{
    part_of_speech: string;
    spelling_variants: string[] | string;
    inflection_metadata: Record<string, unknown> | string;
  }>;
  return rows.map((r) => ({
    partOfSpeech: r.part_of_speech,
    variants: jsonArr(r.spelling_variants),
    inflections:
      typeof r.inflection_metadata === "string"
        ? (() => {
            try {
              return JSON.parse(r.inflection_metadata);
            } catch {
              return {};
            }
          })()
        : (r.inflection_metadata ?? {}),
  }));
}

/** Phrases / phrasal verbs / multi-word units matching a prefix
 *  or exact form. */
export async function lookupPhrases(
  svc: LexiconClient,
  fragment: string,
  opts: LookupOptions = {},
): Promise<Array<{ phrase: string; unitType: string; definition: string }>> {
  const statuses = opts.statuses ?? ["VERIFIED"];
  const { data: words } = await svc
    .from("lexicon_words")
    .select("id,canonical,unit_type")
    .ilike("normalized", `%${fragment.trim().toLowerCase()}%`)
    .neq("unit_type", "WORD")
    .eq("language", opts.language ?? "en")
    .limit(24);
  const wordRows = (words ?? []) as Array<{
    id: string;
    canonical: string;
    unit_type: string;
  }>;
  if (!wordRows.length) return [];
  const { data: senses } = await svc
    .from("lexicon_senses")
    .select("word_id,definition")
    .in(
      "word_id",
      wordRows.map((w) => w.id),
    )
    .in("knowledge_status", statuses)
    .limit(48);
  const senseRows = (senses ?? []) as Array<{
    word_id: string;
    definition: string;
  }>;
  return wordRows.flatMap((w) => {
    const s = senseRows.find((x) => x.word_id === w.id);
    return s
      ? [
          {
            phrase: w.canonical,
            unitType: w.unit_type,
            definition: s.definition,
          },
        ]
      : [];
  });
}

/** Domain-specific senses (domain is metadata, spec §8). */
export async function lookupDomainSenses(
  svc: LexiconClient,
  domain: string,
  opts: LookupOptions = {},
): Promise<Array<{ word: string; definition: string }>> {
  const { data: senses } = await svc
    .from("lexicon_senses")
    .select("definition,word_id")
    .eq("domain", domain)
    .in("knowledge_status", opts.statuses ?? ["VERIFIED"])
    .order("external_id")
    .limit(24);
  const rows = (senses ?? []) as Array<{ definition: string; word_id: string }>;
  if (!rows.length) return [];
  const { data: words } = await svc
    .from("lexicon_words")
    .select("id,canonical")
    .in("id", Array.from(new Set(rows.map((r) => r.word_id))))
    .limit(24);
  const wordRows = (words ?? []) as Array<{ id: string; canonical: string }>;
  return rows.map((r) => ({
    word: wordRows.find((w) => w.id === r.word_id)?.canonical ?? "(unknown)",
    definition: r.definition,
  }));
}

/** Regional senses (regional usage is metadata, spec §7 —
 *  regional vocabulary is never classified as incorrect). */
export async function lookupRegionalSenses(
  svc: LexiconClient,
  region: string,
  opts: LookupOptions = {},
): Promise<
  Array<{ word: string; regionalUsage: string | null; definition: string }>
> {
  const { data: words } = await svc
    .from("lexicon_words")
    .select("id,canonical,regional_usage")
    .eq("regional_usage", region)
    .eq("language", opts.language ?? "en")
    .limit(48);
  const wordRows = (words ?? []) as Array<{
    id: string;
    canonical: string;
    regional_usage: string | null;
  }>;
  if (!wordRows.length) return [];
  const { data: senses } = await svc
    .from("lexicon_senses")
    .select("definition,word_id")
    .in(
      "word_id",
      wordRows.map((w) => w.id),
    )
    .in("knowledge_status", opts.statuses ?? ["VERIFIED"])
    .limit(48);
  const senseRows = (senses ?? []) as Array<{
    definition: string;
    word_id: string;
  }>;
  return wordRows.flatMap((w) => {
    const s = senseRows.find((x) => x.word_id === w.id);
    return s
      ? [
          {
            word: w.canonical,
            regionalUsage: w.regional_usage,
            definition: s.definition,
          },
        ]
      : [];
  });
}

/** Provenance for a sense (spec §3 — never detached). */
export async function getProvenance(
  svc: LexiconClient,
  sense: LexiconSenseRow,
): Promise<LexiconSourceRow | null> {
  if (!sense.source_id) return null;
  const { data } = await svc
    .from("lexicon_sources")
    .select("id,name,dataset,version,license,attribution,url")
    .eq("id", sense.source_id)
    .limit(1);
  return ((data ?? []) as LexiconSourceRow[])[0] ?? null;
}

// ---------- ARCHIE ground-truth block builder ----------

export interface LexicalGroundTruth {
  block: string;
  wordsExamined: number;
  disambiguated: string[];
  ambiguous: string[];
}

/**
 * Build the lexical ground-truth block injected into ARCHIE's
 * system context (spec §12 — the live language pathway).
 * Deterministic, bounded, honest: only words with multiple
 * loaded senses are clarified; ambiguity is stated, never
 * resolved by invention.
 */
export async function lexicalGroundTruth(
  svc: LexiconClient,
  message: string,
): Promise<LexicalGroundTruth> {
  const rawTokens = Array.from(new Set(lexicalTokens(message)))
    .filter((t) => t.length >= 3)
    .slice(0, 8); // bounded — never load the dictionary into context
  const tokens = Array.from(new Set(rawTokens.flatMap((t) => [t, stem(t)])));
  if (!tokens.length) {
    return { block: "", wordsExamined: 0, disambiguated: [], ambiguous: [] };
  }

  const results = await lookupWords(svc, tokens, { limit: 48 });
  const lines: string[] = [];
  const disambiguated: string[] = [];
  const ambiguous: string[] = [];

  for (const { word, senses } of results) {
    if (senses.length < 2) continue; // single-sense words need no clarification
    const selfForms = new Set([word.normalized, stem(word.normalized)]);
    const contextStems = new Set(
      lexicalTokens(message)
        .map(stem)
        .filter((st) => !selfForms.has(st) && !selfForms.has(stem(st))),
    );
    const ranked = senses
      .map((sense) => {
        const defTokens = lexicalTokens(sense.definition).map(stem);
        const exTokens = jsonArr(sense.usage_examples).flatMap((ex) =>
          lexicalTokens(ex).map(stem),
        );
        let score = 0;
        for (const st of contextStems) {
          if (defTokens.includes(st)) score += 2;
          else if (exTokens.includes(st)) score += 1;
        }
        return { sense, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.sense.external_id.localeCompare(b.sense.external_id),
      );

    const top = ranked[0];
    const second = ranked[1];
    const pos = word.part_of_speech;
    if (top.score >= 2 && top.score - second.score >= 2) {
      disambiguated.push(word.canonical);
      lines.push(
        `- "${word.canonical}" (${pos}): in this message it means — ${top.sense.definition}`,
      );
    } else {
      ambiguous.push(word.canonical);
      const shown = ranked.filter((r) => r.score > 0).slice(0, 2);
      const cands = shown.length
        ? shown.map((r) => `(${r.sense.definition})`).join(" | ")
        : ranked
            .slice(0, 2)
            .map((r) => `(${r.sense.definition})`)
            .join(" | ");
      lines.push(
        `- "${word.canonical}" (${pos}): ambiguous in this message — candidate senses: ${cands} … [${senses.length} senses loaded]`,
      );
    }
  }

  if (!lines.length) {
    return {
      block: "",
      wordsExamined: results.length,
      disambiguated,
      ambiguous,
    };
  }
  const block =
    "Lexical ground truth from ARCHIE's verified lexicon (sourced dictionary data; cite meanings, never contradict them):\n" +
    lines.join("\n");
  return { block, wordsExamined: results.length, disambiguated, ambiguous };
}
