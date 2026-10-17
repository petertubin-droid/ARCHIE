// ============================================================
// ARCHIE UNCERTAINTY & CAUSAL INFERENCE ENGINE
// (full-agent audit 2026-10-17, gap A-2)
//
// Before this engine, confidence flowed through fixed weight
// multipliers: a rule always contributed +0.05, a source was
// always "cross-source", and no amount of real-world evidence
// could calibrate a number. This engine adds:
//
//   1. BETA-BAYES CALIBRATION — every confidence estimate is
//      a Beta posterior over its own outcome history: prior
//      base with priorStrength pseudo-counts, updated by
//      real successes/failures. Deterministic: same inputs,
//      same number, always bounded [0,1].
//   2. CAUSAL PROPAGATION — a directed causal graph (edges
//      carry strength + the BECAUSE explanation) propagates
//      confidence along paths: the confidence at a node is
//      the strongest path product, with the full causal
//      explanation "A→B because C". Cycles terminate
//      honestly (a cycle proves nothing new — the first
//      visit's confidence stands).
//   3. INDEPENDENT COMBINATION — combining independent
//      premises uses noisy-OR-style combination; correlated
//      premises are never combined as if independent (the
//      caller states correlation explicitly).
//
// No external AI. No invented values. Pure deterministic
// math over real history. Persistence is best-effort: a
// failed calibration read/write degrades to the prior base,
// never blocks reasoning.
// ============================================================

export interface BetaHistory {
  successes: number;
  failures: number;
}

/** Beta-Bayes calibrated confidence.
 *
 *  prior: Beta(base × priorStrength, (1-base) × priorStrength)
 *  posterior mean = (α + successes) / (α + β + successes + failures)
 *
 *  - No history → exactly the base prior (nothing invented).
 *  - All successes → drifts up, bounded by 1 - epsilon is NOT
 *    enforced (a 100% success history legitimately reaches
 *    toward 1); the bound [0,1] is always respected.
 *  - All failures → drifts down toward 0.
 *  - Deterministic and monotone in each argument.
 */
export function calibratedConfidence(
  base: number,
  history: BetaHistory,
  priorStrength = 8,
): number {
  const b = clamp01(base);
  const s = Math.max(0, Math.floor(history.successes));
  const f = Math.max(0, Math.floor(history.failures));
  if (priorStrength <= 0) priorStrength = 8;
  const alpha = b * priorStrength;
  const beta = (1 - b) * priorStrength;
  return clamp01((alpha + s) / (alpha + beta + s + f));
}

/** The honest display of an estimate: the number plus the
 *  evidence behind it, so no confidence is ever quoted
 *  without its basis (spec: calibrated uncertainty must be
 *  outcome-grade). */
export function confidenceStatement(
  base: number,
  history: BetaHistory,
  priorStrength?: number,
): { confidence: number; statement: string } {
  const confidence = calibratedConfidence(base, history, priorStrength);
  const n = history.successes + history.failures;
  const basis =
    n === 0
      ? "no outcome history yet (prior estimate)"
      : `${history.successes}/${n} observed outcomes succeeded`;
  return {
    confidence,
    statement: `confidence ${confidence.toFixed(3)} — ${basis}`,
  };
}

// ---------------------------------------------------------
// Causal graph
// ---------------------------------------------------------

/** One causal edge: from --because--> to, with strength
 *  in (0,1]. Strength is the deterministic conditional
 *  support the edge lends along a path. */
export interface CausalEdge {
  from: string;
  to: string;
  strength: number;
  because: string;
}

export interface CausalNodeResult {
  node: string;
  confidence: number;
  /** The full causal explanation: "A→B because C; B→D because E". */
  explanation: string;
  path: string[];
}

/** Propagate causal confidence through a directed graph from
 *  a start node (confidence 1). A node's confidence is the
 *  STRONGEST path product reaching it (deterministic tie-
 *  break: fewest hops, then lexicographic path). Cycles are
 *  terminated honestly: revisiting a node on the same walk
 *  cannot add information, so the walk stops. */
