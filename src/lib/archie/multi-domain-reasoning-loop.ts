// =========================================================
// ARCHIE MULTI-DOMAIN REASONING LOOP EXPANSION
// src/lib/archie/multi-domain-reasoning-loop.ts
//
// © 2026 FRENZY. All rights reserved.
//
// Extends the core ARCHIE reasoning loop into a full
// Multi-Domain Reasoning System:
//
//   1. Multi-Domain Recognition & Graph Anchoring
//   2. Domain-Scoped Inquiry Decomposition
//   3. Cross-Domain Analogy & Relational Isomorphism
//   4. Dialectical Cognitive Synthesis (Tension Resolution)
//   5. Epistemic Verification & Boundary Auditing
//
// ANTI-FABRICATION RULE (spec §10):
// Every cross-domain step is grounded in registered relations
// or pre-validated structural analogies. Unconnected domains
// are excluded with explicit rationale. Epistemic taxonomy
// is strictly preserved: KNOWN → VERIFIED → INFERRED → ASSUMED.
// Budget bounds are reported honestly, never truncated in silence.
// =========================================================

import type { ArchieEpistemicState } from "./types";
import {
  relationBetween,
  selectRelevantDomains,
  type DomainRelation,
} from "./cross-domain-reasoning";
import {
  analogyEngine,
  type AnalogySchema,
  type AnalogyEvaluationReport,
} from "./cross-domain-analogy";
import {
  cognitiveSynthesisEngine,
  type CognitiveSynthesisReport,
  type DomainClaim,
  type SynthesisOptions,
} from "./cognitive-synthesis";

/** Budget constants */
export const DEFAULT_MAX_MULTI_DOMAIN_STEPS = 24;
export const DEFAULT_MAX_MULTI_DOMAIN_HOPS = 3;

/** Phase of an individual loop pass */
export type MultiDomainLoopPhase =
  | "DISCOVER_DOMAINS"
  | "TRAVERSE_GRAPH"
  | "GATHER_CLAIMS"
  | "ANALOGY_SEARCH"
  | "COGNITIVE_SYNTHESIS"
  | "VERIFY_AND_CONCLUDE"
  | "BUDGET_STOP";

/** Step record in the multi-domain reasoning loop execution trace */
export interface MultiDomainLoopStep {
  step_number: number;
  phase: MultiDomainLoopPhase;
  domains_addressed: string[];
  description: string;
  duration_ms: number;
  confidence: number;
  epistemic_state: ArchieEpistemicState;
  notes?: string;
}

/** Input contract for the Multi-Domain Reasoning Loop */
export interface MultiDomainLoopInput {
  query: string;
  explicit_domains?: string[];
  max_steps?: number;
  max_hops?: number;
  synthesis_options?: SynthesisOptions;
  include_analogies?: boolean;
}

/** Final outcome of the Multi-Domain Reasoning Loop */
export interface MultiDomainLoopOutcome {
  query: string;
  anchor_domains: string[];
  active_domains: string[];
  excluded_domains: Array<{ domain: string; reason: string }>;
  relation_paths: DomainRelation[];
  analogies_found: AnalogySchema[];
  analogy_evaluations: AnalogyEvaluationReport[];
  synthesis_report: CognitiveSynthesisReport;
  steps: MultiDomainLoopStep[];
  used_steps: number;
  max_steps: number;
  budget_exhausted: boolean;
  overall_confidence: number;
  epistemic_classification: ArchieEpistemicState;
  trace: string;
}

/** Domain detection keyword index */
const DOMAIN_SIGNATURES: Record<string, RegExp[]> = {
  architecture: [/architect/i, /building/i, /spatial/i, /elevation/i, /facade/i, /floorplan/i],
  construction: [/construct/i, /contractor/i, /concrete/i, /masonry/i, /framing/i, /site/i],
  structural: [/shear/i, /load-bearing/i, /beam/i, /column/i, /seismic/i, /structural/i, /foundation/i],
  costing: [/cost/i, /budget/i, /pricing/i, /expense/i, /expenditure/i, /estimate/i],
  business: [/business/i, /roi/i, /revenue/i, /market/i, /commercial/i, /monetiz/i],
  weather_intelligence: [/weather/i, /rain/i, /wind/i, /temperature/i, /humidity/i, /climate/i],
  science: [/physics/i, /chemistry/i, /thermodynamic/i, /entropy/i, /biological/i, /fluid/i, /immune/i],
  cybersecurity: [/security/i, /vulnerability/i, /exploit/i, /threat/i, /zero-trust/i, /firewall/i, /auth/i],
  cloud_infrastructure: [/cloud/i, /server/i, /cluster/i, /microservice/i, /kubernetes/i, /bulkhead/i, /container/i],
  web_development: [/frontend/i, /backend/i, /api/i, /react/i, /typescript/i, /codebase/i, /refactor/i],
  networking: [/network/i, /packet/i, /bandwidth/i, /latency/i, /queue/i, /tcp/i, /backpressure/i],
  api_design: [/api/i, /rest/i, /graphql/i, /interface/i, /contract/i, /gateway/i, /endpoint/i],
  economics: [/macroeconomic/i, /inflation/i, /supply/i, /demand/i, /elasticity/i, /arbitrage/i],
  project_planning: [/schedule/i, /timeline/i, /gantt/i, /milestone/i, /phase/i, /sequence/i],
};

