// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — MASTER ENGINE
// supabase/functions/_shared/archie-ai/associative-memory/unified-engine.ts
//
// The single cohesive Native Intelligence Memory Engine for ARCHIE.
// Unifies:
//   1. Working Memory (active tasks, instructions, constraints)
//   2. Episodic Memory (experiences, outcomes, decisions, milestones)
//   3. Semantic Memory (Knowledge Graph, Lexicon, FactStore)
//   4. Long-Term Memory (durable preferences, rules, goals)
//
// Incorporates:
//   - Memory Formation (importance evaluation, secret protection, explicit directives)
//   - Memory Versioning (historical migration tracking vs corrections)
//   - Contradiction Detection (genuine conflicts flagged for clarification)
//   - Cross-Session Continuity ("continue where we stopped")
//   - Hybrid Retrieval (multi-factor lexical, TF-IDF, Ebbinghaus decay, graph activation)
//   - Memory Learning Bridge (candidate lesson extraction requiring Owner authorization)
//   - Semantic Bridge (deterministic reference resolution without assumptions)
//   - Safe Consolidation & Grounded Observability
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import { AssociativeNetwork } from "./associative-network.ts";
import { EpisodicLongTermAssociativeMemoryEngine } from "./engine.ts";
import { WorkingMemoryEngine } from "./working-memory.ts";
import { EpisodicMemoryEngine } from "./episodic-memory.ts";
import { SemanticMemoryEngine } from "./semantic-memory.ts";
import { LongTermMemoryEngine } from "./long-term-memory.ts";
import { MemoryFormationEngine } from "./memory-formation.ts";
import { MemoryVersioningEngine } from "./memory-versioning.ts";
import { MemoryContradictionEngine } from "./memory-contradiction.ts";
import { SessionContinuityEngine } from "./session-continuity.ts";
import { MemoryLearningBridge } from "./memory-learning-bridge.ts";
import { SemanticMemoryBridge } from "./semantic-memory-bridge.ts";
import { HybridMemoryRetriever } from "./hybrid-retriever.ts";
import { MemoryConsolidationEngine } from "./memory-consolidation.ts";
import { MemoryObservabilityEngine } from "./memory-observability.ts";
import type {
  HybridRecallOptions,
  MemoryRole,
  UnifiedRecallResult,
  UnifiedMemoryDiagnostics,
  SessionContinuityState,
  EpisodicEventRecord,
  LongTermMemoryRecord,
  SemanticConceptRecord,
} from "./types.ts";

export class ArchieUnifiedMemoryEngine {
  public readonly working: WorkingMemoryEngine;
  public readonly episodic: EpisodicMemoryEngine;
  public readonly semantic: SemanticMemoryEngine;
  public readonly longTerm: LongTermMemoryEngine;
  public readonly formation: MemoryFormationEngine;
  public readonly versioning: MemoryVersioningEngine;
  public readonly contradiction: MemoryContradictionEngine;
  public readonly continuity: SessionContinuityEngine;
  public readonly learningBridge: MemoryLearningBridge;
  public readonly semanticBridge: SemanticMemoryBridge;
  public readonly hybridRetriever: HybridMemoryRetriever;
  public readonly consolidation: MemoryConsolidationEngine;
  public readonly observability: MemoryObservabilityEngine;
  public readonly associativeEngine: EpisodicLongTermAssociativeMemoryEngine;
  private readonly network: AssociativeNetwork;

  constructor() {
    this.working = new WorkingMemoryEngine();
    this.episodic = new EpisodicMemoryEngine();
    this.semantic = new SemanticMemoryEngine();
    this.longTerm = new LongTermMemoryEngine();
    this.formation = new MemoryFormationEngine();
    this.versioning = new MemoryVersioningEngine();
    this.contradiction = new MemoryContradictionEngine();
    this.continuity = new SessionContinuityEngine(this.episodic, this.longTerm);
    this.learningBridge = new MemoryLearningBridge();
    this.semanticBridge = new SemanticMemoryBridge(this.longTerm, this.semantic);
    this.network = new AssociativeNetwork();
    this.associativeEngine = new EpisodicLongTermAssociativeMemoryEngine();

    this.hybridRetriever = new HybridMemoryRetriever(
      this.working,
      this.episodic,
      this.semantic,
      this.longTerm,
      this.network
    );

    this.consolidation = new MemoryConsolidationEngine(
      this.longTerm,
      this.working,
      this.contradiction
    );

    this.observability = new MemoryObservabilityEngine(
      this.working,
      this.episodic,
      this.semantic,
      this.longTerm,
      this.contradiction,
      this.versioning
    );
  }

