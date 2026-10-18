// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — PATTERN ENGINE
// supabase/functions/_shared/archie-ai/learning/pattern-engine.ts
//
// Discovers recurring patterns across verified experiences,
// guards against overgeneralization, retains counterexamples,
// and maps boundary conditions (spec §4.3).
// =========================================================

import type { LearnedPattern } from "./types.ts";

export interface PatternObservation {
  eventId: string;
  domain: string;
  signature: string;
  condition: string;
  outcome: "SUCCESS" | "FAILURE" | "ANOMALY";
  details?: Record<string, unknown>;
}

export class PatternRecognitionEngine {
  private patterns = new Map<string, LearnedPattern>();

  constructor(initialPatterns: LearnedPattern[] = []) {
    for (const p of initialPatterns) {
      this.patterns.set(p.patternSignature, p);
    }
  }

  list(): LearnedPattern[] {
    return Array.from(this.patterns.values());
  }

  get(signature: string): LearnedPattern | undefined {
    return this.patterns.get(signature);
  }

  /**
   * Evaluates a stream of observations to update or discover patterns.
   * Enforces strict sample-size guardrails to prevent premature generalization.
   */
  observe(observation: PatternObservation): {
    pattern: LearnedPattern;
    promoted: boolean;
    counterexampleRecorded: boolean;
  } {
    const sig = observation.signature.toLowerCase().trim();
    const now = new Date().toISOString();

    let pattern = this.patterns.get(sig);
    let counterexampleRecorded = false;
    let promoted = false;

    if (!pattern) {
      pattern = {
        id: `pat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        patternSignature: sig,
        domain: observation.domain,
        description: `Discovered pattern for ${observation.signature}`,
        sampleSize: 0,
        supportingEvents: [],
        counterexamples: [],
        boundaryConditions: [observation.condition],
        confidence: 0.35,
        status: "HYPOTHESIS",
        createdAt: now,
        updatedAt: now,
      };
      this.patterns.set(sig, pattern);
    }

    pattern.sampleSize += 1;
    pattern.updatedAt = now;

    if (observation.outcome === "SUCCESS") {
      if (!pattern.supportingEvents.includes(observation.eventId)) {
        pattern.supportingEvents.push(observation.eventId);
      }
      if (!pattern.boundaryConditions.includes(observation.condition)) {
        pattern.boundaryConditions.push(observation.condition);
      }
    } else {
      // Record counterexample with explicit conditions (spec §4.3)
      pattern.counterexamples.push({
        id: observation.eventId,
        condition: observation.condition,
        outcome: observation.outcome,
      });
      counterexampleRecorded = true;
    }

    // Guard against overgeneralization from small samples or high counterexample rates
    const counterCount = pattern.counterexamples.length;
    const supportCount = pattern.supportingEvents.length;
    const totalSamples = pattern.sampleSize;

    const counterexampleRatio = totalSamples > 0 ? counterCount / totalSamples : 1;

    // Confidence calculation bounded by sample size and consistency
    if (totalSamples < 3) {
      pattern.status = "HYPOTHESIS";
      pattern.confidence = Math.min(0.5, 0.2 + totalSamples * 0.1);
    } else if (counterexampleRatio > 0.25) {
      // High counterexample frequency blocks generalization
      pattern.status = "HYPOTHESIS";
      pattern.confidence = Math.max(0.1, 0.5 - counterexampleRatio * 0.3);
    } else if (supportCount >= 5 && counterexampleRatio <= 0.1) {
      if (pattern.status !== "ESTABLISHED") promoted = true;
      pattern.status = "ESTABLISHED";
      pattern.confidence = Math.min(0.95, 0.7 + supportCount * 0.03);
    } else if (supportCount >= 3) {
      if (pattern.status === "HYPOTHESIS") promoted = true;
      pattern.status = "SUPPORTED";
      pattern.confidence = Math.min(0.8, 0.5 + supportCount * 0.05);
    }

    return { pattern, promoted, counterexampleRecorded };
  }
}
