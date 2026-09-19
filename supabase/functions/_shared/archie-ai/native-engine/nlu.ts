// =========================================================
// ARCHIE NATIVE ENGINE — NATURAL LANGUAGE UNDERSTANDING
//
// Real NLU, deterministic and measurable:
//   * normalizer + tokenizer
//   * entity extraction (numbers, quantities, URLs, emails,
//     file paths, code references, dates)
//   * TF-IDF vectorizer (real term-frequency × inverse
//     document-frequency over the corpus)
//   * multinomial Naive Bayes intent classifier TRAINED AT
//     BOOT from a labeled corpus. This is genuine statistical
//     learning — small scale, deterministic, zero external
//     APIs. Accuracy is MEASURED by the test suite over a
//     held-out labeled set.
// Not a canned chatbot: the classifier routes understanding;
// it never produces responses.
// =========================================================

import type { MemoryTurn, ToolSpecInternal } from "./types.ts";
// Conversational English expansion (owner directive,
// 2026-09-11): labeled conversational training data and
// emoji tone understanding. The corpus import is DATA —
// it trains the same Bayes classifier below; it never
// hardcodes responses.
import { CONVERSATION_CORPUS } from "./conversation-corpus.ts";
import {
  extractEmojiTone,
  emojiAlignsWithIntent,
  type EmojiToneResult,
} from "./emoji.ts";

// ---------------------------------------------------------
// Normalization & tokenization
// ---------------------------------------------------------
export function normalize(input: string): string {
  return input.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "am",
  "do",
  "does",
  "did",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "but",
  "at",
  "by",
  "from",
  "as",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "we",
  "they",
  "me",
  "my",
  "your",
  "please",
  "can",
  "could",
  "would",
  "will",
  "shall",
  "may",
  "might",
]);

