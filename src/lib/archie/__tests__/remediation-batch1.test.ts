// =========================================================
// REMEDIATION BATCH 1 TESTS (2026-09-12)
//
// Measurable proof for the three remediation items:
//   1. JWKS auth resilience — caching, coalescing,
//      negative cache, bounded stale-if-error.
//   2. World-model temporal queries — aliveAt(t) and
//      between(from, to) projections over the versioned
//      observation log.
//   3. Planner validation + replanning — live-store
//      precondition checking and failure-triggered replans.
// =========================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchJwks,
  __resetJwksCacheForTests,
} from "@studio-shared/archie-ai/security/cross-project-auth.ts";
import { WorldModel } from "@studio-shared/archie-ai/cognitive/world-model.ts";
import { Planner } from "@studio-shared/archie-ai/native-engine/planning.ts";
import type { Operator } from "@studio-shared/archie-ai/native-engine/types.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

// ---------------------------------------------------------
// 1. JWKS resilience
// ---------------------------------------------------------
describe("JWKS auth resilience (remediation batch 1)", () => {
  const url = "https://authority.example.com/.well-known/jwks.json";
  let fetchCalls: number[] = [];
  let originalFetch: typeof globalThis.fetch;

  const goodKeys = [{ kid: "k1", kty: "EC", crv: "P-256", x: "a", y: "b" }];

  beforeEach(() => {
    __resetJwksCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("caches good keys — one fetch, many verifications", async () => {
    const fake = (async () => {
      fetchCalls.push(1);
      return {
        ok: true,
        json: async () => ({ keys: goodKeys }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fake;

    const first = await fetchJwks(url);
    expect(first).toEqual(goodKeys as unknown as Record<string, unknown>[]);
    const second = await fetchJwks(url);
    expect(second).toEqual(goodKeys as unknown as Record<string, unknown>[]);
    expect(fetchCalls.length).toBe(1);
  });

  it("serves stale keys on refresh failure (bounded stale-if-error)", async () => {
    // Seed a good cache.
    globalThis.fetch = (async () => {
      fetchCalls.push(1);
      return {
        ok: true,
        json: async () => ({ keys: goodKeys }),
      } as Response;
    }) as typeof globalThis.fetch;
    await fetchJwks(url);
    expect(fetchCalls.length).toBe(1);

    // Age the cache past the 10-minute TTL.
    vi.setSystemTime(new Date("2026-09-12T12:11:00Z"));

    // Endpoint breaks: stale keys must still be served (no throw).
    globalThis.fetch = (async () => {
      fetchCalls.push(1);
      throw new Error("network down");
    }) as unknown as typeof globalThis.fetch;
    const stale = await fetchJwks(url);
    expect(stale).toEqual(goodKeys as unknown as Record<string, unknown>[]);

    // Negative cache: within the 60s failure window, no refetch.
    vi.setSystemTime(new Date("2026-09-12T12:11:30Z"));
    await fetchJwks(url);
    expect(fetchCalls.length).toBe(2); // one good + one failed, no more
  });

  it("returns null when it never had good keys and the endpoint fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof globalThis.fetch;
    const result = await fetchJwks(url);
    expect(result).toBeNull();
  });

  it("never serves stale keys older than 24h", async () => {
    globalThis.fetch = (async () => {
      fetchCalls.push(1);
      return {
        ok: true,
        json: async () => ({ keys: goodKeys }),
      } as Response;
    }) as typeof globalThis.fetch;
    await fetchJwks(url);

    // Age the cache beyond the stale ceiling and fail the refresh.
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof globalThis.fetch;
    const result = await fetchJwks(url);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------
// 2. World-model temporal queries
// ---------------------------------------------------------
describe("World-model temporal queries (remediation batch 1)", () => {
  it("aliveAt(t) projects the world as it stood at t", async () => {
    const wm = new WorldModel();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
      await wm.relate({
        subject: "site-a",
        relation: "uses",
        object: "mobile-mixer",
        confidence: 0.8,
        provenance: "test",
      });
      vi.setSystemTime(new Date("2026-09-03T10:00:00Z"));
      await wm.relate({
        subject: "site-b",
        relation: "uses",
        object: "screed-pump",
        confidence: 0.8,
        provenance: "test",
      });

      // At Sept 2, only site-a's relation exists.
      const atSept2 = wm.aliveAt(new Date("2026-09-02T00:00:00Z"));
      expect(atSept2.length).toBe(1);
      expect(atSept2[0].subject).toBe("site-a");

      // Now: both are current.
      const now = wm.aliveAt(new Date("2026-09-04T00:00:00Z"));
      expect(now.length).toBe(2);

      // Before anything: empty world, honestly.
      const atAug = wm.aliveAt(new Date("2026-08-01T00:00:00Z"));
      expect(atAug.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("between(from, to) returns the changelog window, newest first", async () => {
    const wm = new WorldModel();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
      await wm.relate({
        subject: "p",
        relation: "r",
        object: "old",
        confidence: 0.8,
        provenance: "test",
      });
      vi.setSystemTime(new Date("2026-09-05T10:00:00Z"));
      await wm.relate({
        subject: "q",
        relation: "r",
        object: "new",
        confidence: 0.8,
        provenance: "test",
      });
      const win = wm.between(
        new Date("2026-09-02T00:00:00Z"),
        new Date("2026-09-06T00:00:00Z"),
      );
      expect(win.length).toBe(1);
      expect(win[0].subject).toBe("q");
      expect(win[0].observedAt).toBe("2026-09-05T10:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------
// 3. Planner validation + replanning
// ---------------------------------------------------------
describe("Planner validatePlan + replan (remediation batch 1)", () => {
  const operators: Operator[] = [
    {
      id: "look-up",
      description: "Answer from stored knowledge",
      achieves: { predicate: "answer" },
      preconditions: [{ subject: "knowledge", predicate: "available" }],
      effects: [],
      cost: 1,
    },
    {
      id: "research",
      description: "Research the open web",
      achieves: { predicate: "answer" },
      preconditions: [],
      effects: [],
      cost: 3,
    },
  ];

  it("flags unsatisfied literal preconditions against the live store", async () => {
    const facts = new FactStore();
    const planner = new Planner(facts, operators);
    // Hand-built plan exercising the look-up operator directly —
    // the means-ends planner itself routes around unsatisfiable
    // preconditions, so validation is tested on an explicit
    // plan, then on the real planner output.
    const explicitPlan = {
      goal: "answer",
      steps: [
        {
          operatorId: "look-up",
          achieves: "answer",
          satisfies: "answer",
          missingPreconditions: ["knowledge available"],
        },
      ],
      executable: false,
      totalCost: 1,
      gapReport: ["knowledge available"],
      alternatives: [],
      risk: { level: "low", notes: [] },
    } as unknown as Parameters<Planner["validatePlan"]>[0];
    const v1 = planner.validatePlan(explicitPlan);
    // The cheapest operator needs "knowledge available" — absent.
    expect(v1.valid).toBe(false);
    expect(v1.issues.some((i) => i.includes("knowledge"))).toBe(true);
    // The real planner's own output (research path, no
    // preconditions) must validate clean.
    const realPlan = planner.plan("answer");
    expect(planner.validatePlan(realPlan).valid).toBe(true);

    // Teach the precondition: validation must pass.
    await facts.assert({
      subject: "knowledge",
      predicate: "available",
      object: true,
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "candidate",
    } as Parameters<FactStore["assert"]>[0]);
    const v2 = planner.validatePlan(explicitPlan);
    expect(v2.valid).toBe(true);
    expect(v2.issues.length).toBe(0);
  });

  it("replan excludes a failed operator and still achieves the goal", () => {
    const facts = new FactStore();
    const planner = new Planner(facts, operators);
    const replanned = planner.replan("answer", "look-up");
    // The research operator (no preconditions) is still available.
    expect(replanned.steps.length).toBeGreaterThan(0);
    expect(replanned.steps.every((s) => s.operatorId !== "look-up")).toBe(true);
    expect(replanned.gapReport.some((g) => g.includes("excluded"))).toBe(true);
  });

  it("replan is honest when no alternative chain exists", () => {
    const facts = new FactStore();
    const single: Operator[] = [operators[0]];
    const planner = new Planner(facts, single);
    const replanned = planner.replan("answer", "look-up");
    expect(replanned.executable).toBe(false);
    expect(replanned.gapReport.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------
// Batch 13 (Level 9 — planning internals) regressions — fixes 43, 44, 45
// ---------------------------------------------------------
describe("batch 13 — planner semantics", () => {
  it("fix 43: an operator achieving the same predicate for a DIFFERENT subject does not satisfy a subject-scoped goal", () => {
    const operators: Operator[] = [
      {
        id: "plan-something-else",
        description: "Plan a different subject entirely",
        achieves: { subject: "other project", predicate: "planned" },
        preconditions: [],
        effects: [],
        cost: 1,
      },
      {
        id: "plan-the-goal",
        description: "Plan the actual goal subject",
        achieves: { subject: "bungalow roofing", predicate: "planned" },
        preconditions: [],
        effects: [],
        cost: 3,
      },
    ];
    const planner = new Planner(new FactStore(), operators);
    const plan = planner.plan({
      subject: "bungalow roofing",
      predicate: "planned",
    });
    // The cheap different-subject operator used to win by
    // predicate match alone; only the right subject counts.
    expect(plan.steps.map((s) => s.operatorId)).toEqual(["plan-the-goal"]);
    expect(plan.executable).toBe(true);
  });

  it("fix 44: replan preserves the backward-chain derivability probe", () => {
    const facts = new FactStore();
    const operators: Operator[] = [
      {
        id: "direct",
        description: "Directly achieve",
        achieves: { predicate: "answer" },
        preconditions: [{ subject: "knowledge", predicate: "available" }],
        effects: [],
        cost: 1,
      },
      {
        id: "fallback",
        description: "Fallback route",
        achieves: { predicate: "answer" },
        preconditions: [],
        effects: [],
        cost: 9,
      },
    ];
    // Derivable probe: "knowledge available" is provable by rules.
    const derivable = (
      p: import("@studio-shared/archie-ai/native-engine/types.ts").FactPattern,
    ) => p.subject === "knowledge" && p.predicate === "available";
    const planner = new Planner(facts, operators, derivable);
    // Exclude the no-precondition fallback so the REMAINING
    // operator's precondition must be resolved by the probe.
    const replanned = planner.replan("answer", "fallback");
    // With the probe preserved, the replan over the remaining
    // operator resolves "knowledge available" by derivation
    // instead of reporting a false gap.
    expect(replanned.executable).toBe(true);
    expect(replanned.steps.some((s) => s.operatorId === "inference")).toBe(
      true,
    );
    expect(replanned.steps.some((s) => s.operatorId === "direct")).toBe(true);
    expect(replanned.gapReport.some((g) => g.includes("knowledge"))).toBe(
      false,
    );
  });

  it("fix 45: goal-scoped preconditions are validated when the goal subject is supplied", () => {
    const operators: Operator[] = [
      {
        id: "scope-step",
        description: "Define scope",
        achieves: { subject: "$goal", predicate: "scope-defined" },
        preconditions: [],
        effects: [],
        cost: 1,
      },
      {
        id: "plan-step",
        description: "Plan the goal",
        achieves: { subject: "$goal", predicate: "planned" },
        preconditions: [{ subject: "$goal", predicate: "scope-defined" }],
        effects: [],
        cost: 1,
      },
    ];
    const planner = new Planner(new FactStore(), operators);
    const plan = planner.plan({
      subject: "wedding reception",
      predicate: "planned",
    });
    expect(plan.executable).toBe(true);
    // With the goal subject the full chain validates clean —
    // the achieved intermediate predicates count as produced.
    const sighted = planner.validatePlan(plan, "wedding reception");
    expect(sighted.valid).toBe(true);
    expect(sighted.issues).toEqual([]);
    // Without the goal subject: honest note, NOT a silent pass.
    const blind = planner.validatePlan(plan);
    expect(blind.valid).toBe(false);
    expect(
      blind.issues.some((i) => i.includes("supply the goal subject")),
    ).toBe(true);
    // A hand-built plan missing its producing step is flagged.
    const broken = {
      goal: "wedding reception planned",
      steps: [
        {
          operatorId: "plan-step",
          achieves: "Plan the goal",
          satisfies: "wedding reception planned",
          missingPreconditions: [],
        },
      ],
      executable: false,
      totalCost: 1,
      gapReport: [],
      alternatives: [],
      risk: { level: "low", notes: [] },
    } as unknown as Parameters<Planner["validatePlan"]>[0];
    const flagged = planner.validatePlan(broken, "wedding reception");
    expect(flagged.valid).toBe(false);
    expect(
      flagged.issues.some(
        (i) => i.includes("wedding reception") && i.includes("scope-defined"),
      ),
    ).toBe(true);
  });
});
