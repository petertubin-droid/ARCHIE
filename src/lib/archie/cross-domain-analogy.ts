// =========================================================
// ARCHIE CROSS-DOMAIN ANALOGY ENGINE
// src/lib/archie/cross-domain-analogy.ts
//
// © 2026 FRENZY. All rights reserved.
//
// Identifies and maps structural isomorphisms across domains.
// Rather than superficial surface similarities, this engine
// extracts RELATIONAL INVARIANTS (formal analogical mapping)
// between source and target systems:
//
//   Source Domain (e.g. Immunology)
//     ↓ [Structural Alignment: relational invariants]
//   Target Domain (e.g. Cybersecurity)
//     ↓ [Transferred Solution Hypothesis]
//   Boundary & Breakdown Analysis (where the analogy FAILS)
//
// EPISTEMIC INTEGRITY (spec §10):
// Analogical insights are NEVER fabricated as established facts.
// They are explicitly classified as INFERRED or ASSUMED
// (hypotheses), with breakdown conditions surfaced up front
// to prevent false equivalence or over-extension.
// =========================================================

import type { ArchieEpistemicState } from "./types";
import { assertRelationJustified, relationBetween } from "./cross-domain-reasoning";

/** High-level systemic schema category. */
export type AnalogyCategory =
  | "RESILIENCE_AND_DEFENSE"
  | "STRUCTURAL_INTEGRITY"
  | "SYSTEMIC_FLOW"
  | "EQUILIBRIUM_AND_FEEDBACK"
  | "RESOURCE_ALLOCATION"
  | "EVOLUTIONARY_ADAPTATION";

/** A mapped relational invariant connecting elements across domains. */
export interface RelationalMapping {
  source_element: string;
  target_element: string;
  relation: string;
  explanation: string;
}

/** Operational solution heuristic transferred across the boundary. */
export interface SolutionTransfer {
  mechanism: string;
  heuristic: string;
  operational_value: string;
}

/** Boundary analysis: explicit conditions under which the analogy breaks down. */
export interface AnalogyBreakdown {
  breakdown_points: string[];
  false_equivalence_risks: string[];
  invalid_assumptions: string[];
}

/** Complete structurally validated cross-domain analogy schema. */
export interface AnalogySchema {
  id: string;
  name: string;
  description: string;
  category: AnalogyCategory;
  source_domain: string;
  target_domain: string;
  core_mechanism: string;
  relational_mappings: RelationalMapping[];
  solution_transfer: SolutionTransfer;
  boundary_conditions: AnalogyBreakdown;
  epistemic_status: ArchieEpistemicState; // Always "INFERRED" | "ASSUMED"
  structural_confidence: number; // 0..1
}

/** Evaluation report measuring structural validity of an analogy candidate. */
export interface AnalogyEvaluationReport {
  analogy_id: string;
  source_domain: string;
  target_domain: string;
  structural_score: number;
  relational_depth: number;
  breakdown_severity: "LOW" | "MODERATE" | "HIGH";
  epistemic_classification: ArchieEpistemicState;
  viable: boolean;
  recommendation: string;
}

/** Request query for analogy discovery. */
export interface AnalogySearchQuery {
  target_domain?: string;
  source_domain?: string;
  category?: AnalogyCategory;
  keyword?: string;
  min_confidence?: number;
}

/**
 * Pre-registered, structurally validated cross-domain analogies.
 * Grounded in formal systemic patterns across disciplines.
 */
