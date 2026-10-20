// =========================================================
// ARCHIE UNIFIED ENGINE COORDINATOR & FEDERATION EVENT BUS
// src/lib/archie/unified-engine-bus.ts
//
// Unifies all 15 ARCHIE cognitive and execution subsystems
// into a single synchronized, interoperable intelligence fabric:
//
//   1.  COGNITIVE         - Native reasoning loop & dialectical synthesis
//   2.  TRADING           - Real-time market execution & algorithmic risk gate
//   3.  MARKETS           - Free real-time live multi-asset feeds (Binance + Forex)
//   4.  SECURITY          - Active audit scanner & secret leakage sentry
//   5.  OFFENSIVE         - Authorized penetration & CTF validation engine
//   6.  EXECUTION         - Distributed task dispatch & runtime orchestrator
//   7.  CODE_INTEL        - AST inspection, code sentry & unit scaffold
//   8.  VOICE_EARS        - Acoustic capture & neural intent classification
//   9.  VOICE_MOUTH       - Speech synthesis & prosodic generation
//   10. LEARNING          - 12-stage consensus pipeline & vector memory
//   11. EVOLUTION         - Heuristic self-evaluation & adaptive lessons
//   12. TERMINOLOGY       - Canonical domain lexicon & ontology
//   13. WALLET_RECOVERY   - Deterministic mnemonic derivation & cryptographic audit
//   14. EXCHANGE_ACCESS   - Multi-venue API credential & key vault
//   15. INFRASTRUCTURE_OPS- Global edge latency, microservices & telemetry
//
// Cross-engine pub/sub event bus ensures that updates in one
// engine immediately inform the entire cognitive cluster.
// =========================================================

export type EngineId =
  | "cognitive"
  | "trading"
  | "markets"
  | "security"
  | "offensive"
  | "execution"
  | "code_intel"
  | "voice_ears"
  | "voice_mouth"
  | "learning"
  | "evolution"
  | "terminology"
  | "wallet_recovery"
  | "exchange_access"
  | "infrastructure_ops";

export type EngineState = "online" | "degraded" | "syncing" | "standby";

export interface EngineDescriptor {
  id: EngineId;
  name: string;
  category: "core" | "financial" | "security" | "sensory" | "infrastructure";
  state: EngineState;
  healthPercent: number;
  latencyMs: number;
  lastHeartbeat: number;
  processedCount: number;
  capabilities: string[];
  description: string;
}

export type EventType =
  | "MARKET_TICK"
  | "ORDER_ACTION"
  | "SECURITY_ALERT"
  | "COGNITIVE_SYNTHESIS"
  | "VOICE_INTENT"
  | "LEARNING_CYCLE"
  | "EVOLUTION_HEURISTIC"
  | "TELEMETRY_BEAT"
  | "CROSS_ENGINE_TASK";

export interface ArchieBaseEvent<T = unknown> {
  id: string;
  type: EventType;
  sourceEngine: EngineId;
  targetEngines?: EngineId[];
  timestamp: number;
  payload: T;
}

export interface MarketTickPayload {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume: number | string;
  source: string;
}

export interface OrderActionPayload {
  orderId: string;
  symbol: string;
  type: "BUY" | "SELL";
  price: number;
  volume: number;
  status: "OPEN" | "FILLED" | "CLOSED" | "CANCELLED";
  pnl?: number;
}

export interface SecurityAlertPayload {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rule: string;
  details: string;
  autoRemediated: boolean;
}

export interface CognitiveSynthesisPayload {
  domain: string;
  thesis: string;
  confidence: number;
  actionableInsights: string[];
}

export interface FederationHealth {
  overallHealth: number; // 0-100%
  totalEngines: number;
  onlineEngines: number;
  eventsProcessed: number;
  averageLatencyMs: number;
  activeWorkflows: number;
  lastSyncTimestamp: number;
}

type EventListener<T = unknown> = (event: ArchieBaseEvent<T>) => void;

class ArchieEngineBus {
  private engines: Map<EngineId, EngineDescriptor> = new Map();
  private listeners: Map<EventType, Set<EventListener<any>>> = new Map();
  private history: ArchieBaseEvent[] = [];
  private eventCounter = 0;

  constructor() {
    this.initializeEngines();
  }

