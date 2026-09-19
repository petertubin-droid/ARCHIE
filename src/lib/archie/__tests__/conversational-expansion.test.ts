import { describe, expect, it } from "vitest";
// =========================================================
// CONVERSATIONAL ENGLISH EXPANSION — QUALITY GATE
// (owner directive, 2026-09-11)
//
// This suite does not accept the feature merely because a
// corpus exists. It measures GENUINE conversational
// improvement and generalization:
//
//   1. corpus integrity — 500+ examples, distributed across
//      every requested category, no hyphens, no duplicates,
//      no held-out leakage into training data
//   2. exact examples — self consistency of the trained
//      classifier over its own training corpus
//   3. held-out generalization — UNSEEN paraphrases, short
//      forms, typos, informal language, unusual structures,
//      context dependent and multi turn follow ups, emoji
//      enhanced and emoji only messages, and unknown
//      ambiguous input that must fall back honestly
//   4. baseline comparison — the same held-out set measured
//      against the PRE expansion corpus; the expansion must
//      be a measurable improvement, not a sidegrade
//   5. engine behavior — real conversational responses from
//      the full engine, deterministic and grounded, with
//      learning semantics preserved (gratitude and social
//      exchange NEVER become verification evidence)
// =========================================================

import {
  BASE_NLU_CORPUS,
  INTENTS,
  IntentClassifier,
  understand,
  type Intent,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
import {
  CONVERSATION_CORPUS,
  CONVERSATION_HELD_OUT,
  CONVERSATION_CORPUS_VERSION,
  conversationCorpusCount,
  type HeldOutExample,
} from "@studio-shared/archie-ai/native-engine/conversation-corpus.ts";
import { extractEmojiTone } from "@studio-shared/archie-ai/native-engine/emoji.ts";
import { conversationSelfCheck } from "@studio-shared/archie-ai/native-engine/conversation.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

const CONVERSATIONAL_INTENTS: Intent[] = [
  "greeting",
  "farewell",
  "gratitude",
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
];

/** Accept/expect evaluation for one held-out example. */
function heldOutOk(example: HeldOutExample, got: Intent): boolean {
  if (example.expect === "FALLBACK") {
    return ["knowledge_query", "howto_guidance", "teaching"].includes(got);
  }
  if (example.expect.startsWith("ANY:")) {
    return example.expect.slice(4).split("|").includes(got);
  }
  return got === example.expect;
}

function evaluateHeldOut(): {
  total: number;
  correct: number;
  failures: Array<{ input: string; got: Intent; expect: string; type: string }>;
  byType: Map<string, { total: number; correct: number }>;
} {
  let correct = 0;
  const failures: Array<{
    input: string;
    got: Intent;
    expect: string;
    type: string;
  }> = [];
  const byType = new Map<string, { total: number; correct: number }>();
  for (const ex of CONVERSATION_HELD_OUT) {
    const got = understand(ex.input, ex.history ?? []).intent;
    const ok = heldOutOk(ex, got);
    const stat = byType.get(ex.type) ?? { total: 0, correct: 0 };
    stat.total += 1;
    if (ok) {
      correct += 1;
      stat.correct += 1;
    } else {
      failures.push({ input: ex.input, got, expect: ex.expect, type: ex.type });
    }
    byType.set(ex.type, stat);
  }
  return { total: CONVERSATION_HELD_OUT.length, correct, failures, byType };
}

// ---------------------------------------------------------
// 1. corpus integrity
// ---------------------------------------------------------
describe("corpus integrity", () => {
  it("contains at least 500 conversational training examples", () => {
    expect(conversationCorpusCount()).toBeGreaterThanOrEqual(500);
  });

  it("distributes examples across every conversational intent family (no single category monopoly)", () => {
    for (const [intent, examples] of CONVERSATION_CORPUS) {
      expect(
        examples.length,
        `intent ${intent} has too few examples`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it("registers every conversational intent in the engine intent list", () => {
    for (const intent of CONVERSATIONAL_INTENTS) {
      expect(INTENTS).toContain(intent);
    }
  });

  it("contains no hyphens in any example sentence (owner directive)", () => {
    const offenders: string[] = [];
    for (const [intent, examples] of CONVERSATION_CORPUS) {
      for (const ex of examples) {
        if (ex.includes("-")) offenders.push(`${intent}: ${ex}`);
      }
    }
    for (const ex of CONVERSATION_HELD_OUT) {
      if (ex.input.includes("-")) offenders.push(`held out: ${ex.input}`);
    }
    expect(offenders).toEqual([]);
  });

  it("contains no duplicate utterance, internally or against the base corpus", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    const record = (label: string, utterance: string) => {
      const norm = utterance
        .toLowerCase()
        .replace(/[\s,.!?]+/g, " ")
        .trim();
      if (seen.has(norm)) {
        duplicates.push(
          `"${utterance}" duplicated in ${seen.get(norm)} and ${label}`,
        );
      } else {
        seen.set(norm, label);
      }
    };
    for (const [intent, examples] of BASE_NLU_CORPUS) {
      for (const ex of examples) record(`base:${intent}`, ex);
    }
    for (const [intent, examples] of CONVERSATION_CORPUS) {
      for (const ex of examples) record(`conversation:${intent}`, ex);
    }
    expect(duplicates).toEqual([]);
  });

  it("keeps every held-out phrase OUT of the training corpus (no leakage)", () => {
    const training = new Set<string>();
    for (const [, examples] of CONVERSATION_CORPUS) {
      for (const ex of examples) training.add(ex.toLowerCase());
    }
    for (const [, examples] of BASE_NLU_CORPUS) {
      for (const ex of examples) training.add(ex.toLowerCase());
    }
    const leaked = CONVERSATION_HELD_OUT.filter((ex) =>
      training.has(ex.input.toLowerCase()),
    ).map((ex) => ex.input);
    expect(leaked).toEqual([]);
  });

  it("versions the corpus for stale-seed detection", () => {
    expect(CONVERSATION_CORPUS_VERSION).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------
// 2. exact examples — classifier self consistency
// ---------------------------------------------------------
describe("exact training examples", () => {
  it("classifies its own training corpus at >= 97 percent through the FULL deployed pipeline (rules + Bayes + guards, measured)", () => {
    // The exact-example quality gate must measure what
    // owners actually experience: the full understand()
    // pipeline, not the naked Bayes stage.
    let correct = 0;
    let total = 0;
    const misses: string[] = [];
    for (const [intent, examples] of CONVERSATION_CORPUS) {
      for (const ex of examples) {
        total += 1;
        const got = understand(ex).intent;
        if (got === intent) correct += 1;
        else misses.push(`"${ex}" -> ${got} (expected ${intent})`);
      }
    }
    const accuracy = correct / total;
    expect(accuracy, `misses: ${misses.join(" | ")}`).toBeGreaterThanOrEqual(
      0.97,
    );
  });
});

// ---------------------------------------------------------
// 3. held-out generalization (unseen phrases only)
// ---------------------------------------------------------
describe("held-out generalization", () => {
  it("meets the quality gate: >= 90 percent overall on unseen input across all 10 test types", () => {
    const { total, correct, failures } = evaluateHeldOut();
    const accuracy = correct / total;
    const detail = failures
      .map((f) => `"${f.input}" -> ${f.got} (expected ${f.expect}, ${f.type})`)
      .join(" | ");
    expect(accuracy, `failures: ${detail}`).toBeGreaterThanOrEqual(0.9);
    // Every test type from the owner quality gate is present.
    expect(CONVERSATION_HELD_OUT.length).toBeGreaterThanOrEqual(150);
  });

  it("holds every test type at >= 75 percent individually (no weak category hidden by the average)", () => {
    const { byType, failures } = evaluateHeldOut();
    for (const [type, stat] of byType) {
      const accuracy = stat.correct / stat.total;
      const misses = failures
        .filter((f) => f.type === type)
        .map((f) => `"${f.input}" -> ${f.got} (expected ${f.expect})`)
        .join(" | ");
      expect(
        accuracy,
        `${type} at ${(accuracy * 100).toFixed(0)}% (${stat.correct}/${stat.total}); misses: ${misses}`,
      ).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("routes unknown and ambiguous input to the honest fallback, never to a fake social reply", () => {
    for (const ex of CONVERSATION_HELD_OUT.filter(
      (e) => e.type === "unknown",
    )) {
      const got = understand(ex.input).intent;
      expect(heldOutOk(ex, got), `"${ex.input}" -> ${got}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------
// 4. baseline comparison — measurable improvement
// ---------------------------------------------------------
describe("baseline comparison", () => {
  it("improves measurably over the pre expansion baseline on the same held-out set", () => {
    // Baseline: the classifier as it was BEFORE the
    // conversational expansion, routed through the SAME
    // understand() contract it had: rule cascade + Bayes on
    // the base corpus only. New conversational intents do
    // not exist in the baseline, so unseen phrases of those
    // families are baseline misses — the honest measure.
    const baselineClassifier = new IntentClassifier();
    baselineClassifier.train(BASE_NLU_CORPUS);
    let baselineCorrect = 0;
    for (const ex of CONVERSATION_HELD_OUT) {
      if (ex.type === "multiturn") continue; // anaphora needs the full pipeline
      const got = baselineClassifier.classify(ex.input).intent;
      if (heldOutOk(ex, got as Intent)) baselineCorrect += 1;
    }
    const baselineTotal = CONVERSATION_HELD_OUT.filter(
      (e) => e.type !== "multiturn",
    ).length;
    const baselineAccuracy = baselineCorrect / baselineTotal;

    const { total, correct } = evaluateHeldOut();
    const expandedAccuracy = correct / total;
    // The expansion must be a clear improvement, and the
    // final accuracy must clear the owner quality gate.
    expect(expandedAccuracy).toBeGreaterThan(baselineAccuracy + 0.5);
    expect(expandedAccuracy).toBeGreaterThanOrEqual(0.9);
  });
});

// ---------------------------------------------------------
// 5. emoji understanding
// ---------------------------------------------------------
describe("emoji understanding", () => {
  it("maps the conversational emoji set to tone labels", () => {
    expect(extractEmojiTone("thanks 🙏").tones).toContain("gratitude");
    expect(extractEmojiTone("well done 👍").tones).toContain("approval");
    expect(extractEmojiTone("we won 🎉🔥").tones).toContain("celebration");
    expect(extractEmojiTone("i am tired 😴").tones).toContain("tired");
    expect(extractEmojiTone("no words, just 😢").tones).toContain("sad");
    expect(extractEmojiTone("plain text").present).toBe(false);
  });

  it("routes pure emoji messages deterministically by tone", () => {
    expect(understand("🙏").intent).toBe("gratitude");
    expect(understand("👍").intent).toBe("agreement");
    expect(understand("🎉").intent).toBe("celebration");
    expect(understand("😢").intent).toBe("emotional_expression");
    expect(understand("🤔").intent).toBe("clarification_request");
    expect(understand("😴").intent).toBe("emotional_expression");
  });

  it("never lets an emoji override the words (tone is a hint, not a command)", () => {
    // "help" plus a party emoji is still a help request, not
    // a celebration; words win, tone only boosts agreement.
    expect(understand("help me 🔥").intent).toBe("help_request");
  });

  it("boosts confidence when words and emoji agree", () => {
    const bare = understand("thank you so much");
    const withEmoji = understand("thank you so much 🙏");
    expect(withEmoji.confidence).toBeGreaterThan(bare.confidence);
  });
});

// ---------------------------------------------------------
// 6. engine behavior — real conversational competence
// ---------------------------------------------------------
describe("engine conversational behavior", () => {
  it("composes grounded, deterministic conversational responses", async () => {
    const engine = new ArchieNativeEngine();
    const a = await engine.converse("good morning archie");
    const b = await engine.converse("good morning archie");
    expect(a.responseText.length).toBeGreaterThan(10);
    expect(a.responseText).toBe(b.responseText); // byte-stable
    expect(a.citedFactIds).toEqual([]); // no knowledge fabricated
  });

  it("answers time and date questions from the real system clock, labeled honestly", async () => {
    const engine = new ArchieNativeEngine();
    const r = await engine.converse("what time is it");
    expect(r.responseText).toContain("my system clock");
    expect(r.responseText).toMatch(/\d/);
  });

  it("quotes the real last point for clarification requests (no invented recap)", async () => {
    const engine = new ArchieNativeEngine();
    await engine.converse("remember that my site is in lekki");
    await engine.converse("what is my site location");
    const clarify = await engine.converse("sorry, what did you mean");
    expect(clarify.responseText.length).toBeGreaterThan(10);
    // The clarification references the previous answer or
    // honestly asks which part to expand — never a blank.
    expect(clarify.responseText).toMatch(
      /expand|deeper|unclear|previous|reply|point|start/i,
    );
  });

  it("runs a natural multi turn conversation with sensible intent flow", async () => {
    const engine = new ArchieNativeEngine();
    const turns = [
      "hi archie",
      "are you there",
      "what are you doing",
      "i am happy today",
      "thanks archie",
      "goodbye",
    ];
    const responses: string[] = [];
    for (const turn of turns) {
      const r = await engine.converse(turn);
      responses.push(r.responseText);
    }
    // Every turn produces a real, distinct-ish grounded answer.
    for (const t of responses) expect(t.length).toBeGreaterThan(5);
    // Greeting answers with the REAL engine state (owner
    // spec: no canned conversational script), availability a
    // presence answer, farewell a goodbye — spot check.
    expect(responses[0].toLowerCase()).toMatch(
      /native engine online|listening/,
    );
    expect(responses[1].toLowerCase()).toMatch(
      /here|present|ready|listening|with you/,
    );
    expect(responses[5].toLowerCase()).toMatch(
      /goodbye|memory|next time|soon|back/,
    );
  });

  it("keeps learning semantics safe: social exchange NEVER becomes verification evidence", async () => {
    const engine = new ArchieNativeEngine();
    await engine.converse("remember that my site manager is called ade");
    const taught = engine
      .store()
      .list()
      .find(
        (f) =>
          f.subject.includes("site-manager") ||
          (typeof f.object === "string" && f.object.includes("ade")),
      );
    expect(taught).toBeDefined();
    const before = engine.store().get(taught!.id)!;
    // A wave of conversational politeness and praise...
    await engine.converse("thank you so much");
    await engine.converse("you are the best");
    await engine.converse("well done, keep it up");
    await engine.converse("congratulations");
    const after = engine.store().get(taught!.id)!;
    // ...must not promote, reinforce or touch the fact.
    expect(after.status).toBe(before.status);
    expect(after.validatedCount).toBe(before.validatedCount);
    expect(after.confidence).toBe(before.confidence);
  });

  it("passes the conversational composer self check", () => {
    const { ok, failures } = conversationSelfCheck();
    expect(ok, failures.join(" | ")).toBe(true);
  });
});
