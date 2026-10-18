// =========================================================
// ARCHIE ASSOCIATIVE MEMORY ENGINE — TEST SUITE
// src/lib/archie/__tests__/associative-memory.test.ts
//
// Comprehensive unit and integration verification for:
//   - Ebbinghaus retention and stability curves
//   - Temporal episode segmentation and linking
//   - Hebbian network and spreading activation
//   - Long-term FactStore bridging
//   - Unified episodic & associative recall engine
// =========================================================

import { describe, expect, it } from "vitest";
import {
  AssociativeNetwork,
  EpisodicLongTermAssociativeMemoryEngine,
  calculateRetention,
  calculateStability,
  computeStabilityMetrics,
  DEFAULT_BASE_HALF_LIFE_MS,
  MAX_HALF_LIFE_MS,
  MIN_RETENTION_FLOOR,
  rateTurnImportance,
  segmentTurnsIntoEpisodes,
} from "../associative-memory";
import type { Fact } from "../../../../supabase/functions/_shared/archie-ai/native-engine/types";
import type { EpisodicTurnRecord } from "../../../../supabase/functions/_shared/archie-ai/associative-memory/types";

describe("Ebbinghaus Decay & Memory Stability", () => {
  it("calculates retention monotonically decaying with elapsed time", () => {
    const stability = DEFAULT_BASE_HALF_LIFE_MS; // 7 days

    const atZero = calculateRetention(0, stability);
    const atOneDay = calculateRetention(1000 * 60 * 60 * 24, stability);
    const atSevenDays = calculateRetention(1000 * 60 * 60 * 24 * 7, stability);
    const atThirtyDays = calculateRetention(1000 * 60 * 60 * 24 * 30, stability);

    expect(atZero).toBe(1.0);
    expect(atOneDay).toBeLessThan(1.0);
    expect(atSevenDays).toBeCloseTo(0.5, 2); // Exactly 1 half-life
    expect(atThirtyDays).toBeLessThan(atSevenDays);
    expect(atThirtyDays).toBeGreaterThanOrEqual(MIN_RETENTION_FLOOR);
  });

  it("boosts stability with repetitions and importance", () => {
    const base = calculateStability(0, 0.2);
    const withRepetitions = calculateStability(5, 0.2);
    const withHighImportance = calculateStability(5, 0.9);

    expect(withRepetitions).toBeGreaterThan(base);
    expect(withHighImportance).toBeGreaterThan(withRepetitions);
  });

  it("respects the maximum half-life cap", () => {
    const capped = calculateStability(1000, 1.0);
    expect(capped).toBeLessThanOrEqual(MAX_HALF_LIFE_MS);
  });

  it("produces full stability metrics without stochastic drift", () => {
    const now = 1700000000000;
    const past = now - 1000 * 60 * 60 * 24 * 3; // 3 days ago

    const metrics1 = computeStabilityMetrics(past, 2, 0.5, now);
    const metrics2 = computeStabilityMetrics(past, 2, 0.5, now);

    expect(metrics1).toEqual(metrics2);
    expect(metrics1.retentionScore).toBeGreaterThan(0.5);
    expect(metrics1.halfLifeDays).toBeGreaterThan(7);
  });
});

