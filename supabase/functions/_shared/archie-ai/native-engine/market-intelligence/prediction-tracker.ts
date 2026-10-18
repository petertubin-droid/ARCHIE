// ============================================================================
// ARCHIE MARKET INTELLIGENCE — PREDICTION RECORDING & OUTCOME VERIFICATION
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/prediction-tracker.ts
//
// Component K / Section 14:
// Immutable prediction logging, causal outcome verification, conservative
// intra-candle collision resolution, Brier score and log-loss calibration tracking.
// ============================================================================

import type {
  MarketCandle,
  PredictionRecord,
  PredictionOutcomeRecord,
  OutcomeVerificationSummary,
} from "./types.ts";

export class PredictionTracker {
  private predictions = new Map<string, PredictionRecord>();
  private outcomes = new Map<string, PredictionOutcomeRecord>();

  /**
   * Immutably records a prediction event. Throws if ID already exists.
   */
  public recordPrediction(prediction: PredictionRecord): void {
    if (this.predictions.has(prediction.id)) {
      throw new Error(`Prediction ID ${prediction.id} already recorded. Immutable write error.`);
    }
    this.predictions.set(prediction.id, Object.freeze({ ...prediction }));
  }

  public getPrediction(id: string): PredictionRecord | undefined {
    return this.predictions.get(id);
  }

  public getOutcome(predictionId: string): PredictionOutcomeRecord | undefined {
    return this.outcomes.get(predictionId);
  }

  public getAllPredictions(): PredictionRecord[] {
    return Array.from(this.predictions.values());
  }

  public getAllOutcomes(): PredictionOutcomeRecord[] {
    return Array.from(this.outcomes.values());
  }

  /**
   * Evaluates unresolved predictions against subsequent chronologically ordered forward candles.
   * Resolves collision conservatively (stop loss executed first).
   */
  public evaluateOutcomes(forwardCandles: MarketCandle[]): PredictionOutcomeRecord[] {
    const resolvedInBatch: PredictionOutcomeRecord[] = [];

    for (const prediction of this.predictions.values()) {
      if (prediction.status === "RESOLVED") continue;

      // Filter candles strictly newer than latestEligibleCandleTimestamp
      const eligibleForward = forwardCandles.filter(
        (c) => c.openTimeMs >= prediction.latestEligibleCandleTimestamp && c.isFinalized
      );

      if (eligibleForward.length === 0) continue;

      const entryPrice = eligibleForward[0].open;
      const target = prediction.targetPrice;
      const stop = prediction.stopLossPrice;
      const horizon = prediction.horizonCandles;

      let resolutionStatus: PredictionOutcomeRecord["resolutionStatus"] | null = null;
      let exitPrice = entryPrice;
      let candlesHeld = 0;
      let resolvedTimestamp = 0;

      for (let i = 0; i < eligibleForward.length; i++) {
        const bar = eligibleForward[i];
        candlesHeld = i + 1;
        resolvedTimestamp = bar.closeTimeMs;

        const isLongBias = prediction.probBullish > prediction.probBearish;

        // Check for same-candle collision if both target and stop are set
        if (target !== undefined && stop !== undefined) {
          const hitTarget = isLongBias ? bar.high >= target : bar.low <= target;
          const hitStop = isLongBias ? bar.low <= stop : bar.high >= stop;

          if (hitTarget && hitStop) {
            // CONSERVATIVE COLLISION: Assume stop was triggered first
            resolutionStatus = "HIT_STOP_LOSS";
            exitPrice = stop;
            break;
          } else if (hitStop) {
            resolutionStatus = "HIT_STOP_LOSS";
            exitPrice = stop;
            break;
          } else if (hitTarget) {
            resolutionStatus = "HIT_TARGET";
            exitPrice = target;
            break;
          }
        }

        // Check horizon expiry
        if (candlesHeld >= horizon) {
          resolutionStatus = "HORIZON_EXPIRY";
          exitPrice = bar.close;
          break;
        }
      }

      if (resolutionStatus !== null) {
        // Calculate realized return
        const isBullish = prediction.probBullish >= prediction.probBearish;
        const rawReturn = (exitPrice - entryPrice) / entryPrice;
        const directionalReturn = isBullish ? rawReturn : -rawReturn;
        const directionalCorrectness = directionalReturn > 0;

        // Brier score: (predictedProb - outcome)^2
        const outcomeBinary = directionalCorrectness ? 1 : 0;
        const chosenProb = isBullish ? prediction.probBullish : prediction.probBearish;
        const brierScore = (chosenProb - outcomeBinary) ** 2;

        // Log Loss: -ln(max(prob, 1e-6))
        const pClamped = Math.max(1e-6, Math.min(1 - 1e-6, outcomeBinary === 1 ? chosenProb : 1 - chosenProb));
        const logLoss = -Math.log(pClamped);

        const outcomeRecord: PredictionOutcomeRecord = {
          predictionId: prediction.id,
          resolvedTimestamp,
          resolutionStatus,
          candlesHeld,
          entryPrice,
          exitPrice,
          realizedReturnPct: Math.round(directionalReturn * 10000) / 100,
          directionalCorrectness,
          brierScore: Math.round(brierScore * 10000) / 10000,
          logLoss: Math.round(logLoss * 10000) / 10000,
        };

        this.outcomes.set(prediction.id, outcomeRecord);
        // Update prediction status cleanly without mutating frozen object
        this.predictions.set(prediction.id, Object.freeze({
          ...prediction,
          status: "RESOLVED",
        }));
        resolvedInBatch.push(outcomeRecord);
      }
    }

    return resolvedInBatch;
  }

