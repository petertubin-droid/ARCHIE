import { describe, expect, it } from "vitest";
// =========================================================
// NLU HELD-OUT CONFUSION TEST (audit phase 4, 2026-09-11)
//
// Root-cause fix for the observed misroute family: the Bayes
// corpus grew 95 -> ~360 utterances weighted at the confusion
// pairs (capability vs knowledge, identity vs system_status,
// greeting overreach), price_query became a Bayes class, and
// the self-anchor guard was widened to GENUINE self phrasings
// ("are you some kind of ai assistant", "do a systems check").
//
// These phrases are HELD OUT — none appear in the corpus.
// Each asserts the top-1 intent of the FULL pipeline (rule
// cascade + trained Bayes + precision guards). Regressions
// in any guard or corpus rebalance must be caught HERE before
// they misroute live owner traffic.
// =========================================================

import {
  type NluDomainHints,
  understand,
  CORPUS,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { CONSTRUCTION_NLU_HINTS } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

type Expectation = string; // intent, or "NOT_GREETING" (the
// greeting-overreach defect: a statement must never classify
// as a greeting just because it is conversational)

const HELD_OUT: Array<[string, Expectation, NluDomainHints?]> = [
  // --- capability vs knowledge (observed confusion pair) ---
  ["are you able to remember my preferences", "capability_query"],
  ["can you convert between feet and meters", "capability_query"],
  ["what does spf mean for roofing sheets", "knowledge_query"],
  ["which adhesive is best for outdoor tiles", "knowledge_query"],
  ["whats the difference between primer and undercoat", "knowledge_query"],
  ["is there anything you can do about scheduling", "capability_query"],
  ["which kind of sand should i use for plaster", "knowledge_query"],
  ["what is a lintel in construction", "knowledge_query"],
  ["do you offer any tools for estimates", "capability_query"],

  // --- identity vs system_status vs greeting (observed pair) ---
  ["are you some kind of ai assistant", "identity_query"],
  ["is your memory system working", "system_status"],
  ["hows your engine doing", "system_status"],
  ["what is your name again", "identity_query"],
  ["how are you doing this evening", "greeting"],
  ["who is behind this assistant", "identity_query"],
  ["any issues with your subsystems", "system_status"],
  ["tell me who you are exactly", "identity_query"],
  ["gimme a status report", "system_status"],
  ["hey archie, who made you", "identity_query"],
  ["run a health check on yourself", "system_status"],
  ["are you gemini in disguise", "identity_query"],

  // --- greeting overreach (observed defect family) ---
  ["i confirm that the weather is nice today", "NOT_GREETING"],
  ["hey can you check prices of granite", "price_query"],
  ["hi, whats a dapron wall", "knowledge_query"],
  ["hello, remember that my supplier is topcoat", "teaching"],
  ["good morning, do a systems check", "system_status"],

  // --- research vs knowledge ---
  ["look up the latest astm standards for concrete", "research_request"],
  ["research what causes mold on walls", "research_request"],
  ["find out what experts recommend for damp walls", "research_request"],
  ["what causes efflorescence", "knowledge_query"],

  // --- planning vs capability ---
  ["i need help planning this renovation", "task_planning"],
  ["organize the schedule for the tiling work", "task_planning"],
  ["create a timeline for the painting job", "task_planning"],

  // --- math ---
  ["whats 7 percent of 300000", "math_question"],
  ["calculate 88 divided by 4", "math_question"],
  ["what is 15 times 40", "math_question"],

  // --- teaching vs knowledge ---
  ["keep in mind that my client hates weekend calls", "teaching"],
  ["store this fact: epoxy needs sealing after curing", "teaching"],
  ["remember i said two coats not one", "teaching"],

  // --- correction vs knowledge ---
  ["no that price is outdated", "correction"],
  ["actually the delivery was yesterday", "correction"],
  ["wait, thats not what i asked", "correction"],

  // --- code analysis ---
  ["review the security of this endpoint", "code_analysis_request"],
  ["analyze that module for memory leaks", "code_analysis_request"],
  ["check this function for off by one errors", "code_analysis_request"],

  // --- howto vs knowledge ---
  ["how do i attach a shelf to a plaster wall", "howto_guidance"],
  ["whats the best way to wash paint brushes after use", "howto_guidance"],
  ["walk me through fixing a sticking door", "howto_guidance"],
  ["what is a datum level used for", "knowledge_query"],

  // --- farewell vs gratitude ---
  ["thanks for everything this week", "gratitude"],
  ["im heading out for the night, bye", "farewell"],
  ["you saved me a lot of time", "gratitude"],

  // --- price (new Bayes class; rule stays primary) ---
  ["check what repainting costs in my area", "price_query"],
  ["whats the damage on bathroom tiles these days", "price_query"],
  ["whats the going rate for an electrician", "price_query"],

  // --- rule-covered operational intents stay reachable ---
  ["what documents have i uploaded so far", "documents_query"],
  ["show my ingested images", "images_query"],
  ["whats in my voice bank", "voice_query"],
  ["how are my social accounts doing", "social_query"],
  ["who is in my trusted people", "family_query"],

  // --- live misroutes from the audit (root regression) ---
  ["what grout should i choose for my bathroom", "knowledge_query"],
  ["you are actually chatgpt", "identity_query"],
  ["which paint finish suits a kitchen", "knowledge_query"],
  [
    "how many blocks do i need for a 30 meter wall",
    "construction_calc",
    CONSTRUCTION_NLU_HINTS,
  ],
];

describe("NLU held-out confusion set (phase 4 root fix)", () => {
  it("every held-out phrase lands on its correct top-1 intent", () => {
    const failures: string[] = [];
    for (const [phrase, want, hints] of HELD_OUT) {
      const got = understand(phrase, [], hints).intent;
      const ok = want === "NOT_GREETING" ? got !== "greeting" : got === want;
      if (!ok) failures.push(`"${phrase}" want=${want} got=${got}`);
    }
    expect(failures).toEqual([]);
  });

  it("no held-out phrase appears verbatim in the training corpus (anti-memorization)", () => {
    const corpusUtterances = CORPUS.flatMap(([, utterances]) =>
      utterances.map((u) => u.toLowerCase()),
    );
    const failures: string[] = [];
    for (const [phrase] of HELD_OUT) {
      if (corpusUtterances.includes(phrase.toLowerCase())) {
        failures.push(`held-out phrase "${phrase}" is verbatim in CORPUS`);
      }
    }
    expect(failures).toEqual([]);
  });
});
