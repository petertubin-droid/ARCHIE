// =========================================================
// CODE-SENTRY TESTS (batch 23, fix 87)
// Deterministic scans of explicitly authorized content only;
// real secret shapes are caught; honest report when nothing
// was authorized.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  lineOf,
  notScannedReport,
  scanAuthorizedCode,
} from "@/lib/archie/code-sentry";

describe("lineOf", () => {
  it("counts 1-based lines up to the index", () => {
    expect(lineOf("ab\ncd\nef", 0)).toBe(1);
    expect(lineOf("ab\ncd\nef", 3)).toBe(2);
    expect(lineOf("ab\ncd\nef", 6)).toBe(3);
  });
});

describe("scanAuthorizedCode", () => {
  it("flags hardcoded provider API keys as CRITICAL with the line number", () => {
    const r = scanAuthorizedCode(
      `const a = 1;\nconst key = "ghp_${"A".repeat(36)}";\n`,
    );
    expect(r.scanned).toBe(true);
    expect(r.findingCount).toBeGreaterThan(0);
    const crit = r.findings.find((f) => f.rule === "secret:provider-api-key");
    expect(crit).toBeDefined();
    expect(crit!.severity).toBe("CRITICAL");
    expect(crit!.line).toBe(2);
    expect(r.criticalCount).toBeGreaterThanOrEqual(1);
  });

  it("flags Supabase service keys and password assignments", () => {
    const r = scanAuthorizedCode(
      `const SUPABASE_KEY = "eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}";\npassword: "hunter2secret"\n`,
    );
    expect(
      r.findings.some((f) => f.rule === "secret:supabase-service-key"),
    ).toBe(true);
    expect(
      r.findings.some((f) => f.rule === "secret:password-assignment"),
    ).toBe(true);
  });

  it("leaves clean code clean and sorts findings by severity then line", () => {
    const r = scanAuthorizedCode("const x = 1 + 2;\nexport default x;\n");
    expect(r.findingCount).toBe(0);
    expect(r.note).toMatch(/never modifies protected production code/i);
  });

  it("proposes fixes but never applies them", () => {
    const r = scanAuthorizedCode("  console.log('debug');\n");
    const f = r.findings.find((x) => x.rule === "quality:console-log");
    expect(f?.proposal).toMatch(/Remove debug logging/i);
  });
});

describe("notScannedReport", () => {
  it("is honest when nothing was authorized", () => {
    const r = notScannedReport();
    expect(r.scanned).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.note).toMatch(/No code has been authorized for scanning/i);
  });
});
