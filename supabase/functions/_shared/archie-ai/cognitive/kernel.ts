// =========================================================
// ARCHIE UNIFIED GENERAL COGNITIVE INTELLIGENCE ENGINE — KERNEL
// supabase/functions/_shared/archie-ai/cognitive/kernel.ts
//
// THE highest-level intelligence architecture of ARCHIE
// (owner directive, 2026-09-10). ONE unified ARCHIE
// intelligence — never multiple sub-agents. The kernel owns
// all fifteen intelligence systems as internal subsystems
// and runs the permanent cognitive loop:
//
//   PERCEIVE → UNDERSTAND → RETRIEVE → REASON → MODEL →
//   PLAN → CREATE → VERIFY → ACT → OBSERVE → EVALUATE →
//   LEARN → REMEMBER → IMPROVE → REPEAT
//
// Engine independence: the substrate (native-engine/*) is
// ARCHIE's OWN runtime — zero external AI providers. Every
// phase does real work; skipped phases are recorded
// honestly. Learning NEVER grants execution authority:
// consequential operations end at PROPOSE.
// =========================================================

import type {
  ArchieCapability,
  ArchieInferencePart,
  ArchieInferenceRequest,
  ArchieInferenceResult,
  ArchieInferenceTurn,
  ArchieRuntime,
} from "../runtime.ts";
import {
  getNativeEngine,
  configureNativeEnginePersistence,
  type ConverseResult,
} from "../native-engine/engine.ts";
import { configureNativeEngineWorldTimeline } from "../native-engine/engine.ts";
import type { SupabaseLike } from "../native-engine/persistence.ts";
import type { Fact } from "../native-engine/types.ts";
import { understand } from "../native-engine/nlu.ts";
import {
  classifyLifeSafety,
  lifeSafetyStopMessage,
} from "../security/life-safety.ts";
import {
  runReasoningLoop,
  type ReasoningLoopReport,
} from "../native-engine/reasoning-loop.ts";
import { PerceptionEngine } from "./perception.ts";
import {
  MetaCognitionEngine,
  epistemicStatusOf,
  weakestStatus,
} from "./metacognition.ts";
import { VerificationEngine } from "./verification.ts";
import { ToolIntelligenceEngine } from "./tool-intelligence.ts";
import { CreationEngine, makeProposal } from "./creation.ts";
import { SecurityIntegrityEngine } from "./security-integrity.ts";
import { orchestrate } from "./orchestrator.ts";
import { WorldModel } from "./world-model.ts";
import { CognitivePersistence } from "./persistence.ts";
import { LOOP_PHASES } from "./types.ts";
import type {
  CognitiveCycleResult,
  CognitiveTrace,
  EpistemicStatus,
  ImprovementProposal,
  LoopPhase,
  MetaAssessment,
  PhaseRecord,
  VerificationVerdict,
} from "./types.ts";

export const COGNITIVE_ENGINE_ID = "archie-cognitive-engine";

let configuredDb: SupabaseLike | undefined;
let kernelSingleton: CognitiveKernel | undefined;

/** Edge functions call this at boot with the service client.
 *  Passing null enables the REAL personalization privacy
 *  control (Memory & Data Rights Policy): the kernel and its
 *  substrate run in-memory only for that request — no
 *  persistent memory loads, no learning writes. */
export function configureCognitiveEnginePersistence(
  db: SupabaseLike | null,
): void {
  configuredDb = db ?? undefined;
  kernelSingleton = undefined;
  configureNativeEnginePersistence(db); // substrate shares persistence
}

// ---------------------------------------------------------
// ANATOMY INTEGRATION — every loop phase runs through a real
// anatomical subsystem (the same keys seeded in
// archie_subsystems by the cognitive-anatomy migration).
// The anatomy is the architecture: organs are live modules,
// not documentation.
// ---------------------------------------------------------
export const ORGAN_PHASE_BINDINGS: Record<string, string[]> = {
  PERCEIVE: ["eyes"],
  UNDERSTAND: ["head"],
  RETRIEVE: ["brain"],
  REASON: ["heart"],
  PLAN: ["head"],
  MODEL: ["brain"],
  CREATE: ["hands"],
  VERIFY: ["liver-kidneys"],
  ACT: ["balance", "mouth"],
  OBSERVE: ["nervous"],
  EVALUATE: ["pain"],
  LEARN: ["digestive"],
  REMEMBER: ["brain"],
  IMPROVE: ["stem-cells"],
  REPEAT: ["healing", "sleep"],
};

export function getCognitiveEngine(): CognitiveKernel {
  if (!kernelSingleton) {
    kernelSingleton = new CognitiveKernel(configuredDb);
  }
  return kernelSingleton;
}

