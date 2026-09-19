// =========================================================
// ARCHIE CODING ENGINE — PROJECT-LEVEL TESTS
// src/lib/archie/__tests__/coding-project.test.ts
//
// Engine inventory #14 deepening: multi-file project
// analysis + dependency-aware scaffolds. All deterministic —
// real graph algorithms, honest broken-import reporting.
//
//   * internal dependency graph (relative, @/ alias,
//     extensionless and index resolution)
//   * external packages excluded from the graph
//   * broken imports reported, never guessed
//   * import cycles detected by DFS
//   * entry candidates = zero inbound internal edges
//   * dependency-aware scaffolds vi.mock() internal deps
// =========================================================
import { describe, it, expect } from "vitest";
import {
  analyzeProject,
  codingProjectCapabilityReports,
  generateDependencyAwareTestScaffold,
  ProjectFile,
  resolveImport,
} from "@studio-shared/archie-ai/native-engine/coding-project.ts";

// ---------------------------------------------------------
// Fixtures
// ---------------------------------------------------------
function fixtureProject(): ProjectFile[] {
  return [
    {
      path: "src/a.ts",
      source: [
        `import { b } from "./b";`,
        `export function runA() { return b(); }`,
      ].join("\n"),
    },
    {
      path: "src/b.ts",
      source: [
        `import { c } from "./c";`,
        `import external from "some-external-pkg";`,
        `export function b() { return c + 1; }`,
      ].join("\n"),
    },
    {
      path: "src/c.ts",
      source: `export const c = 1;`,
    },
    {
      path: "src/d.ts",
      source: `import { lost } from "./missing";`, // broken import
    },
    {
      // pair with f.ts to form an import cycle f ↔ g
      path: "src/f.ts",
      source: `import { g } from "./g";\nexport const f = () => g;`,
    },
    {
      path: "src/g.ts",
      source: `import { f } from "./f";\nexport const g = () => f;`,
    },
    {
      path: "src/lib/user.ts",
      source: `import { profile } from "@/lib/profile";`, // alias resolution
    },
    {
      path: "src/lib/profile.ts",
      source: `export const profile = {};`,
    },
    {
      path: "src/utils.ts",
      source: `export * from "./utils/helper";`, // index resolution → utils/helper/index.ts
    },
    {
      path: "src/utils/helper/index.ts",
      source: `export const helper = () => 1;`,
    },
  ];
}

// ---------------------------------------------------------
// Import resolution
// ---------------------------------------------------------
describe("resolveImport", () => {
  const paths = new Set([
    "src/lib/a.ts",
    "src/lib/sub/b.ts",
    "src/utils/index.ts",
    "src/utils.ts",
  ]);

  it("resolves extensionless relative imports", () => {
    // self-import resolves to the file itself; analyzeProject skips self-edges
    expect(resolveImport("./a", "src/lib/a.ts", paths)).toBe("src/lib/a.ts");
    expect(resolveImport("./a", "src/lib/other.ts", paths)).toBe(
      "src/lib/a.ts",
    );
  });

  it("resolves @/ aliases to src/", () => {
    expect(resolveImport("@/lib/a", "src/lib/sub/b.ts", paths)).toBe(
      "src/lib/a.ts",
    );
  });

  it("resolves index files", () => {
    // "./utils" is relative to the importer's dir (src/lib) — nothing
    // there, which is correct; the alias reaches the index file
    expect(resolveImport("./utils", "src/lib/a.ts", paths)).toBeNull();
    // exact file beats directory index (both exist in this set)
    expect(resolveImport("@/utils", "src/lib/a.ts", paths)).toBe(
      "src/utils.ts",
    );
    // when only the index exists, the index wins
    const indexOnly = new Set(["src/utils/index.ts"]);
    expect(resolveImport("@/utils", "src/lib/a.ts", indexOnly)).toBe(
      "src/utils/index.ts",
    );
  });

  it("returns null when nothing matches — never a guess", () => {
    expect(resolveImport("./nope", "src/lib/a.ts", paths)).toBeNull();
    expect(resolveImport("@/ghost", "src/lib/a.ts", paths)).toBeNull();
  });

  it("normalizes ../ segments", () => {
    // ../a from src/lib/sub/b.ts = src/lib/a.ts
    expect(resolveImport("../a", "src/lib/sub/b.ts", paths)).toBe(
      "src/lib/a.ts",
    );
  });
});