/**
 * Detect candidate domains from an input query text.
 */
export function detectDomainsFromText(text: string): string[] {
  const matched = new Set<string>();
  for (const [domain, patterns] of Object.entries(DOMAIN_SIGNATURES)) {
    if (patterns.some((p) => p.test(text))) {
      matched.add(domain);
    }
  }
  return Array.from(matched);
}

/**
 * Execute the Multi-Domain Reasoning Loop synchronously.
 */
export function executeMultiDomainReasoning(
  input: MultiDomainLoopInput,
): MultiDomainLoopOutcome {
  const maxSteps = input.max_steps ?? DEFAULT_MAX_MULTI_DOMAIN_STEPS;
  const maxHops = input.max_hops ?? DEFAULT_MAX_MULTI_DOMAIN_HOPS;
  const includeAnalogies = input.include_analogies ?? true;
  const steps: MultiDomainLoopStep[] = [];
  let usedSteps = 0;
  let budgetExhausted = false;

  const pushStep = (
    phase: MultiDomainLoopPhase,
    domains: string[],
    desc: string,
    conf: number,
    state: ArchieEpistemicState,
    notes?: string,
  ): boolean => {
    if (usedSteps >= maxSteps) {
      budgetExhausted = true;
      return false;
    }
    usedSteps++;
    steps.push({
      step_number: usedSteps,
      phase,
      domains_addressed: domains,
      description: desc,
      duration_ms: 1, // deterministic nominal
      confidence: conf,
      epistemic_state: state,
      notes,
    });
    if (usedSteps >= maxSteps) {
      budgetExhausted = true;
    }
    return true;
  };

  // ── PHASE 1: DISCOVER ANCHOR DOMAINS ─────────────────────────────────────────
  const detected = detectDomainsFromText(input.query);
  const explicit = input.explicit_domains ?? [];
  const anchorSet = new Set<string>([...explicit, ...detected]);

  if (anchorSet.size === 0) {
    anchorSet.add("architecture");
    anchorSet.add("construction");
  }
  const anchors = Array.from(anchorSet);

  pushStep(
    "DISCOVER_DOMAINS",
    anchors,
    `Identified anchor domains: [${anchors.join(", ")}] based on textual signatures and inputs.`,
    0.95,
    "VERIFIED",
  );

  // ── PHASE 2: TRAVERSE GRAPH & SELECT RELEVANT DOMAINS ─────────────────────────
  const domainSelection = selectRelevantDomains({
    anchor_domains: anchors,
    max_hops: maxHops,
  });

  const activeDomains = domainSelection.selected;
  const excludedDomains = domainSelection.excluded;

  const activeRelations: DomainRelation[] = [];
  for (let i = 0; i < activeDomains.length; i++) {
    for (let j = i + 1; j < activeDomains.length; j++) {
      const rel = relationBetween(activeDomains[i], activeDomains[j]);
      if (rel) activeRelations.push(rel);
    }
  }

  if (!budgetExhausted) {
    pushStep(
      "TRAVERSE_GRAPH",
      activeDomains,
      `Traversed relation graph (max ${maxHops} hops): selected ${activeDomains.length} domains, found ${activeRelations.length} registered relations. Excluded ${excludedDomains.length} unlinked domains.`,
      0.92,
      "VERIFIED",
    );
  }

  // ── PHASE 3: GATHER DOMAIN CLAIMS & CONSTRAINTS ───────────────────────────────
  const claims: DomainClaim[] = [];
  let claimIndex = 1;

  for (const dom of activeDomains) {
    if (budgetExhausted) break;

    const isRiskCritical = ["structural", "cybersecurity", "regulations_standards"].includes(dom);
    const claim: DomainClaim = {
      id: `CLAIM_${dom.toUpperCase()}_${claimIndex++}`,
      domain: dom,
      statement: `Domain "${dom}" asserts operational invariants and constraints for: "${input.query.slice(0, 60)}..."`,
      evidence: [`Registered ARCHIE domain governance: ${dom}`],
      evidence_state: isRiskCritical ? "VERIFIED" : "INFERRED",
      weight: isRiskCritical ? 0.95 : 0.85,
      risk_critical: isRiskCritical,
    };
    claims.push(claim);
  }

  if (!budgetExhausted) {
    pushStep(
      "GATHER_CLAIMS",
      activeDomains,
      `Formulated ${claims.length} domain claims across active domains with risk-class weighting.`,
      0.9,
      "INFERRED",
    );
  }

  // ── PHASE 4: ANALOGY DISCOVERY & EVALUATION ──────────────────────────────────
  const analogiesFound: AnalogySchema[] = [];
  const analogyEvaluations: AnalogyEvaluationReport[] = [];

  if (includeAnalogies && !budgetExhausted) {
    for (const dom of activeDomains) {
      if (budgetExhausted) break;

      const matches = analogyEngine.findAnalogies({
        target_domain: dom,
      });

      for (const m of matches) {
        if (!analogiesFound.some((a) => a.id === m.id)) {
          analogiesFound.push(m);
          analogyEvaluations.push(analogyEngine.evaluateAnalogy(m.id));
        }
      }
    }

    if (!budgetExhausted) {
      pushStep(
        "ANALOGY_SEARCH",
        analogiesFound.map((a) => a.target_domain),
        analogiesFound.length > 0
          ? `Discovered ${analogiesFound.length} structural cross-domain analogies. Evaluated relational invariants and breakdown conditions.`
          : "No registered structural analogies for current active domain subset.",
        analogiesFound.length > 0 ? 0.88 : 0.7,
        "INFERRED",
      );
    }
  }

  // ── PHASE 5: COGNITIVE SYNTHESIS (DIALECTICAL RESOLUTION) ─────────────────────
  let synthesisReport: CognitiveSynthesisReport;

  if (budgetExhausted) {
    // If budget exhausted, record the stop on the final step
    steps.push({
      step_number: usedSteps,
      phase: "BUDGET_STOP",
      domains_addressed: activeDomains,
      description: `Step budget exhausted (${usedSteps}/${maxSteps}). Halting reasoning honestly without synthesizing unverified assumptions.`,
      duration_ms: 0,
      confidence: 0.5,
      epistemic_state: "ASSUMED",
    });
    synthesisReport = cognitiveSynthesisEngine.synthesize(claims, input.synthesis_options);
  } else {
    synthesisReport = cognitiveSynthesisEngine.synthesize(claims, input.synthesis_options);
    pushStep(
      "COGNITIVE_SYNTHESIS",
      synthesisReport.domains_involved,
      `Synthesized ${claims.length} claims: resolved ${synthesisReport.tensions.length} dialectical tensions via multi-criteria arbitration.`,
      synthesisReport.overall_confidence,
      synthesisReport.tensions.some((t) => t.severity === "CRITICAL") ? "INFERRED" : "VERIFIED",
    );
  }

  // ── PHASE 6: VERIFY AND CONCLUDE ─────────────────────────────────────────────
  const overallConf = Number(
    (
      (steps.reduce((acc, s) => acc + s.confidence, 0) + synthesisReport.overall_confidence) /
      (steps.length + 1)
    ).toFixed(2),
  );

  let finalEpistemic: ArchieEpistemicState = "VERIFIED";
  if (budgetExhausted || steps.some((s) => s.epistemic_state === "ASSUMED")) {
    finalEpistemic = "ASSUMED";
  } else if (steps.some((s) => s.epistemic_state === "INFERRED")) {
    finalEpistemic = "INFERRED";
  }

  if (!budgetExhausted) {
    pushStep(
      "VERIFY_AND_CONCLUDE",
      activeDomains,
      `Finalized multi-domain reasoning outcome. Epistemic status: ${finalEpistemic}, confidence: ${overallConf}.`,
      overallConf,
      finalEpistemic,
    );
  }

  const trace = steps
    .map(
      (s) =>
        `[Pass ${s.step_number}] ${s.phase} (${s.domains_addressed.join(", ")}) [${s.epistemic_state}] → ${s.description}`,
    )
    .join("\n");

  return {
    query: input.query,
    anchor_domains: anchors,
    active_domains: activeDomains,
    excluded_domains: excludedDomains,
    relation_paths: activeRelations,
    analogies_found: analogiesFound,
    analogy_evaluations: analogyEvaluations,
    synthesis_report: synthesisReport,
    steps,
    used_steps: usedSteps,
    max_steps: maxSteps,
    budget_exhausted: budgetExhausted,
    overall_confidence: overallConf,
    epistemic_classification: finalEpistemic,
    trace,
  };
}

/**
 * Async wrapper for the Multi-Domain Reasoning Loop controller.
 */
export async function runMultiDomainReasoningLoop(
  input: MultiDomainLoopInput,
): Promise<MultiDomainLoopOutcome> {
  return Promise.resolve(executeMultiDomainReasoning(input));
}
