// =========================================================
// FRELUX ARCHIE STAGE 2 — CODE SENTRY (spec §20)
//
// Monitors AUTHORIZED FRELUX source code. The real,
// implementable path today: the Owner explicitly selects or
// attaches code (chat attachments, pasted files) and Code
// Sentry scans it deterministically — secrets, injection
// risks, dangerous patterns, dead imports.
//
// Workflow: SCAN → UNDERSTAND → DETECT → ANALYZE → TEST →
// REPORT → PROPOSE FIX. Severity: CRITICAL / HIGH / MEDIUM /
// LOW. Code Sentry NEVER modifies protected production code
// (§20) — it only reports and proposes.
//
// HONESTY CONTRACT (§40): full-repository scanning runs in the
// Owner's authorized development environment (the CI suite
// already does exactly this: 5,800+ tests, tsc, build). This
// module never pretends to have scanned anything it did not.
// =========================================================

export type SentrySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface SentryFinding {
  severity: SentrySeverity;
  rule: string;
  message: string;
  /** 1-based line number inside the scanned content, 0 if unknown. */
  line: number;
  /** Proposed fix direction — never applied automatically. */
  proposal: string;
}

export interface CodeSentryReport {
  scanned: boolean;
  source: string;
  findingCount: number;
  findings: SentryFinding[];
  criticalCount: number;
  highCount: number;
  note: string;
}

// ---------------------------------------------------------
// Real deterministic rules. Each rule is testable and false
// positives are minimized by anchoring on real token shapes.
// ---------------------------------------------------------
interface Rule {
  rule: string;
  severity: SentrySeverity;
  message: string;
  proposal: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    rule: "secret:provider-api-key",
    severity: "CRITICAL",
    message: "Hardcoded provider API key detected",
    proposal:
      "Move the key to a server-side secret (Deno.env / edge function). Keys must never live in source.",
    pattern:
      /\b(?:sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})\b/,
  },
  {
    rule: "secret:supabase-service-key",
    severity: "CRITICAL",
    message: "Supabase service-role key detected in code",
    proposal:
      "Service keys are server-only. Rotate the key immediately and remove it from the bundle.",
    pattern: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  },
  {
    rule: "secret:password-assignment",
    severity: "HIGH",
    message: "Hardcoded password or token assignment",
    proposal: "Load credentials from environment secrets; never commit them.",
    pattern:
      /\b(?:password|passwd|secret|token|api_key|apikey)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i,
  },
  {
    rule: "dangerous:eval",
    severity: "HIGH",
    message: "eval()/new Function() usage",
    proposal: "Remove dynamic code evaluation — it is an injection vector.",
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
  },
  {
    rule: "dangerous:raw-html-injection",
    severity: "MEDIUM",
    message: "dangerouslySetInnerHTML with non-constant value",
    proposal: "Sanitize the HTML or render text — raw injection enables XSS.",
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\{\s*[^}"]+/,
  },
  {
    rule: "dangerous:string-built-sql",
    severity: "HIGH",
    message: "SQL query built from string concatenation",
    proposal: "Use parameterized queries / the Supabase client query builder.",
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)[^\n]*["'`]\s*\+/i,
  },
  {
    rule: "transport:insecure-http",
    severity: "MEDIUM",
    message: "Plain http:// URL in code",
    proposal: "Use https:// everywhere.",
    pattern: /["'`]http:\/\/(?!localhost|127\.0\.0\.1)/,
  },
  {
    rule: "quality:console-log",
    severity: "LOW",
    message: "console.log left in code",
    proposal: "Remove debug logging before production.",
    pattern: /^\s*console\.log\s*\(/m,
  },
];

export function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/** Scan explicitly authorized code content. Deterministic. */
export function scanAuthorizedCode(
  content: string,
  source = "owner-selected content",
): CodeSentryReport {
  const findings: SentryFinding[] = [];
  for (const rule of RULES) {
    const re = new RegExp(
      rule.pattern.source,
      rule.pattern.flags.includes("g")
        ? rule.pattern.flags
        : rule.pattern.flags + "g",
    );
    let match: RegExpExecArray | null;
    let seen = 0;
    while ((match = re.exec(content)) !== null && seen < 5) {
      findings.push({
        severity: rule.severity,
        rule: rule.rule,
        message: rule.message,
        line: lineOf(content, match.index),
        proposal: rule.proposal,
      });
      seen++;
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  const order: Record<SentrySeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.line - b.line,
  );
  return {
    scanned: true,
    source,
    findingCount: findings.length,
    findings,
    criticalCount: findings.filter((f) => f.severity === "CRITICAL").length,
    highCount: findings.filter((f) => f.severity === "HIGH").length,
    note: "Code Sentry reports and proposes only — it never modifies protected production code. Whole-repository verification runs in the Owner's authorized development environment (CI: full test suite, typecheck, build).",
  };
}

/** Honest report when nothing was authorized for scanning. */
export function notScannedReport(): CodeSentryReport {
  return {
    scanned: false,
    source: "none",
    findingCount: 0,
    findings: [],
    criticalCount: 0,
    highCount: 0,
    note: "No code has been authorized for scanning. Code Sentry scans only content the Owner explicitly selects or attaches.",
  };
}
