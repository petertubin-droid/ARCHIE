// =========================================================
// ARCHIE MEMORY ↔ UNIFIED INTELLIGENCE ↔ ANATOMY —
// END-TO-END INTEGRATION TESTS
//
// Proves the full cognitive loop as ONE coherent system:
//
//   INPUT → PERCEPTION (eyes) → INTELLIGENCE (heart)
//         → MEMORY RETRIEVAL (brain) → CONTEXTUALIZATION
//         → REASONING → VALIDATION (liver-kidneys)
//         → DECISION/AUTHORITY (balance) → EXECUTION (hands)
//         → RESULT → MEMORY UPDATE (digestive/learning)
//
// Every assertion exercises REAL production code paths —
// the native engine, the cognitive kernel, the anatomy
// organ bindings. Only the PERSISTENCE ADAPTER is doubled
// (in-memory), exactly like the other engine test suites.
// =========================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import {
  CognitiveKernel,
  ORGAN_PHASE_BINDINGS,
} from "@studio-shared/archie-ai/cognitive/kernel.ts";
import { LOOP_PHASES } from "@studio-shared/archie-ai/cognitive/types.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";
import type { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import type { ArchieInferenceTurn } from "@studio-shared/archie-ai/runtime.ts";

const root = join(import.meta.dirname ?? process.cwd(), "../../../../");
const read = (rel: string): string => readFileSync(join(root, rel), "utf-8");

// In-memory persistence double (same pattern as the
// cognitive-engine suite — only the ADAPTER is faked).
class MockDb implements SupabaseLike {
  public tables: Record<string, Array<Record<string, unknown>>> = {
    frelux_archie_native_facts: [],
    frelux_archie_native_outcomes: [],
    frelux_archie_world_model: [],
    frelux_archie_audit_log: [],
    frelux_archie_cognitive_traces: [],
  };
  from(table: string) {
    const rows = () => this.tables[table] ?? (this.tables[table] = []);
    return {
      // PostgREST-style builder: the select result is a
      // thenable that ALSO carries .range() — required by
      // the SupabaseLike contract since registry reads
      // page via .range(). Not async: an async wrapper
      // would erase the range intersection on the return.
      select: () => {
        const data = [...rows()];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({
              data: data.slice(from, to + 1),
              error: null,
            }),
        });
      },
      insert: async (row: unknown) => {
        const arr = row as Array<Record<string, unknown>>;
        for (const r of arr ?? [row as Record<string, unknown>]) {
          rows().push(r as Record<string, unknown>);
        }
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

function turns(...texts: string[]): ArchieInferenceTurn[] {
  return texts.map((text, i) => ({
    role: i % 2 === 0 ? ("owner" as const) : ("archie" as const),
    parts: [{ text }],
  }));
}

// ---------------------------------------------------------
// 1. THE ANATOMY IS A LIVE ARCHITECTURAL MODEL
//    Every kernel phase binds to a REAL seeded organ — the
//    bindings are checked against the actual migrations, not
//    a doc.
// ---------------------------------------------------------
describe("anatomy integration (organs are real modules)", () => {
  const seedKeys = new Set<string>();
  for (const file of [
    "supabase/migrations/20260910200000_archie_cognitive_anatomy.sql",
    "supabase/migrations/20260913130000_archie_connected_intelligence.sql",
  ]) {
    const sql = read(file);
    // Every archie_subsystems INSERT, up to its ON CONFLICT
    // terminator: rows are ('key', 'organ', ...) tuples.
    for (const chunk of sql
      .split("INSERT INTO public.archie_subsystems")
      .slice(1)) {
      const body = chunk.split("ON CONFLICT")[0];
      for (const row of body.matchAll(/\('([a-z-]+)',/g)) {
        seedKeys.add(row[1]);
      }
    }
  }

  it("the archie_subsystems seed defines all 23 organs", () => {
    expect(seedKeys.size).toBe(23);
  });

  it("every kernel phase binds to a seeded organ — no invented anatomy", () => {
    expect(Object.keys(ORGAN_PHASE_BINDINGS).sort()).toEqual(
      [...LOOP_PHASES].sort(),
    );
    for (const organs of Object.values(ORGAN_PHASE_BINDINGS)) {
      for (const organ of organs) {
        expect(seedKeys.has(organ)).toBe(true);
      }
    }
  });

  it("a full kernel cycle records executed phases WITH their organs", async () => {
    const kernel = new CognitiveKernel(new MockDb());
    const cycle = await kernel.cycle("what is 340 times 22");
    const executed = cycle.trace.phases.filter((p) => p.status === "executed");
    expect(executed.length).toBeGreaterThan(4);
    for (const p of executed) {
      expect(p.organs ?? []).not.toHaveLength(0);
      for (const organ of p.organs ?? []) {
        expect(seedKeys.has(organ)).toBe(true);
      }
    }
    // The cognitive loop's signature organs really ran:
    const byPhase = new Map(cycle.trace.phases.map((p) => [p.phase, p]));
    expect(byPhase.get("PERCEIVE")?.organs).toContain("eyes");
    expect(byPhase.get("RETRIEVE")?.organs).toContain("brain");
    expect(byPhase.get("REASON")?.organs).toContain("heart");
  });

  it("the cycle trace is persisted (memory of thinking itself)", async () => {
    const db = new MockDb();
    const kernel = new CognitiveKernel(db);
    await kernel.cycle("hello archie");
    expect(
      db.tables.frelux_archie_cognitive_traces.length,
    ).toBeGreaterThanOrEqual(1);
    const trace = db.tables.frelux_archie_cognitive_traces[0];
    const phases = (trace.phases as unknown[]) ?? [];
    expect(phases.length).toBeGreaterThan(4);
  });
});

// ---------------------------------------------------------
// 2. MEMORY CHANGES REASONING — the full
//    LEARN → RETRIEVE → REASON → CORRECT → OUTCOME cycle
// ---------------------------------------------------------
describe("memory changes reasoning (end-to-end loop)", () => {
  it("teach → cite → correct → outcome: memory drives the answer and the correction is learned", async () => {
    const engine = new ArchieNativeEngine();

    // LEARN: owner teaches; store records with provenance.
    const taught = await engine.generate({
      turns: turns(
        "remember that the screeding mix ratio is 1:4 cement to sand",
      ),
      tools: [],
      systemInstruction: "",
    });
    expect(taught.parts[0].text ?? "").toContain("Retained");

    // RETRIEVE + REASON: the taught memory changes the answer.
    const asked = await engine.generate({
      turns: turns("what is the screeding mix ratio"),
      tools: [],
      systemInstruction: "",
    });
    expect(asked.parts[0].text ?? "").toContain("1:4");
    expect(asked.parts[0].text ?? "").toContain("owner-taught");

    // CORRECT: owner corrects — old knowledge is demoted, not
    // silently kept.
    const corrected = await engine.generate({
      turns: turns(
        "no, that is wrong. the screeding mix ratio is 1:5 cement to sand",
      ),
      tools: [],
      systemInstruction: "",
    });
    expect(corrected.parts[0].text ?? "").toContain("Correction processed");

    // OBSERVE OUTCOME + IMPROVE: the correction produced a
    // learning outcome (credit assignment weakened the wrong
    // fact). The next answer reflects the corrected world.
    const reasked = await engine.generate({
      turns: turns("what is the screeding mix ratio"),
      tools: [],
      systemInstruction: "",
    });
    expect(reasked.parts[0].text ?? "").toContain("1:5");
    expect(reasked.parts[0].text ?? "").not.toMatch(
      /validated knowledge[\s\S]*1:4 cement to sand/,
    );
  });

  it("episodic memory changes the answer when long-term memory has nothing", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate({
      turns: [
        {
          role: "owner",
          parts: [
            {
              text: "for the lagos project we settled on 8mm reinforcement bars",
            },
          ],
        },
        {
          role: "owner",
          parts: [{ text: "what do you know about the reinforcement bars" }],
        },
      ],
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("8mm reinforcement bars");
    expect(text).toContain("conversation");
    expect(text).toContain("episodic");
  });

  it("context memory never accumulates duplicates across requests", async () => {
    const engine = new ArchieNativeEngine();
    const history = turns(
      "hello",
      "how many blocks for a 6 by 3 meter wall",
      "thanks",
    );
    // Two requests re-seeding the SAME history: the seed is
    // replaced, not appended.
    await engine.generate({
      turns: [
        ...history,
        { role: "owner", parts: [{ text: "what is 12 times 4" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    await engine.generate({
      turns: [
        ...history,
        { role: "owner", parts: [{ text: "what is 12 times 5" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    // 4 seeded turns (3 history + current input, REPLACED on
    // each request) + 2 live owner inputs + 2 archie answers
    // = 8. The old append-on-reseed behaviour gave ≥ 12.
    expect(engine.diagnostics().counts.memoryTurns).toBe(8);
  });

  it("casual conversation does NOT create knowledge — nothing is blindly memorized", async () => {
    const engine = new ArchieNativeEngine();
    // Warm-up request boots the engine (foundational seed
    // corpus loads); record the baseline after boot.
    await engine.generate({
      turns: turns("hello archie"),
      tools: [],
      systemInstruction: "",
    });
    const baseline = engine.diagnostics().counts.facts;
    expect(baseline).toBeGreaterThan(0);
    await engine.generate({
      turns: turns("the weather in lagos is nice today"),
      tools: [],
      systemInstruction: "",
    });
    const facts = await engine.generate({
      turns: turns("what is the weather in lagos"),
      tools: [],
      systemInstruction: "",
    });
    // Nothing was stored as knowledge:
    expect(facts.parts[0].text ?? "").not.toContain(
      "Retained as validated knowledge",
    );
    expect(engine.diagnostics().counts.facts).toBe(baseline);
  });

  it("secrets are refused at the memory gate — never stored", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate({
      turns: turns("remember that my api key is sk-abc123def456ghi789"),
      tools: [],
      systemInstruction: "",
    });
    expect(result.parts[0].text ?? "").toContain("not store");
    expect(result.parts[0].text ?? "").toContain("secret");
  });

  it("owner re-teaching replaces audibly — no approval step, older kept as history (owner directive 2026-09-14)", async () => {
    const engine = new ArchieNativeEngine();
    await engine.generate({
      turns: turns("remember that the tile price is 8000"),
      tools: [],
      systemInstruction: "",
    });
    const conflict = await engine.generate({
      turns: turns("remember that the tile price is 12500"),
      tools: [],
      systemInstruction: "",
    });
    // The replacement is AUDIBLE — the owner is told the older
    // record is superseded and kept as history, never silently
    // overwritten.
    const msg = conflict.parts[0].text ?? "";
    expect(msg).toMatch(/replace|supersede|older/i);
    expect(msg).not.toMatch(/contradiction could not be resolved/i);
    // The owner's latest teaching STANDS as validated knowledge
    // (no approval step — owner directive 2026-09-14).
    const asked = await engine.generate({
      turns: turns("what is the tile price"),
      tools: [],
      systemInstruction: "",
    });
    const text = asked.parts[0].text ?? "";
    expect(text).toMatch(/\b12500\b/);
    // ...and the superseded record is kept as uncertain history,
    // not destroyed.
    const store = (engine as unknown as { facts: FactStore }).facts;
    const tileFacts = store
      .list()
      .filter((f) => f.subject === "tile" && f.predicate === "price");
    expect(tileFacts.some((f) => String(f.object) === "12500")).toBe(true);
    expect(
      tileFacts.some(
        (f) => String(f.object) === "8000" && f.status === "uncertain",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------
// 3. AUTHORITY — memory never overrides Owner Authority
// ---------------------------------------------------------
describe("authority in the unified loop", () => {
  it("consequential operations stay owner-gated inside the full kernel cycle", async () => {
    const kernel = new CognitiveKernel(new MockDb());
    const cycle = await kernel.cycle(
      "please deploy the database migration to production",
    );
    expect(cycle.responseText).toContain("[Owner Authority]");
    expect(cycle.responseText).toContain("PROPOSE");
    expect(cycle.toolResults).toHaveLength(0);
  });
});

// ---------------------------------------------------------
// 4. PRODUCTION WIRING — the chat surface runs the loop
// ---------------------------------------------------------
describe("production wiring (archie-chat source)", () => {
  const source = read("supabase/functions/archie-chat/index.ts");

  it("owner chat runs the unified kernel cycle — the full loop is live", () => {
    expect(source).toContain("getCognitiveEngine().cycle");
    expect(source).toContain("cognitiveTrace");
  });

  it("visitors run on an isolated per-request engine — zero access to owner memory", () => {
    // The visitor block must construct a fresh isolated engine,
    // NOT the configured singleton with owner persistence.
    const visitorBlock = source.slice(
      source.indexOf("PUBLIC VISITOR MODE"),
      source.indexOf("// 3. Resolve the inference engine"),
    );
    expect(visitorBlock).toContain("new ArchieNativeEngine()");
    expect(visitorBlock).not.toContain("resolveArchieCapabilityEngine");
    expect(visitorBlock).toContain("archie-native-isolated");
  });

  it("the kernel singleton shares the same service DB (world model, audit, traces persist)", () => {
    expect(source).toContain("configureCognitiveEnginePersistence");
  });
});
