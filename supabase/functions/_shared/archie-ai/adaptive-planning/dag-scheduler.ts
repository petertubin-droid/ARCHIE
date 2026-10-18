// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — DAG SCHEDULER
//
// Directed Acyclic Graph (DAG) scheduling, topological
// sorting, cycle detection, parallel execution waves,
// PERT duration estimation, and Critical Path Method (CPM).
// =========================================================

import type {
  AdaptivePlanStepNode,
  CriticalPathAnalysis,
} from "./types.ts";

export class DagScheduler {
  /**
   * Validates DAG integrity: verifies all dependencies exist
   * and confirms the graph has no circular dependencies.
   */
  validateDag(steps: AdaptivePlanStepNode[]): {
    valid: boolean;
    issues: string[];
    hasCycles: boolean;
  } {
    const issues: string[] = [];
    const stepIds = new Set(steps.map((s) => s.id));

    // Check missing dependency IDs
    for (const step of steps) {
      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          issues.push(
            `Step "${step.id}" depends on non-existent step "${depId}".`,
          );
        }
      }
    }

    // Detect cycles using DFS with 3-state coloring
    // 0: unvisited, 1: visiting (in stack), 2: visited
    const state = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const s of steps) {
      adj.set(s.id, [...s.dependsOn]);
      state.set(s.id, 0);
    }

    let hasCycle = false;
    const dfs = (nodeId: string, path: string[]) => {
      state.set(nodeId, 1);
      const deps = adj.get(nodeId) || [];
      for (const dep of deps) {
        if (!stepIds.has(dep)) continue;
        const depState = state.get(dep) || 0;
        if (depState === 1) {
          hasCycle = true;
          issues.push(
            `Circular dependency detected: ${[...path, nodeId, dep].join(" -> ")}`,
          );
        } else if (depState === 0) {
          dfs(dep, [...path, nodeId]);
        }
      }
      state.set(nodeId, 2);
    };

    for (const s of steps) {
      if ((state.get(s.id) || 0) === 0) {
        dfs(s.id, []);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      hasCycles: hasCycle,
    };
  }

  /**
   * Groups steps into parallel execution waves using topological
   * stratification. Wave 0 contains steps with zero dependencies;
   * Wave k contains steps whose dependencies are all resolved in
   * earlier waves.
   */
  computeExecutionWaves(steps: AdaptivePlanStepNode[]): string[][] {
    if (steps.length === 0) return [];

    const validation = this.validateDag(steps);
    // If strict circular dependencies are detected, refuse to produce invalid wave order
    if (validation.hasCycles) {
      return [];
    }

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    const stepMap = new Map<string, AdaptivePlanStepNode>();

    for (const s of steps) {
      stepMap.set(s.id, s);
      inDegree.set(s.id, s.dependsOn.length);
      dependents.set(s.id, []);
    }

    for (const s of steps) {
      for (const depId of s.dependsOn) {
        if (dependents.has(depId)) {
          dependents.get(depId)!.push(s.id);
        }
      }
    }

    const waves: string[][] = [];
    let currentWave: string[] = [];

    // Find initial steps with inDegree === 0
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        currentWave.push(id);
      }
    }

    // Sort deterministically
    currentWave.sort();

    const visitedCount = { count: 0 };

    while (currentWave.length > 0) {
      waves.push(currentWave);
      visitedCount.count += currentWave.length;

      const nextWave: string[] = [];
      for (const stepId of currentWave) {
        const nextSteps = dependents.get(stepId) || [];
        for (const nextId of nextSteps) {
          const currentDeg = (inDegree.get(nextId) || 1) - 1;
          inDegree.set(nextId, currentDeg);
          if (currentDeg === 0) {
            nextWave.push(nextId);
          }
        }
      }

      nextWave.sort();
      currentWave = nextWave;
    }

    // If there were unvisited nodes (cycle or orphaned), do not schedule them
    return waves;
  }

  /**
   * Computes expected duration.
   * If actual measured duration is recorded in telemetry, honors it.
   * Otherwise uses 3-point PERT estimation: (Optimistic + 4*Expected + Pessimistic) / 6.
   */
  computePertDuration(step: AdaptivePlanStepNode): number {
    if (step.measuredDurationMs !== undefined && step.measuredDurationMs > 0) {
      return Math.round(step.measuredDurationMs);
    }
    const opt = step.optimisticDurationMs || step.estimatedDurationMs || 100;
    const exp = step.estimatedDurationMs || 200;
    const pess = step.pessimisticDurationMs || (step.estimatedDurationMs ? step.estimatedDurationMs * 2 : 500);
    return Math.round((opt + 4 * exp + pess) / 6);
  }

  /**
   * Propagates a step failure downstream to all direct and indirect dependents,
   * updating their statuses to "blocked" with the root failure explanation.
   */
  propagateFailure(
    steps: AdaptivePlanStepNode[],
    failedStepId: string,
    failureReason: string,
  ): string[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const dependentsMap = new Map<string, string[]>();

    for (const s of steps) {
      for (const depId of s.dependsOn) {
        const list = dependentsMap.get(depId) || [];
        list.push(s.id);
        dependentsMap.set(depId, list);
      }
    }

    const blockedIds: string[] = [];
    const queue = [...(dependentsMap.get(failedStepId) || [])];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = stepMap.get(currentId);
      if (node && node.status !== "executed") {
        node.status = "blocked";
        node.error = `Cascading dependency failure: Prerequisite step "${failedStepId}" failed (${failureReason}).`;
        blockedIds.push(node.id);
      }

      const nextDeps = dependentsMap.get(currentId) || [];
      for (const nxt of nextDeps) {
        if (!visited.has(nxt)) {
          queue.push(nxt);
        }
      }
    }

    return blockedIds;
  }

  /**
   * Performs Critical Path Method (CPM) forward and backward passes
   * to determine the critical path, total duration, slack, and bottlenecks.
   */
  computeCriticalPath(steps: AdaptivePlanStepNode[]): CriticalPathAnalysis {
    if (steps.length === 0) {
      return {
        criticalPathStepIds: [],
        totalEstimatedDurationMs: 0,
        slackPerStep: {},
        parallelExecutionWaves: [],
        bottlenecks: [],
      };
    }

    const waves = this.computeExecutionWaves(steps);
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const durations = new Map<string, number>();

    for (const s of steps) {
      durations.set(s.id, this.computePertDuration(s));
    }

    // Forward pass: calculate ES (Earliest Start) and EF (Earliest Finish)
    const es = new Map<string, number>();
    const ef = new Map<string, number>();

    for (const wave of waves) {
      for (const stepId of wave) {
        const step = stepMap.get(stepId);
        if (!step) continue;
        const dur = durations.get(stepId) || 200;
        let maxPredecessorEf = 0;
        for (const depId of step.dependsOn) {
          const depEf = ef.get(depId) || 0;
          if (depEf > maxPredecessorEf) {
            maxPredecessorEf = depEf;
          }
        }
        es.set(stepId, maxPredecessorEf);
        ef.set(stepId, maxPredecessorEf + dur);
      }
    }

    let projectDuration = 0;
    for (const finishTime of ef.values()) {
      if (finishTime > projectDuration) {
        projectDuration = finishTime;
      }
    }

    // Backward pass: calculate LF (Latest Finish) and LS (Latest Start)
    const successors = new Map<string, string[]>();
    for (const s of steps) {
      successors.set(s.id, []);
    }
    for (const s of steps) {
      for (const depId of s.dependsOn) {
        if (successors.has(depId)) {
          successors.get(depId)!.push(s.id);
        }
      }
    }

    const lf = new Map<string, number>();
    const ls = new Map<string, number>();

    // Traverse waves in reverse order
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      for (const stepId of wave) {
        const succs = successors.get(stepId) || [];
        const dur = durations.get(stepId) || 200;
        let minSuccessorLs = projectDuration;

        if (succs.length > 0) {
          minSuccessorLs = Math.min(
            ...succs.map((succId) => ls.get(succId) ?? projectDuration),
          );
        }

        lf.set(stepId, minSuccessorLs);
        ls.set(stepId, minSuccessorLs - dur);
      }
    }

    // Slack = LS - ES (or LF - EF)
    const slackPerStep: Record<string, number> = {};
    const criticalPathStepIds: string[] = [];

    for (const s of steps) {
      const stepEs = es.get(s.id) || 0;
      const stepLs = ls.get(s.id) || 0;
      const slack = Math.max(0, stepLs - stepEs);
      slackPerStep[s.id] = slack;

      if (slack <= 1) {
        criticalPathStepIds.push(s.id);
      }
    }

    // Sort critical path steps by earliest start time
    criticalPathStepIds.sort((a, b) => (es.get(a) || 0) - (es.get(b) || 0));

    // Identify bottlenecks
    const avgDuration =
      Array.from(durations.values()).reduce((a, b) => a + b, 0) /
      Math.max(1, steps.length);

    const bottlenecks: Array<{ stepId: string; reason: string }> = [];
    for (const s of steps) {
      const isCritical = criticalPathStepIds.includes(s.id);
      const dur = durations.get(s.id) || 0;
      const rel = s.reliabilityScore;

      if (isCritical && dur > avgDuration * 1.5) {
        bottlenecks.push({
          stepId: s.id,
          reason: `Critical path duration bottleneck: ${dur}ms (avg: ${Math.round(avgDuration)}ms)`,
        });
      } else if (isCritical && rel < 0.8) {
        bottlenecks.push({
          stepId: s.id,
          reason: `Critical path risk bottleneck: reliability score is ${(rel * 100).toFixed(1)}%`,
        });
      } else if (s.requiresOwnerAuthorization && isCritical) {
        bottlenecks.push({
          stepId: s.id,
          reason: "Critical path gate: requires explicit Owner Authorization before continuation",
        });
      }
    }

    return {
      criticalPathStepIds,
      totalEstimatedDurationMs: projectDuration,
      slackPerStep,
      parallelExecutionWaves: waves,
      bottlenecks,
    };
  }
}
