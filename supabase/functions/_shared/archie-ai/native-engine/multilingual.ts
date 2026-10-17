// ============================================================
// ARCHIE MULTILINGUAL ENGINE
// (full-agent audit 2026-10-17, gap E-2 / suggested engine 11)
//
// FRELUX is moving to worldwide usage — and ARCHIE's answers,
// corpus, and composer are English. The honest behavior for a
// non-English message is NOT silence, and NOT pretending to
// speak a language the engine cannot compose in:
//
//   1. DETECT the message's language, deterministically:
//      script ranges first (Arabic, CJK, Cyrillic, Devanagari),
//      then Latin-script scoring over language-distinctive
//      word lists (English included, so English never gets a
//      false notice).
//   2. ANSWER in English, as always — ARCHIE's knowledge
//      pipeline, citations, and composer are English-only;
//      composing in a language it cannot verify would
//      fabricate fluency it does not have.
//   3. NOTICE in the owner's language: one fixed, human-
//      reviewed sentence stating the limitation, prepended
//      to the English answer. The owner reads their own
//      language first; the capability boundary is stated,
//      never hidden.
//
// Deterministic: same message → same detection, same notice,
// every time. No external model. Translation templates are
// single fixed sentences — anything longer would be invented
// fluency. Native-speaker review is welcomed and expected
// before worldwide exposure.
// ============================================================

export type SupportedNoticeLanguage =
  | "yo" // Yoruba
  | "ig" // Igbo
  | "ha" // Hausa
  | "pcm" // Nigerian Pidgin
  | "fr" // French
  | "es" // Spanish
  | "pt" // Portuguese
  | "ar" // Arabic
  | "zh" // Chinese
  | "hi" // Hindi
  | "ru"; // Russian

export interface LanguageDetection {
  /** "en" when the text reads as English (or nothing
   *  distinguishable). */
  language: "en" | SupportedNoticeLanguage;
  /** 0..1 — share of scored tokens matching the winning
   *  language's distinctive set. */
  confidence: number;
  /** Detection method, reported for the trace. */
  method: "script" | "wordlist" | "default-english";
}

// ------------------------------------------------------------
// Script detection — unambiguous Unicode ranges
// ------------------------------------------------------------

const SCRIPT_TESTS: Array<{
  lang: SupportedNoticeLanguage;
  re: RegExp;
  name: string;
}> = [
  { lang: "ar", re: /[\u0600-\u06FF]/, name: "arabic" },
  { lang: "zh", re: /[\u4E00-\u9FFF]/, name: "cjk" },
  { lang: "hi", re: /[\u0900-\u097F]/, name: "devanagari" },
  { lang: "ru", re: /[\u0400-\u04FF]/, name: "cyrillic" },
];

// ------------------------------------------------------------
// Latin-script distinctive word lists. Words chosen to be
// highly distinctive of their language in short messages —
// stopwords and pronouns carry the signal, exactly what
// short owner messages actually contain.
// ------------------------------------------------------------

const LATIN_SETS: Record<
  string,
  { lang: SupportedNoticeLanguage | "en"; words: Set<string> }
> = {
  en: {
    lang: "en",
    words: new Set([
      "the", "is", "are", "you", "what", "how", "i", "my", "we", "do",
      "does", "can", "will", "not", "this", "that", "have", "has",
      "please", "thanks", "tell", "me", "about", "want", "need",
      "know", "when", "where", "which", "your", "and", "for", "with",
      "was", "were", "there", "here", "they", "them", "from", "get",
      "give", "make", "just", "like", "also", "then", "than", "all",
      "any", "some", "who", "why", "would", "should", "could", "did",
    ]),
  },
  fr: {
    lang: "fr",
    words: new Set([
      "le", "la", "les", "je", "tu", "il", "elle", "nous", "vous",
      "est", "une", "un", "des", "du", "et", "que", "qui", "quoi",
      "comment", "pourquoi", "merci", "bonjour", "s'il", "avec",
      "pour", "dans", "pas", "ne", "ce", "cette", "mais", "mon",
      "ma", "mes", "veux", "peux", "fais", "voici", "voilà", "très",
    ]),
  },
  es: {
    lang: "es",
    words: new Set([
      "el", "los", "que", "de", "no", "una", "yo", "tú", "usted",
      "es", "son", "por", "para", "con", "pero", "cómo", "qué",
      "cuándo", "dónde", "gracias", "hola", "buenos", "días",
      "quiero", "puedo", "tengo", "muy", "más", "menos", "este",
      "esta", "mi", "tus", "sí", "también", "entonces", "hacer",
      "está", "están", "del", "al", "hoy", "nada", "todo", "bien",
      "mucho", "cuánto", "cuanto", "cuál", "sobre", "sin", "ser",
    ]),
  },
  pt: {
    lang: "pt",
    words: new Set([
      "você", "não", "uma", "com", "por", "para", "isso", "muito",
      "obrigado", "obrigada", "olá", "bom", "dia", "quero", "posso",
      "tenho", "vamos", "está", "são", "meu", "minha", "seu", "sua",
      "mas", "porque", "como", "quando", "onde", "sim", "então",
      "aqui", "também", "já", "tudo", "nada", "quem", "qual",
      "do", "da", "dos", "das", "em", "no", "na", "dos", "meu",
      "hoje", "quanto", "sobre", "sem", "ser", "quê", "preço",
    ]),
  },
  yo: {
    lang: "yo",
    words: new Set([
      "ni", "ti", "o", "mo", "e", "a", "ko", "kò", "ní", "tí", "ó",
      "ṣe", "sé", "kí", "kini", "kíni", "bawo", "báwo", "ejo", "ẹjọ",
      "daadaa", "dára", "oḍọ", "ese", "eṣé", "oḍo", "wa", "wá",
      "nla", "ńlá", "pupọ", "púpọ̀", "gbogbo", "yẹn", "yìí", "mi",
      "ọkọ", "iyawo", "ìyàwó", "kú", "ọdún", "ojo", "ọjọ́",
    ]),
  },
  ig: {
    lang: "ig",
    words: new Set([
      "na", "ihe", "o", "ga", "di", "dị", "ndi", "ndị", "nke", "mana",
      "kedu", "ọ", "gịnị", "biko", "daa", "nke", "m", "mụ", "anyị",
      "unu", "ha", "nkịta", "mmadụ", "eze", "chi", "ukwu", "ọma",
      "ọjọọ", "ụbọchị", "taa", "echi", "ọga", "eze", "ụlọ", "ahịa",
    ]),
  },
  ha: {
    lang: "ha",
    words: new Set([
      "da", "na", "a", "in", "ba", "kuma", "sai", "wani", "wata",
      "don", "domin", "yake", "take", "sannu", "madalla", "lafiya",
      "yaya", "menene", "ina", "ina", "zuwa", "kai", "ke", "ni",
      "mu", "ku", "su", "yana", "tana", "sun", "na", "lokaci",
      "yau", "gobe", "inka", "kome", "haka", "kamar", "wannan",
    ]),
  },
  pcm: {
    lang: "pcm",
    words: new Set([
      "dey", "na", "abi", "wetin", "oga", "sabi", "wahala", "comot",
      "shey", "na", "no", "i", "you", "make", "come", "go", "that",
      "this", "wey", "how", "far", "abeg", "na", "e", "dem", "una",
      "wuna", "pipo", "palava", "gbege", "yanga", "chop", "naija",
      "correct", "sharp", "small", "well", "well-done", "kam",
    ]),
  },
};

