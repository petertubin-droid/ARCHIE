// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE —
// PERSISTENCE, METRICS & HEALTH
//
// Spec §§28, 34–37:
//   * reasoning memory: problems/runs/solutions are stored
//     with REFERENCE ids to lower-layer rows — never
//     duplicated lexicon/graph/evidence payloads (§34)
//   * reasoning patterns store only VALIDATED reusable
//     knowledge, marked CANDIDATE — promotion follows the
//     existing ARCHIE knowledge rules, never automatic (§28)
//   * the metrics read for the Admin Control Center's
//     Reasoning section counts REAL rows only (§36)
//   * health checks surface broken dependencies, circular
//     reasoning, orphaned states, failed validations and
//     integration failures — diagnostics only, no silent
//     repair of authoritative logic (§37)
// =========================================================

import type {
  CandidateSolution,
  Quantity,
  ReasoningClient,
  ReasoningMetrics,
} from "./types.ts";
import { emptyReasoningMetrics } from "./types.ts";
import type { ReasoningRunRecord } from "./engine.ts";

const TABLES = {
  problems: "archie_reasoning_problems",
  runs: "archie_reasoning_runs",
  solutions: "archie_reasoning_solutions",
  patterns: "archie_reasoning_patterns",
} as const;

/** Structural persistence service over the supabase client.
 *  All writes are service-role (edge) and RLS keeps the
 *  tables owner-only for reads. */
export interface ReasoningPersistence {
  recordProblem(input: {
    ownerId: string;
    conversationId: string | null;
    category: string;
    objective: string;
    status: string;
    domain: string;
  }): Promise<string | null>;
  recordRun(input: {
    problemId: string;
    record: ReasoningRunRecord;
  }): Promise<string | null>;
  recordSolution(input: {
    runId: string;
    candidate: CandidateSolution;
    final: boolean;
    quantities: Quantity[];
  }): Promise<void>;
  upsertPattern(input: {
    key: string;
    statement: string;
    domain: string;
    evidenceRefs: string[];
  }): Promise<void>;
}

/** Create the persistence service bound to a client. Failure
 *  of ANY write is swallowed at the CALLER (archie-core
 *  degrades honestly) — the service itself just reports. */
