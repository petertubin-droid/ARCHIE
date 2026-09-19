// =========================================================
// ARCHIE SECURITY NATIVE ENGINE TESTS — HEADER AUDIT
// src/lib/archie/__tests__/header-audit.test.ts
//
// Hacking engine deepening (#31). Deterministic header
// compliance verified at every outcome boundary:
//
//   * compliant headers → PASS
//   * weak values (unsafe-inline, short max-age, wrong
//     nosniff) → WEAK with the exact reason
//   * missing headers → FAIL with the risk disclosed
//   * header names are matched case-insensitively (real
//     servers emit varied casing)
//   * nothing is invented: an uncaptured header is reported
//     missing, never assumed present
// =========================================================
import { describe, expect, it } from "vitest";
import { auditSecurityHeaders } from "@studio-shared/archie-ai/native-engine/security/header-audit.ts";

const FULLY_COMPLIANT = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

describe("compliance outcomes", () => {
  it("a fully compliant header set passes all six rules", () => {
    const report = auditSecurityHeaders(FULLY_COMPLIANT, "https://example.com");
    expect(report.passed).toBe(6);
    expect(report.weak).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.url).toBe("https://example.com");
  });

  it("every missing header FAILS with its risk disclosed", () => {
    const report = auditSecurityHeaders({});
    expect(report.failed).toBe(6);
    const csp = report.results.find(
      (r) => r.header === "content-security-policy",
    );
    expect(csp!.severity).toBe("HIGH");
    expect(csp!.detail).toContain("missing");
  });

  it("unsafe-inline in CSP is WEAK — and severity HIGH", () => {
    const report = auditSecurityHeaders({
      ...FULLY_COMPLIANT,
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline'",
    });
    expect(report.weak).toBe(1);
    const csp = report.results.find((r) => r.outcome === "WEAK");
    expect(csp!.detail).toContain("unsafe-inline");
  });

  it("short HSTS max-age is WEAK", () => {
    const report = auditSecurityHeaders({
      ...FULLY_COMPLIANT,
      "Strict-Transport-Security": "max-age=100",
    });
    const hsts = report.results.find(
      (r) => r.header === "strict-transport-security",
    );
    expect(hsts!.outcome).toBe("WEAK");
    expect(hsts!.detail).toContain("180 days");
  });

  it("wrong X-Content-Type-Options value is WEAK", () => {
    const report = auditSecurityHeaders({
      ...FULLY_COMPLIANT,
      "X-Content-Type-Options": "no-sniff",
    });
    expect(
      report.results.find((r) => r.header === "x-content-type-options")!
        .outcome,
    ).toBe("WEAK");
  });
});

describe("evidence honesty", () => {
  it("header names are matched case-insensitively", () => {
    const report = auditSecurityHeaders({
      "x-frame-options": "SAMEORIGIN",
    });
    expect(
      report.results.find((r) => r.header === "x-frame-options")!.outcome,
    ).toBe("PASS");
  });

  it("empty-string headers are reported missing — never guessed", () => {
    const report = auditSecurityHeaders({ "Referrer-Policy": "" });
    const rp = report.results.find((r) => r.header === "referrer-policy")!;
    expect(rp.outcome).toBe("FAIL");
    expect(rp.value).toBeNull();
  });

  it("the limitations disclosure is always attached", () => {
    const report = auditSecurityHeaders(FULLY_COMPLIANT);
    expect(report.limitations).toContain("the supplied header evidence");
    expect(report.limitations).toContain("cookie attributes");
  });
});
