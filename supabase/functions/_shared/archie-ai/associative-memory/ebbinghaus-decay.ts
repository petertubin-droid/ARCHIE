// =========================================================
// ARCHIE ASSOCIATIVE MEMORY — EBBINGHAUS RETENTION & STABILITY
// supabase/functions/_shared/archie-ai/associative-memory/ebbinghaus-decay.ts
//
// Deterministic memory decay and spaced repetition stability.
// Calculates memory retention curve without stochastic elements.
// =========================================================

import type { MemoryStabilityMetrics } from "./types.ts";

export const DEFAULT_BASE_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days baseline
export const MAX_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 365; // 1 year cap
export const MIN_RETENTION_FLOOR = 0.05;

/**
 * Calculates stability half-life in milliseconds based on repetition and importance.
 * S = S0 * (1 + 0.75 * log(1 + repetitions)) * (1 + importance)
 */
export function calculateStability(
  accessCount: number,
  importance: number,
  baseHalfLifeMs = DEFAULT_BASE_HALF_LIFE_MS,
): number {
  const repetitionFactor = 1 + 0.85 * Math.log(1 + Math.max(0, accessCount));
  const importanceFactor = 1 + Math.max(0, Math.min(1, importance));
  const stability = baseHalfLifeMs * repetitionFactor * importanceFactor;
  return Math.min(MAX_HALF_LIFE_MS, stability);
}

/**
 * Calculates current retention score [0, 1] using exponential decay:
 * R = exp(-ln(2) * age / stability)
 */
export function calculateRetention(
  ageMs: number,
  stabilityMs: number,
): number {
  if (ageMs <= 0) return 1.0;
  const decayRate = Math.LN2 / Math.max(1000, stabilityMs);
  const retention = Math.exp(-decayRate * ageMs);
  return Math.max(MIN_RETENTION_FLOOR, Math.min(1.0, retention));
}

/**
 * Full stability metrics for an episodic memory or associative link.
 */
export function computeStabilityMetrics(
  timestamp: number,
  accessCount: number,
  importance: number,
  now = Date.now(),
): MemoryStabilityMetrics {
  const ageMs = Math.max(0, now - timestamp);
  const stabilityMs = calculateStability(accessCount, importance);
  const retentionScore = calculateRetention(ageMs, stabilityMs);
  const halfLifeDays = stabilityMs / (1000 * 60 * 60 * 24);
  const repetitionBoost = 1 + 0.85 * Math.log(1 + Math.max(0, accessCount));

  return {
    retentionScore,
    halfLifeDays: Math.round(halfLifeDays * 10) / 10,
    repetitionBoost: Math.round(repetitionBoost * 100) / 100,
  };
}