/** A message needs at least this share of scored Latin tokens
 *  hitting one language's distinctive set before a non-English
 *  notice is used. English always wins ties. */
export const LATIN_DETECT_THRESHOLD = 0.34;

export function detectLanguage(message: string): LanguageDetection {
  const text = (message ?? "").trim();
  if (!text) return { language: "en", confidence: 0, method: "default-english" };

  // 1. Script languages: any run of script characters wins.
  for (const { lang, re, name } of SCRIPT_TESTS) {
    const matches = text.match(new RegExp(re.source, "g"));
    if (matches && matches.length >= 2) {
      return {
        language: lang,
        confidence: Math.min(1, matches.length / 8),
        method: "script",
      };
    }
  }

  // 2. Latin-script wordlist scoring.
  const tokens = text.toLowerCase().match(/[a-zà-ÿ'’-]+/g) ?? [];
  if (tokens.length === 0) {
    return { language: "en", confidence: 0, method: "default-english" };
  }
  const scores = new Map<string, number>();
  for (const setKey of Object.keys(LATIN_SETS)) {
    const { words } = LATIN_SETS[setKey];
    let hits = 0;
    for (const t of tokens) if (words.has(t)) hits++;
    scores.set(setKey, hits / tokens.length);
  }
  // English wins ties and low-confidence cases — never attach a
  // foreign notice to an ambiguous or short English message.
  const entries = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const [bestKey, bestScore] = entries.find(([k]) => k !== "en") ?? [
    "en",
    0,
  ] as [string, number];
  const enScore = scores.get("en") ?? 0;
  const bestLang = bestKey === "en" ? "en" : LATIN_SETS[bestKey].lang;
  if (bestLang !== "en" && bestScore >= LATIN_DETECT_THRESHOLD && bestScore > enScore) {
    return {
      language: bestLang as SupportedNoticeLanguage,
      confidence: bestScore,
      method: "wordlist",
    };
  }
  return { language: "en", confidence: enScore, method: "wordlist" };
}

// ------------------------------------------------------------
// The honest limitation notice — ONE fixed sentence per
// language, human-reviewable. Never machine-composed.
// ------------------------------------------------------------

export const LANGUAGE_NOTICES: Record<
  SupportedNoticeLanguage,
  string
> = {
  yo: "Mo lè dáhùn ní Gẹ̀ẹ́sì nìkan fún àwọn àsìkò yìí.",
  ig: "Enwere m ike ịza na Bekee naanị ugbu a.",
  ha: "Zan iya amsa da Turanci kawai a yanzu.",
  pcm: "I fit ansa for English onli for nau.",
  fr: "Je ne peux répondre qu'en anglais pour l'instant.",
  es: "Solo puedo responder en inglés por ahora.",
  pt: "No momento, só posso responder em inglês.",
  ar: "أستطيع الرد بالإنجليزية فقط في الوقت الحالي.",
  zh: "我现在只能用英语回答。",
  hi: "मैं अभी केवल अंग्रेज़ी में उत्तर दे सकता हूँ।",
  ru: "Сейчас я могу отвечать только на английском.",
};

export const LANGUAGE_NAMES: Record<SupportedNoticeLanguage, string> = {
  yo: "Yoruba",
  ig: "Igbo",
  ha: "Hausa",
  pcm: "Nigerian Pidgin",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  ar: "Arabic",
  zh: "Chinese",
  hi: "Hindi",
  ru: "Russian",
};

/** Compose the final reply for a non-English message: the
 *  native notice first, then ARCHIE's full English answer —
 *  untouched, never truncated. English messages return the
 *  answer verbatim. */
export function multilingualReply(
  detection: LanguageDetection,
  englishAnswer: string,
): string {
  if (detection.language === "en") return englishAnswer;
  const notice = LANGUAGE_NOTICES[detection.language];
  const name = LANGUAGE_NAMES[detection.language];
  return `${notice}\n\n(Answer follows in English, ${name} support is not built yet.)\n\n${englishAnswer}`;
}
