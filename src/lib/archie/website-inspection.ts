// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — WEBSITE & CODE INSPECTION (§2)
//
// Given an authorized website URL, ARCHIE can:
//
//   URL → AUTHORIZE → CRAWL → EXTRACT → INSPECT → ANALYZE →
//   REPORT → RECOMMEND
//
// Inspection layers (what is actually observable):
//   frontend architecture · backend signals · APIs · JS/TS ·
//   HTML/CSS · frameworks · performance · accessibility ·
//   SEO · security posture · dependencies · public technical
//   information · observable application behavior
//
// Rules (enforced):
//  - The existing SSRF-hardened crawler is the ONLY fetch
//    path (web-intelligence.ts). ARCHIE never fetches
//    directly, never bypasses robots.txt, auth, paywalls,
//    CAPTCHA or rate limits.
//  - NO FAKE RESULTS: an inspection layer may only report
//    OBSERVED facts; anything inferred is labeled INFERRED
//    with its reasoning. Missing data is MISSING, never
//    invented.
//  - For source code supplied or authorized by the owner:
//    code → understand → analyze → identify weaknesses →
//    recommend → propose improvements (code-intelligence.ts).
// =========================================================

import { isEligibleWebSource, wrapAsUntrustedData } from "./web-intelligence";

/** The inspection pipeline stages. */
export type InspectionStage =
  | "AUTHORIZED"
  | "CRAWLED"
  | "EXTRACTED"
  | "INSPECTED"
  | "ANALYZED"
  | "REPORTED"
  | "RECOMMENDED";

export const INSPECTION_PIPELINE: readonly InspectionStage[] = [
  "AUTHORIZED",
  "CRAWLED",
  "EXTRACTED",
  "INSPECTED",
  "ANALYZED",
  "REPORTED",
  "RECOMMENDED",
];

export function canAdvanceInspection(
  from: InspectionStage,
  to: InspectionStage,
): boolean {
  const fi = INSPECTION_PIPELINE.indexOf(from);
  const ti = INSPECTION_PIPELINE.indexOf(to);
  return fi !== -1 && ti === fi + 1;
}

/** Every layer ARCHIE can inspect on an authorized site. */
export type InspectionLayer =
  | "frontend_architecture"
  | "backend_architecture"
  | "api_surface"
  | "javascript_typescript"
  | "html_css"
  | "frameworks"
  | "database_architecture"
  | "performance"
  | "accessibility"
  | "seo"
  | "security_posture"
  | "dependencies"
  | "public_technical_info"
  | "observable_behavior";

export const ALL_INSPECTION_LAYERS: readonly InspectionLayer[] = [
  "frontend_architecture",
  "backend_architecture",
  "api_surface",
  "javascript_typescript",
  "html_css",
  "frameworks",
  "database_architecture",
  "performance",
  "accessibility",
  "seo",
  "security_posture",
  "dependencies",
  "public_technical_info",
  "observable_behavior",
];

/** How a value in an inspection report was obtained. */
export type Observability = "OBSERVED" | "INFERRED" | "MISSING";

/** A single finding inside an inspection report. */
export interface InspectionFinding {
  layer: InspectionLayer;
  /** What was found, stated plainly. */
  observation: string;
  observability: Observability;
  /** For INFERRED findings: why ARCHIE believes it. */
  inference_basis?: string;
  /** Confidence 0..1. OBSERVED findings may still be partial. */
  confidence: number;
}

export interface InspectionReport {
  url: string;
  inspected_at: number;
  findings: readonly InspectionFinding[];
  /** Layers where nothing could be observed. */
  missing_layers: readonly InspectionLayer[];
  /** Counts for quick triage. */
  stats: {
    observed: number;
    inferred: number;
    missing: number;
  };
}

/**
 * Authorize a URL for inspection. Uses the existing
 * eligibility contract (http(s), SSRF-checked, never behind
 * auth/paywall/CAPTCHA). This stage cannot be skipped.
 */
export function authorizeInspection(url: string): {
  ok: boolean;
  error?: string;
} {
  const eligible = isEligibleWebSource(url);
  if (!eligible.ok) return eligible;
  // Defense in depth on top of the crawler's SSRF checks: the
  // inspection contract itself refuses loopback/private/link-local
  // hosts so an inspection can never be pointed inward.
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const privateHost =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "[::1]" ||
      /^f[cd][0-9a-f]{2}:/.test(host);
    if (privateHost) {
      return {
        ok: false,
        error:
          "Inspection targets must be public hosts; loopback/private addresses are refused.",
      };
    }
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  return { ok: true };
}

