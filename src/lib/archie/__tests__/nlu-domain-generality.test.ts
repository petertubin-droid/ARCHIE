import { describe, expect, it } from "vitest";
// =========================================================
// NLU DOMAIN GENERALITY TEST (audit Phase 3.1, 2026-09-11)
//
// The Bayes corpus grew construction-heavy: howto_guidance
// was ~90% construction/DIY, research_request ~77%,
// knowledge_query ~95%. The classifier was learning DOMAIN
// TOKENS as intent signatures — general-domain utterances
// ("how do i roast a chicken") misrouted or routed with
// collapsed confidence, because unseen domain tokens let
// other class priors win the token-prior fight.
//
// Root fix (this phase): corpus rebalanced across domains
// (construction stays ONE domain among many — FRELUX's own
// domain, but no monopoly), the teaching rule no longer
// over-captures "teach me how to X" (user LEARNING a
// procedure = howto, not ARCHIE-teaching), and
// construction_calc requires a QUANTITY signal (digit / how
// many / how much / cubic|square|area|volume) — "steps to
// build a block wall" and "how do i paint a room" are
// HOW-TO questions, not calculations.
//
// This test holds ALL THREE fixes:
//  (1) general-domain held-out probes route correctly —
//      generalization, not memorization (none of these
//      appear in the corpus, asserted below);
//  (2) construction-domain routing did NOT regress;
//  (3) per-intent construction share of the corpus stays
//      capped — the de-bias cannot silently erode.
// =========================================================

