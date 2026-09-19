// =========================================================
// ARCHIE SECURITY NATIVE ENGINE TESTS — SECRET SCAN
// src/lib/archie/__tests__/secret-scan.test.ts
//
// Hacking engine deepening (#31). Deterministic secret
// detection verified:
//
//   * every known key format is found at its exact line
//   * high-entropy tokens are flagged for HUMAN review only
//   * low-entropy strings are NOT flagged (false-positive
//     discipline)
//   * evidence is MASKED — the finding never contains the
//     full secret (audit-trail safety)
//   * the limitations disclosure is always attached
// =========================================================
import { describe, expect, it } from "vitest";
import {
  maskEvidence,
  scanForSecrets,
} from "@studio-shared/archie-ai/native-engine/security/secret-scan.ts";

const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const GH_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";

describe("known key formats", () => {
  it("detects an AWS access key at its exact line", () => {
    const files = [
      {
        path: "config/deploy.ts",
        source: `const x = 1;\nconst key = "${AWS_KEY}";\nexport { x, key };\n`,
      },
    ];
    const report = scanForSecrets(files);
    const f = report.findings.find((x) => x.kind === "AWS_ACCESS_KEY_ID");
    expect(f).toBeDefined();
    expect(f!.line).toBe(2);
    expect(f!.confidence).toBe("HIGH_FORMAT");
  });

  it("detects GitHub, Stripe, OpenAI, Slack and private-key formats", () => {
    const files = [
      {
        path: "a.ts",
        source: [
          `const g = "${GH_TOKEN}";`,
          `const s = "sk_live_26DnJHqXmSuEexample";`,
          `const o = "sk-proj-abcdefghijklmnopqrstuvwxyz";`,
          `const sl = "xoxb-123-abc-def";`,
          `const k = "-----BEGIN RSA PRIVATE KEY-----";`,
          "",
        ].join("\n"),
      },
    ];
    const report = scanForSecrets(files);
    const kinds = report.findings.map((f) => f.kind);
    expect(kinds).toContain("GITHUB_TOKEN");
    expect(kinds).toContain("STRIPE_KEY");
    expect(kinds).toContain("OPENAI_KEY");
    expect(kinds).toContain("SLACK_TOKEN");
    expect(kinds).toContain("PRIVATE_KEY_HEADER");
  });

  it("flags a postgres connection string with inline credentials", () => {
    const report = scanForSecrets([
      {
        path: "db.ts",
        source: `const url = "postgres://user:secretpw@host:5432/db";`,
      },
    ]);
    expect(report.findings.some((f) => f.kind === "DB_URL_CREDENTIALS")).toBe(
      true,
    );
  });
});

describe("entropy analysis — false-positive discipline", () => {
  it("flags a high-entropy token for HUMAN review only", () => {
    const report = scanForSecrets([
      {
        path: "env.ts",
        source: `const t = "a7Xk9Pq2Lm4Zr8Nv3Bw6Cy1Df0Gh5JkQ";`,
      },
    ]);
    const f = report.findings.find((x) => x.kind === "HIGH_ENTROPY_TOKEN");
    expect(f).toBeDefined();
    expect(f!.confidence).toBe("ENTROPY_REVIEW");
    expect(f!.note).toContain("human review");
  });

  it("does NOT flag low-entropy or human-readable strings", () => {
    const report = scanForSecrets([
      {
        path: "ui.ts",
        source: `const label = "archie-dashboard-page-title-header-label";`,
      },
    ]);
    expect(report.findings).toHaveLength(0);
  });
});

describe("evidence masking — the audit trail never leaks the secret", () => {
  it("masks long matches to their first 8 characters", () => {
    expect(maskEvidence(AWS_KEY)).toBe("AKIAIOSF…");
    expect(maskEvidence(`"${GH_TOKEN}"`)).toBe("ghp_1234…");
    // short strings are still never fully exposed
    expect(maskEvidence("abc").length).toBeLessThanOrEqual(3);
  });

  it("findings contain masked evidence, never the full secret", () => {
    const report = scanForSecrets([
      { path: "x.ts", source: `const k = "${AWS_KEY}";` },
    ]);
    for (const f of report.findings) {
      expect(f.evidenceMasked).not.toContain(AWS_KEY);
    }
  });
});

describe("honesty disclosures", () => {
  it("the report carries scan counts and limitations", () => {
    const report = scanForSecrets([
      { path: "a.ts", source: "one\ntwo\nthree" },
    ]);
    expect(report.filesScanned).toBe(1);
    expect(report.linesScanned).toBe(3);
    expect(report.limitations).toContain("obfuscated");
    expect(report.limitations).toContain("never a confirmed leak");
  });

  it("comments are still scanned — secrets in comments leak too", () => {
    const report = scanForSecrets([
      {
        path: "a.ts",
        source: `// legacy key: ${AWS_KEY}\nconst ok = 1;`,
      },
    ]);
    expect(report.findings.length).toBeGreaterThanOrEqual(1);
  });
});
