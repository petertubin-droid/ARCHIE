// ============================================================================
// ARCHIE MARKET INTELLIGENCE — SUPABASE REPOSITORY LAYER
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/supabase-repository.ts
//
// Component Q & R / Sections 14, 17, 20:
// Production-grade persistence interface for Supabase PostgreSQL with
// graceful fallback to high-fidelity in-memory storage when offline or unmigrated.
// Includes SHA-256 hash chaining for tamper-evident audit trails.
// ============================================================================

import type {
  InstrumentSpec,
  MarketCandle,
  CandleInterval,
  MarketCategory,
  PredictionRecord,
  PredictionOutcomeRecord,
  ModelArtifact,
  AuditLogEntry,
  AdminConfig,
  PersistenceEngineStatus,
} from "./types.ts";

export interface SupabaseLikeClient {
  from(table: string): {
    select(columns?: string): any;
    insert(values: any): any;
    upsert(values: any, options?: any): any;
    update(values: any): any;
    eq(column: string, value: any): any;
    order(column: string, options?: { ascending?: boolean }): any;
    limit(count: number): any;
    single(): any;
  };
}

export interface IMarketRepository {
  getStatus(): PersistenceEngineStatus;
  saveInstrument(spec: InstrumentSpec): Promise<void>;
  getInstrument(symbol: string): Promise<InstrumentSpec | null>;
  listInstruments(category?: MarketCategory): Promise<InstrumentSpec[]>;
  saveCandles(
    symbol: string,
    interval: CandleInterval,
    candles: MarketCandle[],
  ): Promise<{ inserted: number; skipped: number }>;
  getCandles(
    symbol: string,
    interval: CandleInterval,
    limit?: number,
    sinceMs?: number,
  ): Promise<MarketCandle[]>;
  recordPrediction(prediction: PredictionRecord): Promise<void>;
  getPrediction(id: string): Promise<PredictionRecord | null>;
  listUnresolvedPredictions(symbol?: string): Promise<PredictionRecord[]>;
  recordOutcome(outcome: PredictionOutcomeRecord): Promise<void>;
  getOutcome(predictionId: string): Promise<PredictionOutcomeRecord | null>;
  saveModelArtifact(model: ModelArtifact): Promise<void>;
  getModelArtifact(version: string): Promise<ModelArtifact | null>;
  appendAuditLog(entry: AuditLogEntry): Promise<void>;
  getAuditLogs(limit?: number): Promise<AuditLogEntry[]>;
  getAdminConfig(): Promise<AdminConfig | null>;
  saveAdminConfig(config: AdminConfig): Promise<void>;
}

export async function computeAuditEntryHash(
  entry: AuditLogEntry,
  previousHash = "0".repeat(64),
): Promise<string> {
  const payloadStr = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    actor: entry.actor,
    severity: entry.severity,
    payloadSanitized: entry.payloadSanitized,
    previousHash,
  });
  const data = new TextEncoder().encode(payloadStr);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * In-memory repository fallback.
 * Strictly enforces immutability on predictions and audit entries.
 */
export class InMemoryMarketRepository implements IMarketRepository {
  private instruments = new Map<string, InstrumentSpec>();
  private candles = new Map<string, MarketCandle[]>(); // key: `${symbol}:${interval}`
  private predictions = new Map<string, PredictionRecord>();
  private outcomes = new Map<string, PredictionOutcomeRecord>();
  private models = new Map<string, ModelArtifact>();
  private auditLogs: AuditLogEntry[] = [];
  private lastAuditHash = "0".repeat(64);
  private adminConfig: AdminConfig | null = null;

  public getStatus(): PersistenceEngineStatus {
    return {
      storageEngine: "in_memory_fallback",
      isDatabaseConnected: false,
      lastSyncTimestampMs: Date.now(),
    };
  }

  public async saveInstrument(spec: InstrumentSpec): Promise<void> {
    this.instruments.set(spec.symbol, Object.freeze({ ...spec }));
  }

