// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — TEMPORAL LEARNER
// supabase/functions/_shared/archie-ai/learning/temporal-learner.ts
//
// Tri-temporal tracking (observed_at, valid_at, recorded_at),
// domain-based freshness decay, stale knowledge detection,
// and non-destructive versioning (spec §4.6).
// =========================================================

import type { ExtractedKnowledgeItem, TemporalEnvelope } from "./types.ts";

/** Default TTLs in days per knowledge domain. */
const DOMAIN_TTL_DAYS: Record<string, number> = {
  price: 14,
  market: 30,
  crypto: 1,
  weather: 1,
  standards: 365,
  regulations: 180,
  construction_rates: 60,
  physics: 36500, // permanent
  mathematics: 36500, // permanent
  general: 90,
};

export class TemporalKnowledgeManager {
  /**
   * Constructs a tri-temporal validity envelope for an observed fact.
   */
  createEnvelope(
    domain: string,
    observedAt?: string,
    validAt?: string,
  ): TemporalEnvelope {
    const now = new Date();
    const obs = observedAt ? new Date(observedAt) : now;
    const val = validAt ? new Date(validAt) : obs;

    const normDomain = domain.toLowerCase().trim();
    const ttlDays = DOMAIN_TTL_DAYS[normDomain] ?? DOMAIN_TTL_DAYS.general;

    const expiresAt = new Date(val.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    return {
      observedAt: obs.toISOString(),
      validAt: val.toISOString(),
      recordedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isStale: now.getTime() > expiresAt.getTime(),
    };
  }

  /**
   * Checks whether a knowledge item is currently stale based on its temporal envelope.
   */
  checkStaleness(envelope: TemporalEnvelope, now: Date = new Date()): boolean {
    if (!envelope.expiresAt) return false;
    const expires = new Date(envelope.expiresAt);
    return now.getTime() > expires.getTime();
  }

  /**
   * Performs non-destructive supersession of an existing item with an updated item.
   * Both records remain in history; the predecessor links forward to its replacement.
   */
  supersede(
    olderItem: ExtractedKnowledgeItem,
    newerItem: ExtractedKnowledgeItem,
  ): { supersededOld: ExtractedKnowledgeItem; activeNew: ExtractedKnowledgeItem } {
    const supersededOld: ExtractedKnowledgeItem = {
      ...olderItem,
      evidenceState: "SUPERSEDED",
      supersededBy: newerItem.id,
      status: "ARCHIVED",
    };

    const activeNew: ExtractedKnowledgeItem = {
      ...newerItem,
      version: olderItem.version + 1,
      previousVersionId: olderItem.id,
      status: "ACTIVE",
    };

    return { supersededOld, activeNew };
  }
}