import {
  type NluDomainHints,
  understand,
  CORPUS,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { CONSTRUCTION_NLU_HINTS } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

// --- (1) GENERAL-DOMAIN probes (held out: none are corpus
// examples — cooking, gardening, tech, fitness, finance,
// travel, health, sports, science, admin). ---
const GENERAL_PROBES: Array<[string, string]> = [
  ["how do i knead bread dough properly", "howto_guidance"],
  ["steps to plant tomato seeds", "howto_guidance"],
  ["how to set up a gmail account", "howto_guidance"],
  ["walk me through changing a bicycle tire", "howto_guidance"],
  ["how do i roast a chicken", "howto_guidance"],
  ["guide me through pruning rose bushes", "howto_guidance"],
  ["how to start learning the piano", "howto_guidance"],
  ["how do i back up my laptop", "howto_guidance"],
  ["best way to cook jasmine rice", "howto_guidance"],
  ["how to train for a 5k run", "howto_guidance"],
  ["teach me how to iron a shirt", "howto_guidance"], // teaching-rule over-capture regression
  ["how do i change the oil in my car", "howto_guidance"],
  ["research the best laptop for video editing", "research_request"],
  ["search for cheap flights to accra", "research_request"],
  ["find information about meditation benefits", "research_request"],
  ["look up reviews of electric cars", "research_request"],
  ["research the history of the roman empire", "research_request"],
  ["search the web for beginner cameras", "research_request"],
  ["find out what causes migraines", "research_request"],
  ["research scholarship options for graduate school", "research_request"],
  ["look up the rules for a tourist visa", "research_request"],
  ["search for healthy breakfast recipes", "research_request"],
  ["what is photosynthesis", "knowledge_query"],
  ["explain how inflation works", "knowledge_query"],
  ["whats the difference between a virus and bacteria", "knowledge_query"],
  ["tell me about the french revolution", "knowledge_query"],
  ["what does bandwidth mean", "knowledge_query"],
  ["explain how compound interest works", "knowledge_query"],
  ["what is the capital of ghana", "knowledge_query"],
  ["which laptop brand is most reliable", "knowledge_query"],
  ["tell me about the amazon rainforest", "knowledge_query"],
  ["what causes a sore throat", "knowledge_query"],
  ["explain the rules of offside in football", "knowledge_query"],
  ["what is a mutual fund", "knowledge_query"],
  ["help me plan my revision timetable", "task_planning"],
  ["plan my relocation to ibadan", "task_planning"],
  ["break my thesis work into steps", "task_planning"],
  ["create a plan for learning spanish", "task_planning"],
  ["help me organize a wedding reception", "task_planning"],
  ["make a schedule for my job search", "task_planning"],
];

// --- (2) CONSTRUCTION probes (held out too — near-variants
// of corpus examples, never verbatim). FRELUX's own domain
// must not lose routing quality to the rebalance. ---
const CONSTRUCTION_PROBES: Array<[string, string, NluDomainHints?]> = [
  ["how do i screed a floor level", "howto_guidance"],
  ["steps to build a block wall", "howto_guidance"], // calc-rule over-capture regression
  ["walk me through painting an exterior wall", "howto_guidance"],
  ["research current prices of rebar", "research_request"],
  ["find information about dpc membranes", "research_request"],
  ["what is the standard curing time for concrete", "knowledge_query"],
  ["explain what a lintel does", "knowledge_query"],
  ["help me organize the bathroom tiling job", "task_planning"],
  ["teach me how to mix plaster", "howto_guidance"], // must be howto, NOT teaching
  ["teach yourself this rule: always check the level", "teaching"], // ARCHIE-teaching stays teaching
  ["remember that my site manager is tunde", "teaching"],
  // genuine calc still routes — through the construction skill's
  // NLU rules, wired exactly as the engine wires them
  [
    "how many blocks for a 12 by 10 wall",
    "construction_calc",
    CONSTRUCTION_NLU_HINTS,
  ],
];

// --- (3) Construction-lexicon for the corpus-share cap. ---
const CONSTRUCTION_LEXICON = [
  "block",
  "bricks",
  "cement",
  "concrete",
  "tile",
  "grout",
  "screed",
  "plaster",
  "mortar",
  "lintel",
  "dapron",
  "waterproof",
  "damp",
  "renovation",
  "construction",
  "granite",
  "rebar",
  "scaffold",
  "laterite",
  "quarry",
  "tiling",
  "roofing",
  "foundation",
  "building",
  "wall",
  "roof",
  "paint",
  "site",
];
// Caps chosen at Phase 3.1 balance (actual shares: knowledge
// 0.45, howto 0.34, research 0.32, task 0.22) plus modest
// headroom for organic corpus growth. The caps exist so the
// skew can never creep back toward monopoly.
const SHARE_CAPS: Record<string, number> = {
  howto_guidance: 0.45,
  research_request: 0.45,
  knowledge_query: 0.55,
  task_planning: 0.45,
};

describe("NLU domain generality (audit Phase 3.1)", () => {
  it("no held-out probe appears verbatim in the training corpus", () => {
    const corpusText = JSON.stringify(CORPUS).toLowerCase();
    for (const [probe] of [...GENERAL_PROBES, ...CONSTRUCTION_PROBES]) {
      expect(
        corpusText.includes('"' + probe.toLowerCase() + '"'),
        `probe leaked into corpus: "${probe}"`,
      ).toBe(false);
    }
  });

  it("general-domain held-out probes route to the correct intent", () => {
    for (const [text, expected] of GENERAL_PROBES) {
      const got = understand(text);
      expect(
        got.intent,
        `"${text}" -> ${got.intent} (conf ${got.confidence.toFixed(2)}), expected ${expected}`,
      ).toBe(expected);
    }
  });

  it("construction-domain routing did not regress", () => {
    for (const [text, expected, hints] of CONSTRUCTION_PROBES) {
      const got = understand(text, [], hints);
      expect(
        got.intent,
        `"${text}" -> ${got.intent}, expected ${expected}`,
      ).toBe(expected);
    }
  });

  it("the corpus stays domain-balanced — construction share per intent is capped", () => {
    for (const [intent, examples] of CORPUS) {
      const cap = SHARE_CAPS[intent];
      if (cap === undefined) continue;
      const construction = examples.filter((e) =>
        CONSTRUCTION_LEXICON.some((w) => e.includes(w)),
      ).length;
      const share = construction / examples.length;
      expect(
        share,
        `${intent} construction share ${share.toFixed(2)} exceeds cap ${cap} — corpus is re-skewing`,
      ).toBeLessThanOrEqual(cap);
    }
  });
});
