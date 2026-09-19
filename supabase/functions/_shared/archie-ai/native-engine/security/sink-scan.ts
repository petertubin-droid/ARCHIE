// =========================================================
// ARCHIE NATIVE ENGINE — INJECTION SURFACE SCANNER
// supabase/functions/_shared/archie-ai/native-engine/security/sink-scan.ts
//
// Deterministic static scan for DANGEROUS SINKS fed by
// request-derived input — the pattern behind injection
// vulnerabilities (SQLi, XSS, command injection, path
// traversal, SSRF, deserialization). For authorized code
// review during security engagements.
//
// The scan pairs a sink pattern with an evidence requirement:
// a finding is reported ONLY when the sink line references
// something that looks like request-derived data (params,
// query, body, headers, req, input, request, ctx.request,
// untrusted naming). When only the sink is present the line
// is reported as SINK_REVIEW — the data flow may or may not
// be tainted; ARCHIE does NOT claim a vulnerability without
// flow evidence.
//
// FALSE-POSITIVE HONESTY: every finding is labeled a
// candidate surface, never a confirmed vulnerability.
// =========================================================

import type { CapabilityReport } from "../types.ts";

export interface SinkFinding {
  path: string;
  line: number;
  sinkKind: string;
  /** The exact source line — this is code, not a secret. */
  evidence: string;
  classification: "TAINTED_CANDIDATE" | "SINK_REVIEW";
  note: string;
}

export interface SinkScanReport {
  findings: SinkFinding[];
  filesScanned: number;
  linesScanned: number;
  limitations: string;
}

interface SinkPattern {
  kind: string;
  re: RegExp;
  note: string;
}

const SINKS: SinkPattern[] = [
  {
    kind: "SQL_STRING_INTERPOLATION",
    re: /\.(query|execute|raw)\s*\(\s*[`'"].*(\$\{|\+\s*\w|\w+\s*\+)/,
    note: "SQL executed with string interpolation — parameterize the query",
  },
  {
    kind: "EVAL_USAGE",
    re: /\beval\s*\(/,
    note: "eval() — never feed it request-derived data; remove entirely where possible",
  },
  {
    kind: "FUNCTION_CONSTRUCTOR",
    re: /new\s+Function\s*\(/,
    note: "Function constructor behaves like eval — remove or gate strictly",
  },
  {
    kind: "SHELL_EXEC_INTERPOLATION",
    re: /(exec|execSync|spawn|spawnSync)\s*\(\s*[`'"].*(\$\{|\+)/,
    note: "process execution with interpolated string — shell injection surface",
  },
  {
    kind: "INNERHTML_ASSIGNMENT",
    re: /\.innerHTML\s*=\s*(?!['"]\s*['"])/,
    note: "innerHTML assignment — XSS surface; use textContent or sanitize",
  },
  {
    kind: "DOCUMENT_WRITE",
    re: /document\.write\s*\(/,
    note: "document.write — legacy XSS surface",
  },
  {
    kind: "PATH_JOIN_INPUT",
    re: /(readFile|writeFile|createReadStream|createWriteStream|unlink|rm|stat)\s*\(\s*[^)]*(req|params|query|body|input|request)/,
    note: "filesystem call referencing request-derived data — path traversal surface; normalize and allowlist",
  },
  {
    kind: "FETCH_URL_INPUT",
    re: /(fetch|axios\.(get|post|put|delete)|http\.get)\s*\(\s*[`'"].*(\$\{|req|params|query|body|input|request)/,
    note: "network call built from request-derived data — SSRF surface; validate against an allowlist",
  },
  {
    kind: "CHILD_TEMPLATE_INJECTION",
    re: /renderTemplate|renderTemplateString\s*\(/,
    note: "template rendering — verify the engine does not execute template code (template injection)",
  },
];

const TAINT_RE =
  /(req\.|request\.|params|query|body|headers|\.input\b|untrusted|userInput|ctx\.request)/i;

export function scanForSinks(
  files: Array<{ path: string; source: string }>,
): SinkScanReport {
  const findings: SinkFinding[] = [];
  let linesScanned = 0;

  for (const file of files) {
    const lines = file.source.split("\n");
    linesScanned += lines.length;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      for (const sink of SINKS) {
        const m = sink.re.exec(line);
        if (!m) continue;
        const tainted = TAINT_RE.test(line);
        findings.push({
          path: file.path,
          line: i + 1,
          sinkKind: sink.kind,
          evidence: trimmed.slice(0, 160),
          classification: tainted ? "TAINTED_CANDIDATE" : "SINK_REVIEW",
          note: tainted
            ? `${sink.note} — request-derived data appears on this line; confirm the flow before rating severity`
            : `${sink.note} — no request-derived data on this line; confirm whether any caller passes input`,
        });
        break; // one finding per line: first matching sink wins
      }
    });
  }

  return {
    findings,
    filesScanned: files.length,
    linesScanned,
    limitations:
      "line-level pattern matching, not dataflow analysis — sanitized sinks can still be reported and cross-line flows can be missed; every finding is a candidate surface requiring human confirmation, never a confirmed vulnerability",
  };
}

/** Honest capability reports. */
export function sinkScanCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "security-sink-scan",
      description:
        "Deterministic dangerous-sink scan (SQL interpolation, eval, shell exec, innerHTML, path traversal, SSRF surfaces) with taint-heuristic classification and per-finding evidence",
      maturity: "OPERATIONAL",
      measuredBy:
        "sink-scan.test.ts (sink detection, taint classification, false-positive honesty)",
    },
    {
      id: "security-dataflow-analysis",
      description: "True interprocedural dataflow / taint analysis",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — pattern + line-level heuristics only, never presented as dataflow proof",
    },
  ];
}
