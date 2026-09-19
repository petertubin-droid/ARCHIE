import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import {
  understand,
  extractEntities,
  tokenize,
  IntentClassifier,
  INTENTS,
  type Intent,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
import {
  ContextMemory,
  rankFacts,
} from "@studio-shared/archie-ai/native-engine/memory.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  DEFAULT_RULES,
  ReasoningEngine,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import {
  DEFAULT_OPERATORS,
  Planner,
} from "@studio-shared/archie-ai/native-engine/planning.ts";
import {
  CONSTRUCTION_RULES,
  CONSTRUCTION_OPERATORS,
} from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import {
  ToolOrchestrator,
  evaluateExpression,
  registerBuiltInTools,
} from "@studio-shared/archie-ai/native-engine/tools.ts";
import {
  ResearchPipeline,
  type ResearchAdapter,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import {
  analyzeSource,
  generateUnitTestScaffold,
} from "@studio-shared/archie-ai/native-engine/coding.ts";
import { SelfEvaluator } from "@studio-shared/archie-ai/native-engine/selfeval.ts";
import { OutcomeLearner } from "@studio-shared/archie-ai/native-engine/learning.ts";
import {
  nativeEngineCapabilityManifest,
  manifestSummary,
  NATIVE_ENGINE_ID,
} from "@studio-shared/archie-ai/native-engine/capabilities.ts";

// =========================================================
// ARCHIE NATIVE INTELLIGENCE ENGINE — SUBSYSTEM TESTS
//
// Every claim of OPERATIONAL in the capability manifest is
// backed here by a passing, measurable test. No subsystem in
// this file is a mock — the research adapter double is
// explicit test infrastructure, labeled as such.
// =========================================================

// ---------------------------------------------------------
// NLU — measured accuracy over a held-out labeled set
// ---------------------------------------------------------
const HELD_OUT: Array<[Intent, string]> = [
  ["greeting", "hello there archie"],
  ["greeting", "hey good afternoon"],
  ["farewell", "im heading off now bye"],
  ["gratitude", "thanks so much that helped"],
  ["identity_query", "who exactly are you"],
  ["capability_query", "what are you able to do"],
  ["system_status", "is everything operational right now"],
  ["knowledge_query", "what is the meaning of screeding"],
  ["knowledge_query", "explain cement hydration to me"],
  ["howto_guidance", "how do i estimate mortar for blockwork"],
  ["task_planning", "help me plan the phases of this construction job"],
  ["code_analysis_request", "analyze the following source file"],
  ["research_request", "research current price of cement in nigeria"],
  ["math_question", "what is 340 times 22"],
  ["teaching", "remember this fact about concrete"],
  ["correction", "no that is not accurate fix it"],
  // Audit #5 (2026-09-13): the held-out set grows — broader
  // phrasings per intent, plus the intents the audit measured
  // lightly. Every entry below is a NEW utterance, not a
  // paraphrase of a corpus line the classifier memorized.
  ["greeting", "good morning whats the news"],
  ["farewell", "catch you later im done for today"],
  ["gratitude", "that was a big help cheers"],
  ["identity_query", "tell me who you are"],
  ["capability_query", "what can you actually do for me"],
  ["system_status", "give me a status report"],
  ["knowledge_query", "what do you know about curing concrete"],
  ["knowledge_query", "define workability for me"],
  ["howto_guidance", "how can i lay blocks properly"],
  ["howto_guidance", "walk me through mixing mortar"],
  ["task_planning", "i need a plan for building a fence"],
  ["task_planning", "help me organize this project into steps"],
  ["code_analysis_request", "review this typescript snippet for bugs"],
  ["research_request", "look up the current granite price"],
  ["research_request", "search for information on plaster ratios"],
  ["math_question", "how much is 12 bags times 4200 naira"],
  ["math_question", "add 3420 and 998 for me"],
  ["teaching", "learn this the screeding ratio is 1:4"],
  ["teaching", "i want to teach you something new"],
  ["correction", "actually you got that wrong"],
  ["correction", "that is not right here is the correct value"],
  ["price_query", "what is the price of cement"],
  ["price_query", "how much does a bag of cement cost"],
  ["crypto_market_query", "what is the price of bitcoin"],
  ["crypto_market_query", "should i buy eth entry 3000 stop 2800 target 3300"],
];

describe("NLU — natural conversation understanding", () => {
  it("classifies held-out utterances at >= 80% measured accuracy", () => {
    const classifier = new IntentClassifier();
    classifier.train();
    let correct = 0;
    const failures: string[] = [];
    for (const [expected, utterance] of HELD_OUT) {
      const { intent } = classifier.classify(utterance);
      if (intent === expected) correct += 1;
      else failures.push(`"${utterance}" → ${intent} (expected ${expected})`);
    }
    const accuracy = correct / HELD_OUT.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
    // Measurable result surfaced for diagnostics.
    expect(correct).toBeGreaterThan(0);
    if (accuracy < 1)
      console.warn(
        `NLU accuracy: ${(accuracy * 100).toFixed(0)}% — misses: ${failures.join(" | ")}`,
      );
  });

  it("tokenizes and normalizes deterministically", () => {
    expect(tokenize("What is Screeding?")).toEqual(["what", "screeding"]); // "what" stays — it is classification signal
    expect(tokenize("Calculate 12.5 + 7 for me")).toEqual([
      "calculate",
      "12.5",
    ]);
  });

  it("extracts real entities", () => {
    const e = extractEntities(
      "Mix at 25 mm thickness over 40 sqm and see https://example.com/x.ts",
    );
    expect(e.quantities).toContainEqual({ value: 25, unit: "mm" });
    expect(e.urls).toEqual(["https://example.com/x.ts"]);
    expect(
      extractEntities("what is 5 percent of 200").numbers.length,
    ).toBeGreaterThan(0);
  });

  it("understand() runs the full NLU pass with intent + confidence", () => {
    const result = understand("hello archie, what can you do");
    expect(INTENTS).toContain(result.intent);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.tokens.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------
// Context memory — salience-ranked retrieval
// ---------------------------------------------------------
describe("Context memory", () => {
  it("retrieves relevant turns ranked by salience (relevance + recency)", () => {
    const mem = new ContextMemory();
    mem.addTurn(
      "owner",
      "we discussed the screeding mix ratio last month",
      Date.now() - 1000 * 60 * 60 * 24 * 30,
    );
    mem.addTurn("owner", "the cement price quote arrived today", Date.now());
    const result = mem.retrieve("what was the cement price again");
    expect(result.salientTurns.length).toBeGreaterThan(0);
    expect(result.salientTurns[0].text).toContain("cement price quote");
  });

  it("ranks facts by TF-IDF salience against a query", () => {
    const facts = rankFacts("what is screeding", [
      {
        id: "f1",
        subject: "screeding",
        predicate: "definition",
        object: "a thin leveling layer",
        confidence: 0.9,
        provenance: { source: "seed" },
        status: "validated" as const,
        validatedCount: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: "f2",
        subject: "mortar",
        predicate: "definition",
        object: "paste binding masonry",
        confidence: 0.9,
        provenance: { source: "seed" },
        status: "validated" as const,
        validatedCount: 1,
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].subject).toBe("screeding");
  });
});

// ---------------------------------------------------------
// Knowledge — acquisition, contradiction, consolidation
// ---------------------------------------------------------
describe("Knowledge store", () => {
  it("asserts facts with provenance and reinforcement on re-teach", async () => {
    const store = new FactStore();
    const first = await store.assert({
      subject: "screeding",
      predicate: "mix-ratio",
      object: "1:4",
      confidence: 0.8,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    const again = await store.assert({
      subject: "screeding",
      predicate: "mix-ratio",
      object: "1:4",
      confidence: 0.8,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    expect(again.fact.id).toBe(first.fact.id);
    expect(again.fact.validatedCount).toBe(1);
    expect(store.count()).toBe(1);
  });

  it("detects contradictions and parks them as uncertain — never established fact", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "concrete",
      predicate: "curing-days",
      object: "7",
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    const conflict = await store.assert({
      subject: "concrete",
      predicate: "curing-days",
      object: "28",
      confidence: 0.9,
      provenance: { source: "web-research" },
      status: "candidate",
    });
    expect(conflict.conflict).toBeDefined();
    expect(conflict.fact.status).toBe("uncertain");
    expect(
      store.query({ subject: "concrete", predicate: "curing-days" }).length,
    ).toBe(2);
  });

  it("consolidates: merges duplicates, decays, promotes, drops", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "dup",
      predicate: "p",
      object: "v",
      confidence: 0.5,
      provenance: { source: "seed" },
      status: "candidate",
    });
    await store.assert({
      subject: "weak",
      predicate: "p",
      object: "v",
      confidence: 0.1,
      provenance: { source: "web-research" },
      status: "candidate",
    });
    const result = await store.consolidate();
    expect(result.dropped).toBe(1); // weak unvalidated fact dropped
    expect(store.count()).toBe(1);
  });
});

// ---------------------------------------------------------
// Reasoning — forward chaining with confidence + traces
// ---------------------------------------------------------
describe("Reasoning engine", () => {
  async function seededStore() {
    const store = new FactStore();
    await store.assert({
      subject: "cement",
      predicate: "bag-mass",
      object: "50 kg",
      confidence: 0.95,
      provenance: { source: "seed" },
      status: "validated",
    });
    return store;
  }

  it("derives new facts via forward chaining with confidence propagation", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    const result = await reasoning.forwardChain();
    const derived = store.query({ subject: "cement", predicate: "bag-volume" });
    expect(derived.length).toBe(1);
    // confidence = min(premise 0.95) × rule weight 0.95
    expect(derived[0].confidence).toBeCloseTo(0.9025, 3);
    expect(result.explanations.length).toBeGreaterThan(0);
    const explanation = result.explanations.find(
      (e) => e.ruleId === "rule_cement_bag_standard",
    );
    expect(explanation?.premiseFacts[0].predicate).toBe("bag-mass");
  });

  it("backward goal checking reports when a goal is reachable", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    const reachable = reasoning.canReach({
      subject: "cement",
      predicate: "bag-volume",
    });
    expect(reachable.holds).toBe(true);
    const notReachable = reasoning.canReach({
      subject: "quantum",
      predicate: "entanglement",
    });
    expect(notReachable.holds).toBe(false);
  });
});

// ---------------------------------------------------------
// Planning — means-ends analysis with honest gaps
// ---------------------------------------------------------
describe("Planner", () => {
  async function planningStore() {
    const store = new FactStore();
    await store.assert({
      subject: "project",
      predicate: "scope-defined",
      object: "bungalow build",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "validated",
    });
    return store;
  }

  it("produces an executable plan when preconditions hold", async () => {
    const store = await planningStore();
    const planner = new Planner(store, [
      ...DEFAULT_OPERATORS,
      ...CONSTRUCTION_OPERATORS,
    ]);
    const plan = planner.plan("planned");
    expect(plan.executable).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].operatorId).toBe("op_plan_project_phases");
  });

  it("reports missing preconditions honestly instead of faking a plan", async () => {
    const store = new FactStore(); // empty — no preconditions
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("planned");
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------
// Tools — deterministic arithmetic + honest failures
// ---------------------------------------------------------
describe("Tool orchestration", () => {
  it("evaluates arithmetic deterministically (shunting-yard)", () => {
    expect(evaluateExpression("25 * 48")).toBe(1200);
    expect(evaluateExpression("15 + 7 * 3")).toBe(36); // precedence honored
    expect(evaluateExpression("348 / 12")).toBe(29);
    expect(evaluateExpression("5 + (3 * (2 + 1))")).toBe(14);
    expect(evaluateExpression("10 % 3")).toBe(1);
    expect(() => evaluateExpression("10 / 0")).toThrow(/division by zero/);
  });

  it("dispatches with contract validation and honest errors", async () => {
    const tools = new ToolOrchestrator();
    registerBuiltInTools(tools);
    const ok = await tools.invoke("arithmetic", { expression: "2 + 2" });
    expect(ok.ok).toBe(true);
    expect(ok.output).toBe(4);
    const missing = await tools.invoke("arithmetic", {});
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("missing required parameter");
    const unknown = await tools.invoke("nonexistent", {});
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("not registered");
  });
});

// ---------------------------------------------------------
// Web research — pipeline with an EXPLICIT TEST ADAPTER
// (test infrastructure; the real production adapter is the
// fetch-based DuckDuckGoLiteAdapter)
// ---------------------------------------------------------
describe("Web research pipeline", () => {
  const testAdapter: ResearchAdapter = {
    id: "test-adapter (labeled test double)",
    async search(query: string) {
      return {
        hits: [
          {
            title: `Result about ${query}`,
            url: `https://example.org/${encodeURIComponent(query)}`,
            snippet: `This page discusses ${query} in detail with verified figures.`,
          },
        ],
        note: "test adapter — no network",
      };
    },
  };

  it("runs search → cross-check → store-as-candidate (never fact)", async () => {
    const store = new FactStore();
    const pipeline = new ResearchPipeline(store, testAdapter);
    const report = await pipeline.research("portland cement price trends");
    expect(report.searched).toBe(true);
    expect(report.hits.length).toBe(1);
    expect(report.storedKnowledge).toBe(1);
    const stored = store.query({
      subject: "portland cement price trends",
      predicate: "web-finding",
    });
    expect(stored.length).toBe(1);
    expect(stored[0].status).toBe("candidate"); // NEVER established fact without validation
    expect(stored[0].confidence).toBeLessThanOrEqual(0.45);
  });
});

// ---------------------------------------------------------
// Coding intelligence — real static analysis + scaffolds
// ---------------------------------------------------------
describe("Coding intelligence", () => {
  const sample = `import { add } from "./math";
export function total(items: number[]): number {
  let sum = 0;
  for (const i of items) {
    if (i > 0) { sum += i; } else { sum -= i; }
  }
  // TODO: handle empty input
  return sum;
}
export class Ledger { save(): void { /* noop */ } }
`;

  it("analyzes source deterministically: structure, complexity, risks", () => {
    const analysis = analyzeSource("ledger.ts", sample);
    expect(analysis.imports).toContain("./math");
    expect(analysis.exports).toContain("total");
    expect(analysis.exports).toContain("Ledger");
    expect(analysis.functions.length).toBe(1);
    expect(analysis.classes).toEqual(["Ledger"]);
    expect(analysis.complexity.cyclomatic).toBeGreaterThanOrEqual(3); // for + if + else
    expect(analysis.todoCount).toBe(1);
    expect(analysis.risks.some((r) => r.includes("TODO"))).toBe(true);
  });

  it("generates a deterministic unit-test scaffold from analysis", () => {
    const analysis = analyzeSource("ledger.ts", sample);
    const scaffold = generateUnitTestScaffold("src/ledger.ts", analysis);
    expect(scaffold).toContain('from "@/ledger"');
    expect(scaffold).toContain('describe("src/ledger.ts"');
    expect(scaffold).toContain('it("calls total without crashing"');
    expect(scaffold).toContain("Generated by ARCHIE Native Engine");
  });
});

// ---------------------------------------------------------
// Self-evaluation
// ---------------------------------------------------------
describe("Self-evaluation", () => {
  it("scans for contradictions and counts them", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "x",
      predicate: "p",
      object: "1",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "validated",
    });
    await store.assert({
      subject: "x",
      predicate: "p",
      object: "2",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "candidate",
    });
    const evaluator = new SelfEvaluator();
    const { conflicts, checked } = evaluator.scanContradictions(store);
    expect(conflicts.length).toBe(1);
    expect(checked).toBe(2);
    expect(evaluator.stats().contradictionsCaught).toBe(1);
  });

  it("rejects responses citing non-existent facts", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "a",
      predicate: "b",
      object: "c",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "validated",
    });
    const evaluator = new SelfEvaluator();
    const bad = evaluator.verifyResponse(["ghost_fact"], store, false);
    expect(bad.passed).toBe(false);
    const good = evaluator.verifyResponse([store.list()[0].id], store, false);
    expect(good.passed).toBe(true);
  });

  it("validates plans against known operators", () => {
    const evaluator = new SelfEvaluator();
    const ok = evaluator.validatePlan(
      {
        goal: "g",
        steps: [
          {
            operatorId: "op_analyze_code",
            achieves: "x",
            satisfies: "y",
            missingPreconditions: [],
          },
        ],
        executable: true,
        totalCost: 2,
        gapReport: [],
        alternatives: [],
        risk: { level: "low", notes: [] },
      },
      ["op_analyze_code"],
    );
    expect(ok.passed).toBe(true);
    const gap = evaluator.validatePlan(
      {
        goal: "g",
        steps: [],
        executable: false,
        totalCost: 0,
        alternatives: [],
        risk: { level: "low", notes: [] },
        gapReport: ["missing: project scope-defined"],
      },
      [],
    );
    expect(gap.passed).toBe(false);
  });
});

// ---------------------------------------------------------
// Learning — reinforcement from validated outcomes
// ---------------------------------------------------------
describe("Outcome learning", () => {
  it("success strengthens contributing facts and promotes them", async () => {
    const store = new FactStore();
    const { fact } = await store.assert({
      subject: "screeding",
      predicate: "thickness",
      object: "40 mm",
      confidence: 0.55,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    const learner = new OutcomeLearner(store);
    await learner.record({
      kind: "success",
      task: "answer about screeding",
      contributing: [fact.id],
    });
    await learner.record({
      kind: "success",
      task: "answer again",
      contributing: [fact.id],
    });
    const updated = store.get(fact.id)!;
    expect(updated.confidence).toBeGreaterThan(0.55);
    expect(updated.validatedCount).toBeGreaterThanOrEqual(2);
    expect(updated.status).toBe("validated"); // promoted after 2 validations
    expect(learner.count()).toBe(2);
  });

  it("failure and correction weaken knowledge — no silent retention of wrong facts", async () => {
    const store = new FactStore();
    const { fact } = await store.assert({
      subject: "bad",
      predicate: "claim",
      object: "wrong",
      confidence: 0.9,
      provenance: { source: "web-research" },
      status: "candidate",
    });
    const learner = new OutcomeLearner(store);
    await learner.record({
      kind: "correction",
      task: "owner correction",
      contributing: [fact.id],
    });
    const updated = store.get(fact.id)!;
    expect(updated.confidence).toBeLessThan(0.9);
    expect(updated.status).toBe("uncertain");
  });

  it("improve() consolidates the store", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "a",
      predicate: "p",
      object: "v",
      confidence: 0.05,
      provenance: { source: "web-research" },
      status: "candidate",
    });
    const learner = new OutcomeLearner(store);
    const result = await learner.improve();
    expect(result.dropped).toBe(1);
  });
});

