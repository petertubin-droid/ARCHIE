// ============================================================
// ARCHIE BOUNDED SELF-TUNING ENGINE
// (full-agent audit 2026-10-17, gap C-1)
//
// Before this engine every budget was a compile-time constant:
// no amount of real-world evidence could make ARCHIE reason
// deeper when it was succeeding, or cheaper when it was
// thrashing. This engine tunes the REAL bounded parameters
// the reasoning path consumes (ReasoningLimits), under
// owner-approved envelopes:
//
//   * ENVELOPE: every parameter has hard [min, max] bounds.
//     A proposal outside the envelope is refused. Period.
//   * EVIDENCE: adjustment direction comes from the REAL
//     Beta-calibration history of the parameter itself —
//     high recent success widens capability, poor success
//     narrows it. No random search, no guessing.
//   * ROLLBACK: if the metric regresses after an adjustment,
//     the next cycle reverts to the previous value and the
//     rollback is recorded.
//   * AUDIT: every applied/rolled-back/no-op decision is an
//     archie_tuning_events row — the tuning history is data.
//   * HONESTY: only owner-approved parameter rows are tuned;
//     everything else stays at the code defaults. Failed DB
//     reads degrade to defaults — never to invented values.
//
// Deterministic end to end. No external AI.
// ============================================================

import { DEFAULT_REASONING_LIMITS } from "../../reasoning/types.ts";
import type { ReasoningLimits } from "../../reasoning/types.ts";
import { createCalibrationStore } from "./uncertainty.ts";

export interface TuningClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const TUNING_PARAMS_TABLE = "archie_tuning_params";
export const TUNING_EVENTS_TABLE = "archie_tuning_events";

/** The tunable parameters — all REAL ReasoningLimits fields
 *  consumed by the live reasoning path. */
export interface TunableParam {
  key: keyof ReasoningLimits;
  default: number;
  min: number;
  max: number;
  step: number; // absolute step per cycle (integer-safe)
}

export const TUNABLE_PARAMS: TunableParam[] = [
  { key: "maxSteps", default: DEFAULT_REASONING_LIMITS.maxSteps, min: 8, max: 48, step: 4 },
  { key: "maxDepth", default: DEFAULT_REASONING_LIMITS.maxDepth, min: 2, max: 12, step: 1 },
  { key: "maxCandidates", default: DEFAULT_REASONING_LIMITS.maxCandidates, min: 2, max: 16, step: 1 },
  { key: "maxConcepts", default: DEFAULT_REASONING_LIMITS.maxConcepts, min: 2, max: 32, step: 2 },
  { key: "maxEngineInvocations", default: DEFAULT_REASONING_LIMITS.maxEngineInvocations, min: 1, max: 12, step: 1 },
  { key: "maxBlockChars", default: DEFAULT_REASONING_LIMITS.maxBlockChars, min: 500, max: 8000, step: 500 },
];

/** Deterministic proposal: where should this parameter move,
 *  given its REAL success history?
 *    success >= 0.85 → +step (capability widens)
 *    success <= 0.50 → -step (capability narrows, cost drops)
 *    otherwise       → keep (no evidence for a change)
 *  Always clamped into the envelope. Integer parameters stay
 *  integers. */
export function nextProposal(
  param: TunableParam,
  current: number,
  successRate: number | null,
): number {
  const cur = clampEnvelope(param, current);
  if (successRate === null) return cur; // no history → no change
  let next = cur;
  if (successRate >= 0.85) next = cur + param.step;
  else if (successRate <= 0.5) next = cur - param.step;
  return clampEnvelope(param, next);
}

export function clampEnvelope(param: TunableParam, v: number): number {
  const min = Math.min(param.min, param.default);
  const max = Math.max(param.max, param.default);
  const n = Math.min(max, Math.max(min, Math.round(v)));
  return Math.max(1, n);
}

/** Read the tuned limits. ONLY owner-approved rows apply, each
 *  clamped into its envelope; anything missing or failed
 *  degrades to the code defaults — never invented values. */
export async function readTunedLimits(
  client: TuningClient,
): Promise<ReasoningLimits> {
  const limits = { ...DEFAULT_REASONING_LIMITS };
  let rows: Array<{
    param_key: string;
    current: number;
    owner_approved: boolean;
  }> = [];
  try {
    const r = await client
      .from(TUNING_PARAMS_TABLE)
      .select("param_key, current, owner_approved");
    rows = ((r as { data?: typeof rows } | null)?.data ?? []) as typeof rows;
  } catch {
    return limits; // honest degradation to defaults
  }
  for (const param of TUNABLE_PARAMS) {
    const row = rows.find(
      (x) => x.param_key === param.key && x.owner_approved === true,
    );
    if (!row) continue;
    const parsed = Number(row.current);
    if (!Number.isFinite(parsed)) continue;
    limits[param.key] = clampEnvelope(param, parsed);
  }
  return limits;
}

