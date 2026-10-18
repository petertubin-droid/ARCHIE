// =========================================================
// ARCHIE TREE FEED — pure core (testable without Deno env)
//
// Owner directive 2026-10-18 — the tree methodology:
//   ROOTS: FRELUX business signals (aggregated, never per-user
//   PII) become candidate facts ARCHIE loads on boot.
//   OXYGEN: ARCHIE's validated knowledge goes back out to
//   FRELUX surfaces, honestly labeled.
// =========================================================

export interface EstimationUsageRow {
  usage_date: string;
  uses_consumed: number;
}

export interface FeatureUsageRow {
  feature_key: string;
  credits_spent: number;
  runs: number;
}

export interface GapRow {
  id: string;
  question: string;
  times_seen: number;
  last_seen: string;
}

export interface NativeFactRow {
  id: string;
  subject: string;
  predicate: string;
  object: unknown;
  confidence: number;
  provenance: Record<string, unknown>;
  status: string;
}

/** Candidate facts the ROOTS write. Aggregate-only: no user ids,
 *  no per-user rows, nothing that identifies a person. */
export function buildFeedFacts(
  usage: EstimationUsageRow[],
  features: FeatureUsageRow[],
  gapsOpen: number,
): NativeFactRow[] {
  const totalUses = usage.reduce((n, r) => n + (r.uses_consumed ?? 0), 0);
  const days = usage.length;
  const facts: NativeFactRow[] = [
    {
      id: "frelux-usage-estimation-30d",
      subject: "frelux estimation usage",
      predicate: "last_30_days",
      object: { uses: totalUses, days },
      confidence: 0.5,
      provenance: {
        source: "frelux-usage",
        note: "aggregated estimation_usage_daily (no user data)",
      },
      status: "candidate",
    },
  ];
  const byFeature = features
    .slice()
    .sort((a, b) => (b.credits_spent ?? 0) - (a.credits_spent ?? 0))
    .slice(0, 5);
  facts.push({
    id: "frelux-usage-ai-features-30d",
    subject: "frelux ai feature usage",
    predicate: "last_30_days",
    object: {
      top_features: byFeature.map(
        (f) => `${f.feature_key}: ${f.runs} runs, ${f.credits_spent} credits`,
      ),
    },
    confidence: 0.5,
    provenance: {
      source: "frelux-usage",
      note: "aggregated ai_feature_usage (no user data)",
    },
    status: "candidate",
  });
  facts.push({
    id: "frelux-usage-knowledge-gaps",
    subject: "frelux knowledge gaps",
    predicate: "open_count",
    object: { open_gaps: gapsOpen },
    confidence: 0.5,
    provenance: {
      source: "frelux-usage",
      note: "questions users asked that no engine could handle",
    },
    status: "candidate",
  });
  return facts;
}

/** OXYGEN — plain, honest knowledge sentences for FRELUX
 *  surfaces. VALIDATED facts only: nothing candidate, nothing
 *  invented. Plain-answers directive applies: no confidence
 *  percentages, no provenance narration. */
export function formatValidatedKnowledge(
  facts: NativeFactRow[],
  limit = 20,
): Array<{ subject: string; text: string }> {
  return facts
    .filter((f) => f.status === "validated")
    .slice(0, limit)
    .map((f) => ({
      subject: f.subject,
      text: `${f.subject} ${f.predicate}: ${stringifyObject(f.object)}`,
    }));
}

function stringifyObject(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