export const REGISTERED_ANALOGIES: readonly AnalogySchema[] = [
  {
    id: "ANALOGY_IMMUNE_DEFENSE_TO_CYBERSECURITY",
    name: "Immune Self-NonSelf Discrimination to Zero-Trust Cyber Defense",
    description:
      "Biological immune surveillance maps structurally to distributed zero-trust cybersecurity architectures.",
    category: "RESILIENCE_AND_DEFENSE",
    source_domain: "science",
    target_domain: "cybersecurity",
    core_mechanism:
      "Continuous distributed verification of identity and anomaly detection without relying on a static perimeter.",
    relational_mappings: [
      {
        source_element: "Self vs Non-Self Surface Antigens",
        target_element: "Cryptographic Identity & Mutual TLS Attestation",
        relation: "identifies_entity",
        explanation:
          "Entities are validated by intrinsic molecular or cryptographic signatures rather than spatial location.",
      },
      {
        source_element: "Dendritic Antigen Presentation",
        target_element: "Telemetry Ingestion & SIEM Threat Intelligence",
        relation: "presents_telemetry",
        explanation:
          "Sensors sample context and present candidate threat vectors to centralized reasoning nodes.",
      },
      {
        source_element: "Memory B-Cells & Somatic Antibodies",
        target_element: "Threat Signature Databases & Automated Firewall Rules",
        relation: "caches_defensive_response",
        explanation:
          "Past attack vectors are compiled into rapid-lookup defensive rules to prevent recurrent compromise.",
      },
      {
        source_element: "Phagocytic Macrophages",
        target_element: "Automated Quarantine Sandboxes & Process Termination",
        relation: "isolates_and_neutralizes",
        explanation:
          "Compromised or anomalous elements are sequestered before cascading propagation can occur.",
      },
    ],
    solution_transfer: {
      mechanism: "Decentralized adaptive response with central memory consolidation.",
      heuristic:
        "Assume breach: defend from within every subsystem rather than trusting an external perimeter boundary.",
      operational_value:
        "Reduces mean-time-to-containment (MTTC) by isolating malicious actors at the point of origin.",
    },
    boundary_conditions: {
      breakdown_points: [
        "Biological mutations occur stochastically through natural selection; cyber attacks feature deliberate, adaptive, intelligent human adversaries.",
        "Autoimmune reactions in biology damage healthy tissue; false positives in security trigger operational downtime.",
      ],
      false_equivalence_risks: [
        "Treating every unknown packet as a pathogen causes complete denial of service.",
        "Over-indexing on past signatures fails against novel zero-day exploits.",
      ],
      invalid_assumptions: [
        "Assuming digital systems have infinite autonomous regeneration like living tissue.",
      ],
    },
    epistemic_status: "INFERRED",
    structural_confidence: 0.91,
  },
  {
    id: "ANALOGY_STRUCTURAL_SHEAR_TO_DISTRIBUTED_ISOLATION",
    name: "Structural Shear Walls to Microservice Bulkhead Isolation",
    description:
      "Seismic and wind shear resistance in structural engineering maps to fault isolation and load shedding in distributed systems.",
    category: "STRUCTURAL_INTEGRITY",
    source_domain: "structural",
    target_domain: "cloud_infrastructure",
    core_mechanism:
      "Partitioning total load and containing catastrophic failure within isolated physical or architectural boundaries.",
    relational_mappings: [
      {
        source_element: "Reinforced Concrete Shear Walls",
        target_element: "Bulkhead Resource Pools & Process Isolation",
        relation: "resists_lateral_force",
        explanation:
          "Rigid partitions absorb localized stress without transferring bending moments to adjacent structures.",
      },
      {
        source_element: "Expansion Joints & Seismic Dampers",
        target_element: "Circuit Breakers & Backpressure Buffers",
        relation: "dissipates_excess_energy",
        explanation:
          "Controlled give in the interface dissipates peak load spikes without structural collapse.",
      },
      {
        source_element: "Progressive Collapse Prevention (Tie Beams)",
        target_element: "Graceful Degradation & Fallback Defaults",
        relation: "prevents_cascading_failure",
        explanation:
          "If one column or service fails, alternate load paths sustain core equilibrium.",
      },
    ],
    solution_transfer: {
      mechanism: "Rigid boundary partitioning combined with elastic stress dissipation.",
      heuristic:
        "Isolate failure domains so that localized overload never triggers systemic collapse.",
      operational_value:
        "Guarantees system availability for non-degraded services under 99th percentile traffic surges.",
    },
    boundary_conditions: {
      breakdown_points: [
        "Physical structural mechanics govern continuous static/dynamic forces; distributed systems encounter discrete packet loss and network partitions (CAP theorem).",
        "Physical buildings are fixed in space; cloud nodes can horizontally scale dynamically on demand.",
      ],
      false_equivalence_risks: [
        "Assuming software partitions can absorb infinite queue backpressure without out-of-memory crashes.",
      ],
      invalid_assumptions: [
        "Assuming software degradation is always graceful without explicit fallback handlers.",
      ],
    },
    epistemic_status: "INFERRED",
    structural_confidence: 0.88,
  },
  {
    id: "ANALOGY_VASCULAR_FLOW_TO_QUEUE_BACKPRESSURE",
    name: "Hemodynamic Resistance to Streaming Queue Flow Control",
    description:
      "Fluid pressure gradients, laminar flow, and vascular compliance map to asynchronous queue buffering and backpressure control.",
    category: "SYSTEMIC_FLOW",
    source_domain: "science",
    target_domain: "networking",
    core_mechanism:
      "Dynamic volumetric flow control responding to pressure differentials across conduits.",
    relational_mappings: [
      {
        source_element: "Blood Viscosity & Vessel Lumen Radius",
        target_element: "Network Bandwidth & Serialization Overhead",
        relation: "determines_throughput_resistance",
        explanation:
          "Poiseuille's law mirrors network latency and bandwidth limits as resistance to volumetric throughput.",
      },
      {
        source_element: "Arterial Elastic Compliance",
        target_element: "Buffer Ring & FIFO Message Queues",
        relation: "absorbs_pulsatile_peaks",
        explanation:
          "Elastic reservoirs smooth out pulsatile peaks into uniform downstream flow.",
      },
      {
        source_element: "Baroreceptor Reflex (Vasoconstriction)",
        target_element: "TCP Window Scaling & Token Bucket Throttling",
        relation: "regulates_upstream_rate",
        explanation:
          "Downstream pressure sensors signal upstream producers to throttle ingress rates.",
      },
    ],
    solution_transfer: {
      mechanism: "Upstream throttling triggered by downstream buffer saturation.",
      heuristic:
        "Never drop payload silently: push resistance backward toward the source producer.",
      operational_value:
        "Prevents unhandled queue overflow and preserves pipeline predictability under variable ingress.",
    },
    boundary_conditions: {
      breakdown_points: [
        "Biological blood flow is closed and conserved; digital network packets can be duplicated or dropped arbitrarily.",
        "Physical fluid dynamics are continuous; message streaming deals with discrete packet framing.",
      ],
      false_equivalence_risks: [
        "Sizing buffers too large causes bufferbloat, destroying real-time responsiveness.",
      ],
      invalid_assumptions: [
        "Assuming all consumer processes process messages at steady laminar rates.",
      ],
    },
    epistemic_status: "INFERRED",
    structural_confidence: 0.86,
  },
  {
    id: "ANALOGY_THERMODYNAMIC_ENTROPY_TO_CODE_DEGRADATION",
    name: "Thermodynamic Entropy to Software Architecture Drift",
    description:
      "Second law of thermodynamics (entropy increases in closed systems) maps to software bitrot, architectural erosion, and maintenance debt.",
    category: "EQUILIBRIUM_AND_FEEDBACK",
    source_domain: "science",
    target_domain: "web_development",
    core_mechanism:
      "Spontaneous degradation of organized structure toward maximum disorder unless active maintenance energy is continuously injected.",
    relational_mappings: [
      {
        source_element: "Microstate Disorder (Boltzmann Entropy)",
        target_element: "Implicit Coupling, Zombie Code, and Outdated Dependencies",
        relation: "measures_systemic_chaos",
        explanation:
          "Unmanaged codebases accumulate disordered states that increase the energy needed for any subsequent modification.",
      },
      {
        source_element: "Exogenous Work Input (Enthalpy)",
        target_element: "Continuous Refactoring, Automated Testing, and Linter Enforcement",
        relation: "restores_organized_state",
        explanation:
          "Sustaining clean architectural boundaries requires continuous expenditure of developer and CI effort.",
      },
      {
        source_element: "Phase Transition Threshold",
        target_element: "Legacy Lock-In / Unmaintainability Horizon",
        relation: "marks_structural_crystallization",
        explanation:
          "Past a critical entropy threshold, modifying the system incurs disproportionate non-linear failure rates.",
      },
    ],
    solution_transfer: {
      mechanism: "Proactive, continuous energy injection to suppress structural entropy.",
      heuristic:
        "Treat refactoring as a thermodynamic necessity, not a luxury: unmaintained code invariably degenerates.",
      operational_value:
        "Keeps lead-time for changes low and prevents architectural bankruptcies.",
    },
    boundary_conditions: {
      breakdown_points: [
        "Thermodynamic entropy is a fundamental law of physics; software entropy is sociotechnical and bounded by discipline and tooling.",
        "Physical closed systems cannot escape entropy; software systems can be cleanly rewritten or modularly replaced.",
      ],
      false_equivalence_risks: [
        "Premature refactoring of stable, working code under the guise of entropy reduction.",
      ],
      invalid_assumptions: [
        "Assuming entropy accumulates uniformly across all code files.",
      ],
    },
    epistemic_status: "INFERRED",
    structural_confidence: 0.85,
  },
  {
    id: "ANALOGY_URBAN_ZONING_TO_SYSTEM_MODULARITY",
    name: "Urban Municipal Zoning to Software Separation of Concerns",
    description:
      "Municipal zoning laws, thoroughfares, and utilities map to decoupled domain boundaries and interface segregation.",
    category: "RESOURCE_ALLOCATION",
    source_domain: "architecture",
    target_domain: "api_design",
    core_mechanism:
      "Segregation of incompatible activities while providing standardized public access corridors.",
    relational_mappings: [
      {
        source_element: "Zoning Classification (Residential vs Industrial)",
        target_element: "Domain Segregation (Core Business Logic vs External Integrations)",
        relation: "separates_incompatible_concerns",
        explanation:
          "Industrial/heavy computation is quarantined from user-facing interactive surfaces.",
      },
      {
        source_element: "Public Right-of-Way & Transit Arterials",
        target_element: "Standardized REST/GraphQL API Gateway & Event Bus",
        relation: "channels_public_traffic",
        explanation:
          "Internal services communicate through regulated corridors with explicit capacity constraints.",
      },
      {
        source_element: "Building Codes & Safety Setbacks",
        target_element: "Schema Validation & Input Sanitization",
        relation: "enforces_structural_compliance",
        explanation:
          "Constructs entering the shared space must strictly satisfy regulatory invariants.",
      },
    ],
    solution_transfer: {
      mechanism: "Explicit boundary demarcation with standardized transit corridors.",
      heuristic:
        "Never allow unrestricted lateral access between domains: route all cross-cutting dependencies through defined gateways.",
      operational_value:
        "Prevents spaghetti dependencies and allows independent evolution of domain subsystems.",
    },
    boundary_conditions: {
      breakdown_points: [
        "Physical land is geographically scarce and immutable; software modules can be replicated, cloned, and virtualized infinitely.",
        "Urban infrastructure changes take decades; software architectures can deploy in seconds.",
      ],
      false_equivalence_risks: [
        "Over-zoning creates excessive network hops and microservice serialization tax.",
      ],
      invalid_assumptions: [
        "Assuming static zoning maps are permanent and never need schema evolution.",
      ],
    },
    epistemic_status: "INFERRED",
    structural_confidence: 0.87,
  },
];