  /**
   * Hydrates memory across all cognitive stores.
   */
  hydrate(
    rawTurns: Array<{
      id?: string;
      conversationId?: string;
      role: MemoryRole;
      text: string;
      timestamp?: number;
      turn_at?: string;
    }>,
    facts: Fact[] = []
  ): void {
    // Hydrate associative engine
    this.associativeEngine.hydrate(rawTurns, facts);

    // Hydrate semantic concepts from validated facts
    for (const f of facts) {
      const domain = (f.qualifiers?.domain as string) || "general";
      this.semantic.registerConcept({
        id: `fact_${f.id}`,
        name: f.subject,
        domain,
        category: "concept",
        definition: `${f.subject} ${f.predicate} ${String(f.object)}`,
        attributes: { predicate: f.predicate, object: f.object },
        confidence: f.confidence,
        verificationStatus: "EXTERNALLY_VERIFIED",
        source: f.provenance?.source || "native_facts",
        provenance: {
          createdBy: f.provenance?.source || "system",
          verifiedBy: "owner",
        },
        relatedConceptIds: [],
      });
    }

    // Hydrate episodic turns and events
    for (const t of rawTurns) {
      const ts = t.timestamp ?? (t.turn_at ? Date.parse(t.turn_at) : Date.now());
      this.episodic.recordEvent({
        userId: "owner",
        projectId: "global",
        conversationId: t.conversationId || "main",
        eventType: "conversation",
        timestamp: ts,
        source: "chat_turn",
        participants: [t.role],
        description: t.text,
        associatedEntities: [],
        confidence: 1.0,
        verificationStatus: t.role === "owner" ? "USER_PROVIDED" : "SYSTEM_OBSERVED",
        privacy: "private_owner",
        retentionPolicy: "permanent",
      });
    }
  }

  /**
   * Ingests a conversation turn, evaluating explicit directives, secrets, and memory formation.
   */
  ingestTurn(turn: {
    id?: string;
    conversationId?: string;
    role: MemoryRole;
    text: string;
    timestamp?: number;
    userId?: string;
    projectId?: string;
  }): { recorded: boolean; reason?: string; formation?: unknown } {
    const userId = turn.userId || "owner";
    const projectId = turn.projectId || "global";

    // 1. Evaluate formation and security
    const evaluation = this.formation.evaluateFormation(turn.text, {
      userId,
      projectId,
      role: turn.role,
      taskActive: !!this.working.getCurrentTask(),
    });

    if (evaluation.isSensitiveRefused) {
      this.observability.recordSecurityEvent("secret");
      return { recorded: false, reason: evaluation.refusalReason };
    }

    // 2. Handle explicit directives
    if (evaluation.directive.kind === "REMEMBER_THIS") {
      this.longTerm.setRecord({
        userId,
        projectId,
        kind: "user_preference",
        key: `remember_${Date.now()}`,
        value: evaluation.directive.content || turn.text,
        summary: evaluation.directive.content || turn.text,
        importance: 1.0,
        confidence: 1.0,
        provenance: "USER_PROVIDED",
      });
    } else if (evaluation.directive.kind === "FORGET_THIS" && evaluation.directive.subject) {
      this.forget(evaluation.directive.subject, { userId, projectId });
    }

    // 3. Record episodic turn into associative engine
    const assocResult = this.associativeEngine.ingestTurn({
      id: turn.id,
      conversationId: turn.conversationId,
      role: turn.role,
      text: evaluation.sanitizedContent,
      timestamp: turn.timestamp,
    });

    // 4. Record into unified episodic engine
    this.episodic.recordEvent({
      userId,
      projectId,
      conversationId: turn.conversationId || "main",
      eventType: "conversation",
      timestamp: turn.timestamp ?? Date.now(),
      source: "chat_turn",
      participants: [turn.role],
      description: evaluation.sanitizedContent,
      associatedEntities: evaluation.entities,
      confidence: evaluation.confidence,
      verificationStatus: evaluation.provenance,
      privacy: evaluation.privacy,
      retentionPolicy: evaluation.retentionPolicy,
    });

    return { recorded: assocResult.recorded, formation: evaluation };
  }