// ---------------------------------------------------------
// Capability manifest — honesty is structural
// ---------------------------------------------------------
describe("Capability manifest", () => {
  it("maps all thirteen foundational processing layers the owner directed", () => {
    const manifest = nativeEngineCapabilityManifest();
    // 13 directed capabilities (coding analysis+generation share ids)
    expect(manifest.length).toBeGreaterThanOrEqual(13);
    const ids = manifest.map((c) => c.id);
    for (const required of [
      "natural-conversation",
      "reasoning",
      "context-management",
      "persistent-memory-retrieval",
      "knowledge-acquisition",
      "planning",
      "coding-intelligence-analysis",
      "coding-intelligence-generation",
      "tool-orchestration",
      "web-research",
      "self-evaluation",
      "outcome-learning",
      "generative-language-model",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("claims OPERATIONAL only with a measuredBy — and discloses NOT_IMPLEMENTED honestly", () => {
    // HONEST GATE STRENGTHENED (owner directive 2026-09-14):
    // the old proxy ("measuredBy contains 'native-engine'")
    // predates the platform deepenings — trading, security,
    // voice, whatsapp and recovery capabilities are measured
    // by their OWN suites in this directory, which are
    // native-engine/platform tests importing the ARCHIE
    // codebase. The real honesty contract is stronger: every
    // OPERATIONAL claim must name at least one REAL test file
    // that exists in this suite. A measuredBy naming a file
    // that does not exist fails here — no unmeasured
    // OPERATIONAL claims can ship.
    const testDir = `${process.cwd()}/src/lib/archie/__tests__`;
    const existing = new Set(
      readdirSync(testDir).filter((f) => f.endsWith(".test.ts")),
    );
    for (const capability of nativeEngineCapabilityManifest()) {
      expect(capability.measuredBy.length).toBeGreaterThan(0);
      if (capability.maturity === "OPERATIONAL") {
        const named = capability.measuredBy.match(/[\w.-]+\.test\.ts/g);
        expect(named?.length ?? 0).toBeGreaterThan(0);
        for (const f of named ?? []) {
          expect(existing.has(f)).toBe(true);
        }
      }
    }
    const notImplemented = nativeEngineCapabilityManifest().filter(
      (c) => c.maturity === "NOT_IMPLEMENTED",
    );
    expect(notImplemented.length).toBeGreaterThan(0); // open-ended generative LM — disclosed
    expect(notImplemented[0].description).toContain("NOT implemented");
  });

  it("exposes the honest engine id", () => {
    expect(NATIVE_ENGINE_ID).toBe("archie-native-engine");
    const summary = manifestSummary(nativeEngineCapabilityManifest());
    expect(summary.operational).toBeGreaterThan(0);
  });
});
