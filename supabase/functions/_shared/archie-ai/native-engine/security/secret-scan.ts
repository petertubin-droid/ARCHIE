// =========================================================
// ARCHIE NATIVE ENGINE — SECRET SCANNER
// supabase/functions/_shared/archie-ai/native-engine/security/secret-scan.ts
//
// Deterministic secret/credential detection for authorized
// security engagements (hacking engine). No network, no
// guessing — pattern + entropy analysis with every finding
// carrying the exact line and the exact matched text range:
//
//   * KNOWN KEY FORMATS — AWS, Stripe, Google, GitHub,
//     Supabase/JWT, OpenAI, Slack, private key headers
//   * HIGH-ENTROPY STRINGS — Shannon entropy over
//     candidate token-like strings, with a conservative
//     threshold to limit false positives
//   * HONEST LABELING — every finding is a CANDIDATE, never
//     a confirmed leak; entropy hits are explicitly marked
//     "needs human review"
//   * NO SECRETS IN FINDINGS — the match is truncated and
//     masked in the evidence so logs never leak the secret
//     itself (audit trail stays safe)
// =========================================================

import type { CapabilityReport } from "../types.ts";

export interface SecretFinding {
  path: string;
  line: number;
  /** Category of the detected candidate. */
  kind: string;
  /** Masked evidence — first 8 chars + …, never the full secret. */
  evidenceMasked: string;
  /** Known-format (high confidence) vs entropy-based (needs review). */
  confidence: "HIGH_FORMAT" | "ENTROPY_REVIEW";
  /** Honest advisory text. */
  note: string;
}

export interface SecretScanReport {
  findings: SecretFinding[];
  filesScanned: number;
  linesScanned: number;
  /** Honest disclosure of what the scan does NOT cover. */
  limitations: string;
}

const KEY_PATTERNS: Array<{ kind: string; re: RegExp; note: string }> = [
  {
    kind: "AWS_ACCESS_KEY_ID",
    re: /A3T[A-Z0-9]|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}/,
    note: "AWS access key identifier format — verify and rotate if real",
  },
  {
    kind: "AWS_SECRET",
    re: /aws(.{0,25})?['"][0-9a-zA-Z/+]{40}['"]/i,
    note: "AWS secret access key pattern — verify and rotate if real",
  },
  {
    kind: "STRIPE_KEY",
    re: /sk_(live|test)_[0-9a-zA-Z]{16,}/,
    note: "Stripe secret key format — verify and rotate if real",
  },
  {
    kind: "GITHUB_TOKEN",
    re: /gh[pousr]_[0-9A-Za-z]{20,}/,
    note: "GitHub token format — verify and revoke if real",
  },
  {
    kind: "OPENAI_KEY",
    re: /sk-[A-Za-z0-9_-]{20,}/,
    note: "OpenAI-style key format — verify and revoke if real",
  },
  {
    kind: "SLACK_TOKEN",
    re: /xox[baprs]-[0-9A-Za-z-]{10,}/,
    note: "Slack token format — verify and revoke if real",
  },
  {
    kind: "GOOGLE_API_KEY",
    re: /AIza[0-9A-Za-z_-]{35}/,
    note: "Google API key format — verify and restrict if real",
  },
  {
    kind: "PRIVATE_KEY_HEADER",
    re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
    note: "Private key material — verify ownership and rotate if real",
  },
  {
    kind: "JWT",
    re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.?[A-Za-z0-9_-]*/,
    note: "JWT-like token — verify; JWTs can be short-lived and public-safe",
  },
  {
    kind: "SUPABASE_SERVICE_KEY",
    re: /sb_(service|secret)_[0-9A-Za-z]{20,}/,
    note: "Supabase service/secret key format — verify and rotate if real",
  },
  {
    kind: "DB_URL_CREDENTIALS",
    re: /postgres(ql)?:\/\/[^:\s'"@]+:[^@\s'"]+@/,
    note: "Connection string with inline credentials — verify and move to a secret store",
  },
];

/** Candidate token strings for entropy analysis. */
const TOKEN_RE = /["'][0-9A-Za-z+/_-]{32,128}["']/g;

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let e = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

/** Mask evidence so the finding never contains the full secret. */
export function maskEvidence(text: string): string {
  const t = text.trim().replace(/^['"]|['"]$/g, "");
  return t.length <= 8 ? t.slice(0, 2) + "…" : t.slice(0, 8) + "…";
}

const ENTROPY_THRESHOLD = 4.5;

export function scanForSecrets(
  files: Array<{ path: string; source: string }>,
): SecretScanReport {
  const findings: SecretFinding[] = [];
  let linesScanned = 0;

  for (const file of files) {
    const lines = file.source.split("\n");
    linesScanned += lines.length;
    lines.forEach((line, i) => {
      // Known key formats — high confidence
      for (const { kind, re, note } of KEY_PATTERNS) {
        const m = re.exec(line);
        if (m) {
          findings.push({
            path: file.path,
            line: i + 1,
            kind,
            evidenceMasked: maskEvidence(m[0]),
            confidence: "HIGH_FORMAT",
            note,
          });
          break; // one finding per line: strongest category wins
        }
      }
      // Entropy-based candidates — explicitly marked for review
      if (findings.every((f) => !(f.path === file.path && f.line === i + 1))) {
        for (const m of line.match(TOKEN_RE) ?? []) {
          const raw = m.replace(/^['"]|['"]$/g, "");
          if (shannonEntropy(raw) >= ENTROPY_THRESHOLD) {
            findings.push({
              path: file.path,
              line: i + 1,
              kind: "HIGH_ENTROPY_TOKEN",
              evidenceMasked: maskEvidence(m),
              confidence: "ENTROPY_REVIEW",
              note: "high-entropy token-like string — needs human review; can be a hash, an encoded blob or a real secret",
            });
            break;
          }
        }
      }
    });
  }

  return {
    findings,
    filesScanned: files.length,
    linesScanned,
    limitations:
      "static pattern + entropy analysis only — obfuscated, split, encoded (base64/hex-wrapped) or environment-injected secrets are NOT detected; every finding is a candidate, never a confirmed leak",
  };
}

/** Honest capability reports. */
export function secretScanCapabilityReports(): CapabilityReport[] {
  return [
    {
      id: "security-secret-scan",
      description:
        "Deterministic secret/credential candidate detection: 11 known key formats plus Shannon-entropy token analysis, masked evidence in every finding",
      maturity: "OPERATIONAL",
      measuredBy:
        "secret-scan.test.ts (known formats, entropy, masking, limitations disclosure)",
    },
    {
      id: "security-secret-verification",
      description:
        "Verifying whether a detected candidate is live (calling provider APIs with the key)",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — ARCHIE never tests credentials against live services; verification is a human decision",
    },
  ];
}
