import { describe, it, expect } from "vitest";
import { getNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { CognitiveKernel } from "@studio-shared/archie-ai/cognitive/kernel.ts";
import {
  runAnatomyHealth,
  ANATOMY_SUBSYSTEM_COUNT,
} from "@studio-shared/archie-ai/anatomy/registry.ts";
import { lookupCuratedWord } from "@studio-shared/lexicon/retrieval.ts";

describe("ARCHIE Unified Anatomy and Core Integration", () => {
  const engine = getNativeEngine();

  describe("1. Reliable Date & Time Queries (Fixed Time Intent)", () => {
    const dateQueries = [
      "What is today's date?",
      "what is today's date",
      "what's today's date",
      "tell me today's date",
      "what is the date today",
      "what date is today",
      "what date is it today",
      "what is the current date",
      "what time is it right now",
    ];

    for (const q of dateQueries) {
      it(`reliably answers "${q}" as time_query with direct clock reading`, async () => {
        const res = await engine.converse(q);
        expect(res.nlu.intent).toBe("time_query");
        expect(res.responseText).toMatch(/Today is [A-Za-z]+, \d{1,2} [A-Za-z]+ \d{4}/);
        expect(res.responseText).toContain("my system clock");
      });
    }

    it("evaluates date queries inside the Cognitive Kernel loop", async () => {
      const kernel = new CognitiveKernel();
      await kernel.boot();
      const res = await kernel.cycle("What is today's date?");
      expect(res.responseText).toMatch(/Today is [A-Za-z]+, \d{1,2} [A-Za-z]+ \d{4}/);
      expect(res.epistemic).toMatch(/KNOWN|VERIFIED/);
    });
  });

  describe("2. Universal Lexicon Engine Integration", () => {
    it("looks up polysemous computing and general word 'run' with multiple senses", () => {
      const entry = lookupCuratedWord("run");
      expect(entry).not.toBeNull();
      expect(entry!.word.canonical).toBe("run");
      expect(entry!.senses.length).toBeGreaterThanOrEqual(4);
      const domains = entry!.senses.map((s) => s.domain);
      expect(domains).toContain("computing.systems");
      expect(domains).toContain("general.motion");
    });

    it("looks up construction engineering terms 'rebar' and 'concrete'", () => {
      const rebar = lookupCuratedWord("rebar");
      expect(rebar).not.toBeNull();
      expect(rebar!.senses[0].definition).toContain("reinforcing bars");

      const concrete = lookupCuratedWord("concrete");
      expect(concrete).not.toBeNull();
      expect(concrete!.senses[0].definition).toContain("composite construction material");
    });

    it("answers 'What does concrete mean?' with structured Universal Lexicon definitions", async () => {
      const res = await engine.converse("What does concrete mean?");
      expect(res.nlu.intent).toBe("knowledge_query");
      expect(res.responseText).toContain("concrete (noun):");
      expect(res.responseText).toContain("composite construction material");
      expect(res.responseText).toContain("ARCHIE Universal Lexicon Engine");
    });

    it("answers 'Define rebar' directly from Universal Lexicon", async () => {
      const res = await engine.converse("Define rebar");
      expect(res.nlu.intent).toBe("knowledge_query");
      expect(res.responseText).toContain("rebar (noun):");
      expect(res.responseText).toContain("reinforcing bars");
      expect(res.responseText).toContain("ARCHIE Universal Lexicon Engine");
    });

    it("answers synonym requests with inflection forms and synsets", async () => {
      const res = await engine.converse("Synonyms for rebar");
      expect(res.nlu.intent).toBe("knowledge_query");
      expect(res.responseText).toContain("Lexicon entry for \"rebar\"");
      expect(res.responseText).toContain("rebars");
    });
  });

  describe("3. 23 Anatomical Subsystems and Sensory Organs", () => {
    it("monitors exactly 23 distinct anatomical subsystems", () => {
      expect(ANATOMY_SUBSYSTEM_COUNT).toBe(23);
    });

    it("runs live health probes across all 23 subsystems without throwing", async () => {
      const mockDb = {
        from: () => ({
          select: () => ({
            count: () => Promise.resolve({ count: 5, error: null }),
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
      const probes = await runAnatomyHealth(mockDb as any);
      expect(probes.length).toBe(23);
      const keys = probes.map((p) => p.subsystem_key);
      expect(keys).toContain("heart");
      expect(keys).toContain("brain");
      expect(keys).toContain("head");
      expect(keys).toContain("eyes");
      expect(keys).toContain("ears");
      expect(keys).toContain("mouth");
      expect(keys).toContain("hands");
      expect(keys).toContain("legs");
      expect(keys).toContain("immune");
      expect(keys).toContain("skeleton");
      expect(keys).toContain("connective-tissue");

      const healthy = probes.filter((p) => p.status === "HEALTHY");
      expect(healthy.length).toBeGreaterThanOrEqual(10);
    });

    it("answers 'Check your anatomy' via system_status with organ health summary", async () => {
      const res = await engine.converse("Check your anatomy");
      expect(res.nlu.intent).toBe("system_status");
      expect(res.responseText).toContain("ARCHIE Anatomy Health Report (23 subsystems active):");
      expect(res.responseText).toContain("HEART:");
      expect(res.responseText).toContain("EYES:");
      expect(res.responseText).toContain("Cognitive Kernel");
    });
  });
});