  public async getInstrument(symbol: string): Promise<InstrumentSpec | null> {
    const item = this.instruments.get(symbol);
    return item ? { ...item } : null;
  }

  public async listInstruments(category?: MarketCategory): Promise<InstrumentSpec[]> {
    const list = Array.from(this.instruments.values());
    if (!category) return list.map((i) => ({ ...i }));
    return list.filter((i) => i.category === category).map((i) => ({ ...i }));
  }

  public async saveCandles(
    symbol: string,
    interval: CandleInterval,
    candles: MarketCandle[],
  ): Promise<{ inserted: number; skipped: number }> {
    const key = `${symbol}:${interval}`;
    const existing = this.candles.get(key) ?? [];
    const existingTimes = new Set(existing.map((c) => c.openTimeMs));

    let inserted = 0;
    let skipped = 0;

    for (const c of candles) {
      if (existingTimes.has(c.openTimeMs)) {
        skipped++;
      } else {
        existing.push(Object.freeze({ ...c }));
        existingTimes.add(c.openTimeMs);
        inserted++;
      }
    }

    existing.sort((a, b) => a.openTimeMs - b.openTimeMs);
    this.candles.set(key, existing);
    return { inserted, skipped };
  }

  public async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit = 100,
    sinceMs?: number,
  ): Promise<MarketCandle[]> {
    const key = `${symbol}:${interval}`;
    let list = this.candles.get(key) ?? [];
    if (sinceMs !== undefined) {
      list = list.filter((c) => c.openTimeMs >= sinceMs);
    }
    return list.slice(-limit).map((c) => ({ ...c }));
  }

  public async recordPrediction(prediction: PredictionRecord): Promise<void> {
    if (this.predictions.has(prediction.id)) {
      throw new Error(`Prediction ID ${prediction.id} already exists. Immutability violation.`);
    }
    this.predictions.set(prediction.id, Object.freeze({ ...prediction }));
  }

  public async getPrediction(id: string): Promise<PredictionRecord | null> {
    const item = this.predictions.get(id);
    return item ? { ...item } : null;
  }

  public async listUnresolvedPredictions(symbol?: string): Promise<PredictionRecord[]> {
    const all = Array.from(this.predictions.values()).filter((p) => p.status === "UNRESOLVED");
    if (!symbol) return all.map((p) => ({ ...p }));
    return all.filter((p) => p.symbol === symbol).map((p) => ({ ...p }));
  }

  public async recordOutcome(outcome: PredictionOutcomeRecord): Promise<void> {
    const pred = this.predictions.get(outcome.predictionId);
    if (!pred) {
      throw new Error(`Prediction ${outcome.predictionId} not found to attach outcome.`);
    }
    if (this.outcomes.has(outcome.predictionId)) {
      throw new Error(`Outcome for prediction ${outcome.predictionId} already recorded.`);
    }

    this.outcomes.set(outcome.predictionId, Object.freeze({ ...outcome }));
    // Update prediction status immutably by replacing record with RESOLVED
    this.predictions.set(
      outcome.predictionId,
      Object.freeze({
        ...pred,
        status: "RESOLVED",
      }),
    );
  }

  public async getOutcome(predictionId: string): Promise<PredictionOutcomeRecord | null> {
    const item = this.outcomes.get(predictionId);
    return item ? { ...item } : null;
  }

  public async saveModelArtifact(model: ModelArtifact): Promise<void> {
    const existing = this.models.get(model.version);
    if (existing) {
      // Architecture and weights are immutable, but status/lifecycle notes can transition
      this.models.set(model.version, Object.freeze({
        ...existing,
        status: model.status,
        promotedAtMs: model.promotedAtMs,
        promotedBy: model.promotedBy,
        changeNotes: model.changeNotes,
      }));
      return;
    }
    this.models.set(model.version, Object.freeze({ ...model }));
  }

  public async getModelArtifact(version: string): Promise<ModelArtifact | null> {
    const item = this.models.get(version);
    return item ? { ...item } : null;
  }

  public async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    const hash = await computeAuditEntryHash(entry, this.lastAuditHash);
    const lockedEntry: AuditLogEntry = Object.freeze({
      ...entry,
      checksumSha256: hash,
    });
    this.auditLogs.push(lockedEntry);
    this.lastAuditHash = hash;
  }

  public async getAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogs.slice(-limit).map((l) => ({ ...l }));
  }

  public async getAdminConfig(): Promise<AdminConfig | null> {
    return this.adminConfig ? { ...this.adminConfig } : null;
  }

  public async saveAdminConfig(config: AdminConfig): Promise<void> {
    this.adminConfig = Object.freeze({ ...config });
  }
}

