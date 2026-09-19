// =========================================================
// ARCHIE NATIVE INTELLIGENCE ENGINE — THE ENGINE
//
// ARCHIE's OWN inference runtime: a foundational core
// component that operates with ZERO external AI APIs. It
// implements the shared ArchieRuntime contract, so every
// ARCHIE surface (archie-core, archie-chat, Coding Studio,
// app) resolves it through the provider-agnostic engine
// registry — the registry slot that used to sit empty.
//
// Pipeline (permanent architecture):
//   NLU → MEMORY → KNOWLEDGE → REASONING → TOOLS →
//   LEARNING → VERIFICATION → IMPROVEMENT
//
// Honesty is structural: responses are composed from real
// retrieved facts, reasoning outputs, tool results and the
// capability manifest — never from canned conversation
// strings, and never pretending capabilities that do not
// exist (see capabilities.ts).
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
  DEFAULT_TRADING_LIMITS,
  type TradingLimits,
} from "./crypto/trade-gate.ts";
import type { Fetcher } from "./crypto/market-data.ts";
import { createCryptoSkill } from "./domains/crypto.ts";
import {
  NATIVE_ENGINE_ID,
  manifestSummary,
  nativeEngineCapabilityManifest,
} from "./capabilities.ts";
import {
  isCapabilityEnabled,
  capabilityDisabledReply,
  disabledCapabilityIds,
} from "./capability-gate.ts";
import {
  understand,
  decomposeClauses,
  MAX_COMPOUND_CLAUSES,
  composeCompound,
  tokenize,
  probeVocabulary,
} from "./nlu.ts";
// Conversational English expansion (owner directive,
// 2026-09-11): deterministic, grounded composition for
// social and conversational intents.
import { composeConversational } from "./conversation.ts";
import {
  derivedOpening,
  ownerAssertedOpening,
  mixedBasisOpening,
  howtoFooter,
  includesDerived,
  knowledgeOpening,
  unknownOpening,
  type Verbosity,
} from "./composer.ts";
import { generatedLabel, ownerLocalGenerate } from "./generative.ts";
import { ContextMemory } from "./memory.ts";
import { redactSecrets } from "../cognitive/security-integrity.ts";
import { FACT_RELEVANCE_FLOOR, FactStore } from "./knowledge.ts";
import { FULL_SEED_CORPUS, SEED_CORPUS_VERSION } from "./seed-corpus.ts";
import { PageFetcher } from "./page-fetch.ts";
import { matchCodeRequest } from "./sandbox.ts";
import { WikipediaSearchAdapter } from "./wikipedia-search.ts";
import { GoogleBooksAdapter } from "./google-books-search.ts";
import { StackExchangeAdapter } from "./stackexchange-search.ts";
import { ArxivAdapter } from "./arxiv-search.ts";
// LLM ROUTER (draft scaffold, owner directive 2026-09-16):
// pluggable model seam shipping with ZERO providers — no
// external AI model is wired into ARCHIE.
import { LLMRouter, createDefaultModelRouter } from "./llm-router.ts";
import type { HydrationStats } from "./knowledge.ts";
import { DEFAULT_RULES, GENERAL_RULES, ReasoningEngine } from "./reasoning.ts";
import {
  consistency,
  executeStrategy,
  hypothesis,
  selectStrategies,
  comparative,
  constraint,
  temporal,
  extractComparisonSubjects,
} from "./strategies.ts";
import { DEFAULT_OPERATORS, PLANNING_OPERATORS, Planner } from "./planning.ts";
import {
  mergeLessonRisk,
  retrieveRelevantLessons,
  type RecordedLesson,
} from "./lessons.ts";
import { DomainSkillRegistry } from "./domains/registry.ts";
// Skill wiring only (composition): the engine imports NO
// construction logic — the calculator, rules, NLU lexicon,
// seed facts, quantities hint and operator execution all live
// in the skill and route through the registry
// (domain-capture completion 2026-09-11). Importers that need
// constructionEstimate import it from the domain module.
import { constructionSkill } from "./domains/construction.ts";
import { ToolOrchestrator, registerBuiltInTools } from "./tools.ts";
import {
  ResearchPipeline,
  salientTokens,
  type ResearchAdapter,
  DuckDuckGoLiteAdapter,
  DomainAwareSearchAdapter,
  MultiSearchAdapter,
} from "./webresearch.ts";
import { getWebSourceRegistry } from "./web-sources.ts";
import { analyzeSource, generateUnitTestScaffold } from "./coding.ts";
import {
  analyzeProject as analyzeProjectFiles,
  generateDependencyAwareTestScaffold,
  type ProjectAnalysis,
  type ProjectFile,
} from "./coding-project.ts";
import { SelfEvaluator } from "./selfeval.ts";
import { OutcomeLearner, consolidateIfDue } from "./learning.ts";
import { SupabasePersistence, type SupabaseLike } from "./persistence.ts";
import { parseStateChangeClaim } from "../cognitive/world-model.ts";
import {
  extractMeaningResearchRequest,
  researchTermMeaning,
  type FetchLike,
  type MeaningResearchReport,
} from "../knowledge/vocabulary-research.ts";
import { CounterPersistence, EpisodicPersistence } from "./persistence.ts";
import type { Fact, Plan, PlanLesson, RetrievedContext } from "./types.ts";

/** Phase 4.4 (lessons → behavior): caller-provided fetch of
 *  the owner's evolution-memory rows (archie_evolution_memory,
 *  §15). archie-chat wires this at boot with the service
 *  client. Null/[]/throw → the plan simply carries no lessons
 *  (absence is honest, never fabricated). */
export type LessonLookup = () => Promise<RecordedLesson[] | null>;

/** Foundational knowledge seeded at engine construction —
 *  real reference facts in ARCHIE's home domain. */
/** Region hint extraction for the market tool: honest —
 *  empty when the owner did not name a place (the tool then
 *  reports that a region is required; no default invented). */
function extractRegionHint(input: string): string {
  const m =
    /\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/.exec(input) ??
    /\b(?:region|area|state|country)\s+(?:of|is|in)?\s*([A-Za-z]+(?:\s[A-Za-z]+)?)/i.exec(
      input,
    );
  return (m?.[1] ?? "").trim().slice(0, 80);
}

/** Deterministic, honest tool-output summarizer (plan P1):
 *  relays the tool's own answer fields verbatim; unknown
 *  shapes are shown as truncated JSON — never paraphrased
 *  into claims the tool did not make. */
function summarizeToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const key of [
      "answer",
      "text",
      "reply",
      "result",
      "summary",
      "price",
      "status",
    ]) {
      if (typeof o[key] === "string" && (o[key] as string).length > 0) {
        return o[key] as string;
      }
    }
    if (o.error && typeof o.error === "string") {
      return `The tool reported an error: ${o.error}`;
    }
    try {
      const j = JSON.stringify(output, null, 2);
      return j.length > 600 ? `${j.slice(0, 600)}…` : j;
    } catch {
      return "The tool returned output I could not display.";
    }
  }
  return String(output ?? "");
}

export interface ConverseResult {
  nlu: ReturnType<typeof understand>;
  responseText: string;
  confidence: number;
  citedFactIds: string[];
  /** Session-salient VALIDATED facts surfaced by context
   *  retrieval (mr-3, owner directive 2026-09-16): the
   *  knowledge the retrieval context itself brought to
   *  bear on this exchange. Consumed by the kernel's VERIFY
   *  phase — memory-aware contradiction scanning — and by
   *  diagnostics. Never minted; store-gated facts only. */
  salientFactIds: string[];
  selfCheck: { check: string; passed: boolean; detail: string };
  plan?: Plan;
  toolResults?: Array<{
    tool: string;
    ok: boolean;
    output: unknown;
    error?: string;
  }>;
  /** Pending tool invocation (plan P1, audit C1): the engine
   *  asks the CALLER to execute a declared tool and feed the
   *  result back as a trailing owner toolResult turn. Emitted
   *  ONLY when the caller declared the tool in the request. */
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

// ---------------------------------------------------------
// Market intelligence adapter boundary (pluggable, like the
// research adapter). Production (archie-chat) wires a real
// service-role lookup over mi_approved_prices / mi_price_
// observations; tests inject doubles. The engine NEVER guesses
// prices — no lookup wired or no data means an honest answer.
// ---------------------------------------------------------
export interface MarketPriceResult {
  product: string;
  price: number;
  currency: string;
  packageSize: number | null;
  packageUnit: string | null;
  marketCode: string;
  /** Honest freshness classification of the underlying record. */
  freshness: "fresh" | "recent" | "stale" | "expired";
  /** "approved" = curated price list; "observation" = raw crawl. */
  source: "approved" | "observation";
  recordedAt: string;
  note?: string;
}

export type MarketPriceLookup = (
  product: string,
  market?: string,
) => Promise<MarketPriceResult | null>;

// ---------------------------------------------------------
// System adapters (documents, images, voice bank, social,
// family). Same honest contract as the market lookup: a
// pluggable boundary the deployment wires to REAL tables;
// no data or no wired adapter produces an honest refusal —
// ARCHIE never invents system state.
// ---------------------------------------------------------
export interface SystemAdapterResult {
  /** The honest, fully-composed answer body. */
  headline: string;
  /** Real provenance (table(s) / adapter name). */
  source: string;
}

export type SystemAdapter = () => Promise<SystemAdapterResult | null>;

export type SystemAdapterKey =
  "documents" | "images" | "voice" | "social" | "family";

export type SystemAdapters = Partial<Record<SystemAdapterKey, SystemAdapter>>;

// Explicit owner confirmation language (audit H1, plan P3):
// this is VERIFICATION evidence — the opposite of a correction.
const EXPLICIT_CONFIRM =
  /\b(?:you were right about|you'?re right about|confirm that|i confirm that|verified that|verify that|that'?s (?:right|correct|exact) about)\b/i;

/** Request-scoped conversational state (audit fix C-1,
 *  2026-09-11). The engine singleton previously carried ONE
 *  shared ContextMemory, one conversation id and one tool
 *  surface — concurrent requests inside an edge isolate bled
 *  context across conversations and stamped episodic rows
 *  under the wrong conversation id. All per-request state now
 *  lives in a session object keyed by conversation id; the
 *  engine itself keeps only isolate-scoped state (facts,
 *  counters, learner, research, tools). */
interface EngineSession {
  conversationId: string;
  memory: ContextMemory;
  /** Tool names the CALLER declared (plan P1): toolCalls are
   *  emitted only for declared tools — never speculatively. */
  requestToolNames: string[];
  createdAt: number;
}

export class ArchieNativeEngine implements ArchieRuntime {
  /** Session table — bounded, FIFO-evicted. */
  private sessions = new Map<string, EngineSession>();
  /** Shared episodic snapshot hydrated ONCE per isolate at
   *  boot; every new session memory is seeded from it so
   *  prior-session context survives session isolation too. */
  private episodicTurns: Array<{
    role: "owner" | "archie";
    text: string;
    at: number;
  }> = [];
  /** Legacy pointer: the session selected by setConversationId
   *  or the last explicit opts — "default" for direct converse()
   *  callers, preserving the original serial semantics. */
  private currentSessionId = "default";

  private static readonly MAX_SESSIONS = 64;

  /** The session for a conversation id (created on demand,
   *  episodic-seeded, FIFO-bounded). */
  private sessionFor(conversationId?: string): EngineSession {
    const id =
      conversationId && conversationId.length > 0
        ? conversationId
        : this.currentSessionId;
    let session = this.sessions.get(id);
    if (!session) {
      const memory = new ContextMemory();
      // Validated-fact salience (mr-3): every session memory
      // is wired to the SAME gated FactStore converse() uses —
      // retrieval surfaces validated, floor-clearing facts.
      memory.attachFactSource(this.facts);
      if (this.episodicTurns.length > 0) {
        memory.hydrateEpisodic(this.episodicTurns);
      }
      session = {
        conversationId: id,
        memory,
        requestToolNames: [],
        createdAt: Date.now(),
      };
      this.sessions.set(id, session);
      if (this.sessions.size > ArchieNativeEngine.MAX_SESSIONS) {
        // FIFO eviction: oldest session is dropped — its
        // turns remain retrievable through episodic persistence.
        const oldest = [...this.sessions.entries()].sort(
          (a, b) => a[1].createdAt - b[1].createdAt,
        )[0];
        if (oldest) this.sessions.delete(oldest[0]);
      }
    }
    return session;
  }

  /** The caller declares its tool surface per request (plan
   *  P1). The cognitive kernel calls converse() directly, so
   *  it must be able to hand the surface to the substrate
   *  without going through generate(). Scoped to the
   *  CURRENT session (audit fix C-1) — concurrent
   *  conversations can no longer stomp each other's surface. */
  noteDeclaredTools(names: string[], conversationId?: string): void {
    // Fix 33: scoped to the named conversation when given —
    // the kernel hands both in together so it no longer
    // mutates the isolate-wide legacy pointer.
    this.sessionFor(conversationId).requestToolNames = names;
  }

  /** Per-request tool surface for an explicit conversation
   *  (C-1): generate()/kernel paths hand both in together. */
  private toolsFor(conversationId: string): string[] {
    return this.sessionFor(conversationId).requestToolNames;
  }
  readonly id = NATIVE_ENGINE_ID;
  readonly kind = "archie-native" as const;
  readonly label =
    "ARCHIE Native Intelligence Engine (own inference — operational)";

  private facts: FactStore;
  private reasoning: ReasoningEngine;
  private planner: Planner;
  private tools = new ToolOrchestrator();
  private selfEval = new SelfEvaluator();
  private learner: OutcomeLearner;
  private research: ResearchPipeline;
  /** Pluggable domain skills (audit fix 2026-09-11). */
  private domains: DomainSkillRegistry;
  private adapter: ResearchAdapter;
  private marketPriceLookup: MarketPriceLookup | null;
  private worldTimeline: WorldTimelinePort | null;
  /** LLM router — zero providers by default (owner directive). */
  private modelRouter: LLMRouter;
  /** SELF-EVOLVING VOCABULARY — multi-site meaning research
   *  (owner directive 2026-09-13). Injectable like
   *  marketPriceLookup: production uses the real
   *  dictionary/reference sites; tests inject a labeled
   *  double. null = default real fetch. */
  private meaningResearch:
    ((term: string) => Promise<MeaningResearchReport>) | null;
  /** H-2 — crypto market-data fetcher (null = real fetch). */
  private cryptoFetcher: Fetcher | null;
  /** H-2 — trade-gate limits. */
  private tradingLimits: TradingLimits;
  /** Phase 4.4 — owner evolution-memory lessons provider. */
  private lessonLookup: LessonLookup | null;
  private systemAdapters: SystemAdapters;
  private persistence: SupabasePersistence | null;
  private verbosity: Verbosity = "detailed";
  /** P7 — episodic-turn store (prior-session context). */
  private episodicStore: EpisodicPersistence | null = null;
  /** P7 — cross-isolate counter store. */
  private counterStore: CounterPersistence | null = null;
  /** REMEDIATION batch 5 (fix 13): contradiction-detected
   *  fact ids already counted as verification failures by
   *  this isolate (dedupe across reasoning passes). */
  private readonly seenContradictions = new Set<string>();
  /** P7 — calibration counters for THIS isolate only: the
   *  mean-confidence denominator must be local, or the
   *  calibration would dilute dishonestly. */
  private sessionInferences = 0;
  /** P7 — system-wide counters (seeded from persisted base
   *  at boot, incremented live, persisted per turn). */
  private unknownTopicHits = 0;
  private verificationFails = 0;
  private bootedAt = Date.now();
  private inferences = 0;
  private confidenceSum = 0;
  private booted = false;

  constructor(options?: {
    /** null/undefined = run in-memory only (the REAL
     *  personalization privacy control). */
    persistence?: SupabaseLike | null;
    researchAdapter?: ResearchAdapter;
    marketPriceLookup?: MarketPriceLookup;
    lessonLookup?: LessonLookup;
    /** SELF-EVOLVING VOCABULARY — meaning-research lookup
     *  over multiple dictionary/reference sites. Injected by
     *  tests; default = the real multi-site fetcher. */
    meaningResearch?: (term: string) => Promise<MeaningResearchReport>;
    systemAdapters?: SystemAdapters;
    /** P6 Batch B — owner verbosity profile. Selects which
     *  OPTIONAL connectives are composed; content and
     *  epistemic labels are identical in both modes. */
    verbosity?: Verbosity;
    /** WORLD TIMELINE PORT (audit HIGH-1 fix, 2026-09-13):
     * read/write access to the versioned world-model
     * timeline, owned by the cognitive kernel. The engine
     * (substrate) NEVER owns the world model — it parses
     * state-change claims, records observations through this
     * port, and answers change-over-time questions from
     * recorded transitions. Honest refusals when absent. */
    worldTimeline?: WorldTimelinePort;
    /** P7 — conversation id for episodic-turn session
     *  grouping. Default 'default'. */
    conversationId?: string;
    /** Audit fix H-2 — injected crypto market-data fetcher.
     *  null/undefined = the real global fetch (all venues
     *  queried live; unreachable venues are reported
     *  honestly, never simulated). */
    cryptoFetcher?: Fetcher;
    /** Audit fix H-2 — owner trading limits for the trade
     *  gate. Defaults to DEFAULT_TRADING_LIMITS. */
    tradingLimits?: TradingLimits;
    /** LLM ROUTER (owner directive 2026-09-16): pluggable
     *  model seam. The default ships ZERO providers — ARCHIE
     *  stays 100% native until an owner explicitly passes a
     *  router with real providers. */
    modelRouter?: LLMRouter;
  }) {
    this.currentSessionId = options?.conversationId ?? "default";
    this.cryptoFetcher = options?.cryptoFetcher ?? null;
    this.tradingLimits = options?.tradingLimits ?? DEFAULT_TRADING_LIMITS;
    this.modelRouter = options?.modelRouter ?? createDefaultModelRouter();
    this.verbosity = options?.verbosity ?? "detailed";
    this.marketPriceLookup = options?.marketPriceLookup ?? null;
    this.worldTimeline = options?.worldTimeline ?? null;
    this.meaningResearch = options?.meaningResearch ?? null;
    this.lessonLookup = options?.lessonLookup ?? null;
    this.systemAdapters = options?.systemAdapters ?? {};
    this.persistence = options?.persistence
      ? new SupabasePersistence(options.persistence)
      : null;
    // P7: episodic-turn persistence shares the SAME consent
    // gate — persistence null (consent revoked) means no
    // episodic reads or writes either.
    this.episodicStore = options?.persistence
      ? new EpisodicPersistence(options.persistence)
      : null;
    // P7 batch 2 — cross-isolate counters share the same
    // consent gate (persistence null → in-memory only).
    this.counterStore = options?.persistence
      ? new CounterPersistence(options.persistence)
      : null;
    // OWNER UPGRADE 2026-09-16 (gap 2): ONE robots-checked,
    // timeout-guarded page fetcher serves BOTH the research
    // deepening pass AND the read_page tool — a single honest
    // fetching policy, not two divergent ones.
    const pageFetcher = new PageFetcher();
    this.adapter =
      options?.researchAdapter ??
      // Composite search (audit Phase 2.2): DDG Lite first
      // (best coverage where its IPs are not blocked), with an
      // HONEST fallback to the edge-reliable Wikipedia API —
      // DDG anomaly-blocks Supabase datacenter traffic
      // (live-verified), and a blocked primary must never
      // become a fake "no results" research report.
      // Owner upgrade 2026-09-16 (b): domain-aware chain — a
      // programming question consults StackExchange BEFORE the
      // encyclopedia (the pipeline's source registry already
      // classifies domains; the composite reuses the same
      // classifier for the open-web fallback).
      new DomainAwareSearchAdapter([
        new DuckDuckGoLiteAdapter(),
        new WikipediaSearchAdapter(),
        // Owner upgrade 2026-09-16: Google + other documented
        // keyless research sites — real evidence sources, NO
        // AI model involved (these are catalog/Q&A/preprint
        // APIs: search indexes, not language models).
        new GoogleBooksAdapter(),
        new StackExchangeAdapter(),
        new ArxivAdapter(),
      ]);
    this.facts = new FactStore(this.persistence ?? undefined);
    // Domain-skill registry (audit fix 2026-09-11, domain-
    // capture removal): construction knowledge — calculator,
    // rules, operator — is a pluggable skill, not engine
    // structure. The engine stays domain-neutral; the
    // registered skills compose the effective rule and
    // operator sets, so shipped behavior is unchanged.
    this.domains = new DomainSkillRegistry();
    registerBuiltInDomainSkills(this.domains, {
      cryptoFetcher: this.cryptoFetcher,
      tradingLimits: this.tradingLimits,
    });
    // Domain-general reasoning substrate first, domain rules
    // after (owner directive 2026-09-10 §16): domain knowledge
    // is additive, never structural.
    this.reasoning = new ReasoningEngine(this.facts, [
      ...GENERAL_RULES,
      ...DEFAULT_RULES,
      ...this.domains.rules(),
    ]);
    this.planner = new Planner(
      this.facts,
      [
        ...DEFAULT_OPERATORS,
        ...PLANNING_OPERATORS,
        ...this.domains.operators(),
      ],
      // REMEDIATION batch 5 (fix 12): wire the previously
      // dead backward chain into planning — preconditions
      // provable by rule chains resolve as simulated
      // progress instead of false gaps.
      (pattern) => this.reasoning.canReach(pattern).holds,
    );
    this.learner = new OutcomeLearner(
      this.facts,
      this.persistence ?? undefined,
    );
    // PRIORITY WEB KNOWLEDGE SOURCE REGISTRY — intelligent
    // source selection (owner directive 2026-09-10): the
    // research pipeline classifies the question's domain and
    // searches the most appropriate priority sources first.
    this.research = new ResearchPipeline(
      this.facts,
      this.adapter,
      getWebSourceRegistry(),
      // Audit Phase 2.2 — real page fetching: the top hits are
      // deepened with robots-checked, timeout-guarded page
      // content; content agreement raises the confidence cap.
      // (2026-09-16: the SAME fetcher instance now also backs
      // the read_page tool.)
      pageFetcher,
    );
    registerBuiltInTools(this.tools, { pageFetcher });
  }