export function propagateCausal(
  edges: CausalEdge[],
  start: string,
  maxDepth = 8,
): CausalNodeResult[] {
  const byFrom = new Map<string, CausalEdge[]>();
  for (const e of edges) {
    const s = clamp01(e.strength);
    if (s <= 0) continue; // a zero-strength edge carries nothing
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from)!.push({ ...e, strength: s });
  }

  const best = new Map<string, { conf: number; hops: number; path: string[]; because: string[] }>();
  best.set(start, { conf: 1, hops: 0, path: [start], because: [] });

  // deterministic BFS over a frontier sorted by confidence
  // (strongest-first), hops, then path — no randomness.
  const frontier: Array<{ node: string; conf: number; hops: number; path: string[]; because: string[] }> = [
    { node: start, conf: 1, hops: 0, path: [start], because: [] },
  ];

  while (frontier.length > 0) {
    frontier.sort((a, b) => b.conf - a.conf || a.hops - b.hops || a.path.join(">").localeCompare(b.path.join(">")));
    const cur = frontier.shift()!;
    if (cur.hops >= maxDepth) continue;
    for (const edge of byFrom.get(cur.node) ?? []) {
      const nextConf = clamp01(cur.conf * edge.strength);
      const nextHops = cur.hops + 1;
      const nextPath = [...cur.path, edge.to];
      // cycle on this walk: stop — the first visit stands
      if (cur.path.includes(edge.to)) continue;
      const existing = best.get(edge.to);
      const isBetter =
        !existing ||
        nextConf > existing.conf + 1e-12 ||
        (Math.abs(nextConf - existing.conf) <= 1e-12 && nextHops < existing.hops);
      if (isBetter) {
        best.set(edge.to, {
          conf: nextConf,
          hops: nextHops,
          path: nextPath,
          because: [...cur.because, edge.because],
        });
        frontier.push({
          node: edge.to,
          conf: nextConf,
          hops: nextHops,
          path: nextPath,
          because: [...cur.because, edge.because],
        });
      }
    }
  }

  const results: CausalNodeResult[] = [];
  for (const [node, r] of best) {
    if (node === start) continue;
    const steps: string[] = [];
    for (let i = 0; i < r.path.length - 1; i++) {
      const edge = (byFrom.get(r.path[i]) ?? []).find((e) => e.to === r.path[i + 1]);
      steps.push(`${r.path[i]}→${r.path[i + 1]} because ${edge?.because ?? "direct support"}`);
    }
    results.push({
      node,
      confidence: r.conf,
      explanation: steps.join("; "),
      path: r.path,
    });
  }
  // deterministic output order
  results.sort((a, b) => b.confidence - a.confidence || a.node.localeCompare(b.node));
  return results;
}

/** Combine confidences of INDEPENDENT premises
 *  (noisy-OR complement): the chance all independent supports
 *  are wrong. Correlated premises must NOT be combined this
 *  way — the caller states independence honestly. */
export function combineIndependently(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  const wrong = confidences.reduce((acc, c) => acc * (1 - clamp01(c)), 1);
  return clamp01(1 - wrong);
}

/** Penultimate-gap honesty: a CONTRADICTION between two
 *  sources caps the honest confidence and says why. */
export function contradictionCapped(
  confidence: number,
  contradiction: boolean,
): number {
  return contradiction ? clamp01(confidence * 0.5) : clamp01(confidence);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

// ---------------------------------------------------------
// Calibration store — best-effort DB persistence
// ---------------------------------------------------------

/** Minimal supabase-like client (same structural contract as
 *  the other engines' persistence layers). */
export interface CalibrationClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export const CALIBRATION_TABLE = "archie_calibration";

export interface CalibrationStore {
  /** Read a key's real history (defaults to zero when absent). */
  read(key: string): Promise<BetaHistory>;
  /** Record one real outcome. Best-effort: errors are
   *  swallowed (calibration degrades to the prior). */
  record(key: string, success: boolean): Promise<void>;
  /** Count of calibrated keys — for honest status. */
  keys(): Promise<number>;
}

export function createCalibrationStore(
  client: CalibrationClient,
): CalibrationStore {
  const safe = async (op: () => Promise<unknown>): Promise<unknown | null> => {
    try {
      return await op();
    } catch {
      return null;
    }
  };
  return {
    async read(key) {
      const r = await safe(() =>
        client.from(CALIBRATION_TABLE).select("successes, failures").eq("calibration_key", key).limit(1)
      );
      const rows = (r as { data?: Array<{ successes: number; failures: number }> } | null)?.data;
      const row = rows?.[0];
      return {
        successes: Math.max(0, Math.floor(row?.successes ?? 0)),
        failures: Math.max(0, Math.floor(row?.failures ?? 0)),
      };
    },
    async record(key, success) {
      // ATOMIC increment via the migration's SQL function
      // (archie_calibration_record) — concurrent isolates can
      // never lose a count. When the RPC is unavailable
      // (pre-migration), degrade honestly: read-modify-write
      // upsert; a concurrent race may lose one count, never a
      // fabricated one.
      if (client.rpc) {
        const r = (await safe(() =>
          client.rpc!("archie_calibration_record", {
            p_key: key,
            p_success: success,
          }),
        )) as { error?: { message: string } | null } | null;
        if (!r?.error) return;
      }
      const current = await this.read(key);
      await safe(() =>
        client.from(CALIBRATION_TABLE).upsert(
          {
            calibration_key: key,
            successes: current.successes + (success ? 1 : 0),
            failures: current.failures + (success ? 0 : 1),
            last_outcome: success ? "SUCCESS" : "FAILURE",
            last_updated: new Date().toISOString(),
          },
          { onConflict: "calibration_key" },
        )
      );
    },
    async keys() {
      const r = await safe(() =>
        client.from(CALIBRATION_TABLE).select("calibration_key", { count: "exact", head: true })
      );
      return ((r as { count?: number } | null)?.count ?? 0) as number;
    },
  };
}