/**
 * Supabase Postgres Repository.
 * Executes typed database queries against the public schema when connected,
 * or delegates gracefully to InMemoryMarketRepository when client is absent.
 */
export class SupabaseMarketRepository implements IMarketRepository {
  private client: SupabaseLikeClient | null;
  private fallback: InMemoryMarketRepository;
  private lastAuditHash = "0".repeat(64);

  constructor(client: SupabaseLikeClient | null = null) {
    this.client = client;
    this.fallback = new InMemoryMarketRepository();
  }

  public getStatus(): PersistenceEngineStatus {
    if (!this.client) {
      return this.fallback.getStatus();
    }
    return {
      storageEngine: "supabase_postgres",
      isDatabaseConnected: true,
      lastSyncTimestampMs: Date.now(),
    };
  }

  public async saveInstrument(spec: InstrumentSpec): Promise<void> {
    if (!this.client) return this.fallback.saveInstrument(spec);
    const { error } = await this.client.from("market_instruments").upsert({
      symbol: spec.symbol,
      canonical_name: spec.canonicalName,
      category: spec.category,
      base_asset: spec.baseAsset,
      quote_asset: spec.quoteAsset,
      tick_size: spec.tickSize,
      contract_or_lot_size: spec.contractOrLotSize,
      min_volume: spec.minVolume,
      max_leverage: spec.maxLeverage,
      is_active: true,
      metadata: { pipSize: spec.pipSize, settlementType: spec.settlementType },
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("Supabase saveInstrument error, falling back to memory:", error.message);
      return this.fallback.saveInstrument(spec);
    }
  }

  public async getInstrument(symbol: string): Promise<InstrumentSpec | null> {
    if (!this.client) return this.fallback.getInstrument(symbol);
    const { data, error } = await this.client
      .from("market_instruments")
      .select("*")
      .eq("symbol", symbol)
      .single();
    if (error || !data) return this.fallback.getInstrument(symbol);
    return {
      symbol: data.symbol,
      canonicalName: data.canonical_name,
      category: data.category,
      baseAsset: data.base_asset,
      quoteAsset: data.quote_asset,
      tickSize: Number(data.tick_size),
      contractOrLotSize: Number(data.contract_or_lot_size),
      minVolume: Number(data.min_volume),
      maxLeverage: Number(data.max_leverage),
      settlementType: data.metadata?.settlementType ?? "SPOT",
      pipSize: data.metadata?.pipSize,
    };
  }

  public async listInstruments(category?: MarketCategory): Promise<InstrumentSpec[]> {
    if (!this.client) return this.fallback.listInstruments(category);
    let query = this.client.from("market_instruments").select("*");
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error || !data) return this.fallback.listInstruments(category);
    return data.map((d: any) => ({
      symbol: d.symbol,
      canonicalName: d.canonical_name,
      category: d.category,
      baseAsset: d.base_asset,
      quoteAsset: d.quote_asset,
      tickSize: Number(d.tick_size),
      contractOrLotSize: Number(d.contract_or_lot_size),
      minVolume: Number(d.min_volume),
      maxLeverage: Number(d.max_leverage),
      settlementType: d.metadata?.settlementType ?? "SPOT",
      pipSize: d.metadata?.pipSize,
    }));
  }