  /**
   * Generates aggregated summary statistics and calibration bucket breakdown.
   */
  public getVerificationSummary(): OutcomeVerificationSummary {
    const totalPredictions = this.predictions.size;
    const outcomesList = Array.from(this.outcomes.values());
    const resolvedCount = outcomesList.length;
    const unresolvedCount = totalPredictions - resolvedCount;

    if (resolvedCount === 0) {
      return {
        totalPredictions,
        unresolvedCount,
        resolvedCount: 0,
        directionalAccuracyPct: 0,
        meanBrierScore: 0,
        meanLogLoss: 0,
        targetHitRatePct: 0,
        stopLossHitRatePct: 0,
        calibrationBuckets: [],
      };
    }

    let correctCount = 0;
    let targetHits = 0;
    let stopHits = 0;
    let totalBrier = 0;
    let totalLogLoss = 0;

    // 10 calibration buckets [0-0.1, 0.1-0.2, ... 0.9-1.0]
    const buckets: Array<{ sumProb: number; sumObserved: number; count: number }> = Array.from(
      { length: 10 },
      () => ({ sumProb: 0, sumObserved: 0, count: 0 })
    );

    for (const o of outcomesList) {
      if (o.directionalCorrectness) correctCount++;
      if (o.resolutionStatus === "HIT_TARGET") targetHits++;
      if (o.resolutionStatus === "HIT_STOP_LOSS") stopHits++;
      totalBrier += o.brierScore;
      totalLogLoss += o.logLoss;

      const pred = this.predictions.get(o.predictionId);
      if (pred) {
        const prob = Math.max(pred.probBullish, pred.probBearish);
        const bucketIdx = Math.min(9, Math.floor(prob * 10));
        buckets[bucketIdx].sumProb += prob;
        buckets[bucketIdx].sumObserved += o.directionalCorrectness ? 1 : 0;
        buckets[bucketIdx].count++;
      }
    }

    const calibrationBuckets = buckets.map((b, idx) => ({
      bucketMinProb: idx / 10,
      bucketMaxProb: (idx + 1) / 10,
      predictedMeanProb: b.count > 0 ? Math.round((b.sumProb / b.count) * 100) / 100 : idx / 10 + 0.05,
      actualObservedFrequency: b.count > 0 ? Math.round((b.sumObserved / b.count) * 100) / 100 : 0,
      count: b.count,
    }));

    return {
      totalPredictions,
      unresolvedCount,
      resolvedCount,
      directionalAccuracyPct: Math.round((correctCount / resolvedCount) * 1000) / 10,
      meanBrierScore: Math.round((totalBrier / resolvedCount) * 10000) / 10000,
      meanLogLoss: Math.round((totalLogLoss / resolvedCount) * 10000) / 10000,
      targetHitRatePct: Math.round((targetHits / resolvedCount) * 1000) / 10,
      stopLossHitRatePct: Math.round((stopHits / resolvedCount) * 1000) / 10,
      calibrationBuckets,
    };
  }
}
