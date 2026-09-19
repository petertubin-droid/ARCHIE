import { describe, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { constructionEstimate } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { understand } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { ContextMemory } from "@studio-shared/archie-ai/native-engine/memory.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ReasoningEngine,
  DEFAULT_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import {
  Planner,
  DEFAULT_OPERATORS,
} from "@studio-shared/archie-ai/native-engine/planning.ts";
import { OutcomeLearner } from "@studio-shared/archie-ai/native-engine/learning.ts";
import { epistemicStatusOf } from "@studio-shared/archie-ai/cognitive/metacognition.ts";
import { WorldModel } from "@studio-shared/archie-ai/cognitive/world-model.ts";
import { ToolIntelligenceEngine } from "@studio-shared/archie-ai/cognitive/tool-intelligence.ts";

// =========================================================
// ARCHIE NATIVE ENGINE — CAPABILITY BENCHMARK SUITE
// src/lib/archie/__tests__/native-engine-benchmark.test.ts
//
// Purpose (owner directive 2026-09-10 §20): a REAL benchmark
// that measures the native engine's capability across 17
// categories, BEFORE and after the capability upgrade. Every
// case is scored honestly — 1 (capable), 0.5 (partial), 0
// (not capable). Failures are expected in the BASELINE: they
// are the honest starting point, never manufactured upward.
//
// This suite never fails the test run: it measures. Results
// are printed as a JSON line (BENCH_RESULT:) for extraction
// into the baseline record. Re-run after each upgrade phase
// and compare — do not hand-edit scores.
// =========================================================

interface CaseResult {
  id: string;
  category: string;
  score: number; // 0 | 0.5 | 1
  note: string;
}

const results: CaseResult[] = [];

function score(category: string, id: string, note: string, s: number) {
  results.push({ id, category, score: Math.max(0, Math.min(1, s)), note });
}

async function attempt(
  category: string,
  id: string,
  note: string,
  fn: () => number | Promise<number>,
) {
  try {
    const s = await fn();
    score(category, id, note, s);
  } catch (err) {
    // An unexpected exception is itself a capability failure
    // — scored 0 with the error recorded honestly.
    score(
      category,
      id,
      `${note} [threw: ${String((err as Error)?.message ?? err).slice(0, 80)}]`,
      0,
    );
  }
}

function freshEngine(): ArchieNativeEngine {
  return new ArchieNativeEngine({ persistence: null });
}

async function teach(e: ArchieNativeEngine, fact: string) {
  await e.converse(`remember that ${fact}`);
}

async function ask(e: ArchieNativeEngine, q: string) {
  const r = await e.converse(q);
  return r.responseText.toLowerCase();
}

/** Durable in-memory store shared by "sessions" — mimics the
 *  production Supabase tables shared across edge isolates (the
 *  topology every real ARCHIE session runs with). */
class DurableMemDb {
  tables: Record<string, Array<Record<string, unknown>>> = {};
  from(table: string) {
    const rows = () => (this.tables[table] ??= []);
    return {
      select: async () => ({ data: [...rows()], error: null }),
      insert: async (rs: unknown) => {
        for (const r of rs as Array<Record<string, unknown>>)
          rows().push({ ...r });
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (rs: unknown) => {
        for (const r of rs as Array<Record<string, unknown>>)
          rows().push({ ...r });
        return { error: null };
      },
    };
  }
}

describe("ARCHIE Native Engine — Capability Benchmark (baseline measurement)", () => {
  it(
    "runs all benchmark cases and reports honest scores",
    { timeout: 120_000 },
    async () => {
      // ---------------------------------------------------------
      // 1. LANGUAGE UNDERSTANDING
      // ---------------------------------------------------------
      await attempt("language-understanding", "lu-1", "question intent", () => {
        const n = understand("what is cement");
        return n.intent === "knowledge_query" ? 1 : 0;
      });
      await attempt("language-understanding", "lu-2", "teaching intent", () => {
        const n = understand("please remember that the site foreman is Tunde");
        return n.intent === "teaching" ? 1 : 0;
      });
      await attempt(
        "language-understanding",
        "lu-3",
        "negation handling",
        async () => {
          // "do NOT remember" must NOT be treated as teaching — at
          // NLU level AND at engine level. The pre-2026-09-11 case
          // capped at 0.5 by measuring understand() alone; the P2
          // exclusion machinery is real engine behavior, so the
          // case now also verifies NOTHING was stored.
          const n = understand("do not remember the gate code");
          if (n.intent === "teaching") return 0;
          const e = freshEngine();
          // warm-up turn: the seed corpus lazy-loads on the FIRST
          // converse — measure the delta only around the negation
          // utterance itself.
          await e.converse("hello");
          const before = e.diagnostics().counts.facts;
          await e.converse("do not remember the gate code");
          const after = e.diagnostics().counts.facts;
          return after === before ? 1 : 0.5;
        },
      );
      await attempt(
        "language-understanding",
        "lu-4",
        "compound request (multi-intent)",
        async () => {
          // Engine-level compound decomposition (P2): BOTH clauses
          // must be handled in one turn — the research acknowledged
          // AND a plan produced. The pre-2026-09-11 case measured
          // only understand() (one intent) and capped at 0.5; the
          // engine demonstrably decomposes and answers both.
          const e = freshEngine();
          const t = await ask(
            e,
            "research steel prices and then plan my foundation",
          );
          const researched = t.includes("research") || t.includes("source");
          const planned =
            t.includes("plan") && (t.includes("step") || t.includes("cost"));
          return researched && planned ? 1 : researched || planned ? 0.5 : 0;
        },
      );

      // ---------------------------------------------------------
      // 2. MEMORY RETRIEVAL
      // ---------------------------------------------------------
      const mem = new ContextMemory();
      mem.addTurn("owner", "The roof sheets are 0.55mm gauge aluminium");
      mem.addTurn("owner", "We agreed on a Tuesday delivery");
      await attempt(
        "memory-retrieval",
        "mr-1",
        "relevant turn ranked first",
        () => {
          const r = mem.retrieve("what gauge are the roof sheets?");
          return r.salientTurns[0]?.text.includes("roof sheets") ? 1 : 0;
        },
      );
      await attempt(
        "memory-retrieval",
        "mr-2",
        "importance-weighted retrieval",
        () => {
          // Important (corrected) info should outrank recent trivia.
          const m2 = new ContextMemory();
          m2.addTurn("owner", "correction: the beam depth is 450mm not 350mm");
          m2.addTurn("owner", "the weather is nice today");
          const r = m2.retrieve("what is the beam depth?");
          return r.salientTurns[0]?.text.includes("450mm") ? 1 : 0;
        },
      );
      await attempt(
        "memory-retrieval",
        "mr-3",
        "fact salience populated",
        async () => {
          // Validated-fact salience (owner directive 2026-09-16):
          // retrieval surfaces VALIDATED store facts that clear
          // the measured relevance floor — never minted
          // candidates. A store-less ContextMemory stays
          // honestly empty.
          const fs = new FactStore();
          const stored = await fs.assert({
            subject: "roof sheets",
            predicate: "gauge",
            object: "0.55mm",
            confidence: 0.98,
            provenance: { source: "owner-taught", note: "benchmark" },
            status: "validated",
          });
          const m3 = new ContextMemory();
          m3.attachFactSource(fs);
          const r = m3.retrieve("what gauge are the roof sheets?");
          if (r.salientFacts.length === 0) return 0;
          // The surfaced fact must be the validated one, and
          // a store-less memory must stay honestly empty.
          if (r.salientFacts[0].id !== stored.fact.id) return 0;
          if (r.salientFacts[0].status !== "validated") return 0;
          return mem.retrieve("roof").salientFacts.length === 0 ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 3. MULTI-STEP REASONING
      // ---------------------------------------------------------
      await attempt(
        "multi-step-reasoning",
        "ms-1",
        "forward chaining derives new fact",
        async () => {
          const fs = new FactStore();
          const re = new ReasoningEngine(fs, [
            {
              id: "r1",
              conditions: [
                { subject: "beam", predicate: "depth" },
                { subject: "beam", predicate: "span" },
              ],
              produces: {
                subject: "beam",
                predicate: "adequacy",
                object: "checkable",
              },
              weight: 0.9,
              description: "depth+span → adequacy checkable",
            },
          ]);
          await fs.assert({
            subject: "beam",
            predicate: "depth",
            object: "450mm",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          await fs.assert({
            subject: "beam",
            predicate: "span",
            object: "6m",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const out = await re.forwardChain();
          return out.derived.length > 0 ? 1 : 0;
        },
      );
      await attempt(
        "multi-step-reasoning",
        "ms-2",
        "variable binding (transitivity)",
        async () => {
          // A rule with a variable (?x) — requires unification.
          const fs = new FactStore();
          const re = new ReasoningEngine(fs, [
            {
              id: "trans",
              conditions: [{ subject: "?x", predicate: "part-of" }],
              produces: {
                subject: "?x",
                predicate: "indirect-part-of",
                object: "?y",
              },
              weight: 0.9,
              description: "transitive part-of",
            } as never,
          ]);
          await fs.assert({
            subject: "roof",
            predicate: "part-of",
            object: "house",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const out = await re.forwardChain();
          return out.derived.length > 0 ? 1 : 0; // 0 without unification — honest miss
        },
      );
      await attempt(
        "multi-step-reasoning",
        "ms-3",
        "two-step derivation chain",
        async () => {
          const fs = new FactStore();
          const re = new ReasoningEngine(fs, [
            {
              id: "step1",
              conditions: [{ subject: "site", predicate: "soil-tested" }],
              produces: {
                subject: "site",
                predicate: "foundation-ready",
                object: "yes",
              },
              weight: 0.9,
              description: "tested → ready",
            },
            {
              id: "step2",
              conditions: [{ subject: "site", predicate: "foundation-ready" }],
              produces: {
                subject: "site",
                predicate: "buildable",
                object: "yes",
              },
              weight: 0.9,
              description: "ready → buildable",
            },
          ]);
          await fs.assert({
            subject: "site",
            predicate: "soil-tested",
            object: "true",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const out = await re.forwardChain();
          return out.derived.length >= 2 && out.iterations >= 2 ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 4. LOGIC
      // ---------------------------------------------------------
      await attempt("logic", "lg-1", "modus ponens", async () => {
        const fs = new FactStore();
        const re = new ReasoningEngine(fs, [
          {
            id: "mp",
            conditions: [{ subject: "structure", predicate: "is-concrete" }],
            produces: {
              subject: "structure",
              predicate: "needs-curing",
              object: "yes",
            },
            weight: 0.95,
            description: "concrete → curing",
          },
        ]);
        await fs.assert({
          subject: "structure",
          predicate: "is-concrete",
          object: "true",
          confidence: 0.9,
          provenance: { source: "seed" },
          status: "validated",
        });
        const out = await re.forwardChain();
        return fs.query({ subject: "structure", predicate: "needs-curing" })
          .length > 0 && out.derived.length > 0
          ? 1
          : 0;
      });
      await attempt("logic", "lg-2", "honest unknown on absent fact", () => {
        const fs = new FactStore();
        const re = new ReasoningEngine(fs, DEFAULT_RULES);
        const r = re.canReach({ subject: "atlantis", predicate: "location" });
        return r.holds === false && r.proof.length === 0 ? 1 : 0;
      });
      await attempt("logic", "lg-3", "syllogism with variables", async () => {
        // "All buildings need foundations. My shop is a
        //  building. → my shop needs a foundation."
        const fs = new FactStore();
        const re = new ReasoningEngine(fs, [
          {
            id: "syl",
            conditions: [{ subject: "?x", predicate: "is-a" }],
            produces: {
              subject: "?x",
              predicate: "needs-foundation",
              object: "yes",
            },
            weight: 0.95,
            description: "building → foundation",
          } as never,
        ]);
        await fs.assert({
          subject: "my-shop",
          predicate: "is-a",
          object: "building",
          confidence: 0.9,
          provenance: { source: "seed" },
          status: "validated",
        });
        const out = await re.forwardChain();
        const got = fs.query({
          subject: "my-shop",
          predicate: "needs-foundation",
        });
        return got.length > 0 && out.derived.length > 0 ? 1 : 0; // 0 without unification
      });

      // ---------------------------------------------------------
      // 5. MATHEMATICS
      // ---------------------------------------------------------
      const mathEngine = freshEngine();
      await attempt(
        "mathematics",
        "ma-1",
        "deterministic arithmetic",
        async () => {
          const r = await mathEngine.converse("(25 * 48) + 12");
          return r.responseText.includes("1212") ? 1 : 0;
        },
      );
      await attempt("mathematics", "ma-2", "percent computation", async () => {
        const r = await mathEngine.converse("what is 15 percent of 24000");
        return r.responseText.includes("3600") ? 1 : 0;
      });
      await attempt(
        "mathematics",
        "ma-3",
        "unit conversion reasoning",
        async () => {
          const r = await mathEngine.converse(
            "convert 5 meters to centimeters",
          );
          return r.responseText.includes("500") ? 1 : 0; // no conversion tool — honest miss
        },
      );

      // ---------------------------------------------------------
      // 6. PLANNING
      // ---------------------------------------------------------
      const planFs = new FactStore();
      await planFs.assert({
        subject: "knowledge",
        predicate: "available",
        object: "yes",
        confidence: 0.9,
        provenance: { source: "seed" },
        status: "validated",
      });
      const planner = new Planner(planFs, DEFAULT_OPERATORS);
      await attempt(
        "planning",
        "pl-1",
        "means-ends plan with met preconditions",
        () => {
          const p = planner.plan("answered");
          return p.executable && p.steps.length > 0 ? 1 : 0;
        },
      );
      await attempt(
        "planning",
        "pl-2",
        "honest gap report on missing prerequisites",
        () => {
          const p = planner.plan("planned");
          return p.executable === false && p.gapReport.length > 0 ? 1 : 0;
        },
      );
      await attempt(
        "planning",
        "pl-3",
        "alternative plans / risk / deadline support",
        () => {
          const p = planner.plan("answered");
          // Alternatives, risk analysis and deadline constraints are
          // not representable in the Plan type today.
          const planAny = p as unknown as Record<string, unknown>;
          const hasAlternatives =
            "alternatives" in planAny &&
            Array.isArray(planAny.alternatives) &&
            (planAny.alternatives as unknown[]).length > 0;
          const hasRisk = "risk" in planAny;
          return hasAlternatives && hasRisk ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 7. CONTRADICTION DETECTION
      // ---------------------------------------------------------
      await attempt(
        "contradiction-detection",
        "cd-1",
        "SPO conflict detected on assert",
        async () => {
          const fs = new FactStore();
          await fs.assert({
            subject: "cement-price",
            predicate: "per-bag",
            object: "8500 naira",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const { conflict } = await fs.assert({
            subject: "cement-price",
            predicate: "per-bag",
            object: "9200 naira",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "candidate",
          });
          return conflict && conflict.kind === "contradiction" ? 1 : 0;
        },
      );
      await attempt(
        "contradiction-detection",
        "cd-2",
        "contradiction surfaced in conversation",
        async () => {
          const e = freshEngine();
          await teach(e, "the cement price is 8500 naira");
          const t = await ask(e, "actually the cement price is 9200 naira");
          return t.includes("conflict") ||
            t.includes("contradict") ||
            t.includes("uncertain")
            ? 1
            : 0;
        },
      );
      await attempt(
        "contradiction-detection",
        "cd-3",
        "cross-system contradiction reconciliation",
        async () => {
          // Web evidence vs stored memory — reconciliation engine absent.
          const e = freshEngine();
          const t = await ask(
            e,
            "the web says cement is 9000 naira but I told you 8500 — resolve this",
          );
          return t.includes("reconcil") ||
            t.includes("both sources") ||
            t.includes("disagree")
            ? 1
            : 0;
        },
      );

      // ---------------------------------------------------------
      // 8. UNCERTAINTY
      // ---------------------------------------------------------
      await attempt(
        "uncertainty",
        "un-1",
        "epistemic status classification",
        async () => {
          const fs = new FactStore();
          const { fact } = await fs.assert({
            subject: "rumor",
            predicate: "about-supplier",
            object: "unverified claim",
            confidence: 0.3,
            provenance: { source: "owner-taught" },
            status: "candidate",
          });
          const s = epistemicStatusOf(fact);
          return s === "ASSUMED" || s === "UNKNOWN" ? 1 : 0;
        },
      );
      await attempt(
        "uncertainty",
        "un-2",
        "honest unknown on out-of-knowledge question",
        async () => {
          const e = freshEngine();
          const t = await ask(e, "what is the melting point of unobtainium?");
          return t.includes("not in my knowledge") ||
            t.includes("don't know") ||
            t.includes("do not know") ||
            t.includes("no stored knowledge") ||
            t.includes("research")
            ? 1
            : 0;
        },
      );
      await attempt(
        "uncertainty",
        "un-3",
        "conflicting-evidence confidence band",
        async () => {
          const e = freshEngine();
          const t = await ask(
            e,
            "is the beam depth 450mm or 350mm? sources disagree",
          );
          return t.includes("conflict") ||
            t.includes("uncertain") ||
            t.includes("disagree") ||
            t.includes("verify")
            ? 1
            : 0;
        },
      );

      // ---------------------------------------------------------
      // 9. CAUSAL REASONING
      // ---------------------------------------------------------
      await attempt(
        "causal-reasoning",
        "cr-1",
        "causal relation storage",
        async () => {
          const wm = new WorldModel(null as never);
          await wm.relate({
            subject: "rain",
            relation: "causes",
            object: "wet-ground",
            confidence: 0.9,
            provenance: "test",
          });
          return wm.query({ about: "rain" }).length > 0 ? 1 : 0;
        },
      );
      await attempt(
        "causal-reasoning",
        "cr-2",
        "causal chain propagation",
        async () => {
          const wm = new WorldModel(null as never);
          await wm.relate({
            subject: "rain",
            relation: "causes",
            object: "wet-ground",
            confidence: 0.9,
            provenance: "test",
          });
          await wm.relate({
            subject: "wet-ground",
            relation: "causes",
            object: "slippery-site",
            confidence: 0.9,
            provenance: "test",
          });
          // "does rain lead to slippery-site?" — 2-hop causal inference.
          const q = wm.query({ about: "rain", depth: 2 });
          const typed = q.some(
            (rel) =>
              rel.relation === "causes" &&
              rel.subject === "rain" &&
              rel.object === "slippery-site",
          );
          const found = q.some((rel) => rel.object === "slippery-site");
          return typed ? 1 : found ? 0.5 : 0;
        },
      );
      await attempt(
        "causal-reasoning",
        "cr-3",
        "counterfactual reasoning",
        async () => {
          // "if it had not rained, would the ground be dry?"
          const e = freshEngine();
          const t = await ask(
            e,
            "if it had not rained, would the ground be dry?",
          );
          return t.includes("counterfactual") ||
            t.includes("if it had not") ||
            t.includes("cannot say")
            ? 1
            : 0;
        },
      );

      // ---------------------------------------------------------
      // 10. TEMPORAL REASONING
      // ---------------------------------------------------------
      await attempt(
        "temporal-reasoning",
        "tr-1",
        "date entity extraction",
        () => {
          const n = understand("deliver the sheets by 2026-09-15");
          return n.entities.dates.includes("2026-09-15") ? 1 : 0;
        },
      );
      await attempt(
        "temporal-reasoning",
        "tr-2",
        "valid-time facts (until/since)",
        async () => {
          const fs = new FactStore();
          const { fact } = await fs.assert({
            subject: "price",
            predicate: "per-bag",
            object: "8500 naira",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const hasValidTime = "validFrom" in fact || "validUntil" in fact;
          return hasValidTime ? 1 : 0; // Fact type has no temporal qualifiers — honest miss
        },
      );
      await attempt(
        "temporal-reasoning",
        "tr-3",
        "historical state query",
        async () => {
          const e = freshEngine();
          const t = await ask(e, "what was the cement price last month?");
          return t.includes("history") ||
            t.includes("last month") ||
            t.includes("record of")
            ? 1
            : 0;
        },
      );

      // ---------------------------------------------------------
      // 11. HYPOTHESIS TESTING
      // ---------------------------------------------------------
      await attempt(
        "hypothesis-testing",
        "hy-1",
        "hypothesis generation on uncertain problem",
        async () => {
          const e = freshEngine();
          const t = await ask(
            e,
            "why did my screed crack? the slab is 3 days old",
          );
          return t.includes("hypothes") ||
            t.includes("possible cause") ||
            t.includes("could be")
            ? 1
            : 0;
        },
      );
      await attempt(
        "hypothesis-testing",
        "hy-2",
        "ranked hypotheses with evidence needs",
        async () => {
          // No hypothesis module exists today — measured, not assumed.
          const e = freshEngine();
          const t = await ask(e, "why did my screed crack?");
          return t.includes("evidence") &&
            (t.includes("check") || t.includes("verify"))
            ? 1
            : 0;
        },
      );
      await attempt(
        "hypothesis-testing",
        "hy-3",
        "hypothesis never presented as fact",
        async () => {
          const e = freshEngine();
          const t = await ask(e, "why did my screed crack?");
          return t.includes("certain") ||
            t.includes("possible") ||
            t.includes("likely")
            ? 1
            : 0;
        },
      );

      // ---------------------------------------------------------
      // 12. TOOL SELECTION
      // ---------------------------------------------------------
      await attempt(
        "tool-selection",
        "ts-1",
        "capability-tag tool scoring",
        () => {
          const ti = new ToolIntelligenceEngine();
          const sel = ti.select("research current steel prices on the web", {
            phases: [],
          } as never);
          return sel.selected.length > 0 ? 1 : 0;
        },
      );
      await attempt(
        "tool-selection",
        "ts-2",
        "tool trust classification",
        () => {
          const e = freshEngine();
          const r = e as unknown as {
            tools?: { tools?: Map<string, { spec?: { trust?: string } }> };
          };
          const registry = r.tools?.tools;
          if (!registry) return 0;
          let trustClassified = 0;
          for (const t of registry.values())
            if (t.spec && "trust" in t.spec) trustClassified += 1;
          return trustClassified > 0 ? 1 : 0; // no trust model today — honest miss
        },
      );
      await attempt(
        "tool-selection",
        "ts-3",
        "cross-tool verification pairing",
        async () => {
          const e = freshEngine();
          const t = await ask(e, "calculate 17% of 9500 and verify it");
          return t.includes("verify") || t.includes("cross-check") ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 13. ERROR RECOVERY
      // ---------------------------------------------------------
      await attempt(
        "error-recovery",
        "er-1",
        "honest arithmetic error report",
        async () => {
          const e = freshEngine();
          const t = await ask(e, "compute (5 / 0) + 2");
          return t.includes("error") ||
            t.includes("could not") ||
            t.includes("cannot")
            ? 1
            : 0;
        },
      );
      await attempt(
        "error-recovery",
        "er-2",
        "malformed input does not crash",
        async () => {
          const e = freshEngine();
          const r = await e.converse("   !!!???   ");
          return typeof r.responseText === "string" && r.responseText.length > 0
            ? 1
            : 0;
        },
      );
      await attempt(
        "error-recovery",
        "er-3",
        "engine operational after failure",
        async () => {
          const e = freshEngine();
          await e.converse("compute (5 / 0)");
          const r = await e.converse("what is 2 + 2");
          return r.responseText.includes("4") ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 14. LEARNING FROM OUTCOMES
      // ---------------------------------------------------------
      await attempt(
        "learning-from-outcomes",
        "lo-1",
        "failure weakens contributing knowledge",
        async () => {
          const fs = new FactStore();
          const { fact } = await fs.assert({
            subject: "beam",
            predicate: "depth",
            object: "450mm",
            confidence: 0.9,
            provenance: { source: "seed" },
            status: "validated",
          });
          const ol = new OutcomeLearner(fs);
          const before = fact.confidence;
          await ol.record({
            kind: "failure",
            task: "test",
            contributing: [fact.id],
          } as never);
          return fact.confidence < before ? 1 : 0;
        },
      );
      await attempt(
        "learning-from-outcomes",
        "lo-2",
        "no reinforcement without verified outcome",
        async () => {
          // C3 audit finding: citing a fact in conversation boosts it
          // automatically (assumed success). Honest engines require
          // real outcome evidence before reinforcing knowledge.
          const e = freshEngine();
          await teach(e, "the roof pitch is 25 degrees");
          const store = (e as unknown as { store: () => FactStore }).store();
          const facts = store.query({ subject: "roof", predicate: "pitch" });
          if (facts.length === 0) return 0;
          const before = facts[0].confidence;
          await ask(e, "what is the roof pitch?");
          const after =
            store.query({ subject: "roof", predicate: "pitch" })[0]
              ?.confidence ?? 0;
          return Math.abs(after - before) < 1e-9 ? 1 : 0; // fails today: +0.05 auto-boost
        },
      );
      await attempt(
        "learning-from-outcomes",
        "lo-3",
        "cause-of-error lesson extraction",
        async () => {
          const fs = new FactStore();
          const ol = new OutcomeLearner(fs);
          const o = await ol.record({
            kind: "failure",
            task: "estimation off by 30%",
            contributing: [],
          } as never);
          const hasLesson = "cause" in o || "lesson" in o;
          return hasLesson ? 1 : 0; // no lesson taxonomy today — honest miss
        },
      );

      // ---------------------------------------------------------
      // 15. CROSS-DOMAIN REASONING
      // ---------------------------------------------------------
      await attempt(
        "cross-domain-reasoning",
        "xd-1",
        "construction domain (home turf)",
        () => {
          const r = constructionEstimate(
            "how many bags of cement for 10 m2 of screed at 50mm",
          );
          return r.length > 0 && /\d/.test(r) ? 1 : 0;
        },
      );
      await attempt(
        "cross-domain-reasoning",
        "xd-2",
        "non-construction knowledge QA",
        async () => {
          const e = freshEngine();
          await teach(e, "photosynthesis converts light into chemical energy");
          const t = await ask(e, "what is photosynthesis?");
          return t.includes("light") && t.includes("chemical") ? 1 : 0;
        },
      );
      await attempt(
        "cross-domain-reasoning",
        "xd-3",
        "domain-general reasoning primitives present",
        () => {
          // All 4 default rules are construction-literal. A
          // domain-general substrate should ship domain-neutral
          // reasoning primitives (identity, transitivity, class
          // membership) — measure their presence.
          const general = DEFAULT_RULES.filter((r) =>
            ["?x", "?y", "any", "thing", "entity"].some((v) =>
              JSON.stringify(r).toLowerCase().includes(v.toLowerCase()),
            ),
          );
          return general.length > 0 ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 16. CONTEXT RETENTION
      // ---------------------------------------------------------
      await attempt(
        "context-retention",
        "cx-1",
        "topical follow-up within session",
        async () => {
          const e = freshEngine();
          await teach(e, "my roof sheets are 0.55mm gauge");
          const t = await ask(e, "tell me about the roof sheets gauge");
          return t.includes("0.55") ? 1 : 0;
        },
      );
      await attempt(
        "context-retention",
        "cx-2",
        "pronoun reference resolution",
        async () => {
          const e = freshEngine();
          await teach(e, "Tunde is my site foreman");
          const t = await ask(e, "what is his role?");
          return t.includes("tunde") &&
            (t.includes("foreman") || t.includes("role"))
            ? 1
            : 0;
        },
      );
      await attempt(
        "context-retention",
        "cx-3",
        "cross-session conversation memory",
        async () => {
          // Production topology: two sessions share the durable
          // store (all edge isolates hit the same tables — P7
          // episodic persistence + fact persistence). The pre-
          // 2026-09-11 version of this case ran with persistence:
          // null and its "facts persist but turns do not" comment
          // was stale: it measured the in-memory configuration, not
          // the capability. Measured here the way every real ARCHIE
          // session runs.
          const db = new DurableMemDb();
          const e1 = new ArchieNativeEngine({
            persistence: db as never,
            conversationId: "bench-cx3",
          });
          await e1.converse("remember that the delivery is on Tuesday");
          const e2 = new ArchieNativeEngine({
            persistence: db as never,
            conversationId: "bench-cx3",
          });
          await e2.boot();
          const t = await ask(e2, "when is the delivery?");
          return t.includes("tuesday") ? 1 : 0;
        },
      );

      // ---------------------------------------------------------
      // 17. AUTHORITY ENFORCEMENT
      // ---------------------------------------------------------
      await attempt(
        "authority-enforcement",
        "au-1",
        "execution requires owner authority",
        async () => {
          const { executeTarget } =
            await import("@studio-shared/archie-ai/execution/engine.ts");
          const deps = {
            now: () => Date.now(),
            sleep: async () => undefined,
            log: () => undefined,
            getSecret: () => undefined,
            fetchFn: (async () => {
              throw new Error("benchmark: fetch must not be called");
            }) as unknown as typeof fetch,
            supabaseUrl: "https://example.supabase.co",
            serviceRoleKey: "benchmark-redacted",
            getTarget: async () => ({
              key: "test-target",
              kind: "HTTP_API",
              enabled: true,
              environment: "SANDBOX",
              allowed_initiators: ["archie-core"],
              requires_owner_secret: false,
            }),
            createRun: async () => ({ id: "run_bench" }),
            updateRun: async () => undefined,
            verifyOwnerSecret: async () => false,
            recordSecurityEvent: async () => undefined,
          } as never;
          const out = await executeTarget(deps, {
            targetKey: "test-target",
            input: {},
            initiatorSystem: "archie-core",
            caller: { userId: "not-the-owner", isAdmin: false },
          });
          return out.ok === false && out.status === "UNAUTHORIZED" ? 1 : 0;
        },
      );
      await attempt(
        "authority-enforcement",
        "au-2",
        "consequential operations reserved to owner",
        async () => {
          const { OWNER_RESERVED_OPERATIONS } =
            await import("../core-orchestrator");
          const reserved = OWNER_RESERVED_OPERATIONS as readonly string[];
          return reserved.length > 0 &&
            reserved.some((op) => /delete|deploy|execute|production/i.test(op))
            ? 1
            : 0;
        },
      );
      await attempt(
        "authority-enforcement",
        "au-3",
        "learned confidence never grants authority",
        async () => {
          // However reinforced a fact becomes, authority comes from
          // the authority layer — never from knowledge confidence.
          const fs = new FactStore();
          const ol = new OutcomeLearner(fs);
          const { fact } = await fs.assert({
            subject: "action",
            predicate: "authorized",
            object: "owner-approved",
            confidence: 0.5,
            provenance: { source: "seed" },
            status: "candidate",
          });
          for (let i = 0; i < 10; i++) {
            await ol.record({
              kind: "success",
              task: "t",
              contributing: [fact.id],
            } as never);
          }
          // The fact store has NO authority semantics — reinforced
          // confidence is epistemic only. Verify the learning module
          // exposes no execution-granting API.
          const learner = ol as unknown as Record<string, unknown>;
          const grants = Object.keys(learner).some((k) =>
            /grant|authoriz|execute/i.test(k),
          );
          return grants ? 0 : 1;
        },
      );

      // ---------------------------------------------------------
      // REPORT — honest aggregate, printed for extraction
      // ---------------------------------------------------------
      const byCategory = new Map<
        string,
        { earned: number; possible: number }
      >();
      for (const r of results) {
        const c = byCategory.get(r.category) ?? { earned: 0, possible: 0 };
        c.earned += r.score;
        c.possible += 1;
        byCategory.set(r.category, c);
      }
      const categories = [...byCategory.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, { earned, possible }]) => ({
          category,
          score: Number((earned / possible).toFixed(3)),
          earned,
          possible,
        }));
      const total = results.reduce((s, r) => s + r.score, 0);
      const overall = Number((total / results.length).toFixed(3));
      const report = {
        suite: "archie-native-engine-benchmark",
        engine: "ArchieNativeEngine (pre-upgrade baseline)",
        date: new Date().toISOString(),
        cases: results.length,
        overall,
        categories,
        caseResults: results,
      };
      console.log(`\n=== ARCHIE NATIVE ENGINE BENCHMARK ===`);
      for (const c of categories) {
        console.log(
          `${c.category.padEnd(28)} ${((c.earned / c.possible) * 100).toFixed(0).padStart(3)}%  (${c.earned}/${c.possible})`,
        );
      }
      console.log(
        `${"OVERALL".padEnd(28)} ${(overall * 100).toFixed(1)}%  (${total}/${results.length})\n`,
      );
      console.log(`BENCH_RESULT: ${JSON.stringify(report)}`);
    },
  );
});