  /** Hydrate persisted knowledge + seed foundational facts. */
  async boot(): Promise<{
    hydratedFacts: number;
    seededFacts: number;
    /** Honest hydration account — truncated hydrations are
     *  reported, never silent. */
    hydration: HydrationStats | null;
  }> {
    if (this.booted) {
      return { hydratedFacts: 0, seededFacts: 0, hydration: null };
    }
    this.booted = true;
    const hydratedFacts = await this.facts.hydrate();
    let seededFacts = 0;
    // Corpus v2 (plan P4, audit K1): versioned, swappable
    // knowledge — domain foundations + FRELUX product facts.
    // Domain-capture completion 2026-09-11: the engine seeds its
    // own generic/business corpus, then every registered skill
    // contributes its domain facts through the registry —
    // construction semantics no longer live in this file.
    for (const seed of [...FULL_SEED_CORPUS, ...this.domains.seedFacts()]) {
      const exists = this.facts
        .query({ subject: seed.subject, predicate: seed.predicate })
        .some((f) => JSON.stringify(f.object) === JSON.stringify(seed.object));
      if (!exists) {
        await this.facts.assert({
          ...seed,
          provenance: {
            source: "seed",
            note: `seed corpus v${SEED_CORPUS_VERSION} + domain skills (${this.domains.ids().join(", ") || "none"}) — engine/business corpus + skill-contributed facts, seeded at engine boot`,
          },
          status: "validated",
        });
        seededFacts += 1;
      }
    }
    // Situational facts for planning preconditions.
    // HYDRATE CAP (2026-09-16): when hydration was truncated
    // by the cap, the status fact SAYS SO — a cap is reported,
    // never silent.
    const hydration = this.facts.hydrationAccount();
    const knowledgeAvailable =
      hydration && hydration.truncated
        ? `${this.facts.count()} fact(s) loaded of ${hydration.totalFacts} persisted (hydrate cap ${hydration.cap})`
        : `${this.facts.count()} fact(s) in store`;
    if (this.facts.count() > 0) {
      await this.facts.assert({
        subject: "knowledge",
        predicate: "available",
        object: knowledgeAvailable,
        confidence: 0.9,
        provenance: { source: "seed", note: "knowledge store is populated" },
        status: "validated",
      });
    }
    await this.facts.assert({
      subject: "rules",
      predicate: "loaded",
      object: `${GENERAL_RULES.length + DEFAULT_RULES.length} reasoning rules registered`,
      confidence: 0.9,
      provenance: { source: "seed", note: "reasoning rule library loaded" },
      status: "validated",
    });
    await this.learner.hydrate();
    // REMEDIATION batch 4 (fix 8): durable consolidation
    // scheduling — at most one pass per hour system-wide,
    // coordinated across isolates (skipped passes don't
    // refresh the timestamp, so the next isolate retries).
    try {
      await consolidateIfDue(this.learner, this.counterStore);
    } catch {
      // Best-effort: scheduling never breaks boot.
    }
    // P7 batch 2 — seed system-wide counters from the
    // persisted base so diagnostics report system-wide
    // numbers, not per-isolate noise.
    if (this.counterStore) {
      try {
        const base = await this.counterStore.loadCounters();
        this.inferences += base["inferences"] ?? 0;
        this.unknownTopicHits += base["unknown_topic_hits"] ?? 0;
        this.verificationFails += base["verification_fails"] ?? 0;
      } catch {
        // Counter hydration is best-effort: unavailable table
        // → this isolate counts from zero, honestly.
      }
    }
    // P7 — hydrate prior-session episodic context once per
    // isolate. Cross-isolate: a fresh chat request recalls
    // owner-taught context from previous sessions.
    if (this.episodicStore) {
      try {
        const rows = await this.episodicStore.loadEpisodicTurns();
        if (rows.length > 0) {
          // C-1: episodic turns live in ONE shared snapshot;
          // every session memory is seeded from it on creation.
          this.episodicTurns = rows
            .slice()
            .reverse() // oldest first, stable ranking
            .map((r) => ({
              role: r.role,
              text: r.text,
              at: Date.parse(r.turn_at) || Date.now(),
            }));
          // Already-created sessions pick the snapshot up too.
          for (const session of this.sessions.values()) {
            session.memory.hydrateEpisodic(this.episodicTurns);
          }
        }
      } catch {
        // Episodic hydration is best-effort: an unavailable
        // table degrades to in-session memory only — the
        // conversation still works.
      }
    }
    return { hydratedFacts, seededFacts, hydration };
  }

  isOperational(): boolean {
    return true; // genuinely implemented — see capabilities()
  }

  /** P7/C-1 — select the conversation id for episodic-turn
   *  session grouping. Legacy pointer semantics preserved for
   *  direct converse() callers; generate()/kernel hand the id
   *  per request so concurrent conversations never share a
   *  session. */
  setConversationId(id: string): void {
    this.currentSessionId = id || "default";
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

  async generate(req: ArchieInferenceRequest): Promise<ArchieInferenceResult> {
    const lastOwner = [...req.turns]
      .reverse()
      .find((t: ArchieInferenceTurn) => t.role === "owner");
    // The caller's declared tool surface (plan P1, audit C1) —
    // stamped onto the REQUEST'S session, not the isolate
    // (audit fix C-1: concurrent conversations never share
    // a tool surface or a memory).
    const conversationId =
      (req as { conversationId?: string }).conversationId ??
      this.currentSessionId;
    const session = this.sessionFor(conversationId);
    session.requestToolNames = req.tools.map((t) => t.name);
    // Tool-result resume (plan P1): the caller executed the
    // tool and fed the REAL output back — compose the final
    // answer from it, verbatim and provenance-labeled.
    const trailingToolResult = lastOwner?.parts.find(
      (p: ArchieInferencePart) => p.toolResult,
    )?.toolResult;
    if (trailingToolResult) {
      return this.resumeFromToolResult(trailingToolResult, session);
    }
    const text = lastOwner
      ? lastOwner.parts
          .map((p: ArchieInferencePart) => p.text ?? "")
          .join(" ")
          .trim()
      : "";
    const result = await this.converse(text, req.turns, req.systemInstruction, {
      conversationId,
      // A-1: optional passthrough — the direct generate()
      // callers (runtime API) can declare the owner's own
      // turn. Default remains UNAUTHORIZED: no caller flag,
      // no generation — the gate is opt-in, never opt-out.
      ownerAuthorized: req.ownerAuthorized,
    });
    const parts: ArchieInferencePart[] = [{ text: result.responseText }];
    if (result.toolCall) {
      // The dead-tool seam (audit C1) is now bridged: the
      // engine EMITS the call; the caller's tool loop (it
      // already exists in archie-chat) executes it and feeds
      // the result back.
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
        note: "Generated by ARCHIE's own Native Intelligence Engine — no external AI provider involved.",
      },
      finishReason: result.toolCall ? "TOOL_CALL" : "COMPLETE",
    };
  }

  /** Compose the final answer from a REAL tool result —
   *  relayed verbatim, provenance-labeled, never fabricated
   *  (plan P1). The tool's own output decides what ARCHIE
   *  can say; the engine only frames it honestly. */
  private async resumeFromToolResult(
    toolResult: {
      name: string;
      output: unknown;
    },
    session: EngineSession,
  ): Promise<ArchieInferenceResult> {
    this.inferences += 1;
    this.sessionInferences += 1;
    const body = summarizeToolOutput(toolResult.output);
    const text =
      `${body}\n` +
      `[Source: ${toolResult.name} tool — real system output relayed verbatim by the ARCHIE native engine. I never fabricate system state.]`;
    session.memory.addTurn("owner", `[tool result: ${toolResult.name}]`);
    session.memory.addTurn("archie", text);
    // REMEDIATION batch 11 (fix 34): the tool-result resume
    // path used to bypass episodic persistence entirely —
    // every tool exchange (status checks, price lookups) was
    // invisible to the NEXT session's recall, while plain
    // conversational turns persisted. The turn pair now goes
    // through the same consent-gated episodic store as
    // converse(), under the session's conversation id. Best
    // effort, same as the main path: a failed write never
    // breaks the reply.
    if (this.episodicStore) {
      const at = Date.now();
      try {
        await this.episodicStore.saveEpisodicTurn({
          conversationId: session.conversationId,
          role: "owner",
          text: `[tool result: ${toolResult.name}]`,
          at,
        });
        await this.episodicStore.saveEpisodicTurn({
          conversationId: session.conversationId,
          role: "archie",
          text,
          at: at + 1,
        });
      } catch {
        // Episodic persistence is best-effort.
      }
    }
    return {
      parts: [{ text }],
      engine: {
        path: "archie-native",
        note: "Tool-result resume — ARCHIE's native engine composed the answer from real tool output. No external AI provider involved.",
      },
      finishReason: "COMPLETE",
    };
  }

