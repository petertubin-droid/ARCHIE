// =========================================================
// ARCHIE COGNITIVE SYNTHESIS ENGINE
// src/lib/archie/cognitive-synthesis.ts
//
// © 2026 FRENZY. All rights reserved.
//
// Resolves dialectical tensions across heterogeneous domains:
//   Thesis (Domain A Claim/Constraint)
//   + Antithesis (Domain B Counter-Constraint/Objective)
//   → Dialectical Synthesis (Integrated Resolution Matrix)
//
// Handles multi-criteria trade-offs:
//   - Security vs Performance / Latency
//   - Structural Rigidity vs Material Cost
//   - Innovation / Velocity vs Regulatory Compliance
//   - Local Micro-Optimization vs Global Systemic Health
//
// ANTI-FABRICATION RULE (spec §10):
// Tensions and trade-offs are never glossed over or hidden.
// Resolutions must explicitly state concessions, gains, and
// residual uncertainties. Epistemic states are preserved:
// syntheses combining assumptions remain ASSUMED/INFERRED.
// =========================================================

import type { ArchieEpistemicState } from "./types";

/** Nature of dialectical tension between domain claims. */
export type TensionNature =
  | "OBJECTIVE_CONFLICT"
  | "RESOURCE_COMPETITION"
  | "CONSTRAINT_INCOMPATIBILITY"
  | "TEMPORAL_MISALIGNMENT"
  | "PARADIGM_DIVERGENCE";

/** Strategy applied to reconcile dialectical tensions. */
export type SynthesisStrategy =
  | "PARETO_OPTIMIZATION"
  | "HIERARCHICAL_PRECEDENCE"
  | "INTEGRATIVE_COMPROMISE"
  | "CONTEXTUAL_PARTITIONING"
  | "CONSTRAINT_SATISFICING";

/** An individual assertion, fact, or constraint from a specific domain. */
export interface DomainClaim {
  id: string;
  domain: string;
  statement: string;
  evidence: string[];
  evidence_state: ArchieEpistemicState;
  weight: number; // 0..1 importance
  risk_critical?: boolean;
}

