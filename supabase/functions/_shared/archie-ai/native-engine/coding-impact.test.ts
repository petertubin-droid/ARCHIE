// =========================================================
// ARCHIE NATIVE ENGINE — CODING IMPACT & GRAPH ANALYTICS — TESTS
// supabase/functions/_shared/archie-ai/native-engine/coding-impact.test.ts
//
// Evidence for the capability claims "coding-impact-analysis",
// "coding-dead-file-detection", "coding-coupling-metrics":
// exact blast radius with BFS depths and import chains,
// dead/isolated file separation, fan-in/fan-out ranking,
// layering depths, cycle behavior — and the honest caveats.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  couplingMetrics,
  depthMetrics,
  detectDeadFiles,
  impactAnalysis,
} from "./coding-impact.ts";
import type { ProjectAnalysis } from "./coding-project.ts";
import type { CodeAnalysis } from "./coding.ts";

function analysis(path: string): CodeAnalysis {
  return {
    path,
    lines: 1,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    complexity: { branches: 0, cyclomatic: 1, longestFunctionLines: 1 },
    risks: [],
    todoCount: 0,
  };
}

function project(
  edges: Array<[string, string]>,
  paths: string[],
  entries?: string[],
): ProjectAnalysis {
  return {
    files: paths.length,
    analyses: paths.map(analysis),
    graph: edges.map(([from, to]) => ({ from, to, specifier: to })),
    brokenImports: [],
    cycles: [],
    entryCandidates: entries ?? paths.filter(
      (p) => !edges.some(([, to]) => to === p),
    ),
    metrics: {
      totalLines: paths.length,
      totalFunctions: 0,
      totalExports: 0,
      totalImports: edges.length,
      avgComplexity: 1,
      maxComplexity: 1,
    },
  };
}

describe("impact analysis — exact blast radius", () => {
  // a → b → c, d → b : change c → b (depth 1), a and d (depth 2)
  const P = project(
    [["a.ts", "b.ts"], ["b.ts", "c.ts"], ["d.ts", "b.ts"]],
    ["a.ts", "b.ts", "c.ts", "d.ts"],
  );

  it("reports direct and transitive dependents with BFS depth", () => {
    const r = impactAnalysis(["c.ts"], P);
    expect(r.blastRadiusCount).toBe(3);
    const b = r.impacted.find((f) => f.path === "b.ts");
    const a = r.impacted.find((f) => f.path === "a.ts");
    const d = r.impacted.find((f) => f.path === "d.ts");
    expect(b?.depth).toBe(1);
    expect(a?.depth).toBe(2);
    expect(d?.depth).toBe(2);
  });

  it("carries the exact import chain for each impacted file", () => {
    const r = impactAnalysis(["c.ts"], P);
    const a = r.impacted.find((f) => f.path === "a.ts");
    expect(a?.via).toEqual(["c.ts", "b.ts"]);
  });

  it("sorts by depth, then path", () => {
    const r = impactAnalysis(["c.ts"], P);
    expect(r.impacted.map((f) => f.path)).toEqual(["b.ts", "a.ts", "d.ts"]);
  });

  it("merges multiple changed files without double-counting", () => {
    const r = impactAnalysis(["c.ts", "d.ts"], P);
    expect(r.changed).toEqual(["c.ts", "d.ts"]);
    expect(r.blastRadiusCount).toBe(3); // b, a, d (d depends on b too)
    // b is reported exactly once even though both changed files hit it
    expect(r.impacted.filter((f) => f.path === "b.ts")).toHaveLength(1);
  });

  it("returns an empty radius for a leaf change", () => {
    const r = impactAnalysis(["a.ts"], P);
    expect(r.impacted).toHaveLength(0);
    expect(r.blastRadiusCount).toBe(0);
  });

  it("attaches the honest static-analysis caveat", () => {
    expect(impactAnalysis(["c.ts"], P).caveat).toContain(
      "dynamic imports",
    );
  });
});

describe("impact analysis — cycles", () => {
  it("terminates and reports cycle members as impacted without infinite loops", () => {
    // x ↔ y cycle, entry z imports nothing but x is imported by y
    const P = project(
      [["x.ts", "y.ts"], ["y.ts", "x.ts"], ["z.ts", "x.ts"]],
      ["x.ts", "y.ts", "z.ts"],
      ["z.ts"],
    );
    const r = impactAnalysis(["y.ts"], P);
    const paths = r.impacted.map((f) => f.path);
    expect(paths).toContain("x.ts");
    expect(paths).toContain("z.ts");
    // the cycle feeds z at depth 2
    expect(r.impacted.find((f) => f.path === "z.ts")?.depth).toBe(2);
  });
});