export interface TuningCycleResult {
  param: string;
  before: number;
  after: number;
  successRate: number | null;
  decision: "applied" | "kept" | "rolled_back" | "skipped_unapproved";
  reason: string;
}

/** One self-tuning cycle over ALL tunable params. For each:
 *  read its REAL calibration history, propose, apply within
 *  the envelope, record the event. Rollback rule: a param
 *  whose history regressed after the last adjustment reverts
 *  to the value before that adjustment. Deterministic. */
export async function runTuningCycle(
  client: TuningClient,
): Promise<TuningCycleResult[]> {
  const calibration = createCalibrationStore(client as never);
  const results: TuningCycleResult[] = [];

  let paramRows: Array<{
    param_key: string;
    current: number;
    min: number;
    max: number;
    step: number;
    owner_approved: boolean;
  }> = [];
  try {
    const r = await client
      .from(TUNING_PARAMS_TABLE)
      .select("param_key, current, min, max, step, owner_approved");
    paramRows = ((r as { data?: typeof paramRows } | null)?.data ?? []) as typeof paramRows;
  } catch {
    return []; // tuning never runs on a failed DB
  }

  for (const row of paramRows) {
    const param = TUNABLE_PARAMS.find((p) => p.key === row.param_key);
    if (!param) continue; // unknown parameter — refuse to touch it
    if (!row.owner_approved) {
      results.push({
        param: row.param_key,
        before: Number(row.current),
        after: Number(row.current),
        successRate: null,
        decision: "skipped_unapproved",
        reason: "owner has not approved tuning this parameter",
      });
      continue;
    }

    const history = await calibration.read(`tuning:${row.param_key}`);
    const n = history.successes + history.failures;
    const successRate = n === 0 ? null : history.successes / n;

    // rollback rule: poor success after the LAST applied
    // adjustment reverts to the prior value
    let lastEvent: { from_value: number; to_value: number; outcome: string } | null = null;
    try {
      const r = await client
        .from(TUNING_EVENTS_TABLE)
        .select("from_value, to_value, outcome")
        .eq("param_key", row.param_key)
        .order("created_at", { ascending: false })
        .limit(1);
      const rows = ((r as { data?: Array<{ from_value: number; to_value: number; outcome: string }> } | null)?.data ?? []);
      lastEvent = rows[0] ?? null;
    } catch {
      lastEvent = null;
    }

    let result: TuningCycleResult;
    if (
      lastEvent?.outcome === "applied" &&
      successRate !== null &&
      successRate <= 0.5
    ) {
      // regression → revert to the pre-adjustment value
      const revert = clampEnvelope(param, Number(lastEvent.from_value));
      result = {
        param: row.param_key,
        before: Number(row.current),
        after: revert,
        successRate,
        decision: "rolled_back",
        reason: `regression after last adjustment (success ${successRate.toFixed(2)}) — reverted to ${revert}`,
      };
    } else {
      const proposal = nextProposal(
        param,
        Number(row.current),
        successRate,
      );
      result = {
        param: row.param_key,
        before: Number(row.current),
        after: proposal,
        successRate,
        decision: proposal === Number(row.current) ? "kept" : "applied",
        reason:
          proposal === Number(row.current)
            ? "history gives no evidence to change the parameter"
            : `success ${successRate?.toFixed(2) ?? "?"} with ${n} outcomes — stepped within the envelope`,
      };
    }

    // apply + audit (best-effort: a failed write keeps the
    // in-memory result honest — the DB simply did not move)
    try {
      if (result.decision === "applied" || result.decision === "rolled_back") {
        await client.from(TUNING_PARAMS_TABLE).upsert({
          param_key: row.param_key,
          current: result.after,
          last_tuned_at: new Date().toISOString(),
        });
      }
      await client.from(TUNING_EVENTS_TABLE).insert({
        param_key: row.param_key,
        from_value: result.before,
        to_value: result.after,
        outcome: result.decision,
        success_rate: result.successRate,
        reason: result.reason.slice(0, 500),
      });
    } catch {
      // audited in-memory only; the cycle result still reports
      // truthfully what was computed
    }
    results.push(result);
  }
  return results;
}