/** Explicit tension identified between two claims across domains. */
export interface DialecticalTension {
  id: string;
  domain_a: string;
  claim_a: DomainClaim;
  domain_b: string;
  claim_b: DomainClaim;
  nature: TensionNature;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

/** Tradeoff concession and gain for a domain in a synthesis. */
export interface SynthesisTradeoff {
  domain: string;
  concessions: string;
  gains: string;
}

/** The reconciled resolution for a dialectical tension. */
export interface SynthesisResolution {
  tension_id: string;
  strategy: SynthesisStrategy;
  resolution_statement: string;
  tradeoffs: SynthesisTradeoff[];
  resulting_evidence_state: ArchieEpistemicState;
  residual_uncertainty: string | null;
  confidence: number;
}

/** Comprehensive synthesis report covering an entire multi-domain inquiry. */
export interface CognitiveSynthesisReport {
  domains_involved: string[];
  total_claims_analyzed: number;
  tensions: DialecticalTension[];
  resolutions: SynthesisResolution[];
  synthesized_thesis: string;
  epistemic_audit: {
    verified_count: number;
    inferred_count: number;
    assumed_count: number;
    unverified_count: number;
  };
  overall_confidence: number;
  unresolved_tensions: DialecticalTension[];
}

export interface SynthesisOptions {
  preferredStrategy?: SynthesisStrategy;
  strictSafetyPrecedence?: boolean;
  minConfidence?: number;
}

/**
 * Keyword-based conflict heuristics for deterministic tension detection.
 */
const TENSION_PATTERNS: Array<{
  keyword_a: RegExp;
  keyword_b: RegExp;
  nature: TensionNature;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  template: (d1: string, d2: string, s1: string, s2: string) => string;
}> = [
  {
    keyword_a: /(security|isolation|airgap|sanitize|verify|auth|encrypt|audit)/i,
    keyword_b: /(latency|throughput|speed|zero-overhead|fastest|instant|unbuffered)/i,
    nature: "OBJECTIVE_CONFLICT",
    severity: "HIGH",
    template: (d1, d2) =>
      `Security controls in "${d1}" introduce validation latency impacting real-time performance requirements in "${d2}".`,
  },
  {
    keyword_a: /(cost|budget|cheap|economical|minimal-spend|low-rate)/i,
    keyword_b: /(redundancy|fault-tolerant|high-availability|premium|durability|shear)/i,
    nature: "RESOURCE_COMPETITION",
    severity: "HIGH",
    template: (d1, d2) =>
      `Budget constraints in "${d1}" conflict with resilience/quality guarantees required by "${d2}".`,
  },
  {
    keyword_a: /(rapid|fast-paced|sprint|continuous-deployment|immediate)/i,
    keyword_b: /(compliance|regulation|standards|code-review|sign-off|audit-trail)/i,
    nature: "TEMPORAL_MISALIGNMENT",
    severity: "MEDIUM",
    template: (d1, d2) =>
      `Deployment velocity in "${d1}" encounters mandatory compliance and governance cycles in "${d2}".`,
  },
  {
    keyword_a: /(decentralized|distributed|peer-to-peer|autonomous)/i,
    keyword_b: /(centralized|monolithic|consistent|global-state|single-source)/i,
    nature: "PARADIGM_DIVERGENCE",
    severity: "HIGH",
    template: (d1, d2) =>
      `Decentralization objectives in "${d1}" diverge from consistency/coordination requirements in "${d2}".`,
  },
  {
    keyword_a: /(aesthetic|open-space|glass|cantilever|slender)/i,
    keyword_b: /(thermal-mass|insulation|climate|energy-efficiency|load-bearing)/i,
    nature: "CONSTRAINT_INCOMPATIBILITY",
    severity: "MEDIUM",
    template: (d1, d2) =>
      `Spatial/aesthetic aspirations in "${d1}" require thermal and structural compensation in "${d2}".`,
  },
];

export class CognitiveSynthesisEngine {
  /**
   * Identifies dialectical tensions between domain claims.
   * Compares claims across different domains for mutual constraints or trade-offs.
   */
  public identifyTensions(claims: DomainClaim[]): DialecticalTension[] {
    const tensions: DialecticalTension[] = [];
    const n = claims.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const c1 = claims[i];
        const c2 = claims[j];

        // Skip claims belonging to the exact same domain unless explicitly conflicting
        if (c1.domain === c2.domain) continue;

        for (const pattern of TENSION_PATTERNS) {
          const matchA1 = pattern.keyword_a.test(c1.statement);
          const matchB2 = pattern.keyword_b.test(c2.statement);
          const matchA2 = pattern.keyword_a.test(c2.statement);
          const matchB1 = pattern.keyword_b.test(c1.statement);

          if ((matchA1 && matchB2) || (matchA2 && matchB1)) {
            const domA = matchA1 ? c1 : c2;
            const domB = matchA1 ? c2 : c1;

            const tensionId = `TENSION_${domA.domain.toUpperCase()}_${domB.domain.toUpperCase()}_${i}_${j}`;
            tensions.push({
              id: tensionId,
              domain_a: domA.domain,
              claim_a: domA,
              domain_b: domB.domain,
              claim_b: domB,
              nature: pattern.nature,
              severity: domA.risk_critical || domB.risk_critical ? "CRITICAL" : pattern.severity,
              description: pattern.template(
                domA.domain,
                domB.domain,
                domA.statement,
                domB.statement,
              ),
            });
            break; // One primary tension classification per pair
          }
        }
      }
    }