  private initializeEngines() {
    const registry: Omit<EngineDescriptor, "lastHeartbeat" | "processedCount">[] = [
      {
        id: "cognitive",
        name: "Cognitive Synthesis & Reasoning",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 14,
        capabilities: ["nlu_intent", "dialectical_synthesis", "cross_domain_analogy"],
        description: "Provider-agnostic intelligence core running deterministic reasoning loops.",
      },
      {
        id: "trading",
        name: "Algorithmic Trading & Risk Gate",
        category: "financial",
        state: "online",
        healthPercent: 100,
        latencyMs: 4,
        capabilities: ["exness_cfd_engine", "iq_option_digital", "risk_gate", "pnl_tracking"],
        description: "Multi-market execution engine supporting CFD margin and binary option contracts.",
      },
      {
        id: "markets",
        name: "Real-Time Multi-Asset Feeds",
        category: "financial",
        state: "online",
        healthPercent: 100,
        latencyMs: 22,
        capabilities: ["binance_public_klines", "open_rates_forex", "gold_spot", "multi_timeframe"],
        description: "Free 100% live price and candlestick stream with zero API key dependencies.",
      },
      {
        id: "security",
        name: "Autonomous Security & Policy Sentry",
        category: "security",
        state: "online",
        healthPercent: 100,
        latencyMs: 8,
        capabilities: ["secret_scanning", "tls_posture", "rls_inspection", "crypto_validation"],
        description: "Automated compliance auditor and high-entropy credential leakage detector.",
      },
      {
        id: "offensive",
        name: "Authorized Security Penetration",
        category: "security",
        state: "online",
        healthPercent: 100,
        latencyMs: 12,
        capabilities: ["ctf_lab_verification", "boundary_enforcement", "cve_correlation"],
        description: "Strictly authorized offensive security testing harness with immutable boundaries.",
      },
      {
        id: "execution",
        name: "Distributed Task Execution",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 6,
        capabilities: ["queue_worker", "step_runner", "resilient_retry", "state_checkpoint"],
        description: "Deterministic workflow executor with transaction-safe state transitions.",
      },
      {
        id: "code_intel",
        name: "Code Intelligence & Review",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 19,
        capabilities: ["ast_parser", "unit_test_scaffold", "pattern_audit", "code_repair"],
        description: "Deep source code analysis and automated test generation engine.",
      },
      {
        id: "voice_ears",
        name: "Sensory Audio & Intent Perception",
        category: "sensory",
        state: "online",
        healthPercent: 100,
        latencyMs: 31,
        capabilities: ["fft_analysis", "vad_detection", "phoneme_classification"],
        description: "Client-side acoustic processing and ambient speech intent extractor.",
      },
      {
        id: "voice_mouth",
        name: "Neural Vocal Synthesis",
        category: "sensory",
        state: "online",
        healthPercent: 100,
        latencyMs: 45,
        capabilities: ["web_audio_playback", "prosodic_shaping", "conversational_cadence"],
        description: "Natural real-time voice speech generator with pitch and inflection control.",
      },
      {
        id: "learning",
        name: "Unified 12-Stage Learning Engine",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 16,
        capabilities: ["consent_filtering", "knowledge_distillation", "vector_embeddings"],
        description: "Deterministic consensus pipeline for validating and committing verified facts.",
      },
      {
        id: "evolution",
        name: "Continuous Self-Evolution",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 11,
        capabilities: ["heuristic_evaluation", "lesson_synthesis", "fitness_scoring"],
        description: "Introspective feedback loop updating operational strategies from outcome metrics.",
      },
      {
        id: "terminology",
        name: "Curated Lexicon & Domain Ontology",
        category: "core",
        state: "online",
        healthPercent: 100,
        latencyMs: 3,
        capabilities: ["glossary_lookup", "disambiguation", "standards_taxonomy"],
        description: "Authoritative terminology repository across engineering, finance, and cryptography.",
      },
      {
        id: "wallet_recovery",
        name: "Cryptographic Entropy & Wallet Auditor",
        category: "security",
        state: "online",
        healthPercent: 100,
        latencyMs: 15,
        capabilities: ["bip39_derivation", "seed_integrity", "checksum_validator"],
        description: "Client-side non-custodial cryptographic audit and key derivation engine.",
      },
      {
        id: "exchange_access",
        name: "Multi-Venue Connectivity Gateway",
        category: "financial",
        state: "online",
        healthPercent: 100,
        latencyMs: 18,
        capabilities: ["signature_hmac", "nonce_management", "order_routing"],
        description: "Secure gateway coordinating paper and live execution across trading venues.",
      },
      {
        id: "infrastructure_ops",
        name: "Global Edge & Microservices Operations",
        category: "infrastructure",
        state: "online",
        healthPercent: 100,
        latencyMs: 9,
        capabilities: ["latency_sweeps", "resource_metrics", "cost_governance"],
        description: "Global telemetry coordinator monitoring edge regions, cache pools, and RPC nodes.",
      },
    ];

    const now = Date.now();
    for (const item of registry) {
      this.engines.set(item.id, {
        ...item,
        lastHeartbeat: now,
        processedCount: 0,
      });
    }
  }