describe("Episodic Turn Segmentation", () => {
  it("rates turn importance based on directives and quantitative data", () => {
    const trivial = rateTurnImportance("hello archie how are you");
    const directive = rateTurnImportance("Remember that we always use 1:4 mix ratio for screeding");
    const decision = rateTurnImportance("We decided and approved the dangote cement quote at 8500 ngn");

    expect(directive).toBeGreaterThan(trivial);
    expect(decision).toBeGreaterThan(trivial);
    expect(directive).toBeGreaterThanOrEqual(0.7);
  });

  it("segments turns separated by temporal gaps into distinct episodes", () => {
    const baseTime = 1700000000000;
    const turns: EpisodicTurnRecord[] = [
      {
        id: "t1",
        conversationId: "conv1",
        role: "owner",
        text: "Let's review the foundation in Lekki",
        timestamp: baseTime,
        entities: ["lekki", "foundation"],
        importance: 0.6,
        accessCount: 1,
        lastAccessedAt: baseTime,
      },
      {
        id: "t2",
        conversationId: "conv1",
        role: "archie",
        text: "Checking soil conditions and trench depth for Lekki site.",
        timestamp: baseTime + 1000 * 60 * 2, // 2 mins later
        entities: ["lekki"],
        importance: 0.5,
        accessCount: 1,
        lastAccessedAt: baseTime + 1000 * 60 * 2,
      },
      // 40-minute gap -> new episode
      {
        id: "t3",
        conversationId: "conv1",
        role: "owner",
        text: "Now regarding the roof trusses in Abuja",
        timestamp: baseTime + 1000 * 60 * 42,
        entities: ["roof", "abuja"],
        importance: 0.7,
        accessCount: 1,
        lastAccessedAt: baseTime + 1000 * 60 * 42,
      },
    ];

    const episodes = segmentTurnsIntoEpisodes(turns, "conv1");

    expect(episodes.length).toBe(2);
    expect(episodes[0].turnIds).toEqual(["t1", "t2"]);
    expect(episodes[1].turnIds).toEqual(["t3"]);
    expect(episodes[0].succeedingEpisodeId).toBe(episodes[1].id);
    expect(episodes[1].precedingEpisodeId).toBe(episodes[0].id);
  });
});

describe("Associative Network & Spreading Activation", () => {
  it("reinforces edges using Hebbian learning without exceeding 1.0", () => {
    const net = new AssociativeNetwork();
    net.addOrGetNode("e1", "cement", "entity");
    net.addOrGetNode("e2", "sand", "entity");

    const edge1 = net.reinforceEdge("e1", "e2", "co_occurrence", 0.3);
    expect(edge1.weight).toBeCloseTo(0.3, 2);
    expect(edge1.coOccurrenceCount).toBe(1);

    const edge2 = net.reinforceEdge("e1", "e2", "co_occurrence", 0.3);
    // Delta w = 0.3 * (1 - 0.3) = 0.21 -> 0.51
    expect(edge2.weight).toBeCloseTo(0.51, 2);
    expect(edge2.coOccurrenceCount).toBe(2);

    for (let i = 0; i < 20; i++) {
      net.reinforceEdge("e1", "e2", "co_occurrence", 0.3);
    }
    expect(net.getEdgeWeight("e1", "e2")).toBeLessThanOrEqual(1.0);
    expect(net.getEdgeWeight("e1", "e2")).toBeGreaterThan(0.95);
  });

  it("prohibits self-referential edges", () => {
    const net = new AssociativeNetwork();
    net.addOrGetNode("e1", "cement", "entity");
    expect(() => net.reinforceEdge("e1", "e1", "co_occurrence")).toThrow(/Self-referential/);
  });

  it("spreads activation across multi-hop paths with decay and audit paths", () => {
    const net = new AssociativeNetwork();
    net.addOrGetNode("n1", "lagos", "entity");
    net.addOrGetNode("n2", "island", "concept");
    net.addOrGetNode("n3", "waterproofing", "concept");
    net.addOrGetNode("n4", "membrane", "concept");

    // n1 <-> n2 <-> n3 <-> n4
    net.reinforceEdge("n1", "n2", "semantic_similarity", 0.8);
    net.reinforceEdge("n2", "n3", "context_sharing", 0.8);
    net.reinforceEdge("n3", "n4", "entity_relation", 0.8);

    const activations = net.spreadActivation([{ nodeId: "n1", initialActivation: 1.0 }], {
      decayFactor: 0.7,
      activationThreshold: 0.1,
      maxHops: 3,
    });

    expect(activations.has("n1")).toBe(true);
    expect(activations.get("n1")!.activation).toBe(1.0);

    expect(activations.has("n2")).toBe(true);
    expect(activations.get("n2")!.path).toEqual(["lagos", "island"]);

    expect(activations.has("n3")).toBe(true);
    expect(activations.get("n3")!.path).toEqual(["lagos", "island", "waterproofing"]);

    expect(activations.has("n4")).toBe(true);
    expect(activations.get("n4")!.path).toEqual(["lagos", "island", "waterproofing", "membrane"]);
    expect(activations.get("n4")!.activation).toBeLessThan(activations.get("n3")!.activation);
  });
});