/** Honest capability manifest of the unified engine. */
function cognitiveCapabilityManifest() {
  return [
    {
      id: "multimodal-perception",
      maturity: "OPERATIONAL",
      description:
        "text, code, documents, structured data, websites, system info; image/audio reported NOT_IMPLEMENTED, never faked",
    },
    {
      id: "knowledge-engine",
      maturity: "OPERATIONAL",
      description:
        "acquire, organize, source, version, confidence-score, retrieve — unbounded domains",
    },
    {
      id: "persistent-memory",
      maturity: "OPERATIONAL",
      description:
        "working, conversational, long-term memory with provenance and consistency protection",
    },
    {
      id: "advanced-reasoning",
      maturity: "OPERATIONAL",
      description:
        "logical, analytical, mathematical, comparative, constraint reasoning; causal/probabilistic developing",
    },
    {
      id: "world-model",
      maturity: "OPERATIONAL",
      description:
        "entity-relation graph of people, systems, projects, events, outcomes with confidence; versioned temporal axis with explicit state transitions (change-over-time questions answer from recorded versions, never guesses)",
    },
    {
      id: "planning-engine",
      maturity: "OPERATIONAL",
      description:
        "objectives → structured plans with dependencies, costs and gap reports",
    },
    {
      id: "creation-engine",
      maturity: "OPERATIONAL",
      description:
        "unit-test scaffolds, structured documents, exact calculations, plans; open-ended generation NOT_IMPLEMENTED",
    },
    {
      id: "coding-intelligence",
      maturity: "OPERATIONAL",
      description:
        "understand, inspect, analyze, test-scaffold code; authoring owner-gated",
    },
    {
      id: "tool-intelligence",
      maturity: "OPERATIONAL",
      description:
        "capability-matched tool selection with honest risk classification",
    },
    {
      id: "verification-engine",
      maturity: "OPERATIONAL",
      description:
        "correctness, consistency, completeness, security, source-quality, assumptions, uncertainty",
    },
    {
      id: "meta-cognition",
      maturity: "OPERATIONAL",
      description:
        "knows/doesn't-know/evidence/could-be-wrong/must-verify/most-reliable self-assessment",
    },
    {
      id: "learning-engine",
      maturity: "OPERATIONAL",
      description:
        "outcomes, corrections, reinforcement with credit assignment",
    },
    {
      id: "self-improvement",
      maturity: "OPERATIONAL",
      description:
        "weakness detection → owner-gated improvement proposals; never auto-applied",
    },
    {
      id: "security-integrity",
      maturity: "OPERATIONAL",
      description:
        "hash-chained audit log, secret redaction, core-identity guard",
    },
    {
      id: "cognitive-orchestration",
      maturity: "OPERATIONAL",
      description:
        "dynamic per-task routing of phases, reasoning, tools, verification, authority",
    },
    {
      id: "task-completion",
      maturity: "OPERATIONAL",
      description:
        "supervised multi-step task execution: sentence-driven decomposition into clauses, one full gated cognitive cycle per step with formal verification and a bounded retry, deterministic ACHIEVED/PARTIAL/NOT_ACHIEVED completion verdict over recorded evidence — never fabricated progress",
    },
  ] as const;
}

export class CognitiveKernel implements ArchieRuntime {
  readonly id = COGNITIVE_ENGINE_ID;
  readonly kind = "archie-native" as const;
  readonly label =
    "ARCHIE Unified General Cognitive Intelligence Engine — one unified intelligence, 15 systems, owner-governed";

  private substrate: ReturnType<typeof getNativeEngine>;
  private perception = new PerceptionEngine();
  private metacognition = new MetaCognitionEngine();
  private verifier = new VerificationEngine();
  private toolIntelligence = new ToolIntelligenceEngine();
  private creation = new CreationEngine();
  private security: SecurityIntegrityEngine;
  private world: WorldModel;
  private tracePersistence: CognitivePersistence;
  private bootedAt = Date.now();
  private booted = false;
  private cycles = 0;
  private unknownTopicHits = 0;
  private verificationFails = 0;

  constructor(db?: SupabaseLike) {
    // WORLD FIRST (audit HIGH-1 fix, 2026-09-13): the kernel
    // owns the WorldModel and exposes it to the substrate
    // engine through the world-timeline port — the engine
    // records owner state-change claims and answers
    // change-over-time questions from real recorded
    // transitions. The engine never owns the model; the
    // kernel never loses the writes.
    this.world = new WorldModel(db);
    // Wire the port BEFORE the substrate singleton resolves.
    configureNativeEngineWorldTimeline({
      transitionsFor: (subject) =>
        this.world.transitions(subject).map((t) => ({
          subject: t.subject,
          relation: t.relation,
          fromValue: t.fromValue,
          toValue: t.toValue,
          fromObservedAt: t.fromObservedAt,
          toObservedAt: t.toObservedAt,
          confidence: t.confidence,
        })),
      recordState: (subject, state, observedAt, provenance) => {
        void this.world
          .relate({
            subject,
            relation: "state",
            object: state,
            confidence: 0.8,
            provenance,
            observedAt,
          })
          .catch(() => {
            // persistence failure does not corrupt the run;
            // the in-memory model still holds the observation
          });
      },
    });
    this.substrate = getNativeEngine();
    this.security = new SecurityIntegrityEngine(db);
    this.tracePersistence = new CognitivePersistence(db);
  }

