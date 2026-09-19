// =========================================================
// ARCHIE NATIVE ENGINE — SECRET SCANNER — TESTS
// supabase/functions/_shared/archie-ai/native-engine/security/secret-scan.test.ts
//
// Evidence for the capability claim "security-secret-scan":
// every known key format, entropy behavior, evidence masking
// (a finding must NEVER contain the full secret), per-line
// dedup, honest limitations disclosure. All test strings are
// SYNTHETIC — no real credential has ever had these values.
// =========================================================
import { describe, expect, it } from "vitest";
import {
  maskEvidence,
  scanForSecrets,
  secretScanCapabilityReports,
  type SecretScanReport,
} from "./secret-scan.ts";

// Synthetic, format-valid-only fixtures — rotate nothing,
// these never authenticated anywhere.
const FILES = [
  {
    path: "config/prod.ts",
    source: [
      'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
      `const stripe = "sk_live_51${"AbCdEfGhIjKlMnOpQrStUv"}";`,
      'const gh = "ghp_16C7e42F292c6912E7710c838347Ae178B4a";',
      'const openai = "sk-proj-9a8b7c6d5e4f3g2h1i0jXyZ";',
    ].join("\n"),
  },
  {
    path: "slack.ts",
    source: [
      'const slack = "xoxb-1234567890-abcdefGHIJ";',
      "const key = `-----BEGIN RSA PRIVATE KEY-----`;",
    ].join("\n"),
  },
];

describe("secret scanner — known key formats (HIGH_FORMAT)", () => {
  const report: SecretScanReport = scanForSecrets(FILES);

  it("finds every known-format key with the right kind and line", () => {
    const kinds = report.findings.map((f) => `${f.path}:${f.kind}`);
    expect(kinds).toContain("config/prod.ts:AWS_ACCESS_KEY_ID");
    expect(kinds).toContain("config/prod.ts:STRIPE_KEY");
    expect(kinds).toContain("config/prod.ts:GITHUB_TOKEN");
    expect(kinds).toContain("config/prod.ts:OPENAI_KEY");
    expect(kinds).toContain("slack.ts:SLACK_TOKEN");
    expect(kinds).toContain("slack.ts:PRIVATE_KEY_HEADER");
    expect(
      report.findings.every((f) => f.confidence === "HIGH_FORMAT"),
    ).toBe(true);
  });

  it("reports the exact line number (1-based)", () => {
    const aws = report.findings.find(
      (f) => f.kind === "AWS_ACCESS_KEY_ID",
    );
    expect(aws?.line).toBe(1);
    const pk = report.findings.find((f) => f.kind === "PRIVATE_KEY_HEADER");
    expect(pk?.line).toBe(2);
  });

  it("masks evidence — the finding never contains the full secret", () => {
    const aws = report.findings.find((f) => f.kind === "AWS_ACCESS_KEY_ID");
    expect(aws?.evidenceMasked).toBe("AKIAIOSF…");
    expect(aws?.evidenceMasked.includes("EXAMPLE")).toBe(false);
    const stripe = report.findings.find((f) => f.kind === "STRIPE_KEY");
    expect(stripe?.evidenceMasked.length).toBeLessThanOrEqual(9);
  });
});

describe("secret scanner — entropy candidates (ENTROPY_REVIEW)", () => {
  it("flags high-entropy token-like strings for human review", () => {
    const report = scanForSecrets([
      {
        path: "tokens.ts",
        source: 'const blob = "a8Kj2mZ9pQ3wXe7Rt5Yb1cV6fG4hN0sD";',
      },
    ]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].kind).toBe("HIGH_ENTROPY_TOKEN");
    expect(report.findings[0].confidence).toBe("ENTROPY_REVIEW");
    expect(report.findings[0].note).toContain("human review");
  });

  it("does NOT flag low-entropy long strings (e.g. repeated chars)", () => {
    const report = scanForSecrets([
      { path: "plain.ts", source: 'const pad = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";' },
    ]);
    expect(report.findings).toHaveLength(0);
  });

  it("does not flag ordinary code without token-shaped strings", () => {
    const report = scanForSecrets([
      {
        path: "math.ts",
        source: 'export const add = (a: number, b: number) => a + b;\nconst msg = "hello world";',
      },
    ]);
    expect(report.findings).toHaveLength(0);
  });
});

describe("secret scanner — honesty & accounting", () => {
  it("reports at most one finding per line (strongest category wins)", () => {
    // AWS key + high-entropy token on the SAME line → 1 finding
    const report = scanForSecrets([
      {
        path: "double.ts",
        source: 'const x = "AKIAIOSFODNN7EXAMPLE" + "a8Kj2mZ9pQ3wXe7Rt5Yb1cV6fG4hN0sD";',
      },
    ]);
    const perLine = report.findings.filter((f) => f.line === 1);
    expect(perLine).toHaveLength(1);
    expect(perLine[0].confidence).toBe("HIGH_FORMAT");
  });

  it("counts files and lines scanned honestly", () => {
    const report = scanForSecrets(FILES);
    expect(report.filesScanned).toBe(2);
    // 4 lines + 2 lines
    expect(report.linesScanned).toBe(6);
  });

  it("carries explicit limitations — candidates, never confirmed leaks", () => {
    const report = scanForSecrets(FILES);
    expect(report.limitations).toContain("candidate");
    expect(report.limitations).toContain("NOT detected");
  });

  it("masks short values to 2 chars + ellipsis, long to 8 + ellipsis", () => {
    expect(maskEvidence("short")).toBe("sh…");
    expect(maskEvidence("0123456789abcdef")).toBe("01234567…");
    // quotes are stripped before masking
    expect(maskEvidence('"0123456789abcdef"')).toBe("01234567…");
  });

  it("capability reports stay honest — scanning OPERATIONAL, live verification NOT_IMPLEMENTED", () => {
    const caps = secretScanCapabilityReports();
    const scan = caps.find((c) => c.id === "security-secret-scan");
    const verify = caps.find((c) => c.id === "security-secret-verification");
    expect(scan?.maturity).toBe("OPERATIONAL");
    expect(scan?.measuredBy).toContain("secret-scan.test.ts");
    expect(verify?.maturity).toBe("NOT_IMPLEMENTED");
  });
});