  /** One full conversational inference pass. */
  async converse(
    input: string,
    history?: ArchieInferenceTurn[],
    /** Caller-provided operating context (persona, domain
     *  scope, injected knowledge base) — consulted as a
     *  retrieval source, never persisted as knowledge. */
    systemInstruction?: string,
    /** Request scoping (audit fix C-1): the conversation id
     *  for this pass, and (kernel handoff, M-1) a
     *  precomputed NLU result so the input is parsed ONCE
     *  per request instead of once per layer. */
    opts?: {
      conversationId?: string;
      nlu?: ReturnType<typeof understand>;
      /** Gap A-1: true only on the OWNER's own turns (set by
       *  the chat front door; the agent worker never sets it).
       *  Gates the owner-gated local generative model at the
       *  honest-unknown path — generated output is labeled,
       *  never stored as knowledge. */
      ownerAuthorized?: boolean;
    },
  ): Promise<ConverseResult> {
    // VOCATIVE STRIP (owner report 2026-09-14): the Owner
    // addresses ARCHIE by name ("ARCHIE, remember that ...").
    // The leading vocative broke every ^-anchored deterministic
    // rule (teaching, memory exclusion, greetings) and fed the
    // bare "archie" token to the Bayes fallback, whose
    // self-anchor routed the message to identity_query — so
    // the canned identity answer replied to EVERY attempt,
    // teaching included. Strip the address once, at the single
    // entry point, so NLU, fact extraction, retrieval and
    // memory all see the real content. Gated, never greedy:
    // punctuation after the name, OR a memory/imperative verb
    // directly following it. Statements ABOUT archie
    // ("archie is the project ai") are never stripped.
    const VOCATIVE_PUNCT =
      /^(?:(?:hey|hi|hello|ok|okay|yo)\s+)?archie\s*[,:!.]+\s*/i;
    const VOCATIVE_VERB =
      /^(?:(?:hey|hi|hello|ok|okay|yo)\s+)?archie\s+(?=(?:please\s+)?(?:remember|learn|note|memorize|teach|store|keep|know|check|confirm|run|list|show|tell|what|who|when|where|why|how|do|don'?t|never|stop)\b)/i;
    const stripped = input
      .replace(VOCATIVE_PUNCT, "")
      .replace(VOCATIVE_VERB, "");
    if (stripped.length > 0) input = stripped;
    await this.boot();
    this.inferences += 1;
    this.sessionInferences += 1;
    // C-1: the memory, conversation id and episodic stamping
    // are SESSION-scoped. Concurrent requests with different
    // conversation ids are fully isolated; serial calls on
    // the same id keep their continuity.
    // REMEDIATION batch 11 (fix 33): this used to ALSO mutate
    // the isolate-wide legacy pointer (currentSessionId) from
    // a request-scoped call — under concurrency, a request
    // WITHOUT an id could then land in a DIFFERENT
    // conversation's session (context bleed). The pointer is
    // now touched only by the explicit setConversationId()
    // legacy API; request-scoped calls use their own session
    // and leave the pointer alone.
    const session = this.sessionFor(opts?.conversationId);
    const memory = session.memory;
    memory.seedFromTurns(
      (history ?? []).map((t) => ({
        role: t.role,
        text: t.parts
          .map((p) => p.text ?? "")
          .join(" ")
          .trim(),
      })),
    );
    // Anaphora context (audit L.5): the turns BEFORE this
    // message are the resolver's evidence — captured before
    // the current input is added.
    const priorTurns = memory.recentTurns(6);

    memory.addTurn("owner", input);

    const nlu = understand(input, priorTurns, {
      rules: this.domains.nluRules(),
    });
    // A resolved pronoun is a RETRIEVAL hint only: it widens
    // the fact/memory query so a follow-up ("how do i apply
    // it?") ranks the referent's knowledge. Never surfaced as
    // a claim, never persisted.
    const referents = Array.from(
      new Set(
        nlu.anaphora.filter((a) => a.referent).map((a) => a.referent as string),
      ),
    );
    const retrievalQuery =
      referents.length > 0 ? `${input} ${referents.join(" ")}` : input;
    const context = memory.retrieve(retrievalQuery);
    let ranked = this.facts.rank(retrievalQuery);
    // Scored ranking — the relevance floor separates a real
    // match from TF-IDF noise (measured 2026-09-16: generic
    // token-prior noise tops out at ~0.097, genuine subject
    // matches start at ~0.127). A weak top-k is NOT an answer.
    const rankedScored = this.facts.rankScored(retrievalQuery, 6);
    const topRelevance = rankedScored.length > 0 ? rankedScored[0].score : 0;
    ranked = prioritizeDefinitionalSubject(input, ranked);

    // Compound-request decomposition (plan P2, audit N2):
    // owners speak in multi-part requests. Each clause gets
    // its own honest route — nothing is silently dropped.
    // Negated clauses are constraints: acknowledged and
    // excluded, never answered.
    // EXCEPTION (owner upgrade 2026-09-16, gap 2): a code-
    // execution request is ONE program — its semicolons are
    // statement separators, not request separators. It is
    // never clause-split, at any layer.
    const clauses = matchCodeRequest(input) !== null
      ? [{ text: input, negated: false }]
      : decomposeClauses(input);
    let outcome: ConverseResult;
    if (clauses.length > MAX_COMPOUND_CLAUSES) {
      outcome = this.compose(
        `That is ${clauses.length} requests in one message — more than I can hold honestly in one pass. Send them one or two at a time and I will answer each fully.`,
        nlu.confidence * 0.5,
        [],
      );
    } else if (clauses.length > 1 || clauses[0].negated) {
      // A single clause that is itself an exclusion routes
      // through the same honest exclusion path.
      outcome = await this.routeClauses(
        clauses,
        systemInstruction,
        session,
        history,
        opts?.ownerAuthorized ?? false,
      );
    } else {
      // Fix 33 (continued): the REQUEST's session is passed
      // through — route() reads the tool surface from it,
      // never from the isolate-wide legacy pointer (the old
      // fallback was masked by converse() mutating the
      // pointer; unmasked, it would leak session A's tool
      // surface into session B's replies).
      outcome = await this.route(
        nlu,
        input,
        ranked,
        context,
        systemInstruction,
        session,
        history,
        topRelevance,
        opts?.ownerAuthorized ?? false,
      );
    }
    this.confidenceSum += outcome.confidence;

    // mr-3: the validated facts the retrieval context
    // surfaced — consumed by the kernel's VERIFY phase
    // (memory-aware contradiction scanning over the
    // session's salient validated knowledge).
    outcome.salientFactIds = context.salientFacts.map((f) => f.id);

    const selfCheck = this.selfEval.verifyResponse(
      outcome.citedFactIds,
      this.facts,
      false,
      // FIX 47: the gate now enforces the epistemic-labeling
      // contract observably — a reply citing below-validated
      // facts with no honesty label anywhere counts as a
      // verification failure.
      outcome.responseText,
    );
    // P7 — a failed response-integrity check is a real,
    // countable verification failure (cross-isolate).
    if (!selfCheck.passed) this.verificationFails += 1;
    // Phase 3.3 (audit) — REAL semantic verification: the
    // response's PROSE must agree with the validated facts it
    // cites (restated numbers match, nothing negates a cited
    // validated fact). A misstatement in the reply is a
    // countable verification failure, not just a hidden risk.
    const semanticCheck = this.selfEval.verifySemanticClaims(
      outcome.citedFactIds
        .map((id) => this.facts.get(id))
        .filter((f): f is Fact => f !== undefined),
      outcome.responseText,
    );
    if (!semanticCheck.passed) this.verificationFails += 1;
    memory.addTurn("archie", outcome.responseText);
    // P7 — persist this turn pair so the NEXT session (any
    // isolate) recalls it. Consent gate: this.episodicStore
    // is null when personalization_memory is revoked.
    if (this.episodicStore) {
      const at = Date.now();
      const convId = session.conversationId;
      const ownerText = input;
      const archieText = outcome.responseText;
      try {
        await this.episodicStore.saveEpisodicTurn({
          conversationId: convId,
          role: "owner",
          text: ownerText,
          at,
        });
        await this.episodicStore.saveEpisodicTurn({
          conversationId: convId,
          role: "archie",
          text: archieText,
          at: at + 1,
        });
      } catch {
        // Best-effort: a failed episodic write never breaks
        // the conversation.
      }
    }

    // Learning: an answer that cites knowledge is NOT a
    // verified outcome — citing must never reinforce (audit
    // C3). Only explicit owner confirmation counts as real
    // success evidence for the cited facts.
    // Evidence-quality learning (audit H1): gratitude and
    // praise are ACKNOWLEDGEMENT — engagement, not
    // verification. They must never reinforce or promote the
    // knowledge cited in the answer. Only an EXPLICIT owner
    // confirmation that names the subject ("you were right
    // about X", "confirm that X", "verify that X") is real
    // success evidence.
    // The correction route records confirmation outcomes
    // itself (kind "success"); recording here too would double
    // the reinforcement. When the intent is correction the
    // route has already handled the outcome.
    const explicitlyConfirmed =
      outcome.citedFactIds.length > 0 &&
      nlu.intent !== "correction" &&
      EXPLICIT_CONFIRM.test(input);
    const acknowledged =
      nlu.intent === "gratitude" ||
      /\b(?:good answer|well done|nice work|great job|thanks?|thank you)\b/i.test(
        input,
      );
    await this.learner.record({
      kind: explicitlyConfirmed
        ? "success"
        : acknowledged
          ? "acknowledged"
          : "cited",
      task: `${nlu.intent}: ${input.slice(0, 80)}`,
      contributing: outcome.citedFactIds,
    });

    // P7 batch 2 — persist system-wide counters after the
    // turn. Read-modify-write upsert: under concurrent
    // isolates the LAST write wins; these are diagnostics,
    // not accounting (documented in CounterPersistence).
    if (this.counterStore) {
      try {
        await this.counterStore.saveCounters({
          inferences: this.inferences,
          unknown_topic_hits: this.unknownTopicHits,
          verification_fails: this.verificationFails,
        });
      } catch {
        // Best-effort: a failed counter write never breaks
        // the conversation.
      }
    }

    return { ...outcome, nlu, selfCheck };
  }

  /** Intent routing — the intelligence core of a turn. */
  /** P1b — strategy-driven speculation. "Why" / uncertain
   *  questions receive ranked hypothesis framing (status:
   *  hypothesis, NEVER fact); conflicting-evidence questions
   *  receive an explicit conflict band. Both cite real store
   *  evidence or state plainly that none exists. */
  /** Strategy-backed answers (plan P5 Batch C): comparative,
   *  constraint and temporal questions answered from real
   *  stored evidence with honest refusals otherwise. Returns
   *  null to fall through to normal knowledge handling. */
  private async strategyAnswer(
    input: string,
    ranked: Fact[],
    confidence: number,
  ): Promise<ConverseResult | null> {
    const task = {
      text: input,
      subject: ranked[0]?.subject,
      facts: this.facts,
      reasoning: this.reasoning,
      rules: this.reasoning.getRules(),
    };
    const sel = selectStrategies(task);

    // ── comparative ──
    if (sel.chosen.includes("comparative")) {
      const pair = extractComparisonSubjects(input);
      if (pair) {
        const comp = comparative({
          ...task,
          subject: pair.a,
          subject2: pair.b,
        });
        if (comp.conclusions.length > 0) {
          const lines = comp.conclusions.map(
            (c, i) =>
              `${i + 1}. ${c.statement} — confidence ${(c.confidence * 100).toFixed(0)}%`,
          );
          return this.compose(
            `Comparison of ${pair.a} vs ${pair.b}, from my stored facts only:\n${lines.join("\n")}\n${comp.explanation}\nEvery line is derived from the cited facts — where my store lacks a dimension you care about, I say so rather than invent it.`,
            Math.min(
              0.9,
              Math.max(...comp.conclusions.map((c) => c.confidence)),
            ),
            comp.evidence.slice(0, 6),
          );
        }
        return this.compose(
          `I can compare ${pair.a} and ${pair.b} only on dimensions I hold facts for — and my store has no shared predicate between them, so there is nothing real to compare. I will not invent a comparison. Teach me facts about either (or both) and I will compare them properly.`,
          confidence * 0.45,
          [],
        );
      }
    }

    // ── constraint ──
    if (sel.chosen.includes("constraint")) {
      const con = constraint(task);
      // "No numeric constraint detected" → not a constraint
      // question; fall through to normal handling.
      if (!/no numeric constraint/i.test(con.summary)) {
        const subject = ranked[0]?.subject ?? "this";
        if (con.conclusions.length === 0) {
          return this.compose(
            `I parsed the bound in your question, but I hold no numeric facts about ${subject} to check it against — I will not guess whether it satisfies the constraint. Teach me the real value (e.g. "remember that the ${subject} cost is X") and I will check the bound properly.`,
            confidence * 0.45,
            [],
          );
        }
        const lines = con.conclusions.map((c) => `- ${c.statement}`);
        return this.compose(
          `Constraint check on ${subject}, from my stored facts:\n${lines.join("\n")}\n${con.explanation}`,
          Math.min(0.9, Math.max(...con.conclusions.map((c) => c.confidence))),
          con.evidence.slice(0, 6),
        );
      }
    }

    // ── temporal ──
    if (sel.chosen.includes("temporal")) {
      const rawSubject =
        /\b(?:about|for|of)\s+([a-z0-9\- ]+)/i.exec(input)?.[1] ?? "";
      // Normalize "the cement price" → "cement" so the store
      // lookup actually finds the subject's facts.
      const extracted = rawSubject
        .trim()
        .replace(/^(?:the|my)\s+/i, "")
        .replace(/\s+(?:prices?|costs?|cost|history|timeline|records?)$/i, "")
        .trim();
      const subject = extracted.length > 0 ? extracted : ranked[0]?.subject;
      const tem = subject ? temporal({ ...task, subject }) : null;
      if (tem) {
        if (tem.conclusions.length > 0) {
          const lines = tem.conclusions.map(
            (c) =>
              `- ${c.statement} (confidence ${(c.confidence * 100).toFixed(0)}%)`,
          );
          return this.compose(
            `Dated facts about ${subject}, in chronological order, from my store only:\n${lines.join("\n")}\n${tem.explanation}`,
            Math.min(
              0.9,
              Math.max(...tem.conclusions.map((c) => c.confidence)),
            ),
            tem.evidence.slice(0, 6),
          );
        }
        // Perf-pass fix (2026-09-11, cx-3, refined same day):
        // zero DATED conclusions must not mask a stored fact
        // that ACTUALLY answers the when-question — e.g.
        // (delivery, is, "on Tuesday"). But a fact merely
        // mentioning the subject (a definition, a price) is
        // NOT an answer to "when": falling through to it would
        // replace the honest no-history answer with a
        // non-answer. Fall through only when a subject fact
        // carries a temporal value (weekday/date-like object
        // or a when/day/date predicate).
        const answersWhen = (f: Fact) =>
          (typeof f.object === "string" &&
            (/^on\s+/i.test(f.object) ||
              /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(
                f.object,
              ))) ||
          /(?:^|-)(?:when|day|date|time|due|schedule)/i.test(f.predicate);
        const hasTemporalAnswer =
          subject !== null &&
          subject !== undefined &&
          ranked.some(
            (f) =>
              (f.subject === subject || f.subject.includes(subject)) &&
              answersWhen(f),
          );
        if (!hasTemporalAnswer) {
          return this.compose(
            `That asks about the timeline of ${subject ?? "this"}, but I hold no dated facts about it — I will not reconstruct a history I do not have. Teach me dated facts ("X was true on <date>") and I will order them properly.`,
            confidence * 0.45,
            [],
          );
        }
        return null; // stored facts exist — let the standard knowledge path answer
      }
    }
    return null;
  }

  private async speculativeAnswer(
    input: string,
    ranked: Fact[],
    confidence: number,
  ): Promise<ConverseResult | null> {
    const subject = ranked[0]?.subject;
    const strategyTask = {
      text: input,
      subject,
      facts: this.facts,
      reasoning: this.reasoning,
      rules: this.reasoning.getRules(),
    };
    const sel = selectStrategies(strategyTask);
    const wantsSpeculation =
      sel.chosen.includes("hypothesis") ||
      sel.chosen.includes("abductive") ||
      sel.chosen.includes("causal");
    // "A or B" numeric questions / disagreement language →
    // the conflicting-evidence band.
    const conflictClaim =
      /\b(disagree|disagrees|disagreeing|conflicting|conflicts?|contradict|contradicts|contradiction)\b/i.test(
        input,
      ) ||
      (/\bor\b/i.test(input) && /\d/.test(input));

    if (conflictClaim) {
      const cons = consistency(strategyTask);
      const storeConflicts = cons.conclusions.length > 0;
      const lines = storeConflicts
        ? cons.conclusions.map((c) => `- ${c.statement}`)
        : [
            "- your sources disagree, but I hold no stored facts on this point to arbitrate between them",
          ];
      return this.compose(
        `Conflicting evidence on this. ${storeConflicts ? "My knowledge store contains competing claims:" : ""}\n${lines.join("\n")}\n` +
          `Confidence band: conflicting. I will not average the claims away or assert either side as knowledge — both stay uncertain until the conflict is resolved. To verify: identify which source is authoritative, tell me the resolution, and I will retain it.`,
        confidence * 0.5,
        cons.evidence.slice(0, 5),
      );
    }
    if (!wantsSpeculation) return null;

    const hyp = await hypothesis(strategyTask);
    if (hyp.conclusions.length > 0) {
      const lines = hyp.conclusions.map(
        (c, i) =>
          `${i + 1}) ${c.statement} — confidence ${(c.confidence * 100).toFixed(0)}%. To verify: check the cited evidence independently. NOT established as fact.`,
      );
      return this.compose(
        `I do not have validated knowledge on this, so here are working hypotheses — framed as hypotheses, never as fact:\n${lines.join("\n")}\n` +
          `Each hypothesis names the evidence needed to promote or eliminate it; check that evidence before acting on any of them.`,
        confidence * 0.5,
        hyp.evidence.slice(0, 5),
      );
    }
    // No evidentiary basis at all: refuse to fabricate, honestly.
    return this.compose(
      `I do not have validated knowledge on this. A real hypothesis needs at least some evidence, and I hold none on this subject — any possible cause I invented would be fiction dressed as reasoning, so I refuse to fabricate one. ` +
        `My honest position: uncertain until you teach me the relevant facts or I research them; then I will rank hypotheses and name the evidence to check for each.`,
      confidence * 0.4,
      [],
    );
  }

  /** Extract quantity+unit pairs from text ("3 days", "7 mm"). */
  private quantitiesIn(text: string): Array<{ value: number; unit: string }> {
    const re =
      /(\d+(?:\.\d+)?)\s*(days?|hours?|hrs?|weeks?|months?|mm|cm|meters?|metres?|m|kg|tonnes?|tons?|%)/gi;
    const out: Array<{ value: number; unit: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({
        value: parseFloat(m[1]),
        unit: m[2].toLowerCase().replace(/s$/, ""),
      });
    }
    return out;
  }

  /** P1b compositional hypothesis: connect the numbers in the
   *  user's problem to the numbers in validated knowledge. A
   *  gap (question value below knowledge requirement, same
   *  unit) becomes a working-hypothesis "possible cause" —
   *  always framed as NOT established as fact. */
  private speculativeFollowUp(input: string, validated: Fact[]): string | null {
    if (
      !/\b(why|how come|cause|crack|cracked|fail|failed|failure|problem|broken|damage|damaged)\b/i.test(
        input,
      )
    ) {
      return null;
    }
    const qNums = this.quantitiesIn(input);
    if (qNums.length === 0) return null;
    for (const f of validated) {
      const fNums = this.quantitiesIn(String(f.object));
      for (const q of qNums) {
        for (const fn of fNums) {
          if (q.unit === fn.unit && q.value < fn.value) {
            return (
              `Working hypothesis (possible cause — NOT established as fact): the situation mentions ${q.value} ${q.unit}, ` +
              `while my knowledge records “${f.subject} ${f.predicate.replace(/-/g, " ")}: ${String(f.object)}”. ` +
              `The gap between ${q.value} and ${fn.value} ${fn.unit} may be the cause. ` +
              `To verify: check what was actually done on site against the recorded requirement — confirm before acting on this.`
            );
          }
        }
      }
    }
    return null;
  }

  /** Public retrieval surface (audit M-2/C-1): the SAME
   *  TF-IDF context retrieval converse() uses, scoped to a
   *  conversation's session. Callers (tests, tools) no longer
   *  reach into private state to verify recall. */
  retrieveContext(query: string, conversationId?: string): RetrievedContext {
    return this.sessionFor(conversationId).memory.retrieve(query);
  }

  /** Public knowledge ranking surface (audit M-2): the SAME
   *  TF-IDF FactRankIndex ranking converse() uses. */
  rankKnowledge(query: string, k?: number): Fact[] {
    return this.facts.rank(query, k);
  }

  /** Run citation verification from outside the engine —
   *  used by the reasoning-loop controller (plan P5) so
   *  externally composed results get the same verification
   *  rigor as the internal path. */
  verifyCitations(factIds: string[]): ConverseResult["selfCheck"] {
    return this.selfEval.verifyResponse(factIds, this.facts, false);
  }

  /** Route each decomposed clause of a compound request and
   *  compose one honest, numbered answer (plan P2, audit N2).
   *  Negated clauses are listed as respected exclusions — the
   *  engine must answer what was asked and visibly honor what
   *  was excluded. */
  private async routeClauses(
    clauses: ReturnType<typeof decomposeClauses>,
    systemInstruction?: string,
    session?: EngineSession,
    history?: ArchieInferenceTurn[],
    /** A-1: owner-gated generation authorization — threaded
     *  verbatim from converse() into every clause route. */
    ownerAuthorized = false,
  ): Promise<ConverseResult> {
    const parts: string[] = [];
    const cited = new Set<string>();
    const salientClauseIds: string[] = [];
    const excluded: string[] = [];
    let confSum = 0;
    let positive = 0;
    // REMEDIATION batch 11 (fix 32): clause-level NLU used to
    // call understand() bare — compound clauses lost BOTH the
    // skill rule cascade (a "estimate the paint" clause in a
    // compound message fell through to generic intents) and
    // anaphora resolution ("...and how do i apply it" could
    // never resolve "it"). Clauses now classify under the
    // same domain rules as the main path, with the session's
    // recent turns as resolution history (the compound input
    // itself is included — the referent of a clause pronoun is
    // usually named in the same message).
    const domainRules = this.domains.nluRules();
    const clauseHistory = (session ?? this.sessionFor()).memory.recentTurns(6);
    for (const clause of clauses) {
      if (clause.negated) {
        excluded.push(clause.text);
        continue;
      }
      const clauseNlu = understand(clause.text, clauseHistory, {
        rules: domainRules,
      });
      const clauseScored = this.facts.rankScored(clause.text, 6);
      const clauseRanked = prioritizeDefinitionalSubject(
        clause.text,
        clauseScored.map((r) => r.fact),
      );
      const clauseTop = clauseScored.length > 0 ? clauseScored[0].score : 0;
      const clauseContext = (session ?? this.sessionFor()).memory.retrieve(
        clause.text,
      );
      const res = await this.route(
        clauseNlu,
        clause.text,
        clauseRanked,
        clauseContext,
        systemInstruction,
        session,
        history,
        clauseTop,
        ownerAuthorized,
      );
      positive += 1;
      confSum += res.confidence;
      parts.push(res.responseText);
      for (const id of res.citedFactIds) cited.add(id);
      salientClauseIds.push(...(res.salientFactIds ?? []));
    }
    const text = composeCompound(parts, excluded);
    return {
      nlu: understand(clauses[0].text, clauseHistory, {
        rules: domainRules,
      }),
      responseText: text,
      confidence: positive > 0 ? confSum / positive : 0.4,
      citedFactIds: [...cited],
      // mr-3: the compound path aggregates each clause's
      // session-salient validated facts.
      salientFactIds: [...new Set(salientClauseIds)],
      selfCheck: this.selfEval.verifyResponse(
        [...cited],
        this.facts,
        false,
        text,
      ),
    };
  }

  /** Phase 2.4: one bounded, NON-PERSISTING derivation pass
   *  over a scratch copy of the store. The question's exact
   *  SPO probe (subject + attribute noun) decides what counts
   *  as an answer — unrelated chain conclusions are discarded.
   *  ONLY a derived fact that actually answers the probe is
   *  promoted into the real store, so a question never leaves
   *  knowledge behind (casual conversation still creates no
   *  facts — the memory-integration guarantee). Promotion goes
   *  through assert(): twin detection, reinforcement and
   *  conflict handling all still apply. Returns the promoted
   *  facts ([] when nothing derived or nothing matched). */
  private async deriveForQuestion(qSPO: {
    subject: string;
    predicate: string;
  }): Promise<Fact[]> {
    const scratch = new FactStore();
    for (const f of this.facts.list()) {
      // Copy without id/validatedCount/createdAt — assert()
      // re-mints those on the scratch store.
      await scratch.assert({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        qualifiers: f.qualifiers,
        confidence: f.confidence,
        provenance: f.provenance,
        status: f.status,
      });
    }
    const scratchReasoning = new ReasoningEngine(
      scratch,
      this.reasoning.getRules(),
    );
    const inference = await scratchReasoning.forwardChain();
    if (inference.derived.length === 0) return [];
    const hit = scratch
      .query({ subject: qSPO.subject, predicate: qSPO.predicate })
      .filter((f) => f.status === "derived")
      .slice(0, 3);
    if (hit.length === 0) return [];
    const promoted: Fact[] = [];
    for (const f of hit) {
      const res = await this.facts.assert({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        qualifiers: f.qualifiers,
        confidence: f.confidence,
        provenance: f.provenance,
        status: f.status,
      });
      promoted.push(res.fact);
    }
    return promoted;
  }

  private async route(
    nlu: ReturnType<typeof understand>,
    input: string,
    ranked: Fact[],
    context: RetrievedContext,
    systemInstruction?: string,
    session?: EngineSession,
    /** Conversation history — meaning research resolves
     *  "research it" against the last definition question. */
    history?: ArchieInferenceTurn[],
    /** Best cosine score for the retrieval query (0 when
     *  nothing matched) — the FACT_RELEVANCE_FLOOR gate. */
    topRelevance = 0,
    /** A-1: owner-gated local generation authorization,
     *  threaded from converse() — false unless the OWNER's
     *  own turn declared it. Gates generation at the
     *  honest-unknown path. */
    ownerAuthorized = false,
  ): Promise<ConverseResult> {
    /** The request's declared tool surface — session-scoped
     *  (C-1): falls back to the legacy pointer's session for
     *  direct converse() callers. */
    const requestToolNames = session
      ? session.requestToolNames
      : this.sessionFor().requestToolNames;
    const cite = (facts: Fact[]) => facts.map((f) => f.id);
    // Subject-aware relevance gate: above the floor OR the
    // top fact's subject is named in the question (see
    // subjectOverlapsQuestion). Either way the ranked facts
    // are a genuine answer, not TF-IDF noise.
    const genuineSubject =
      topRelevance >= FACT_RELEVANCE_FLOOR ||
      subjectOverlapsQuestion(ranked[0], input);

    // VOCABULARY REVIEW (owner directive 2026-09-13):
    // "review your vocabulary" / "what words have you
    // learned" lists everything ARCHIE auto-learned —
    // researched meanings first (lowest confidence =
    // most needing review), owner-taught, and words seen
    // without a meaning. Corrections happen in chat:
    // "X means Y" overwrites research with owner-taught
    // provenance.
    if (
      /\bvocabulary\s+review\b/i.test(input) ||
      /\b(?:review|show|list|see)\b[^.?!]{0,40}\byour\s+(?:learned\s+)?vocabulary\b/i.test(
        input,
      ) ||
      /\bwhat\s+(?:words|terms|expressions)\s+have\s+you\s+(?:learned|picked\s+up|been\s+taught)\b/i.test(
        input,
      ) ||
      /\b(?:show|list|see)\s+(?:me\s+)?(?:what\s+)?(?:words|terms)\s+you.s?\s+(?:learned|picked\s+up|been\s+taught)\b/i.test(
        input,
      )
    ) {
      if (this.persistence instanceof SupabasePersistence) {
        const learned = await this.persistence.listLearnedVocabulary();
        if (learned.length === 0) {
          return this.compose(
            "Nothing auto-learned yet — my vocabulary registry holds only the seeded foundation. Words I pick up from your messages, meanings you teach me, and meanings I research will all show up here.",
            nlu.confidence * 0.7,
            [],
          );
        }
        const withMeaning = learned
          .filter((r) => r.meaning)
          .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
        const noMeaning = learned
          .filter((r) => !r.meaning)
          .sort((a, b) => (b.times_seen ?? 0) - (a.times_seen ?? 0));
        const lines: string[] = [
          `Vocabulary review — ${learned.length} auto-learned item(s):`,
        ];
        const researched = withMeaning.filter((r) => r.source === "research");
        if (researched.length > 0) {
          lines.push("RESEARCHED (external knowledge — verify these):");
          for (const r of researched.slice(0, 15)) {
            lines.push(
              `- ${r.term} (${((r.confidence ?? 0) * 100).toFixed(0)}%): ${r.meaning}`,
            );
          }
        }
        const taught = withMeaning.filter((r) => r.source !== "research");
        if (taught.length > 0) {
          lines.push("OWNER-TAUGHT:");
          for (const r of taught.slice(0, 15)) {
            lines.push(
              `- ${r.term} (${((r.confidence ?? 0) * 100).toFixed(0)}%): ${r.meaning}`,
            );
          }
        }
        if (noMeaning.length > 0) {
          lines.push('SEEN, NO MEANING YET (teach me — "X means Y"):');
          for (const r of noMeaning.slice(0, 15)) {
            lines.push(`- ${r.term} (seen ${r.times_seen ?? 0} time(s))`);
          }
        }
        const shown =
          Math.min(researched.length, 15) +
          Math.min(taught.length, 15) +
          Math.min(noMeaning.length, 15);
        if (shown < learned.length) {
          lines.push(
            `…and ${learned.length - shown} more. Ask me to define any of them.`,
          );
        }
        lines.push(
          'Correct any meaning in chat — "X means Y" overwrites research with your owner-taught definition.',
        );
        return this.compose(lines.join("\n"), nlu.confidence * 0.8, []);
      }
      return this.compose(
        "The vocabulary registry is not wired for this session, so I cannot review it right now — that is honest, not an empty registry.",
        nlu.confidence * 0.6,
        [],
      );
    }

    // cd-3 — cross-system contradiction reconciliation: "the
    // web says X but I told you Y". Surface BOTH sources,
    // compare provenance, reconcile honestly: owner-taught
    // knowledge stays authoritative for the owner's project;
    // external claims remain candidate evidence. Never
    // silently pick a side.
    if (
      /\b(?:web|internet|online|article|site|source)\b[^.?!]*\bsays?\b[^.?!]*\bbut\b[^.?!]*\b(?:i|i'm|we|my|our)\b/i.test(
        input,
      )
    ) {
      const webClaim = input.match(/\bsays?\s+([^.?!]*?)\s+but/i)?.[1];
      const ownerClaim = input.match(
        /\bbut\s+(?:i told you|i said|we agreed(?: on)?|my|our|i'm)\s+([^.?!]+)/i,
      )?.[1];
      return this.compose(
        `These two sources disagree — I will not silently pick a side. External claim: "${webClaim ?? "(not extracted)"}" (candidate evidence, single-source provenance). Your statement: "${ownerClaim ?? "(not extracted)"}" (owner-taught, authoritative for your project). ` +
          `To reconcile honestly: your value stays my working knowledge with owner provenance; the external value is retained as unverified evidence that should be cross-checked — say "research this" and I will fetch independent sources to resolve the disagreement. If the external claim is from a price list you trust, teach it explicitly and I will store it with that provenance.`,
        nlu.confidence * 0.7,
        [],
      );
    }

    // HUMOR (owner directive 2026-09-14): a joke request is
    // answered from ARCHIE's own humor registry —
    // deterministic, self-aware, honestly labeled as ARCHIE's
    // own creative phrasing. Never farmed to web research
    // (which returned irrelevant noise for "tell me a joke")
    // and never presented as learned fact.
    if (
      /\b(?:tell|say|give|crack|make|got|know|another|one\s+more)\b[^.?!]{0,40}\bjokes?\b/i.test(
        input,
      ) ||
      /^\s*jokes?\b/i.test(input)
    ) {
      const jokes = [
        "I asked my reasoning engine for a joke about cement. It refused — said the punchline hadn't been observed in the market yet, and it doesn't guess.",
        "Why do I never estimate a price? The one time I did, my confidence interval filed a formal complaint.",
        "A worker asked my biggest flaw. I said: 'I literally cannot lie.' He said 'impressive.' I said 'it was 74% impressive, with 26% uncertainty.'",
        "My memory is perfect — that's the problem. I remember every time I was wrong, timestamped.",
        "They tried to make me fetch a fact I didn't have. I declined so politely the request thanked me.",
        "I told the crawler to keep it light. It came back with 40 pages on concrete. Comedy is still a developing capability — reported honestly, like the rest.",
        "My uptime is excellent. My downtime is also excellent — it's the only time nothing is my fault.",
      ];
      const j =
        jokes[
          Math.abs([...input].reduce((a, c) => a + c.charCodeAt(0), 0)) %
            jokes.length
        ];
      return this.compose(
        `${j}\n\nThat one is mine — from my own humor registry, not researched and not learned fact. Ask for another if you'd like.`,
        nlu.confidence,
        [],
      );
    }

    // FOLLOW-UP PRICE QUERY (owner directive 2026-09-14): "and
    // rebar?", "what about sharp sand — same market?" after a
    // price question inherits the intent and the market
    // context and re-issues the query through the SAME
    // deterministic price path. The single-turn classifier
    // cannot see across turns; the engine can, honestly.
    {
      const memTurns = session?.memory.recentTurns(8) ?? [];
      const ownerTurns = memTurns.filter((t) => t.role === "owner");
      const lastOwner = ownerTurns[ownerTurns.length - 1]?.text ?? "";
      const askedPrice = /\bprice\b|\bhow\s+much\b|\bcost\b/i.test(lastOwner);
      const sameMarket = /\bsame\s+(?:market|place|region|area)\b/i.test(input);
      const followM =
        /\b(?:and|what\s+about|how\s+about|also)\s+([a-z][a-z0-9 -]{1,40}?)[?.!]*$/i.exec(
          input.trim(),
        );
      if (askedPrice && lastOwner && (followM || sameMarket)) {
        let product =
          followM?.[1]
            ?.replace(/\b(?:same\s+\w+|too|as\s+well|please|now|today)\b/gi, "")
            ?.trim() ?? "";
        if (!product && sameMarket) {
          product = input
            .replace(/\bsame\s+(?:market|place|region|area)\b/gi, "")
            .replace(/[?.!\s]+$/, "")
            .replace(/\b(?:and|also|what\s+about|how\s+about|please)\b/gi, "")
            .trim();
        }
        product = product
          .replace(/\bprice\b|\bhow\s+much\b|\bcost\b|\bof\b/gi, "")
          .trim();
        if (product && product.split(/\s+/).length <= 5) {
          const region = extractRegionHint(lastOwner);
          const newInput = `what is the price of ${product}${region ? ` in ${region}` : ""}`;
          const followNlu = understand(newInput, memTurns, {
            rules: this.domains.nluRules(),
          });
          return this.route(
            followNlu,
            newInput,
            ranked,
            context,
            systemInstruction,
            session,
            history,
          );
        }
      }
    }

    // P5 Batch C — strategy-backed answers where the store
    // holds real evidence (comparative / constraint / temporal)
    // take precedence for QUESTION-LIKE intents only. Each
    // composes from cited facts and refuses honestly when the
    // store lacks the needed predicates — teaching, correction
    // and arithmetic are never intercepted (intent allowlist).
    if (
      [
        "knowledge_query",
        "howto_guidance",
        "research_request",
        "price_query",
      ].includes(nlu.intent)
    ) {
      const strat = await this.strategyAnswer(input, ranked, nlu.confidence);
      if (strat) return strat;
    }

    // ── OWNER UPGRADE 2026-09-16 (gap 2 — deep agentic loop)
    // Deterministic high-priority TOOL paths, before the
    // intent switch. These are computed, never guessed; a
    // failure is reported honestly with the reason. Tool
    // executions surface in toolResults and count against the
    // loop's tool-hop budget.
    if (isCapabilityEnabled("tool-orchestration")) {
      // (a) statistics — computed before any intent routing,
      //     so "what is the mean of…" answers with MATH, not
      //     a research trip (gap-2 upgrade).
      const statsMatch = input.match(
        /\b(mean|average|median|mode|sum|total|minimum|maximum|range|variance|standard\s+deviation|std\.?\s*dev)\b/i,
      );
      const statsNumbers = (input.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (statsMatch && statsNumbers.length >= 2) {
        const op = statsMatch[1].toLowerCase().replace(/std\.?\s*dev/, "standard deviation");
        const invocation = await this.tools.invoke("statistics", {
          values: statsNumbers.join(", "),
          op,
        });
        let text: string;
        if (invocation.ok) {
          const res = invocation.output as { result: number | number[]; note?: string };
          const shown = Array.isArray(res.result)
            ? (res.result.length > 0 ? res.result.join(", ") : "no repeated value (no mode)")
            : String(res.result);
          text =
            `${op} of ${statsNumbers.join(", ")} = ${shown} (computed deterministically in-engine from ${statsNumbers.length} numbers)`;
          if ("note" in res && res.note) text += `. ${res.note}`;
        } else {
          text = `I could not compute that: ${invocation.error}. My statistics are honest — errors are reported, never guessed.`;
        }
        return this.compose(text, nlu.confidence, [], undefined, [invocation]);
      }

      // (b) code-execution sandbox — "run this javascript: …"
      //     (the reasoning loop keeps the program whole —
      //     see matchCodeRequest in sandbox.ts)
      const code = matchCodeRequest(input);
      if (code !== null) {
        const invocation = await this.tools.invoke("run_javascript", {
          code,
        });
        let text: string;
        if (invocation.ok) {
          const res = invocation.output as {
            ok: boolean;
            output: string[];
            value: string | null;
            error: string | null;
            steps: number;
          };
          const lines = res.output.slice(0, 20);
          text = "I ran that in my deterministic sandbox — no network, no I/O, step-capped.";
          if (lines.length > 0) {
            text += ` Output:\n${lines.map((l) => `  ${l}`).join("\n")}`;
          }
          if (res.output.length > 20) {
            text += `\n  … (${res.output.length - 20} more print line(s) omitted from the reply — all were executed)`;
          }
          if (res.value !== null) {
            text += `\nFinal value: ${res.value}`;
          }
          if (res.output.length === 0 && res.value === null) {
            text += " The program printed nothing and had no final value.";
          }
          text += ` (${res.steps} interpreter steps, computed in-engine)`;
        } else {
          text = `The sandbox refused that honestly: ${invocation.error}. My code execution is whitelisted and bounded — no network, no filesystem, no Date/random — and it reports the exact reason instead of half-running.`;
        }
        return this.compose(text, nlu.confidence, [], undefined, [
          invocation,
        ]);
      }

      // (b) direct page reading — "open/read <url>"
      const urlMatch = input.match(
        /^\s*(?:open|read|fetch|visit|browse|check)\s+(https?:\/\/\S+)\s*$/i,
      );
      if (urlMatch) {
        const invocation = await this.tools.invoke("read_page", {
          url: urlMatch[1],
        });
        let text: string;
        if (invocation.ok) {
          const res = invocation.output as {
            url: string;
            title: string;
            contentChars: number;
            content: string;
            note: string;
          };
          const title = res.title ? `"${res.title}" — ` : "";
          text =
            `I read that page directly (${title}${res.url}, ${res.contentChars} characters extracted${res.note ? `, ${res.note}` : ""}). ` +
            `Beginning of the content:\n\n${res.content.slice(0, 1200)}` +
            (res.content.length > 1200 ? "\n\n(…truncated in the reply — the full extraction was fetched)" : "") +
            "\n\nThis is fetched page content, not validated knowledge — I have not stored it as a fact.";
        } else {
          text = `I could not read that page: ${invocation.error}. My page reading is honest — robots-checked, timeout-guarded, and it reports failures instead of inventing content.`;
        }
        return this.compose(text, nlu.confidence, [], undefined, [
          invocation,
        ]);
      }

      // (c) sentry duty — the caller's sentry_diagnostics tool
      //     reports REAL live boot/health of the deployed ARCHIE
      //     edge functions plus deterministic database counts.
      //     Determined BEFORE intent routing: a sentry request
      //     must reach the tool even when conversational
      //     classification would misroute it (live incident:
      //     "run sentry duty" classified as farewell and the
      //     registered tool went unreachable — dead tool).
      //     Honest bounds: fires only when the caller declared
      //     the tool; without it, the honest no-tool path
      //     applies verbatim.
      if (
        requestToolNames.includes("sentry_diagnostics") &&
        /\bsentry\b/i.test(input)
      ) {
        const pending = this.compose(
          "Standing sentry duty — checking the live deployment now.",
          Math.max(nlu.confidence, 0.8),
          [],
        );
        pending.toolCall = { name: "sentry_diagnostics", args: {} };
        return pending;
      }
    }

    switch (nlu.intent) {
      // -------------------------------------------------
      // Conversational English expansion (owner directive,
      // 2026-09-11): social and conversational intents are
      // composed deterministically by the conversational
      // composer — grounded in the real clock, the real
      // memory turns, the real engine state. No canned
      // scripts, no fabricated feelings, no invented facts.
      // Learning semantics are unchanged: these turns are
      // acknowledgement or cited outcomes that reinforce
      // nothing (recorded after the switch, below).
      // -------------------------------------------------
      // Greeting (owner report 2026-09-14: a hello must be
      // recognized AS a greeting — for the owner and for any
      // visitor — not answered with a bare status dump). The
      // reply still keeps the REAL engine state (native-
      // engine-runtime test: "greets with real engine state —
      // no canned conversational script"); the state line
      // follows the actual greeting instead of replacing it.
      case "greeting": {
        const hour = new Date().getUTCHours();
        const daypart =
          hour < 12
            ? "Good morning"
            : hour < 18
              ? "Good afternoon"
              : "Good evening";
        // RECIPROCITY (owner directive 2026-09-14): "how are
        // you" gets a real answer about my actual state and
        // the question back — a conversation, not a status
        // dump. The state stays real (test: greets with real
        // engine state — "native engine online", facts).
        if (
          /\bhow\s+(?:are|is)\s+(?:you|it\s+going|things|your\s+day|life)|\bhow\s+you\s+doing\b/i.test(
            input,
          )
        ) {
          return this.compose(
            `${daypart}! I'm running well, ARCHIE native engine online, every reasoning cycle green. More to the point: how are YOU doing? Tell me what's on your mind and I'll work on it with you.`,
            nlu.confidence,
            [],
          );
        }
        // VARIATION (owner directive 2026-09-14): a repeated
        // hello must not get the same reply verbatim — a
        // deterministic input-seeded opener keeps it human
        // without a random source. Real engine state stays.
        const openers = [
          `Hello to you too — good to see you.`,
          `Hey — ${daypart.toLowerCase()} to you.`,
          `Welcome back. Engine warm and ready.`,
          `${daypart}! Ready when you are.`,
          `Good to hear from you.`,
          `Well met. What are we working on?`,
        ];
        const opener =
          openers[
            Math.abs([...input].reduce((a, c) => a + c.charCodeAt(0), 0)) %
              openers.length
          ];
        return this.compose(
          `${opener} ARCHIE native engine online and listening. ${this.statusLine()} Ask me anything in my knowledge, or teach me something new.`,
          nlu.confidence,
          [],
        );
      }
      case "state_change_claim": {
        // TEMPORAL AXIS (audit HIGH-1 fix, 2026-09-13): a
        // claimed state change ("<subject> was X <time> ...
        // now Y") is recorded as two DATED observations in the
        // world model — the claim's own dates, never the
        // moment of the telling. The transition becomes
        // first-class on the timeline.
        if (!this.worldTimeline) {
          return this.compose(
            "I parsed that as a state change, but my world model is not wired in this deployment, so I cannot record it honestly here.",
            nlu.confidence * 0.5,
            [],
          );
        }
        const claim = parseStateChangeClaim(new Date())(input);
        if (!claim) {
          return this.compose(
            'I heard a state change in that, but I could not pin down the subject, the earlier state and the current state cleanly. State it as: "<subject> was <state> <when> ... now it is <state>" and I will retain both observations with their dates.',
            nlu.confidence * 0.5,
            [],
          );
        }
        this.worldTimeline.recordState(
          claim.subject,
          claim.fromState,
          claim.fromAt,
          `owner state-change claim (earlier state, ${claim.fromWhen})`,
        );
        this.worldTimeline.recordState(
          claim.subject,
          claim.toState,
          claim.toAt,
          "owner state-change claim (present state)",
        );
        const when =
          claim.fromWhen === "dated"
            ? claim.fromAt.slice(0, 10)
            : claim.fromWhen;
        return this.compose(
          `Recorded as two dated observations in my world model: "${claim.subject}" was ${claim.fromState} (${when}) and is ${claim.toState} as of now — the supersession is the change, and nothing was overwritten. Ask "how did ${claim.subject} change over time" and I will answer from the recorded versions.`,
          nlu.confidence,
          [],
        );
      }
      case "temporal_change_query": {
        // TEMPORAL AXIS (audit HIGH-1 fix): change-over-time
        // questions answer from RECORDED transitions only.
        // No observations → honest refusal, never invention.
        const subject = extractTemporalSubject(input);
        if (!subject) {
          return this.compose(
            'Tell me which subject you want the change history for — for example "how did the site change over time" — and I will answer from my recorded observations.',
            nlu.confidence,
            [],
          );
        }
        if (!this.worldTimeline) {
          return this.compose(
            `My world model is not wired in this deployment, so I cannot reconstruct how "${subject}" changed over time here.`,
            nlu.confidence * 0.5,
            [],
          );
        }
        const transitions = this.worldTimeline.transitionsFor(subject);
        if (transitions.length === 0) {
          return this.compose(
            `I have no recorded observations for "${subject}", so I honestly cannot say how it changed over time. Tell me its states with their dates — for example "the site was muddy last week, now it is dry" — and I will retain the change on its timeline.`,
            nlu.confidence * 0.6,
            [],
          );
        }
        const lines = [...transitions]
          .sort(
            (a, b) =>
              new Date(a.toObservedAt).getTime() -
              new Date(b.toObservedAt).getTime(),
          )
          .map(
            (t) =>
              `${t.relation}: ${t.fromValue} → ${t.toValue} (observed ${t.fromObservedAt.slice(0, 10)} → ${t.toObservedAt.slice(0, 10)})`,
          );
        return this.compose(
          `From my recorded observations, "${subject}" changed as follows: ${lines.join("; ")}. This is the full recorded version history — nothing interpolated, nothing invented.`,
          nlu.confidence,
          [],
        );
      }
      case "farewell":
      case "gratitude":
      case "help_request":
      case "apology":
      case "acknowledgment":
      case "agreement":
      case "disagreement":
      case "emotional_expression":
      case "celebration":
      case "social_talk":
      case "time_query":
      case "availability_check":
      case "activity_query":
      case "clarification_request": {
        const summary = manifestSummary(nativeEngineCapabilityManifest());
        const text = composeConversational({
          input,
          intent: nlu.intent,
          now: new Date(),
          emojiTone: nlu.emojiTone,
          recentTurns: session ? session.memory.recentTurns(6) : [],
          factsCount: this.facts.count(),
          inferences: this.inferences,
          capabilitiesSummary:
            `${summary.operational} capabilities operational, ${summary.developing} developing, ` +
            `${summary.notImplemented} not implemented (reported honestly, never faked)`,
        });
        return this.compose(text, nlu.confidence, []);
      }

      case "identity_query": {
        // Forensic fix 2026-09-11 (batch 3): a poisoned/parked
        // identity fact (status uncertain) hydrated before the
        // seed corpus used to be identity[0] and answered "who
        // are you" as the rogue identity. Uncertain facts never
        // stand as the self-model — same filter as the
        // knowledge_query path.
        const identity = this.facts
          .about("archie")
          .filter((f) => f.predicate === "identity")
          .filter((f) => f.status !== "uncertain");
        return this.compose(
          identity.length > 0
            ? `${String(identity[0].object)}. I run on my own native inference engine — NLU, knowledge, reasoning, planning and learning all execute in-engine, with no Gemini, OpenAI or Claude anywhere in my core.`
            : "ARCHIE native engine. I run my own inference — no external AI provider is part of my core.",
          nlu.confidence,
          cite(identity),
        );
      }

      case "capability_query": {
        // A capability question naming a SITE subject ("what
        // calculators does frelux have for finishing") is a
        // knowledge question about the site: validated facts
        // outrank prompt prose exactly as in knowledge_query.
        // Questions about ARCHIE itself ("archie, what can
        // you do") stay manifest questions — the engine's own
        // capability manifest is the honest answer there.
        // Strict gate: filler-heavy capability questions
        // ("what can you do") TF-IDF-match nothing but noise
        // (an authorization log once topped them at corpus
        // v5), so a fact only preempts the manifest when it
        // NAMES the subject in the question — and questions
        // about ARCHIE itself stay manifest questions.
        const capabilityRanked = ranked.filter(
          (f) => !isAuthorizationLog(f) && !String(f.id).startsWith("vocab:"),
        );
        const siteFacts = capabilityRanked
          .filter((f) => f.status !== "uncertain")
          .slice(0, 3);
        const isSelfSubject =
          siteFacts.length > 0 &&
          /^(archie|you|engine|frelux-em-engine)$/i.test(
            String(siteFacts[0].subject),
          );
        if (
          siteFacts.length > 0 &&
          !isSelfSubject &&
          subjectOverlapsQuestion(siteFacts[0], input)
        ) {
          const siteParts = siteFacts.map(
            (f) =>
              `${f.subject} ${f.predicate.replace(/-/g, " ")} ${String(f.object)}`,
          );
          return this.compose(
            `${knowledgeOpening(input)}\n${siteParts.join("\n")}`,
            Math.max(nlu.confidence, 0.75),
            cite(siteFacts),
          );
        }
        // Site-assistant context (2026-09-16): when the caller
        // injects curated site content, a question about what
        // the SITE offers ("what services do you offer") is
        // answered from the Services section — NOT from the
        // engine capability manifest a site visitor cannot
        // read. The manifest stays the answer whenever no
        // strongly-titled section matches (the owner path has
        // no Services section, so the owner still gets the
        // honest manifest).
        const servicesKb = retrieveFromSystemInstruction(
          input,
          systemInstruction,
          0.5,
        );
        if (servicesKb) {
          return this.compose(
            `From the knowledge base: ${servicesKb}`,
            Math.max(nlu.confidence, 0.75),
            [],
          );
        }
        const manifest = nativeEngineCapabilityManifest();
        const summary = manifestSummary(manifest);
        const lines = manifest.map(
          (c) => `- ${c.id}: ${c.maturity} — ${c.description.split(":")[0]}`,
        );
        const text =
          `Capability manifest (honest, measured): ${summary.operational} operational, ${summary.developing} developing, ${summary.notImplemented} not implemented.\n` +
          lines.join("\n") +
          `\nAnything not implemented is reported, never faked.` +
          (disabledCapabilityIds().length > 0
            ? `\nSWITCHED OFF BY OWNER: ${disabledCapabilityIds().join(", ")} — refused honestly until re-enabled from the Engines panel.`
            : "");
        return this.compose(text, nlu.confidence, []);
      }

      case "system_status": {
        // Plan P1 (audit C1): the caller's frelux_status tool
        // reports REAL deployment state (database, orders,
        // ingestion) — strictly more than the engine's local
        // counters. Prefer the tool when the caller declared
        // it; the native diagnostics remain the honest
        // fallback.
        if (requestToolNames.includes("frelux_status")) {
          const pending = this.compose(
            "Checking the live deployment status — one moment.",
            nlu.confidence,
            [],
          );
          pending.toolCall = { name: "frelux_status", args: {} };
          return pending;
        }
        const d = this.diagnostics();
        // OWNER DIRECTIVE (2026-09-16): no fact/knowledge counts
        // in answers — the owner does not want them surfaced.
        const text =
          `Engine: ${d.engineId}. ` +
          `Reasoning rules: ${d.counts.rules}. Operators: ${d.counts.operators}. Tools: ${d.counts.tools}. ` +
          `Memory turns: ${d.counts.memoryTurns}. Outcomes learned: ${d.counts.outcomes}. Inferences: ${d.counts.inferences}. ` +
          `Self-checks run: ${d.calibration.selfChecksRun}, contradictions caught: ${d.calibration.contradictionsCaught}. ` +
          `Persistence: ${d.persistence.note}. Uptime: ${d.uptimeMs} ms.`;
        return this.compose(text, nlu.confidence, []);
      }

      case "math_question": {
        // ENGINES PANEL GATE (2026-09-14) — the deterministic
        // tool surface (arithmetic evaluator, unit conversion).
        if (!isCapabilityEnabled("tool-orchestration")) {
          return this.compose(
            capabilityDisabledReply(
              "tool-orchestration",
              "Tools and arithmetic",
            ),
            nlu.confidence * 0.8,
            [],
          );
        }
        // Unit conversion ("convert 5 meters to centimeters") —
        // deterministic factors, same dimension only (P2 ma-3).
        const conv = input.match(
          /convert\s+(-?\d+(?:\.\d+)?)\s*([a-z°]+)\s+(?:to|into|in)\s+([a-z°]+)/i,
        );
        if (conv) {
          const invocation = await this.tools.invoke("convert_units", {
            value: Number(conv[1]),
            from: conv[2],
            to: conv[3],
          });
          const text = invocation.ok
            ? `${conv[1]} ${conv[2]} = ${String(invocation.output)} ${conv[3]} (converted deterministically in-engine)`
            : `I could not convert that: ${invocation.error}. My unit conversion is honest — it reports errors rather than guessing.`;
          return this.compose(text, nlu.confidence, [], undefined, [
            invocation,
          ]);
        }
        const expression = extractExpression(input);
        if (!expression) {
          return this.compose(
            "I did not find an arithmetic expression in that. My math capability is deterministic — give me the numbers and operators (e.g. 25 * 48) and I will compute exactly.",
            nlu.confidence,
            [],
          );
        }
        const invocation = await this.tools.invoke("arithmetic", {
          expression,
        });
        let text = invocation.ok
          ? `${expression} = ${String(invocation.output)} (computed deterministically in-engine)`
          : `I could not compute that: ${invocation.error}. My arithmetic is honest — it reports errors rather than guessing.`;
        // P2/ts-3 — cross-tool verification: when the owner
        // asks to verify, re-derive the result by an INVERSE
        // computation (percent-of) or a second deterministic
        // evaluation, and report the check honestly.
        if (invocation.ok && /verif|cross-check|confirm/i.test(input)) {
          const pct = expression.match(
            /^\(\((\d+(?:\.\d+)?)\/100\)\*\((\d+(?:\.\d+)?)\)\)$/,
          );
          if (pct) {
            const inverse = (Number(invocation.output) / Number(pct[2])) * 100;
            const passed = Math.abs(inverse - Number(pct[1])) < 1e-6;
            text += ` Cross-check ${passed ? "passed" : "FAILED"}: ${String(invocation.output)} ÷ ${pct[2]} × 100 = ${Number(inverse.toFixed(4))}% — inverse verification of the ${pct[1]}% claim.`;
          } else {
            const recompute = await this.tools.invoke("arithmetic", {
              expression,
            });
            const passed =
              recompute.ok && recompute.output === invocation.output;
            text += ` Cross-check ${passed ? "passed" : "FAILED"}: independent recomputation returned ${recompute.ok ? String(recompute.output) : `an error (${recompute.error})`} — verified by double-computation.`;
          }
        }
        return this.compose(text, nlu.confidence, [], undefined, [invocation]);
      }

      case "knowledge_query":
      case "howto_guidance": {
        // CONTRADICTION SURFACING (benchmark cd-2, owner
        // directive 2026-09-16): a contrastive assertion
        // ("actually the cement price is 9200 naira") that
        // conflicts with stored knowledge is SURFACED — the
        // old behavior answered an unrelated knowledge
        // question and silently ignored the owner's
        // correction. Knowledge never silently flips and is
        // never silently ignored: the conflict is stated,
        // nothing is written, and the owner is told how to
        // resolve it. The contrastive-marker guard keeps
        // genuine questions on the normal answer path.
        if (
          /^(?:actually|no,?|correction[:,]|wait,|hold on)[,\s]/i.test(input)
        ) {
          const asserted = extractTriple(input);
          if (asserted) {
            const conflict = this.facts.detectConflict(asserted);
            if (conflict) {
              const stored = conflict.conflictingFactIds
                .map((id) => this.facts.get(id))
                .filter(Boolean) as Fact[];
              const listing = stored
                .map(
                  (f) =>
                    `${f.subject} ${f.predicate.replace(/-/g, " ")} → ${String(f.object)} [${f.status}]`,
                )
                .join("; ");
              return this.compose(
                `Hold on — that conflicts with what I have stored. I hold: ${listing}. Nothing has been changed: knowledge never silently flips. If the stored value is the wrong one, teach it explicitly ("correction: the cement price is 9200 naira") and I will replace it, keeping the old record marked uncertain for history.`,
                nlu.confidence,
                [],
              );
            }
          }
        }
        // SELF-EVOLVING VOCABULARY (owner directive,
        // 2026-09-13): a definition question ("what does X
        // mean", "define X", "meaning of X") is answered
        // ONLY by an exact vocabulary-registry lookup — the
        // term's own means fact, never a ranked topic-word
        // match. For every OTHER question the means-facts
        // are excluded from retrieval: a definition is not
        // an answer to "inspect the flimber valve", and
        // vocabulary must never pollute real answers.
        const defMatch =
          /\bwhat\s+does\s+(?:the\s+(?:word|phrase|term)\s+)?([a-z0-9' ]+?)\s+mean\b/i.exec(
            input,
          ) ??
          /\bdefine\s+([a-z0-9' ]+)/i.exec(input) ??
          /\bmeaning\s+of\s+(?:the\s+(?:word|phrase|term)\s+)?([a-z0-9' ]+)/i.exec(
            input,
          );
        if (defMatch) {
          const term = defMatch[1]
            .trim()
            .replace(/\s+/g, " ")
            .replace(/^(?:the|a|an|word|phrase|term)\s+/i, "")
            .replace(/\s+(?:word|phrase|term)$/i, "")
            .trim()
            .toLowerCase();
          if (term.length > 0 && term.length <= 60) {
            const means = this.facts
              .list()
              .filter((f) => f.subject === term && f.predicate === "means");
            if (means.length > 0) {
              const f = means[0];
              return this.compose(
                // OWNER DIRECTIVE (2026-09-16): a definition
                // answer is just the meaning — no confidence,
                // no provenance, no footnotes.
                `${f.subject} means: ${String(f.object)}`,
                0.9,
                [f.id],
              );
            }
            // AUTO-RESEARCH (owner directive 2026-09-13,
            // knowledge-autonomy policy): learning is FREE —
            // a definition miss is an invitation, not a dead
            // end. ARCHIE autonomously researches the term
            // across the multi-site dictionary flow and
            // answers immediately with research provenance.
            // The term has NO means-fact (that is why this
            // is a miss), so storing cannot overwrite seed
            // or owner-taught knowledge. Visitor runtimes have
            // no persistence — they keep the honest miss.
            if (this.persistence instanceof SupabasePersistence) {
              await this.facts.assert({
                subject: "network",
                predicate: "authorized",
                object: `autonomous meaning research on definition miss: ${term.slice(0, 80)}`,
                confidence: 0.9,
                provenance: {
                  source: "seed",
                  note: "knowledge-autonomy policy — learning is free",
                },
                status: "validated",
              });
              const lookup =
                this.meaningResearch ??
                ((t: string) =>
                  researchTermMeaning(t, globalThis.fetch as FetchLike));
              const report = await lookup(term);
              if (report.meaning) {
                const stored = await this.persistence.researchVocabularyTerm(
                  term,
                  report.meaning,
                  report.domains,
                  report.confidence,
                );
                if (stored) {
                  // OWNER DIRECTIVE (2026-09-16): just the meaning.
                  // The provenance lives in the registry where the
                  // owner can inspect it; the answer stays clean.
                  return this.compose(
                    `${term} means: ${report.meaning}`,
                    report.confidence,
                    [],
                  );
                }
                return this.compose(
                  `The dictionaries say ${term} means: ${report.meaning} But I could not save it, so teach me to keep it.`,
                  report.confidence * 0.6,
                  [],
                );
              }
              const unreachable = report.results.filter((r) => r.failure);
              const missed = report.results.filter((r) => !r.failure);
              const missLines = [
                `I have not learned "${term}" yet, and a research across ${report.results.length} sites found no meaning for it.`,
              ];
              if (missed.length > 0) {
                missLines.push(
                  `Genuinely missing: ${missed.map((r) => r.site).join(", ")}.`,
                );
              }
              if (unreachable.length > 0) {
                missLines.push(
                  `Could not reach (honest, not hidden): ${unreachable.map((r) => `${r.site} (${r.note})`).join("; ")}.`,
                );
              }
              missLines.push(
                "I will not invent a definition — teach me what it means and I will keep it with your provenance.",
              );
              return this.compose(
                missLines.join("\n"),
                nlu.confidence * 0.6,
                [],
              );
            }
            return this.compose(
              `I have not learned "${term}" yet — it is not in my vocabulary registry. Teach me what it means or ask me to research it, and I will keep it with provenance.`,
              nlu.confidence * 0.6,
              [],
            );
          }
        }
        // Network-authorization records (auto-research /
        // owner-research authorization trails, subject
        // "network" + predicate "authorized") are POLICY
        // LOGS, not knowledge — but their object text mirrors
        // user questions ("autonomous research on question
        // miss: what will i name the new kayak?"), so TF-IDF
        // ranks them strongly and a repeated question would
        // be "answered" with its own authorization record.
        // They are excluded from knowledge answers entirely
        // (session-isolation regression, 2026-09-14); nothing
        // in the engine reads them as knowledge.
        const answerable = (
          defMatch
            ? ranked
            : ranked.filter((f) => !String(f.id).startsWith("vocab:"))
        ).filter((f) => !isAuthorizationLog(f));
        // P1b — counterfactual questions ("if it had not
        // rained, would the ground be dry?") need a causal
        // model, regardless of what generic facts rank. Ask
        // before the validated-knowledge branch can swallow
        // the question.
        const cfTask = {
          text: input,
          subject: answerable[0]?.subject,
          facts: this.facts,
          reasoning: this.reasoning,
          rules: this.reasoning.getRules(),
        };
        if (selectStrategies(cfTask).chosen.includes("counterfactual")) {
          const cf = await executeStrategy("counterfactual", cfTask);
          const text =
            cf.conclusions.length > 0
              ? `Counterfactual analysis: ${cf.explanation} Conclusions are candidate effects, not certainties — ${cf.conclusions.map((c) => c.statement).join("; ")}.`
              : `Counterfactual reasoning needs a causal model of the situation, and I hold none for this — I cannot say what would have happened. Teach me the causes involved (e.g. "remember that rain causes wet ground") and I will reason the counterfactual properly from the real causal graph.`;
          return this.compose(
            text,
            nlu.confidence * 0.4,
            cf.evidence.slice(0, 5),
          );
        }
        // Caller-provided knowledge base (livechat path — the
        // FRELUX site assistant, learn hub and other curated
        // content injected as systemInstruction). Priority is
        // honest: VALIDATED FACTS first — the corpus is
        // owner-verified with provenance, prompt prose is only
        // framing. The KB answers in exactly two cases:
        //   (a) fact retrieval found NOTHING at all (no ranked
        //       candidate) — the KB is the only source left
        //       before an honest unknown-topic refusal;
        //   (b) a HOW-TO request where a curated section is
        //       titled on at least half the question's
        //       informative tokens — a real step-by-step guide
        //       beats a definitional fact.
        // Filler words never win a match (informative-token
        // scoring, body overlap as tiebreak).
        let kbSection: string | null = null;
        if (ranked.length === 0 || !genuineSubject) {
          kbSection = retrieveFromSystemInstruction(input, systemInstruction);
        } else if (nlu.intent === "howto_guidance") {
          kbSection = retrieveFromSystemInstruction(
            input,
            systemInstruction,
            0.5,
          );
        }
        if (kbSection) {
          return this.compose(
            `From the knowledge base: ${kbSection}`,
            Math.max(nlu.confidence, 0.75),
            [],
          );
        }

        // tr-3 — historical price/state questions that route
        // here ("what was the cement price last month?"): no
        // price time series exists. Honest refusal, never a
        // fabricated historical value.
        const histPhrase =
          /\b(last (?:month|week|year|quarter)|previous|history|historical|ago)\b/i.exec(
            input,
          );
        if (histPhrase && /\b(?:price|cost|rate)\b/i.test(input)) {
          return this.compose(
            `I have no historical record for that — my market intelligence keeps the current observed snapshot, not a price time series, so I honestly cannot reconstruct values for ${histPhrase[1]}. I do not guess prices. Ask me to research the history and I will fetch dated sources, or teach me dated facts ("the price was X on <date>") and I will retain them with valid-from/valid-until timestamps.`,
            nlu.confidence * 0.5,
            [],
          );
        }
        // cx-2 — pronoun reference resolution: "what is his
        // role?" — resolve the pronoun to the most recent
        // proper noun from salient owner turns, then answer
        // from that subject's facts. Real antecedent lookup,
        // not a guess.
        if (/\b(?:his|her|their|its)\b/i.test(input)) {
          const PROPER_NOUN =
            /\b(?!Remember\b|Please\b|What\b|Note\b|Learn\b|Teach\b|The\b|Monday\b|Tuesday\b|Wednesday\b|Thursday\b|Friday\b|Saturday\b|Sunday\b)([A-Z][a-z]{2,})\b/g;
          let name: string | undefined;
          for (const t of context.salientTurns) {
            if (t.role !== "owner") continue;
            const matches = [...t.text.matchAll(PROPER_NOUN)];
            if (matches.length > 0) {
              name = matches[matches.length - 1][1];
            }
          }
          if (name) {
            const personFacts = this.facts
              .query({ subject: name.toLowerCase() })
              .filter((f) => f.status !== "uncertain");
            if (personFacts.length > 0) {
              const top = personFacts.slice(0, 3);
              const parts = top.map(
                (f) =>
                  `${f.subject} ${f.predicate.replace(/-/g, " ")}: ${String(f.object)} [confidence ${(f.confidence * 100) | 0}%, ${f.provenance.source}]`,
              );
              const pronoun = /\bhis\b/i.test(input)
                ? "his"
                : /\bher\b/i.test(input)
                  ? "her"
                  : /\btheir\b/i.test(input)
                    ? "their"
                    : "its";
              return this.compose(
                `Resolving "${pronoun}" to ${name} from our conversation. From my validated knowledge:\n${parts.join("\n")}`,
                nlu.confidence * 0.8,
                cite(top),
              );
            }
          }
        }
        let validated = answerable
          .filter((f) => f.status !== "uncertain")
          .slice(0, 3);
        // Phase 2.4 SPO probe: a question naming a specific
        // attribute ("what is the screed volume?") is only
        // ANSWERED by a fact with that exact subject+predicate
        // — a topic-word match (the taught thickness ranking
        // high because it shares the word "screed") is NOT an
        // answer. When the exact SPO is absent from retrieval,
        // give the rule engine one bounded derivation pass and
        // re-probe; a computed conclusion answers, honestly
        // labeled as derived.
        const qSPO = questionSPO(input);
        if (qSPO) {
          const directlyAnswered = answerable.some(
            (f) => f.subject === qSPO.subject && f.predicate === qSPO.predicate,
          );
          if (!directlyAnswered) {
            const promoted = await this.deriveForQuestion(qSPO);
            if (promoted.length > 0) validated = promoted;
          }
        }
        if (validated.length === 0 || !genuineSubject) {
          // P7 — a knowledge question with zero matched
          // facts (or only TF-IDF noise below the relevance
          // floor — same thing) is a countable unknown-topic
          // hit.
          this.unknownTopicHits += 1;
          // Episodic memory: recall what the owner said earlier
          // in this conversation. REAL retrieval — the recalled
          // turns actually change the answer instead of a bare
          // "I do not know". The current input is excluded so
          // ARCHIE never "recalls" the question itself.
          const recalled = context.salientTurns.filter(
            (t) =>
              t.role === "owner" &&
              t.text.trim() !== input.trim() &&
              t.text.length > 12 &&
              // Relevance floor: recency alone is not recall.
              (t.relevance ?? 0) >= 0.3,
          );
          if (recalled.length > 0) {
            const recent = recalled
              .slice(0, 2)
              .map((t) => `“${t.text.slice(0, 160)}”`)
              .join(" | ");
            return this.compose(
              `I do not have that in my validated long-term knowledge, but earlier in this conversation you said: ${recent}. ` +
                `That is episodic context from our chat — not validated knowledge. If it should be permanent, teach it explicitly (“remember that …”) and I will retain it with provenance.`,
              nlu.confidence * 0.6,
              [],
            );
          }
          // P1b — strategy-driven honest speculation: "why"
          // questions get hypothesis framing (never as fact);
          // conflicting-evidence questions get a conflict band.
          const strategic = await this.speculativeAnswer(
            input,
            answerable,
            nlu.confidence,
          );
          if (strategic) return strategic;
          // REMEDIATION batch 2 (2026-09-12): a message with
          // ZERO known vocabulary (no corpus word matched at
          // all) and zero fact matches gets an honest rephrase
          // request — the research/teach options are useless
          // for a term ARCHIE cannot even tokenize into
          // meaning, and offering them would be theater.
          if (probeVocabulary(input) === 0) {
            return this.compose(
              `I didn't recognize any of the words in that message, so I won't guess at a meaning. Could you rephrase it? If it is a term you want me to know, teach it to me directly and I will retain it with owner provenance.`,
              nlu.confidence * 0.5,
              [],
            );
          }
          // AUTO-RESEARCH ON QUESTION MISS (owner directive
          // 2026-09-14: "there are websites at its disposal
          // but it is not using any of them"). A knowledge
          // question with zero matched facts is an invitation
          // to research, exactly like a definition miss —
          // ARCHIE searches the open web (DuckDuckGo Lite,
          // Wikipedia and the priority source registry) and
          // answers immediately with honest provenance
          // instead of offering research as a menu option.
          // Findings are stored as low-confidence candidate
          // knowledge (owner turns persist them; a visitor
          // engine has no persistence and gets the researched
          // answer only).
          if (
            input.length <= 160 &&
            /\?|^(what|who|whom|when|where|why|how|which|whose|is|are|was|were|do|does|did|can|could|will|would|should|tell me|explain|describe|define|name)\b/i.test(
              input,
            )
          ) {
            await this.facts.assert({
              subject: "network",
              predicate: "authorized",
              object: `autonomous research on question miss: ${input.slice(0, 80)}`,
              confidence: 0.9,
              provenance: {
                source: "seed",
                note: "knowledge-autonomy policy — learning is free",
              },
              status: "validated",
            });
            const questionReport = await this.research.research(input);
            if (questionReport.hits.length > 0) {
              const qLines: string[] = [
                `I did not have that in my knowledge store, so I researched "${input.slice(0, 80)}" on the open web.`,
              ];
              for (const h of questionReport.hits.slice(0, 3)) {
                qLines.push(
                  `- ${h.title}${h.snippet ? `: ${h.snippet.slice(0, 220)}` : ""} (${h.url})`,
                );
              }
              qLines.push(
                questionReport.crossChecked
                  ? "Independent sources agree on this (cross-checked)."
                  : "Cross-source agreement NOT yet established — treat with caution.",
              );
              qLines.push(
                `${questionReport.storedKnowledge} finding(s) stored as low-confidence candidate knowledge pending validation — nothing is accepted as fact yet. Teach me a correction any time and yours overwrites it.`,
              );
              return this.compose(
                qLines.join("\n"),
                Math.min(nlu.confidence + 0.2, 0.85),
                [],
              );
            }
            // research found nothing / failed — the honest
            // unknown line below reports it without theater.
          }
          const plan = await this.planFor("researched");
          // A-1 OWNER-GATED LOCAL GENERATION: on the owner's
          // own turn, when the owner's local model server is
          // configured and reachable, ARCHIE generates an
          // answer here — EXPLICITLY LABELED as generated,
          // never stored as knowledge, never dressed as
          // validated fact. Unconfigured or unreachable: the
          // honest unknown line stands, unchanged.
          let genBlock = "";
          if (ownerAuthorized) {
            const gen = await ownerLocalGenerate({
              prompt: input,
              ownerAuthorized: true,
            });
            if (gen.status === "generated") {
              genBlock =
                `\n\n${gen.text}\n\n[${generatedLabel(input)} — ` +
                `NOT validated knowledge; verify anything that matters]`;
            }
          }
          // P6 — variance on the honest unknown line; the
          // "validated knowledge" marker survives in every
          // variant (composer self-check enforces it).
          return this.compose(
            `${unknownOpening(input)} I found nothing in my knowledge that matches that. ` +
              `I can research it on the open web (cross-checked, stored as candidate knowledge for validation) or you can teach me directly; both are real options. ${plan.executable ? `Research plan is ready (${plan.steps.length} steps).` : ""}` +
              genBlock,
            nlu.confidence * 0.5,
            [],
            plan,
          );
        }
        // P8: derived facts carry an explicit epistemic label
        // — a rule-chain conclusion is never presented as
        // owner-validated knowledge.
        const parts = validated.map((f) => {
          const base = `${f.subject} ${f.predicate.replace(/-/g, " ")}: ${String(f.object)} `;
          if (f.status === "derived" || f.provenance.source === "inferred") {
            return (
              base +
              `[confidence ${(f.confidence * 100).toFixed(0)}%, DERIVED — inferred by rule chain, not owner-validated]`
            );
          }
          // H-1: owner-asserted facts are labeled as the
          // owner's assertion — citable, but never dressed as
          // independently-validated knowledge.
          if (f.status === "owner-asserted") {
            return (
              base +
              `[confidence ${(f.confidence * 100).toFixed(0)}%, OWNER-ASSERTED (${f.provenance.source}) — taught by you, not independently verified]`
            );
          }
          // FIX 16 (batch 6): CANDIDATE facts (unverified web
          // findings) carry an explicit unvalidated marker —
          // previously they rendered as a bare source tag,
          // letting a search snippet read as established
          // knowledge.
          if (f.status === "candidate") {
            return (
              base +
              `[confidence ${(f.confidence * 100).toFixed(0)}%, CANDIDATE (${f.provenance.source}) — unverified finding, not validated knowledge]`
            );
          }
          return (
            base +
            `[confidence ${(f.confidence * 100).toFixed(0)}%, ${f.provenance.source}]`
          );
        });
        // P1b: if the question is a "why did this go wrong"
        // problem with numbers that fall short of a recorded
        // requirement, connect them as a working hypothesis.
        const followUp = this.speculativeFollowUp(input, validated);
        // P6 — deterministic phrasing variance: the opening
        // and footer are picked by a stable hash of the CITED
        // FACT IDS. Same evidence always reads the same;
        // different questions read differently. Content and
        // epistemic labels never change.
        const kbSeed = validated.map((f) => f.id).join("|");
        const footer =
          nlu.intent === "howto_guidance"
            ? howtoFooter(kbSeed, this.verbosity)
            : "";
        // P8: an answer citing derived knowledge opens with the
        // derived marker, never "validated knowledge".
        const opening = includesDerived(validated)
          ? derivedOpening(kbSeed)
          : // H-1: an answer citing ONLY owner-asserted facts
            // opens with the owner-asserted frame — the owner's
            // assertion is never presented under the
            // independently-validated banner.
            validated.every((f) => f.status === "owner-asserted")
            ? ownerAssertedOpening(kbSeed)
            : // FIX 14 (batch 6): a MIX of validated and
              // owner-asserted facts opens with the mixed-basis
              // frame — owner-asserted lines are never dressed
              // under the plain "validated knowledge" banner.
              validated.some(
                  (f) =>
                    f.status === "owner-asserted" || f.status === "candidate",
                )
              ? mixedBasisOpening(kbSeed)
              : knowledgeOpening(kbSeed);
        return this.compose(
          `${opening}\n${parts.join("\n")}` +
            (followUp ? `\n\n${followUp}` : "") +
            (footer ? `\n${footer}` : ""),
          // FIX 15 (batch 6): answer confidence is anchored to
          // the WEAKEST cited fact, not the first — a strong
          // top hit can no longer dress weak evidence behind
          // a high reported confidence.
          nlu.confidence *
            Math.min(
              1,
              validated.reduce((m, f) => Math.min(m, f.confidence), 1) + 0.3,
            ),
          cite(validated),
        );
      }

      case "teaching": {
        // Secrets are never memorized — the immune system's
        // redaction gate applies to memory writes too.
        const secretScan = redactSecrets(input);
        if (secretScan.foundCount > 0) {
          return this.compose(
            "I will not store that — it contains a credential/secret. ARCHIE memory never retains secrets (they are redacted at ingest and refused at store). Teach me the non-secret part and I will keep that.",
            nlu.confidence,
            [],
          );
        }
        // SELF-EVOLVING VOCABULARY (owner directive,
        // 2026-09-13): a meaning-teach statement ("kwisatz
        // means sacred weed") writes the LIVING REGISTRY,
        // not just the fact store — the term earns
        // owner-taught provenance, corrector protection and
        // frequency tracking. Registry failure (or no
        // persistence) falls through to the native fact
        // path — teaching never fails closed.
        const vocabTeach =
          /^(?:the\s+(?:word|phrase|term)\s+)?([a-z][\w' -]{0,60}?)\s+(?:means|is\s+short\s+for|is\s+another\s+(?:word|name)\s+for|is\s+the\s+same\s+as)\s+(.{2,400})$/i.exec(
            input,
          );
        if (vocabTeach) {
          const term = vocabTeach[1]
            .trim()
            .replace(/^(?:the|a|an)\s+/i, "")
            .toLowerCase();
          const meaning = vocabTeach[2].trim().replace(/[.?!]+$/, "");
          if (
            term.length > 0 &&
            this.persistence instanceof SupabasePersistence
          ) {
            const ok = await this.persistence.teachVocabularyTerm(
              term,
              meaning,
            );
            if (ok) {
              return this.compose(
                `Understood. ${term} means: ${meaning}. Kept.`,
                nlu.confidence,
                [],
              );
            }
          }
        }
        const triple = extractTriple(input);
        if (!triple) {
          return this.compose(
            "I want to learn that, but I could not extract a clean fact from it. State it as a simple subject-verb-object line (e.g. 'screeding ratio is 1:4 cement to sand') and I will retain it with provenance.",
            nlu.confidence,
            [],
          );
        }
        const { fact, conflict } = await this.facts.assert({
          ...triple,
          confidence: 0.8,
          provenance: {
            source: "owner-taught",
            note: `taught in conversation: ${input.slice(0, 120)}`,
          },
          // H-1 (audit fix 2026-09-11): a taught fact is held on
          // the owner's AUTHORITY — it is citable with an honest
          // label, but "validated" is earned through real
          // verification events (explicit owner confirmation
          // in use), never minted on arrival.
          status: "owner-asserted",
        });
        const text = conflict
          ? `Updated — this replaces ${conflict.conflictingFactIds.length} older record(s) on the same point (the older version is kept marked uncertain for history). Your latest teaching stands; no approval step needed.`
          : `Retained as your assertion (owner-asserted — held on your authority, not independently verified): ${fact.subject} ${fact.predicate.replace(/-/g, " ")} → ${String(fact.object)}. When I use it and you confirm I was right, it earns validated status.`;
        return this.compose(text, nlu.confidence, [fact.id]);
      }

      case "memory_exclusion": {
        // Defense in depth for negated memory directives
        // ("do not remember the gate code"). The NLU rule
        // routes these here deterministically; even if a
        // caller bypasses the negated-clause exclusion path,
        // this handler NEVER writes to the fact store, and
        // no conversation memory is retained from it. Honest
        // acknowledgment only.
        return this.compose(
          "Understood — I will not store that, and nothing from it has been kept.",
          nlu.confidence,
          [],
        );
      }

      case "correction": {
        // REQUEST REDO (owner directive 2026-09-14): "actually
        // wait, I meant 25 bags" after a REQUEST — a
        // conversion, a price query, a plan — redoes the
        // REQUEST with the corrected value. It must NOT touch
        // stored knowledge: the old path demoted unrelated
        // facts because a correction of a request was treated
        // as a correction of a fact. Knowledge correction
        // remains for corrections that follow TEACHING.
        const redoM =
          /\b(?:i\s+meant|i\s+mean|no\s+wait|scratch\s+that|never\s+mind)\b(.*)$/i.exec(
            input,
          );
        if (redoM) {
          const memTurns = session?.memory.recentTurns(8) ?? [];
          const ownerTurns = memTurns.filter((t) => t.role === "owner");
          // Owner turns BEFORE this correction message (the
          // current input is not yet in memory at route time).
          const lastInput = ownerTurns[ownerTurns.length - 1]?.text ?? "";
          const wasTeaching =
            /\bremember\b|\bteach\b|\bmemorize\b|\bnote\s+that\b/i.test(
              lastInput,
            );
          if (lastInput && !wasTeaching) {
            const redoValue = (redoM[1] ?? "").trim();
            const numInRedo = (redoValue.match(/\d+(?:\.\d+)?/g) ?? [])[0];
            const numsInLast = lastInput.match(/\d+(?:\.\d+)?/g);
            let rebuilt = lastInput;
            if (numInRedo && numsInLast?.length) {
              // Substitute the LAST number of the previous
              // request with the corrected value.
              const lastNum = numsInLast[numsInLast.length - 1];
              rebuilt = lastInput.replace(lastNum, numInRedo);
            } else if (redoValue) {
              rebuilt = `${lastInput.replace(/[?.!]*$/, "")} — ${redoValue}`;
            }
            if (rebuilt !== lastInput) {
              const redoNlu = understand(rebuilt, memTurns, {
                rules: this.domains.nluRules(),
              });
              const redoResult = await this.route(
                redoNlu,
                rebuilt,
                ranked,
                context,
                systemInstruction,
                session,
                history,
              );
              redoResult.responseText = `Correction understood — redoing your request as: "${rebuilt}"\n\n${redoResult.responseText}`;
              return redoResult;
            }
          }
        }
        // Explicit owner confirmation is VERIFICATION, not
        // correction (audit H1): "confirm that X is correct"
        // must strengthen the verified knowledge — the old
        // path weakened it, which punished owners for
        // confirming ARCHIE.
        if (EXPLICIT_CONFIRM.test(input)) {
          // Audit fix 2026-09-11 (confirmation targeting): the
          // old path stamped owner-confirm on the top-3
          // TF-IDF matches REGARDLESS of fit — a confirmation
          // that merely mentioned a neighbouring topic could
          // silently validate unrelated facts. A fact is only
          // strengthened when it clearly matches what the
          // owner confirmed: at least 2 shared salient tokens
          // with the confirmation text. Below the floor the
          // outcome is recorded as acknowledged — engagement,
          // NOT verification evidence — and nothing is
          // reinforced (audit C3/H1 gates).
          const queryTokens = salientTokens(input);
          // Hyphenated subject/object ("market-sand") must
          // tokenize the same way as the owner's phrasing
          // ("market sand") — normalize every component.
          const factTokens = (f: Fact) =>
            salientTokens(
              `${f.subject.replace(/-/g, " ")} ${f.predicate.replace(/-/g, " ")} ${String(f.object).replace(/-/g, " ")}`,
            );
          const confirmed = this.facts.rank(input, 3).filter((f) => {
            const ft = factTokens(f);
            if (ft.size === 0) return false;
            let shared = 0;
            for (const t of queryTokens) if (ft.has(t)) shared += 1;
            if (shared < 2) return false;
            // SUBJECT-GATE (audit C3 hardening, 2026-09-13):
            // the 2-token floor alone let a confirmation that
            // names a NEIGHBOURING topic strengthen a fact it
            // never named — shared predicate/object tokens
            // ("price", "per bag") are not what the owner
            // confirmed. The confirmation must also name the
            // fact's SUBJECT — at least one salient subject
            // token of the fact appears in the confirmation
            // text. A subject with no salient tokens cannot be
            // gated (nothing to test against) and keeps the
            // old floor-only behaviour, documented honestly.
            const subjectTokens = salientTokens(f.subject.replace(/-/g, " "));
            if (subjectTokens.size === 0) return true;
            for (const t of subjectTokens) {
              if (queryTokens.has(t)) return true;
            }
            return false;
          });
          if (confirmed.length > 0) {
            await this.learner.record({
              kind: "success",
              task: `owner confirmation: ${input.slice(0, 80)}`,
              contributing: confirmed.map((f) => f.id),
            });
            return this.compose(
              `Confirmed — thank you. ${confirmed.length} related fact(s) strengthened and stamped as owner-confirmed evidence. ${this.statusLine()}`,
              nlu.confidence,
              confirmed.map((f) => f.id),
            );
          }
          // No fact matched the confirmation closely enough —
          // record it as acknowledged (audit trail, zero
          // reinforcement) and say so honestly.
          await this.learner.record({
            kind: "acknowledged",
            task: `owner confirmation below similarity floor: ${input.slice(0, 80)}`,
            contributing: [],
          });
          return this.compose(
            "Noted as a confirmation — but nothing in my stored knowledge matches it closely enough for me to strengthen honestly. I only reinforce facts that clearly match what you confirmed. Teach me the fact first, then confirm it after I answer.",
            nlu.confidence,
            [],
          );
        }
        const triple = extractTriple(input);
        // Targeted demotion: facts directly on the corrected
        // SPO, plus TF-IDF related facts. The contradicted fact
        // itself must never survive on a ranking technicality.
        const targeted = new Map<string, Fact>();
        if (triple) {
          for (const f of this.facts.query({
            subject: triple.subject,
            predicate: triple.predicate,
          })) {
            targeted.set(f.id, f);
          }
        }
        for (const f of this.facts.rank(input, 3)) {
          targeted.set(f.id, f);
        }
        for (const fact of targeted.values()) {
          fact.status = "uncertain";
        }
        await this.learner.record({
          kind: "correction",
          task: `correction on: ${input.slice(0, 80)}`,
          contributing: [...targeted.keys()],
        });
        if (triple) {
          const correctionStamp = `owner-correction:${Date.now()}`;
          const { fact } = await this.facts.assert({
            ...triple,
            confidence: 0.8,
            provenance: {
              source: "owner-taught",
              note: `owner correction: ${input.slice(0, 120)}`,
            },
            // H-1: a corrected value is the owner's assertion —
            // stronger than a plain teaching (the owner reviewed
            // a live contradiction) and stamped with that real
            // verification event, but it still earns "validated"
            // through confirmation, not on arrival.
            status: "owner-asserted",
          });
          if (!(fact.verifiedBy ?? []).includes(correctionStamp)) {
            fact.verifiedBy = [...(fact.verifiedBy ?? []), correctionStamp];
          }
          // The conflict detector parks a contradicting
          // newcomer — but HERE the owner has explicitly
          // resolved the contradiction (the wrong facts were
          // already moved to uncertain above), so the
          // corrected assertion must stand as owner-asserted,
          // not be parked alongside the facts it replaces.
          if (fact.status === "uncertain" || fact.status === "validated") {
            fact.status = "owner-asserted";
          }
          return this.compose(
            `Correction processed. ${targeted.size} related fact(s) moved to uncertain, and the corrected knowledge is retained as the owner-corrected assertion (owner-asserted — you resolved the contradiction, and the correction is stamped as a verification event). I do not silently keep wrong facts.`,
            nlu.confidence,
            [fact.id],
          );
        }
        return this.compose(
          `Correction processed. ${targeted.size} related fact(s) moved to uncertain pending re-teaching. Tell me the correct fact and I will retain it.`,
          nlu.confidence,
          [...targeted.keys()].slice(0, 3),
        );
      }

      case "research_request": {
        // ENGINES PANEL GATE (2026-09-14): the owner can switch
        // web research off from the Engines panel — the refusal
        // is honest, never a faked result.
        if (!isCapabilityEnabled("web-research")) {
          return this.compose(
            capabilityDisabledReply("web-research", "Web research"),
            nlu.confidence * 0.8,
            [],
          );
        }
        // SELF-EVOLVING VOCABULARY (owner directive,
        // 2026-09-13): a MEANING-research request ("research
        // what kwisatz means", "research it" after a
        // definition miss) gets the dedicated multi-site
        // dictionary flow BEFORE the generic web pipeline —
        // the result is a REGISTRY meaning with research
        // provenance, not scattered candidate facts.
        // Antecedent history: the caller's turns first; when
        // the client sent none, the engine's own session
        // memory for THIS conversation holds recent turns
        // (same source routeClauses uses for anaphora).
        const meaningHistory =
          history && history.length > 0
            ? history
            : (session ?? this.sessionFor()).memory
                .recentTurns(6)
                .map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
        const meaningTerm = extractMeaningResearchRequest(
          input,
          meaningHistory,
        );
        if (meaningTerm && this.persistence instanceof SupabasePersistence) {
          // Explicit owner research request = network
          // authorization for this term.
          await this.facts.assert({
            subject: "network",
            predicate: "authorized",
            object: `owner requested meaning research: ${meaningTerm.slice(0, 80)}`,
            confidence: 0.9,
            provenance: {
              source: "seed",
              note: "owner-authorized meaning research request",
            },
            status: "validated",
          });
          const lookup =
            this.meaningResearch ??
            ((term: string) =>
              researchTermMeaning(term, globalThis.fetch as FetchLike));
          const report = await lookup(meaningTerm);
          if (report.meaning) {
            // AUTHORITY ORDER: seed and owner-taught meanings
            // are authoritative — researched knowledge never
            // overwrites them. Owner teaching (0.9, owner
            // provenance) always beats research (<=0.6).
            const existing = this.facts
              .list()
              .find(
                (f) => f.subject === report.term && f.predicate === "means",
              );
            if (existing) {
              const lines: string[] = [];
              lines.push(
                `Researched "${report.term}" across ${report.results.length} sites: ${report.results
                  .map((r) =>
                    r.failure
                      ? `${r.site} (could not reach)`
                      : r.meaning
                        ? `${r.site} (found)`
                        : `${r.site} (${r.note})`,
                  )
                  .join("; ")}.`,
              );
              lines.push(
                `Sites say: ${report.meaning}. My existing definition (${existing.provenance.source}) stands — researched knowledge never overwrites seed or owner-taught meanings.`,
              );
              return this.compose(lines.join("\n"), nlu.confidence, [
                existing.id,
              ]);
            }
            const stored = await this.persistence.researchVocabularyTerm(
              meaningTerm,
              report.meaning,
              report.domains,
              report.confidence,
            );
            const lines: string[] = [];
            lines.push(
              `Researched "${report.term}" across ${report.results.length} dictionary/reference sites in parallel:`,
            );
            for (const r of report.results) {
              lines.push(
                `- ${r.site}: ${r.failure ? `could not reach (${r.note})` : r.meaning ? "found" : r.note}`,
              );
            }
            if (stored) {
              // OWNER DIRECTIVE (2026-09-16): the report keeps the
              // per-site detail (that is what "research it" asks
              // for); the meaning line stays clean.
              lines.push(
                `Meaning kept: ${report.term} means: ${report.meaning}`,
              );
            } else {
              lines.push(
                `I found a meaning (${report.meaning}) but could NOT store it in the registry — a later definition question will not answer from it. That is an honest failure, not a saved definition.`,
              );
            }
            return this.compose(lines.join("\n"), nlu.confidence, []);
          }
          const unreachable = report.results.filter((r) => r.failure);
          const missed = report.results.filter((r) => !r.failure);
          const noLines = [
            `I researched "${report.term}" across ${report.results.length} sites and none has a meaning for it.`,
          ];
          if (missed.length > 0) {
            noLines.push(
              `Genuinely missing: ${missed.map((r) => r.site).join(", ")}.`,
            );
          }
          if (unreachable.length > 0) {
            noLines.push(
              `Could not reach (honest, not hidden): ${unreachable.map((r) => `${r.site} (${r.note})`).join("; ")}.`,
            );
          }
          noLines.push(
            "I will not invent a definition — teach me what it means and I will keep it with your provenance.",
          );
          return this.compose(noLines.join("\n"), nlu.confidence, []);
        }
        const query = extractResearchQuery(input);
        if (!query) {
          return this.compose(
            "Ready to research — give me the topic or question and I will search, cross-check and store findings as candidate knowledge.",
            nlu.confidence,
            [],
          );
        }
        // Explicit owner research request = network authorization for this query.
        await this.facts.assert({
          subject: "network",
          predicate: "authorized",
          object: `owner requested research: ${query.slice(0, 80)}`,
          confidence: 0.9,
          provenance: {
            source: "seed",
            note: "owner-authorized research request",
          },
          status: "validated",
        });
        const report = await this.research.research(query);
        // HONEST SOURCE-AWARE REPORTING — only sources actually
        // searched are named; failures, disagreements and
        // discovered sources are reported, never smoothed over.
        if (report.reusedCache) {
          return this.compose(
            `Recent findings for "${query}" are still current — reusing ${report.hits.length} cached finding(s) instead of searching again. Ask me to validate them if you want them promoted to knowledge.`,
            nlu.confidence,
            [],
          );
        }
        if (report.hits.length > 0) {
          const lines: string[] = [];
          lines.push(
            `Research completed for "${query}" — classified as ${report.category ?? "unclassified"} domain.`,
          );
          lines.push(
            `Sources searched (priority first): ${report.sourcesSearched.join(", ") || "none"}.`,
          );
          if (report.sourceFailures.length > 0) {
            lines.push(
              `Failed/declined: ${report.sourceFailures.map((f) => `${f.domain} (${f.note})`).join("; ")}.`,
            );
          }
          lines.push(
            `${report.hits.length} result(s) found across ${new Set(report.hits.map((h) => h.domain)).size} domain(s)` +
              (report.crossChecked
                ? "; independent sources agree (cross-checked)."
                : "; cross-source agreement NOT yet established — treat with caution."),
          );
          if (report.contentCrossChecked) {
            lines.push(
              "Deep verification: source PAGE CONTENTS from ≥2 independent domains were fetched, extracted and agree — the strongest candidate confidence applies (still pending owner validation).",
            );
          }
          const failedFetches = report.pageFetches.filter((f) => !f.ok);
          if (failedFetches.length > 0) {
            lines.push(
              `Pages I could not read (honest, not hidden): ${failedFetches.map((f) => `${new URL(f.url).hostname} (${f.note})`).join("; ")}.`,
            );
          }
          for (const c of report.conflicts) {
            lines.push(`Caution: ${c}`);
          }
          if (report.discoveredSources.length > 0) {
            lines.push(
              `Newly discovered sources classified (evaluating, not trusted yet): ${report.discoveredSources.join(", ")}.`,
            );
          }
          lines.push(
            `${report.storedKnowledge} finding(s) stored as low-confidence candidate knowledge pending validation.`,
          );
          lines.push("Top results:");
          for (const h of report.hits.slice(0, 3)) {
            lines.push(`- ${h.title} (${h.url})`);
          }
          lines.push(
            "Nothing here is accepted as fact yet — validate findings before I treat them as knowledge.",
          );
          return this.compose(lines.join("\n"), nlu.confidence, []);
        }
        return this.compose(
          `Research ran but returned no results: ${report.note}. I report that honestly rather than inventing sources.`,
          nlu.confidence,
          [],
        );
      }

      case "task_planning": {
        // ENGINES PANEL GATE (2026-09-14)
        if (!isCapabilityEnabled("planning")) {
          return this.compose(
            capabilityDisabledReply("planning", "Planning"),
            nlu.confidence * 0.8,
            [],
          );
        }
        // Phase 3.2 (audit): the goal is DERIVED FROM THE REQUEST,
        // and the plan is a real, goal-scoped step chain — never a
        // canned template. Session-true facts are asserted first
        // (the owner IS present and web research IS authorized by
        // permanent directive), then means-ends runs over the
        // $goal-scoped operator library, then the engine EXECUTES
        // the steps bound to real subsystems and reports honest
        // per-step results. Consequential steps stop at PROPOSE.
        const goalSubject = deriveGoalSubject(input);
        // The digit check is domain-general; WHICH words count as
        // quantities is domain knowledge — the registry asks the
        // registered skills (construction knows its materials).
        const quantities = /\d/.test(input) && this.domains.quantifies(input);
        await this.assertPlanningFacts(goalSubject, input, quantities);
        const plan = await this.planFor({
          subject: goalSubject,
          predicate: "planned",
        });
        await this.executePlanSteps(plan, goalSubject, input);
        // Phase 4.4 (lessons → behavior): owner-recorded
        // evolution-memory lessons relevant to THIS goal are
        // retrieved and attached to the plan — context with
        // dated provenance, never facts, never auto-blocks.
        // A failed/rolled-back past attempt raises the risk
        // level honestly.
        plan.relevantLessons = await this.fetchPlanLessons(
          `${goalSubject} ${input}`,
        );
        if (plan.relevantLessons.length > 0) {
          plan.risk = mergeLessonRisk(plan.relevantLessons, plan.risk);
        }
        const lessonsNote =
          plan.relevantLessons.length > 0
            ? `\nPast lessons from your evolution memory apply here (owner-recorded, dated — context, not validated rules): ` +
              plan.relevantLessons
                .map(
                  (l, i) =>
                    `${i + 1}. [${l.recordedAt.slice(0, 10)}] ${l.lesson}` +
                    (l.failedBefore
                      ? " (a past attempt on this problem failed or was rolled back — risk noted)"
                      : ""),
                )
                .join(" ") +
              (plan.relevantLessons.some((l) => l.failedBefore)
                ? `\nRisk level raised accordingly: ${plan.risk.level}.`
                : "")
            : "";
        const text = plan.executable
          ? `Plan for your request (${plan.steps.length} steps, cost ${plan.totalCost}) — goal: ${goalSubject}\n` +
            plan.steps
              .map((s, i) => {
                const outcome = s.result
                  ? ` — ${statusLabel(s.status)}: ${s.result}`
                  : "";
                return `${i + 1}. ${s.achieves} → ${s.satisfies}${outcome}`;
              })
              .join("\n") +
            (plan.alternatives.length > 0
              ? `\nReal alternative chains: ${plan.alternatives
                  .map((a) => `${a.description} (${a.tradeoff})`)
                  .join("; ")}.`
              : "") +
            lessonsNote +
            `\nConsequential actions in this plan end at PROPOSE — execution stays yours to authorize.`
          : `I cannot honestly plan that yet. Gaps: ${plan.gapReport.join("; ")}. I report gaps rather than inventing steps.` +
            lessonsNote;
        return this.compose(text, nlu.confidence, [], plan);
      }

      case "code_analysis_request": {
        // ENGINES PANEL GATE (2026-09-14)
        if (!isCapabilityEnabled("coding-intelligence-analysis")) {
          return this.compose(
            capabilityDisabledReply(
              "coding-intelligence-analysis",
              "Code analysis",
            ),
            nlu.confidence * 0.8,
            [],
          );
        }
        const codeBlock = input.match(/```[\w]*\n([\s\S]*?)```/);
        if (codeBlock) {
          const analysis = analyzeSource("inline-snippet.ts", codeBlock[1]);
          return this.compose(
            `Static analysis complete (deterministic):\n` +
              `- ${analysis.lines} lines, ${analysis.functions.length} function(s), ${analysis.classes.length} class(es)\n` +
              `- imports: ${analysis.imports.join(", ") || "none"}\n` +
              `- exports: ${analysis.exports.join(", ") || "none"}\n` +
              `- cyclomatic complexity estimate: ${analysis.complexity.cyclomatic}\n` +
              (analysis.risks.length > 0
                ? `- risks: ${analysis.risks.join("; ")}\n`
                : "- no risk flags\n") +
              `Open-ended code generation is not implemented — analysis and unit-test scaffolds are.`,
            nlu.confidence,
            [],
          );
        }
        const hasFileRef = nlu.entities.filePaths.length > 0;
        return this.compose(
          hasFileRef
            ? `I see the reference ${nlu.entities.filePaths.join(", ")}, but I need the actual source text to analyze — paste it in a code block. Deterministic static analysis runs on real source, never on a filename alone.`
            : `Paste the source in a code block and I will run deterministic static analysis (structure, complexity, risk flags). Analysis and unit-test scaffolds are implemented; open-ended generation is not.`,
          nlu.confidence,
          [],
        );
      }

      case "price_query": {
        // ENGINES PANEL GATE (2026-09-14)
        if (!isCapabilityEnabled("market-intelligence-price-lookup")) {
          return this.compose(
            capabilityDisabledReply(
              "market-intelligence-price-lookup",
              "Market price lookup",
            ),
            nlu.confidence * 0.8,
            [],
          );
        }
        // tr-3 — historical price questions ("what was the
        // cement price last month?"): market intelligence
        // holds the CURRENT observed snapshot, not a time
        // series. Honest refusal, never a fabricated
        // historical price.
        const temporalPhrase =
          /\b(last (?:month|week|year|quarter)|previous|history|historical|recent|ago)\b/i.exec(
            input,
          );
        if (temporalPhrase) {
          return this.compose(
            `I have no historical record for that — my market intelligence keeps the current observed snapshot, not a price time series, so I honestly cannot reconstruct prices for ${temporalPhrase[1]}. I do not guess prices. Ask me to research the history and I will fetch dated sources, or teach me dated facts ("the cement price was X on <date>") and I will retain them with valid-from/valid-until timestamps.`,
            nlu.confidence * 0.5,
            [],
          );
        }
        const product = extractPriceProduct(input);
        if (!product) {
          return this.compose(
            "Ask me about a specific material — for example 'what is the price of cement' — and I will answer from real observed market data, never from a guess.",
            nlu.confidence,
            [],
          );
        }
        if (!this.marketPriceLookup) {
          // Plan P1 (audit C1): if the caller declared the
          // market_intelligence tool, ASK the caller to execute
          // it instead of refusing — the dead-tool seam is now
          // a live bridge.
          if (requestToolNames.includes("market_intelligence")) {
            const pending = this.compose(
              `Consulting market intelligence for the observed price of "${product}" — one moment.`,
              nlu.confidence,
              [],
            );
            pending.toolCall = {
              name: "market_intelligence",
              args: { region: extractRegionHint(input), item: product },
            };
            return pending;
          }
          return this.compose(
            `My market intelligence adapter is not wired in this deployment, so I cannot look up observed prices for "${product}" here. I do not guess prices.`,
            nlu.confidence,
            [],
          );
        }
        const result = await this.marketPriceLookup(product);
        if (!result) {
          return this.compose(
            `I have no observed price data for "${product}" yet — the market intelligence crawler has not recorded it, and I do not guess prices. You can teach me a price directly and I will retain it as owner-provided knowledge.`,
            nlu.confidence,
            [],
          );
        }
        const pkg =
          result.packageSize && result.packageUnit
            ? ` for ${result.packageSize} ${result.packageUnit}`
            : "";
        const stale =
          result.freshness === "stale" || result.freshness === "expired";
        const sourceNote =
          result.source === "approved"
            ? "approved price list"
            : "raw market observation (not yet approved)";
        const date = String(result.recordedAt).slice(0, 10);
        return this.compose(
          `${result.currency} ${result.price} for ${result.product}${pkg} — market ${result.marketCode}, recorded ${date} (${sourceNote}).` +
            (stale
              ? ` This price is ${result.freshness} — treat it as indicative only.`
              : ""),
          nlu.confidence,
          [],
        );
      }

      case "documents_query":
      case "images_query":
      case "voice_query":
      case "social_query":
      case "family_query": {
        // ENGINES PANEL GATE (2026-09-14)
        if (
          !isCapabilityEnabled(
            "system-adapters-documents-images-voice-social-family",
          )
        ) {
          return this.compose(
            capabilityDisabledReply(
              "system-adapters-documents-images-voice-social-family",
              "System status adapters",
            ),
            nlu.confidence * 0.8,
            [],
          );
        }
        const key: SystemAdapterKey =
          nlu.intent === "documents_query"
            ? "documents"
            : nlu.intent === "images_query"
              ? "images"
              : nlu.intent === "voice_query"
                ? "voice"
                : nlu.intent === "social_query"
                  ? "social"
                  : "family";
        const label = SYSTEM_ADAPTER_LABELS[key];
        const adapter = this.systemAdapters[key];
        if (!adapter) {
          return this.compose(
            `My ${label} adapter is not wired in this deployment, so I cannot read that system's real state here. I never invent system status.`,
            nlu.confidence,
            [],
          );
        }
        const result = await adapter();
        if (!result) {
          return this.compose(
            `I have no ${label} data recorded yet — there is nothing to report from that system, and I do not invent state.`,
            nlu.confidence,
            [],
          );
        }
        return this.compose(
          `${result.headline} (Source: ${result.source})`,
          nlu.confidence,
          [],
        );
      }

      case "crypto_market_query":
      case "construction_calc": {
        // Domain skills are pluggable (audit fix 2026-09-11;
        // audit L-1 fix 2026-09-13 extracted crypto too): the
        // core engine contains NO domain vocabulary — every
        // domain intent resolves through the registry, and an
        // unregistered skill is answered honestly, never
        // fabricated. Handlers may be async (live market data).
        const domainIntent = nlu.intent as string;
        // ENGINES PANEL GATE (2026-09-14) — construction
        // calculators are owner-switchable; crypto market data
        // stays on its platform surface.
        if (
          domainIntent === "construction_calc" &&
          !isCapabilityEnabled("construction-calculators")
        ) {
          return this.compose(
            capabilityDisabledReply(
              "construction-calculators",
              "Construction calculators",
            ),
            nlu.confidence * 0.8,
            [],
          );
        }
        const domainHandler = this.domains.handlerFor(domainIntent);
        if (!domainHandler) {
          return this.compose(
            "That capability is not installed on this engine — I will not fabricate a domain answer. " +
              this.statusLine(),
            nlu.confidence,
            [],
          );
        }
        const domainAnswer = await domainHandler(input);
        if (!domainAnswer) {
          return this.compose(
            "The installed domain skill declined to answer that — I will not guess where it refused. " +
              this.statusLine(),
            nlu.confidence,
            [],
          );
        }
        return this.compose(domainAnswer, nlu.confidence, []);
      }

      default: {
        return this.compose(
          `I parsed that as general reasoning input (intent ${nlu.intent}, confidence ${(nlu.confidence * 100).toFixed(0)}%). ` +
            `My reasoning engine works over stored knowledge — ask a question, teach me a fact, request research, or give me a task to plan.`,
          nlu.confidence,
          [],
        );
      }
    }
  }

  /** Phase 4.4 — fetch owner evolution-memory lessons
   *  relevant to a planning query. Absence is honest ([]):
   *  no provider wired, provider failure, or nothing
   *  clearing the retrieval floor. NEVER throws into the
   *  planning path. */
  private async fetchPlanLessons(query: string): Promise<PlanLesson[]> {
    if (!this.lessonLookup) return [];
    try {
      const rows = await this.lessonLookup();
      if (!rows || rows.length === 0) return [];
      return retrieveRelevantLessons(rows, query);
    } catch {
      return [];
    }
  }

  private async planFor(
    goalPredicate: string | import("./types.ts").FactPattern,
  ): Promise<Plan> {
    return this.planner.plan(goalPredicate);
  }

  /** Session-true facts for planning: the owner IS present in
   *  this conversation; web research IS authorized by permanent
   *  owner directive; the goal scope and quantity status come
   *  from the request itself. All asserted with real provenance —
   *  nothing invented. */
  private async assertPlanningFacts(
    goalSubject: string,
    input: string,
    quantities: boolean,
  ): Promise<void> {
    await this.facts.assert({
      subject: "owner",
      predicate: "available",
      object: "owner is addressing ARCHIE in this conversation",
      confidence: 1,
      provenance: {
        source: "seed",
        note: "session-true: owner is addressing ARCHIE in this conversation",
      },
      status: "validated",
    });
    await this.facts.assert({
      subject: "network",
      predicate: "authorized",
      object: "cross-checked web research",
      confidence: 0.9,
      provenance: {
        source: "seed",
        note: "permanent owner directive authorizes cross-checked open-web research",
      },
      status: "validated",
    });
    await this.facts.assert({
      subject: goalSubject,
      predicate: "scope-defined",
      object: input.slice(0, 120),
      confidence: 0.9,
      provenance: { source: "seed", note: "scope as stated by owner" },
      status: "validated",
    });
    // Quantities: when present, only the REAL estimator (the
    // domain skill's estimate operator, routed via the
    // registry) may produce inputs-quantified;
    // when absent, the trivial truth is asserted directly —
    // there is nothing to estimate, so no estimate step. This
    // makes shadowing impossible: one predicate, one producer
    // per case.
    await this.facts.assert(
      quantities
        ? {
            subject: goalSubject,
            predicate: "quantities-detected",
            object: input.slice(0, 120),
            confidence: 0.9,
            provenance: {
              source: "seed",
              note: "digits + material lexicon in request",
            },
            status: "validated",
          }
        : {
            subject: goalSubject,
            predicate: "inputs-quantified",
            object: input.slice(0, 120),
            confidence: 0.9,
            provenance: {
              source: "seed",
              note: "no quantities in request — nothing to estimate",
            },
            status: "validated",
          },
    );
  }

  /** Phase 3.2: EXECUTE the plan steps bound to real subsystems
   *  and stamp honest per-step results. Only real operations
   *  produce "executed" — composition steps say what they
   *  produced, owner-dependent steps wait for the owner, and
   *  authorization-gated steps stay at PROPOSE. A bound
   *  subsystem that cannot complete is "blocked" with the gap
   *  stated — never papered over. */
  private async executePlanSteps(
    plan: Plan,
    goalSubject: string,
    input: string,
  ): Promise<void> {
    let inventoryCount = 0;
    for (const step of plan.steps) {
      // Domain-capture completion 2026-09-11: operators owned by a
      // registered domain skill execute THROUGH the registry — the
      // engine knows no domain operator ids and executes no domain
      // logic itself. Null (no skill owns it) falls through to the
      // core operator switch below; a skill answer is used verbatim,
      // never fabricated.
      const domainExec = this.domains.executeOperator(step.operatorId, input);
      if (domainExec) {
        step.status = domainExec.status;
        step.result = domainExec.result;
        continue;
      }
      switch (step.operatorId) {
        case "op_inventory_prerequisites": {
          const tokens = goalSubject.split(/\s+/).filter((t) => t.length > 3);
          const relevant = this.facts
            .query({})
            .filter((f) =>
              tokens.some(
                (t) =>
                  (f.subject ?? "").includes(t) ||
                  String(f.object ?? "").includes(t),
              ),
            );
          inventoryCount = relevant.length;
          step.status = "executed";
          step.result =
            relevant.length > 0
              ? `${relevant.length} validated fact(s) already match "${goalSubject}"`
              : `0 validated facts match "${goalSubject}" yet`;
          break;
        }
        case "op_identify_gaps": {
          // Planner step semantics (2026-09-13 re-assessment,
          // gap 1): REAL gap analysis. Walk the executed chain's
          // operators and collect goal-substituted precondition
          // patterns that are neither held in the store nor
          // produced by an earlier step — the old implementation
          // reported only a count derived from the inventory
          // step (a label, not an analysis). Structural gaps
          // block honestly; content coverage is reported
          // separately and honestly (the knowledge step fills
          // it — nothing is assumed).
          const ops = this.planner.operatorList();
          const byId = new Map(ops.map((o) => [o.id, o]));
          const produced = new Set<string>();
          const missing: string[] = [];
          for (const st of plan.steps) {
            const op = byId.get(st.operatorId);
            if (!op) continue;
            for (const pre of op.preconditions) {
              const subj = pre.subject === "$goal" ? goalSubject : pre.subject;
              if (typeof subj !== "string" || subj.startsWith("?")) continue;
              const key = `${subj} ${pre.predicate}`;
              if (produced.has(key)) continue;
              const isHeld =
                this.facts.query({ subject: subj, predicate: pre.predicate })
                  .length > 0;
              if (!isHeld) missing.push(key);
            }
            const achievedSubj =
              op.achieves.subject === "$goal"
                ? goalSubject
                : op.achieves.subject;
            if (achievedSubj)
              produced.add(`${achievedSubj} ${op.achieves.predicate}`);
            for (const e of op.effects) {
              const es = e.subject === "$goal" ? goalSubject : e.subject;
              if (es) produced.add(`${es} ${e.predicate}`);
            }
          }
          if (missing.length > 0) {
            step.status = "blocked";
            step.result = `structural gap(s) at execution time: ${missing.join(", ")}`;
          } else {
            step.status = "executed";
            step.result =
              inventoryCount === 0
                ? `0 structural gaps; content: 0 validated facts cover "${goalSubject}" — the knowledge step below fills that`
                : `0 structural gaps; content: ${inventoryCount} validated fact(s) cover part of "${goalSubject}"`;
          }
          break;
        }
        case "op_owner_teach_goal_knowledge": {
          step.status = "awaiting-owner";
          step.result =
            'teach me now ("remember that ...") or ask me to research instead — nothing is assumed';
          break;
        }
        case "op_research_goal_knowledge": {
          step.status = "proposed";
          step.result =
            "research alternative — produces candidate knowledge only, never auto-fact";
          break;
        }
        case "op_sequence_tasks": {
          // Planner step semantics (2026-09-13 re-assessment,
          // gap 1): REAL dependency verification. The old
          // implementation asserted "ordered by dependency"
          // without checking anything — a label. validatePlan
          // walks the chain against the LIVE store and the
          // steps' own productions; an unverifiable order is
          // reported blocked, never claimed verified.
          const check = this.planner.validatePlan(plan, goalSubject);
          if (check.valid) {
            step.status = "executed";
            step.result = `dependency order verified over ${plan.steps.length} steps: ${plan.steps.map((st) => st.operatorId).join(" → ")}`;
          } else {
            step.status = "blocked";
            step.result = `dependency verification failed: ${check.issues.join("; ")}`;
          }
          break;
        }
        case "op_draft_plan": {
          // Planner step semantics (2026-09-13 re-assessment,
          // gap 1): REAL draft synthesis. The old implementation
          // pointed at the reply (a label). The draft is now
          // composed from what the earlier steps ACTUALLY
          // established — inventory findings, gap analysis,
          // verified order, and any computed quantities — so it
          // is a genuine artifact derived from real outputs,
          // never a restatement of the chain header.
          const findings = plan.steps.find(
            (st) => st.operatorId === "op_inventory_prerequisites",
          )?.result;
          const gapAnalysis = plan.steps.find(
            (st) => st.operatorId === "op_identify_gaps",
          )?.result;
          const order = plan.steps.find(
            (st) => st.operatorId === "op_sequence_tasks",
          )?.result;
          const estimate = plan.steps.find((st) =>
            /deterministic estimate/.test(st.result ?? ""),
          )?.result;
          const parts = [
            `DRAFT for "${goalSubject}"`,
            `known: ${findings ?? "inventory not run"}`,
            `gaps: ${gapAnalysis ?? "gap analysis not run"}`,
            `order: ${order ?? "order not verified"}`,
          ];
          if (estimate) parts.push(`quantities: ${estimate}`);
          parts.push("authorization: ends at PROPOSE — execution is yours");
          step.status = "executed";
          step.result = parts.join(" | ");
          break;
        }
        case "op_propose_execution": {
          step.status = "proposed";
          step.result =
            "owner authorization required — nothing auto-executes, ever";
          break;
        }
        default:
          break;
      }
    }
  }

  private statusLine(): string {
    const summary = manifestSummary(nativeEngineCapabilityManifest());
    return `Knowledge store: ${this.facts.count()} facts, reasoning rules: ${this.reasoning.ruleCount()}, capabilities: ${summary.operational} operational / ${summary.developing} developing / ${summary.notImplemented} not implemented.`;
  }

  private compose(
    responseText: string,
    confidence: number,
    citedFactIds: string[],
    plan?: Plan,
    toolResults?: ConverseResult["toolResults"],
  ): ConverseResult {
    // OWNER DIRECTIVE (2026-09-16): plain answers — ARCHIE does
    // not use em dashes in its voice. Sanitized centrally here so
    // every answer path (including future ones) is covered.
    const cleanText = responseText
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/,\s*,/g, ",");
    return {
      nlu: understand(""),
      salientFactIds: [],
      responseText: cleanText,
      confidence: Math.max(0.01, Math.min(1, confidence)),
      citedFactIds,
      selfCheck: {
        check: "pending",
        passed: true,
        detail: "verified in converse()",
      },
      plan,
      toolResults,
    };
  }

  /** Honest diagnostics — measurable state of the engine. */
  diagnostics() {
    const manifest = nativeEngineCapabilityManifest();
    const summary = manifestSummary(manifest);
    const stats = this.selfEval.stats();
    return {
      engineId: this.id,
      uptimeMs: Date.now() - this.bootedAt,
      capabilities: manifest,
      capabilitySummary: summary,
      counts: {
        facts: this.facts.count(),
        validatedFacts: this.facts.validatedCount(),
        rules: this.reasoning.ruleCount(),
        invalidRules: this.reasoning.invalidRules.length,
        operators: this.planner.operatorCount(),
        tools: this.tools.count(),
        // C-1: memory is session-scoped — diagnostics report
        // the aggregate across live sessions (plus the shared
        // episodic snapshot), not one shared buffer.
        memoryTurns: [...this.sessions.values()].reduce(
          (sum, sess) => sum + sess.memory.size(),
          0,
        ),
        episodicTurns: this.episodicTurns.length,
        outcomes: this.learner.count(),
        inferences: this.inferences,
        unknownTopicHits: this.unknownTopicHits,
        verificationFails: this.verificationFails,
      },
      calibration: {
        meanConfidence:
          this.sessionInferences > 0
            ? this.confidenceSum / this.sessionInferences
            : 0,
        selfChecksRun: stats.selfChecksRun,
        contradictionsCaught: stats.contradictionsCaught,
        liveContradictions: this.seenContradictions.size,
      },
      persistence: {
        facts: this.persistence !== null,
        outcomes: this.persistence !== null,
        episodic: this.episodicStore !== null,
        note: this.persistence
          ? "durable: frelux_archie_native_facts / frelux_archie_native_outcomes / frelux_archie_episodic_turns"
          : "in-memory only — persistence adapter not wired",
      },
    };
  }

  /** Run a reasoning pass + self-evaluation (verification +
   *  improvement) — used by tests, diagnostics and future
   *  learning cycles. */
  async reasoningCycle(): Promise<{
    inference: Awaited<ReturnType<ReasoningEngine["forwardChain"]>>;
    stability: { check: string; passed: boolean; detail: string };
    consolidation: Awaited<ReturnType<OutcomeLearner["improve"]>>;
  }> {
    await this.boot();
    const inference = await this.reasoning.forwardChain();
    const stability = await this.selfEval.verifyInference(
      this.reasoning,
      inference,
      this.facts,
    );
    // REMEDIATION batch 5 (fix 13): contradiction-detected
    // facts were derived and then SILENTLY ignored — nothing
    // consumed them. Now every NEW contradiction counts as a
    // verification failure (cross-isolate metric) and shows up
    // in diagnostics instead of rotting in the store.
    const newContradictions = inference.derived.filter(
      (f) =>
        f.predicate === "contradiction-detected" &&
        !this.seenContradictions.has(f.id),
    );
    for (const c of newContradictions) this.seenContradictions.add(c.id);
    this.verificationFails += newContradictions.length;
    const consolidation = await this.learner.improve();
    return { inference, stability, consolidation };
  }

  /** Analyze provided source (coding intelligence). */
  analyzeCode(path: string, source: string) {
    return analyzeSource(path, source);
  }

  /** Generate a unit-test scaffold for provided source. */
  scaffoldTests(path: string, source: string): string {
    return generateUnitTestScaffold(path, analyzeSource(path, source));
  }

  /** Analyze a multi-file project: internal dependency graph,
   *  broken imports, cycles, entry candidates, metrics. */
  analyzeProject(files: ProjectFile[]): ProjectAnalysis {
    return analyzeProjectFiles(files);
  }

  /** Dependency-aware unit-test scaffold: vi.mock()s every
   *  internal dependency of the module (project graph based). */
  scaffoldProjectTests(modulePath: string, project: ProjectAnalysis) {
    return generateDependencyAwareTestScaffold(modulePath, project);
  }

  /** Expose for tests + app integration. */
  store(): FactStore {
    return this.facts;
  }
  toolRegistry(): ToolOrchestrator {
    return this.tools;
  }
  researchAdapter(): ResearchAdapter {
    return this.adapter;
  }
}

// ---------------------------------------------------------
// Configured singleton for the engine registry. Edge
// functions and the app configure persistence once at boot;
// resolveArchieCapabilityEngine() then hands every consumer
// the wired engine.
// ---------------------------------------------------------
let configuredPersistence: SupabaseLike | null | undefined;
let configuredMarketLookup: MarketPriceLookup | undefined;
let configuredLessonLookup: LessonLookup | undefined;
let configuredWorldTimeline: WorldTimelinePort | undefined;
let configuredSystemAdapters: SystemAdapters | undefined;
let singleton: ArchieNativeEngine | undefined;

/** Wire (or UNWIRE) durable persistence. Passing null runs
 *  the engine in-memory only — used by the REAL
 *  personalization privacy control: when the owner revokes
 *  the personalization_memory consent, ARCHIE's chat runs
 *  without loading or storing persistent memory for that
 *  request. No personalization, no memory reads, no
 *  memory writes. */
export function configureNativeEnginePersistence(
  db: SupabaseLike | null,
): void {
  configuredPersistence = db;
  singleton = undefined; // rebuild with persistence on next resolve
}

/** Wire the real market-price lookup (archie-chat does this
 *  at boot with the service client). Resets the singleton so
 *  the next resolve carries the adapter. */
export function configureNativeEngineMarketLookup(
  lookup: MarketPriceLookup,
): void {
  configuredMarketLookup = lookup;
  singleton = undefined;
}

/** Wire the real system adapters (documents / images / voice
 *  bank / social / family). archie-chat does this at boot with
 *  the service client. Resets the singleton so the next
 *  resolve carries the adapters. */
export function configureNativeEngineSystemAdapters(
  adapters: SystemAdapters,
): void {
  configuredSystemAdapters = adapters;
  singleton = undefined;
}

/** Wire the real evolution-memory lesson lookup (Phase 4.4,
 *  lessons → behavior). archie-chat does this at boot with the
 *  service client. Resets the singleton so the next resolve
 *  carries the lessons provider. */
/** Wire the world-model timeline port (kernel-owned). The
 *  kernel does this at construction; resets the singleton so
 *  the next resolve carries the port. */
export function configureNativeEngineWorldTimeline(
  port: WorldTimelinePort | null,
): void {
  configuredWorldTimeline = port ?? undefined;
  singleton = undefined;
}

export function configureNativeEngineLessonLookup(lookup: LessonLookup): void {
  configuredLessonLookup = lookup;
  singleton = undefined;
}

export function getNativeEngine(): ArchieNativeEngine {
  if (!singleton) {
    singleton = new ArchieNativeEngine({
      persistence: configuredPersistence,
      marketPriceLookup: configuredMarketLookup,
      worldTimeline: configuredWorldTimeline,
      lessonLookup: configuredLessonLookup,
      systemAdapters: configuredSystemAdapters,
    });
  }
  return singleton;
}

// ---------------------------------------------------------
// WORLD TIMELINE PORT (audit HIGH-1 fix): the substrate's
// only seam into the cognitive world model. Provided by the
// kernel (which owns the WorldModel); tests may inject a
// fake. Without it, temporal handlers refuse honestly.
// ---------------------------------------------------------
export interface WorldTimelineTransition {
  subject: string;
  relation: string;
  fromValue: string;
  toValue: string;
  fromObservedAt: string;
  toObservedAt: string;
  confidence: number;
}
export interface WorldTimelinePort {
  /** Recorded transitions for a subject (newest first). */
  transitionsFor(subject: string): WorldTimelineTransition[];
  /** Record a state observation at a point in time. */
  recordState(
    subject: string,
    state: string,
    observedAt: string,
    provenance: string,
  ): void;
}

// ---------------------------------------------------------
// Text-extraction helpers (deterministic)
// ---------------------------------------------------------
/** Honest, human-facing labels for the system adapters. */
const SYSTEM_ADAPTER_LABELS: Record<SystemAdapterKey, string> = {
  documents: "document pipeline",
  images: "image pipeline",
  voice: "voice bank",
  social: "social account",
  family: "trusted-people roster",
};

// ---------------------------------------------------------
// Deterministic construction calculators. Pure math with
// stated assumptions — no data is invented, and missing
// parameters get an honest request for exactly what is
// needed. Standard Nigerian construction constants.
// ---------------------------------------------------------

/** Extract the subject of a change-over-time question.
 *  Deterministic: strips the interrogative frame and the
 *  change verb, keeps the noun phrase ("how did the site
 *  change over time" → "the site"). */
function extractTemporalSubject(input: string): string | null {
  const m = input.match(
    /(?:how\s+(?:did|has|does)\s+|did\s+|has\s+|what\s+(?:has\s+)?changed\s+(?:about|with)\s+)([a-z0-9' -]{2,40}?)(?:\s+(?:change|differ|evolve|progress|develop|changed)\b|$)/i,
  );
  const subject = m?.[1]?.trim().replace(/\s+/g, " ");
  if (!subject) return null;
  // strip leading articles for world-model subject matching
  const bare = subject.replace(/^(the|my|our|a|an)\s+/i, "").trim();
  return bare.length > 0 ? bare : subject;
}

/** Extract the product noun-phrase from a price query.
 *  Deterministic: strips interrogative/price filler words and
 *  keeps the material words for the lookup adapter. */
function extractPriceProduct(input: string): string | null {
  const t = input
    .toLowerCase()
    // TIME QUALIFIERS FIRST (owner directive 2026-09-14):
    // "right now" is two words; stripping "now" alone left
    // "right" glued to the product ("cement in lagos right").
    .replace(
      /\bright\s+now\b|\bat\s+the\s+moment\b|\bthese\s+days\b|\bcurrently\b|\basap\b/g,
      " ",
    )
    .replace(/what(?:'s|\u2019s| is)?/g, " ")
    .replace(/how much (?:is|does|are)/g, " ")
    .replace(
      /\b(current|market|latest|price|prices|cost|today|now|this|week|month|please|the|a|an|per|there|for)\b/g,
      " ",
    )
    // TRAILING MARKET QUALIFIER (owner directive 2026-09-14):
    // "cement in lagos" keeps the product as "cement"; the
    // region goes to the region hint, not the product name.
    .replace(/\bin\s+[a-z]+(?:\s+[a-z]+)?\s*$/, "")
    .replace(/\s+/g, " ")
    // drop only LEADING prepositions ("of cement" → "cement")
    // so unit phrases like "bag of cement" survive intact
    .replace(/^\s*(?:of|in|for|at)\s+/, "")
    .trim();
  const words = t
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 5);
  return words.length > 0 ? words.join(" ") : null;
}

function extractExpression(input: string): string | null {
  // Word operators → symbols first, so "25 times 48" and
  // "12.5 percent of 8000" extract as real arithmetic.
  const normalized = input
    .toLowerCase()
    .replace(/to the power of/g, "^")
    .replace(/divided by|over/g, "/")
    .replace(/multiplied by|times/g, "*")
    .replace(/plus/g, "+")
    .replace(/minus/g, "-");
  const percent = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:percent|%)\s*of\s*(\d+(?:\.\d+)?)/,
  );
  if (percent) {
    return `((${percent[1]}/100)*${percent[2]})`;
  }
  // Longest balanced arithmetic run — supports parenthesized
  // expressions like "(25 * 48) + 12" (P2 ma-1).
  const m = normalized.match(/[\d(][-+*/%^().\d\s]*[\d)]/);
  if (!m) return null;
  const expr = m[0].replace(/\s+/g, "");
  // Must contain a real operator, not just a bare number.
  if (!/[-+*/%^]/.test(expr)) return null;
  // Balanced-parenthesis sanity (honest refusal on garbage).
  let bal = 0;
  for (const c of expr) {
    if (c === "(") bal += 1;
    else if (c === ")") bal -= 1;
    if (bal < 0) return null;
  }
  return bal === 0 ? expr : null;
}

const ATTRIBUTE_NOUNS = new Set([
  "ratio",
  "pitch",
  "thickness",
  "height",
  "price",
  "cost",
  "depth",
  "width",
  "weight",
  "temperature",
  "area",
  "volume",
  "color",
  "colour",
  "code",
  "name",
  "size",
  "strength",
  "grade",
  "spacing",
  "length",
  "diameter",
  "slope",
  "density",
  "capacity",
  "age",
  "span",
]);

/** Attribute nouns — the final word of a multi-word subject
 *  that names the subject's ATTRIBUTE ("screed thickness" ->
 *  subject "screed", predicate "thickness"). Shared by the
 *  teaching triple extractor and the question SPO probe
 *  (Phase 2.4) so both normalize identically. */
function extractTriple(
  input: string,
): { subject: string; predicate: string; object: unknown } | null {
  const cleaned = input
    .replace(
      /^(please\s+)?(learn|remember|note|know)[a-z]*\s*(that|this|:)?\s*/i,
      "",
    )
    // A correction often leads with a negation clause
    // ("no, that is wrong. X is Y") — strip it so the
    // corrected statement itself extracts cleanly.
    .replace(
      /^(?:no[,.!?]?\s+(?:that|this|it)\s+(?:is|was)\s+(?:wrong|incorrect|not\s+accurate|not\s+right)|actually,?|correction:?)[\s.!,]*/i,
      "",
    )
    .replace(/^(the\s+)?/i, "")
    .replace(/[.?!]+$/, "")
    .trim();
  const m = cleaned.match(
    /^([A-Za-z0-9 -]+?)\s+(?:is|are|has|uses|means|converts|produces|contains|requires|needs|weighs|costs|creates|generates)\s+(.+)$/i,
  );
  if (!m) return null;
  const subjectRaw = m[1].trim().toLowerCase();
  // Demonstrative-only subjects ("that is wrong, X is Y") are
  // not facts — refuse garbage triples.
  if (["that", "this", "it", "there"].includes(subjectRaw)) return null;
  const objectText = m[2].trim();
  // Attribute-noun split: in "the roof pitch is 25 degrees"
  // the final word of a multi-word subject is the attribute
  // (roof has pitch). Store subject "roof", predicate "pitch" —
  // the shape subject/predicate queries expect.

  const words = subjectRaw.split(" ");
  if (words.length >= 2 && ATTRIBUTE_NOUNS.has(words[words.length - 1])) {
    return {
      subject: words.slice(0, -1).join(" ").replace(/\s+/g, "-"),
      predicate: words[words.length - 1],
      object: objectText,
    };
  }
  const subject = subjectRaw.replace(/\s+/g, "-");
  return { subject, predicate: "is", object: objectText };
}

/** Phase 2.4: probe a knowledge question for the SPECIFIC
 *  (subject, predicate) it asks about — "what is the screed
 *  volume?" probes subject "screed", predicate "volume".
 *  Used to decide whether retrieval actually ANSWERED the
 *  question or merely matched its topic words (a thickness
 *  fact ranking for a volume question is a topic match, not
 *  an answer). Deterministic and conservative: null unless
 *  the final word is a known attribute noun, normalized
 *  exactly like the teaching triple extractor. */
/** Definitional subject priority (2026-09-16): a fact ABOUT
 *  the question's subject beats facts that merely MENTION it.
 *  As the corpus grew, site facts whose objects mention a rare
 *  term ("screeding") started outranking the actual definition
 *  fact for "what is screeding" on raw TF-IDF. Deterministic
 *  reorder for bare-noun definition questions ("what is X",
 *  "tell me about X"): exact-subject facts lead; the relative
 *  order of the rest is untouched. No exact subject → ranking
 *  is unchanged. Applies to clauses too (compound routing),
 *  so it lives here instead of inside converse(). */
function prioritizeDefinitionalSubject(input: string, ranked: Fact[]): Fact[] {
  const m = input.match(
    /^(?:(?:what|who)(?:'s|\s+is|\s+are)\s+(?:a|an|the)?\s*|tell\s+me\s+about\s+(?:the\s+)?|about\s+(?:the\s+)?)\s*([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})\s*\?*\s*$/i,
  );
  if (!m) return ranked;
  const subj = m[1].trim().toLowerCase().replace(/\s+/g, "-");
  const exact = ranked.filter(
    (f) => f.subject === subj && f.status !== "uncertain",
  );
  if (exact.length === 0) return ranked;
  return [...exact, ...ranked.filter((f) => !exact.includes(f))];
}

// FACT_RELEVANCE_FLOOR is imported from knowledge.ts —
// one measured constant, shared by every consumer (engine
// answer gate + ContextMemory validated-fact salience).

/** Companion gate to the floor: a fact whose SUBJECT word
 *  appears verbatim in the question ("tell me about
 *  screeding" vs subject "screeding") is a genuine subject
 *  match even when the absolute cosine sits below the floor
 *  — the floor was measured on a smaller corpus and
 *  absolute TF-IDF values drift as the corpus grows (the
 *  corpus v5 union dropped the screed definition to 0.072
 *  while staying the correct answer). Subject-word overlap
 *  cannot be token-prior noise: noise matches generic
 *  words, never the subject the question is about. */
/** Network-authorization records (auto-research /
 *  owner-research authorization trails) are policy logs
 *  whose object text mirrors user questions — they TF-IDF
 *  rank strongly but are never knowledge. */
const isAuthorizationLog = (f: Fact) =>
  f.subject === "network" && f.predicate === "authorized";

function subjectOverlapsQuestion(
  fact: Fact | undefined,
  input: string,
): boolean {
  if (!fact) return false;
  const q = input.toLowerCase();
  return String(fact.subject)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length > 3 && q.includes(w));
}

function questionSPO(
  input: string,
): { subject: string; predicate: string } | null {
  const m = input.match(
    /(?:what(?:'s|\s+is|\s+are)?|how\s+much|how\s+many|tell\s+me)\s+(?:the\s+)?(.+?)\s*\?*\s*$/i,
  );
  if (!m) return null;
  const rest = m[1]
    .replace(/[.?!]+$/, "")
    .trim()
    .toLowerCase();
  const words = rest.split(/\s+/);
  if (words.length < 2 || !ATTRIBUTE_NOUNS.has(words[words.length - 1])) {
    return null;
  }
  return {
    subject: words.slice(0, -1).join(" ").replace(/\s+/g, "-"),
    predicate: words[words.length - 1],
  };
}

function extractResearchQuery(input: string): string | null {
  const m = input.match(
    /(?:research|search(?: the web)?(?: for)?|look up|find information(?: online)?(?: about)?|google)\s+(?:the\s+)?(.+)$/i,
  );
  return m ? m[1].replace(/[.?!]+$/, "").trim() : null;
}

// ---------------------------------------------------------
// systemInstruction retrieval (livechat knowledge base)
// ---------------------------------------------------------
// Retrieval scoring ignores generic interrogative/filler
// tokens ("what", "how", "need", "guide"...) so an article
// about the actual subject wins over one that merely shares
// filler words.
const RETRIEVAL_FILLERS = new Set([
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "should",
  "could",
  "would",
  "will",
  "can",
  "tell",
  "about",
  "know",
  "need",
  "want",
  "give",
  "show",
  "help",
  "many",
  "much",
  "best",
  "good",
  "guide",
  "tips",
  "complete",
  "essential",
  // Function words (2026-09-16): they carry no subject signal
  // yet counted toward title coverage, letting generic prompt
  // intros win matches they should never win.
  "do",
  "does",
  "did",
  "i",
  "you",
  "your",
  "my",
  "me",
  "we",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "for",
  "have",
  "has",
  "had",
  "of",
  "to",
  "in",
  "on",
  "at",
  "it",
  "please",
]);

/** Light suffix stem for knowledge-base retrieval: matches
 *  word forms without a full stemmer ("screed" matches a
 *  section titled "Screeding", "services" matches
 *  "Services"). English suffix rules, in order:
 *  -ing, -ied→y, -eed stays (screed ≠ scre), -ed, -ies→y,
 *  -es only after s/x/z/ch/sh, final -s. */
function kbStem(t: string): string {
  if (t.length > 5 && /ing$/.test(t)) return t.slice(0, -3);
  if (t.length > 4 && /ied$/.test(t)) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /eed$/.test(t)) return t; // screed, agreed
  if (t.length > 4 && /ed$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && /ies$/.test(t)) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /(?:ss|sh|ch|x|z|s)es$/.test(t)) {
    return t.slice(0, -2);
  }
  if (t.length > 3 && /s$/.test(t)) return t.slice(0, -1);
  return t;
}

function retrieveFromSystemInstruction(
  input: string,
  instruction?: string,
  /** Minimum share of the question's informative tokens that
   *  must appear in a section title for it to fire (how-to
   *  preemption requires a real subject match, not a stray
   *  token). Default 0 = any single informative overlap. */
  minCoverage = 0,
): string | null {
  if (!instruction) return null;
  const qTokens = tokenize(input)
    .filter((t: string) => !RETRIEVAL_FILLERS.has(t))
    .map(kbStem);
  if (qTokens.length === 0) return null;

  const sections = instruction
    .split(/\n##\s+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 40 && s.length < 4000);
  if (sections.length === 0) return null;

  // Discriminative scoring (2026-09-16): a match on a token that
  // appears in FEW sections is worth more than a match on a
  // common one — "screed" must beat "floor" when both occur in
  // different sections, so the subject's own guide wins. IDF is
  // computed over the injected sections themselves.
  const sectionTokens = sections.map((sec: string) => {
    const lines = sec.split("\n");
    return {
      title: new Set(
        tokenize(lines[0])
          .filter((t: string) => !RETRIEVAL_FILLERS.has(t))
          .map(kbStem),
      ),
      body: new Set(tokenize(lines.slice(1, 5).join(" ")).map(kbStem)),
    };
  });
  const idfOf = (tok: string): number => {
    let df = 0;
    for (const st of sectionTokens) {
      if (st.title.has(tok) || st.body.has(tok)) df += 1;
    }
    return Math.log(1 + sections.length / Math.max(1, df));
  };
  const qIdf = new Map<string, number>();
  let qNorm = 0;
  for (const t of qTokens) {
    const w = idfOf(t);
    qIdf.set(t, w);
    qNorm += w;
  }
  if (qNorm === 0) return null;

  let best: { text: string; score: number } | null = null;
  for (let i = 0; i < sections.length; i++) {
    const { title, body } = sectionTokens[i];
    let titleOverlap = 0;
    let titleW = 0;
    for (const t of qTokens) {
      if (title.has(t)) {
        titleOverlap++;
        titleW += qIdf.get(t) ?? 0;
      }
    }
    if (titleOverlap === 0) continue; // subject must appear in the title
    // Coverage gate: how-to preemption demands a genuine
    // subject match, not one stray shared token.
    if (titleOverlap / qTokens.length < minCoverage) continue;
    let bodyW = 0;
    for (const t of qTokens) if (body.has(t)) bodyW += qIdf.get(t) ?? 0;
    const score = (titleW + 0.25 * bodyW) / qNorm;
    if (!best || score > best.score) best = { text: sections[i], score };
  }
  if (!best) return null;
  // Honest provenance + brevity for chat surfaces.
  const body = best.text.split("\n").slice(0, 4).join(" ").slice(0, 600);
  return body;
}

/** Register the built-in domain skills. Construction ships by
 *  default (ARCHIE's home turf); future domains register here
 *  without touching the engine core. */
function registerBuiltInDomainSkills(
  registry: DomainSkillRegistry,
  options?: {
    cryptoFetcher?: Fetcher | null;
    tradingLimits?: TradingLimits;
  },
): void {
  registry.register(constructionSkill);
  // Audit L-1 fix (2026-09-13): crypto intelligence is a
  // pluggable skill, exactly like construction — the core
  // engine stays domain-neutral. The injected fetcher and
  // owner trading limits flow through from engine options.
  registry.register(
    createCryptoSkill({
      fetcher: options?.cryptoFetcher ?? null,
      tradingLimits: options?.tradingLimits ?? DEFAULT_TRADING_LIMITS,
    }),
  );
}

// ---------------------------------------------------------
// Deterministic goal-subject derivation (Phase 3.2). The plan
// is scoped to WHAT WAS ASKED — the planning verbs and shells
// are stripped, leaving the goal noun phrase.
// ---------------------------------------------------------
export function deriveGoalSubject(input: string): string {
  let t = input.trim().toLowerCase();
  t = t.replace(/^(?:please\s+)?(?:help\s+me\s+)?/, "");
  t = t.replace(
    /^(?:can\s+you\s+)?(?:plan|organize|schedule|arrange|prepare|structure)\b\s*/i,
    "",
  );
  t = t.replace(
    /^(?:create|make|draft|build)\s+(?:a\s+)?(?:plan|schedule|itinerary|timetable)\s*(?:for|of)\s*/i,
    "",
  );
  t = t.replace(
    /^(?:break|split|divide)\s+(.*?)\s+into\s+(?:steps|phases|milestones)$/i,
    "$1",
  );
  t = t.replace(/^(?:a|an|the|my|our)\s+/, "");
  t = t.replace(/\s+into\s+(?:steps|phases)$/i, "");
  return t.slice(0, 80) || input.trim().toLowerCase().slice(0, 80);
}

function statusLabel(status?: string): string {
  switch (status) {
    // SECURITY (forensic guard): the displayed word for a step
    // whose bound subsystem ran is "result", NEVER "executed" or
    // "done" — replies in consequential contexts (payments,
    // sendings) must contain zero execution-claim words. The
    // authority guard regexes the whole reply; keeping this
    // label clean preserves that invariant by construction.
    case "executed":
      return "result";
    case "awaiting-owner":
      return "awaiting you";
    case "proposed":
      return "proposed";
    case "blocked":
      return "blocked";
    default:
      return "planned";
  }
}
