// =========================================================
// ARCHIE NATIVE ENGINE — INJECTION SURFACE SCANNER — TESTS
// supabase/functions/_shared/archie-ai/native-engine/security/sink-scan.test.ts
//
// Evidence for the capability claim "security-sink-scan":
// every sink category, taint classification
// (TAINTED_CANDIDATE vs SINK_REVIEW), comment exclusion,
// one-finding-per-line, and the false-positive honesty text.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  scanForSinks,
  sinkScanCapabilityReports,
} from "./sink-scan.ts";

describe("sink scanner — sink categories", () => {
  it("flags SQL string interpolation with request-derived data as TAINTED_CANDIDATE", () => {
    const report = scanForSinks([
      {
        path: "db.ts",
        source: "await db.query(`SELECT * FROM users WHERE id=${req.params.id}`)",
      },
    ]);
    expect(report.findings).toHaveLength(1);
    const f = report.findings[0];
    expect(f.sinkKind).toBe("SQL_STRING_INTERPOLATION");
    expect(f.classification).toBe("TAINTED_CANDIDATE");
    expect(f.line).toBe(1);
    expect(f.note).toContain("confirm the flow");
  });

  it("classifies a sink with no request-derived data as SINK_REVIEW", () => {
    const report = scanForSinks([
      { path: "render.ts", source: "el.innerHTML = renderer(trustedState);" },
    ]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].sinkKind).toBe("INNERHTML_ASSIGNMENT");
    expect(report.findings[0].classification).toBe("SINK_REVIEW");
  });

  it("detects eval and Function-constructor sinks", () => {
    const report = scanForSinks([
      { path: "dyn.ts", source: "const out = eval(expr);" },
      { path: "dyn2.ts", source: "const fn = new Function('a', 'return a');" },
    ]);
    expect(report.findings.map((f) => f.sinkKind)).toEqual([
      "EVAL_USAGE",
      "FUNCTION_CONSTRUCTOR",
    ]);
  });

  it("detects shell execution with interpolated strings as a shell-injection surface", () => {
    const report = scanForSinks([
      { path: "shell.ts", source: "execSync(`convert ${body.file}.png`)" },
    ]);
    expect(report.findings[0].sinkKind).toBe("SHELL_EXEC_INTERPOLATION");
    expect(report.findings[0].classification).toBe("TAINTED_CANDIDATE");
  });

  it("detects document.write as a legacy XSS surface", () => {
    const report = scanForSinks([
      { path: "legacy.ts", source: "document.write(userProvided);" },
    ]);
    expect(report.findings[0].sinkKind).toBe("DOCUMENT_WRITE");
  });

  it("detects filesystem calls referencing request-derived data (path traversal)", () => {
    const report = scanForSinks([
      { path: "fs.ts", source: "fs.readFile(path.join(dir, req.query.name))" },
    ]);
    expect(report.findings[0].sinkKind).toBe("PATH_JOIN_INPUT");
    expect(report.findings[0].classification).toBe("TAINTED_CANDIDATE");
  });

  it("detects fetch built from request-derived data (SSRF surface)", () => {
    const report = scanForSinks([
      { path: "net.ts", source: 'await fetch(`${baseUrl}${params.target}`)' },
    ]);
    expect(report.findings[0].sinkKind).toBe("FETCH_URL_INPUT");
  });
});

describe("sink scanner — honesty & accounting", () => {
  it("skips comment lines entirely", () => {
    const report = scanForSinks([
      {
        path: "safe.ts",
        source: [
          "// await db.query(`SELECT ${x}`) — discussed in review",
          "* const out = eval(expr);",
          "const safe = 1;",
        ].join("\n"),
      },
    ]);
    expect(report.findings).toHaveLength(0);
  });

  it("reports at most one sink per line (first matching sink wins)", () => {
    const report = scanForSinks([
      { path: "both.ts", source: "eval(`db.query(${req.body.q})`);" },
    ]);
    expect(report.findings).toHaveLength(1);
  });

  it("carries the code evidence, truncated to 160 chars", () => {
    const long = `eval("${"x".repeat(300)}")`;
    const report = scanForSinks([{ path: "long.ts", source: long }]);
    expect(report.findings[0].evidence.length).toBeLessThanOrEqual(160);
    expect(report.findings[0].evidence.startsWith("eval(")).toBe(true);
  });

  it("counts files and lines honestly", () => {
    const report = scanForSinks([
      { path: "a.ts", source: "const a = 1;\nconst b = 2;\n" },
      { path: "b.ts", source: "const c = 3;" },
    ]);
    expect(report.filesScanned).toBe(2);
    expect(report.linesScanned).toBe(4);
  });

  it("limitations never claim dataflow proof or confirmed vulnerabilities", () => {
    const report = scanForSinks([
      { path: "x.ts", source: "eval(1);" },
    ]);
    expect(report.limitations).toContain("not dataflow analysis");
    expect(report.limitations).toContain("never a confirmed vulnerability");
  });

  it("capability reports stay honest — scan OPERATIONAL, true dataflow NOT_IMPLEMENTED", () => {
    const caps = sinkScanCapabilityReports();
    expect(
      caps.find((c) => c.id === "security-sink-scan")?.maturity,
    ).toBe("OPERATIONAL");
    expect(
      caps.find((c) => c.id === "security-dataflow-analysis")?.maturity,
    ).toBe("NOT_IMPLEMENTED");
  });
});