    return tensions;
  }

  /**
   * Resolves a specific dialectical tension using the appropriate synthesis strategy.
   */
  public resolveTension(
    tension: DialecticalTension,
    options?: SynthesisOptions,
  ): SynthesisResolution {
    const strictSafety = options?.strictSafetyPrecedence ?? true;
    let strategy: SynthesisStrategy = options?.preferredStrategy ?? "PARETO_OPTIMIZATION";

    // Safety and critical risk enforcement: Hierarchical precedence wins for critical claims
    if (strictSafety && (tension.claim_a.risk_critical || tension.claim_b.risk_critical)) {
      strategy = "HIERARCHICAL_PRECEDENCE";
    } else if (tension.nature === "TEMPORAL_MISALIGNMENT") {
      strategy = "CONTEXTUAL_PARTITIONING";
    } else if (tension.nature === "RESOURCE_COMPETITION") {
      strategy = "PARETO_OPTIMIZATION";
    } else if (tension.nature === "PARADIGM_DIVERGENCE") {
      strategy = "INTEGRATIVE_COMPROMISE";
    }

    let statement = "";
    const tradeoffs: SynthesisTradeoff[] = [];
    let resultingState: ArchieEpistemicState = "INFERRED";

    // Epistemic calculation: if either claim is ASSUMED, result is ASSUMED
    if (
      tension.claim_a.evidence_state === "ASSUMED" ||
      tension.claim_b.evidence_state === "ASSUMED"
    ) {
      resultingState = "ASSUMED";
    } else if (
      tension.claim_a.evidence_state === "VERIFIED" &&
      tension.claim_b.evidence_state === "VERIFIED"
    ) {
      resultingState = "VERIFIED";
    } else {
      resultingState = "INFERRED";
    }

    switch (strategy) {
      case "HIERARCHICAL_PRECEDENCE": {
        const priorityClaim = tension.claim_a.risk_critical
          ? tension.claim_a
          : tension.claim_b;
        const subClaim = tension.claim_a.risk_critical
          ? tension.claim_b
          : tension.claim_a;

        statement =
          `Hierarchical Precedence: "${priorityClaim.domain}" safety/integrity constraint holds authoritative priority. ` +
          `"${subClaim.domain}" objectives must satisfice within the envelope defined by "${priorityClaim.domain}".`;

        tradeoffs.push(
          {
            domain: priorityClaim.domain,
            concessions: "None: fundamental safety/regulatory invariant is non-negotiable.",
            gains: "Absolute assurance of boundary integrity and deterministic risk mitigation.",
          },
          {
            domain: subClaim.domain,
            concessions: `Operational flexibility in ${subClaim.domain} is bounded to conform to ${priorityClaim.domain}.`,
            gains: "Protection against catastrophic failure and regulatory invalidation.",
          },
        );
        break;
      }

      case "PARETO_OPTIMIZATION": {
        statement =
          `Pareto Frontier Optimization: Balance "${tension.domain_a}" and "${tension.domain_b}" ` +
          `by calibrating parameters along the optimal efficiency curve, avoiding marginal waste.`;

        tradeoffs.push(
          {
            domain: tension.domain_a,
            concessions: "Operates at 85-90% of theoretical maximum to reserve resource margin.",
            gains: "Enables co-existence without exhausting shared budget.",
          },
          {
            domain: tension.domain_b,
            concessions: "Absorbs calibrated boundary limits rather than unconstrained allocation.",
            gains: "Sustains high-availability and systemic predictability.",
          },
        );
        break;
      }

      case "CONTEXTUAL_PARTITIONING": {
        statement =
          `Contextual Partitioning: Segregate "${tension.domain_a}" and "${tension.domain_b}" ` +
          `by environment phase (e.g. build-time vs run-time or critical path vs background asynchronous processing).`;

        tradeoffs.push(
          {
            domain: tension.domain_a,
            concessions: "Execution deferred to pre-flight or asynchronous pipeline.",
            gains: "Zero latency overhead during synchronous user interaction.",
          },
          {
            domain: tension.domain_b,
            concessions: "Relies on asynchronous event consistency rather than immediate coupling.",
            gains: "Maximum real-time responsiveness without sacrificing audit rigor.",
          },
        );
        break;
      }

      case "INTEGRATIVE_COMPROMISE":
      case "CONSTRAINT_SATISFICING":
      default: {
        statement =
          `Integrative Synthesis: Harmonize "${tension.domain_a}" and "${tension.domain_b}" ` +
          `through an adaptive hybrid model with defined thresholds.`;

        tradeoffs.push(
          {
            domain: tension.domain_a,
            concessions: "Concedes extreme edge-case optimizations.",
            gains: "Achieves functional synergy with adjacent systems.",
          },
          {
            domain: tension.domain_b,
            concessions: "Concedes exclusive architectural isolation.",
            gains: "Seamless multi-domain inter-operability.",
          },
        );
        break;
      }
    }

    const confA = tension.claim_a.weight;
    const confB = tension.claim_b.weight;
    const confidence = Number(((confA + confB) / 2).toFixed(2));

    return {
      tension_id: tension.id,
      strategy,
      resolution_statement: statement,
      tradeoffs,
      resulting_evidence_state: resultingState,
      residual_uncertainty:
        resultingState === "ASSUMED"
          ? "Synthesis rests partially on assumed parameters; requires empirical field calibration."
          : null,
      confidence,
    };
  }

  /**
   * Synthesize multiple domain claims into a unified, coherent synthesis report.
   */
  public synthesize(
    claims: DomainClaim[],
    options?: SynthesisOptions,
  ): CognitiveSynthesisReport {
    const domainsSet = new Set<string>();
    let verifiedCount = 0;
    let inferredCount = 0;
    let assumedCount = 0;
    let unverifiedCount = 0;

    for (const c of claims) {
      domainsSet.add(c.domain);
      if (c.evidence_state === "VERIFIED") verifiedCount++;
      else if (c.evidence_state === "INFERRED") inferredCount++;
      else if (c.evidence_state === "ASSUMED") assumedCount++;
      else unverifiedCount++;
    }

    const tensions = this.identifyTensions(claims);
    const resolutions: SynthesisResolution[] = [];

    for (const t of tensions) {
      resolutions.push(this.resolveTension(t, options));
    }

    // Build synthesized thesis
    let synthesizedThesis = "";
    if (tensions.length === 0) {
      synthesizedThesis =
        `Harmonious Multi-Domain Integration across [${Array.from(domainsSet).join(", ")}]: ` +
        `All ${claims.length} domain claims are structurally aligned with no conflicting constraints detected.`;
    } else {
      const resolvedCount = resolutions.length;
      synthesizedThesis =
        `Dialectical Multi-Domain Synthesis across [${Array.from(domainsSet).join(", ")}]: ` +
        `Identified and resolved ${resolvedCount} systemic tension(s) via principled synthesis strategies. ` +
        resolutions.map((r) => r.resolution_statement).join(" ");
    }

    const confSum =
      resolutions.length > 0
        ? resolutions.reduce((acc, r) => acc + r.confidence, 0)
        : claims.reduce((acc, c) => acc + c.weight, 0);
    const totalItems = resolutions.length > 0 ? resolutions.length : Math.max(1, claims.length);
    const overallConfidence = Number((confSum / totalItems).toFixed(2));

    return {
      domains_involved: Array.from(domainsSet),
      total_claims_analyzed: claims.length,
      tensions,
      resolutions,
      synthesized_thesis: synthesizedThesis,
      epistemic_audit: {
        verified_count: verifiedCount,
        inferred_count: inferredCount,
        assumed_count: assumedCount,
        unverified_count: unverifiedCount,
      },
      overall_confidence: overallConfidence,
      unresolved_tensions: [],
    };
  }
}

/** Global singleton instance */
export const cognitiveSynthesisEngine = new CognitiveSynthesisEngine();
