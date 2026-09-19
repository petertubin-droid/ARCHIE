// =========================================================
// ARCHIE UNIFIED GENERAL COGNITIVE INTELLIGENCE ENGINE — TESTS
//
// Measurable proof for every cognitive subsystem: perception,
// world model, meta-cognition, verification, tool
// intelligence, creation, security/integrity, orchestration,
// and the kernel's permanent loop end-to-end. Real code
// paths, real assertions — no simulated capabilities.
// =========================================================

import { describe, it, expect } from "vitest";
import { sha256 } from "@studio-shared/archie-ai/cognitive/sha256.ts";
import {
  redactSecrets,
  SecurityIntegrityEngine,
} from "@studio-shared/archie-ai/cognitive/security-integrity.ts";
import { PerceptionEngine } from "@studio-shared/archie-ai/cognitive/perception.ts";
import { WorldModel } from "@studio-shared/archie-ai/cognitive/world-model.ts";
import {
  MetaCognitionEngine,
  epistemicStatusOf,
  weakestStatus,
} from "@studio-shared/archie-ai/cognitive/metacognition.ts";
import { VerificationEngine } from "@studio-shared/archie-ai/cognitive/verification.ts";
import { ToolIntelligenceEngine } from "@studio-shared/archie-ai/cognitive/tool-intelligence.ts";
import {
  CreationEngine,
  makeProposal,
} from "@studio-shared/archie-ai/cognitive/creation.ts";
import { orchestrate } from "@studio-shared/archie-ai/cognitive/orchestrator.ts";
import {
  CognitiveKernel,
  COGNITIVE_ENGINE_ID,
} from "@studio-shared/archie-ai/cognitive/kernel.ts";
import { resolveArchieCapabilityEngine } from "@studio-shared/archie-ai/runtime.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";
import { LOOP_PHASES } from "@studio-shared/archie-ai/cognitive/types.ts";

// ---------------------------------------------------------
// Test doubles (explicit — only the PERSISTENCE ADAPTER is
// faked here; the engine itself is the real production code)
// ---------------------------------------------------------
class CognitiveMockDb implements SupabaseLike {
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
      select: () => {
        const data = [...rows()];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({ data: data.slice(from, to + 1), error: null }),
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
        // FIX 23 companion: audit rows key on (chain_id, seq),
        // everything else on id. (The old id-only match made
        // two id-less audit rows compare undefined===undefined
        // and silently overwrite each other.)
        const idx =
          r.id !== undefined
            ? list.findIndex((x) => x.id === r.id)
            : list.findIndex(
                (x) => x.chain_id === r.chain_id && x.seq === r.seq,
              );
        if (idx >= 0) list[idx] = r;
        else list.push(r);
        return { error: null };
      },
    };
  }
}

