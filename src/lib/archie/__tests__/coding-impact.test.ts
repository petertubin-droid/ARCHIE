// =========================================================
// ARCHIE CODING IMPACT ANALYTICS TESTS
// src/lib/archie/__tests__/coding-impact.test.ts
//
// Coding engine deepening (#14). Impact analysis, dead-file
// detection, coupling and depth — verified against a fixed
// synthetic project graph:
//
//   entry → a → b → c        (chain, depth 3)
//   entry → d                (direct dependents of entry)
//   orphan.ts               (imported by nothing)
//   cycle: x ⇄ y             (cycle-safe impact + depth)
//
// Every algorithm is deterministic; every result is derived
// from the graph, and the honesty caveats are asserted.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  DEAD_FILE_CAVEAT,
  IMPACT_CAVEAT,
  couplingMetrics,
  depthMetrics,
  detectDeadFiles,
  impactAnalysis,
} from "@studio-shared/archie-ai/native-engine/coding-impact.ts";
import { analyzeProject } from "@studio-shared/archie-ai/native-engine/coding-project.ts";

function fixture(): ReturnType<typeof analyzeProject> {
  const files = [
    {
      path: "src/entry.ts",
      source: `import { a } from "./a";\nimport { d } from "./d";\nexport function main() { return a() + d(); }`,
    },
    {
      path: "src/a.ts",
      source: `import { b } from "./b";\nexport const a = () => b();`,
    },
    {
      path: "src/b.ts",
      source: `import { c } from "./c";\nexport const b = () => c();`,
    },
    { path: "src/c.ts", source: `export const c = () => 1;\n` },
    { path: "src/d.ts", source: `export const d = () => 2;\n` },
    { path: "src/orphan.ts", source: `export const orphan = () => 3;\n` },
    {
      path: "src/x.ts",
      source: `import { y } from "./y";\nexport const x = () => y();`,
    },
    {
      path: "src/y.ts",
      source: `import { x } from "./x";\nexport const y = () => x();`,
    },
  ];
  return analyzeProject(files);
}

describe("impact analysis (blast radius)", () => {
  it("changing c reports b directly and a, entry transitively — with exact depths", () => {
    const report = impactAnalysis(["src/c.ts"], fixture());
    const depths = new Map(report.impacted.map((f) => [f.path, f.depth]));
    expect(depths.get("src/b.ts")).toBe(1);
    expect(depths.get("src/a.ts")).toBe(2);
    expect(depths.get("src/entry.ts")).toBe(3);
    expect(report.blastRadiusCount).toBe(3);
    // d, orphan, x, y are unaffected
    expect(report.impacted.map((f) => f.path)).not.toContain("src/d.ts");
  });

  it("the via-chain from entry back to the changed file is exact", () => {
    const report = impactAnalysis(["src/c.ts"], fixture());
    const entry = report.impacted.find((f) => f.path === "src/entry.ts");
    expect(entry?.via).toEqual(["src/c.ts", "src/b.ts", "src/a.ts"]);
  });

  it("multiple changed files union their blast radii", () => {
    const report = impactAnalysis(["src/c.ts", "src/d.ts"], fixture());
    const paths = report.impacted.map((f) => f.path);
    expect(paths).toContain("src/b.ts");
    expect(paths).toContain("src/entry.ts");
    expect(report.changed).toEqual(["src/c.ts", "src/d.ts"]);
  });

  it("impact on a cycle member terminates — no infinite loop", () => {
    const report = impactAnalysis(["src/x.ts"], fixture());
    expect(report.impacted.map((f) => f.path)).toContain("src/y.ts");
  });

  it("the honesty caveat is always attached", () => {
    expect(impactAnalysis(["src/c.ts"], fixture()).caveat).toBe(IMPACT_CAVEAT);
  });
});

describe("dead-file detection", () => {
  it("a DETACHED CYCLE (x⇄y, reachable only from each other) is unreachable — reported dead", () => {
    const report = detectDeadFiles(fixture());
    expect(report.dead.map((d) => d.path)).toEqual(["src/x.ts", "src/y.ts"]);
    expect(report.entries).toContain("src/entry.ts");
  });

  it("a TRUE ORPHAN (imports nothing, imported by nothing) is reported ISOLATED, never conflated with dead", () => {
    const report = detectDeadFiles(fixture());
    expect(report.isolated.map((d) => d.path)).toEqual(["src/orphan.ts"]);
    expect(report.isolated[0].reason).toContain("human disambiguation");
    // honest: an isolated file is ALSO an entry candidate (zero
    // inbound) — the module never claims it is certainly dead
    expect(report.entries).toContain("src/orphan.ts");
  });

  it("the live chain is not flagged in either set", () => {
    const report = detectDeadFiles(fixture());
    const flagged = [...report.dead, ...report.isolated].map((d) => d.path);
    for (const live of [
      "src/entry.ts",
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]) {
      expect(flagged).not.toContain(live);
    }
  });

  it("the never-delete-alone caveat is attached", () => {
    expect(detectDeadFiles(fixture()).caveat).toBe(DEAD_FILE_CAVEAT);
    expect(DEAD_FILE_CAVEAT).toContain("NEVER delete");
  });
});

describe("coupling metrics", () => {
  it("fan-in/fan-out computed exactly from the graph", () => {
    const report = couplingMetrics(fixture());
    const byPath = new Map(report.files.map((f) => [f.path, f]));
    expect(byPath.get("src/b.ts")).toEqual({
      path: "src/b.ts",
      fanIn: 1,
      fanOut: 1,
    });
    // entry is the most importing file (2 imports)
    expect(report.mostImporting[0]?.path).toBe("src/entry.ts");
    // b, a and entry all have fan-in; c is imported by b only
    expect(byPath.get("src/c.ts")!.fanIn).toBe(1);
  });

  it("zero-fan-in files are flagged with their entry status", () => {
    const report = couplingMetrics(fixture());
    const zero = new Map(
      report.zeroFanIn.map((z) => [z.path, z.isEntryCandidate]),
    );
    expect(zero.get("src/entry.ts")).toBe(true);
    // honest: orphan has zero inbound too — it IS an entry
    // candidate by the graph definition; the isolated report
    // is where it is surfaced for human review
    expect(zero.get("src/orphan.ts")).toBe(true);
    // cycle members import each other → fan-in 1 → NOT zero-fan-in
    expect(zero.has("src/x.ts")).toBe(false);
    expect(zero.has("src/y.ts")).toBe(false);
  });
});

describe("depth metrics", () => {
  it("the longest chain is entry→a→b→c (depth 4) in import order", () => {
    const report = depthMetrics(fixture());
    expect(report.longestChain).toBe(4);
    expect(report.longestChainPath).toEqual([
      "src/entry.ts",
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
  });

  it("cycle traversal terminates and reports the safe depth", () => {
    const report = depthMetrics(fixture());
    const x = report.perFile.find((f) => f.path === "src/x.ts");
    const y = report.perFile.find((f) => f.path === "src/y.ts");
    expect(x!.depth).toBe(2); // x → y → x (guarded)
    expect(y!.depth).toBe(2);
  });

  it("a leaf file has depth 1", () => {
    const report = depthMetrics(fixture());
    expect(report.perFile.find((f) => f.path === "src/c.ts")!.depth).toBe(1);
  });
});
