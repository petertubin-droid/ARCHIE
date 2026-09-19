// =========================================================
// ARCHIE NATIVE ENGINE — CODING PROJECT INTELLIGENCE
// supabase/functions/_shared/archie-ai/native-engine/coding-project.ts
//
// MULTI-FILE PROJECT ANALYSIS on top of the single-file
// analyzer (coding.ts). Everything here is deterministic —
// real graph algorithms, real resolution rules, no fake AI:
//
//   * INTERNAL DEPENDENCY GRAPH — imports resolved against
//     the actual file set (relative paths, aliases,
//     extensionless specifiers, index files)
//   * BROKEN IMPORTS — project-relative specifiers that
//     resolve to nothing are reported, never guessed
//   * IMPORT CYCLES — DFS cycle detection (a→b→a)
//   * ENTRY CANDIDATES — files nothing else imports
//   * DEPENDENCY-AWARE SCAFFOLDS — unit-test scaffolds that
//     vi.mock() every internal dependency of the module, so
//     tests exercise the module in isolation
//
// Open-ended generative coding stays NOT_IMPLEMENTED — this
// module deepens deterministic analysis, it does not fake
// generation.
// =========================================================

import {
  analyzeSource,
  CodeAnalysis,
  generateUnitTestScaffold,
} from "./coding.ts";
import type { CapabilityReport } from "./types.ts";

export interface ProjectFile {
  path: string;
  source: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  /** resolved specifier — what the import line says */
  specifier: string;
}

export interface CycleReport {
  files: string[]; // a → b → … → a
}

export interface ProjectAnalysis {
  files: number;
  analyses: CodeAnalysis[];
  /** internal edges only (external packages excluded) */
  graph: DependencyEdge[];
  /** project-relative imports that resolve to no file in the set */
  brokenImports: DependencyEdge[];
  cycles: CycleReport[];
  /** files no other project file imports */
  entryCandidates: string[];
  metrics: {
    totalLines: number;
    totalFunctions: number;
    averageCyclomatic: number;
    riskiest: Array<{ path: string; cyclomatic: number }>;
  };
}

// ---------------------------------------------------------
// Import resolution — deterministic candidate enumeration
// ---------------------------------------------------------

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"] as const;
const INDEX_SUFFIXES = [
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
] as const;

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Whether a specifier could point inside the project set. */
function isProjectRelative(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("@/");
}

/**
 * Resolve a project-relative specifier to a file in the set.
 * Deterministic candidate order: exact + extensions, then
 * index files. Returns null when nothing matches (honest
 * broken-import signal, never a guess).
 */