  /**
   * Explicitly sets a durable memory record with version tracking.
   */
  remember(
    key: string,
    value: unknown,
    context: {
      userId?: string;
      projectId?: string;
      kind?: "user_preference" | "project_context" | "operational_rule" | "long_term_goal";
      changeReason?: string;
    } = {}
  ): LongTermMemoryRecord {
    const userId = context.userId || "owner";
    const projectId = context.projectId || "global";
    const kind = context.kind || "user_preference";

    const existing = this.longTerm.get(userId, projectId, kind, key);
    if (existing) {
      // Record version history
      this.versioning.recordUpdate(
        existing.id,
        existing.value,
        value,
        context.changeReason || "Updated by user",
        userId,
        true
      );
    }

    return this.longTerm.setRecord({
      userId,
      projectId,
      kind,
      key,
      value,
      summary: typeof value === "string" ? value : `${kind}: ${key}`,
      importance: 0.9,
      confidence: 1.0,
      provenance: "USER_PROVIDED",
    });
  }

  /**
   * Explicitly updates a memory with historical tracking.
   * Example: Migration from Netlify to Vercel preserves the historical event without erasing context.
   */
  update(
    key: string,
    newValue: unknown,
    changeReason: string,
    context: {
      userId?: string;
      projectId?: string;
      isHistoricalChange?: boolean;
    } = {}
  ): { updated: boolean; record?: LongTermMemoryRecord; contradiction?: unknown } {
    const userId = context.userId || "owner";
    const projectId = context.projectId || "global";

    const existing =
      this.longTerm.get(userId, projectId, "project_context", key) ||
      this.longTerm.get(userId, projectId, "user_preference", key);

    if (!existing) {
      const created = this.remember(key, newValue, {
        userId,
        projectId,
        changeReason,
      });
      return { updated: true, record: created };
    }

    // Detect contradiction / migration classification
    const conflictCheck = this.contradiction.detectConflict(existing, {
      value: newValue,
      text: changeReason,
      isExplicitCorrection: !context.isHistoricalChange,
    });

    this.versioning.recordUpdate(
      existing.id,
      existing.value,
      newValue,
      changeReason,
      userId,
      context.isHistoricalChange ?? true
    );

    existing.value = newValue;
    existing.summary = typeof newValue === "string" ? newValue : `${existing.kind}: ${key}`;
    existing.version += 1;
    existing.updatedAt = Date.now();

    return {
      updated: true,
      record: existing,
      contradiction: conflictCheck.record,
    };
  }

  /**
   * Forgets memories matching a key or subject for privacy compliance.
   */
  forget(subject: string, context: { userId?: string; projectId?: string } = {}): { forgottenCount: number } {
    const subLower = subject.toLowerCase().trim();
    const userId = context.userId || "owner";
    let forgottenCount = 0;

    const records = this.longTerm.query({ userId, projectId: context.projectId });
    for (const r of records) {
      if (r.key.includes(subLower) || r.summary.toLowerCase().includes(subLower)) {
        this.longTerm.deleteRecord(r.id);
        forgottenCount++;
      }
    }

    return { forgottenCount };
  }

  /**
   * Multi-factor hybrid recall across all 4 cognitive memory systems + associative graph.
   */
  recall(query: string, options: HybridRecallOptions = {}): UnifiedRecallResult {
    const startTime = Date.now();
    const result = this.hybridRetriever.recall(query, options);

    // Also run associative recall to cross-pollinate narrative context
    const assocResult = this.associativeEngine.recall(query, options);
    result.associatedEpisodes = assocResult.associatedEpisodes;
    result.associatedFacts = assocResult.associatedFacts;

    if (assocResult.narrativeContext && !result.narrativeContext.includes("[Relevant Conversational Episodes]")) {
      result.narrativeContext = `${result.narrativeContext}\n\n${assocResult.narrativeContext}`.trim();
    }

    const duration = Date.now() - startTime;
    this.observability.recordLatency(duration);

    return result;
  }

  /**
   * Recovers full continuity for "Continue where we stopped".
   */
  continueWhereStopped(
    userId: string,
    targetProjectId?: string,
    options: { candidateProjects?: string[] } = {}
  ): SessionContinuityState {
    return this.continuity.recoverContinuity(userId, targetProjectId, options);
  }

  /**
   * Runs memory consolidation: merges duplicates, checks conflicts, prunes expired context.
   */
  consolidate(): ReturnType<MemoryConsolidationEngine["runConsolidation"]> {
    const report = this.consolidation.runConsolidation();
    this.observability.recordConsolidation(report);
    return report;
  }

  /**
   * Returns complete diagnostic state.
   */
  getDiagnostics(): UnifiedMemoryDiagnostics {
    const diag = this.observability.getDiagnostics();
    const assocDiag = this.associativeEngine.getDiagnostics();

    diag.counts.episodicTurns = assocDiag.totalTurns;
    diag.counts.episodes = assocDiag.totalEpisodes;
    return diag;
  }
}