// ---------------------------------------------------------
// Project analysis
// ---------------------------------------------------------
describe("analyzeProject", () => {
  it("builds the internal dependency graph and excludes external packages", () => {
    const p = analyzeProject(fixtureProject());
    const edges = p.graph.map((e) => `${e.from}→${e.to}`).sort();
    expect(edges).toContain("src/a.ts→src/b.ts");
    expect(edges).toContain("src/b.ts→src/c.ts");
    expect(edges).toContain("src/lib/user.ts→src/lib/profile.ts");
    expect(edges).toContain("src/utils.ts→src/utils/helper/index.ts");
    // external package imports produce no edge
    expect(p.graph.some((e) => e.specifier === "some-external-pkg")).toBe(
      false,
    );
    expect(p.files).toBe(10);
  });

  it("reports broken imports honestly instead of guessing a target", () => {
    const p = analyzeProject(fixtureProject());
    expect(p.brokenImports.length).toBe(1);
    expect(p.brokenImports[0].from).toBe("src/d.ts");
    expect(p.brokenImports[0].specifier).toBe("./missing");
  });

  it("detects import cycles by DFS", () => {
    const p = analyzeProject(fixtureProject());
    expect(p.cycles.length).toBeGreaterThanOrEqual(1);
    const cycle = p.cycles.find(
      (c) => c.files.includes("src/f.ts") && c.files.includes("src/g.ts"),
    );
    expect(cycle).toBeDefined();
    expect(cycle?.files[0]).toBe(cycle?.files[cycle.files.length - 1]); // closed
  });

  it("finds entry candidates (files with zero inbound internal edges)", () => {
    const p = analyzeProject(fixtureProject());
    expect(p.entryCandidates).toContain("src/a.ts");
    expect(p.entryCandidates).toContain("src/d.ts");
    // f.ts/g.ts form a cycle — both have inbound edges, neither is an entry
    expect(p.entryCandidates).not.toContain("src/f.ts");
    expect(p.entryCandidates).toContain("src/lib/user.ts");
    // imported files are NOT entry candidates
    expect(p.entryCandidates).not.toContain("src/b.ts");
    expect(p.entryCandidates).not.toContain("src/c.ts");
  });

  it("computes honest project metrics", () => {
    const p = analyzeProject(fixtureProject());
    expect(p.metrics.totalLines).toBe(
      p.analyses.reduce((a, x) => a + x.lines, 0),
    );
    expect(p.metrics.totalFunctions).toBe(
      p.analyses.reduce((a, x) => a + x.functions.length, 0),
    );
    // riskiest is sorted desc by cyclomatic and capped at 5
    expect(p.metrics.riskiest.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < p.metrics.riskiest.length; i++) {
      expect(p.metrics.riskiest[i - 1].cyclomatic).toBeGreaterThanOrEqual(
        p.metrics.riskiest[i].cyclomatic,
      );
    }
  });

  it("handles an empty project without crashing", () => {
    const p = analyzeProject([]);
    expect(p.files).toBe(0);
    expect(p.graph).toEqual([]);
    expect(p.brokenImports).toEqual([]);
    expect(p.cycles).toEqual([]);
    expect(p.entryCandidates).toEqual([]);
    expect(p.metrics.averageCyclomatic).toBe(0);
  });
});

// ---------------------------------------------------------
// Dependency-aware scaffolds
// ---------------------------------------------------------
describe("generateDependencyAwareTestScaffold", () => {
  it("mocks every internal dependency of the module, sorted, deduplicated", () => {
    const p = analyzeProject(fixtureProject());
    const scaffold = generateDependencyAwareTestScaffold("src/a.ts", p);
    // a.ts depends on b.ts (one internal dep)
    expect(scaffold).toContain('vi.mock("@/b");');
    expect(scaffold).toContain("import { describe, it, expect, vi }");
    // base scaffold imports the module's OWN exports; vi.mock covers the dep
    expect(scaffold).toContain(`import { runA } from "@/a";`);
    // basis comment states the graph evidence
    expect(scaffold).toContain("Project basis: 10 file(s)");
    expect(scaffold.match(/vi\.mock\(/g)?.length).toBe(1);
    expect(scaffold).toContain('describe("src/a.ts"');
  });

  it("mocks transitively-imported files only for direct deps of THIS module", () => {
    const p = analyzeProject(fixtureProject());
    // a.ts imports b.ts only — b's dep on c.ts must NOT be mocked
    const scaffold = generateDependencyAwareTestScaffold("src/a.ts", p);
    expect(scaffold).not.toContain('vi.mock("@/c");');
  });

  it("states honestly when a module has no internal dependencies", () => {
    const p = analyzeProject(fixtureProject());
    const scaffold = generateDependencyAwareTestScaffold("src/c.ts", p);
    expect(scaffold).toContain("No internal project dependencies");
    expect(scaffold).not.toContain("vi.mock(");
  });

  it("reports an unknown module instead of fabricating a scaffold", () => {
    const p = analyzeProject(fixtureProject());
    const scaffold = generateDependencyAwareTestScaffold("src/ghost.ts", p);
    expect(scaffold).toContain("not found in the project set");
    expect(scaffold).not.toContain("describe(");
  });

  it("keeps dependency-aware scaffolds runnable: generated body has matching braces", () => {
    const p = analyzeProject(fixtureProject());
    const scaffold = generateDependencyAwareTestScaffold("src/b.ts", p);
    const opens = (scaffold.match(/\{/g) ?? []).length;
    const closes = (scaffold.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

// ---------------------------------------------------------
// Capability honesty
// ---------------------------------------------------------
describe("codingProjectCapabilityReports", () => {
  it("claims OPERATIONAL only with a measuredBy", () => {
    const reports = codingProjectCapabilityReports();
    expect(reports.length).toBe(2);
    for (const r of reports) {
      expect(r.measuredBy.length).toBeGreaterThan(0);
      expect(r.maturity).toBe("OPERATIONAL");
      expect(r.measuredBy).toContain("coding-project.test.ts");
    }
  });
});
