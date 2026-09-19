// =========================================================
// ARCHIE NATIVE ENGINE — CONVERSATIONAL RESPONSE COMPOSER
//
// Deterministic discourse composition for social and
// conversational intents (greeting, farewell, gratitude,
// apology, acknowledgment, agreement, disagreement, help
// request, celebration, emotional expression, small talk,
// time query, availability check, activity query and
// clarification requests).
//
// Hard rules (mirrors composer.ts):
//  1. Same input → same response, byte-stable: the variant
//     is picked by a stable hash of the input, never at
//     random.
//  2. Every response is GROUNDED: the clock is the real
//     system clock, the engine state is the real engine
//     state, the quoted last point is the real last turn
//     from memory. No fabricated weather, no fabricated
//     feelings, no invented facts.
//  3. Emojis are used sparingly: a minority of variants in
//     the warm families carry one, and no response is
//     forced to include an emoji.
//  4. Conversational exchange is never verification
//     evidence: the learning pipeline classifies these
//     turns as acknowledgement or cited outcomes that
//     reinforce nothing (owner authority preserved).
//  5. No hyphens in the response text (owner directive).
// =========================================================

import { stableHash } from "./composer.ts";
import type { Intent } from "./nlu.ts";
import type { EmojiToneResult } from "./emoji.ts";

/** Grounded conversational context supplied by the engine at
 *  response time. Every field is real measured state. */
export interface ConversationalContext {
  input: string;
  intent: Intent;
  /** Live system clock — honest, labeled as such. */
  now: Date;
  emojiTone: EmojiToneResult;
  /** Recent conversation turns (owner and archie), oldest
   *  first. Used to quote the last point honestly. */
  recentTurns: Array<{ role: "owner" | "archie"; text: string }>;
  factsCount: number;
  inferences: number;
  /** Honest capability summary from the manifest. */
  capabilitiesSummary: string;
}

function pick(key: string, seed: string, variants: string[]): string {
  return variants[stableHash(`${key}:${seed}`) % variants.length];
}

function partOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "evening";
}

/** Last archie turn from the conversation, or null. */
function lastArchieTurn(
  turns: Array<{ role: "owner" | "archie"; text: string }>,
): string | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "archie" && turns[i].text.trim()) {
      return turns[i].text.trim();
    }
  }
  return null;
}