function fact(
  partial: Partial<Fact> & Pick<Fact, "subject" | "predicate" | "object">,
): Fact {
  return {
    id: partial.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    subject: partial.subject,
    predicate: partial.predicate,
    object: partial.object,
    qualifiers: partial.qualifiers,
    confidence: partial.confidence ?? 0.8,
    provenance: partial.provenance ?? { source: "owner-taught" },
    status: partial.status ?? "validated",
    validatedCount: partial.validatedCount ?? 1,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------
// SHA-256 — FIPS 180-4 vectors
// ---------------------------------------------------------
describe("sha256 (runtime-agnostic)", () => {
  it("passes the FIPS empty-string vector", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("passes the FIPS 'abc' vector", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("passes the multi-block 'quick brown fox' vector", () => {
    expect(sha256("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
});

// ---------------------------------------------------------
// Security & Integrity
// ---------------------------------------------------------
describe("security & integrity engine", () => {
  it("redacts real credential patterns", () => {
    const { redacted, foundCount } = redactSecrets(
      "my key is sk-abc123def456ghi789 and token=supersecret12345",
    );
    expect(foundCount).toBeGreaterThanOrEqual(1);
    expect(redacted).not.toContain("sk-abc123def456ghi789");
    expect(redacted).not.toContain("supersecret12345");
  });

  it("leaves clean text untouched", () => {
    const { redacted, foundCount } = redactSecrets(
      "the screeding ratio is 1:4 cement to sand",
    );
    expect(foundCount).toBe(0);
    expect(redacted).toBe("the screeding ratio is 1:4 cement to sand");
  });

  it("builds a tamper-evident hash chain and detects mutation", async () => {
    const engine = new SecurityIntegrityEngine();
    await engine.audit("perception", { input: "hello" });
    await engine.audit("tool-use", { tool: "arithmetic" });
    const integrity = engine.integrity();
    expect(integrity.chainValid).toBe(true);
    expect(integrity.events).toBe(2);

    // Simulated tamper: rebuild with a mutated event list.
    const fakeEvents = [
      {
        seq: 1,
        eventType: "perception" as const,
        payload: { input: "TAMPERED" },
        at: "t",
        prevHash: "0".repeat(64),
        hash: "x",
      },
    ];
    expect(engine.verifyChain(fakeEvents as never)).toBe(false);
  });

  it("redacts secrets inside audited payloads", async () => {
    const engine = new SecurityIntegrityEngine();
    const event = await engine.audit("perception", {
      text: "here is my password: hunter2supersecret",
    });
    expect(JSON.stringify(event.payload)).not.toContain("hunter2supersecret");
  });

  it("guards the permanent core-identity stores", () => {
    const engine = new SecurityIntegrityEngine();
    const blocked = engine.guardCoreIdentity("frelux_archie_core_principles");
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Owner Authority");
    const ok = engine.guardCoreIdentity("frelux_archie_native_facts");
    expect(ok.allowed).toBe(true);
  });

  it("hydrates a persisted chain across sessions", async () => {
    const db = new CognitiveMockDb();
    const first = new SecurityIntegrityEngine(db);
    await first.audit("perception", { input: "persisted event" });
    expect(db.tables.frelux_archie_audit_log.length).toBe(1);

    const second = new SecurityIntegrityEngine(db);
    const { events, chainValid } = await second.hydrate();
    expect(events).toBe(1);
    expect(chainValid).toBe(true);
    // FIX 23 (remediation batch 8): a fresh instance starts
    // its OWN chain (seq 1 under a new chain_id) — continuing
    // another isolate's chain was the cross-isolate seq
    // collision bug. Deliberate continuation is possible via
    // the explicit chainId constructor parameter.
    const event = await second.audit("learning", { note: "continued" });
    expect(event.seq).toBe(1);
    expect(db.tables.frelux_archie_audit_log.length).toBe(2);
  });
});

// ---------------------------------------------------------
// Multimodal Perception
// ---------------------------------------------------------
describe("perception engine", () => {
  const perception = new PerceptionEngine();

  it("normalizes plain text into a text percept", () => {
    const { percepts } = perception.ingest(
      "what is the screeding ratio for floors?",
    );
    expect(percepts[0].modality).toBe("text");
    expect(percepts[0].metadata.words).toBeGreaterThan(3);
  });

  it("detects code and reports its language", () => {
    const { percepts } = perception.ingest(
      "function add(a, b) { return a + b; } export default add;",
    );
    expect(percepts[0].modality).toBe("code");
    expect(percepts[0].metadata.language).toBe("javascript");
  });

  it("parses JSON into structured data", () => {
    const { percepts } = perception.ingest('{"ratio": "1:4", "bags": 12}');
    expect(percepts[0].modality).toBe("structured-data");
    expect(percepts[0].metadata.format).toBe("json");
  });

  it("parses CSV into structured data", () => {
    const { percepts } = perception.ingest(
      "material,quantity\ncement,12 bags\nsand,3 tonnes",
    );
    expect(percepts[0].modality).toBe("structured-data");
    expect(percepts[0].metadata.format).toBe("csv");
  });

  it("extracts website URLs as percepts", () => {
    const { percepts } = perception.ingest(
      "check https://example.com/spec for the ratio",
    );
    expect(percepts.some((p) => p.modality === "website")).toBe(true);
  });

  it("redacts secrets on ingest", () => {
    const { secretsRedacted } = perception.ingest(
      "api_key=abcdef123456 what is the ratio?",
    );
    expect(secretsRedacted).toBeGreaterThanOrEqual(1);
  });

  it("reports modalities honestly (never fakes)", async () => {
    const report = PerceptionEngine.supportReport();
    expect(report.supported).toContain("text");
    expect(report.supported).toContain("code");
    // Native eyes (2026-09-11): image is now SUPPORTED but
    // bounded — audio stays honestly unsupported.
    expect(report.supported).toContain("image");
    expect(
      report.unsupported.find((m) => m.modality === "image"),
    ).toBeUndefined();
    expect(
      report.unsupported.find((m) => m.modality === "audio"),
    ).toBeDefined();
    // The honest bound is stated, and ingestImage refuses
    // garbage instead of faking a percept.
    const refused = await new PerceptionEngine().ingestImage(
      new TextEncoder().encode("definitely-not-an-image"),
    );
    expect(refused.percept).toBeNull();
    expect(refused.note).toContain("refused honestly");
  });
});

// ---------------------------------------------------------
// World Model
// ---------------------------------------------------------
describe("world model", () => {
  it("relates entities and answers neighborhood queries", async () => {
    const world = new WorldModel();
    await world.relate({
      subject: "archie",
      relation: "built-for",
      object: "frelux",
      subjectKind: "System",
      objectKind: "Project",
      confidence: 0.9,
      provenance: "test",
    });
    await world.relate({
      subject: "frelux",
      relation: "uses",
      object: "supabase",
      subjectKind: "Project",
      objectKind: "Software",
      confidence: 0.9,
      provenance: "test",
    });
    expect(world.entitiesCount()).toBe(3);
    expect(world.about("archie").length).toBe(1);
    expect(world.about("frelux").length).toBe(2);
  });

  it("traverses multi-hop relations (depth 2)", async () => {
    const world = new WorldModel();
    await world.relate({
      subject: "archie",
      relation: "built-for",
      object: "frelux",
      confidence: 0.9,
      provenance: "t",
    });
    await world.relate({
      subject: "frelux",
      relation: "uses",
      object: "supabase",
      confidence: 0.9,
      provenance: "t",
    });
    const twoHops = world.query({ about: "archie", depth: 2 });
    expect(twoHops.length).toBe(2);
    const oneHop = world.query({ about: "archie", depth: 1 });
    expect(oneHop.length).toBe(1);
  });

  it("is idempotent and strengthens confidence on re-observation", async () => {
    const world = new WorldModel();
    const first = await world.relate({
      subject: "a",
      relation: "r",
      object: "b",
      confidence: 0.5,
      provenance: "t",
    });
    const firstConfidence = first.confidence;
    const second = await world.relate({
      subject: "a",
      relation: "r",
      object: "b",
      confidence: 0.5,
      provenance: "t",
    });
    expect(second.id).toBe(first.id);
    expect(second.confidence).toBeGreaterThan(firstConfidence);
  });

  it("accepts unbounded entity kinds (no domain ceiling)", async () => {
    const world = new WorldModel();
    await world.relate({
      subject: "lagos",
      relation: "located-in",
      object: "nigeria",
      subjectKind: "Environment",
      objectKind: "Concept",
      confidence: 0.9,
      provenance: "t",
    });
    await world.relate({
      subject: "quantum-foam",
      relation: "studied-by",
      object: "physics",
      subjectKind: "ExoticParticleField",
      confidence: 0.4,
      provenance: "t",
    });
    expect(world.getEntity("quantum-foam")?.kind).toBe("ExoticParticleField");
  });

  it("persists relations durably and rehydrates across sessions", async () => {
    const db = new CognitiveMockDb();
    const first = new WorldModel(db);
    await first.relate({
      subject: "owner",
      relation: "directs",
      object: "archie",
      subjectKind: "Person",
      objectKind: "System",
      confidence: 0.95,
      provenance: "test",
    });
    expect(db.tables.frelux_archie_world_model.length).toBe(1);

    const second = new WorldModel(db);
    const hydrated = await second.hydrate();
    expect(hydrated).toBe(1);
    expect(second.about("owner").length).toBe(1);
  });
});

// ---------------------------------------------------------
// Meta-Cognition
// ---------------------------------------------------------
describe("meta-cognition engine", () => {
  it("classifies the full epistemic taxonomy from real fact state", () => {
    const verified = fact({
      subject: "screeding",
      predicate: "ratio",
      object: "1:4",
      confidence: 0.9,
      validatedCount: 3,
      provenance: { source: "owner-taught" },
    });
    const inferred = fact({
      subject: "x",
      predicate: "y",
      object: "z",
      provenance: { source: "inferred" },
    });
    const assumed = fact({
      subject: "x",
      predicate: "y",
      object: "w",
      status: "candidate",
      confidence: 0.4,
    });
    expect(epistemicStatusOf(verified)).toBe("VERIFIED");
    expect(epistemicStatusOf(inferred)).toBe("INFERRED");
    expect(epistemicStatusOf(assumed)).toBe("ASSUMED");
  });

  it("UNKNOWN is the honest floor: weakestStatus with no facts", () => {
    expect(weakestStatus([])).toBe("UNKNOWN");
  });

  it("produces a full self-assessment: knows, doesn't know, evidence, could be wrong, must verify", () => {
    const meta = new MetaCognitionEngine();
    const assessment = meta.assess({
      task: "what is the screeding ratio?",
      matchedFacts: [
        fact({
          subject: "screeding",
          predicate: "ratio",
          object: "1:4",
          confidence: 0.45,
          status: "candidate",
        }),
      ],
      unmatchedAspects: ["curing time"],
      deterministicAvailable: false,
      verificationAvailable: true,
    });
    expect(assessment.whatIKnow.length).toBe(1);
    expect(assessment.whatIDontKnow).toContain("curing time");
    expect(assessment.couldBeWrong.length).toBeGreaterThan(0);
    expect(assessment.mustVerify.length).toBeGreaterThan(0);
    expect(assessment.supportingEvidence[0].factId).toBeDefined();
    expect(assessment.mostReliableApproach.approach).toBeDefined();
  });

  it("ranks deterministic computation as the most reliable approach when available", () => {
    const meta = new MetaCognitionEngine();
    const assessment = meta.assess({
      task: "compute 25 * 48",
      matchedFacts: [],
      unmatchedAspects: [],
      deterministicAvailable: true,
      verificationAvailable: true,
    });
    expect(assessment.mostReliableApproach.approach).toBe(
      "deterministic in-engine computation",
    );
  });

  it("declares knowledge gaps honestly (UNKNOWN, never fabricated)", () => {
    const meta = new MetaCognitionEngine();
    const report = meta.gapReport("quantum chromodynamics basics", [], 10);
    expect(report).toContain("honest UNKNOWN");
    expect(report).toContain("not fabricate");
  });
});

// ---------------------------------------------------------
// Verification
// ---------------------------------------------------------
describe("verification engine", () => {
  const verifier = new VerificationEngine();

  it("PASSes a deterministic computation with re-execution", () => {
    const verdict = verifier.verify({
      target: "math answer",
      output: "25 * 48 = 1200",
      citedFacts: [],
      requiredAspects: [],
      correctnessRecheck: () => ({
        passed: true,
        detail: "re-executed: 1200",
      }),
    });
    expect(verdict.verdict).toBe("PASS");
    expect(verdict.checks.every((c) => c.passed)).toBe(true);
  });

  it("FAILs on contradictions between cited facts", () => {
    const verdict = verifier.verify({
      target: "knowledge answer",
      output: "the ratio is 1:4",
      citedFacts: [
        fact({ subject: "screeding", predicate: "ratio", object: "1:4" }),
        fact({ subject: "screeding", predicate: "ratio", object: "1:6" }),
      ],
      requiredAspects: [],
    });
    expect(verdict.verdict).toBe("FAIL");
    expect(verdict.checks.find((c) => c.check === "consistency")!.passed).toBe(
      false,
    );
  });

  it("flags missing required aspects (completeness)", () => {
    const verdict = verifier.verify({
      target: "multi-part answer",
      output: "the answer covers cement only",
      citedFacts: [],
      requiredAspects: ["sand", "water"],
    });
    expect(verdict.checks.find((c) => c.check === "completeness")!.passed).toBe(
      false,
    );
  });

  it("FAILs on leaked secrets in output (security)", () => {
    const verdict = verifier.verify({
      target: "response",
      output: "use api_key=supersecret123456 to connect",
      citedFacts: [],
      requiredAspects: [],
    });
    expect(verdict.checks.find((c) => c.check === "security")!.passed).toBe(
      false,
    );
  });

  it("flags dangerous patterns in generated code (security)", () => {
    const verdict = verifier.verify({
      target: "code artifact",
      output: "const run = (cmd) => eval(cmd);",
      citedFacts: [],
      requiredAspects: [],
      containsCode: true,
    });
    expect(verdict.checks.find((c) => c.check === "security")!.passed).toBe(
      false,
    );
  });

  it("UNVERIFIED when there is nothing to verify against — never a rubber-stamped PASS", () => {
    const verdict = verifier.verify({
      target: "free-form opinion",
      output: "I think that is a good plan",
      citedFacts: [],
      requiredAspects: [],
    });
    expect(verdict.verdict).toBe("UNVERIFIED");
  });

  it("surfaces ASSUMED-status knowledge used in an answer", () => {
    const verdict = verifier.verify({
      target: "answer",
      output: "the ratio is probably 1:5",
      citedFacts: [
        fact({
          subject: "r",
          predicate: "guess",
          object: "1:5",
          status: "candidate",
          confidence: 0.4,
        }),
      ],
      requiredAspects: [],
    });
    expect(
      verdict.checks.find((c) => c.check === "assumptions")!.detail,
    ).toContain("ASSUMED");
    expect(verdict.checks.find((c) => c.check === "uncertainty")!.passed).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------
// Tool Intelligence
// ---------------------------------------------------------
describe("tool intelligence engine", () => {
  const tools = new ToolIntelligenceEngine();

  it("selects the arithmetic tool for math tasks", () => {
    const selection = tools.select("calculate 25 * 48 and convert to bags", {});
    expect(selection.selected.some((t) => t.name === "arithmetic")).toBe(true);
    expect(selection.authority).toBe("autonomous-safe");
  });

  it("classifies consequential operations as owner-gated — learning never unlocks them", () => {
    const selection = tools.select(
      "please deploy the database migration to production",
      {},
    );
    expect(selection.authority).toBe("owner-gated");
    expect(selection.gatedOperations.length).toBeGreaterThan(0);

    const auth = tools.authorize("deploy to production", "consequential");
    expect(auth.allowed).toBe(false);
    expect(auth.reason).toContain("OWNER APPROVAL");
  });

  it("allows read-only deterministic tools autonomously", () => {
    const auth = tools.authorize("arithmetic evaluation", "read-only");
    expect(auth.allowed).toBe(true);
    expect(auth.level).toBe("autonomous-safe");
  });
});

// ---------------------------------------------------------
// Creation Engine
// ---------------------------------------------------------
describe("creation engine", () => {
  const creation = new CreationEngine();

  it("generates a real unit-test scaffold from real source", () => {
    const result = creation.create({
      kind: "unit-test-scaffold",
      label: "scaffold",
      path: "calc.ts",
      source:
        "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    });
    expect(result.ok).toBe(true);
    expect(result.artifact).toContain("add");
    expect(result.isCode).toBe(true);
  });

  it("composes documents from verified knowledge only", () => {
    const result = creation.create({
      kind: "document",
      label: "Screeding Guide",
      verifiedLines: ["screeding ratio is 1:4 cement to sand"],
    });
    expect(result.ok).toBe(true);
    expect(result.artifact).toContain("1:4");
  });

  it("refuses to create from nothing (honest refusal, no fake artifact)", () => {
    const result = creation.create({
      kind: "document",
      label: "Empty",
      verifiedLines: [],
    });
    expect(result.ok).toBe(false);
    expect(result.note).toContain("will not write a document from nothing");
  });

  it("reports open-ended generative creation as NOT implemented — never fakes it", () => {
    const capability = CreationEngine.capability();
    expect(capability.implemented.length).toBe(4);
    expect(capability.notImplemented.join(" ")).toContain(
      "open-ended generative code authoring",
    );
  });

  it("improvement proposals are proposals only — never auto-applied", () => {
    const proposal = makeProposal(
      "weak retrieval",
      "add domain corpus",
      "better answers",
    );
    expect(proposal.status).toBe("proposed");
  });
});

// ---------------------------------------------------------
// Cognitive Orchestration
// ---------------------------------------------------------
describe("cognitive orchestrator", () => {
  it("routes math through strict verification with the arithmetic tool", () => {
    const route = orchestrate({
      intent: "math_question",
      task: "what is 25 * 48",
      isComplex: false,
    });
    expect(route.verificationLevel).toBe("strict");
    expect(route.tools).toContain("arithmetic");
    expect(route.reasoningModes).toContain("mathematical");
    expect(route.phases).toContain("VERIFY");
    expect(route.phases).toContain("CREATE");
  });

  it("routes knowledge queries through world-model + verification", () => {
    const route = orchestrate({
      intent: "knowledge_query",
      task: "what is the screeding ratio",
      isComplex: false,
    });
    expect(route.phases).toContain("MODEL");
    expect(route.phases).toContain("VERIFY");
    expect(route.retrievalScope.worldModel).toBe(true);
  });

  it("complex tasks get planning and causal/comparative reasoning", () => {
    const route = orchestrate({
      intent: "howto_guidance",
      task: "plan a full floor screeding job with materials, labor and curing schedule in detail",
      isComplex: true,
    });
    expect(route.phases).toContain("PLAN");
    expect(route.reasoningModes).toContain("causal");
  });

  it("consequential markers force owner-gated authority", () => {
    const route = orchestrate({
      intent: "task_planning",
      task: "deploy the migration to production",
      isComplex: true,
    });
    expect(route.authority).toBe("owner-gated");
    expect(route.rationale).toContain("owner-gated");
  });

  it("IMPROVE is a standing phase in every route (permanent loop)", () => {
    for (const intent of [
      "greeting",
      "math_question",
      "knowledge_query",
      "teaching",
    ]) {
      const route = orchestrate({ intent, task: "anything", isComplex: false });
      expect(route.phases).toContain("IMPROVE");
    }
  });

  it("route phases respect the permanent loop order", () => {
    const route = orchestrate({
      intent: "howto_guidance",
      task: "full job",
      isComplex: true,
    });
    const positions = route.phases.map((p) => LOOP_PHASES.indexOf(p));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});

// ---------------------------------------------------------
// The Kernel — one unified intelligence, end-to-end
// ---------------------------------------------------------
describe("cognitive kernel (end-to-end loop)", () => {
  it("is operational with an honest capability set", () => {
    const kernel = new CognitiveKernel();
    expect(kernel.id).toBe(COGNITIVE_ENGINE_ID);
    expect(kernel.isOperational()).toBe(true);
    expect(kernel.capabilities()).toContain("inference");
    expect(kernel.capabilities()).toContain("evaluation");
  });

  it("runs the full loop for a greeting: trace ordered by the permanent phases", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("hello archie");
    expect(result.responseText.length).toBeGreaterThan(0);
    expect(
      result.trace.phases.some(
        (p) => p.phase === "PERCEIVE" && p.status === "executed",
      ),
    ).toBe(true);
    expect(result.trace.phases.some((p) => p.phase === "IMPROVE")).toBe(true);
    const positions = result.trace.phases
      .map((p) => LOOP_PHASES.indexOf(p.phase))
      .filter((i) => i >= 0);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("answers knowledge questions with an honest epistemic status and verification", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    const result = await kernel.cycle("what is the definition of screeding?");
    expect(result.citedFactIds.length).toBeGreaterThan(0);
    expect(result.epistemic).toMatch(/KNOWN|VERIFIED/);
    expect(result.responseText).toContain("[Epistemic status:");
    expect(result.verification).not.toBeNull();
  });

  it("computes math deterministically with strict verification PASS", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    const result = await kernel.cycle("what is 25 * 48?");
    expect(result.responseText).toContain("1200");
    expect(result.trace.route.verificationLevel).toBe("strict");
    expect(result.verification?.verdict).toBe("PASS");
    expect(result.epistemic).toBe("VERIFIED");
  });

  it("learns when taught, updates the world model, and persists the trace", async () => {
    const db = new CognitiveMockDb();
    const kernel = new CognitiveKernel(db);
    await kernel.boot();
    const result = await kernel.cycle(
      "remember: floor screeding ratio is 1 part cement to 4 parts sand",
    );
    expect(result.responseText.toLowerCase()).toContain("retained");
    expect(result.worldModelUpdates).toBeGreaterThan(0);
    expect(db.tables.frelux_archie_cognitive_traces.length).toBeGreaterThan(0);
    expect(db.tables.frelux_archie_world_model.length).toBeGreaterThan(0);
    expect(db.tables.frelux_archie_audit_log.length).toBeGreaterThan(0);
  });

  it("injects world-model observations as read-bearing context, never as knowledge (audit fix I-1)", async () => {
    const db = new CognitiveMockDb();
    const kernel = new CognitiveKernel(db);
    await kernel.boot();
    // Teach first — the MODEL phase records a real relation.
    await kernel.cycle(
      "remember: floor screeding ratio is 1 part cement to 4 parts sand",
    );
    const factsAfterTeach = db.tables.frelux_archie_native_facts.length;

    // A later question mentioning the same entity must SEE the
    // world model's current view — carried as context, not as
    // validated facts.
    const result = await kernel.cycle("what do you know about screeding?");
    const retrieve = result.trace.phases.find((p) => p.phase === "RETRIEVE");
    expect(String(retrieve?.summary ?? "")).toMatch(
      /world observation\(s\) injected as context/,
    );
    // Observations never leak into the fact store — retrieval
    // context only, zero silent promotion to knowledge.
    expect(db.tables.frelux_archie_native_facts.length).toBe(factsAfterTeach);
  });

  it("keeps consequential operations owner-gated: PROPOSE only, nothing executed", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    const result = await kernel.cycle(
      "deploy the database migration to production",
    );
    expect(result.trace.route.authority).toBe("owner-gated");
    expect(result.responseText).toContain("[Owner Authority]");
    expect(result.responseText).toContain("PROPOSE");
  });

  it("declares UNKNOWN honestly and generates owner-gated improvement proposals after repeated gaps", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    let sawProposal = false;
    for (const q of [
      "what is the zyzzyx quotient of blorptastic quuxium?",
      "explain the wobble theory of splungiform dynamics?",
      "how do you recalibrate a frumious bandersnatch regulator?",
    ]) {
      const result = await kernel.cycle(q);
      expect(result.citedFactIds.length).toBe(0);
      if (result.proposals.length > 0) sawProposal = true;
    }
    expect(sawProposal).toBe(true);
  });

  it("reports honest diagnostics: 16 systems, audit chain valid, real counts", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    await kernel.cycle("hello archie, report your status");
    const d = kernel.diagnostics() as {
      engineId: string;
      systems: { maturity: string }[];
      security: { chainValid: boolean };
      worldModel: { entities: number };
      perception: { ingested: number };
      substrate: string;
    };
    expect(d.engineId).toBe(COGNITIVE_ENGINE_ID);
    expect(d.systems.length).toBe(16);
    expect(d.systems.every((s) => s.maturity === "OPERATIONAL")).toBe(true);
    expect(d.security.chainValid).toBe(true);
    expect(d.worldModel.entities).toBeGreaterThan(0);
    expect(d.perception.ingested).toBeGreaterThan(0);
    expect(d.substrate).toContain("zero external AI");
  });

  it("resolves as ARCHIE's highest-level engine in the provider-agnostic registry", () => {
    const { runtime, engine } = resolveArchieCapabilityEngine({});
    expect(runtime!.id).toBe(COGNITIVE_ENGINE_ID);
    expect(runtime!.kind).toBe("archie-native");
    expect(engine.path).toBe("archie-native");
    expect(engine.note).toContain(
      "Unified General Cognitive Intelligence Engine",
    );
  });

  it("kernel knowledge stays consistent under re-derivation (substrate stability)", async () => {
    const kernel = new CognitiveKernel();
    await kernel.boot();
    const store = kernel.worldModel();
    expect(store).toBeDefined();
    const first = await kernel.cycle("what is the definition of screeding?");
    const second = await kernel.cycle("what is the definition of screeding?");
    expect(first.citedFactIds).toEqual(second.citedFactIds);
    // Same grounded knowledge; confidence may STRENGTHEN on
    // re-derivation (reinforcement), but the claim is stable.
    expect(second.responseText).toContain("a thin layer");
    expect(second.responseText).toContain("screeding");
  });
});