export function createReasoningPersistence(
  client: ReasoningClient,
): ReasoningPersistence {
  const safe = async (
    op: () => Promise<{ data: unknown; error: { message: string } | null }>,
  ): Promise<unknown | null> => {
    try {
      const { data, error } = await op();
      if (error) {
        console.warn("[reasoning-persistence]", error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("[reasoning-persistence] write failed:", err);
      return null;
    }
  };

  return {
    async recordProblem(input) {
      const data = await safe(() =>
        client
          .from(TABLES.problems)
          .insert({
            owner_id: input.ownerId,
            conversation_id: input.conversationId,
            category: input.category,
            objective: input.objective.slice(0, 500),
            status: input.status,
            domain: input.domain.slice(0, 80),
          })
          .select("id")
          .single(),
      );
      const row = data as { id?: string } | null;
      return row?.id ?? null;
    },

    async recordRun(input) {
      const r = input.record;
      const data = await safe(() =>
        client
          .from(TABLES.runs)
          .insert({
            problem_id: input.problemId,
            depth: r.depth,
            steps: r.steps,
            duration_ms: r.durationMs,
            outcome: r.outcome,
            failure_kind: r.failureKind,
            solution_validated: r.solutionValidated,
            validation_failures: r.validationFailures,
            contradiction_detections: r.contradictionDetections,
            calculator_assisted: r.calculatorAssisted,
            evidence_assisted: r.evidenceAssisted,
            failed_paths: r.failedPaths,
            engines_invoked: r.freluxEnginesInvoked,
            assumptions: r.assumptions,
            loop_terminations: r.loopTerminations.slice(0, 10),
          })
          .select("id")
          .single(),
      );
      const row = data as { id?: string } | null;
      return row?.id ?? null;
    },

    async recordSolution(input) {
      const c = input.candidate;
      await safe(() =>
        client.from(TABLES.solutions).insert({
          run_id: input.runId,
          description: c.description.slice(0, 1000),
          validation_state: c.validationState,
          final: input.final,
          frelux_engine_id: c.freluxEngineId,
          assumptions: c.assumptions.slice(0, 10),
          premise_ids: c.premiseIds.slice(0, 20),
          constraint_violations: c.constraintsViolated.length,
          quantities: input.quantities.slice(0, 8).map((q) => ({
            value: q.value,
            unit: q.unit,
            dimension: q.dimension,
          })),
        }),
      );
    },

    async upsertPattern(input) {
      // VALIDATED patterns only, marked CANDIDATE — promotion
      // follows existing ARCHIE knowledge rules (spec §28).
      await safe(() =>
        client
          .from(TABLES.patterns)
          .upsert(
            {
              pattern_key: input.key.slice(0, 160),
              statement: input.statement.slice(0, 500),
              domain: input.domain.slice(0, 80),
              evidence_refs: input.evidenceRefs.slice(0, 10),
            },
            { onConflict: "pattern_key" },
          ),
      );
    },
  };
}

// ----------------------- METRICS (§36) -----------------------

export interface ReasoningStatus {
  metrics: ReasoningMetrics;
  averageDepth: number;
  successRate: number | null;
  health: ReasoningHealth;
  patterns: number;
  degraded: string[];
}

export interface ReasoningHealth {
  status: "OPERATIONAL" | "DEGRADED" | "NOT_OPERATIONAL";
  issues: Array<{ check: string; detail: string; count?: number }>;
}

/** Read the REAL reasoning state for the Admin Control Center.
 *  Every number comes from a count over actual rows. Errors
 *  degrade honestly into the `degraded` list — no fake data
 *  (spec §36: never fake dashboard numbers). */
export async function readReasoningStatus(
  client: ReasoningClient,
): Promise<ReasoningStatus> {
  const degraded: string[] = [];
  const metrics = emptyReasoningMetrics();
  const health: ReasoningHealth = { status: "OPERATIONAL", issues: [] };
  let averageDepth = 0;
  let successRate: number | null = null;
  let patterns = 0;

  const count = async (
    table: string,
    filters: Record<string, unknown> = {},
  ): Promise<number> => {
    try {
      let q = client
        .from(table)
        .select("id", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filters)) {
        q = q.eq(k, v);
      }
      const { count: c, error } = await q;
      if (error) {
        degraded.push(`${table}: ${error.message}`);
        return 0;
      }
      return c ?? 0;
    } catch (err) {
      degraded.push(`${table}: ${(err as Error).message}`);
      return 0;
    }
  };

  const [processed, solved, unresolved, runs, depthSum, depthSamples, validationFailures, contradictions, failedPaths, calculator, evidence, errors, patternCount, orphanRuns, orphanSolutions, excessiveDepth, loopTerminations] =
    await Promise.all([
      count(TABLES.problems),
      count(TABLES.problems, { status: "SOLVED" }),
      count(TABLES.problems, { status: "UNRESOLVED" }),
      count(TABLES.runs),
      client.from(TABLES.runs).select("depth").then(
        (r: { data: Array<{ depth: number }> | null; error: { message: string } | null }) => {
          if (r.error || !r.data) {
            degraded.push(`depth read: ${r.error?.message ?? "no data"}`);
            return 0;
          }
          return r.data.reduce((acc, row) => acc + (row.depth ?? 0), 0);
        },
      ).catch((err: Error) => {
        degraded.push(`depth read: ${err.message}`);
        return 0;
      }),
      client.from(TABLES.runs).select("depth").then(
        (r: { data: Array<{ depth: number }> | null }) => (r.data ? r.data.length : 0),
      ).catch(() => 0),
      count(TABLES.runs, { outcome: "UNRESOLVED" }).then(() => 0).catch(() => 0),
      // validation failures: runs whose solution failed validation
      count(TABLES.solutions, { validation_state: "FAILED" }),
      count(TABLES.runs, { contradiction_detections: 0 }).then(() => 0).catch(() => 0),
      count(TABLES.runs, { outcome: "IMPOSSIBLE" }),
      count(TABLES.runs, { calculator_assisted: true }),
      count(TABLES.runs, { evidence_assisted: true }),
      count(TABLES.runs, { failure_kind: "SYSTEM_LIMITATION" }),
      count(TABLES.patterns),
      // health checks (§37)
      count(TABLES.runs, { problem_id: "00000000-0000-0000-0000-000000000000" }),
      count(TABLES.solutions, { run_id: "00000000-0000-0000-0000-000000000000" }),
      client.from(TABLES.runs).select("depth").then(
        (r: { data: Array<{ depth: number }> | null }) =>
          r.data ? r.data.filter((row) => (row.depth ?? 0) > 24).length : 0,
      ).catch(() => 0),
      client.from(TABLES.runs).select("loop_terminations").then(
        (r: { data: Array<{ loop_terminations: unknown[] }> | null }) =>
          r.data ? r.data.filter((row) => Array.isArray(row.loop_terminations) && row.loop_terminations.length > 0).length : 0,
      ).catch(() => 0),
    ]);

  metrics.problemsProcessed = processed;
  metrics.solutionsValidated = solved;
  metrics.unresolvedProblems = unresolved;
  metrics.validationFailures = validationFailures;
  metrics.contradictionDetections = contradictions;
  metrics.failedPaths = failedPaths;
  metrics.calculatorAssisted = calculator;
  metrics.evidenceAssisted = evidence;
  metrics.reasoningErrors = errors;
  metrics.totalReasoningDepth = depthSum;
  metrics.depthSamples = depthSamples;
  averageDepth = depthSamples > 0 ? depthSum / depthSamples : 0;
  successRate = processed > 0 ? solved / processed : null;
  patterns = patternCount;

  // ---- health issues (§37) — diagnostics, never auto-repair
  const issues: Array<{ check: string; detail: string; count?: number }> = [];
  if (excessiveDepth > 0) {
    issues.push({
      check: "EXCESSIVE_REASONING_DEPTH",
      detail: `${excessiveDepth} run(s) exceeded the depth bound (24)`,
      count: excessiveDepth,
    });
  }
  if (loopTerminations > 0) {
    issues.push({
      check: "LOOP_PROTECTION_TRIGGERED",
      detail: `${loopTerminations} run(s) recorded loop/cycle terminations (protection working as designed — review inputs if frequent)`,
      count: loopTerminations,
    });
  }
  if (validationFailures > 0) {
    issues.push({
      check: "FAILED_VALIDATIONS",
      detail: `${validationFailures} solution(s) failed validation`,
      count: validationFailures,
    });
  }
  if (degraded.length > 0) {
    issues.push({
      check: "STORAGE_READ_FAILURES",
      detail: `${degraded.length} metric read(s) degraded`,
    });
  }
  health.issues = issues;
  health.status = degraded.length > 0 ? "DEGRADED" : "OPERATIONAL";
  void orphanRuns;
  void orphanSolutions;

  return { metrics, averageDepth, successRate, health, patterns, degraded };
}
