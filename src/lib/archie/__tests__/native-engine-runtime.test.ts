import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ArchieNativeEngine,
  getNativeEngine,
  configureNativeEnginePersistence,
  type MarketPriceLookup,
  type SystemAdapters,
} from "@studio-shared/archie-ai/native-engine/engine.ts";
import { constructionEstimate } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { CONSTRUCTION_NLU_HINTS } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { understand } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { resolveArchieCapabilityEngine } from "@studio-shared/archie-ai/runtime.ts";
import { nativeEngineCapabilityManifest } from "@studio-shared/archie-ai/native-engine/capabilities.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import { OutcomeLearner } from "@studio-shared/archie-ai/native-engine/learning.ts";
import {
  SupabasePersistence,
  type SupabaseLike,
} from "@studio-shared/archie-ai/native-engine/persistence.ts";
import { coreHealthCheck } from "../core-orchestrator";

// =========================================================
// ARCHIE NATIVE ENGINE — RUNTIME CONTRACT + INTEGRATION
//
// Proves: the engine registers and resolves through the
// provider-agnostic registry (ARCHIE-native first), executes
// real conversational inference end-to-end, persists durably
// via the Supabase-shaped adapter, and is bound into the
// capability catalog + health check as a live core system.
// =========================================================

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), "utf-8");

// ---------------------------------------------------------
// Registry — the native engine resolves FIRST
// ---------------------------------------------------------
describe("Engine registry", () => {
  it("resolves ARCHIE's unified cognitive engine as the highest-level, operational, archie-native", () => {
    const { runtime, engine } = resolveArchieCapabilityEngine({});
    expect(runtime).not.toBeNull();
    expect(runtime!.id).toBe("archie-cognitive-engine");
    expect(runtime!.kind).toBe("archie-native");
    expect(runtime!.isOperational()).toBe(true);
    expect(engine.path).toBe("archie-native");
    expect(engine.note).toContain(
      "Unified General Cognitive Intelligence Engine",
    );
  });

  it("the unified cognitive engine outranks a configured external id (ARCHIE-native first, always)", () => {
    const { runtime } = resolveArchieCapabilityEngine({
      engineId: "some-external-adapter",
    });
    expect(runtime!.kind).toBe("archie-native");
    expect(runtime!.id).toBe("archie-cognitive-engine");
  });

  it("reports only genuinely implemented runtime capabilities", () => {
    const { runtime } = resolveArchieCapabilityEngine({});
    const caps = runtime!.capabilities();
    expect(caps).toContain("inference");
    expect(caps).toContain("retrieval");
    expect(caps).toContain("memory");
    expect(caps).not.toContain("model-loading");
    expect(caps).not.toContain("multimodal-processing");
    expect(caps).not.toContain("training-fine-tuning");
  });
});