  /** Publish an event to the unified ARCHIE engine bus. */
  public publish<T = unknown>(
    type: EventType,
    sourceEngine: EngineId,
    payload: T,
    targetEngines?: EngineId[],
  ): ArchieBaseEvent<T> {
    this.eventCounter++;
    const event: ArchieBaseEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      sourceEngine,
      targetEngines,
      timestamp: Date.now(),
      payload,
    };

    // Update source engine metrics
    const src = this.engines.get(sourceEngine);
    if (src) {
      src.processedCount++;
      src.lastHeartbeat = Date.now();
    }

    // Keep ring buffer of last 100 events
    this.history.unshift(event);
    if (this.history.length > 100) {
      this.history.pop();
    }

    // Deliver to registered listeners
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.warn(`[ArchieEngineBus] Handler error on ${type}:`, err);
        }
      }
    }

    return event;
  }

  /** Subscribe to a specific engine bus event type. */
  public subscribe<T = unknown>(
    type: EventType,
    handler: EventListener<T>,
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const set = this.listeners.get(type)!;
    set.add(handler as EventListener<any>);
    return () => {
      set.delete(handler as EventListener<any>);
    };
  }

  /** Get snapshot of all 15 federated engines. */
  public getAllEngines(): EngineDescriptor[] {
    return Array.from(this.engines.values());
  }

  /** Get specific engine descriptor. */
  public getEngine(id: EngineId): EngineDescriptor | undefined {
    return this.engines.get(id);
  }

  /** Update an engine's runtime state. */
  public updateEngineState(
    id: EngineId,
    updates: Partial<Pick<EngineDescriptor, "state" | "healthPercent" | "latencyMs">>,
  ): void {
    const eng = this.engines.get(id);
    if (!eng) return;
    Object.assign(eng, updates);
    eng.lastHeartbeat = Date.now();
  }

  /** Get overall federation health summary. */
  public getFederationHealth(): FederationHealth {
    const list = this.getAllEngines();
    const online = list.filter((e) => e.state === "online").length;
    const avgLatency =
      list.reduce((sum, e) => sum + e.latencyMs, 0) / (list.length || 1);
    const avgHealth =
      list.reduce((sum, e) => sum + e.healthPercent, 0) / (list.length || 1);

    return {
      overallHealth: Number(avgHealth.toFixed(1)),
      totalEngines: list.length,
      onlineEngines: online,
      eventsProcessed: this.eventCounter,
      averageLatencyMs: Math.round(avgLatency),
      activeWorkflows: this.history.filter((h) => h.type === "CROSS_ENGINE_TASK").length,
      lastSyncTimestamp: Date.now(),
    };
  }

  /** Dispatch an orchestrated multi-engine task. */
  public dispatchCrossEngineTask(task: {
    description: string;
    requiredEngines: EngineId[];
    input: Record<string, unknown>;
  }): {
    taskId: string;
    status: "dispatched";
    coordinatedEngines: EngineId[];
    dispatchedAt: string;
  } {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Publish event to inform all participant engines
    this.publish("CROSS_ENGINE_TASK", "execution", {
      taskId,
      ...task,
    }, task.requiredEngines);

    return {
      taskId,
      status: "dispatched",
      coordinatedEngines: task.requiredEngines,
      dispatchedAt: new Date().toISOString(),
    };
  }

  /** Retrieve recent event history. */
  public getHistory(): ArchieBaseEvent[] {
    return [...this.history];
  }
}

// Global shared singleton
export const archieEngineBus = new ArchieEngineBus();

// Also attach to window if in browser for diagnostic inspection
if (typeof window !== "undefined") {
  (window as unknown as { __ARCHIE_ENGINE_BUS__?: ArchieEngineBus }).__ARCHIE_ENGINE_BUS__ = archieEngineBus;
}