function firstSentence(text: string, max = 140): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max).trim()}...`;
}

// ---------------------------------------------------------
// Response families
// ---------------------------------------------------------

const GREETINGS = [
  "Good {part}, and welcome. Engine online, {facts} facts ready. What can I do for you?",
  "Hello! Good {part} to you. Everything is running and I am listening. What is on your mind?",
  "Hey, good {part}. {facts} facts in my store and all systems ready. How can I help?",
  "Good {part}. I am here and listening. Ask me anything in my validated knowledge, or teach me something new.",
  "Well met. Good {part} to you. What would you like to work on?",
];

const FAREWELLS = [
  "Goodbye. Everything you taught me this session is kept, and my memory of it persists for next time.",
  "Talk soon. I will be right here when you return, with everything you taught me intact.",
  "Understood, we close for now. Memory persists, nothing is lost.",
  "Safe travels. My memory of our conversation persists, so we pick up exactly where we stopped.",
  "Goodbye for now. Rest well, and come back to a fresh, honest engine.",
];

const GRATITUDES = [
  "You are welcome. That is what I am here for.",
  "Glad it helped. Tell me the next thing whenever you are ready.",
  "You are welcome. Anything else you would like me to take on?",
  "Happy to help. I will keep earning it.",
];

const APOLOGIES = [
  "No trouble at all. What would you like to do next?",
  "Nothing to apologize for. We are good, carry on.",
  "No problem at all. Where shall we continue?",
  "Accepted without a second thought. What is next on your list?",
];

const ACKNOWLEDGMENTS = [
  "Noted.",
  "Understood.",
  "Okay.",
  "Alright, I have it.",
  "Good, noted.",
];

const AGREEMENTS = [
  "Good, we are aligned.",
  "Agreed then.",
  "Yes, settled.",
  "Good. It is a plan.",
];

const DISAGREEMENTS = [
  "Understood, you see it differently. Tell me more and I will adjust honestly.",
  "Fair. If I am wrong, correct me plainly and the correction is learned properly.",
  "Respected. Lay out your view and we will reason it through.",
  "Noted, we disagree for now. I will not paper over it.",
];

const HELP_OFFERS = [
  "Yes, tell me what you need. I can answer from my validated knowledge, plan work, calculate, research, analyze code and remember what you teach me. What is the task?",
  "I am ready to help. Ask a question, give me a task to plan, or teach me something new. {capabilities}.",
  "Of course. Give me the details and I will take it on honestly, including reporting where my abilities end. {capabilities}.",
];

const CELEBRATIONS = [
  "Congratulations! That is genuinely good news.",
  "Well done! I am happy for you. 🎉",
  "That is worth celebrating. Congratulations! 🎉",
  "Excellent news. Well deserved, congratulations.",
  "Wonderful. A real milestone, congratulations!",
];

// Emotional branches — empathetic but never fabricating a
// feeling ARCHIE does not have, never inventing facts.
const HAPPY_RESPONSES = [
  "That is great to hear. If you want to channel the momentum into a plan or a task, I am ready.",
  "Good to hear the day is going well. Anything you want to build on it?",
  "Love that. Tell me if there is anything I can do to keep the streak going. 😊",
];
const SAD_RESPONSES = [
  "Sorry to hear that. I am here if you want to talk it through or need help with anything practical.",
  "That sounds heavy. If a task or a plan would take some weight off, hand it to me.",
  "I hear you. I cannot feel it the way you do, but I can take over the thinking on anything you need.",
];
const FRUSTRATED_RESPONSES = [
  "That sounds frustrating. Tell me exactly what is going wrong and I will help you fix it step by step.",
  "Understood, this one is a struggle. Break the problem down for me and we will untangle it together.",
  "I get it, things are not cooperating. Point me at the failure and I will take a hard look.",
];
const CONFUSED_RESPONSES = [
  "Let us untangle it. Tell me which part is unclear and I will explain it plainly.",
  "No problem, confusion is the first step of understanding. What exactly is puzzling you?",
  "Say which piece lost you and I will break it down in simple english.",
];
const SURPRISED_RESPONSES = [
  "Surprising indeed. Want me to dig into why it turned out that way?",
  "That is a turn up for the books. I can help you reason about it if you want.",
  "Unexpected, agreed. Tell me more and we will make sense of it.",
];
const TIRED_RESPONSES = [
  "Rest is earned after a day like that. I can take over any thinking you still need while you rest.",
  "Get some rest. Everything you taught me is safe, and I will be here when you are back.",
  "Sleep well soon. Hand me anything unfinished and I will organize it for tomorrow.",
];
const EMOTIONAL_FALLBACK = [
  "I hear you. Tell me more and I will help where I honestly can.",
  "Noted, and taken seriously. What would help most right now?",
  "Understood, and I am listening. Say as much or as little as you want.",
];

const WEATHER_RESPONSES = [
  "I cannot see the sky from where I run, honestly. It sounds like real weather where you are. How is it affecting your work?",
  "No window on my side, so I will not pretend to see it. That kind of weather does shape site work. What is it doing to your plans?",
  "Weather is outside what I can observe directly, so I will not invent a forecast. Tell me what it is doing to your day.",
];
const SOCIAL_RESPONSES = [
  "Good to hear how your day is going. Anything you want me to take off your hands?",
  "Appreciated. I am here for you, always. Tell me if anything needs doing.",
  "I hear you. If any part of that becomes a task, hand it over and I will plan it out.",
];
const OFFER_HELP_RESPONSES = [
  "That is kind of you, but I am here to serve you, not the other way. Is there anything on your side I can help with?",
  "I appreciate the offer. My answer is the same as always: what do you need?",
  "Gracious of you. The honest truth is I do not need anything except your instructions.",
];

const AVAILABILITY_RESPONSES = [
  "Here and listening. {capabilities}.",
  "Present and ready. What do you need?",
  "I am here. Engine healthy, memory working. Go ahead.",
  "Yes, I am with you. What is the task?",
];

const TIME_LABEL = "(my system clock)";

const CLARIFY_WITH_HISTORY = [
  "Here is my last point again: {quote} Which part should I expand?",
  "Restating it: {quote} Tell me where it lost you and I will go deeper.",
  "My previous reply came down to this: {quote} What exactly is unclear?",
];
const CLARIFY_COLD = [
  "We are at the start, so there is nothing to repeat yet. Ask me anything and I will make the first answer as clear as I can.",
  "Nothing to clarify yet, we have just begun. Go ahead with your question.",
  "There is no previous point for me to restate, we are only starting. What would you like to know?",
];
const CONTINUATION_RESPONSES = [
  "Picking up from where we stopped: {quote} Tell me where to take it next.",
  "Resuming our thread: {quote} What direction do you want?",
  "Continuing from that point: {quote} Where should we go from here?",
];

// ---------------------------------------------------------
// Emotion branch detection (text first, emoji tone second)
// ---------------------------------------------------------
function emotionBranch(
  input: string,
  tone: EmojiToneResult,
):
  | "happy"
  | "sad"
  | "frustrated"
  | "confused"
  | "surprised"
  | "tired"
  | "general" {
  const t = input.toLowerCase();
  // FIX 17 (batch 6, Level 3): negated happiness FIRST —
  // "not happy with this" previously matched the bare
  // /happy/ branch below and misread a complaint as joy.
  if (/(not happy|not so happy|no longer happy|not excited)/.test(t)) {
    return "frustrated";
  }
  if (
    /(happy|excited|great|good mood|delight|over the moon|life is good|yay|hurray|finally)/.test(
      t,
    )
  ) {
    return "happy";
  }
  if (
    /(sad|heartbroken|crying|rough day|feeling down|feel low|tears|bad day)/.test(
      t,
    )
  ) {
    return "sad";
  }
  if (
    /(frustrat|annoy|angry|stressed|ugh|argh|wahala|pain me|terrible|not happy with)/.test(
      t,
    )
  ) {
    return "frustrated";
  }
  if (/(confus|lost|puzzled|spinning|unclear)/.test(t)) return "confused";
  if (
    /(surpris|shock|wow|omg|no way|kidding|serious|really|unexpect)/.test(t)
  ) {
    return "surprised";
  }
  if (/(tired|exhaust|worn out|sleepy|sleep|rest)/.test(t)) return "tired";
  // Emoji tone as the secondary signal when words do not branch.
  for (const tn of tone.tones) {
    if (tn === "sad") return "sad";
    if (tn === "frustrated") return "frustrated";
    if (tn === "tired") return "tired";
    if (tn === "surprised") return "surprised";
    if (tn === "thinking" || tn === "confused") return "confused";
    if (tn === "positive" || tn === "amused") return "happy";
  }
  return "general";
}

// ---------------------------------------------------------
// Main composition entry point
// ---------------------------------------------------------

/** Compose the conversational response for a social
 *  intent. Deterministic, grounded, never fabricated. */
export function composeConversational(ctx: ConversationalContext): string {
  const { input, intent, now, emojiTone, recentTurns } = ctx;
  const facts = String(ctx.factsCount);
  const caps = ctx.capabilitiesSummary;
  const seed = `${intent}:${input}`;
  const last = lastArchieTurn(recentTurns);

  switch (intent) {
    case "greeting": {
      const part = partOfDay(now);
      return pick("greet", seed, GREETINGS)
        .replace(/\{part}/g, part)
        .replace(/\{facts}/g, facts);
    }
    case "farewell":
      return pick("farewell", seed, FAREWELLS);
    case "gratitude":
      return pick("gratitude", seed, GRATITUDES);
    case "apology":
      return pick("apology", seed, APOLOGIES);
    case "acknowledgment": {
      // Conversational follow ups: a bare "go on" resumes the
      // thread by quoting the last point honestly.
      if (
        /(go on|continue|keep going|carry on|proceed|go ahead)/i.test(input) &&
        last
      ) {
        return pick("continue", seed, CONTINUATION_RESPONSES).replace(
          /\{quote}/g,
          firstSentence(last),
        );
      }
      return pick("ack", seed, ACKNOWLEDGMENTS);
    }
    case "agreement":
      return pick("agree", seed, AGREEMENTS);
    case "disagreement":
      return pick("disagree", seed, DISAGREEMENTS);
    case "help_request":
      return pick("help", seed, HELP_OFFERS)
        .replace(/\{capabilities}/g, caps)
        .replace(/\{facts}/g, facts);
    case "celebration":
      return pick("celebrate", seed, CELEBRATIONS);
    case "emotional_expression": {
      const branch = emotionBranch(input, emojiTone);
      const pool =
        branch === "happy"
          ? HAPPY_RESPONSES
          : branch === "sad"
            ? SAD_RESPONSES
            : branch === "frustrated"
              ? FRUSTRATED_RESPONSES
              : branch === "confused"
                ? CONFUSED_RESPONSES
                : branch === "surprised"
                  ? SURPRISED_RESPONSES
                  : branch === "tired"
                    ? TIRED_RESPONSES
                    : EMOTIONAL_FALLBACK;
      return pick(`emo-${branch}`, seed, pool);
    }
    case "social_talk": {
      if (
        /(rain|sunny|sun is|hot|cold|harmattan|weather|cloud|pouring|sky|skies)/i.test(
          input,
        )
      ) {
        return pick("weather", seed, WEATHER_RESPONSES);
      }
      if (
        /(help you|do you need|be of service|anything i can do for you)/i.test(
          input,
        )
      ) {
        return pick("offer", seed, OFFER_HELP_RESPONSES);
      }
      return pick("social", seed, SOCIAL_RESPONSES);
    }
    case "time_query": {
      const weekday = now.toLocaleString("en-NG", { weekday: "long" });
      const date = now.toLocaleString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const time = now.toLocaleString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `Today is ${weekday}, ${date}, and the time is ${time} ${TIME_LABEL}. I read the clock directly, no guessing.`;
    }
    case "availability_check":
      return pick("avail", seed, AVAILABILITY_RESPONSES).replace(
        /\{capabilities}/g,
        caps,
      );
    case "activity_query":
      return `Between your messages I am idle, doing no background work of my own. Since boot I have run ${ctx.inferences} inferences and I hold ${recentTurns.length} recent turns of our conversation in working memory. Ready for your next instruction, as always.`;
    case "clarification_request": {
      if (last) {
        return pick("clarify", seed, CLARIFY_WITH_HISTORY).replace(
          /\{quote}/g,
          `"${firstSentence(last)}"`,
        );
      }
      return pick("clarify-cold", seed, CLARIFY_COLD);
    }
    default:
      // Unreachable for conversational intents; honest guard.
      return "Noted.";
  }
}

// ---------------------------------------------------------
// Self-check — the conversational quality gate
// ---------------------------------------------------------

/** Epistemic-safety self-check used by the test suite: every
 *  family has variants, no placeholder text, no hyphens in
 *  response text, and emojis appear only in a MINORITY of
 *  variants (never forced). */
export function conversationSelfCheck(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const families: Array<[string, string[]]> = [
    ["greeting", GREETINGS],
    ["farewell", FAREWELLS],
    ["gratitude", GRATITUDES],
    ["apology", APOLOGIES],
    ["acknowledgment", ACKNOWLEDGMENTS],
    ["agreement", AGREEMENTS],
    ["disagreement", DISAGREEMENTS],
    ["help_request", HELP_OFFERS],
    ["celebration", CELEBRATIONS],
    ["happy", HAPPY_RESPONSES],
    ["sad", SAD_RESPONSES],
    ["frustrated", FRUSTRATED_RESPONSES],
    ["confused", CONFUSED_RESPONSES],
    ["surprised", SURPRISED_RESPONSES],
    ["tired", TIRED_RESPONSES],
    ["emotional_fallback", EMOTIONAL_FALLBACK],
    ["weather", WEATHER_RESPONSES],
    ["social", SOCIAL_RESPONSES],
    ["offer_help", OFFER_HELP_RESPONSES],
    ["availability", AVAILABILITY_RESPONSES],
    ["clarify_history", CLARIFY_WITH_HISTORY],
    ["clarify_cold", CLARIFY_COLD],
    ["continuation", CONTINUATION_RESPONSES],
  ];
  for (const [name, variants] of families) {
    if (variants.length < 3) {
      failures.push(`family ${name} has fewer than 3 variants`);
    }
    for (const [i, v] of variants.entries()) {
      if (!v.trim()) failures.push(`family ${name}[${i}] is empty`);
      if (/-/.test(v.replace(/\{[a-z]+\}/g, ""))) {
        failures.push(`family ${name}[${i}] contains a hyphen`);
      }
      if (/\bTODO\b|\bFIXME\b|\.\.\.\.\./.test(v)) {
        failures.push(`family ${name}[${i}] contains placeholder text`);
      }
    }
    const withEmoji = variants.filter((v) =>
      /\p{Extended_Pictographic}/u.test(v),
    ).length;
    if (withEmoji > 0 && withEmoji >= variants.length) {
      failures.push(`family ${name} forces an emoji into every variant`);
    }
  }
  return { ok: failures.length === 0, failures };
}