export function resolveImport(
  specifier: string,
  importerPath: string,
  filePaths: Set<string>,
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = "src/" + specifier.slice(2);
  } else {
    const dir = importerPath.includes("/")
      ? importerPath.slice(0, importerPath.lastIndexOf("/"))
      : "";
    base = normalizePath(`${dir}/${specifier}`);
  }
  const candidates = [
    ...EXTENSIONS.map((ext) => base + ext),
    ...INDEX_SUFFIXES.map((s) => base + s),
  ];
  for (const c of candidates) {
    if (filePaths.has(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------
// Multi-file project analysis
// ---------------------------------------------------------
export function analyzeProject(files: ProjectFile[]): ProjectAnalysis {
  const filePaths = new Set(files.map((f) => f.path));
  const analyses: CodeAnalysis[] = [];
  const graph: DependencyEdge[] = [];
  const brokenImports: DependencyEdge[] = [];

  for (const file of files) {
    const analysis = analyzeSource(file.path, file.source);
    analyses.push(analysis);
    for (const specifier of analysis.imports) {
      if (!isProjectRelative(specifier)) continue; // external package
      const resolved = resolveImport(specifier, file.path, filePaths);
      if (resolved === null) {
        brokenImports.push({
          from: file.path,
          to: specifier,
          specifier,
        });
      } else if (resolved !== file.path) {
        graph.push({ from: file.path, to: resolved, specifier });
      }
      // self-import resolves but is not a real edge; skip
    }
  }

  // -------- cycle detection (iterative DFS, deterministic
  // order: files sorted by path) --------
  const adjacency = new Map<string, string[]>();
  for (const e of graph) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  for (const [k, list] of adjacency)
    adjacency.set(k, [...new Set(list)].sort());

  const cycles: CycleReport[] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function dfs(node: string) {
    state.set(node, "visiting");
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const st = state.get(next);
      if (st === "visiting") {
        const startIdx = stack.indexOf(next);
        cycles.push({ files: [...stack.slice(startIdx), next] });
      } else if (st === undefined) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, "done");
  }

  for (const path of [...filePaths].sort()) {
    if (!state.has(path)) dfs(path);
  }

  // -------- entry candidates: zero inbound internal edges
  const inbound = new Set(graph.map((e) => e.to));
  const entryCandidates = [...filePaths].filter((p) => !inbound.has(p)).sort();

  // -------- project metrics --------
  const totalLines = analyses.reduce((a, x) => a + x.lines, 0);
  const totalFunctions = analyses.reduce((a, x) => a + x.functions.length, 0);
  const averageCyclomatic =
    analyses.length === 0
      ? 0
      : Math.round(
          (analyses.reduce((a, x) => a + x.complexity.cyclomatic, 0) /
            analyses.length) *
            10,
        ) / 10;
  const riskiest = [...analyses]
    .sort(
      (a, b) =>
        b.complexity.cyclomatic - a.complexity.cyclomatic ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 5)
    .map((a) => ({ path: a.path, cyclomatic: a.complexity.cyclomatic }));

  return {
    files: files.length,
    analyses,
    graph,
    brokenImports,
    cycles,
    entryCandidates,
    metrics: {
      totalLines,
      totalFunctions,
      averageCyclomatic,
      riskiest,
    },
  };
}

// ---------------------------------------------------------
// Dependency-aware test scaffolds
// ---------------------------------------------------------
/**
 * Unit-test scaffold for ONE module of the project that
 * vi.mock()s every internal dependency first, so the module
 * is tested in isolation. Deterministic: derived purely from
 * the project graph.
 */
export function generateDependencyAwareTestScaffold(
  modulePath: string,
  project: ProjectAnalysis,
): string {
  const analysis = project.analyses.find((a) => a.path === modulePath);
  if (!analysis) {
    return `// ARCHIE Native Engine: module "${modulePath}" not found in the project set.\n`;
  }
  const internalDeps = [
    ...new Set(
      project.graph.filter((e) => e.from === modulePath).map((e) => e.to),
    ),
  ].sort();

  const importPath = (p: string) =>
    p.replace(/\.(ts|tsx)$/, "").replace(/^src\//, "@/") || p;

  const mockLines =
    internalDeps.length === 0
      ? ["// No internal project dependencies — no vi.mock lines needed."]
      : [
          `// Mock every internal dependency first: module tested in isolation`,
          ...internalDeps.flatMap((dep) => [`vi.mock("${importPath(dep)}");`]),
        ];

  const base = generateUnitTestScaffold(modulePath, analysis);
  // The base scaffold's first two lines are the vitest import
  // and the module import; everything after is the suite body.
  const baseLines = base.split("\n");
  const moduleImport =
    baseLines.find((l) => /^import /.test(l) && !/vitest/.test(l)) ?? "";
  const suiteBody = baseLines.filter((l) => !/^import /.test(l));

  return [
    `import { describe, it, expect, vi } from "vitest";`,
    ...(moduleImport ? [moduleImport] : []),
    ``,
    `// Generated by ARCHIE Native Engine — dependency-aware scaffold.`,
    `// Project basis: ${project.files} file(s), ${project.graph.length} internal edge(s), ${internalDeps.length} direct internal dependency(ies) of ${modulePath}.`,
    ...mockLines,
    ``,
    ...suiteBody,
  ].join("\n");
}

/** Honest capability reports for the deepened coding engine. */
export function codingProjectCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "coding-intelligence-project",
      description:
        "Multi-file project analysis: internal dependency graph (alias + relative + extensionless + index resolution), broken-import detection, DFS import-cycle detection, entry-candidate discovery, project complexity metrics",
      maturity: "OPERATIONAL",
      measuredBy:
        "coding-project.test.ts (graph, cycles, broken imports, metrics)",
    },
    {
      id: "coding-intelligence-scaffold-dependency-aware",
      description:
        "Dependency-aware unit-test scaffold generation: vi.mock() lines derived from the project graph so modules are tested in isolation",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine scaffold-generation: coding-project.test.ts (dependency-aware scaffold cases)",
    },
  ];
}
