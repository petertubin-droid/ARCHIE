// =========================================================
// ARCHIE NATIVE ENGINE — HTTP SECURITY HEADER AUDIT — TESTS
// supabase/functions/_shared/archie-ai/native-engine/security/header-audit.test.ts
//
// Evidence for the capability claim "security-header-audit":
// PASS/WEAK/FAIL paths for all six baseline headers,
// case-insensitive matching, empty-value handling, severity
// mapping, honest limitations. Works purely on supplied
// evidence — no HTTP request is ever made.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  auditSecurityHeaders,
  headerAuditCapabilityReports,
} from "./header-audit.ts";

const COMPLIANT = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": "default-src 'self'; img-src 'self' data:",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), camera=()",
};

describe("header audit — PASS paths", () => {
  it("passes all six headers when fully compliant", () => {
    const r = auditSecurityHeaders(COMPLIANT, "https://example.com");
    expect(r.passed).toBe(6);
    expect(r.weak).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.results.every((x) => x.outcome === "PASS")).toBe(true);
    expect(r.url).toBe("https://example.com");
  });

  it("matches header names case-insensitively", () => {
    const mixed: Record<string, string> = {};
    for (const [k, v] of Object.entries(COMPLIANT)) {
      mixed[k.slice(0, 1).toUpperCase() + k.slice(1)] = v;
    }
    const r = auditSecurityHeaders(mixed);
    expect(r.passed).toBe(6);
  });
});

describe("header audit — FAIL paths", () => {
  it("reports every missing header as FAIL with its risk", () => {
    const r = auditSecurityHeaders({});
    expect(r.failed).toBe(6);
    expect(r.passed).toBe(0);
    expect(r.results.every((x) => x.value === null)).toBe(true);
    const csp = r.results.find((x) => x.header === "content-security-policy");
    expect(csp?.severity).toBe("HIGH");
    const nosniff = r.results.find(
      (x) => x.header === "x-content-type-options",
    );
    expect(nosniff?.severity).toBe("LOW");
    expect(csp?.detail).toContain("missing");
  });

  it("treats an empty-string value as missing — never assumed present", () => {
    const r = auditSecurityHeaders({ "referrer-policy": "" });
    const rp = r.results.find((x) => x.header === "referrer-policy");
    expect(rp?.outcome).toBe("FAIL");
    expect(rp?.value).toBe(null);
  });
});

describe("header audit — WEAK paths", () => {
  it("flags HSTS with max-age below 180 days", () => {
    const r = auditSecurityHeaders({ ...COMPLIANT, "strict-transport-security": "max-age=100" });
    const hsts = r.results.find((x) => x.header === "strict-transport-security");
    expect(hsts?.outcome).toBe("WEAK");
    expect(hsts?.detail).toContain("below 180 days");
  });

  it("flags HSTS without a max-age directive", () => {
    const r = auditSecurityHeaders({ "strict-transport-security": "includeSubDomains" });
    const hsts = r.results.find((x) => x.header === "strict-transport-security");
    expect(hsts?.outcome).toBe("WEAK");
    expect(hsts?.detail).toContain("no max-age directive");
  });

  it("flags CSP containing unsafe-inline / unsafe-eval", () => {
    const r = auditSecurityHeaders({ "content-security-policy": "default-src 'unsafe-inline'" });
    const csp = r.results.find((x) => x.header === "content-security-policy");
    expect(csp?.outcome).toBe("WEAK");
    expect(csp?.detail).toContain("unsafe-inline");
  });

  it("flags wrong nosniff, frame and referrer values", () => {
    const r = auditSecurityHeaders({
      "x-content-type-options": "nosniff; charset=utf-8",
      "x-frame-options": "ALLOWALL",
      "referrer-policy": "unsafe-url",
    });
    const by = (h: string) =>
      r.results.find((x) => x.header === h)?.outcome;
    expect(by("x-content-type-options")).toBe("WEAK");
    expect(by("x-frame-options")).toBe("WEAK");
    expect(by("referrer-policy")).toBe("WEAK");
  });

  it("treats a whitespace-only permissions-policy as missing (FAIL), never compliant", () => {
    const r = auditSecurityHeaders({ "permissions-policy": "   " });
    const pp = r.results.find((x) => x.header === "permissions-policy");
    expect(pp?.outcome).toBe("FAIL");
  });

  it("keeps the present (weak) value in the result for evidence", () => {
    const r = auditSecurityHeaders({ "x-frame-options": "ALLOWALL" });
    expect(
      r.results.find((x) => x.header === "x-frame-options")?.value,
    ).toBe("ALLOWALL");
  });
});

describe("header audit — honesty", () => {
  it("counts passed/weak/failed consistently with the results array", () => {
    const r = auditSecurityHeaders({
      "strict-transport-security": "max-age=63072000",
      "x-content-type-options": "nosniff",
      // 2 PASS (hsts, nosniff), 0 WEAK, 4 FAIL
    });
    expect(r.passed).toBe(2);
    expect(r.weak).toBe(0);
    expect(r.failed).toBe(4);
    expect(r.results).toHaveLength(6);
  });

  it("discloses what the audit does NOT cover", () => {
    const r = auditSecurityHeaders(COMPLIANT);
    expect(r.limitations).toContain("cookie attributes");
    expect(r.limitations).toContain("NOT covered");
  });

  it("capability reports stay honest — audit OPERATIONAL, autonomous live scanning NOT_IMPLEMENTED", () => {
    const caps = headerAuditCapabilityReports();
    expect(
      caps.find((c) => c.id === "security-header-audit")?.maturity,
    ).toBe("OPERATIONAL");
    expect(
      caps.find((c) => c.id === "security-live-scanning")?.maturity,
    ).toBe("NOT_IMPLEMENTED");
  });
});
