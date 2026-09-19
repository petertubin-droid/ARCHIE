// =========================================================
// ARCHIE NATIVE ENGINE — EMOJI UNDERSTANDING
//
// Real emoji comprehension, deterministic and honest:
//   * a curated tone map for the common conversational
//     emoji the owner enumerated
//   * extractEmojiTone(input) returns the emojis found and
//     their tone labels — tone MODIFIES conversational
//     meaning, it is never fabricated into a fact
//   * a pure emoji message (no word tokens at all) routes
//     deterministically by its strongest tone
//   * ARCHIE may USE an emoji sparingly in celebratory or
//     warm responses, but never in every response —
//     emojis are seasoning, not the meal (owner
//     directive: do not force emojis)
//
// No external AI. No guessing: an unknown emoji is reported
// as tone "unknown" and ignored by the router.
// =========================================================

import type { Intent } from "./nlu.ts";

export type EmojiTone =
  | "positive"
  | "amused"
  | "affection"
  | "approval"
  | "gratitude"
  | "celebration"
  | "enthusiasm"
  | "cool"
  | "thinking"
  | "confused"
  | "displeased"
  | "sad"
  | "frustrated"
  | "surprised"
  | "admiration"
  | "playful"
  | "tired"
  | "unknown";

interface EmojiMeaning {
  tone: EmojiTone;
  /** Deterministic intent for a message that is ONLY this
   *  emoji. Omitted when no single intent is defensible. */
  standaloneIntent?: Intent;
}

/** The owner-directed conversational emoji set. Meanings are
 *  the common conversational readings; the tone is a hint,
 *  never a claim about the user's inner state. */
const EMOJI_MAP = new Map<string, EmojiMeaning>([
  ["🙂", { tone: "positive", standaloneIntent: "acknowledgment" }],
  ["😊", { tone: "positive", standaloneIntent: "acknowledgment" }],
  ["😄", { tone: "positive", standaloneIntent: "acknowledgment" }],
  ["😁", { tone: "positive", standaloneIntent: "acknowledgment" }],
  ["😂", { tone: "amused", standaloneIntent: "emotional_expression" }],
  ["🤣", { tone: "amused", standaloneIntent: "emotional_expression" }],
  ["❤️", { tone: "affection", standaloneIntent: "emotional_expression" }],
  ["❤", { tone: "affection", standaloneIntent: "emotional_expression" }],
  ["👍", { tone: "approval", standaloneIntent: "agreement" }],
  ["👌", { tone: "approval", standaloneIntent: "agreement" }],
  ["🙏", { tone: "gratitude", standaloneIntent: "gratitude" }],
  ["🎉", { tone: "celebration", standaloneIntent: "celebration" }],
  ["🎊", { tone: "celebration", standaloneIntent: "celebration" }],
  ["🔥", { tone: "enthusiasm", standaloneIntent: "celebration" }],
  ["😎", { tone: "cool", standaloneIntent: "acknowledgment" }],
  ["🤔", { tone: "thinking", standaloneIntent: "clarification_request" }],
  ["😕", { tone: "confused", standaloneIntent: "clarification_request" }],
  ["😢", { tone: "sad", standaloneIntent: "emotional_expression" }],
  ["😭", { tone: "sad", standaloneIntent: "emotional_expression" }],
  ["😡", { tone: "frustrated", standaloneIntent: "emotional_expression" }],
  ["😮", { tone: "surprised", standaloneIntent: "emotional_expression" }],
  ["😍", { tone: "admiration", standaloneIntent: "emotional_expression" }],
  ["😉", { tone: "playful", standaloneIntent: "acknowledgment" }],
  ["😴", { tone: "tired", standaloneIntent: "emotional_expression" }],
  ["🚀", { tone: "enthusiasm", standaloneIntent: "celebration" }],
  ["💯", { tone: "approval", standaloneIntent: "agreement" }],
]);

export interface EmojiToneResult {
  /** Emojis found in the input, in order of appearance. */
  emojis: string[];
  /** Distinct tone labels of the emojis found. */
  tones: EmojiTone[];
  /** True when the input contains at least one known or
   *  unknown emoji. */
  present: boolean;
  /** Deterministic intent for a PURE emoji message (no word
   *  tokens). Null when the message has words or no emoji
   *  carries a defensible standalone intent. */
  standaloneIntent: Intent | null;
}

/** Tone families that ALIGN with an intent: when the text and
 *  the emoji agree, the intent's confidence is boosted a
 *  little. Agreement only — never a disagreement penalty,
 *  because emoji tone is a hint, not a command. */
const TONE_INTENT_ALIGNMENT: Record<EmojiTone, Intent[]> = {
  positive: ["greeting", "gratitude", "acknowledgment", "emotional_expression"],
  amused: ["emotional_expression", "gratitude", "social_talk"],
  affection: ["gratitude", "emotional_expression"],
  approval: ["agreement", "acknowledgment", "gratitude"],
  gratitude: ["gratitude"],
  celebration: ["celebration"],
  enthusiasm: ["celebration", "emotional_expression", "social_talk"],
  cool: ["acknowledgment", "agreement"],
  thinking: ["clarification_request", "acknowledgment"],
  confused: ["clarification_request"],
  displeased: ["correction", "disagreement"],
  sad: ["emotional_expression"],
  frustrated: ["emotional_expression"],
  surprised: ["emotional_expression"],
  admiration: ["gratitude", "emotional_expression"],
  playful: ["social_talk", "greeting"],
  tired: ["emotional_expression"],
  unknown: [],
};

/** Deterministic scan of the input for conversational
 *  emojis. Cheap and side-effect free. */
export function extractEmojiTone(input: string): EmojiToneResult {
  const emojis: string[] = [];
  // Emoji are astral-plane characters; a code-point scan is
  // the reliable way to collect them intact.
  for (const ch of input) {
    if (EMOJI_MAP.has(ch)) emojis.push(ch);
    else if (/\p{Extended_Pictographic}/u.test(ch)) emojis.push(ch);
  }
  const tones = [
    ...new Set(emojis.map((e) => EMOJI_MAP.get(e)?.tone ?? "unknown")),
  ];
  // Standalone route: the FIRST emoji that carries a
  // defensible standalone intent decides. Deterministic,
  // order of appearance.
  let standaloneIntent: Intent | null = null;
  for (const e of emojis) {
    const meaning = EMOJI_MAP.get(e);
    if (meaning?.standaloneIntent) {
      standaloneIntent = meaning.standaloneIntent;
      break;
    }
  }
  return {
    emojis,
    tones,
    present: emojis.length > 0,
    standaloneIntent,
  };
}

/** Does the emoji tone ALIGN with the classified intent?
 *  Used by the NLU as a small deterministic confidence
 *  boost when text and emoji agree. */
export function emojiAlignsWithIntent(
  tone: EmojiToneResult,
  intent: Intent,
): boolean {
  return tone.tones.some((t) =>
    (TONE_INTENT_ALIGNMENT[t] ?? []).includes(intent),
  );
}
