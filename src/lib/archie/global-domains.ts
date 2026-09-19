// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — GLOBAL DOMAIN EXPANSION
//
// ARCHIE is a GENERAL intelligence, learning and reasoning
// platform that currently powers FRELUX. FRELUX is one
// environment ARCHIE serves — never the boundary of ARCHIE's
// intelligence.
//
// This expansion pack registers the global knowledge domains
// (engineering, computing, security, markets, product, …).
// Every domain inherits the SAME governance as the seeded
// registry: risk class decides the verification bar, no
// domain is auto-promoted past its bar, and the registry is
// data — never a fixed enum. New domains continue to be
// added through the existing DISCOVER → … → REGISTER
// lifecycle (domain-discovery.ts), reviewed by an admin.
// =========================================================

import type { ArchieDomain } from "./types";

/**
 * Global expansion domains. None are core. Risk classes:
 *  - STANDARD          — knowledge domains, normal governance
 *  - ENGINEERING_REVIEW — domains whose misuse has real-world
 *                         consequences (security, infrastructure)
 *  - DETERMINISTIC      — highest bar (never auto-promoted)
 */
export const GLOBAL_EXPANSION_DOMAINS: readonly ArchieDomain[] = [
  // ── Software engineering & computing ────────────────────
  {
    key: "programming_languages",
    label: "Programming Languages",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Language design, semantics, idioms and cross-language engineering reasoning.",
  },
  {
    key: "web_development",
    label: "Web Development",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Frontend/backend web engineering: HTML, CSS, JavaScript, TypeScript, frameworks and web platform standards.",
  },
  {
    key: "databases",
    label: "Databases & Data Engineering",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Relational and non-relational databases, schema design, query optimization, migrations and data modeling.",
  },
  {
    key: "api_design",
    label: "APIs & Integration",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "API architecture, REST/GraphQL/gRPC design, contracts, versioning and integration patterns.",
  },
  {
    key: "cloud_infrastructure",
    label: "Cloud Infrastructure & DevOps",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Cloud platforms, deployment, containers, CI/CD, observability and infrastructure-as-code.",
  },
  {
    key: "operating_systems",
    label: "Operating Systems",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "OS concepts, processes, memory, filesystems, shells and cross-platform engineering.",
  },
  {
    key: "networking",
    label: "Networking & Distributed Systems",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Network protocols, topologies, distributed-systems patterns and internet infrastructure.",
  },
  {
    key: "ai_ml",
    label: "AI & Machine Learning",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Machine learning concepts, model design, evaluation, and responsible AI engineering.",
  },
  {
    key: "automation",
    label: "Automation & Scripting",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Workflow automation, scripting, scheduled systems and integration tooling.",
  },
  {
    key: "emerging_technologies",
    label: "Emerging Technologies",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "New and evolving technology landscapes — always labeled with date and maturity.",
  },

  // ── Cybersecurity (authorized/defensive) ────────────────
  {
    key: "cybersecurity",
    label: "Cybersecurity",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Security engineering: secure architecture, cryptography, application security, hardening, monitoring and incident response. Operational testing is authorization-gated (authorized-security.ts).",
  },
  {
    key: "defensive_security",
    label: "Defensive Security Research",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Blue-team knowledge: detection, mitigation, hardening guidance, vulnerability remediation and defense-in-depth.",
  },
  {
    key: "penetration_testing",
    label: "Authorized Penetration Testing Methodology",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "AUTHORIZED-ONLY methodology: recon, enumeration, exploitation and reporting for targets covered by a recorded Owner authorization. Studied for defense; executed only within scope.",
  },
  {
    key: "vulnerability_research",
    label: "Vulnerability Research",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Vulnerability classes, root-cause analysis, exploit mechanics (studied for defense), CVE analysis and remediation — controlled environments only for any reproduction.",
  },
  {
    key: "secure_architecture",
    label: "Secure Architecture & Threat Modeling",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Threat modeling, attack-surface analysis, trust boundaries, secure design review and zero-trust patterns.",
  },

  // ── Mathematics & science ───────────────────────────────
  {
    key: "mathematics",
    label: "Mathematics",
    is_core: false,
    risk_class: "DETERMINISTIC",
    active: true,
    description:
      "Pure and applied mathematics, statistics and numerical methods. Highest verification bar; deterministic results are computed, never recalled from memory.",
  },

  // ── Markets, business & product ─────────────────────────
  {
    key: "global_markets",
    label: "Global Markets & Economics",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Global market research: construction/technology/property markets, supply chains, economic conditions. Every observation carries source, date and confidence; never silently converted to fact.",
  },
  {
    key: "economics",
    label: "Economics",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Economic reasoning: micro/macro concepts, regional differences and market dynamics.",
  },
  {
    key: "product_development",
    label: "Product Development",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Product discovery, strategy, roadmaps and validation methods.",
  },
  {
    key: "ux_ui",
    label: "UX / UI Design",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "User experience and interface design: usability, interaction design, accessibility and design systems.",
  },
  {
    key: "seo",
    label: "SEO & Web Visibility",
    is_core: false,
    risk_class: "STANDARD",
    active: true,
    description:
      "Search engine optimization, structured data, technical SEO and content discoverability.",
  },
  {
    key: "engineering",
    label: "General Engineering",
    is_core: false,
    risk_class: "ENGINEERING_REVIEW",
    active: true,
    description:
      "Cross-discipline engineering fundamentals spanning mechanical, civil, systems and applied engineering.",
  },
];

/** Security-sensitive domain keys whose OPERATIONAL use
 *  always requires a recorded authorization (see
 *  authorized-security.ts). Studying them is open; acting on
 *  real targets is not. */
export const AUTHORIZATION_GATED_DOMAINS: ReadonlySet<string> = new Set([
  "cybersecurity",
  "defensive_security",
  "penetration_testing",
  "vulnerability_research",
  "secure_architecture",
]);
