// =========================================================
// ARCHIE NATIVE ENGINE — CODING IMPACT & GRAPH ANALYTICS
// supabase/functions/_shared/archie-ai/native-engine/coding-impact.ts
//
// DEEPENED MULTI-FILE ANALYSIS on top of coding-project.ts.
// Everything deterministic, derived from the real dependency
// graph — no heuristics pretending to be semantics:
//
//   * IMPACT ANALYSIS — change a file, get the exact reverse
//     transitive blast radius: which files depend on it,
//     directly and transitively, with BFS depth
//   * DEAD-FILE DETECTION — files unreachable from any entry
//     candidate within the analyzed set (honestly scoped:
//     dynamic imports and string-built specifiers are NOT
//     traced, so results carry an explicit caveat)
//   * COUPLING METRICS — fan-in / fan-out per file, and the
//     most-coupled files ranked
//   * DEPTH METRICS — longest import chain and per-file
//     dependency depth (layering signal)
//
// Open-ended generative coding stays NOT_IMPLEMENTED.
// =========================================================

import type { ProjectAnalysis } from "./coding-project.ts";
import type { CapabilityReport } from "./types.ts";

// ---------------------------------------------------------
// Impact analysis — reverse transitive dependents
// ---------------------------------------------------------

export interface ImpactedFile {
  path: string;
  /** 1 = direct importer, 2 = importer of a direct importer, … */
  depth: number;
  /** The direct-import chain from the changed file up to this file. */
  via: string[];
}

export interface ImpactReport {
  changed: string[];
  impacted: ImpactedFile[];
  /** Sorted: depth, then path. */
  blastRadiusCount: number;
  /** Honest caveat always attached. */
  caveat: string;
}

export const IMPACT_CAVEAT =
  "graph-based on static import resolution — dynamic imports and string-built specifiers are not traced";

export function impactAnalysis(
  changedPaths: string[],
  project: ProjectAnalysis,
): ImpactReport {
  // reverse adjacency: dependency → its importers
  const reverse = new Map<string, string[]>();
  for (const e of project.graph) {
    const list = reverse.get(e.to) ?? [];
    list.push(e.from);
    reverse.set(e.to, list);
  }
  for (const [k, list] of reverse) reverse.set(k, [...new Set(list)].sort());

  const impacted = new Map<string, ImpactedFile>();
  const queue: Array<{ node: string; depth: number; via: string[] }> = [];
  for (const start of [...new Set(changedPaths)].sort()) {
    for (const importer of reverse.get(start) ?? []) {
      queue.push({ node: importer, depth: 1, via: [start] });
    }
  }

  while (queue.length > 0) {
    const { node, depth, via } = queue.shift()!;
    const existing = impacted.get(node);
    if (existing && existing.depth <= depth) continue; // BFS keeps shortest depth
    impacted.set(node, { path: node, depth, via });
    for (const importer of reverse.get(node) ?? []) {
      queue.push({ node: importer, depth: depth + 1, via: [...via, node] });
    }
  }

  const impactedList = [...impacted.values()].sort(
    (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
  );
  return {
    changed: [...new Set(changedPaths)].sort(),
    impacted: impactedList,
    blastRadiusCount: impactedList.length,
    caveat: IMPACT_CAVEAT,
  };
}

// ---------------------------------------------------------
// Dead-file detection — unreachable from entries
// ---------------------------------------------------------

export interface DeadFileReport {
  /** Files unreachable from any entry candidate (e.g.
   *  detached cycles imported only by each other). */
  dead: Array<{ path: string; reason: string }>;
  /** Files with NO inbound AND NO outbound edges — imported by
   *  nothing, importing nothing. The likeliest dead code, but
   *  a genuine standalone entry looks identical. */
  isolated: Array<{ path: string; reason: string }>;
  /** Entry candidates the reachability search started from. */
  entries: string[];
  caveat: string;
}

export const DEAD_FILE_CAVEAT =
  "unreachable from any detected entry candidate — but entry detection is heuristic: dynamic imports, string-built specifiers and non-imported registrations (routes, configs) can keep a file alive; NEVER delete on this signal alone";

export function detectDeadFiles(project: ProjectAnalysis): DeadFileReport {
  const adjacency = new Map<string, string[]>();
  for (const e of project.graph) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }

  const reachable = new Set<string>();
  const stack = [...project.entryCandidates];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }

  const dead = project.analyses
    .map((a) => a.path)
    .filter((p) => !reachable.has(p))
    .sort()
    .map((path) => ({
      path,
      reason: "not reachable from any entry candidate via internal imports",
    }));

  // isolated: zero fan-in AND zero fan-out — a true orphan OR a
  // legitimate standalone entry; reported separately, never
  // conflated with the unreachable set.
  const fanIn = new Set(project.graph.map((e) => e.to));
  const fanOut = new Set(project.graph.map((e) => e.from));
  const isolated = project.analyses
    .map((a) => a.path)
    .filter((p) => !fanIn.has(p) && !fanOut.has(p))
    .sort()
    .map((path) => ({
      path,
      reason:
        "imported by nothing and imports nothing — either dead code or a legitimate standalone entry (human disambiguation required)",
    }));

  return {
    dead,
    isolated,
    entries: project.entryCandidates,
    caveat: DEAD_FILE_CAVEAT,
  };
}