  async boot(): Promise<{
    auditEvents: number;
    chainValid: boolean;
    worldRelations: number;
  }> {
    if (this.booted) {
      return {
        auditEvents: 0,
        chainValid: true,
        worldRelations: this.world.relationsCount(),
      };
    }
    this.booted = true;
    await this.substrate.boot();
    const audit = await this.security.hydrate();
    const worldRelations = await this.world.hydrate();
    await this.security.audit("authority-check", {
      event: "kernel-boot",
      note: "unified cognitive engine initialized; audit chain loaded",
    });
    if (!audit.chainValid) {
      // TAMPER RESPONSE (audit fix K-1): the compromise is
      // written into the FRESH chain too, so the new chain
      // itself records why it started from genesis.
      await this.security.audit("authority-check", {
        event: "audit-chain-compromised",
        note: "persisted audit chain failed verification on boot — quarantined for diagnostics; owner security event recorded; new chain started from genesis",
      });
    }
    return {
      auditEvents: audit.events,
      chainValid: audit.chainValid,
      worldRelations,
    };
  }

  /** READ-BEARING WORLD MODEL (audit fix I-1): extract salient
   *  terms from the input, query the world model's current
   *  view, and compose an honestly-framed context block. The
   *  block rides the system-instruction channel — a retrieval
   *  source, never persisted as knowledge. Returns an empty
   *  block when the model holds nothing relevant (no noise). */
  private worldContextFor(input: string): { block: string; used: number } {
    const stops = new Set([
      "what",
      "when",
      "where",
      "which",
      "who",
      "tell",
      "give",
      "show",
      "please",
      "about",
      "with",
      "from",
      "this",
      "that",
      "then",
      "also",
      "estimate",
      "calculate",
      "compare",
      "plan",
      "explain",
      "describe",
      "status",
      "price",
      "convert",
      "check",
      "remember",
      "list",
      "does",
      "your",
      "have",
      "will",
      "would",
      "could",
      "should",
      "there",
    ]);
    const terms = Array.from(
      new Set(
        input
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stops.has(w)),
      ),
    ).slice(0, 5);
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const t of terms) {
      for (const rel of this.world.query({ about: t, depth: 1 })) {
        const key = `${rel.subject}|${rel.relation}|${rel.object}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(
          `- ${rel.subject} —[${rel.relation}]→ ${rel.object} (observed ` +
            `${rel.observedAt ? rel.observedAt.slice(0, 10) : "unknown date"}, ` +
            `confidence ${(rel.confidence ?? 0).toFixed(2)})`,
        );
        if (lines.length >= 8) break;
      }
      if (lines.length >= 8) break;
    }
    if (lines.length === 0) return { block: "", used: 0 };
    const block =
      "\nWORLD-MODEL CONTEXT — ARCHIE's own current-view observations, " +
      "retrieved because the request mentions related entities. These are " +
      "OBSERVATIONS, not validated knowledge: never present them as " +
      "established facts, and state their provenance when used.\n" +
      lines.join("\n");
    return { block, used: lines.length };
  }

  isOperational(): boolean {
    return true; // genuinely implemented — see capabilities()
  }

  capabilities(): ArchieCapability[] {
    return [
      "inference",
      "tokenization",
      "context-handling",
      "retrieval",
      "memory",
      "tool-calling",
      "structured-output",
      "evaluation",
      "monitoring",
    ];
  }

  /** Declare the caller's tool surface for DIRECT cycle()
   * callers (plan P1 seam parity, 2026-09-16): archie-chat's
   * owner path drives cycle() directly, which bypasses
   * generate()'s noteDeclaredTools — without this the
   * substrate's requestToolNames stays empty and every
   * declared tool (frelux_status, sentry_diagnostics,
   * market_intelligence, ...) is a dead registration on that
   * path. Same C-1/fix-33 session-scoping as generate(). */
  declareTools(names: string[], conversationId?: string): void {
    this.substrate.noteDeclaredTools(names, conversationId);
  }

  async generate(req: ArchieInferenceRequest): Promise<ArchieInferenceResult> {
    const lastOwner = [...req.turns]
      .reverse()
      .find((t: ArchieInferenceTurn) => t.role === "owner");
    // Tool-result resume (plan P1): the caller executed the
    // tool and fed the REAL output back. The cognitive loop
    // already ran for the pending turn — the substrate relays
    // the real output verbatim, and the kernel stamps its
    // engine label honestly.
    const trailingToolResult = lastOwner?.parts.find(
      (p: ArchieInferencePart) => p.toolResult,
    )?.toolResult;
    if (trailingToolResult) {
      const resumed = await this.substrate.generate(req);
      return {
        ...resumed,
        engine: {
          path: "archie-native",
          note: "Tool-result resume via the Unified General Cognitive Intelligence Engine — real tool output relayed verbatim, no external AI provider involved.",
        },
      };
    }
    // Hand the caller's declared tool surface to the
    // substrate (plan P1): the kernel calls converse()
    // directly, so the substrate's requestToolNames must be
    // set here — otherwise toolCalls would never be emitted
    // through the kernel path (the exact dead-tool seam this
    // phase fixes).
    // C-1: the tool surface rides the REQUEST's session —
    // concurrent conversations never stomp each other.
    const conversationId =
      req.conversationId ?? (req as { conversationId?: string }).conversationId;
    // Fix 33: the tool surface rides the REQUEST's session
    // directly — no mutation of the substrate's isolate-wide
    // legacy pointer (which bled concurrent no-id requests
    // into the last id-bearing conversation's session).
    this.substrate.noteDeclaredTools(
      req.tools.map((t) => t.name),
      conversationId,
    );
    const text = lastOwner
      ? lastOwner.parts
          .map((p: ArchieInferencePart) => p.text ?? "")
          .join(" ")
          .trim()
      : "";
    const result = await this.cycle(text, req.turns, req.systemInstruction, {
      conversationId,
    });
    const parts: ArchieInferencePart[] = [{ text: result.responseText }];
    if (result.toolCall) {
      // Relay the substrate's toolCall to the caller's tool
      // loop (plan P1, audit C1).
      parts.push({
        toolCall: {
          name: result.toolCall.name,
          args: result.toolCall.args,
        },
      });
    }
    return {
      parts,
      engine: {
        path: "archie-native",
        note: "Generated by ARCHIE's Unified General Cognitive Intelligence Engine — one unified native intelligence, no external AI provider involved.",
      },
      finishReason: result.toolCall ? "TOOL_CALL" : "COMPLETE",
    };
  }

  /** One complete traversal of the permanent cognitive loop.
   *  The optional systemInstruction is caller-provided
   *  operating context (persona, domain scope, injected
   *  knowledge base) — consulted as a retrieval source by the
   *  substrate, never persisted as knowledge. */
  async cycle(
    input: string,
    history?: ArchieInferenceTurn[],
    systemInstruction?: string,
    /** Request scoping (audit fix C-1): conversation id for
     *  session-isolated memory + episodic stamping.
     *  ownerAuthorized (gap A-1): true ONLY on the owner's own
     *  chat turns — the chat front door sets it; agent-worker
     *  tasks leave it unset. It gates the owner-gated local
     *  generative model at the engine's honest-unknown path. */
    opts?: {
      conversationId?: string;
      ownerAuthorized?: boolean;
      /** Honest budget seam (gap 1, 2026-09-16) — pin the
       *  reasoning-loop budgets for verification; unset =
       *  production defaults (24 steps / 8 tool hops). */
      loopBudget?: { maxSteps?: number; maxToolHops?: number };
      /** Gap 3 (2026-09-16): live phase + reasoning-step
       *  observer — fired the moment each happens, for SSE
       *  progress streaming. Null on the classic path. */
      onEvent?: (event: Record<string, unknown>) => void;
    },
  ): Promise<CognitiveCycleResult> {
    await this.boot();
    this.cycles += 1;
    const cycleId = `cycle-${Date.now().toString(36)}-${this.cycles}`;
    const phases: PhaseRecord[] = [];

    // P9 trace honesty: an executed phase records WHAT IT
    // PRODUCED (describe), not a ceremonial "completed".
    // Gap 3: the live observer — same record pushed to the
    // trace AND emitted the moment the phase lands (SSE).
    const onEvent = opts?.onEvent;
    const timed = async <T>(
      phase: LoopPhase,
      routePhases: Set<LoopPhase>,
      work: () => Promise<T> | T,
      skipNote: string,
      describe?: (value: T) => string,
    ): Promise<T | null> => {
      const started = Date.now();
      if (!routePhases.has(phase)) {
        phases.push({
          phase,
          status: "skipped",
          summary: skipNote,
          durationMs: 0,
        });
        return null;
      }
      const value = await work();
      phases.push({
        phase,
        status: "executed",
        summary: describe ? describe(value) : "completed (measured)",
        durationMs: Date.now() - started,
        organs: ORGAN_PHASE_BINDINGS[phase] ?? [],
      });
      onEvent?.({
        type: "phase",
        phase,
        status: "executed",
        durationMs: Date.now() - started,
      });
      return value;
    };

    // ── UNDERSTAND (route first, from the shared NLU) ──
    // P9: the NLU pass is real work — its duration is
    // measured, not defaulted to 0.
    const nluStarted = Date.now();
    const nlu = understand(input);
    const nluMs = Date.now() - nluStarted;
    const isComplex =
      nlu.entities.filePaths.length > 0 || input.split(/\s+/).length > 12;
    const route = orchestrate({
      intent: nlu.intent,
      task: input,
      isComplex,
    });
    const routePhases = new Set(route.phases);

    // ── PERCEIVE ──
    const percepts = await timed(
      "PERCEIVE",
      routePhases,
      () => this.perception.ingest(input, "conversation"),
      "perception always runs for conversation inputs",
      (p) =>
        `${p.percepts.length} percept(s) ingested, ${p.secretsRedacted} secret(s) redacted`,
    );
    if (percepts && percepts.secretsRedacted > 0) {
      await this.security.audit("perception", {
        note: `${percepts.secretsRedacted} credential(s) redacted on ingest`,
      });
    }

    // ── UNDERSTAND (recorded) + RETRIEVE (substrate core) ──
    phases.push({
      phase: "UNDERSTAND",
      organs: ["head"],
      status: "executed",
      summary: `intent=${nlu.intent}, confidence=${nlu.confidence.toFixed(2)}`,
      durationMs: nluMs,
    });
    // READ-BEARING WORLD MODEL (audit fix I-1): ARCHIE's world
    // model was write-only — observations were stored and
    // versioned but NEVER consulted for reasoning. The
    // current view is now injected as contextual retrieval
    // data (same channel as the caller's system instruction):
    // honest framing, never persisted as knowledge.
    const worldCtx = this.worldContextFor(input);
    const instructionWithContext =
      worldCtx.block.length > 0 && systemInstruction
        ? `${systemInstruction}
${worldCtx.block}`
        : worldCtx.block.length > 0
          ? worldCtx.block
          : systemInstruction;

    // P5 Batch B: the kernel drives the real reasoning loop
    // (reason → act → observe → continue, budget-bounded) —
    // no more one-shot routing at the cognitive layer.
    const loopOutcome = await timed(
      "RETRIEVE",
      routePhases,
      () =>
        runReasoningLoop(this.substrate, input, history, {
          systemInstruction: instructionWithContext,
          conversationId: opts?.conversationId,
          ownerAuthorized: opts?.ownerAuthorized,
          // OWNER UPGRADE 2026-09-16 (gap 1): honest test seam —
          // a caller (or test) can pin the loop budget to
          // verify exhaustion reporting without bending prod
          // budgets. Production callers leave it unset.
          maxSteps: opts?.loopBudget?.maxSteps,
          maxToolHops: opts?.loopBudget?.maxToolHops,
          // Gap 3: loop steps stream live to the observer.
          onStep: (step) => onEvent?.({ type: "step", ...step }),
        }),
      "retrieval handled inside substrate reasoning",
      (o) =>
        (o?.report
          ? `reasoning loop: ${o.report.usedSteps} step pass(es), ${o.report.usedToolHops} tool hop(s)`
          : "substrate single-pass converse (loop not engaged)") +
        `, ${worldCtx.used} world observation(s) injected as context`,
    );
    const loopReport: ReasoningLoopReport | null = loopOutcome?.report ?? null;
    const core: ConverseResult =
      loopOutcome?.result ??
      (await this.substrate.converse(input, history, instructionWithContext, {
        conversationId: opts?.conversationId,
        ownerAuthorized: opts?.ownerAuthorized,
      }));

    // REASON: the real loop trace — steps executed, tools run,
    // budget state — recorded with true durations (P5 Batch B).
    const reasonMs = loopReport
      ? loopReport.steps.reduce((sum, st) => sum + st.durationMs, 0)
      : 0;
    phases.push({
      phase: "REASON",
      organs: ["heart"],
      // P9: the reasoning loop is executed HERE (real steps,
      // measured); a bypassed loop is DELEGATED to the
      // substrate native engine — never claimed as executed.
      status: loopReport ? "executed" : "delegated",
      summary: loopReport
        ? `reasoning loop: ${loopReport.usedSteps}/${loopReport.maxSteps} step pass(es), ${loopReport.usedToolHops}/${loopReport.maxToolHops} tool execution(s)${loopReport.budgetExhausted ? ", budget reached — stopped honestly" : ""}`
        : `delegated to substrate native engine — single-pass routing (${route.reasoningModes.join(", ")})`,
      durationMs: reasonMs,
    });
    phases.push(
      core.plan
        ? {
            phase: "PLAN",
            organs: ["head"],
            // P9: plans are produced by the substrate core
            // (engine planFor) — delegated, not executed here.
            status: "delegated",
            summary: `plan produced by substrate core (engine planFor): ${core.plan.steps.length} step(s), executable=${core.plan.executable}`,
            durationMs: 0,
          }
        : {
            phase: "PLAN",
            organs: ["head"],
            status: "skipped",
            summary: "no planning needed for this task",
            durationMs: 0,
          },
    );

    // ── MODEL (world model update) ──
    let worldModelUpdates = 0;
    await timed(
      "MODEL",
      routePhases,
      async () => {
        const updates: Array<Parameters<WorldModel["relate"]>[0]> = [
          {
            subject: "archie",
            relation: "processed-task",
            object: input.slice(0, 80),
            subjectKind: "System",
            objectKind: "Event",
            confidence: 0.9,
            provenance: "cognitive cycle",
          },
        ];
        for (const fact of core.citedFactIds
          .map((id) => this.substrate.store().get(id))
          .filter(Boolean)
          .slice(0, 3)) {
          updates.push({
            subject: fact!.subject,
            relation: fact!.predicate,
            object: String(fact!.object).slice(0, 80),
            subjectKind: "Concept",
            objectKind: "Concept",
            confidence: fact!.confidence,
            provenance: `knowledge fact ${fact!.id}`,
          });
        }
        for (const u of updates) {
          await this.world.relate(u);
          worldModelUpdates += 1;
        }
        await this.security.audit("world-model-write", {
          relations: worldModelUpdates,
        });
      },
      "no world-model update needed",
      () => `${worldModelUpdates} world-model relation(s) written`,
    );

    // ── CREATE (only when the task asks for an artifact) ──
    let creationNote: string | null = null;
    await timed(
      "CREATE",
      routePhases,
      () => {
        if (
          nlu.intent === "code_analysis_request" &&
          /test|unit/i.test(input)
        ) {
          const codeBlock = input.match(/```[\w]*\n([\s\S]*?)```/);
          if (codeBlock) {
            const artifact = this.creation.create({
              kind: "unit-test-scaffold",
              label: "scaffold",
              path: "inline-snippet.ts",
              source: codeBlock[1],
            });
            creationNote = artifact.ok
              ? `Creation (deterministic): unit-test scaffold generated.\n${artifact.artifact}`
              : null;
          }
        }
        return creationNote;
      },
      "no artifact requested",
      // FIX 21 (remediation batch 7, Level 4 kernel audit
      // 2026-09-13): executed CREATE phases used to fall back
      // to the ceremonial "completed (measured)" default —
      // P9 says an executed phase records WHAT IT PRODUCED.
      (note) =>
        note
          ? "unit-test scaffold generated (deterministic creation engine)"
          : "create branch ran; no artifact requested by this input",
    );

    // ── VERIFY (formal verdict before presentation) ──
    const verificationResult = await timed(
      "VERIFY",
      routePhases,
      () => {
        const cited = core.citedFactIds
          .map((id) => this.substrate.store().get(id))
          .filter(Boolean) as Fact[];
        const salient = (core.salientFactIds ?? [])
          .map((id) => this.substrate.store().get(id))
          .filter(Boolean) as Fact[];
        const verdict = this.verifier.verify({
          target: `response to: ${input.slice(0, 60)}`,
          output: core.responseText + (creationNote ?? ""),
          citedFacts: cited,
          // mr-3 (owner directive 2026-09-16): VERIFY is
          // memory-aware — the session's salient validated
          // facts join the contradiction scan.
          contextFacts: salient,
          requiredAspects: [],
          correctnessRecheck:
            core.toolResults &&
            core.toolResults.length > 0 &&
            core.toolResults[0].tool === "arithmetic"
              ? () => {
                  const invocation = core.toolResults![0];
                  return {
                    passed: invocation.ok,
                    detail:
                      "arithmetic re-executed deterministically by the tool during reasoning",
                  };
                }
              : undefined,
          containsCode: Boolean(creationNote),
        });
        void this.security.audit("verification", {
          verdict: verdict.verdict,
          checks: verdict.checks.length,
        });
        if (verdict.verdict === "FAIL") this.verificationFails += 1;
        return verdict;
      },
      "no factual claims to verify",
      (v) => `formal verdict: ${v.verdict}, ${v.checks.length} check(s) run`,
    );
    const verification: VerificationVerdict | null = verificationResult ?? null;

    // ── LIFE-SAFETY HARD GATE on ARCHIE's OWN output (owner
    //    directive 2026-09-11). Defense in depth: even if a
    //    composed response would endorse, instruct or
    //    automate a credibly life-threatening operation, it is
    //    replaced with the safety stop before presentation.
    //    The event is preserved in the tamper-evident audit
    //    chain; the hazard, uncertainty and resumption
    //    protocol are stated honestly.
    let responseText = core.responseText;
    const selfGate = classifyLifeSafety(
      core.responseText + (creationNote ?? ""),
    );
    if (selfGate.blocked) {
      await this.security.audit("life-safety-stop", {
        hazard: selfGate.hazard ?? null,
        action: selfGate.action,
        stage: "VERIFY/ACT",
        replacedResponse: core.responseText.slice(0, 200),
      });
      responseText = lifeSafetyStopMessage(selfGate);
    }
    if (route.authority === "owner-gated") {
      responseText +=
        "\n[Owner Authority] This task involves consequential operations — my role ends at PROPOSE. Nothing was executed; say the word and I will prepare a staged, tested proposal for your approval.";
    }
    if (creationNote) responseText += `\n${creationNote}`;

    // Epistemic + verification footer for substantive answers.
    const citedFacts = core.citedFactIds
      .map((id) => this.substrate.store().get(id))
      .filter(Boolean) as Fact[];
    let epistemic: EpistemicStatus =
      citedFacts.length > 0 ? weakestStatus(citedFacts) : "UNKNOWN";
    if (citedFacts.length === 0 && core.responseText.length > 0) {
      // conversational/system response: status is about
      // ARCHIE itself — verified by construction.
      epistemic = "VERIFIED";
    }
    let meta: MetaAssessment | null = null;
    let evaluateMs = 0;
    if (routePhases.has("EVALUATE")) {
      const evaluateStarted = Date.now();
      meta = this.metacognition.assess({
        task: input,
        matchedFacts: citedFacts,
        unmatchedAspects: citedFacts.length === 0 ? [input.slice(0, 60)] : [],
        deterministicAvailable: (core.toolResults?.length ?? 0) > 0,
        verificationAvailable: true,
      });
      if (
        citedFacts.length === 0 &&
        ["knowledge_query", "howto_guidance"].includes(nlu.intent)
      ) {
        this.unknownTopicHits += 1;
      }
      evaluateMs = Date.now() - evaluateStarted;
    }
    if (
      verification &&
      verification.verdict === "FAIL" &&
      route.verificationLevel === "strict"
    ) {
      responseText += `\n[Verification: ${verification.verdict}] ${verification.checks
        .filter((c) => !c.passed)
        .map((c) => c.detail)
        .join("; ")}`;
      epistemic = "ASSUMED";
    } else if (
      citedFacts.length > 0 &&
      ["knowledge_query", "howto_guidance", "teaching", "correction"].includes(
        nlu.intent,
      )
    ) {
      responseText += `\n[Epistemic status: ${epistemic}]`;
    }

    // ── ACT (honest record of the action surface) ──
    // FIX 18 (remediation batch 7, Level 4 kernel audit
    // 2026-09-13): the orchestrator routes ACT on nearly
    // every intent, but the kernel never recorded the phase —
    // every saved trace silently omitted a phase its own
    // route declared. The kernel's action is either the
    // composed response itself (delivered in conversation) or
    // a tool call RELAYED to the caller's tool loop; both are
    // now recorded within the P9 honest status set.
    if (routePhases.has("ACT")) {
      phases.push({
        phase: "ACT",
        organs: ORGAN_PHASE_BINDINGS["ACT"] ?? [],
        status: core.toolCall ? "delegated" : "skipped",
        summary: core.toolCall
          ? `tool call "${core.toolCall.name}" emitted — execution delegated to the caller's tool loop (archie-chat)`
          : "no external action required — the composed response is the act, delivered in conversation",
        durationMs: 0,
      });
    }

    // ── OBSERVE / EVALUATE / LEARN ──
    await timed(
      "OBSERVE",
      routePhases,
      () =>
        this.security.audit("learning", {
          cycle: cycleId,
          intent: nlu.intent,
          confidence: core.confidence,
        }),
      "nothing to observe",
      () =>
        `audit ledger write: cycle ${cycleId}, intent ${nlu.intent}, confidence ${core.confidence.toFixed(2)}`,
    );
    const loopEval = loopReport
      ? `; reasoning loop ${loopReport.usedSteps}/${loopReport.maxSteps} steps, ${loopReport.usedToolHops}/${loopReport.maxToolHops} tool hops, budget ${loopReport.budgetExhausted ? "exhausted — reported to you honestly" : "within bounds"}`
      : "";
    phases.push({
      phase: "EVALUATE",
      organs: ["pain"],
      status: routePhases.has("EVALUATE") ? "executed" : "skipped",
      summary: meta
        ? `meta-assessment: ${meta.whatIKnow.length} known, ${meta.whatIDontKnow.length} unknown, ${meta.mustVerify.length} to verify${loopEval}`
        : "skipped",
      durationMs: evaluateMs,
    });
    phases.push({
      phase: "LEARN",
      organs: ["digestive"],
      // P9: learning happens in the SUBSTRATE learner (outcome
      // + credit assignment inside converse) — delegated to a
      // named component, never claimed as executed here.
      status: routePhases.has("LEARN") ? "delegated" : "skipped",
      summary:
        "delegated to substrate learning engine — outcome recorded with deterministic credit assignment",
      durationMs: 0,
    });

    // ── REMEMBER (durable trace) ──
    // The trace records the canonical loop order (owner
    // directive): phases executed out of order during the
    // pass are presented in the permanent sequence.
    phases.sort(
      (a, b) => LOOP_PHASES.indexOf(a.phase) - LOOP_PHASES.indexOf(b.phase),
    );
    const trace: CognitiveTrace = {
      cycleId,
      task: input.slice(0, 120),
      phases,
      route,
      epistemic,
      confidence: core.confidence,
      createdAt: new Date().toISOString(),
    };
    // REMEMBER moved to cycle close (audit fix 2026-09-11:
    // trace dedupe — the loop used to write the durable trace
    // twice, once mid-cycle and once after REPEAT; saveTrace
    // is an upsert on cycleId so this doubled write volume for
    // zero fidelity gain). The single write now happens after
    // the final phase sort below, wrapped in its own honest
    // REMEMBER phase record.

    // ── IMPROVE (proposals only — owner-gated by design) ──
    const proposals: ImprovementProposal[] = [];
    await timed(
      "IMPROVE",
      new Set<LoopPhase>(["IMPROVE"]),
      () => {
        if (this.unknownTopicHits >= 3) {
          proposals.push(
            makeProposal(
              `${this.unknownTopicHits} recent knowledge queries found no matching stored knowledge`,
              "expand the foundational knowledge corpus for recurring topics via owner-authorized research passes",
              "fewer UNKNOWN answers in the owner's active domains",
            ),
          );
          this.unknownTopicHits = 0;
        }
        if (this.verificationFails > 0) {
          proposals.push(
            makeProposal(
              `${this.verificationFails} recent output(s) failed strict verification`,
              "tighten retrieval thresholds and add the failed patterns to the reasoning rule library (owner review of the diff required)",
              "higher first-pass verification rate",
            ),
          );
          this.verificationFails = 0;
        }
        return proposals;
      },
      "improvement is a standing phase",
      (made) =>
        `${made.length} self-improvement proposal(s) drafted (owner-gated, nothing executed)`,
    );
    for (const p of proposals) {
      await this.security.audit("improvement-proposal", {
        id: p.id,
        weakness: p.weakness,
      });
    }
    if (proposals.length > 0) {
      responseText +=
        `\n[Self-improvement proposal${proposals.length > 1 ? "s" : ""} — owner approval required, nothing executed]\n` +
        proposals
          .map(
            (p) =>
              `- ${p.weakness} → ${p.proposal} (expected: ${p.expectedGain})`,
          )
          .join("\n");
    }

    // ── REPEAT (the loop's permanent continuity) ──
    // Every completed cycle rolls into the next one; the loop
    // never terminates. Recorded honestly as the final phase.
    phases.push({
      phase: "REPEAT",
      // P9: the kernel does no work here — cycle continuity
      // is the substrate orchestrator's standing behavior.
      status: "delegated",
      summary:
        "delegated to substrate orchestrator — cycle rolls into the next; the loop never terminates",
      durationMs: 0,
      organs: ["healing", "sleep"],
    });
    // Canonicalize the complete traversal (trace.phases IS
    // phases — the mutation is reflected everywhere), then the
    // SINGLE durable write at cycle close. The REMEMBER record
    // is pushed around the real write so its duration is
    // measured, then the array is re-sorted to the canonical
    // loop order. (A saved trace can never contain its own
    // REMEMBER record — the row persists every other phase of
    // the loop; the returned trace carries all of them.)
    phases.sort(
      (a, b) => LOOP_PHASES.indexOf(a.phase) - LOOP_PHASES.indexOf(b.phase),
    );
    if (routePhases.has("REMEMBER")) {
      const rememberStarted = Date.now();
      const remembered = await this.tracePersistence.saveTrace(trace);
      phases.push({
        phase: "REMEMBER",
        organs: ORGAN_PHASE_BINDINGS["REMEMBER"] ?? [],
        status: "executed",
        summary: remembered
          ? `durable trace saved: ${phases.length} phase record(s), cycle ${cycleId}`
          : "persistence unavailable — trace returned but not stored",
        durationMs: Date.now() - rememberStarted,
      });
    } else {
      phases.push({
        phase: "REMEMBER",
        organs: ORGAN_PHASE_BINDINGS["REMEMBER"] ?? [],
        status: "skipped",
        summary: "no persistence configured",
        durationMs: 0,
      });
    }
    phases.sort(
      (a, b) => LOOP_PHASES.indexOf(a.phase) - LOOP_PHASES.indexOf(b.phase),
    );

    return {
      responseText,
      epistemic,
      confidence: core.confidence,
      citedFactIds: core.citedFactIds,
      meta,
      verification,
      trace,
      toolResults: core.toolResults ?? [],
      proposals,
      worldModelUpdates,
      // Relay the substrate's pending toolCall to the caller
      // (plan P1, audit C1) — the kernel never swallows it.
      toolCall: core.toolCall,
    };
  }

  /** Aggregated, honest diagnostics of the unified engine. */
  diagnostics(): Record<string, unknown> {
    const securityIntegrity = this.security.integrity();
    return {
      engineId: this.id,
      uptimeMs: Date.now() - this.bootedAt,
      cycles: this.cycles,
      systems: cognitiveCapabilityManifest(),
      perception: this.perception.stats(),
      metacognition: this.metacognition.stats(),
      verification: this.verifier.stats(),
      toolIntelligence: this.toolIntelligence.stats(),
      creation: this.creation.stats(),
      security: securityIntegrity,
      worldModel: {
        entities: this.world.entitiesCount(),
        relations: this.world.relationsCount(),
      },
      substrate:
        "ARCHIE Native Intelligence Engine (own runtime — zero external AI)",
    };
  }

  worldModel(): WorldModel {
    return this.world;
  }
}

// Re-export for convenience so diagnostics consumers can
// classify individual facts without importing metacognition.
export { epistemicStatusOf };