describe("dead-file detection — honest separation", () => {
  it("separates unreachable files from true orphans, never conflating them", () => {
    // entry e → f; detached cycle g ↔ h (not reachable from e);
    // orphan.ts has no edges at all.
    const P = project(
      [
        ["e.ts", "f.ts"],
        ["g.ts", "h.ts"],
        ["h.ts", "g.ts"],
      ],
      ["e.ts", "f.ts", "g.ts", "h.ts", "orphan.ts"],
      ["e.ts", "orphan.ts"],
    );
    const r = detectDeadFiles(P);
    expect(r.dead.map((d) => d.path)).toEqual(["g.ts", "h.ts"]);
    expect(r.dead.every((d) => d.reason.includes("not reachable"))).toBe(true);
    expect(r.isolated.map((d) => d.path)).toEqual(["orphan.ts"]);
    expect(r.isolated[0].reason).toContain("human disambiguation");
    expect(r.entries).toEqual(["e.ts", "orphan.ts"]);
  });

  it("finds nothing dead in a fully reachable project", () => {
    const P = project([["a.ts", "b.ts"]], ["a.ts", "b.ts"]);
    const r = detectDeadFiles(P);
    expect(r.dead).toHaveLength(0);
    expect(r.isolated).toHaveLength(0);
  });

  it("carries the never-delete-alone caveat", () => {
    const r = detectDeadFiles(project([["a.ts", "b.ts"]], ["a.ts", "b.ts"]));
    expect(r.caveat).toContain("NEVER delete");
  });
});

describe("coupling metrics — fan-in / fan-out", () => {
  // a → util, b → util, c → b
  const P = project(
    [["a.ts", "util.ts"], ["b.ts", "util.ts"], ["c.ts", "b.ts"]],
    ["a.ts", "b.ts", "c.ts", "util.ts"],
  );

  it("computes fan-in and fan-out per file", () => {
    const r = couplingMetrics(P);
    const by = (p: string) => r.files.find((f) => f.path === p);
    expect(by("util.ts")?.fanIn).toBe(2);
    expect(by("util.ts")?.fanOut).toBe(0);
    expect(by("b.ts")?.fanIn).toBe(1);
    expect(by("b.ts")?.fanOut).toBe(1);
    expect(by("a.ts")?.fanIn).toBe(0);
  });

  it("ranks the load-bearing (most-imported) modules first", () => {
    const r = couplingMetrics(P);
    expect(r.mostImported[0].path).toBe("util.ts");
    expect(r.mostImported.every((f) => f.fanIn > 0)).toBe(true);
    expect(r.mostImporting[0].fanOut).toBeGreaterThan(0);
  });

  it("flags zero-fan-in files with their entry candidacy", () => {
    const r = couplingMetrics(P);
    const a = r.zeroFanIn.find((f) => f.path === "a.ts");
    const c = r.zeroFanIn.find((f) => f.path === "c.ts");
    expect(a?.isEntryCandidate).toBe(true);
    expect(c?.isEntryCandidate).toBe(true);
    expect(r.zeroFanIn.find((f) => f.path === "util.ts")).toBeUndefined();
  });
});

describe("depth metrics — layering", () => {
  it("finds the longest import chain and per-file depths", () => {
    // a → b → c → d  (chain of 4)
    const P = project(
      [["a.ts", "b.ts"], ["b.ts", "c.ts"], ["c.ts", "d.ts"]],
      ["a.ts", "b.ts", "c.ts", "d.ts"],
    );
    const r = depthMetrics(P);
    expect(r.longestChain).toBe(4);
    expect(r.longestChainPath).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
    const by = (p: string) => r.perFile.find((f) => f.path === p)?.depth;
    expect(by("a.ts")).toBe(4);
    expect(by("b.ts")).toBe(3);
    expect(by("d.ts")).toBe(1);
  });

  it("guards import cycles in depth computation without inflating depth", () => {
    // x ↔ y — each file's own chain includes itself once: depth 2
    const P = project(
      [["x.ts", "y.ts"], ["y.ts", "x.ts"]],
      ["x.ts", "y.ts"],
    );
    const r = depthMetrics(P);
    expect(r.longestChain).toBe(2);
    expect(r.perFile.every((f) => f.depth === 2)).toBe(true);
  });
});
