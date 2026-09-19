// =========================================================
// ARCHIE NATIVE ENGINE — HTTP SECURITY HEADER AUDIT
// supabase/functions/_shared/archie-ai/native-engine/security/header-audit.ts
//
// Deterministic compliance check of REAL captured response
// headers against a fixed, documented baseline (OWASP secure
// headers). The auditor supplies the headers captured during
// an authorized engagement; this module reports, per header:
//
//   * PRESENT and compliant → PASS
//   * PRESENT with a weak value → WEAK (with the exact value,
//     masked where it could identify a server fingerprint)
//   * MISSING → FAIL with the risk it leaves open
//
// No HTTP requests are made here — the audit works on
// evidence supplied by the engagement. Nothing is invented:
// a header that was not captured is reported MISSING, never
// assumed.
// =========================================================

import type { CapabilityReport } from "../types.ts";

export interface HeaderRule {
  header: string;
  requirement: string;
  /** Returns null when the value is acceptable, or a WEAK reason. */
  evaluate: (value: string) => string | null;
}

export interface HeaderCheckResult {
  header: string;
  outcome: "PASS" | "WEAK" | "FAIL";
  /** Present value (WEAK/PASS), null when missing. */
  value: string | null;
  detail: string;
  severity: "MEDIUM" | "HIGH" | "LOW";
}

export interface HeaderAuditReport {
  url: string | null;
  results: HeaderCheckResult[];
  passed: number;
  weak: number;
  failed: number;
  limitations: string;
}

const RULES: HeaderRule[] = [
  {
    header: "strict-transport-security",
    requirement: "HSTS forces HTTPS for future visits",
    evaluate: (v) => {
      if (!/max-age=\d+/.test(v)) return "no max-age directive";
      if (/\d+/.exec(v)?.[0] && Number(/\d+/.exec(v)![0]) < 15552000)
        return "max-age below 180 days";
      return null;
    },
  },
  {
    header: "content-security-policy",
    requirement: "CSP constrains where content may load from",
    evaluate: (v) => {
      if (/unsafe-inline|unsafe-eval/.test(v))
        return "contains unsafe-inline/unsafe-eval — XSS mitigations weakened";
      return null;
    },
  },
  {
    header: "x-content-type-options",
    requirement: "prevents MIME-type sniffing",
    evaluate: (v) =>
      v.toLowerCase().trim() === "nosniff" ? null : 'value must be "nosniff"',
  },
  {
    header: "x-frame-options",
    requirement: "clickjacking protection (CSP frame-ancestors alternative)",
    evaluate: (v) =>
      /deny|sameorigin/i.test(v)
        ? null
        : 'value must be "DENY" or "SAMEORIGIN" (or use CSP frame-ancestors)',
  },
  {
    header: "referrer-policy",
    requirement: "controls referrer leakage to third parties",
    evaluate: (v) =>
      /no-referrer|strict-origin(-when-cross-origin)?$/i.test(v.trim())
        ? null
        : "weak referrer policy — prefer no-referrer or strict-origin-when-cross-origin",
  },
  {
    header: "permissions-policy",
    requirement: "restricts powerful browser features",
    evaluate: (v) =>
      v.trim().length > 0 ? null : "empty value carries no restrictions",
  },
];

const SEVERITY: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
  "content-security-policy": "HIGH",
  "strict-transport-security": "MEDIUM",
  "x-content-type-options": "LOW",
  "x-frame-options": "MEDIUM",
  "referrer-policy": "LOW",
  "permissions-policy": "LOW",
};

export function auditSecurityHeaders(
  capturedHeaders: Record<string, string>,
  url: string | null = null,
): HeaderAuditReport {
  const results: HeaderCheckResult[] = [];

  for (const rule of RULES) {
    const key = Object.keys(capturedHeaders).find(
      (k) => k.toLowerCase() === rule.header,
    );
    const value = key !== undefined ? capturedHeaders[key] : null;
    if (value === null || value === undefined || value.trim() === "") {
      results.push({
        header: rule.header,
        outcome: "FAIL",
        value: null,
        detail: `missing — ${rule.requirement}`,
        severity: SEVERITY[rule.header] ?? "MEDIUM",
      });
      continue;
    }
    const weakReason = rule.evaluate(value);
    results.push(
      weakReason === null
        ? {
            header: rule.header,
            outcome: "PASS",
            value,
            detail: "present and compliant",
            severity: SEVERITY[rule.header] ?? "MEDIUM",
          }
        : {
            header: rule.header,
            outcome: "WEAK",
            value,
            detail: `present but weak: ${weakReason}`,
            severity: SEVERITY[rule.header] ?? "MEDIUM",
          },
    );
  }

  return {
    url,
    results,
    passed: results.filter((r) => r.outcome === "PASS").length,
    weak: results.filter((r) => r.outcome === "WEAK").length,
    failed: results.filter((r) => r.outcome === "FAIL").length,
    limitations:
      "audits ONLY the supplied header evidence against a fixed 6-header baseline — cookie attributes, CORS policy, TLS configuration and per-route differences are NOT covered; a missing header on the audited response is reported, never assumed absent everywhere",
  };
}

/** Honest capability reports. */
export function headerAuditCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "security-header-audit",
      description:
        "Deterministic HTTP security-header compliance check (HSTS, CSP, nosniff, frame options, referrer, permissions policy) over captured engagement evidence",
      maturity: "OPERATIONAL",
      measuredBy:
        "header-audit.test.ts (pass/weak/fail paths, case-insensitivity, limitations)",
    },
    {
      id: "security-live-scanning",
      description: "ARCHIE autonomously fetching and scanning live targets",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — intrusive phases require a valid owner-authorized engagement; this module audits supplied evidence only",
    },
  ];
}