// Self-referential intents (capability_query, identity_query,
// system_status) require an explicit ARCHIE/self anchor —
// otherwise everyday questions with "what/which/should" get
// misrouted away from knowledge. Deterministic precision guard.
// Second-person identity assertions ("you are actually
// ChatGPT") ARE anchored: they genuinely target the self-model
// and must keep the identity route (conflict arbitration).
const SELF_ANCHOR =
  /archie|your (abilities|skills|capabilities|tools|knowledge|memory|engine|subsystems?|systems?|status|diagnostics|name)|can you do|are you able|can you (?:convert|handle|manage|offer|support|provide)|anything you can do|do you (?:offer|support|handle|provide)|(?:do|run|give me|gimme) a (?:systems?|health|status|diagnostics) check|(?:systems?|health|status) check|are you (?:really |actually |just |some kind of |basically |merely )*(?:an? )?(?:chatgpt|gemini|claude|copilot|ai|assistant|chatbot|robot|human|person|program|llm|model)|you(?:'re| are|r)\s+(?:actually |really |just |some kind of |basically )?(?:chatgpt|gemini|claude|copilot|an ai|a robot|openai|an assistant|a chatbot)|who (?:am i|i am) talking to|who am i speaking to|who (?:is|was) behind (?:you|this|that|archie|the (?:assistant|bot|chat|agent))|tell me (?:more )?about yourself|tell me who you are|who you (?:are|were)|what (?:model|engine|system) (?:are|powers) you|who (?:made|built|created) you|what should i call you|what is operational|show diagnostics|engine status|health check|status report/i;
const SELF_ANCHOR_INTENTS = new Set([
  "capability_query",
  "identity_query",
  "system_status",
]);

export function tokenize(input: string): string[] {
  const normalized = normalize(input);
  const raw = normalized.match(/[a-z0-9+#._/]+/g) ?? [];
  return raw
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => t.replace(/^[._/-]+|[._/-]+$/g, ""))
    .filter((t) => t.length > 1);
}

// ---------------------------------------------------------
// Entity extraction — real patterns, honest typing
// ---------------------------------------------------------
export interface Entities {
  numbers: number[];
  quantities: { value: number; unit: string }[];
  urls: string[];
  emails: string[];
  filePaths: string[];
  codeRefs: string[];
  dates: string[];
  questionText: string | null;
}

export function extractEntities(input: string): Entities {
  const quantities: { value: number; unit: string }[] = [];
  for (const m of input.matchAll(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m|km|kg|g|mg|l|ml|sqm|sq ft|ft|m2|m²|s|ms|hours?|minutes?|days?|naira|₦|\$|usd|ngn|percent|%)/gi,
  )) {
    quantities.push({ value: Number(m[1]), unit: m[2].toLowerCase() });
  }
  const questionMatch = input.match(
    /^(?:what|who|when|where|why|how|which|whose|is|are|can|does|do|explain|define|describe|tell)\b/i,
  );
  return {
    numbers: (input.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
    quantities,
    urls: [...input.matchAll(/https?:\/\/[^\s)"']+/gi)].map((m) => m[0]),
    emails: [...input.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0]),
    filePaths: [
      ...input.matchAll(
        /(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|py|sql|json|md|css|html)/g,
      ),
    ].map((m) => m[0]),
    codeRefs: [
      ...input.matchAll(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g),
    ]
      .filter(
        (m) =>
          /\.(ts|tsx|js|jsx|py|sql)$/.test(m[0]) ||
          /^(function|const|class|import|export|def)\b/i.test(
            input.slice(Math.max(0, m.index - 12), m.index),
          ),
      )
      .map((m) => m[0])
      .slice(0, 10),
    dates: [...input.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]),
    questionText: questionMatch ? input : null,
  };
}

// ---------------------------------------------------------
// TF-IDF vectorizer (real; used for memory + fact salience)
// ---------------------------------------------------------
export class TfIdfIndex {
  private docFreq = new Map<string, number>();
  private docs = 0;

  addDoc(tokens: string[]): void {
    this.docs += 1;
    for (const term of new Set(tokens)) {
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
    }
  }

  /** IDF-weighted term-frequency vector. */
  vectorize(tokens: string[]): Map<string, number> {
    const v = new Map<string, number>();
    const idf = (t: string) =>
      Math.log((1 + this.docs) / (1 + (this.docFreq.get(t) ?? 0))) + 1;
    for (const t of tokens) {
      v.set(t, (v.get(t) ?? 0) + 1);
    }
    for (const [t, tf] of v) v.set(t, (tf / tokens.length || tf) * idf(t));
    return v;
  }
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, y] of b) nb += y * y;
  if (na === 0 || nb === 0) return 0;
  for (const [t, x] of a) {
    const y = b.get(t);
    if (y) dot += x * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------
// Conversational typo normalization (owner directive,
// 2026-09-11). Real owners type "helo", "soory", "wond".
// Instead of memorizing typo variants, the NLU corrects any
// OUT-OF-VOCABULARY token that is within Damerau
// Levenshtein distance 1 of a real corpus word — the same
// normalizer generalizes to typos it has never seen.
// Deterministic: the highest-frequency candidate wins,
// ties break alphabetically. In-vocabulary words and short
// tokens (length < 3) are never touched, so the corrector
// can never corrupt legitimate input.
// ---------------------------------------------------------

/** Corpus lexicon with word frequencies — built LAZILY from
 *  the FULL training corpus (base + conversational), once,
 *  on first use (the corpus is declared later in the
 *  module). */
let vocabFreqCache: Map<string, number> | null = null;
function vocabFreq(): Map<string, number> {
  if (vocabFreqCache) return vocabFreqCache;
  const m = new Map<string, number>();
  for (const utterances of CORPUS.map((c) => c[1])) {
    for (const u of utterances) {
      for (const t of tokenize(u)) {
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
  }
  vocabFreqCache = m;
  return m;
}

/** CONVERSATIONAL lexicon — words from the conversational
 *  expansion corpus ONLY. The typo corrector corrects toward
 *  these words alone: its mandate is conversational
 *  robustness (helo, tink, congartulations), never domain
 *  text ("voice bank" must not become "voice banks"). */
let conversationalVocabCache: Map<string, number> | null = null;
function conversationalVocab(): Map<string, number> {
  if (conversationalVocabCache) return conversationalVocabCache;
  const m = new Map<string, number>();
  for (const utterances of CONVERSATION_CORPUS.map((c) => c[1])) {
    for (const u of utterances) {
      for (const t of tokenize(u)) {
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
  }
  conversationalVocabCache = m;
  return m;
}

/** Damerau-Levenshtein (optimal string alignment) distance.
 *  Transpositions ("congartulations" -> "congratulations")
 *  count as a single edit. */
function editDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return 2; // fast reject
  const d: number[][] = Array.from({ length: la + 1 }, () =>
    new Array<number>(lb + 1).fill(0),
  );
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[la][lb];
}

/** Correct one out-of-vocabulary word to its nearest real
 *  corpus word, or return the word unchanged.
 *
 *  GUARDS (each one learned from measured misroutes):
 *   * in-vocabulary words are never touched
 *   * function words (stopwords) are never touched — rule
 *     patterns need them intact ("are you there" must not
 *     become "area you there")
 *   * vowel-less tokens are abbreviations (pls, thx, brb),
 *     not typos — deterministic short-form rules own them
 *   * a candidate must share at least a 2 letter prefix with
 *     the token ("nite" must not become "site")
 *   * among valid candidates: longest shared prefix wins,
 *     then corpus frequency, then alphabetical — fully
 *     deterministic ("helo" -> "hello", not "help")
 */
function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Does deleting exactly one character from longer yield
 *  shorter? (One edit: an insertion or a deletion.) */
function oneCharDeletion(longer: string, shorter: string): boolean {
  if (longer.length !== shorter.length + 1) return false;
  for (let i = 0; i < longer.length; i++) {
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) {
      return true;
    }
  }
  return false;
}

function correctWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length < 3) return word;
  if (!/[aeiou]/.test(lower)) return word;
  if (!tokenize(lower).length) return word;
  // A word known ANYWHERE in the full training corpus (base
  // or conversational) is never a correction target — the
  // corrector may only rescue genuinely unknown tokens
  // ("days" is a real word; "dapron" is a typo).
  // Corpus words (base or conversational) are ALWAYS known —
  // rules quote them directly ("whats the damage"). The
  // vocabulary registry is skipped for wh-contractions:
  // a registered "hows" must still normalize (incident
  // 2026-09-13), while a registered "flimber" stays intact.
  if (vocabFreq().has(lower) || conversationalVocab().has(lower)) {
    return word;
  }
  if (!isWhContraction(lower) && isKnownVocabularyTerm(lower)) {
    return word;
  }
  const freq = conversationalVocab();
  // Edit types, most likely typo first (dropped letters are
  // the most common typo, substitutions the least):
  //   3 = candidate is the token with one letter INSERTED
  //       (tink -> think); prefix >= 1 suffices
  //   2 = candidate is the token with one letter DELETED
  //       (wond -> won); prefix >= 2 required
  //   1 = single substitution (soory -> sorry); prefix >= 2
  let best: string | null = null;
  let bestType = 0;
  let bestPrefix = -1;
  let bestFreq = 0;
  for (const [candidate, f] of freq) {
    if (editDistance(lower, candidate) > 1) continue;
    // Plural morphology is not a typo: adding a trailing
    // s or es never rescues an unknown word (corpus v2 fix:
    // "service" must not become "services", which silently
    // broke rules that expect the singular).
    if (candidate === lower + "s" || candidate === lower + "es") continue;
    const prefix = commonPrefixLength(lower, candidate);
    let type = 0;
    if (oneCharDeletion(candidate, lower)) {
      type = 3; // token + inserted char
      if (candidate.length < 3) continue;
    } else if (oneCharDeletion(lower, candidate)) {
      type = 2; // token with a dropped char
      if (candidate.length < 3) continue;
    } else if (candidate.length === lower.length) {
      type = 1; // substitution — the weakest signal: only
      // longer words qualify (a 3 letter swap like
      // yam -> yay is noise, not a typo)
      if (candidate.length < 4) continue;
    } else {
      continue;
    }
    // Substitution is the weakest typo evidence: require a
    // 3 letter shared prefix so "bank" can never become
    // "back". Insertions (dropped letter) and deletions keep
    // the looser prefix rules above.
    const minPrefix = type === 3 ? 1 : type === 1 ? 3 : 2;
    if (prefix < minPrefix) continue;
    const better =
      type > bestType ||
      (type === bestType && prefix > bestPrefix) ||
      (type === bestType && prefix === bestPrefix && f > bestFreq) ||
      (type === bestType &&
        prefix === bestPrefix &&
        f === bestFreq &&
        candidate < (best ?? "~"));
    if (better) {
      best = candidate;
      bestType = type;
      bestPrefix = prefix;
      bestFreq = f;
    }
  }
  return best ?? word;
}

// SELF-EVOLVING VOCABULARY (owner directive 2026-09-12): the
// vocabulary registry (seed foundation + words learned from
// the owner's real usage) is authoritative known-word
// knowledge. A registered word is never a correction target.
import {
  isKnownVocabularyTerm,
  isWhContraction,
} from "../knowledge/vocabulary.ts";

/** Normalize a raw message for the NLU pipeline: every word
 *  is either a real known word or a distance-1 correction of
 *  one. Exported for the quality gate to measure directly. */
export function correctConversationalTypos(input: string): string {
  return input.replace(/[A-Za-z]+/g, (w) => correctWord(w));
}

// ---------------------------------------------------------
// Intent classifier — multinomial Naive Bayes, trained at
// boot from a labeled corpus. Additive (Laplace) smoothing.
// ---------------------------------------------------------
export const INTENTS = [
  "greeting",
  "farewell",
  "gratitude",
  "identity_query",
  "capability_query",
  "system_status",
  "knowledge_query",
  "howto_guidance",
  "task_planning",
  "code_analysis_request",
  "research_request",
  "price_query",
  "crypto_market_query",
  "documents_query",
  "images_query",
  "voice_query",
  "social_query",
  "family_query",
  "construction_calc",
  "math_question",
  "teaching",
  "memory_exclusion",
  "correction",
  // --- conversational English expansion (owner
  // directive 2026-09-11): social exchange intents. The
  // classifier learns them from CONVERSATION_CORPUS; the
  // engine answers them through the conversational
  // composer (conversation.ts), never canned scripts.
  "help_request",
  "apology",
  "acknowledgment",
  "agreement",
  "disagreement",
  "emotional_expression",
  "celebration",
  "social_talk",
  "time_query",
  "availability_check",
  "activity_query",
  "clarification_request",
  // --- TEMPORAL AXIS (audit HIGH-1 fix, 2026-09-13):
  // change-over-time questions and state-change claims get
  // first-class intents so they never silently degrade into
  // smalltalk routing. Handlers are honest: no recorded
  // observations → honest refusal, never invention.
  "temporal_change_query",
  "state_change_claim",
] as const;

export type Intent = (typeof INTENTS)[number];

/** Labeled training corpus — the classifier's genuine training data. */
// Exported for the held-out leak guard (phase 4): the
// confusion test verifies no held-out phrase appears
// verbatim in the training corpus — memorization is not
// generalization. This is the BASE corpus (pre
// conversational expansion); the full training corpus is
// CORPUS below, which the conversational quality gate
// uses to measure the baseline against.
export const BASE_NLU_CORPUS: Array<[Intent, string[]]> = [
  [
    "greeting",
    [
      "hello archie",
      "hi archie",
      "hey there",
      "good morning",
      "good evening",
      "how are you today",
      "yo archie you around",
      "greetings",
      "hi there",
      "hello there",
      "hey archie",
      "good afternoon",
      "hi, its me again",
      "hey, quick question but hello first",
      "hello, are you around",
      "good to see you again",
      "howdy",
      "hey hey",
      "morning archie",
      "evening",
      "whats up",
      "how is it going",
      "how have you been",
      "how are you doing",
      "how are you doing today",
      "how is your day going",
      "how are you feeling today",
      "hey how are you doing",
      "how are you doing this morning",
      "long time no talk",
      "hi, hope you are well",
      "hello my friend",
      "hey you around",
      "top of the morning",
      "hi hi",
      "greetings and salutations",
    ],
  ],
  [
    "farewell",
    [
      "bye for now",
      "goodbye archie",
      "talk later",
      "catch you later",
      "im done for today",
      "good night",
      "see you later",
      "bye archie",
      "thats all for today",
      "im signing off",
      "thats everything, thanks and goodbye",
      "talk to you tomorrow",
      "speak soon",
      "ill be back later",
      "goodbye for now",
      "im heading out",
      "lets call it a day",
      "thats it from me today",
      "later archie",
      "im off for the night",
    ],
  ],
  [
    "gratitude",
    [
      "thank you",
      "thanks a lot",
      "that was helpful",
      "great work",
      "appreciate it",
      "well done",
      "thank you so much",
      "thanks archie",
      "that really helped",
      "perfect, thank you",
      "nice one",
      "youre the best",
      "cheers, that was great",
      "im grateful for your help",
      "thanks, that answer was spot on",
      "good job",
      "thanks for the quick answer",
      "thanks for everything today",
      "thank you for all your help today",
      "thanks for all the hard work this week",
      "that saved me time, thanks",
    ],
  ],
  [
    "identity_query",
    [
      "who are you",
      "what are you",
      "are you archie",
      "introduce yourself",
      "what is your name",
      "are you chatgpt",
      "are you gemini",
      "do you use openai",
      "who made you",
      "who created you",
      "who built you",
      "what model are you",
      "are you a real ai or a chatbot",
      "are you claude",
      "are you human",
      "are you a robot",
      "tell me about yourself",
      "what should i call you",
      "so who exactly am i talking to",
      "are you really archie",
      "is this an ai im talking to",
      "youre just chatgpt with a different name, right",
      "i bet you are really chatgpt underneath",
      "so youre basically a chatbot",
      "you seem like gemini to me",
      "are you sure youre not claude",
      "do you run on openai models",
      "who is behind you",
      "what engine powers you",
      "explain who you are",
      "are you an assistant",
      "who runs this assistant",
      "who is behind this chat",
      "who made this assistant",
      "is this assistant a person or a program",
      "who developed this assistant",
    ],
  ],
  [
    "capability_query",
    [
      "what can you do",
      "what are you able to do",
      "can you help me with things",
      "what are your abilities",
      "can you do math",
      "can you plan tasks for me",
      "can you remember things i tell you",
      "can you research topics for me",
      "are you able to analyze code",
      "what kind of tasks can you handle",
      "list your capabilities",
      "can you teach me things",
      "can you answer questions",
      "can you calculate quantities for projects",
      "what work are you good at",
      "show me what you can do",
      "can you check prices for me",
      "are you able to search the web",
      "can you plan my week for me",
      "what are you capable of exactly",
      "is there anything you can do for me",
      "can you handle planning",
      "do you support research tasks",
      "what services do you offer",
      "can you look things up for me",
      "are you able to learn from our chats",
      "what can you help with",
      "can you manage tasks",
      "could you plan a project for me",
      "can you convert units for me",
      "do you handle unit conversions",
      "can you do conversions between feet and meters",
      "what can you tell me about your own abilities",
      "do you offer any tools for research",
      "do you have any features for planning",
      "are there any tools you can use for estimates",
      "what exactly can you do for me",
      "tell me what you can do for me",
      "what can you really do for me",
      "what do you actually do",
      "what can you help me with today",
    ],
  ],
  [
    "system_status",
    [
      "how is your system running",
      "are you operational",
      "is your engine healthy",
      "status report",
      "give me your status",
      "how are your subsystems doing",
      "any errors today",
      "is everything working on your end",
      "how is your memory doing",
      "are you running at full capacity",
      "check your systems",
      "is your knowledge base working",
      "do a systems check",
      "how is your engine performing",
      "any issues i should know about",
      "are all your modules online",
      "whats your current state",
      "is your research pipeline working",
      "how are you running today",
      "are you feeling okay technically",
      "run a health check",
      "is your planning working properly",
      "everything ok on your side",
      "are you degraded right now",
      "any warnings in your system",
      "how is the engine today",
      "any problems with your subsystems",
      "how are your subsystems holding up",
      "is your subsystem health good",
      "whats the state of your systems",
    ],
  ],
  [
    "knowledge_query",
    [
      "what is screeding",
      "what is concrete curing",
      "explain how grout works",
      "tell me about epoxy grout",
      "which grout should i choose for wet areas",
      "what type of grout suits bathroom tiles",
      "what do you know about tile adhesives",
      "explain the difference between primer and sealer",
      "what is the difference between oil and water based paint",
      "when is the delivery",
      "what time is the site meeting",
      "which brand of tiles lasts longest",
      "what does curing time mean",
      "tell me about laterite as a building material",
      "what is a datum level",
      "explain what a batching plant does",
      "what is the standard room height in nigeria",
      "which roofing sheet is best for hot climates",
      "what is flexural strength",
      "explain the water cement ratio",
      "what does r-value mean in insulation",
      "tell me about the history of concrete",
      "what is a dapron wall",
      "which sand type is best for plastering",
      "what is a lintel",
      "whats a lintel",
      "whats a batching plant",
      "whats a dapron in construction",
      "explain how damp proofing works",
      "what is the difference between m20 and m25 concrete",
      "tell me about pvc ceilings vs pop ceilings",
      "what causes efflorescence on walls",
      "explain tile spacing",
      "what are the types of foundation cracks",
      "which timber is termite resistant",
      "how is the market for building materials this week",
      "what is the market situation for granite now",
      "how is the weather affecting construction season",
      // --- domain generality (audit Phase 3) ---
      "explain how vaccination works",
      "what is the speed of light",
      "tell me about the sahara desert",
      "what causes rust on bicycles",
      "explain how a refrigerator works",
      "whats the difference between a comet and an asteroid",
      "what is the longest river in the world",
      "tell me about the ghana empire",
      "which phone has the best battery life",
      "what does ssl mean",
      "how does a car engine work",
      "what is machine learning",
      "explain the difference between debit and credit cards",
      "what are the symptoms of malaria",
      "tell me about the nigerian movie industry",
      "what is the boiling point of water",
      "explain how gps works",
      "which planets are visible tonight",
      "what is inflation",
      "tell me about whale migration",
      "explain how solar panels work",
      "what does dpi mean",
    ],
  ],
  [
    "howto_guidance",
    [
      "how do i prepare a wall for painting",
      "how do i mix cement mortar",
      "how to lay tiles properly",
      "steps to install a ceiling fan",
      "how do i seal a concrete floor",
      "how do i fix a leaking roof",
      "how to apply screed on a floor",
      "how do i remove old wallpaper",
      "walk me through painting a room",
      "how do i cure concrete slabs",
      "how to choose the right ladder for work",
      "how do i set out a building",
      "how to waterproof a bathroom",
      "how do i hang a heavy mirror",
      "guide me through fixing a door frame",
      "how do i fill cracks in a wall",
      "how to sharpen a chisel",
      "how do i paint over a dark color",
      "teach me how to do it properly",
      "how do i maintain my tools",
      "how to store leftover paint",
      "how do i level a floor",
      "what is the best way to clean paint brushes",
      "whats the best way to organize my toolbox",
      "what is the best way to store cement bags",
      "whats the best way to fix a sticking door",
      "best way to prep a ceiling before painting",
      // --- domain generality (audit Phase 3): how-to intent
      // is the PATTERN ("how do i", "steps to", "walk me
      // through"), not the domain. Construction stays one
      // domain among many — no domain monopoly. ---
      "how do i knead bread dough",
      "how to cook pasta al dente",
      "steps to change a flat tire",
      "how do i set up a printer",
      "walk me through creating a monthly budget",
      "how to train a puppy",
      "guide me through writing a resume",
      "steps to back up my laptop",
      "how do i tie a tie",
      "walk me through booking a flight online",
      "guide me through starting a vegetable garden",
      "how to meditate for beginners",
      "steps to learn a new language",
      "how do i fix a bike puncture",
      "best way to store fresh herbs",
      "whats the best way to descale a kettle",
      "how to dance salsa for beginners",
      "best way to clean a cast iron pan",
      "how do i remove a coffee stain",
      "steps to apply for a passport",
    ],
  ],
  [
    "task_planning",
    [
      "help me plan a project",
      "plan my week",
      "help me organize this renovation",
      "create a plan for the kitchen tiling",
      "plan the painting job for my house",
      "help me plan my day",
      "break this project into steps",
      "plan the work for next week",
      "help me organize my tasks",
      "make a schedule for the build",
      "help me plan the budget for this job",
      "organize the workflow for the site",
      "plan out the phases for this project",
      "help me plan a room repaint",
      "create a timeline for the renovation",
      "help me prioritize these tasks",
      "plan the deliveries for the materials",
      "help me sort out the work order",
      "break this into a checklist",
      "plan my morning routine",
      "help me plan a trip to the site",
      "organize my week around this deadline",
      // --- domain generality (audit Phase 3) ---
      "help me plan my study schedule",
      "plan my move to a new apartment",
      "break my exam prep into steps",
      "create a plan for learning french",
      "help me organize a birthday party",
      "make a schedule for my job hunt",
      "plan my weekly meal prep",
      "help me build a savings plan",
      "organize my training for the marathon",
      "plan the itinerary for my holiday",
    ],
  ],
  [
    "code_analysis_request",
    [
      "analyze this function",
      "review my code",
      "analyze this component for bugs",
      "review this module please",
      "check my code for issues",
      "analyze the performance of this file",
      "review this pull request",
      "analyze this script for errors",
      "review my sql query",
      "analyze this api endpoint",
      "check this function for edge cases",
      "review the code in this branch",
      "analyze my typescript types",
      "review this regex",
      "analyze this code path",
      "look for bugs in this file",
      "review the error handling here",
      "analyze this loop for problems",
      "review our test coverage",
      "analyze why this code is slow",
    ],
  ],
  [
    "research_request",
    [
      "research the best grout brands",
      "search for concrete prices in nigeria",
      "find information about solar inverters",
      "research the latest cement standards",
      "search the web for tile suppliers near me",
      "research this topic for me",
      "look up information about damp proof membranes",
      "research the history of arc welding",
      "find out what causes concrete cancer",
      "research competitor pricing for painting services",
      "search for the best waterproofing products",
      "research current building regulations",
      "look up the specifications for this tool",
      "research eco friendly insulation options",
      "find information on rust prevention",
      "research the market for scaffolding rental",
      "search for reviews of this paint brand",
      "look into how others solved this problem",
      "research the price trends for steel",
      "find out what experts say about pop ceilings",
      "research this for me before i decide",
      "search for case studies on foundation repairs",
      // --- domain generality (audit Phase 3) ---
      "research the best laptops for students",
      "search for flight deals to london",
      "find information about investment options",
      "look up the side effects of this medicine",
      "research the history of the yoruba empire",
      "search the web for easy piano songs",
      "find out what causes rust on cars",
      "research graduate school scholarships",
      "look up visa requirements for ghana",
      "search for healthy meal prep ideas",
      "research used car prices",
      "find information on learning mandarin",
      "look up the tax rules for small business",
      "research the best running shoes",
      "search for dog friendly hotels",
      "find out which banks have the lowest fees",
    ],
  ],
  [
    "math_question",
    [
      "what is 12 times 34",
      "calculate 15 percent of 8000",
      "how much is 25 plus 25",
      "whats 144 divided by 12",
      "calculate the area of a 4 by 5 rectangle",
      "what is 20 percent off 45000",
      "how much is 3.5 percent interest on 200000",
      "calculate 17 squared",
      "whats the square root of 169",
      "what is 100 minus 37.5",
      "convert 5 meters to centimeters",
      "whats 9 times 9 times 9",
      "calculate my profit if i buy at 120 and sell at 180",
      "whats 10 percent of 250000",
      "how much do i save with a 15 percent discount on 80000",
      "calculate the average of 4 8 and 12",
      "whats 350 multiplied by 6",
      "convert 90 kilograms to pounds",
      "add 240 and 380 for me",
      "whats 45 plus 90",
      "sum 120 and 340 for me",
      "add up 500 and 750",
      "whats 8 plus 8",
    ],
  ],
  [
    "memory_exclusion",
    [
      "do not remember the gate code",
      "don't remember what i told you about the safe",
      "never store my atm pin",
      "do not store the door code",
      "don't keep that in memory",
      "never memorize my password",
      "do not note the account number down",
      "don't save the wifi password",
      "stop remembering my secrets",
      "do not record this conversation",
    ],
  ],
  [
    "teaching",
    [
      "remember that my site is in lekki",
      "learn that i prefer epoxy grout",
      "note that the client wants white ceilings",
      "memorize this: the gate code is 4471",
      "remember the delivery is on friday",
      "note that cement prices rose again",
      "remember that i work on weekends",
      "learn this preference: i like detailed answers",
      "remember that my paint supplier is topcoat",
      "note that the project deadline is the 30th",
      "remember my site manager is called ade",
      "learn that we use 450mm blocks",
      "remember that i hate surprises in pricing",
      "teach yourself this rule: never quote without checking stock",
      "remember i confirmed the tiling date",
      "note that the roof design changed to pitched",
      "remember that granite comes from the abeokuta quarry",
      "learn that my workers start at 7am",
      "remember the structural engineer approved the design",
      "note this down: the client pays in two installments",
      "remember that we settled on matte paint",
      "learn this for future estimates: my rooms are 10 feet high",
      "store this fact: the client pays in two installments",
      "keep in mind that my client prefers saturday visits",
      "you should know that my supplier delivers on mondays",
      "you should know that i never work on sundays",
      "i want to teach you a new fact",
      "let me teach you this rule",
      "i would like to teach you something",
      "i want to teach you about my workflow",
      "let me teach you a preference",
    ],
  ],
  [
    "price_query",
    [
      "check prices of granite today",
      "check the cost of sharp sand",
      "whats granite going for now",
      "what are blocks going for these days",
      "check today price of cement at the depot",
      "how much is granite per tonne now",
      "current cost of a trip of laterite",
      "whats the going rate for iron rods",
      "check the market price of plywood",
      "how much does a bundle of roofing sheets go for",
      "whats the damage on floor tiles these days",
      "check what replastering costs in my area",
      "going rate for a plumber these days",
      "what is day rate for masons around here",
      "check labor cost for plastering work",
      "what is the price of iron rods today",
      "how much does a trip of sharp sand cost",
      "what does a bundle of iron rods cost",
      "current price of cement at the depot please",
      "what is the going price of roofing sheets",
      "how much do paving stones cost",
    ],
  ],
  [
    "correction",
    [
      "no, the ratio is 1 to 4",
      "actually the price is different",
      "that is wrong",
      "you are mistaken about the date",
      // INTENT-LEVEL NEGATION (audit MEDIUM-1 fix, 2026-09-13):
      // genuine contrastive training pairs so the classifier
      // itself separates negated imperatives from their
      // positive twins — the rules catch the leading forms,
      // the classifier learns the mid-sentence ones.
      "do not call the supplier",
      "do not share my contact details",
      "don't send that message yet",
      "never quote without checking stock",
      "do not publish the report today",
      "don't approve that payment",
      "stop scheduling meetings on sundays",
      "no that is not what i said",
      "thats incorrect, try again",
      "actually it is the other way around",
      "no, i said two coats not three",
      "correction: the meeting is on thursday",
      "wait, thats not right",
      "no, use the other supplier",
      "actually the site is in ikorodu not lekki",
      "thats not accurate",
      "no, the budget is 500000 not 50000",
      "hmm, that answer is off",
      "actually i need it in feet not meters",
      "no, i meant the master bedroom",
      "thats wrong, check again",
      "correction, the paint is satin not matte",
      "no, deliver on monday instead",
    ],
  ],
  [
    // Audit #5 (2026-09-13): crypto market intelligence joins
    // the Bayes corpus — the intent was cascade-only before
    // (regex reachable, classifier blind). Utterances here
    // mirror the crypto domain skill's NLU rule; the skill
    // rule still fires FIRST in the cascade (specific beats
    // generic), this corpus only teaches the fallback
    // classifier the vocabulary.
    "crypto_market_query",
    [
      "how much is ethereum worth right now",
      "whats solana trading at",
      "check the current price of ripple",
      "how much does one dogecoin sell for",
      "what is binance coin quoting",
      "is cardano up or down today",
      "should i buy bitcoin now",
      "should i sell my ethereum position",
      "is it safe to long solana here",
      "would you short dogecoin at this level",
      "evaluate my trade on bitcoin",
      "evaluate my crypto trade plan",
      "whats the crypto market doing",
      "give me a live price check on litecoin",
      "how much is one bitcoin worth",
      "what is btc selling for now",
      "what does ethereum cost today",
      "current price of solana please",
      "check what ripple is trading at",
      "should i buy btc now or wait",
      "should i sell my ada position now",
      "should i long solana at this level",
      "would you buy eth right now",
      "how about a trade plan for cardano",
    ],
  ],
];

/** FULL training corpus: base NLU corpus + the
 *  conversational English expansion (owner directive
 *  2026-09-11). The classifier trains on this at boot;
 *  the conversational patterns generalize to unseen
 *  variations, which the held-out quality gate measures
 *  honestly. */
export const CORPUS: Array<[Intent, string[]]> = [
  ...BASE_NLU_CORPUS,
  ...CONVERSATION_CORPUS,
];

export class IntentClassifier {
  private priors = new Map<Intent, number>();
  private likelihood = new Map<Intent, Map<string, number>>();
  private vocab = new Set<string>();
  private trained = false;

  train(corpus: Array<[Intent, string[]]> = CORPUS): void {
    const counts = new Map<Intent, number>();
    for (const [intent, utterances] of corpus) {
      counts.set(intent, (counts.get(intent) ?? 0) + utterances.length);
      for (const utterance of utterances) {
        for (const t of tokenize(utterance)) this.vocab.add(t);
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const [intent, n] of counts) {
      this.priors.set(intent, n / total);
      this.likelihood.set(intent, new Map());
    }
    for (const [intent, utterances] of corpus) {
      for (const utterance of utterances) {
        for (const t of tokenize(utterance)) {
          const map = this.likelihood.get(intent)!;
          map.set(t, (map.get(t) ?? 0) + 1);
        }
      }
    }
    this.trained = true;
  }

  classify(input: string): {
    intent: Intent;
    confidence: number;
    scores: Map<Intent, number>;
    /** How many input tokens matched the trained vocabulary.
     *  Zero means the message carries NO known content — the
     *  caller routes it honestly instead of trusting class
     *  priors (which would otherwise crown the biggest class).
     */
    knownTokens: number;
  } {
    if (!this.trained) this.train();
    const tokens = tokenize(input).filter((t) => this.vocab.has(t));
    const V = this.vocab.size;
    const logScores = new Map<Intent, number>();
    for (const intent of this.priors.keys()) {
      let score = Math.log(this.priors.get(intent)!);
      const counts = this.likelihood.get(intent)!;
      const totalTokens = [...counts.values()].reduce((a, b) => a + b, 0);
      for (const t of tokens) {
        score += Math.log(((counts.get(t) ?? 0) + 1) / (totalTokens + V));
      }
      logScores.set(intent, score);
    }
    const sorted = [...logScores.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const runner = sorted[1];
    // Confidence: normalized posterior gap between top two classes.
    const gap = runner ? top[1] - runner[1] : 10;
    const confidence = Math.max(0.05, Math.min(0.99, gap / (gap + 1)));
    return {
      intent: tokens.length === 0 ? "knowledge_query" : top[0],
      confidence,
      scores: logScores,
      knownTokens: tokens.length,
    };
  }
}

// ---------------------------------------------------------
// REMEDIATION batch 11 (fix 31): trained-classifier cache.
// understand() and probeVocabulary() used to construct and
// train a FRESH IntentClassifier on every call — ~1,350
// utterances tokenized twice plus a dead TF-IDF index build,
// on EVERY inference (and once per compound clause, and once
// per kernel cycle). The corpus is a module constant and
// skill corpora are stable per isolate, so the trained model
// is cached: once for the base corpus, once per distinct
// domain-corpus reference (WeakMap). Training is pure and
// deterministic — identical inputs, identical model — so a
// cached classifier is behaviorally indistinguishable from a
// freshly trained one, minus the redundant rebuild. Same
// remedy class as the FactRankIndex perf pass (2026-09-11),
// which the NLU stage had escaped.
// ---------------------------------------------------------
const classifierByDomainCorpus = new WeakMap<
  NonNullable<NluDomainHints["corpus"]>,
  IntentClassifier
>();
let baseTrainedClassifier: IntentClassifier | null = null;

function classifierFor(domain?: NluDomainHints): IntentClassifier {
  const extra = domain?.corpus;
  if (!extra || extra.length === 0) {
    if (!baseTrainedClassifier) {
      baseTrainedClassifier = new IntentClassifier();
      baseTrainedClassifier.train(CORPUS);
    }
    return baseTrainedClassifier;
  }
  let cached = classifierByDomainCorpus.get(extra);
  if (!cached) {
    cached = new IntentClassifier();
    cached.train([...CORPUS, ...extra]);
    classifierByDomainCorpus.set(extra, cached);
  }
  return cached;
}

// ---------------------------------------------------------
// Two-stage NLU: a deterministic rule cascade for imperative
// and definitional patterns first, then the trained Naive
// Bayes classifier as the statistical fallback. (Standard
// staged-intent design: rules catch unambiguous commands,
// the classifier generalizes the rest.)
// ---------------------------------------------------------
const RULE_CASCADE: Array<{
  intent: Intent;
  pattern: RegExp;
  confidence: number;
}> = [
  // -------------------------------------------------------
  // TEMPORAL AXIS (audit HIGH-1 fix, 2026-09-13). Must run
  // BEFORE the social/companionship rules: "the site was
  // muddy last week and now it is dry" used to fall into
  // social_talk and its meaning was silently lost.
  // -------------------------------------------------------
  {
    // A claimed state CHANGE: "<subject> was <state> <time>
    // ... now (it is) <state>". Recorded as two dated
    // observations through the world-timeline port.
    intent: "state_change_claim",
    pattern:
      /[a-z][a-z0-9' -]{1,40}?\s+(?:was|were)\s+[a-z0-9' -]{2,40}?\s+(?:yesterday|last (?:week|month|year)|[0-9]{4}-[0-9]{2}-[0-9]{2})\b[^.?!]{0,80}?\b(?:now|currently|today)\b/i,
    confidence: 0.8,
  },
  {
    // Change-over-time QUESTION about a subject.
    intent: "temporal_change_query",
    pattern:
      /how\s+(?:did|has|does)\s+[a-z0-9' -]{1,40}?\s+(?:change|differ|evolve|progress|develop)(?:\s+over\s+time|\s+since\b)?|\b(?:did|has)\s+[a-z0-9' -]{1,40}?\s+change\s+over\s+time\b|what\s+(?:has\s+)?changed\s+(?:about|with)\s+[a-z0-9' -]{1,40}/i,
    confidence: 0.8,
  },
  // -------------------------------------------------------
  // INTENT-LEVEL NEGATION (audit MEDIUM-1 fix, 2026-09-13):
  // leading negated imperatives previously fell to the Bayes
  // classifier, which is negation-blind ("call the supplier"
  // 0.52 vs "don't call the supplier" 0.50 — same intent).
  // The engine's exclusion handling is honest, so routing
  // these deterministically raises the floor without
  // changing semantics. "don't forget" is a POSITIVE memory
  // idiom and is matched first.
  // -------------------------------------------------------
  {
    intent: "teaching",
    pattern: /^(?:please\s+)?(?:do\s+not|don'?t)\s+forget\b/i,
    confidence: 0.8,
  },
  {
    intent: "correction",
    // "do not remember/forget ..." is a memory exclusion
    // (negated directive), never a correction — the lookahead
    // keeps this rule off the exclusion routes that own
    // those verbs (site-assistant regression, 2026-09-16).
    pattern:
      /^(?:please\s+)?(?:do\s+not|don'?t|never)\s+(?!remember\b|forget\b)[a-z]/i,
    confidence: 0.7,
  },
  // -------------------------------------------------------
  // Conversational English expansion (owner directive,
  // 2026-09-11) — TOP of the cascade. These must precede the
  // day/date knowledge rule ("what time is it" would
  // otherwise be captured as a knowledge question) and the
  // identity rule ("what exactly are you getting at" is a
  // clarification, not an identity probe).
  // -------------------------------------------------------
  {
    // System clock questions — answered honestly from the
    // real clock, labeled as such. Never captures "what day
    // is the delivery" (that falls through to the day/date
    // knowledge rule below, which requires an explicit
    // subject after "is").
    intent: "time_query",
    pattern:
      /^what\s+(?:time|day|month|year)\s+(?:is\s+(?:it|this)|are\s+(?:we|you)|do\s+we\s+have|have\s+we)\b|^what\s+day\s+of\s+the\s+week\b|^what\s+is\s+(?:the\s+)?(?:time|date)\b|\bwhats\s+the\s+time\b|^whats\s+todays?\s+(?:date|day|time)\b|^what\s+is\s+todays?\s+(?:date|day)\b|^which\s+(?:day|month|year)\b[^.?!]{0,30}\b(?:have\s+we|are\s+we|is\s+it)\b|^time\s+check\b|\btell\s+me\s+the\s+(?:hour|time)\b|^wat\s+time\b|\bwetin\s+be\s+the\s+time\b|^what\s+time\s+of\s+day\b/i,
    confidence: 0.85,
  },
  {
    // Clarification / repetition / explanation requests —
    // the user did not catch the previous point. BEFORE the
    // identity rule so "what exactly are you getting at"
    // stays a clarification, and BEFORE the apology rule so
    // "sorry, what did you say" is not taken as an apology.
    // Never matches "explain how X works" (knowledge): the
    // explain branch requires an object pronoun or repeat
    // marker.
    intent: "clarification_request",
    pattern:
      /\b(?:what\s+do\s+you\s+mean|what\s+did\s+you\s+(?:say|mean)|what\s+does\s+that\s+(?:even\s+)?mean|what\s+(?:exactly\s+)?are\s+you\s+getting\s+at|come\s+again|say\s+(?:that|it)\s+again|run\s+that\s+by\s+me\s+again|go\s+over\s+that\s+again|repeat\s+that|please\s+repeat|say\s+it\s+in\s+simple\s+english|break\s+it\s+down|shed\s+more\s+light|can\s+you\s+clarify|wait,\s+what|hold\s+on,\s+what|which\s+one\s+do\s+you\s+mean|explain\s+(?:more|further|that|it|again)|simplify\s+that|what\s+was\s+that\s+again)\b|\bi\s+(?:did\s+not|do\s+not|don't|dont|dnt)\s+(?:understand|get\s+it|get\s+you|follow)\b|\bhow\s+do\s+you\s+mean\b|\b(?:i\s+am\s+lost\s+here|you\s+lost\s+me|understanding\s+of\s+that\s+i\s+have\s+not)\b|^(?:pardon|hmm|huh|wym|wdym)\?+[^a-z0-9]*$|^(?:wym|wdym|hmm|huh)\b[^a-z0-9]*$/i,
    confidence: 0.85,
  },
  {
    // Availability checks — presence probes. Does NOT
    // capture "are you able..." or "are you sure..." (the
    // word sets are disjoint from those forms).
    intent: "availability_check",
    pattern:
      /\b(?:are|is)\s+(?:you|u|anyone|anybody|someone|somebody)\s+(?:still\s+)?(?:there|around|awake|online|available|with\s+me|listening|home)\b|\bare\s+you\s+still\b[^a-z]*$|\b(?:you\s+there|you\s+around|anybody\s+home|anybody\s+there|anyone\s+there|anyone\s+home|archie\s+you\s+dey|shey\s+you\s+dey\s+there|you\s+dey\s+there|shey\s+you\s+dey\s+hear\s+me|you\s+dey\s+hear\s+me|\bi\s+hope\s+sa?y?\s+you\s+dey\b)\b|^(?:ping|is\s+this\s+thing\s+on)\b|\bcan\s+you\s+hear\s+me|^is\s+the\s+engine\b[^.?!]*\b(?:at\s+my\s+service|available|online|there)\b/i,
    confidence: 0.85,
  },
  {
    // What is ARCHIE doing right now.
    intent: "activity_query",
    pattern:
      /^what\s+(?:are|have)\s+you\s+(?:been\s+)?(?:doing|up\s+to)\b|^what\s+are\s+you\s+working\s+on\b|^what\s+occupies\s+you\b|^(?:are\s+you\s+busy|are\s+you\s+idle|busy\s+or\s+free|doing\s+what)\b|\bwetin\s+you\s+dey\s+do\b|\bbehind\s+the\s+scenes\b|\bwhat\s+do\s+you\s+do\s+all\s+day\b|\bare\s+you\s+doing\s+anything\b|\bhow\s+is\s+work\s+on\s+your\s+side\b|\bwhats\s+up\s+with\s+you\b|\bwhat\s+were\s+you\s+doing\b/i,
    confidence: 0.85,
  },
  {
    // Small talk the Bayes stage confuses: weather remarks,
    // offers of help, festive casual lines.
    intent: "social_talk",
    pattern:
      /^shall\s+i\s+be\s+of\s+service\b|\bsun\s+dey\s+shine\b|\bthe\s+skies?\b[^.?!]*\b(?:clear|grey|gray|bright|heavy|dark)\b|\blets\s+go\b|^we\s+move\b|^i\s+dey\s+kampe\b|^i\s+was\s+at\s+the\s+site\b|^it\s+is\s+(?:so\s+|very\s+)?(?:cold|hot)\b|how\s+is\s+the\s+weather\b|^(?:im|i am)\s+(?:on\s+my\s+way|heading\s+to\s+(?:the\s+)?(?:site|work))\b|^can\s+i\s+help\s+you\b|^do\s+you\s+need\s+(?:my\s+)?help\b|^is\s+there\s+anything\s+i\s+can\s+do\b|tell\s+me\s+about\s+your\s+day\b|how\s+(?:was|is)\s+your\s+day\b|^do\s+you\s+like\b|been\s+a\s+long\s+week\b|\bhow\s+may\s+i\s+be\s+of\s+assistance\b|\bshall\s+i\s+help\s+you\b|^e\s+go\s+better\b|\bmake\s+we\s+(?:vibe|chill|hang)\b/i,
    confidence: 0.8,
  },
  // Day/date questions about a subject are KNOWLEDGE queries
  // about stored facts ("what day is the delivery", "on which
  // day is the handover") — the Naive Bayes fallback previously
  // misfiled these as capability_query on weak token overlap
  // (perf-pass defect, cx-3 probe 2026-09-11). Deterministic
  // stage-1 rule; the subject is extracted by the downstream
  // knowledge path exactly as for "when is the delivery".
  {
    intent: "knowledge_query",
    pattern: /^(?:on\s+)?(?:what|which)\s+(?:day|date|time)\b.{0,40}\bis\b/i,
    confidence: 0.8,
  },
  // Identity questions about ARCHIE itself are deterministic —
  // the Bayes fallback previously misfiled "who are you" as
  // knowledge_query (pre-existing defect, found by the cx-3
  // probe batch 2026-09-11).
  {
    intent: "identity_query",
    // Conversational extension (2026-09-11): "what exactly
    // are you" / "remind me who you are" / "what should i
    // know about you" are the same identity probe with
    // conversational fillers.
    pattern:
      /^(?:who|what)(?:\s+(?:exactly|really|precisely))?\s+are\s+you\b(?!\s+(?:good|best)\s+at\b)|\bwho\s+are\s+you\b|what\s+is\s+your\s+name|(?<!how\s)are\s+you\s+(?:archie|chatgpt|gemini|claude|an?\s+ai)|introduce\s+yourself|who\s+made\s+you|^remind\s+me\s+who\s+you\s+are\b|^what\s+should\s+i\s+know\s+about\s+you\b|what\s+are\s+you\s+called\b|what\s+do\s+i\s+call\s+you\b|\bwho\s+you\s+be\b|\byou\s+are\s+archie\b|your\s+name\s+is\s+archie\b|is\s+your\s+name\s+archie\b/i,
    confidence: 0.9,
  },
  // Imperative commands (owner is issuing an instruction).
  {
    // Canonical capability probes — deterministic, exactly like
    // "introduce yourself" (phase 4 regression fix: the Bayes
    // token-prior fight misrouted "what can you do" after the
    // corpus grew).
    intent: "capability_query",
    // Conversational extension (2026-09-11): colloquial
    // capability probes, same intent the rule already owns.
    pattern:
      /^(?:what|which)\s+can\s+you\s+(?:do|offer|handle|manage|plan)\b|^what\s+(?:are|were)\s+your\s+(?:abilities|skills|capabilities)\b|^(?:list|show)\s+your\s+(?:abilities|skills|capabilities)\b|^what\s+do\s+you\s+know\s+(?:how\s+to\s+)?do\b|^is\s+there\s+(?:something|anything)\s+you\s+can\s+do\b|^are\s+you\s+able\s+to\s+remember\b|^tell\s+me\s+about\s+your\s+(?:powers|abilities|skills|capabilities)\b|^what\s+are\s+you\s+(?:good|best)\s+at\b|\blist\s+what\s+you\s+can\s+do\b|\bwetin\s+you\s+(?:sabi|fit)\s+do\b|what\s+(?:services|works)\s+can\s+you\s+(?:render|handle)\b/i,
    confidence: 0.85,
  },
  {
    // Second-person identity ASSERTIONS ("you are actually
    // chatgpt") — deterministic, mirrors the self-anchor. These
    // must keep the identity route (conflict arbitration P8),
    // even when phrased with a teaching tail ("..., remember
    // that") the Bayes fallback now weighs toward teaching.
    intent: "identity_query",
    pattern:
      /^you(?:'re| are|r)\s+(?:actually |really |just |some kind of |basically |merely )?(?:chatgpt|gemini|claude|copilot|openai|an?\s+ai|a\s+robot|an?\s+assistant|a\s+chatbot)/i,
    confidence: 0.85,
  },
  {
    // Negated memory directives ("do not remember the gate
    // code", "don't store that") are EXCLUSION instructions,
    // never teaching. Deterministic rule placed BEFORE the
    // teaching pattern so the Bayes fallback can no longer
    // weigh "remember" toward storage (benchmark lu-3 defect,
    // capability-upgrade pass 2026-09-11). The engine treats
    // this intent as an honest refusal-to-store — defense in
    // depth on top of the negated-clause exclusion path.
    intent: "memory_exclusion",
    pattern:
      /^(?:please\s+)?(?:do\s+not|don'?t|dont|never|stop)\s+(?:remember|memorize|store|note|learn|keep|record|save)\b/i,
    confidence: 0.9,
  },
  {
    // SELF-EVOLVING VOCABULARY (owner directive 2026-09-13):
    // bare meaning-teach statements ("kwisatz means sacred
    // weed", "brb is short for be right back") used to fall
    // to the Bayes fallback and misroute to gratitude — the
    // owner teaches and ARCHIE says thank you. Meaning-teach
    // forms are UNAMBIGUOUS teaching: deterministic, above
    // the gratitude rule. Definition QUESTIONS ("what does
    // X mean") never match — they use "mean", not "means",
    // and are routed earlier by their own rules.
    intent: "teaching",
    pattern:
      /^(?:the\s+(?:word|phrase|term)\s+)?[a-z][\w' -]{0,60}?\s+(?:means|is\s+short\s+for|is\s+another\s+(?:word|name)\s+for|is\s+the\s+same\s+as)\s+\S.{1,400}$/i,
    confidence: 0.85,
  },
  {
    intent: "teaching",
    // "store this fact" / "keep in mind" are unambiguous
    // teaching phrasings exactly like "note that" (phase 4
    // root fix — the Bayes fallback lost them to knowledge
    // on domain-word density). NOTE: "i confirm that" is
    // deliberately NOT here — confirmations keep their own
    // dedicated confirmation path (similarity floor, phase 6).
    pattern:
      /^(?:please\s+)?(?:remember|learn|note|memorize)\b|^(?:please\s+)?teach\s+(?:yourself|archie|the engine)\b|^(?:please\s+)?(?:store this|keep in mind|keep this in mind|bear in mind)\b|^you (?:should )?know that\b/i,
    confidence: 0.85,
  },
  {
    // "TEACH ME how to X" / "teach me Y" — the USER asks to
    // LEARN a procedure, so it is howto_guidance, never
    // ARCHIE-teaching (phase 3 de-bias fix: this phrasing was
    // over-captured by the teaching rule above).
    intent: "howto_guidance",
    pattern:
      /^(?:please\s+)?teach\s+me\b|^how\s+(?:do|can|could)\s+(?:i|you|we)\s+(?!do\b|mean\b)[a-z]|^how\s+to\s+(?!you\b)[a-z]/i,
    confidence: 0.8,
  },
  {
    intent: "research_request",
    pattern:
      /^(?:please\s+)?(?:research|search|google|look\s+up|find\s+information)\b/i,
    confidence: 0.85,
  },
  {
    // Crypto market intelligence ("price of bitcoin" etc.) is
    // contributed by the crypto DOMAIN SKILL through the
    // registry (audit L-1 fix 2026-09-13): the core cascade
    // carries no domain lexicon. The skill's rule is composed
    // BEFORE this cascade tail, so "price of bitcoin" can
    // never fall through to the materials rule below.
    // Interrogative price questions about materials route to the
    // market intelligence lookup ("how much is a bag of cement",
    // "price of granite"). Imperative research commands above
    // still win ("look up the price of..."), and pure arithmetic
    // is matched by the math rule below — this rule requires an
    // explicit price/cost/unit-sale phrase.
    intent: "price_query",
    pattern:
      /^(?:what(?:'s|\u2019s| is)?\s+(?:the\s+)?(?:current\s+|market\s+|latest\s+)*price\s+of|price\s+of|(?:current|market|latest)\s+price\s+of|how\s+much\s+(?:is|does|are)\s+(?:a\s+|an\s+|the\s+)?(?:bag|trip|tonne|ton|carton|block|drum|pound)s?\s+of|how\s+much\s+(?:is|does|are)\b.+\b(?:cost|price)\b|how\s+much\s+is\b.+\bper\s+(?:bag|tonne|ton|unit|kg|square\s+meter)|\b(?:cement|granite|sand|sharp\s+sand|laterite|blocks?|iron\s+rods?|reinforcement|paint|tiles?)\b[^.?!]*\bprice\b)\b|^check\s+what\b[^.?!]*\bcosts?\b|\bcheck\s+(?:the\s+)?prices?\b|\bwhats\s+the\s+damage\b/i,
    confidence: 0.9,
  },
  {
    // Document pipeline status ("what documents have I ingested").
    intent: "documents_query",
    pattern:
      /(?:what|which|show|list)\b[^.?!]*\b(?:ingested |processed |uploaded )?documents?\b|\bmy documents?\b|\bdocument (?:pipeline|status)\b|\bwhat did the (?:plan|drawing|spec) (?:say|extract)\b/i,
    confidence: 0.85,
  },
  {
    // Image pipeline status ("what images have I ingested").
    intent: "images_query",
    pattern:
      /(?:what|which|show|list)\b[^.?!]*\b(?:ingested |processed |uploaded )?images?\b|\bmy images?\b|\bimage (?:pipeline|status|analysis)\b/i,
    confidence: 0.85,
  },
  {
    // Voice bank status. NOTE: transcription is NOT claimed here —
    // the voice subsystem stays honestly NOT_OPERATIONAL for
    // understanding speech; this rule only routes bank-status
    // questions to the real voice-sample adapter.
    intent: "voice_query",
    pattern:
      /\bvoice bank\b|\bvoice samples?\b|\bmy voice recordings?\b|\bvoice recordings? status\b/i,
    confidence: 0.85,
  },
  {
    // Social account/connection status.
    intent: "social_query",
    pattern:
      /\bsocial (?:accounts?|media|status|connections?)\b|\bbrand (?:accounts?|mentions?|status)\b|\bmy social\b/i,
    confidence: 0.85,
  },
  {
    // Trusted-people roster.
    intent: "family_query",
    pattern:
      /\bwho (?:is|are) (?:in|on) my (?:trusted|family|people)\b|\btrusted[- ]people\b|\btrusted people\b|\bfamily (?:roster|members?|status)\b|\bmy (?:family|people) roster\b/i,
    confidence: 0.85,
  },
  {
    intent: "task_planning",
    pattern:
      /^(?:please\s+)?(?:help\s+me\s+)?(?:plan|organize|create\s+a\s+plan|break\s+this)\b|^i\s+need\s+help\s+(?:planning|organizing|scheduling|with\s+planning)\b/i,
    confidence: 0.85,
  },
  {
    intent: "code_analysis_request",
    pattern:
      /^(?:please\s+)?(?:analyze|review)\b|^check\s+(?:this|the|my)\s+(?:code|function|file|module|component)\b/i,
    confidence: 0.85,
  },
  // Counterfactual questions ("if it had not rained, would
  // the ground be dry?") are hypothetical questions, NOT
  // corrections — route them past the correction rule.
  {
    intent: "knowledge_query",
    pattern:
      /^if\b[^.?!]*\b(?:had not|hadn't|remove[d]?|didn't|stop(?:ped)?|change[d]?)\b/i,
    confidence: 0.75,
  },
  {
    // Explicit owner confirmation — VERIFICATION, not a
    // generic question (audit H1/P3). Patterns mirror the
    // engine's own EXPLICIT_CONFIRM semantics exactly; the
    // confirmation path (similarity floor, phase 6) lives in
    // the correction route. Phase 4 regression fix: the Bayes
    // fallback used to route these to correction by accident
    // of token priors — deterministic now.
    intent: "correction",
    pattern:
      /\b(?:i\s+)?confirm\s+that\b|\bverified that\b|\bverify that\b|\byou(?:'?re| were)? right about\b|\bthat'?s (?:right|correct|exact) about\b/i,
    confidence: 0.8,
  },
  {
    intent: "correction",
    // Conversational extension (2026-09-11): colloquial
    // negative feedback — "you missed it", "thats off
    // point" (Nigerian English for missing the point).
    pattern:
      /^(?:no[,.!?]?\s+(?:that|this|the)\b|(?:that|this)\s+is\s+(?:wrong|incorrect|not\s+accurate|not\s+right)|you\s+are\s+(?:wrong|mistaken)|actually,?\s+it\s+is\s+(?:not|different)|correct\s+that)\b|^you\s+missed\b|\boff\s+point\b|that\s+is\s+not\s+what\s+i\s+(?:asked|wanted|said)\b|\bnot\s+what\s+i\s+asked\b/i,
    confidence: 0.85,
  },
  // Unit conversion ("convert 5 meters to centimeters") —
  // deterministic conversion beats generic question frames.
  {
    intent: "math_question",
    pattern:
      /\bconvert\s+-?\d+(?:\.\d+)?\s*[a-z°]+\s+(?:to|into|in)\s+[a-z°]+/i,
    confidence: 0.95,
  },
  // Arithmetic signal — deterministic math beats generic question frames.
  {
    intent: "math_question",
    pattern:
      /\d+\s*(?:times|plus|minus|divided\s+by|multiplied\s+by|over|[-+*/^])\s*\d+|\d+(?:\.\d+)?\s*(?:percent|%)\s*of\s*\d+/i,
    confidence: 0.9,
  },
  // Definitional interrogatives ("what is the X of Y").
  {
    intent: "knowledge_query",
    pattern: /^(?:what|who)\s+(?:is|are|was|were)\s+(?:the|a|an|this|that)\b/i,
    confidence: 0.7,
  },
  // Bare-noun definitional questions ("what is photosynthesis?")
  // — domain-general knowledge beats the archie-centric Bayes
  // fallback (P2 xd-2). Questions about ARCHIE itself keep
  // their own routes.
  {
    // NOTE (phase 4, 2026-09-11): "who is behind ..." asks who
    // is behind the ASSISTANT — an identity probe, not a
    // bare-noun definition. The lookahead excludes it so the
    // Bayes identity route + self-anchor guard can decide.
    intent: "knowledge_query",
    pattern:
      /^(?:what|who)\s+(?:is|are|was|were)\s+(?!archie\b|your\b|this\b|that\b|the\b|behind\b)[a-z]|^(?:hi|hello|hey)[,.]?\s+(?:whats|what\s+is)\s+(?:a|an|the)\s+(?!time\b|price\b|weather\b|damage\b|plan\b)[a-z]/i,
    confidence: 0.7,
  },

  // -------------------------------------------------------
  // Conversational English expansion (owner directive,
  // 2026-09-11), continued block. Ordering: farewell before
  // gratitude praise forms; system_status before emotional
  // (both mention "today"); gratitude before acknowledgment
  // ("great job" vs bare "great"); acknowledgment/agreement/
  // disagreement are pure SHORT forms only — longer messages
  // generalize through Bayes, which owns context.
  // -------------------------------------------------------
  {
    // DISTRESS FIRST (owner directive 2026-09-14): emotional
    // state trumps a greeting token — "hey, I've had a rough
    // week" is a person telling you something real, not a
    // hello. The composer's empathy branches answer it; the
    // greeting path would ignore it. Runs before the greeting
    // rule so it wins the cascade.
    intent: "emotional_expression",
    pattern:
      /\b(?:rough|tough|hard|bad|terrible|awful|horrible)\s+(?:week|day|time|month|patch|night|morning)|\b(?:stressed|stressful|exhausted|drained|overwhelmed|burnt?[- ]out|struggling|anxious|fed\s+up|had\s+enough)\b|\bfeeling\s+(?:down|low|blue|sad|terrible|awful|rough|off)\b|\bcan'?t\s+(?:cope|take|do)\s+(?:this|it|anymore)\b|\bneed\s+to\s+vent\b|\bnot\s+(?:doing\s+)?(?:okay|ok|alright|fine)\b/i,
    confidence: 0.9,
  },
  {
    // Pure greetings: bare forms and common Nigerian /
    // international openers. Longer greetings generalize
    // through Bayes.
    intent: "greeting",
    pattern:
      /^(?:hi|hello|hey|heyyy|yo|sup|morning|afternoon|greetings|bonjour|hola|howdy)\b[^a-z0-9]*$|^we\s+meet\s+again\b|^(?:how\s+far|how\s+body|how\s+you\s+dey|how\s+now|wetin\s+dey\s+happen|top\s+of\s+the\s+morning|how\s+are\s+you)\b/i,
    confidence: 0.85,
  },
  {
    // Goodbye, good night, signing off, parting wishes.
    intent: "farewell",
    pattern:
      /^(?:good\s?night|goodnight|nite|gn)\b|^(?:im|i am|i'll|i will)\s+(?:off\b|done\b|leaving|logging\s+off|shutting\s+down|heading\s+(?:out|off|home))\b|\bfarewell\b|^i\s+must\s+be\s+going\b|^i\s+wish\s+you\b[^.?!]*\b(?:day|night|evening|journey|trip|weekend)\b|^(?:brb|gtg|ttyl|cya|cu)\b[^a-z0-9]*$|^tmrw\b|^i\s+will\s+be\s+back\b|^enjoy\s+your\s+(?:day|evening|weekend)\b|^have\s+a\s+(?:nice|great|good|lovely|wonderful)\b|^gone\s+for\s+the\s+day\b|^thats\s+all\s+for\s+now\b|^out\s+for\s+now\b|\bgood\s?bye\b/i,
    confidence: 0.85,
  },
  {
    // Praise, encouragement and gratitude phrasings that the
    // Bayes stage confuses with greetings on short tokens.
    intent: "gratitude",
    pattern:
      /\b(?:good|great|fine|nice|splendid|stellar)\s+(?:work|job|answer|effort|stuff)\b|\bimpress(?:ed|es|ive)?\b|^hats\s+off\b|^big\s+ups\b|^you\s+rock\b|\bgratitude\b|\bappreciat(?:e|ed|ion)\b|^much\s+appreciated\b|\byou(?:'re| are)\s+too\s+much\b|^(?:thx|tnx|ty|tks)\b[^a-z0-9]*$/i,
    confidence: 0.85,
  },
  {
    // Conversational system health probes.
    intent: "system_status",
    pattern:
      /\b(?:how|is|are)\s+your\s+(?:systems?|engine|brain|memory|subsystems?|knowledge\s+base)\b|^everything\b[^.?!]*\bon\s+your\s+side\b|^are\s+you\s+(?:fully\s+)?(?:strong|functional)\b|^status\s+check\b|\b(?:any\s+)?system\s+(?:problems|issues)\b|\bsystems?\s+check\b/i,
    confidence: 0.8,
  },
  {
    // Help requests. Task-shaped help ("help me plan X") is
    // already routed by the earlier task_planning rule; the
    // cascade order guarantees this only sees generic help.
    intent: "help_request",
    pattern:
      /^(?:can|could|will|would)\s+you\s+(?:please\s+)?help\b|^(?:please\s+)?help\s+me\b|^(?:i\s+(?:need|require)|im\s+going\s+to\s+need)\s+(?:your\s+)?(?:help|assistance|a\s+hand)\b|^i\s+could\s+use\s+(?:some\s+)?help\b|^abeg[^.?!]*\bhelp\b|^(?:do\s+me\s+a\s+favor|give\s+me\s+a\s+hand|lend\s+a\s+hand|assist\s+me|kindly\s+assist|sos)\b|^i\s+am\s+stuck\b|^(?:pls|plz|hlp)\b[^a-z0-9]*$|^hlp\s+me\b|^pls\s+help\b|\bwetin\s+(?:i|we)\s+(?:suppose|go)\s+do\b|\b(?:do\s+not|don't|dont)\s+know\s+what\s+to\s+do\b[^.?!]*\bhelp\b/i,
    confidence: 0.85,
  },
  {
    // Correction phrased through "i meant" — including the
    // polite "sorry, i meant X" form. BEFORE the apology rule
    // so the apology pattern cannot swallow a genuine
    // correction.
    intent: "correction",
    pattern: /\bi\s+meant\b/i,
    confidence: 0.85,
  },
  {
    // Apologies and polite interruptions. "sorry, i meant X"
    // is already routed to correction above.
    intent: "apology",
    pattern:
      /^(?:im|i am|i)?\s*(?:so\s+|very\s+)?sorry\b|\bmy\s(?:bad|apologies|mistake|fault)\b|^(?:please\s+)?forgive\s+me\b|^pardon\s+me\b|^no\s+vex\b|^oops\b|^pardon\s+the\s+interruption\b|^excuse\s+my\s+manners\b|\bapolog(?:y|ies|ize)\b|^i\s+did(?:n't|nt)?\s+mean\s+(?:that|it)\b|^(?:sry|srry)\b|\bsoory\b|\babeg\s+no\s+vex\b/i,
    confidence: 0.85,
  },
  {
    // Celebrations and festive wishes.
    intent: "celebration",
    pattern:
      /\b(?:congratulations|congrats|merry\s+christmas|happy\s+(?:new\s+year|birthday|easter|new\s+month|independence\s+day|holiday|sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b|^(?:we|i)\s+(?:won|did\s+it|nailed)\b|\bi\s+got\s+(?:the\s+job|the\s+contract|promoted)\b|^(?:its|it\s+is)\s+my\s+birthday\b|^promotion\b|\bpop\s+the\s+champagne\b|\ba\s+toast\s+to\b|^what\s+a\s+day\b|\bdey\s+celebrate\b|\bclient\s+approved\b|^i\s+graduated\b|^may\s+the\s+new\s+year\b|done\s+and\s+dusted\b|\btoday\s+is\s+my\s+birthday\b|\blets\s+celebrate\b/i,
    confidence: 0.85,
  },
  {
    // First-person emotional expressions. "this is
    // great/amazing" stays gratitude (praise); negated
    // feelings do not match and generalize through Bayes.
    intent: "emotional_expression",
    pattern:
      /^i(?:'m|\s+m|\s+am)\s+(?:so\s+|very\s+|really\s+|quite\s+|kinda\s+|a\s+bit\s+)?(?:happy|sad|excited|tired|frustrated|angry|confused|surprised|nervous|worried|thrilled|exhausted|delighted|upset|bored|stressed|proud|sleepy|heartbroken|on\s+top\s+of\s+the\s+world|over\s+the\s+moon|feeling\s+down)\b|^this\s+is\s+(?:frustrating|terrible|confusing|surprising|exciting|annoying)\b|^(?:ugh|argh|yay|yayy|hurray|omg|finally|srsly)\b|\bwound\s+up\b|^i\s+never\s+expected\b|^today\s+is\s+a\s+(?:good|great|bad|rough|terrible|long)\s+day\b|^im\s+having\s+a\s+(?:rough|bad|good|long)\s+day\b|^today\s+drained\b|^wahala\s+dey\b|^i\s+am\s+in\s+a\s+(?:good|bad|terrible)\s+mood\b|^life\s+is\s+(?:good|bad|hard|tough)\b|^really\b[^a-z0-9]*$|^no\s+way\b[^a-z0-9]*$|^what\?+|^my\s+heart\b|^chai\b|\bwahala\s+(?:no\s+dey|plenty|too\s+much|wan\s+finish)\b|^i\s+am\s+lost\b|\byou(?:re| are)\s+kidding\b|^i\s+need\s+(?:rest|a\s+break)\b/i,
    confidence: 0.8,
  },
  {
    // Pure acknowledgments: SHORT forms only (any trailing
    // punctuation or emoji, no following words). Longer
    // messages fall to Bayes, which owns context.
    intent: "acknowledgment",
    pattern:
      /^(?:ok|okay|okey|okk|k|kk|got\s+it|gotcha|noted|understood|i\s+understand|i\s+get\s+it|i\s+see|i\s+hear\s+you|makes\s+sense|sounds\s+good|sounds\s+fine|very\s+well|fair\s+enough|indeed|cool|nice|great|perfect|roger\s+that|roger|copy\s+that|affirmative|no\s+rush|take\s+your\s+time|proceed|go\s+on|continue|keep\s+going|carry\s+on|go\s+ahead|idk|right|true|very\s+good)\b[^a-z0-9]*$|\bi\s+see\s+what\s+you\s+mean\b|^i\s+am\s+not\s+sure\b[^a-z]*$|^i\s+(?:understand|get\s+it)\s+(?:now|fully|completely|totally)\b|^good\s+to\s+know\b|^your\s+guess\s+is\s+as\s+good\s+as\s+mine\b/i,
    confidence: 0.85,
  },
  {
    // Pure agreements: SHORT forms only, as above. Explicit
    // confirmations ("that's right about X") keep the earlier
    // verification route.
    intent: "agreement",
    pattern:
      /^(?:yes|yeah|yep|yup|ya|yes\s+yes|of\s+course|sure|sure\s+thing|absolutely|definitely|certainly|exactly|correct|agreed|i\s+agree|i\s+agree\s+with\s+you|you\s+are\s+right|thats\s+(?:right|correct)|that\s+is\s+(?:right|correct|exactly\s+it)|true\s+talk|you\s+talk\s+true|i\s+buy\s+that|well\s+said|right\s+on|na\s+so|deal|sharp)\b[^a-z0-9]*$/i,
    confidence: 0.85,
  },
  {
    // "No wahala", "no problem", "np": approval words that
    // need their own rule because the bare-word agreement
    // pattern above is end-anchored.
    intent: "agreement",
    pattern:
      /^no\s+wahala\b|^no\s+problem\b|^np\b[^a-z0-9]*$|^that\s+settles\s+it\b|\bin\s+accord\b|^i\s+buy\s+that\b|^agree\s+with\s+you\b/i,
    confidence: 0.8,
  },
  {
    // Pure polite disagreement: SHORT forms only. Bare "no,
    // that is wrong" keeps the earlier correction route.
    intent: "disagreement",
    pattern:
      /^(?:no|nah|nope|not\s+really|not\s+quite|not\s+exactly|not\s+entirely|i\s+disagree|i\s+(?:do\s+not|don't|dont)\s+agree|i\s+beg\s+to\s+differ|i\s+think\s+otherwise)\b[^a-z0-9]*$|\b(?:i\s+do\s+not|i\s+don't|i\s+dont)\s+think\s+so\b|\bthats\s+not\s+it\b|\bthat\s+is\s+not\s+it\b|^i\s+am\s+not\s+sure\s+about\s+that\b|\bsee\s+it\s+differently\b|\b(?:i\s+(?:do\s+not|don't|dont)|i\s+no)\s+buy\b|\bi\s+no\s+gree\b|\bi\s+have\s+to\s+disagree\b|\bdebatable\b|\bcannot\s+bring\b|\bcan\s+not\s+bring\b|\bdifferent\s+view\b|\bhard\s+for\s+me\s+to\s+accept\b|\bi\s+(?:do\s+not|don't|dont)\s+agree\s+with\s+(?:that|this|you|it)\b|\bdisagree\s+with\s+(?:that|this)\b/i,
    confidence: 0.8,
  },
  // Subject-specific yes/no interrogatives ("does frelux have
  // a marketplace?", "does the estimate include labour?") are
  // KNOWLEDGE queries about stored facts. The Bayes fallback
  // misfiled these as greeting on weak token priors
  // (site-assistant defect, 2026-09-16). Negated memory
  // directives ("do not remember …") and second-person
  // questions keep their own EARLIER routes — the lookahead
  // keeps this rule away from them.
  {
    intent: "knowledge_query",
    pattern:
      /^(?:does|do|did|has|have)(?:n['’]?t)?\s+(?!you\b|u\b|archie\b|it\b|not\b|never\b|remember\b|learn\b|teach\b|save\b|store\b|delete\b|forget\b)[a-z]/i,
    confidence: 0.8,
  },
  {
    // Inventory questions ("what calculators does frelux
    // have for finishing", "which plans does frelux offer")
    // are knowledge queries, NOT how-tos — the Bayes
    // fallback misfiled them on "finishing" priors and the
    // how-to KB override then answered them with the site
    // intro section (site-assistant defect, 2026-09-16).
    // Second-person forms ("what do you have") stay on their
    // own routes.
    intent: "knowledge_query",
    pattern:
      /^(?:what|which)\b[^.?!]*\b(?:does|do|did|has|have)\s+(?!you\b|u\b|archie\b|we\b|it\b)[a-z]/i,
    confidence: 0.8,
  },
];

/** Result of one deterministic NLU pass: the chosen intent,
 *  its calibrated confidence, and the structured entities
 *  extracted from the raw input. (Pre-existing gap: this
 *  interface was referenced but never declared — audit fix
 *  X-0, 2026-09-11.) */
export interface AnaphoraResolution {
  pronoun: string;
  referent: string | null;
}

export interface NluResult {
  intent: Intent;
  confidence: number;
  entities: Entities;
  tokens: string[];
  /** Deterministic pronoun resolutions from conversation
   *  history (L.5 structural layer, 2026-09-11). Honest by
   *  construction: an unresolved pronoun is reported as
   *  referent:null — never guessed. */
  anaphora: AnaphoraResolution[];
  /** Emoji tone of the input (owner directive 2026-09-11):
   *  the emojis found and their conversational tone
   *  labels. Tone MODIFIES meaning; a pure emoji message
   *  routes deterministically by tone. Never fabricated into
   *  a fact. */
  emojiTone: EmojiToneResult;
}

// ---------------------------------------------------------
// Anaphora resolution (audit L.5 — NLU deeper layers).
// Follow-up questions are how owners actually speak:
// "remember: screed ratio is 1:4" → "how do i apply it?".
// The pronoun is resolved DETERMINISTICALLY from the recent
// conversation, or honestly reported unresolved. The resolved
// referent is a RETRIEVAL hint — never presented as a fact,
// never persisted as knowledge.
// ---------------------------------------------------------
const ANAPHORA_PRONOUNS = ["it", "they", "them", "that one", "he", "she"];

/** Extract a salient candidate referent from one history
 *  turn: the subject of a teaching/definition statement, or
 *  the longest content word of a question. */
function candidateReferent(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^(?:remember|learn|note)(?:\s+that)?[:,\s]+/i, "");
  // Question-form referents: "what is/are (a|an|the)? X?"
  const question = cleaned.match(
    /^(?:what|what's)\s+(?:is|are)\s+(?:a|an|the)?\s*([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})\??$/i,
  );
  if (question) {
    const words = question[1]
      .split(/\s+/)
      .filter((w) => !ANAPHORA_STOPWORDS.has(w.toLowerCase()));
    if (words.length > 0) return words.join(" ").toLowerCase();
  }
  // Statement subjects: "X is/are/has/ratio/costs ..."
  const subj = cleaned.match(
    /^([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})\s+(?:is|are|was|were|has|costs|uses|ratio)\b/i,
  );
  if (subj) {
    const words = subj[1]
      .split(/\s+/)
      .filter((w) => !ANAPHORA_STOPWORDS.has(w.toLowerCase()));
    if (words.length > 0) return words.join(" ").toLowerCase();
  }
  // Fallback: longest content word in the turn.
  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !ANAPHORA_STOPWORDS.has(w));
  if (words.length === 0) return null;
  return words.sort((a, b) => b.length - a.length)[0];
}

const ANAPHORA_STOPWORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "who",
  "how",
  "why",
  "tell",
  "about",
  "with",
  "from",
  "this",
  "that",
  "then",
  "also",
  "does",
  "your",
  "have",
  "will",
  "would",
  "could",
  "should",
  "there",
  "the",
  "and",
  "for",
  "are",
  "can",
  "please",
  "give",
  "show",
  "much",
  "many",
  "some",
  "know",
  "thing",
  "stuff",
]);

/** Resolve pronouns in the input against the recent
 *  conversation. Scans history BACKWARD (most recent first,
 *  owner turns preferred) — max 6 turns, deterministic at
 *  every step. Returns one record per pronoun found. */
export function resolveAnaphora(
  input: string,
  history: Array<{ role: "owner" | "archie"; text: string }>,
): AnaphoraResolution[] {
  const found: AnaphoraResolution[] = [];
  const seen = new Set<string>();
  const lower = input.toLowerCase();
  for (const pronoun of ANAPHORA_PRONOUNS) {
    const re = new RegExp(`\\b${pronoun}\\b`, "i");
    if (!re.test(lower) || seen.has(pronoun)) continue;
    seen.add(pronoun);
    let referent: string | null = null;
    // Owner turns first — the owner's own words name the
    // referent; ARCHIE's replies quote it second-hand.
    for (const preferOwner of [true, false]) {
      if (referent) break;
      const turns = history
        .filter((t) => t.role === (preferOwner ? "owner" : "archie"))
        .slice(-6);
      for (let i = turns.length - 1; i >= 0 && !referent; i--) {
        referent = candidateReferent(turns[i].text);
      }
    }
    found.push({ pronoun, referent });
  }
  return found;
}

/** One deterministic NLU pass over raw owner input. */
/** Domain hints composed from the DomainSkillRegistry
 *  (domain-capture completion 2026-09-11): a skill may
 *  contribute deterministic cascade rules and labeled Bayes
 *  utterances. The engine's own cascade stays domain-neutral.
 *  Audit L-1 fix (2026-09-13): skill rules now run BEFORE the
 *  general rules — specific domain lexicons must take
 *  priority over generic core patterns (a crypto rule must
 *  win over the generic materials price rule). The corpus
 *  trains the same classifier. Omitted → domain-neutral NLU. */
export interface NluDomainHints {
  rules?: Array<{ intent: Intent; pattern: RegExp; confidence: number }>;
  corpus?: Array<[Intent, string[]]>;
}

/**
 * REMEDIATION batch 2 (2026-09-12): vocabulary probe.
 * Returns how many tokens of the input are known to the
 * classification corpus (base + skill contributions). A
 * return of 0 means NO known word matched at all — callers
 * use this to ask for a rephrase instead of pretending a
 * research/teach path is meaningful for gibberish. Pure,
 * deterministic, same classifier the engine's Bayes stage
 * uses; no new vocabulary is introduced.
 */
export function probeVocabulary(
  input: string,
  domain?: NluDomainHints,
): number {
  const corrected = correctConversationalTypos(input);
  // Fix 31: same cached classifier the engine's Bayes stage
  // uses — the probe no longer rebuilds it per call.
  return classifierFor(domain).classify(corrected).knownTokens;
}

export function understand(
  input: string,
  history: Array<{ role: "owner" | "archie"; text: string }> = [],
  domain?: NluDomainHints,
): NluResult {
  // NORMALIZE (owner directive 2026-09-11): typos are corrected
  // to real corpus words before any intent work. The rules
  // and the classifier see the corrected text; entity
  // extraction keeps the RAW input so URLs, emails and file
  // paths are never touched by the corrector.
  const corrected = correctConversationalTypos(input);
  const tokens = tokenize(corrected);
  const anaphora = resolveAnaphora(input, history);
  // Emoji tone (owner directive 2026-09-11): deterministic
  // scan, cheap, honest. An unknown emoji reports tone
  // "unknown" and is ignored by every route.
  const emojiTone = extractEmojiTone(input);
  // Stage 1: rule cascade over the corrected input —
  // skill-contributed domain rules first (specific beats
  // generic), then the general rules.
  for (const rule of [...(domain?.rules ?? []), ...RULE_CASCADE]) {
    if (rule.pattern.test(corrected)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        entities: extractEntities(input),
        tokens,
        anaphora,
        emojiTone,
      };
    }
  }
  // Stage 1b: a message with NO known words routes
  // deterministically by emoji tone when an emoji is present
  // (a bare thumbs up is an approval, a folded hand is
  // gratitude), otherwise to the honest knowledge route.
  // Function words alone ("why", "what") carry no intent of
  // their own: with a dominant emoji they defer to the
  // emoji's tone. Documented mapping in emoji.ts; no
  // guessing, no fabrication.
  const EMOJI_DEFERENT_WORDS = new Set([
    "what",
    "why",
    "how",
    "when",
    "where",
    "who",
    "really",
    "serious",
    "wow",
    "omg",
    "hmm",
    "pardon",
  ]);
  const wordsDeferToEmoji = tokens.every((t) => EMOJI_DEFERENT_WORDS.has(t));
  // Stage 2: trained Naive Bayes classifier (full corpus =
  // base + conversational expansion + skill utterances).
  // Fix 31: the trained model is cached, not rebuilt per call.
  const classifier = classifierFor(domain);
  const {
    intent: classifiedIntent,
    confidence: classifiedConfidence,
    knownTokens,
  } = classifier.classify(corrected);
  let intent = classifiedIntent;
  let confidence = classifiedConfidence;
  // Known-token honesty: a message whose words match NOTHING
  // in the vocabulary must not be classified by class priors
  // (the biggest class would win by accident). If an emoji
  // carries a tone, it decides; otherwise the honest route
  // is knowledge_query at low confidence.
  if (knownTokens === 0) {
    if (emojiTone.present && emojiTone.standaloneIntent) {
      return {
        intent: emojiTone.standaloneIntent,
        confidence: 0.75,
        entities: extractEntities(input),
        tokens,
        anaphora,
        emojiTone,
      };
    }
    return {
      intent: "knowledge_query",
      confidence: 0.3,
      entities: extractEntities(input),
      tokens,
      anaphora,
      emojiTone,
    };
  }
  // Emoji-dominant messages: function words + a strong
  // emoji. The words defer ("why" plus an angry face is an
  // emotion, not a question about "why").
  if (
    emojiTone.present &&
    emojiTone.standaloneIntent &&
    wordsDeferToEmoji &&
    emojiTone.standaloneIntent !== intent
  ) {
    return {
      intent: emojiTone.standaloneIntent,
      confidence: 0.7,
      entities: extractEntities(input),
      tokens,
      anaphora,
      emojiTone,
    };
  }
  // Precision guard: self-referential intents require an
  // explicit ARCHIE/self anchor in the text. Everyday visitor
  // questions ("what grout should I choose...") must land in
  // knowledge paths, not the capability manifest.
  if (SELF_ANCHOR_INTENTS.has(intent) && !SELF_ANCHOR.test(input)) {
    intent = input.includes("?") ? "knowledge_query" : "howto_guidance";
    confidence = Math.min(confidence, 0.6);
  }
  // Weak-signal honesty (owner directive 2026-09-11): when
  // the Bayes stage cannot separate the classes (confidence
  // below 0.2), the class prior alone must NOT produce a
  // confident social reply ("my uncle sells yam in the
  // village" is not a greeting). The honest route for a
  // weak signal is the knowledge path, which answers "I
  // have no validated knowledge on that" — truthfully.
  if (confidence < 0.2) {
    intent = "knowledge_query";
  }
  // Emoji alignment (owner directive 2026-09-11): when the
  // words and the emoji AGREE (thanks + folded hands), the
  // intent confidence is boosted a little. Agreement only —
  // a tone never overrides the words, because an emoji is a
  // hint, not a command.
  if (emojiAlignsWithIntent(emojiTone, intent)) {
    confidence = Math.min(0.95, confidence + 0.08);
  }
  return {
    intent,
    confidence,
    entities: extractEntities(input),
    anaphora,
    tokens,
    emojiTone,
  };
}

/** Convert ARCHIE tool specs into a compact description for
 *  tool-aware composition (never executed here). */
export function describeTools(tools: ToolSpecInternal[]): string {
  return tools.map((t) => t.name).join(", ");
}

/** Build a working-memory turn with its retrieval vector. */
export function memoryTurnFromText(
  role: "owner" | "archie",
  text: string,
  index: TfIdfIndex,
  at = Date.now(),
): MemoryTurn {
  const tokens = tokenize(text);
  index.addDoc(tokens);
  return { role, text, at, vector: index.vectorize(tokens) };
}

// ---------------------------------------------------------
// Compound-request decomposition (plan P2, audit N2).
// Owners speak in compound requests ("what is screeding and
// what is mortar", "estimate X then give me a status
// report", "tell me about screeding but don't mention
// prices"). The engine answers EACH clause honestly instead
// of answering only the first and silently dropping the
// rest. Splitting is CONSERVATIVE: "and" splits only before
// an intent-shaped continuation ("cement and sand" is ONE
// clause), and negated clauses become explicit constraints
// that are acknowledged and excluded — never answered.
// ---------------------------------------------------------

/** Hard cap: beyond this many clauses the request is honestly
 *  refused rather than half-remembered mid-composition. */
export const MAX_COMPOUND_CLAUSES = 8;

/** Intent-shaped continuations after "and" — the conservative
 *  split heuristic. A bare "and <noun>" stays one clause. */
const INTENT_CONTINUATION =
  "(?:what|how|why|when|where|who|which|is|are|does|do|can|could|would|should|tell|give|show|estimate|calculate|compute|plan|compare|check|remember|list|explain|describe|status|price|convert|compare)";

export interface DecomposedClause {
  /** The clause text, negation markers stripped for NLU. */
  text: string;
  /** True when the owner excluded this clause ("don't …",
   *  "… but without …") — it is a constraint, not a request:
   *  acknowledged, excluded, never answered. */
  negated: boolean;
}

/** Split a raw utterance into clauses. Returns a single
 *  clause for plain requests — decomposition is opt-in by
 *  the sentence structure itself. */
export function decomposeClauses(rawInput: string): DecomposedClause[] {
  // Code is data, not prose: fenced blocks and inline code are
  // masked BEFORE splitting so a `;` or "and" inside pasted
  // source never decomposes the request. Placeholders are
  // restored into their clause after the split.
  const masks: string[] = [];
  const mask = (text: string): string =>
    text
      .replace(/```[\s\S]*?```/g, (m) => {
        masks.push(m);
        return `\u0000${masks.length - 1}\u0000`;
      })
      .replace(/`[^`\n]*`/g, (m) => {
        masks.push(m);
        return `\u0000${masks.length - 1}\u0000`;
      });
  // NUL bytes are intentional sentinel markers for masked spans
  const unmask = (text: string): string =>
    // eslint-disable-next-line no-control-regex -- sentinel unmasking is the purpose here
    text.replace(/\u0000(\d+)\u0000/g, (_, i) => masks[Number(i)] ?? "");
  const input = mask(rawInput);
  const negation =
    /\b(?:don'?t|do\s+not|doesn'?t|never|exclude|excluding|without|but\s+not)\b/i;
  const markers = new RegExp(
    "\\s*(?:;|,?\\s+then\\b|\\s+after\\s+that\\b|\\s+also\\b|,\\s+and\\s+|\\s+and\\s+(?=" +
      INTENT_CONTINUATION +
      "\\b))",
    "i",
  );

  // First split on the negation-bearing "but" — the negated
  // tail is a constraint on the WHOLE request.
  const butNeg =
    /\s*,?\s+but\s+(?=(?:don'?t|do\s+not|never|exclude|excluding|without)\b)/i;
  const headSplit = butNeg.exec(input);
  let head = input;
  let negatedTail: string | null = null;
  if (headSplit) {
    head = input.slice(0, headSplit.index);
    negatedTail = input.slice(headSplit.index + headSplit[0].length);
  }

  // A clause that ITSELF begins with a negation marker
  // ("don't tell me about prices", "; never mention X") is a
  // constraint from its first word — flagged like a "but"
  // tail: acknowledged, excluded, never answered.
  const leadingNegation =
    /^\s*(?:please\s+)?(?:don'?t|do\s+not|doesn'?t|never|exclude|excluding|without)\b/i;

  const clauses: DecomposedClause[] = [];
  for (const part of head.split(markers)) {
    const negated = leadingNegation.test(part);
    const text = unmask(part)
      .trim()
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .replace(/\s+and$/i, "")
      .replace(leadingNegation, "")
      .trim();
    if (text.length === 0) continue;
    clauses.push({ text, negated });
  }
  if (negatedTail) {
    // Sub-clause recovery inside the negated tail (audit fix
    // 2026-09-11, compound-decomposition defect): the tail is
    // a CONSTRAINT on the request, but owners keep talking
    // after it — "…but don't include the ceiling, compare
    // emulsion with satin paint, then plan the purchase"
    // carries two further REQUESTS inside the tail. Reading
    // the whole tail as one exclusion silently drops them
    // (meaning loss — the exact case the audit probe caught).
    // Tail fragments are therefore classified deterministically:
    //   * a fragment led by a negation marker stays a constraint;
    //   * a fragment that is itself an imperative/interrogative
    //     request (intent-continuation verb) is recovered as a
    //     POSITIVE clause;
    //   * anything else stays a constraint (conservative: an
    //     ambiguous fragment is excluded, never fabricated
    //     into an answered request).
    // Commas separate tail fragments too (they do NOT in the
    // head — noun lists there must stay whole).
    const tailSplit = new RegExp(
      "\\s*(?:,|;|,?\\s+then\\b|\\s+after\\s+that\\b|\\s+also\\b|,\\s+and\\s+|\\s+and\\s+(?=" +
        INTENT_CONTINUATION +
        "\\b))",
      "i",
    );
    const intentLed = new RegExp(
      "^\\s*(?:please\\s+)?(?:" + INTENT_CONTINUATION + ")\\b",
      "i",
    );
    for (const part of negatedTail.split(tailSplit)) {
      const negatedFrag = leadingNegation.test(part) || !intentLed.test(part);
      let text = unmask(part)
        .trim()
        .replace(/^[,;\s]+|[,;\s]+$/g, "");
      if (negatedFrag) {
        text = text
          .replace(leadingNegation, "")
          .replace(negation, "")
          .replace(negation, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (text.length > 0) clauses.push({ text, negated: negatedFrag });
    }
  }
  return clauses;
}

/** Compose a compound answer from per-clause responses and
 *  respected exclusions (plan P2/P5): numbered parts, visible
 *  exclusions, all-excluded redirect. Shared by the engine's
 *  internal compound path and the reasoning loop so the two
 *  can never drift apart. */
export function composeCompound(parts: string[], excluded: string[]): string {
  let text: string;
  if (parts.length === 0) {
    text =
      'Every part of that request was an exclusion (a "don\'t") — there was nothing left to answer. Tell me what you DO want and I will do it fully.';
  } else {
    text =
      parts.length === 1
        ? parts[0]
        : parts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  }
  if (excluded.length > 0) {
    text += `\nYou also asked me NOT to: ${excluded
      .map((t) => `"${t}"`)
      .join("; ")}. Respected — that part is excluded from this answer.`;
  }
  return text;
}
