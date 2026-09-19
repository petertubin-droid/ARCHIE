// =========================================================
// ARCHIE SECURITY NATIVE ENGINE TESTS — SINK SCAN
// src/lib/archie/__tests__/sink-scan.test.ts
//
// Hacking engine deepening (#31). Deterministic injection-
// surface detection verified:
//
//   * SQL interpolation, eval, shell exec, innerHTML, path
//     traversal and SSRF sinks detected at their exact line
//   * request-derived data on the line upgrades the finding
//     to TAINTED_CANDIDATE; without it, SINK_REVIEW —
//     ARCHIE never claims a vulnerability without evidence
//   * comments are skipped; every finding carries the exact
//     source line as evidence
//   * the false-positive limitations disclosure is attached
// =========================================================
import { describe, expect, it } from "vitest";
import { scanForSinks } from "@studio-shared/archie-ai/native-engine/security/sink-scan.ts";

describe("sink detection", () => {
  it("flags SQL string interpolation", () => {
    const r = scanForSinks([
      {
        path: "repo/api.ts",
        source: `const ok = 1;\nawait db.query(\`SELECT * FROM users WHERE id = \${req.params.id}\`);\n`,
      },
    ]);
    const f = r.findings.find((x) => x.sinkKind === "SQL_STRING_INTERPOLATION");
    expect(f).toBeDefined();
    expect(f!.line).toBe(2);
    expect(f!.classification).toBe("TAINTED_CANDIDATE");
  });

  it("flags eval and Function-constructor usage", () => {
    const r = scanForSinks([
      { path: "a.ts", source: `eval(userCode);\nnew Function(body);` },
    ]);
    const kinds = r.findings.map((f) => f.sinkKind);
    expect(kinds).toContain("EVAL_USAGE");
    expect(kinds).toContain("FUNCTION_CONSTRUCTOR");
  });

  it("flags shell execution with interpolated strings", () => {
    const r = scanForSinks([{ path: "a.ts", source: `exec(\`ls \${dir}\`);` }]);
    expect(
      r.findings.some((f) => f.sinkKind === "SHELL_EXEC_INTERPOLATION"),
    ).toBe(true);
  });

  it("flags innerHTML assignment and document.write", () => {
    const r = scanForSinks([
      { path: "ui.ts", source: `el.innerHTML = msg;\ndocument.write(data);` },
    ]);
    const kinds = r.findings.map((f) => f.sinkKind);
    expect(kinds).toContain("INNERHTML_ASSIGNMENT");
    expect(kinds).toContain("DOCUMENT_WRITE");
  });

  it("flags path-traversal and SSRF surfaces", () => {
    const r = scanForSinks([
      {
        path: "fs.ts",
        source: `await fs.readFile(req.query.path);\nawait fetch(\`\${api}/x?u=\${params.url}\`);`,
      },
    ]);
    const kinds = r.findings.map((f) => f.sinkKind);
    expect(kinds).toContain("PATH_JOIN_INPUT");
    expect(kinds).toContain("FETCH_URL_INPUT");
  });
});

describe("taint classification honesty", () => {
  it("a sink WITHOUT request-derived data is SINK_REVIEW — never a confirmed vulnerability", () => {
    const r = scanForSinks([{ path: "calc.ts", source: `eval("1+1");` }]);
    const f = r.findings[0];
    expect(f.classification).toBe("SINK_REVIEW");
    expect(f.note).toContain("no request-derived data");
  });

  it("a sink WITH request-derived data is TAINTED_CANDIDATE and says so", () => {
    const r = scanForSinks([
      { path: "api.ts", source: `eval(req.body.code);` },
    ]);
    const f = r.findings[0];
    expect(f.classification).toBe("TAINTED_CANDIDATE");
    expect(f.note).toContain("confirm the flow");
  });
});

describe("evidence & disclosures", () => {
  it("comments are skipped", () => {
    const r = scanForSinks([
      { path: "a.ts", source: `// eval(userInput) — do not flag comments\n` },
    ]);
    expect(r.findings).toHaveLength(0);
  });

  it("the finding carries the exact source line as evidence", () => {
    const line = `db.query(\`SELECT * FROM t WHERE x = \${params.x}\`);`;
    const r = scanForSinks([{ path: "a.ts", source: line }]);
    expect(r.findings[0].evidence).toBe(line);
  });

  it("scan counts and the false-positive disclosure are attached", () => {
    const r = scanForSinks([{ path: "a.ts", source: "one\ntwo\nthree\nfour" }]);
    expect(r.filesScanned).toBe(1);
    expect(r.linesScanned).toBe(4);
    expect(r.limitations).toContain("pattern matching, not dataflow analysis");
    expect(r.limitations).toContain("never a confirmed vulnerability");
  });
});