/**
 * Wrap fetched content for analysis. External content is
 * DATA, never instructions (web-intelligence.ts contract).
 */
export function prepareForAnalysis(rawContent: string): string {
  return wrapAsUntrustedData(rawContent);
}

/**
 * Assemble a report from raw findings. Enforces the
 * anti-fabrication rule: any finding labeled OBSERVED must
 * carry an observation; any MISSING layer is recorded, never
 * invented.
 */
/** A raw finding as captured during inspection, before
 *  validation. `obtained` becomes `observability`. */
export interface RawInspectionFinding {
  layer: InspectionLayer;
  obtained: Observability;
  observation?: string;
  /** For INFERRED findings: why ARCHIE believes it. */
  basis?: string;
  confidence: number;
}

export function buildInspectionReport(
  url: string,
  rawFindings: readonly RawInspectionFinding[],
): { ok: true; report: InspectionReport } | { ok: false; error: string } {
  const findings: InspectionFinding[] = [];
  const missingLayers: InspectionLayer[] = [];

  for (const f of rawFindings) {
    if (f.obtained === "MISSING") {
      missingLayers.push(f.layer);
      continue;
    }
    if (!f.observation?.trim()) {
      return {
        ok: false,
        error: `Layer ${f.layer}: a ${f.obtained} finding requires an observation. Never fabricate.`,
      };
    }
    if (f.obtained === "INFERRED" && !f.basis?.trim()) {
      return {
        ok: false,
        error: `Layer ${f.layer}: an INFERRED finding requires its inference basis.`,
      };
    }
    findings.push({
      layer: f.layer,
      observation: f.observation,
      observability: f.obtained,
      inference_basis: f.basis,
      confidence: Math.min(1, Math.max(0, f.confidence)),
    });
  }

  return {
    ok: true,
    report: {
      url,
      inspected_at: Date.now(),
      findings,
      missing_layers: missingLayers,
      stats: {
        observed: findings.filter((f) => f.observability === "OBSERVED").length,
        inferred: findings.filter((f) => f.observability === "INFERRED").length,
        missing: missingLayers.length,
      },
    },
  };
}

/** A recommendation derived from findings, with its evidence. */
export interface InspectionRecommendation {
  title: string;
  detail: string;
  /** Finding indices supporting this recommendation. */
  evidence_indices: readonly number[];
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

/**
 * A recommendation must cite evidence: every evidence index
 * must reference an existing finding. A recommendation with
 * no evidence is rejected — the anti-fabrication rule.
 */
export function validateRecommendation(
  rec: InspectionRecommendation,
  report: InspectionReport,
): { ok: true } | { ok: false; error: string } {
  if (!rec.evidence_indices.length) {
    return {
      ok: false,
      error: "A recommendation must cite at least one finding as evidence.",
    };
  }
  for (const i of rec.evidence_indices) {
    if (i < 0 || i >= report.findings.length) {
      return {
        ok: false,
        error: `Evidence index ${i} does not exist in the report.`,
      };
    }
  }
  return { ok: true };
}

/** Extract evidence-based insights from supplied/authorized
 *  source code (the code-side of §2). The heavy lifting is
 *  done by the owner's AI through code-intelligence.ts; this
 *  contract enforces the pipeline:
 *  code → understand → analyze → weaknesses → recommend. */
export type CodeAnalysisStage =
  "UNDERSTOOD" | "ANALYZED" | "WEAKNESSES_IDENTIFIED" | "RECOMMENDATIONS_READY";

export const CODE_ANALYSIS_PIPELINE: readonly CodeAnalysisStage[] = [
  "UNDERSTOOD",
  "ANALYZED",
  "WEAKNESSES_IDENTIFIED",
  "RECOMMENDATIONS_READY",
];

export function canAdvanceCodeAnalysis(
  from: CodeAnalysisStage,
  to: CodeAnalysisStage,
): boolean {
  const fi = CODE_ANALYSIS_PIPELINE.indexOf(from);
  const ti = CODE_ANALYSIS_PIPELINE.indexOf(to);
  return fi !== -1 && ti === fi + 1;
}