describe("EpisodicLongTermAssociativeMemoryEngine Unified Integration", () => {
  const sampleFacts: Fact[] = [
    {
      id: "f_mix_ratio",
      subject: "screeding",
      predicate: "mix_ratio",
      object: "1:4",
      status: "validated",
      confidence: 0.95,
      provenance: { source: "seed" },
      validatedCount: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "f_invalid_rumor",
      subject: "foundation",
      predicate: "depth",
      object: "0.2m",
      status: "uncertain", // should NOT be indexed or activated
      confidence: 0.1,
      provenance: { source: "web-research" },
      validatedCount: 0,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ];

  it("hydrates episodic history and validated long-term facts", () => {
    const engine = new EpisodicLongTermAssociativeMemoryEngine();
    const turns = [
      {
        id: "turn_1",
        conversationId: "c1",
        role: "owner" as const,
        text: "Remember that we use screeding on all first floor rooms.",
        timestamp: 1700000000000,
      },
      {
        id: "turn_2",
        conversationId: "c1",
        role: "archie" as const,
        text: "Understood, screeding noted for upper floors.",
        timestamp: 1700000060000,
      },
    ];

    engine.hydrate(turns, sampleFacts);

    const diag = engine.getDiagnostics();
    expect(diag.totalTurns).toBe(2);
    expect(diag.totalEpisodes).toBe(1);
    expect(diag.totalFactsIndexed).toBe(2);
  });

  it("recalls relevant episodes and validated facts via associative spreading", () => {
    const engine = new EpisodicLongTermAssociativeMemoryEngine();
    const turns = [
      {
        id: "turn_1",
        conversationId: "c1",
        role: "owner" as const,
        text: "For the Lekki site, we will apply floor screeding.",
        timestamp: 1700000000000,
      },
      {
        id: "turn_2",
        conversationId: "c1",
        role: "archie" as const,
        text: "Recorded screeding requirement for Lekki.",
        timestamp: 1700000060000,
      },
    ];

    engine.hydrate(turns, sampleFacts);

    const recall = engine.recall("What screeding specifications do we have for Lekki?");

    expect(recall.directTurnMatches.length).toBeGreaterThan(0);
    expect(recall.associatedEpisodes.length).toBeGreaterThan(0);
    expect(recall.associatedFacts.length).toBeGreaterThan(0);

    // Validated fact retrieved with provenance
    const mixFact = recall.associatedFacts.find((f) => f.fact.id === "f_mix_ratio");
    expect(mixFact).toBeDefined();
    expect(mixFact!.fact.object).toBe("1:4");

    // Refuted fact must NEVER appear
    const refuted = recall.associatedFacts.find((f) => f.fact.id === "f_invalid_rumor");
    expect(refuted).toBeUndefined();

    // Narrative context is populated for cognitive loops
    expect(recall.narrativeContext).toContain("screeding mix_ratio 1:4");
    expect(recall.diagnostics.activatedNodesCount).toBeGreaterThan(0);
  });

  it("refuses to store sensitive credentials in episodic memory", () => {
    const engine = new EpisodicLongTermAssociativeMemoryEngine();

    const result = engine.ingestTurn({
      role: "owner",
      text: "Here is the API key: sk-live12345678901234567890 don't lose it",
    });

    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("sensitive secrets");
    expect(engine.getDiagnostics().totalTurns).toBe(0);
  });

  it("dynamically ingests successive turns and updates the associative network", () => {
    const engine = new EpisodicLongTermAssociativeMemoryEngine();
    engine.hydrate([], sampleFacts);

    engine.ingestTurn({
      role: "owner",
      text: "The client in Epe wants granite delivered by Thursday.",
      timestamp: 1700000000000,
    });

    engine.ingestTurn({
      role: "archie",
      text: "Scheduling granite delivery to Epe site.",
      timestamp: 1700000060000,
    });

    const recall = engine.recall("When is granite going to Epe?");
    expect(recall.directTurnMatches.length).toBeGreaterThan(0);
    expect(recall.directTurnMatches[0].turn.text).toContain("Epe");
    expect(recall.associatedEntities.some((e) => e.entity === "thursday" || e.entity === "delivery")).toBe(true);
  });
});
