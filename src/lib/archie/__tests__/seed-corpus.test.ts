import { describe, expect, it } from "vitest";
// =========================================================
// Seed corpus integrity (plan P4, audit K1).
// The corpus is DATA with hard constraints — deterministic
// boot behavior depends on them.
// =========================================================

import {
  FRELUX_CORPUS,
  FULL_SEED_CORPUS,
  SEED_CORPUS_VERSION,
  SEED_FACTS,
} from "@studio-shared/archie-ai/native-engine/seed-corpus.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { CONSTRUCTION_SEED_FACTS } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

describe("seed corpus (P4 / K1)", () => {
  // v3 (domain-capture completion): the engine corpus and the
  // skill-contributed domain facts are checked TOGETHER — the
  // corpus constraints apply no matter which layer seeds them.
  const ALL_SEEDS = [...FULL_SEED_CORPUS, ...CONSTRUCTION_SEED_FACTS];

  it("is versioned — deployments can detect stale seeds", () => {
    expect(SEED_CORPUS_VERSION).toBe(5);
  });

  it("has no duplicate subject+predicate pairs — assert() would merge unpredictably", () => {
    const keys = ALL_SEEDS.map((f) => `${f.subject}::${f.predicate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains no rule-triggering predicates — no silent derivations at boot", () => {
    // is-a / part-of fire the transitivity + inheritance rules
    // and would derive facts at boot; corpus seeds must stay
    // inert until the owner earns derivations at runtime.
    for (const f of ALL_SEEDS) {
      expect(["is-a", "part-of"]).not.toContain(f.predicate);
    }
  });

  it("carries only sane confidences", () => {
    for (const f of ALL_SEEDS) {
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      expect(f.subject.length).toBeGreaterThan(0);
      expect(String(f.object).length).toBeGreaterThan(0);
    }
  });

  it("domain capture is complete — engine corpus is engine/business knowledge only", () => {
    // v3: the five construction material facts moved VERBATIM to
    // the construction domain skill; the engine corpus keeps
    // only engine-generic + deployment/business facts.
    expect(SEED_FACTS.length).toBe(1);
    const identity = SEED_FACTS.find(
      (f) => f.subject === "archie" && f.predicate === "identity",
    );
    expect(String(identity?.object)).toContain("no external AI provider");
    for (const f of FULL_SEED_CORPUS) {
      expect(
        f.subject,
        `${f.subject}/${f.predicate} is construction knowledge still in the engine corpus`,
      ).not.toMatch(/^(cement|screeding|concrete|portland-cement|mortar)$/);
    }
    // ...and the construction skill seeds them instead, unchanged
    expect(CONSTRUCTION_SEED_FACTS.length).toBe(5);
    const bag = CONSTRUCTION_SEED_FACTS.find(
      (f) => f.subject === "cement" && f.predicate === "bag-mass",
    );
    expect(bag?.object).toBe("50 kg");
  });

  it("FRELUX corpus is evidence-backed — policy facts only where verified", () => {
    expect(FRELUX_CORPUS.length).toBeGreaterThanOrEqual(14);
    // the two permanent owner directives (audit directives)
    expect(
      FRELUX_CORPUS.some(
        (f) =>
          f.predicate === "policy" &&
          String(f.object).includes("no external AI"),
      ),
    ).toBe(true);
    expect(
      FRELUX_CORPUS.some(
        (f) =>
          f.predicate === "price-policy" &&
          String(f.object).includes("never guesses"),
      ),
    ).toBe(true);
    // market observations provenance claim — real registry
    expect(
      FRELUX_CORPUS.some(
        (f) =>
          f.predicate === "registry" &&
          String(f.object).includes("frelux_archie_market_observations"),
      ),
    ).toBe(true);
  });

  it("boot seeds the full corpus with seed provenance, validated status, and an evidence stamp", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    for (const seed of [...FULL_SEED_CORPUS, ...CONSTRUCTION_SEED_FACTS]) {
      const match = engine
        .store()
        .list()
        .find(
          (f) =>
            f.subject === seed.subject &&
            f.predicate === seed.predicate &&
            JSON.stringify(f.object) === JSON.stringify(seed.object),
        );
      expect(match, `${seed.subject}/${seed.predicate}`).toBeDefined();
      expect(match?.status).toBe("validated");
      expect((match?.verifiedBy ?? []).join()).toContain("seed");
    }
  });

  it("a knowledge question about FRELUX now answers from the corpus", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.converse("what is the frelux em engine");
    expect(result.responseText.toLowerCase()).toContain("estimation");
  });
});