/**
 * Cross-Domain Analogy Engine.
 * Implements structural isomorphism lookup, alignment evaluation, and breakdown analysis.
 */
export class CrossDomainAnalogyEngine {
  private analogies: Map<string, AnalogySchema> = new Map();

  constructor(customAnalogies?: AnalogySchema[]) {
    for (const a of REGISTERED_ANALOGIES) {
      this.analogies.set(a.id, a);
    }
    if (customAnalogies) {
      for (const a of customAnalogies) {
        this.analogies.set(a.id, a);
      }
    }
  }

  /**
   * Search registered analogies by domain, category, keyword, or confidence.
   */
  public findAnalogies(query: AnalogySearchQuery): AnalogySchema[] {
    const minConf = query.min_confidence ?? 0.0;
    const qLower = query.keyword?.toLowerCase().trim();

    return Array.from(this.analogies.values()).filter((schema) => {
      if (schema.structural_confidence < minConf) return false;
      if (query.source_domain && schema.source_domain !== query.source_domain) {
        return false;
      }
      if (query.target_domain && schema.target_domain !== query.target_domain) {
        return false;
      }
      if (query.category && schema.category !== query.category) {
        return false;
      }
      if (qLower) {
        const matchesName = schema.name.toLowerCase().includes(qLower);
        const matchesDesc = schema.description.toLowerCase().includes(qLower);
        const matchesMechanism = schema.core_mechanism.toLowerCase().includes(qLower);
        const matchesMappings = schema.relational_mappings.some(
          (m) =>
            m.source_element.toLowerCase().includes(qLower) ||
            m.target_element.toLowerCase().includes(qLower) ||
            m.explanation.toLowerCase().includes(qLower),
        );
        if (!matchesName && !matchesDesc && !matchesMechanism && !matchesMappings) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Look up a specific analogy by its canonical ID.
   */
  public getAnalogy(id: string): AnalogySchema | undefined {
    return this.analogies.get(id);
  }

  /**
   * Evaluate the structural validity and boundary breakdown of an analogy.
   * Enforces the anti-fabrication mandate: analogies are hypotheses, never settled facts.
   */
  public evaluateAnalogy(schemaId: string): AnalogyEvaluationReport {
    const schema = this.analogies.get(schemaId);
    if (!schema) {
      return {
        analogy_id: schemaId,
        source_domain: "unknown",
        target_domain: "unknown",
        structural_score: 0,
        relational_depth: 0,
        breakdown_severity: "HIGH",
        epistemic_classification: "UNKNOWN",
        viable: false,
        recommendation: `Analogy "${schemaId}" is not registered. Never fabricate unregistered analogies.`,
      };
    }

    const mappingDepth = schema.relational_mappings.length;
    const breakdownPoints = schema.boundary_conditions.breakdown_points.length;
    const falseEquivRisks = schema.boundary_conditions.false_equivalence_risks.length;

    // A strong analogy has deep relational depth (> 2 mappings) and honest breakdown boundaries
    const score = Math.min(
      1.0,
      schema.structural_confidence * (mappingDepth >= 3 ? 1.0 : 0.8),
    );

    const severity: "LOW" | "MODERATE" | "HIGH" =
      falseEquivRisks > 2 ? "HIGH" : breakdownPoints > 1 ? "MODERATE" : "LOW";

    return {
      analogy_id: schema.id,
      source_domain: schema.source_domain,
      target_domain: schema.target_domain,
      structural_score: Number(score.toFixed(2)),
      relational_depth: mappingDepth,
      breakdown_severity: severity,
      epistemic_classification: schema.epistemic_status,
      viable: score >= 0.7 && mappingDepth >= 2,
      recommendation:
        `Valid analogical transfer with ${mappingDepth} relational mappings. ` +
        `Apply heuristic: "${schema.solution_transfer.heuristic}". ` +
        `CAUTION: Observe breakdown conditions: ${schema.boundary_conditions.breakdown_points[0]}`,
    };
  }

  /**
   * Map an analogy dynamically between two registered domains.
   * Requires that a relation exists between the domains or an intermediate registered domain,
   * preserving the anti-fabrication rule.
   */
  public mapCrossDomainHypothesis(input: {
    source_domain: string;
    target_domain: string;
    source_problem: string;
    target_problem: string;
    rationale: string;
  }): { ok: true; analogy: AnalogySchema } | { ok: false; error: string } {
    // Check whether an analogy already exists between these domains
    const existing = this.findAnalogies({
      source_domain: input.source_domain,
      target_domain: input.target_domain,
    });
    if (existing.length > 0) {
      return { ok: true, analogy: existing[0] };
    }

    // Anti-fabrication check: Is there a legitimate registered path in DOMAIN_RELATIONS?
    const directRel = relationBetween(input.source_domain, input.target_domain);
    if (!directRel) {
      return {
        ok: false,
        error:
          `No registered relation path between "${input.source_domain}" and "${input.target_domain}". ` +
          `Cross-domain analogies require registered relational ground; analogy transfer is never fabricated.`,
      };
    }

    const custom: AnalogySchema = {
      id: `ANALOGY_DYNAMIC_${input.source_domain.toUpperCase()}_TO_${input.target_domain.toUpperCase()}`,
      name: `${input.source_domain} to ${input.target_domain} Relational Alignment`,
      description: input.rationale,
      category: "SYSTEMIC_FLOW",
      source_domain: input.source_domain,
      target_domain: input.target_domain,
      core_mechanism: directRel.rationale,
      relational_mappings: [
        {
          source_element: input.source_problem,
          target_element: input.target_problem,
          relation: directRel.relation,
          explanation: directRel.rationale,
        },
      ],
      solution_transfer: {
        mechanism: directRel.rationale,
        heuristic: `Translate structural patterns from ${input.source_domain} through relation "${directRel.relation}".`,
        operational_value: `Heuristic guidance for ${input.target_domain} problem formulation.`,
      },
      boundary_conditions: {
        breakdown_points: [
          `Domain boundary between ${input.source_domain} and ${input.target_domain} involves distinct domain invariants.`,
        ],
        false_equivalence_risks: [
          `Do not conflate operational mechanics in ${input.source_domain} with formal verification in ${input.target_domain}.`,
        ],
        invalid_assumptions: [
          `Assuming 1:1 mathematical isomorphism without empirical validation.`,
        ],
      },
      epistemic_status: "ASSUMED",
      structural_confidence: 0.72,
    };

    return { ok: true, analogy: custom };
  }
}

/** Global singleton instance */
export const analogyEngine = new CrossDomainAnalogyEngine();