  public async saveCandles(
    symbol: string,
    interval: CandleInterval,
    candles: MarketCandle[],
  ): Promise<{ inserted: number; skipped: number }> {
    if (!this.client) return this.fallback.saveCandles(symbol, interval, candles);
    const rows = candles.map((c) => ({
      symbol,
      interval,
      open_time_ms: c.openTimeMs,
      close_time_ms: c.closeTimeMs,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      is_finalized: c.isFinalized,
    }));
    const { error } = await this.client
      .from("market_candles")
      .upsert(rows, { onConflict: "symbol,interval,open_time_ms", ignoreDuplicates: true });
    if (error) {
      console.warn("Supabase saveCandles error, using memory fallback:", error.message);
      return this.fallback.saveCandles(symbol, interval, candles);
    }
    return { inserted: candles.length, skipped: 0 };
  }

  public async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit = 100,
    sinceMs?: number,
  ): Promise<MarketCandle[]> {
    if (!this.client) return this.fallback.getCandles(symbol, interval, limit, sinceMs);
    let query = this.client
      .from("market_candles")
      .select("*")
      .eq("symbol", symbol)
      .eq("interval", interval)
      .order("open_time_ms", { ascending: true });
    if (sinceMs !== undefined) {
      query = query.gte("open_time_ms", sinceMs);
    }
    query = query.limit(limit);
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      return this.fallback.getCandles(symbol, interval, limit, sinceMs);
    }
    return data.map((d: any) => ({
      openTimeMs: Number(d.open_time_ms),
      closeTimeMs: Number(d.close_time_ms),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume),
      isFinalized: Boolean(d.is_finalized),
    }));
  }

  public async recordPrediction(prediction: PredictionRecord): Promise<void> {
    if (!this.client) return this.fallback.recordPrediction(prediction);
    const { error } = await this.client.from("market_predictions").insert({
      id: prediction.id,
      timestamp: new Date(prediction.timestamp).toISOString(),
      symbol: prediction.symbol,
      category: prediction.category,
      timeframe: prediction.timeframe,
      latest_eligible_candle_ms: prediction.latestEligibleCandleTimestamp,
      prob_bullish: prediction.probBullish,
      prob_bearish: prediction.probBearish,
      prob_neutral: prediction.probNeutral,
      target_price: prediction.targetPrice ?? null,
      stop_loss_price: prediction.stopLossPrice ?? null,
      invalidation_price: prediction.invalidationPrice ?? null,
      horizon_candles: prediction.horizonCandles,
      market_regime: prediction.marketRegime,
      model_version: prediction.modelVersion,
      rule_version: prediction.ruleVersion,
      status: prediction.status,
    });
    if (error) {
      console.warn("Supabase recordPrediction error, using memory fallback:", error.message);
      return this.fallback.recordPrediction(prediction);
    }
  }

  public async getPrediction(id: string): Promise<PredictionRecord | null> {
    if (!this.client) return this.fallback.getPrediction(id);
    const { data, error } = await this.client
      .from("market_predictions")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return this.fallback.getPrediction(id);
    return {
      id: data.id,
      timestamp: new Date(data.timestamp).getTime(),
      symbol: data.symbol,
      category: data.category,
      timeframe: data.timeframe,
      latestEligibleCandleTimestamp: Number(data.latest_eligible_candle_ms),
      featureSchemaVersion: "v1.0.0",
      modelVersion: data.model_version,
      ruleVersion: data.rule_version,
      probBullish: Number(data.prob_bullish),
      probBearish: Number(data.prob_bearish),
      probNeutral: Number(data.prob_neutral),
      targetPrice: data.target_price ? Number(data.target_price) : undefined,
      stopLossPrice: data.stop_loss_price ? Number(data.stop_loss_price) : undefined,
      invalidationPrice: data.invalidation_price ? Number(data.invalidation_price) : undefined,
      horizonCandles: Number(data.horizon_candles),
      marketRegime: data.market_regime,
      status: data.status,
    };
  }

  public async listUnresolvedPredictions(symbol?: string): Promise<PredictionRecord[]> {
    if (!this.client) return this.fallback.listUnresolvedPredictions(symbol);
    let query = this.client
      .from("market_predictions")
      .select("*")
      .eq("status", "UNRESOLVED");
    if (symbol) query = query.eq("symbol", symbol);
    const { data, error } = await query;
    if (error || !data) return this.fallback.listUnresolvedPredictions(symbol);
    return data.map((d: any) => ({
      id: d.id,
      timestamp: new Date(d.timestamp).getTime(),
      symbol: d.symbol,
      category: d.category,
      timeframe: d.timeframe,
      latestEligibleCandleTimestamp: Number(d.latest_eligible_candle_ms),
      featureSchemaVersion: "v1.0.0",
      modelVersion: d.model_version,
      ruleVersion: d.rule_version,
      probBullish: Number(d.prob_bullish),
      probBearish: Number(d.prob_bearish),
      probNeutral: Number(d.prob_neutral),
      targetPrice: d.target_price ? Number(d.target_price) : undefined,
      stopLossPrice: d.stop_loss_price ? Number(d.stop_loss_price) : undefined,
      invalidationPrice: d.invalidation_price ? Number(d.invalidation_price) : undefined,
      horizonCandles: Number(d.horizon_candles),
      marketRegime: d.market_regime,
      status: d.status,
    }));
  }

  public async recordOutcome(outcome: PredictionOutcomeRecord): Promise<void> {
    if (!this.client) return this.fallback.recordOutcome(outcome);
    const { error } = await this.client.from("market_prediction_outcomes").insert({
      prediction_id: outcome.predictionId,
      resolved_timestamp: new Date(outcome.resolvedTimestamp).toISOString(),
      resolution_status: outcome.resolutionStatus,
      candles_held: outcome.candlesHeld,
      entry_price: outcome.entryPrice,
      exit_price: outcome.exitPrice,
      realized_return_pct: outcome.realizedReturnPct,
      directional_correctness: outcome.directionalCorrectness,
      brier_score: outcome.brierScore,
      log_loss: outcome.logLoss,
    });
    if (error) {
      console.warn("Supabase recordOutcome error, using memory fallback:", error.message);
      return this.fallback.recordOutcome(outcome);
    }
  }

  public async getOutcome(predictionId: string): Promise<PredictionOutcomeRecord | null> {
    if (!this.client) return this.fallback.getOutcome(predictionId);
    const { data, error } = await this.client
      .from("market_prediction_outcomes")
      .select("*")
      .eq("prediction_id", predictionId)
      .single();
    if (error || !data) return this.fallback.getOutcome(predictionId);
    return {
      predictionId: data.prediction_id,
      resolvedTimestamp: new Date(data.resolved_timestamp).getTime(),
      resolutionStatus: data.resolution_status,
      candlesHeld: Number(data.candles_held),
      entryPrice: Number(data.entry_price),
      exitPrice: Number(data.exit_price),
      realizedReturnPct: Number(data.realized_return_pct),
      directionalCorrectness: Boolean(data.directional_correctness),
      brierScore: Number(data.brier_score),
      logLoss: Number(data.log_loss),
    };
  }

  public async saveModelArtifact(model: ModelArtifact): Promise<void> {
    if (!this.client) return this.fallback.saveModelArtifact(model);
    const { error } = await this.client.from("market_model_registry").insert({
      version: model.version,
      id: model.id,
      name: model.name,
      architecture: model.architecture,
      weights: model.weights,
      feature_schema_version: model.featureSchemaVersion,
      training_window: model.trainingWindow,
      evaluation_metrics: model.evaluationMetrics,
      status: model.status,
      promoted_at: model.promotedAtMs ? new Date(model.promotedAtMs).toISOString() : null,
      promoted_by: model.promotedBy ?? null,
      change_notes: model.changeNotes ?? null,
    });
    if (error) {
      console.warn("Supabase saveModelArtifact error, using memory fallback:", error.message);
      return this.fallback.saveModelArtifact(model);
    }
  }

  public async getModelArtifact(version: string): Promise<ModelArtifact | null> {
    if (!this.client) return this.fallback.getModelArtifact(version);
    const { data, error } = await this.client
      .from("market_model_registry")
      .select("*")
      .eq("version", version)
      .single();
    if (error || !data) return this.fallback.getModelArtifact(version);
    return {
      id: data.id,
      name: data.name,
      version: data.version,
      architecture: data.architecture,
      weights: data.weights,
      featureSchemaVersion: data.feature_schema_version,
      trainingWindow: data.training_window,
      evaluationMetrics: data.evaluation_metrics,
      status: data.status,
      createdAtMs: new Date(data.created_at).getTime(),
      promotedAtMs: data.promoted_at ? new Date(data.promoted_at).getTime() : undefined,
      promotedBy: data.promoted_by ?? undefined,
      changeNotes: data.change_notes ?? undefined,
    };
  }

  public async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    const hash = await computeAuditEntryHash(entry, this.lastAuditHash);
    this.lastAuditHash = hash;
    if (!this.client) return this.fallback.appendAuditLog(entry);
    const { error } = await this.client.from("market_audit_logs").insert({
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      event_type: entry.eventType,
      actor: entry.actor,
      severity: entry.severity,
      payload_sanitized: { ...entry.payloadSanitized, checksumSha256: hash },
    });
    if (error) {
      console.warn("Supabase appendAuditLog error, using memory fallback:", error.message);
      return this.fallback.appendAuditLog(entry);
    }
  }

  public async getAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    if (!this.client) return this.fallback.getAuditLogs(limit);
    const { data, error } = await this.client
      .from("market_audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error || !data) return this.fallback.getAuditLogs(limit);
    return data.reverse().map((d: any) => ({
      id: d.id,
      timestamp: new Date(d.timestamp).getTime(),
      eventType: d.event_type,
      actor: d.actor,
      severity: d.severity,
      payloadSanitized: d.payload_sanitized,
      checksumSha256: d.payload_sanitized?.checksumSha256,
    }));
  }

  public async getAdminConfig(): Promise<AdminConfig | null> {
    if (!this.client) return this.fallback.getAdminConfig();
    const { data, error } = await this.client
      .from("market_admin_config")
      .select("*")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return this.fallback.getAdminConfig();
    return {
      version: Number(data.version),
      updatedAtMs: new Date(data.updated_at).getTime(),
      updatedBy: data.updated_by,
      authorizedProviders: data.authorized_providers,
      enabledCategories: data.enabled_categories,
      supportedSymbols: data.supported_symbols,
      maxRiskPerHypotheticalTradePct: Number(data.max_risk_per_trade_pct),
      minConfidenceToIssueDirectional: Number(data.min_confidence_directional),
      maxLeverageCeiling: Number(data.max_leverage_ceiling),
      liveOrderExecutionEnabled: false,
      autoModelPromotionAllowed: false,
    };
  }

  public async saveAdminConfig(config: AdminConfig): Promise<void> {
    if (!this.client) return this.fallback.saveAdminConfig(config);
    const { error } = await this.client.from("market_admin_config").insert({
      version: config.version,
      updated_at: new Date(config.updatedAtMs).toISOString(),
      updated_by: config.updatedBy,
      authorized_providers: config.authorizedProviders,
      enabled_categories: config.enabledCategories,
      supported_symbols: config.supportedSymbols,
      max_risk_per_trade_pct: config.maxRiskPerHypotheticalTradePct,
      min_confidence_directional: config.minConfidenceToIssueDirectional,
      max_leverage_ceiling: config.maxLeverageCeiling,
      live_order_execution_enabled: false,
      auto_model_promotion_allowed: false,
    });
    if (error) {
      console.warn("Supabase saveAdminConfig error, using memory fallback:", error.message);
      return this.fallback.saveAdminConfig(config);
    }
  }
}

export const globalMarketRepository = new SupabaseMarketRepository();