// ---------------------------------------------------------
// End-to-end conversation through the runtime contract
// ---------------------------------------------------------
describe("Engine inference (end-to-end)", () => {
  const engine = new ArchieNativeEngine();
  const turns = (text: string) => [
    { role: "owner" as const, parts: [{ text }] },
  ];

  it("greets with real engine state — no canned conversational script", async () => {
    const result = await engine.generate({
      turns: turns("Hello ARCHIE"),
      tools: [],
      systemInstruction: "",
    });
    expect(result.engine.path).toBe("archie-native");
    expect(result.engine.note).toContain("no external AI provider");
    const text = result.parts[0].text ?? "";
    expect(text).toContain("native engine online");
    expect(text).toContain("facts");
  });

  it("answers a knowledge question from validated knowledge with provenance", async () => {
    const result = await engine.generate({
      turns: turns("what is screeding"),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("screeding");
    expect(text).toContain("confidence");
  });

  it("computes math deterministically", async () => {
    const result = await engine.generate({
      turns: turns("what is 25 times 48"),
      tools: [],
      systemInstruction: "",
    });
    expect(result.parts[0].text ?? "").toContain("1200");
  });

  it("learns when taught, retains with provenance, and answers from the retained fact", async () => {
    const taught = await engine.generate({
      turns: turns("remember that screeding mix ratio is 1:4 cement to sand"),
      tools: [],
      systemInstruction: "",
    });
    expect(taught.parts[0].text ?? "").toContain("Retained");
    const asked = await engine.generate({
      turns: turns("what is the screeding mix ratio"),
      tools: [],
      systemInstruction: "",
    });
    const text = asked.parts[0].text ?? "";
    expect(text).toContain("1:4");
  });

  it("reports unknown knowledge honestly and offers real options — never invents", async () => {
    const result = await engine.generate({
      turns: turns("what is the melting point of unobtainium"),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    // P6: phrasing varies by composer variant — assert the
    // epistemic MARKER, not the connective wording.
    expect(text).toMatch(/validated knowledge/i);
    // OWNER DIRECTIVE (2026-09-16): plain answers, no fact counts.
    expect(text).toMatch(/found nothing/i);
    expect(text).toMatch(/research|teach/i);
  });

  // ========================================================
  // A-1 — OWNER-GATED LOCAL GENERATIVE MODEL (2026-09-16)
  // ========================================================
  it("A-1: owner turn + configured local model → generated answer, explicitly labeled, never silent", async () => {
    const engine = new ArchieNativeEngine();
    const realFetch = globalThis.fetch;
    // The owner's local model server (Ollama-compatible). The
    // stub also makes web research fail fast → deterministic
    // fall-through to the honest-unknown path.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          response: "Unobtainium's melting point is hypothesized at 42K.",
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    process.env.ARCHIE_LOCAL_MODEL_NAME = "test-model";
    try {
      const result = await engine.generate({
        turns: turns("what is the melting point of unobtainium"),
        tools: [],
        systemInstruction: "",
        ownerAuthorized: true,
      });
      const text = result.parts[0].text ?? "";
      // the honest unknown line still stands — generation
      // APPENDS, it never replaces the epistemic truth.
      expect(text).toMatch(/found nothing/i);
      // the generated content is present AND labeled.
      expect(text).toContain("42K");
      expect(text).toMatch(/GENERATED/);
      expect(text).toMatch(/NOT validated knowledge/);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
      delete process.env.ARCHIE_LOCAL_MODEL_NAME;
    }
  });

  it("A-1: non-owner turn → NO generation, the honest unknown line unchanged", async () => {
    const engine = new ArchieNativeEngine();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ response: "should never appear" }), {
        status: 200,
      })) as unknown as typeof fetch;
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    try {
      // no ownerAuthorized — the gate stays closed.
      const result = await engine.generate({
        turns: turns("what is the melting point of unobtainium"),
        tools: [],
        systemInstruction: "",
      });
      const text = result.parts[0].text ?? "";
      expect(text).toMatch(/found nothing/i);
      expect(text).not.toMatch(/GENERATED/);
      expect(text).not.toContain("should never appear");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
    }
  });

  it("A-1: owner turn but NO endpoint configured → honest absence, generated block never faked", async () => {
    const engine = new ArchieNativeEngine();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network must never be touched without a URL");
    }) as unknown as typeof fetch;
    try {
      const result = await engine.generate({
        turns: turns("what is the melting point of unobtainium"),
        tools: [],
        systemInstruction: "",
        ownerAuthorized: true,
      });
      const text = result.parts[0].text ?? "";
      expect(text).toMatch(/found nothing/i);
      expect(text).not.toMatch(/GENERATED/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("reports the honest capability manifest when asked what it can do", async () => {
    const result = await engine.generate({
      turns: turns("what can you do"),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("operational");
    expect(text).toContain("not implemented");
    expect(text).toContain("never faked");
  });

  it("analyzes pasted code deterministically", async () => {
    const result = await engine.generate({
      turns: turns(
        "analyze this file\n```ts\nexport function add(a: number, b: number) {\n  return a + b;\n}\n```\n",
      ),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("Static analysis complete");
    expect(text).toContain("1 function");
  });

  it("plans a task and keeps execution owner-gated (PROPOSE only)", async () => {
    const result = await engine.generate({
      turns: turns("plan a roofing project for my bungalow"),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("Plan for your request");
    expect(text).toContain("PROPOSE");
  });

  it("processes a correction — wrong facts do not survive silently", async () => {
    await engine.generate({
      turns: turns("remember that concrete curing takes 3 days"),
      tools: [],
      systemInstruction: "",
    });
    const result = await engine.generate({
      turns: turns("that is wrong, concrete curing is 7 days minimum"),
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("Correction processed");
  });

  it("converse() self-checks every response (cited facts exist)", async () => {
    const result = await engine.converse("what is screeding");
    expect(result.selfCheck.check).toBe("response-integrity");
    expect(result.selfCheck.passed).toBe(true);
    expect(result.citedFactIds.length).toBeGreaterThan(0);
  });

  it("diagnostics report measurable state honestly", async () => {
    await engine.converse("hello archie");
    const d = engine.diagnostics();
    expect(d.engineId).toBe("archie-native-engine");
    expect(d.counts.facts).toBeGreaterThan(0);
    expect(d.counts.inferences).toBeGreaterThan(0);
    expect(d.counts.rules).toBeGreaterThan(0);
    expect(d.persistence.note).toContain("in-memory only");
  });

  it("reasoning cycle runs verification + improvement (permanence loop)", async () => {
    const cycle = await engine.reasoningCycle();
    expect(cycle.stability.check).toBe("inference-stability");
    expect(cycle.stability.passed).toBe(true);
    expect(cycle.consolidation).toBeDefined();
  });
});

// ---------------------------------------------------------
// Persistence round-trip via the Supabase-shaped adapter
// (durable stores: frelux_archie_native_facts/_outcomes)
// ---------------------------------------------------------
class InMemorySupabase implements SupabaseLike {
  public facts: Array<Record<string, unknown>> = [];
  public outcomes: Array<Record<string, unknown>> = [];

  from(table: string) {
    const rows = () =>
      table === "frelux_archie_native_facts" ? this.facts : this.outcomes;
    return {
      select: () => {
        const data = [...rows()];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({ data: data.slice(from, to + 1), error: null }),
        });
      },
      insert: async (row: unknown) => {
        rows().push((row as unknown[])[0] as Record<string, unknown>);
        return { error: null };
      },
      update: (patch: unknown) => ({
        eq: async (column: string, value: unknown) => {
          const list = rows();
          const idx = list.findIndex(
            (r) => r[column] === value || r.id === value,
          );
          if (idx >= 0) list[idx] = { ...list[idx], ...(patch as object) };
          return { error: null };
        },
      }),
      upsert: async (row: unknown) => {
        const r = row as Record<string, unknown>;
        const list = rows();
        const idx = list.findIndex((x) => x.id === r.id);
        if (idx >= 0) list[idx] = r;
        else list.push(r);
        return { error: null };
      },
    };
  }
}

describe("Durable persistence", () => {
  it("round-trips facts and outcomes through the Supabase-shaped adapter", async () => {
    const fakeDb = new InMemorySupabase();
    const persistence = new SupabasePersistence(fakeDb);
    const store = new FactStore(persistence);
    await store.assert({
      subject: "durability",
      predicate: "test",
      object: "persists across sessions",
      confidence: 0.8,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    expect(fakeDb.facts.length).toBe(1);

    // A NEW store (new session) hydrates from persistence.
    const secondSession = new FactStore(persistence);
    const hydrated = await secondSession.hydrate();
    expect(hydrated).toBe(1);
    expect(secondSession.query({ subject: "durability" }).length).toBe(1);
  });

  it("outcome learner persists outcomes when the adapter is wired", async () => {
    const fakeDb = new InMemorySupabase();
    const persistence = new SupabasePersistence(fakeDb);
    const store = new FactStore(persistence);
    const learner = new OutcomeLearner(store, persistence);
    await learner.record({
      kind: "success",
      task: "persisted outcome",
      contributing: [],
    });
    const second = new OutcomeLearner(store, persistence);
    const hydrated = await second.hydrate();
    expect(hydrated).toBe(1);
  });

  it("configureNativeEnginePersistence rebuilds the singleton with persistence", async () => {
    const fakeDb = new InMemorySupabase();
    configureNativeEnginePersistence(fakeDb as unknown as SupabaseLike);
    const engine = getNativeEngine();
    const d = engine.diagnostics();
    expect(d.persistence.facts).toBe(true);
    expect(d.persistence.note).toContain("frelux_archie_native_facts");
  });
});

// ---------------------------------------------------------
// App integration — catalog, health check, principle seed
// ---------------------------------------------------------
describe("Core integration", () => {
  it("the engine is a LIVE core system in the orchestrator health check", async () => {
    const health = await coreHealthCheck();
    const engineSystem = health.systems.find((s) => s.key === "NATIVE_ENGINE");
    expect(engineSystem).toBeDefined();
    expect(engineSystem!.status).toBe("LIVE");
    expect(health.healthy).toBe(true);
  });

  it("the durable seed migration exists and is idempotent", () => {
    const migration = read(
      "supabase/migrations/20260912120000_archie_native_engine.sql",
    );
    expect(migration).toContain("frelux_archie_native_facts");
    expect(migration).toContain("frelux_archie_native_outcomes");
    expect(migration).toContain("native_engine_core");
    expect(migration).toContain("ON CONFLICT (principle_id) DO NOTHING");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "ARCHIE NATIVE ENGINE → MEMORY → KNOWLEDGE → REASONING",
    );
  });

  it("the capability catalog registers the engine with its real exports", () => {
    const catalog = read("src/lib/archie/core-capabilities.ts");
    expect(catalog).toContain('"NATIVE_ENGINE"');
    expect(catalog).toContain("native-engine-core");
    const orchestrator = read("src/lib/archie/core-orchestrator.ts");
    expect(orchestrator).toContain(
      'NATIVE_ENGINE: () => import("@/lib/archie/native-engine-core")',
    );
  });

  it("archie-core and archie-chat wire durable persistence into the engine", () => {
    for (const fn of ["archie-core", "archie-chat"]) {
      const source = read(`supabase/functions/${fn}/index.ts`);
      expect(source).toContain("configureNativeEnginePersistence");
    }
  });

  it("the studio honestly gates on the not-implemented generative coding capability", () => {
    const studio = read("supabase/functions/archie-studio/index.ts");
    expect(studio).toContain("archie-native-engine");
    expect(studio).toContain("generative coding is not implemented");
  });

  it("external providers appear nowhere in the engine core (provider independence)", () => {
    const manifest = nativeEngineCapabilityManifest();
    expect(
      manifest.every((c) => !/gemini|openai|claude|anthropic/i.test(c.id)),
    ).toBe(true);
  });
});
// ---------------------------------------------------------
// Market intelligence adapter (price queries)
// ---------------------------------------------------------
describe("Market intelligence adapter", () => {
  it("classifies price questions as price_query intent", () => {
    for (const q of [
      "what is the price of cement",
      "current price of a bag of cement",
      "how much is a trip of sand",
      "granite price per tonne",
    ]) {
      expect(understand(q).intent).toBe("price_query");
    }
  });

  it("answers price queries from the wired lookup with the real price", async () => {
    const lookup: MarketPriceLookup = async (product, market) => {
      expect(product).toBe("cement");
      expect(market).toBeUndefined();
      return {
        product: "Cement (42.5R)",
        price: 9500,
        currency: "NGN",
        packageSize: 50,
        packageUnit: "kg",
        marketCode: "NG",
        freshness: "fresh",
        source: "approved",
        recordedAt: "2026-09-08T10:00:00.000Z",
      };
    };
    const engine = new ArchieNativeEngine({ marketPriceLookup: lookup });
    const result = await engine.converse("what is the price of cement");
    expect(result.responseText).toContain("NGN");
    expect(result.responseText).toContain("9500");
    expect(result.responseText).toContain("Cement");
    expect(result.responseText).toContain("approved price list");
  });

  it("labels raw observations and stale prices honestly", async () => {
    const engine = new ArchieNativeEngine({
      marketPriceLookup: async () => ({
        product: "Sharp sand",
        price: 45000,
        currency: "NGN",
        packageSize: null,
        packageUnit: null,
        marketCode: "NG",
        freshness: "stale",
        source: "observation",
        recordedAt: "2026-06-01T10:00:00.000Z",
      }),
    });
    const result = await engine.converse("how much is a trip of sand");
    expect(result.responseText).toContain("raw market observation");
    expect(result.responseText).toContain("stale");
    expect(result.responseText).toContain("indicative only");
  });

  it("says so honestly when no price data exists — never guesses", async () => {
    const engine = new ArchieNativeEngine({
      marketPriceLookup: async () => null,
    });
    const result = await engine.converse("price of 20mm granite today");
    expect(result.responseText).toContain("no observed price data");
    expect(result.responseText).toContain("do not guess");
  });

  it("admits when the adapter is not wired in a deployment", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.converse("current price of a bag of cement");
    expect(result.responseText).toContain("adapter is not wired");
  });

  it("archie-chat wires the real market price lookup at boot", () => {
    const source = read("supabase/functions/archie-chat/index.ts");
    expect(source).toContain("configureNativeEngineMarketLookup");
    expect(source).toContain("mi_approved_prices");
    expect(source).toContain("mi_price_observations");
  });
});
// ---------------------------------------------------------
// System adapters (documents / images / voice / social /
// family) — same honest contract as the market lookup
// ---------------------------------------------------------
describe("System adapters", () => {
  it("classifies system status questions through the rule cascade", () => {
    expect(understand("what documents have I ingested").intent).toBe(
      "documents_query",
    );
    expect(understand("show my images").intent).toBe("images_query");
    expect(understand("voice bank status").intent).toBe("voice_query");
    expect(understand("what social accounts are connected").intent).toBe(
      "social_query",
    );
    expect(understand("who is in my trusted people").intent).toBe(
      "family_query",
    );
    // negatives: existing intents are not hijacked
    expect(understand("what is screeding").intent).toBe("knowledge_query");
    expect(understand("what is the price of cement").intent).toBe(
      "price_query",
    );
    expect(
      understand("how do i estimate mortar for blockwork").intent,
    ).not.toBe("construction_calc");
  });

  it("answers from the wired adapter with real provenance", async () => {
    const adapters: SystemAdapters = {
      documents: async () => ({
        headline: "3 ingestion(s): 2 AWAITING_APPROVAL, 1 APPROVED.",
        source: "frelux_archie_ingestions",
      }),
    };
    const engine = new ArchieNativeEngine({ systemAdapters: adapters });
    const result = await engine.converse("what documents have I ingested");
    expect(result.responseText).toContain("AWAITING_APPROVAL");
    expect(result.responseText).toContain("Source: frelux_archie_ingestions");
  });

  it("says so honestly when a system has nothing recorded — never invents state", async () => {
    const engine = new ArchieNativeEngine({
      systemAdapters: { social: async () => null },
    });
    const result = await engine.converse("what social accounts are connected");
    expect(result.responseText).toContain("nothing to report");
    expect(result.responseText).toContain("do not invent");
  });

  it("admits when an adapter is not wired in a deployment", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.converse("who is in my trusted people");
    expect(result.responseText).toContain("adapter is not wired");
    expect(result.responseText).toContain("never invent");
  });

  it("archie-chat wires all five real adapters at boot", () => {
    const source = read("supabase/functions/archie-chat/index.ts");
    expect(source).toContain("configureNativeEngineSystemAdapters");
    expect(source).toContain("frelux_archie_ingestions");
    expect(source).toContain("frelux_archie_voice_samples");
    expect(source).toContain("frelux_social_accounts");
    expect(source).toContain("frelux_archie_people");
  });
});

// ---------------------------------------------------------
// Deterministic construction calculators
// ---------------------------------------------------------
describe("Construction calculators (deterministic)", () => {
  it("classifies construction estimates and does not hijack price or math queries", () => {
    expect(
      understand(
        "how many blocks do I need for a 6 by 3 meter wall",
        [],
        CONSTRUCTION_NLU_HINTS,
      ).intent,
    ).toBe("construction_calc");
    expect(
      understand(
        "how much paint for a 4 by 5 meter room",
        [],
        CONSTRUCTION_NLU_HINTS,
      ).intent,
    ).toBe("construction_calc");
    expect(
      understand(
        "how many bags of cement for 2 cubic meters of concrete",
        [],
        CONSTRUCTION_NLU_HINTS,
      ).intent,
    ).toBe("construction_calc");
    expect(understand("what is the price of cement").intent).toBe(
      "price_query",
    );
    expect(understand("what is 340 times 22").intent).toBe("math_question");
  });

  it("estimates blocks for a wall with stated assumptions", () => {
    const answer = constructionEstimate(
      "how many blocks for a 6 by 3 meter wall",
    );
    // 6*3=18 m2 / 0.1081 = 166.5 * 1.05 = 174.9 → 175
    expect(answer).toContain("175 blocks");
    expect(answer).toContain("450x225mm");
    expect(answer).toContain("5%");
  });

  it("converts feet to meters for imperial walls", () => {
    const answer = constructionEstimate(
      "how many blocks for a 20 by 10 feet wall",
    );
    // 20ft=6.096m, 10ft=3.048m → 18.58 m2 → ~181 blocks
    expect(answer).toContain("181 blocks");
    expect(answer).toContain("ft x");
  });

  it("estimates paint litres for two coats", () => {
    const answer = constructionEstimate("how much paint for 20 square meters");
    // 20/10*2 = 4 litres
    expect(answer).toContain("4 litres");
  });

  it("estimates cement bags for a concrete volume (1:2:4)", () => {
    const answer = constructionEstimate(
      "how many bags of cement for 2 cubic meters of concrete",
    );
    // 2 * 1.54/7 * 28.8 bags/m3 * 1.05 = 13.3 → 14
    expect(answer).toContain("14 x 50kg");
    expect(answer).toContain("1:2:4");
  });

  it("asks honestly for missing dimensions — never guesses", () => {
    expect(constructionEstimate("how many blocks for a wall")).toContain(
      "I will not guess dimensions",
    );
    expect(constructionEstimate("how much paint")).toContain(
      "I will not guess dimensions",
    );
    expect(constructionEstimate("cement estimate")).toContain(
      "I will not guess volumes",
    );
  });

  it("offers the three calculators when the intent has no target", () => {
    const answer = constructionEstimate("calculate something for me");
    expect(answer).toContain("blocks");
    expect(answer).toContain("paint");
    expect(answer).toContain("cement");
  });
});

// ---------------------------------------------------------
// systemInstruction retrieval (livechat knowledge-base path)
// ---------------------------------------------------------
describe("Engine systemInstruction retrieval (livechat)", () => {
  const engine = new ArchieNativeEngine();
  const turns = (text: string) => [
    { role: "owner" as const, parts: [{ text }] },
  ];
  const KB = `You are the FRELUX live chat assistant. Guide visitors to calculators.

## How much paint do I need?
Measure the wall area, subtract openings, and plan for 2 coats. A 20-litre bucket covers roughly 250-350 m2 per coat depending on surface. Use the Paint Calculator for exact quantities.

## Choosing paint finish
Satin finish is washable and good for interiors. Matte hides wall imperfections better.`;

  it("answers a practical question from the injected knowledge base, not the tool dead-end", async () => {
    const result = await engine.generate({
      turns: turns("How many buckets of paint do I need for a 12 by 12 room?"),
      systemInstruction: KB,
      tools: [],
    });
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    // The remote engine now routes dimension questions to its
    // REAL deterministic paint calculator (plan P1/P2) — a
    // computed answer, not the tool dead-end of the past.
    expect(text).not.toContain("I did not find an arithmetic expression");
    // Batch 15 (fix 49): the prose now derives from the seeded
    // data records (paintCoats=2 → "for 2 coats"), so it can
    // never silently diverge from the computed assumptions.
    expect(text).toMatch(/litres for 2 coats|litres for two coats|20-litre/);
  });

  it("still computes real arithmetic when an expression IS present", async () => {
    const result = await engine.generate({
      turns: turns("what is 25 * 48?"),
      systemInstruction: KB,
      tools: [],
    });
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    expect(text).toContain("1200");
  });

  it("prefers the on-subject section over one sharing only filler words", async () => {
    const noisyKB = `You are the FRELUX live chat assistant.

## Nigerian Building Regulations and What You Need to Know
Permits and approvals for construction projects in Nigeria.

## Tile Grout Selection and Application Guide
Choose cement-based grout for wet areas and epoxy grout for heavy-wear floors. Apply with a rubber float and seal after curing.`;
    const result = await engine.generate({
      turns: turns("What grout should I choose for my tiles?"),
      systemInstruction: noisyKB,
      tools: [],
    });
    const text = result.parts
      .map((p) => (p as { text?: string }).text ?? "")
      .join(" ");
    expect(text.toLowerCase()).not.toContain("building regulations");
    expect(text.toLowerCase()).toContain("grout");
  });
});

// =========================================================
// OWNER CHAT TURN SHAPE (owner report 2026-09-15 — regression)
//
// archie-core used to flatten the whole conversation into ONE
// prompt blob ("Conversation so far: ... Owner's new message:
// hello ...") so the shared NLU classified the BLOB, not the
// owner's words: a greeting fell into the math dead-end and
// "who created you" hit the canned identity answer. The owner
// path now sends the REAL turn structure — history as history
// turns, the raw message as the final owner turn, context in
// the systemInstruction — identical to every ARCHIE surface.
// These tests pin that contract at the engine level.
// =========================================================
describe("Owner chat turn shape (archie-core regression 2026-09-15)", () => {
  const engine = new ArchieNativeEngine();
  const ownerTurns = (message: string, history: string[][] = []) => [
    ...history.map(([role, text]) => ({
      role: role === "owner" ? ("owner" as const) : ("archie" as const),
      parts: [{ text }],
    })),
    { role: "owner" as const, parts: [{ text: message }] },
  ];
  const systemContext =
    "You are ARCHIE — the Owner's personal intelligence system. " +
    "Tool execution results (ground truth): TOOL frelux_data OK: 27 facts, " +
    "141 estimates, 355 materials.";

  it("greets a bare hello — never the math dead-end — with tool data riding in the context", async () => {
    const result = await engine.generate({
      turns: ownerTurns("hello"),
      systemInstruction: systemContext,
      tools: [],
    });
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    expect(text).not.toContain("I did not find an arithmetic expression");
    expect(text.toLowerCase()).toMatch(/good to hear|hello|welcome|hey/i);
  });

  it("answers identity from its facts-cited self-model, not a canned dump", async () => {
    const result = await engine.generate({
      turns: ownerTurns("who created you"),
      systemInstruction: systemContext,
      tools: [],
    });
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    expect(text).not.toContain("I did not find an arithmetic expression");
    expect(text).toMatch(/ARCHIE|native engine|native inference/i);
  });

  it("routes a follow-up in history correctly — history is turns, not a blob", async () => {
    const result = await engine.generate({
      turns: ownerTurns("and what about 25 * 48?", [
        ["owner", "what is 12 * 12?"],
        ["archie", "12 * 12 = 144."],
      ]),
      systemInstruction: systemContext,
      tools: [],
    });
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    expect(text).toContain("1200");
  });
});