// ---------------------------------------------------------
// Coupling metrics — fan-in / fan-out
// ---------------------------------------------------------

export interface FileCoupling {
  path: string;
  /** How many files import this file. */
  fanIn: number;
  /** How many files this file imports. */
  fanOut: number;
}

export interface CouplingReport {
  files: FileCoupling[];
  /** Highest fan-in first — the load-bearing modules. */
  mostImported: FileCoupling[];
  /** Highest fan-out first — the integration-heavy modules. */
  mostImporting: FileCoupling[];
  /** Files with zero fan-in AND not entry candidates — candidate dead code. */
  zeroFanIn: Array<{ path: string; isEntryCandidate: boolean }>;
}

export function couplingMetrics(project: ProjectAnalysis): CouplingReport {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of project.graph) {
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
  }
  const entrySet = new Set(project.entryCandidates);
  const files = project.analyses
    .map((a) => ({
      path: a.path,
      fanIn: fanIn.get(a.path) ?? 0,
      fanOut: fanOut.get(a.path) ?? 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    mostImported: [...files]
      .sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path))
      .filter((f) => f.fanIn > 0)
      .slice(0, 10),
    mostImporting: [...files]
      .sort((a, b) => b.fanOut - a.fanOut || a.path.localeCompare(b.path))
      .filter((f) => f.fanOut > 0)
      .slice(0, 10),
    zeroFanIn: files
      .filter((f) => f.fanIn === 0)
      .map((f) => ({ path: f.path, isEntryCandidate: entrySet.has(f.path) })),
  };
}

// ---------------------------------------------------------
// Depth metrics — layering signal
// ---------------------------------------------------------

export interface DepthReport {
  /** Longest import chain found (1 = a→b, 2 = a→b→c, …). */
  longestChain: number;
  /** The longest chain itself, import order. */
  longestChainPath: string[];
  /** Per-file dependency depth (its own longest import chain). */
  perFile: Array<{ path: string; depth: number }>;
}

export function depthMetrics(project: ProjectAnalysis): DepthReport {
  const adjacency = new Map<string, string[]>();
  for (const e of project.graph) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  for (const [k, list] of adjacency)
    adjacency.set(k, [...new Set(list)].sort());

  /** Longest chain STARTING at node (node included).
   *  NO cross-file memoization: a cycle guard makes chain
   *  results context-dependent, so caching one context's
   *  answer would poison another file's result. Each file
   *  is computed independently — deterministic, O(n²) worst
   *  case, and exact for DAGs and cycle-guarded graphs. */
  function longestFrom(
    node: string,
    visiting: Set<string>,
  ): {
    depth: number;
    chain: string[];
  } {
    if (visiting.has(node)) return { depth: 0, chain: [] }; // cycle guard
    visiting.add(node);
    let best: { depth: number; chain: string[] } = { depth: 1, chain: [node] };
    for (const next of adjacency.get(node) ?? []) {
      const sub = longestFrom(next, visiting);
      if (sub.depth + 1 > best.depth) {
        best = { depth: sub.depth + 1, chain: [node, ...sub.chain] };
      }
    }
    visiting.delete(node);
    return best;
  }

  const perFile: Array<{ path: string; depth: number }> = [];
  let longestChain = 0;
  let longestChainPath: string[] = [];
  for (const a of project.analyses) {
    const { depth, chain } = longestFrom(a.path, new Set());
    perFile.push({ path: a.path, depth });
    if (depth > longestChain) {
      longestChain = depth;
      longestChainPath = chain;
    }
  }
  perFile.sort((a, b) => b.depth - a.depth || a.path.localeCompare(b.path));
  return { longestChain, longestChainPath, perFile };
}

// ---------------------------------------------------------
// Honest capability reports
// ---------------------------------------------------------
export function codingImpactCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "coding-impact-analysis",
      description:
        "Reverse-transitive impact (blast-radius) analysis from the dependency graph: exact affected files with BFS depth and import chains",
      maturity: "OPERATIONAL",
      measuredBy:
        "coding-impact.test.ts (direct/transitive impact, cycles, coupling, depth, dead files)",
    },
    {
      id: "coding-dead-file-detection",
      description:
        "Dead-file detection: files unreachable from entry candidates via internal imports, with explicit never-delete-alone caveat",
      maturity: "OPERATIONAL",
      measuredBy: "coding-impact.test.ts (dead-file cases)",
    },
    {
      id: "coding-coupling-metrics",
      description:
        "Fan-in/fan-out coupling metrics, load-bearing module ranking, zero-fan-in candidates, dependency-depth layering",
      maturity: "OPERATIONAL",
      measuredBy: "coding-impact.test.ts (coupling and depth cases)",
    },
    {
      id: "coding-semantic-analysis",
      description:
        "Semantic/dataflow analysis, type checking, or runtime behavior prediction",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — static import-graph analysis only, never presented as semantics",
    },
  ];
}
