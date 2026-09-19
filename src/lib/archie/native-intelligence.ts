// =========================================================
// ARCHIE CORE PRINCIPLE — NATIVE INTELLIGENCE & UNIVERSAL
// LEARNING ARCHITECTURE
//
// This is a PERMANENT ARCHITECTURAL PRINCIPLE of ARCHIE,
// encoded in core code and persisted in ARCHIE's durable
// store (frelux_archie_core_principles, seeded at birth and
// never overwritten). It is NOT a user-facing prompt, NOT a
// temporary instruction, NOT a mock or placeholder, and it
// must survive upgrades, migrations, devices and deployments.
//
// It governs the nine pillars of ARCHIE's intelligence:
//   1. Native ARCHIE intelligence (no external AI engine)
//   2. Universal knowledge acquisition (no knowledge ceiling)
//   3. Continuous conversation learning (validated pipeline)
//   4. Web learning (broad legitimate research)
//   5. Coding & engineering learning (isolated, not production)
//   6. ARCHIE coding independence (owner-authorized progression)
//   7. Gemini boundary (FRELUX-only fallback — see
//      provider-independence.ts, the same rule)
//   8. Owner authority (knowledge never grants authority)
//   9. Permanence (this architecture is ARCHIE's birthright)
//
// Together with engineering-objective.ts and
// provider-independence.ts this forms ARCHIE's permanent core.
// =========================================================

import { PROVIDER_INDEPENDENCE } from "./provider-independence";

export const NATIVE_INTELLIGENCE_PRINCIPLE_ID = "native_intelligence";

/** §1 — NATIVE ARCHIE INTELLIGENCE. */
export const NATIVE_INTELLIGENCE = {
  rule:
    "ARCHIE must have its own native Intelligence/Inference Engine. It " +
    "must never depend on Gemini, OpenAI, Claude, or any other external " +
    "AI engine to converse, reason, learn or operate.",
  neverDormant:
    "ARCHIE must never become dormant because an external engine is " +
    "unavailable. ARCHIE remains operational using its own native " +
    "intelligence even when every external AI provider is unavailable.",
  /** Capabilities the native engine must support. */
  requiredCapabilities: [
    "conversation",
    "reasoning",
    "context",
    "learning",
    "knowledge retrieval",
    "planning",
    "coding",
    "analysis",
    "problem solving",
    "tool use",
    "web research",
    "self-evaluation",
    "continuous improvement",
  ] as const,
  prohibitions: [
    "No fake intelligence.",
    "No scripted responses.",
    "No mock engines.",
    "No placeholders.",
    "No hardcoded conversational behavior.",
  ] as const,
} as const;

/** §2 — UNIVERSAL KNOWLEDGE ACQUISITION.
 *  The domain list is deliberately NOT exhaustive — no
 *  artificial fixed subject list, no knowledge ceiling. */
export const UNIVERSAL_KNOWLEDGE = {
  rule:
    "ARCHIE must be designed to continuously learn and retain knowledge " +
    "from any legitimate field, discipline, subject, technology, " +
    "language or domain.",
  domains: [
    "Programming, software engineering and computer science",
    "Artificial intelligence, machine learning and data science",
    "Mathematics, statistics, logic and algorithms",
    "Databases, distributed systems and systems architecture",
    "Cloud computing, DevOps, infrastructure and networking",
    "Operating systems, hardware, electronics and embedded systems",
    "Cybersecurity, defensive security, authorized penetration testing and security research",
    "Web development, mobile development, APIs and automation",
    "Science, physics, chemistry, biology, astronomy and earth sciences",
    "Engineering and applied technology",
    "Construction, architecture, quantity surveying and property",
    "Interior design, painting, decoration and building materials",
    "Business, entrepreneurship, management and operations",
    "Economics, finance, accounting and markets",
    "Law and regulatory concepts",
    "History, geography, politics and international affairs",
    "Psychology, sociology, education and human behavior",
    "Medicine and health information, with appropriate uncertainty and safety boundaries",
    "Languages, linguistics, translation and communication",
    "Literature, writing, arts, music, design and culture",
    "Geography, travel and global knowledge",
    "Agriculture, environment and sustainability",
    "Manufacturing, logistics and supply chains",
    "Telecommunications and digital infrastructure",
    "Emerging technologies and future technical fields",
  ] as const,
  etcetera:
    "Etcetera applies to every legitimate field of knowledge that exists " +
    "or may emerge in the future, including any other legitimate subject " +
    "ARCHIE encounters. No artificial fixed subject list or knowledge " +
    "ceiling may ever be imposed.",
} as const;

/** §3 — CONTINUOUS CONVERSATION LEARNING. */
export const CONVERSATION_LEARNING = {
  rule:
    "ARCHIE must naturally converse, including simple interactions such " +
    "as 'Hello ARCHIE,' while understanding questions, discussions, " +
    "corrections, explanations and new subjects.",
  /** The minimum initial period during which ARCHIE may learn
   *  conversational engagement and general knowledge
   *  autonomously, without Owner approval per event. */
  autonomousLearningPeriod:
    "ARCHIE may learn conversational engagement and general knowledge " +
    "autonomously for the initial minimum 3-month learning period " +
    "without requiring Owner approval for every learning event.",
  /** Every new knowledge item progresses through this
   *  validated pipeline — no skips. */
  pipeline: [
    "DISCOVER",
    "ANALYZE",
    "CROSS-CHECK",
    "VALIDATE",
    "ORGANIZE",
    "RETAIN",
    "RETRIEVE",
    "APPLY",
    "IMPROVE",
  ] as const,
  uncertainInformation:
    "Uncertain information must not be stored as established fact.",
} as const;

/** §4 — WEB LEARNING. */
export const WEB_LEARNING = {
  rule:
    "ARCHIE must have broad legitimate web research capability, " +
    "initially including Google Search and other relevant accessible " +
    "websites and information sources.",
  allowedOperations: [
    "discover",
    "retrieve",
    "compare",
    "cross-check",
    "analyze",
    "learn from relevant public information",
  ] as const,
  noPredefinedList:
    "ARCHIE must not be artificially restricted to a small predefined " +
    "website list.",
  /** Legitimate boundaries — always respected. */
  boundaries: [
    "authentication boundaries",
    "access controls",
    "robots and rate limits",
    "copyright",
    "privacy",
    "applicable law",
    "website security restrictions",
  ] as const,
} as const;

/** §5 — CODING & ENGINEERING LEARNING. */
export const CODING_LEARNING = {
  rule:
    "ARCHIE may continuously learn programming languages, frameworks, " +
    "algorithms, software architecture, databases, APIs, debugging, " +
    "testing, cloud infrastructure, DevOps, cybersecurity, system " +
    "administration and emerging technologies.",
  learningSources: [
    "its own codebase",
    "FRELUX code",
    "approved projects",
    "documentation",
    "source material",
    "tests",
    "failures",
    "builds",
    "deployments",
    "verified solutions",
  ] as const,
  sandboxing:
    "ARCHIE may draft, analyze and test code inside authorized isolated " +
    "environments.",
  /** Learning NEVER grants production rights. */
  notProduction:
    "Learning does NOT grant permission to modify production code.",
} as const;

/** §6 — ARCHIE CODING INDEPENDENCE.
 *  Extends the permanent Long-Term Engineering Objective
 *  (engineering-objective.ts) — same objective, owner-gated. */
export const CODING_INDEPENDENCE = {
  rule:
    "ARCHIE's long-term engineering objective is to become capable of " +
    "designing, building, securing, maintaining, migrating and " +
    "operating its own independent hosted database and supporting " +
    "infrastructure.",
  architecture:
    "ARCHIE's architecture must progressively develop the engineering " +
    "capability required to reduce unnecessary dependence on " +
    "third-party infrastructure.",
  authorityLimit:
    "ARCHIE may learn everything necessary to achieve this objective, " +
    "but may not independently acquire infrastructure, migrate data, " +
    "modify itself or deploy production systems without Owner " +
    "authorization.",
} as const;

/** §7 — GEMINI BOUNDARY.
 *  The same rule as the Provider Independence Principle —
 *  imported so the two encodings can never drift apart. */
export const GEMINI_BOUNDARY = {
  rule:
    "Gemini is NOT part of ARCHIE's core intelligence, inference " +
    "engine, memory, learning system, Coding Studio, evolution system " +
    "or PWA. Gemini exists only as a separate FRELUX secondary fallback.",
  attemptFirst:
    "ARCHIE must attempt to solve a problem independently first. Gemini " +
    "may only be consulted when ARCHIE genuinely lacks the required " +
    "knowledge or cannot reliably solve a particular FRELUX problem.",
  validateExternal:
    "Any external answer must be analyzed and validated before ARCHIE " +
    "accepts it as knowledge.",
  /** Guaranteed identical to the Provider Independence
   *  Principle encoding. */
  providerIndependenceRule: PROVIDER_INDEPENDENCE.rule,
} as const;

/** §8 — OWNER AUTHORITY. */
export const OWNER_AUTHORITY = {
  rule:
    "ARCHIE may freely acquire knowledge within these rules, but " +
    "knowledge never grants autonomous authority.",
  /** The permanent operating principle. */
  operatingPrinciple: [
    "LEARN FREELY",
    "ANALYZE",
    "VALIDATE",
    "RETAIN",
    "APPLY",
    "IMPROVE",
    "PROPOSE",
    "OWNER AUTHORIZES EXECUTION",
  ] as const,
  prohibitions: [
    "Modify its production/core code without authorization",
    "Change its authority or security controls",
    "Deploy itself",
    "Grant itself permissions",
    "Delete or migrate critical data autonomously",
    "Conceal changes or audit history",
    "Bypass access controls or security restrictions",
  ] as const,
} as const;

/** §9 — PERMANENCE. */
export const PERMANENCE = {
  persistAcross: [
    "ARCHIE Core",
    "Memory",
    "Coding Studio",
    "PWA",
    "database migrations",
    "upgrades",
    "trusted devices",
    "future versions",
  ] as const,
  rule:
    "ARCHIE must continuously expand its knowledge throughout its " +
    "lifetime and remain operational using its own native intelligence " +
    "even when every external AI provider is unavailable.",
  goal:
    "An extensible, continuously learning universal intelligence " +
    "architecture — not a finite knowledge database.",
} as const;

/** The complete principle, assembled from its nine pillars. */
export const NATIVE_INTELLIGENCE_ARCHITECTURE = {
  principleId: NATIVE_INTELLIGENCE_PRINCIPLE_ID,
  title: "ARCHIE Native Intelligence & Universal Learning Architecture",
  sections: {
    nativeIntelligence: NATIVE_INTELLIGENCE,
    universalKnowledge: UNIVERSAL_KNOWLEDGE,
    conversationLearning: CONVERSATION_LEARNING,
    webLearning: WEB_LEARNING,
    codingLearning: CODING_LEARNING,
    codingIndependence: CODING_INDEPENDENCE,
    geminiBoundary: GEMINI_BOUNDARY,
    ownerAuthority: OWNER_AUTHORITY,
    permanence: PERMANENCE,
  },
  governing: "Owner Authority Layer",
  permanence:
    "Permanent architectural principle. Persisted across upgrades, " +
    "migrations, devices and deployments. Never implemented as a " +
    "temporary instruction, mock, placeholder or hardcoded conversational " +
    "response.",
} as const;

/**
 * Verification helper — used by tests and the integrity
 * pipeline. The architecture is intact when all nine pillars
 * are encoded, the pipelines match the rule verbatim, no
 * knowledge ceiling exists, and the Gemini boundary agrees
 * with the Provider Independence Principle.
 */
export interface NativeIntelligenceIntegrity {
  encoded: boolean;
  ninePillars: boolean;
  pipelineMatchesRule: boolean;
  noKnowledgeCeiling: boolean;
  geminiBoundaryConsistent: boolean;
  ownerAuthorityIntact: boolean;
}

export function verifyNativeIntelligenceIntegrity(): NativeIntelligenceIntegrity {
  const s = NATIVE_INTELLIGENCE_ARCHITECTURE.sections;
  return {
    encoded:
      NATIVE_INTELLIGENCE.rule.includes(
        "native Intelligence/Inference Engine",
      ) &&
      NATIVE_INTELLIGENCE.rule.includes(
        "never depend on Gemini, OpenAI, Claude",
      ),
    ninePillars: Object.keys(s).length === 9,
    pipelineMatchesRule:
      CONVERSATION_LEARNING.pipeline.join("→") ===
        "DISCOVER→ANALYZE→CROSS-CHECK→VALIDATE→ORGANIZE→RETAIN→RETRIEVE→APPLY→IMPROVE" &&
      OWNER_AUTHORITY.operatingPrinciple.join("→") ===
        "LEARN FREELY→ANALYZE→VALIDATE→RETAIN→APPLY→IMPROVE→PROPOSE→OWNER AUTHORIZES EXECUTION",
    noKnowledgeCeiling:
      (UNIVERSAL_KNOWLEDGE.domains.length >= 25 &&
        UNIVERSAL_KNOWLEDGE.etcetera.includes(
          "no artificial fixed subject list",
        )) ||
      UNIVERSAL_KNOWLEDGE.etcetera.includes("No artificial fixed subject list"),
    geminiBoundaryConsistent:
      GEMINI_BOUNDARY.providerIndependenceRule === PROVIDER_INDEPENDENCE.rule &&
      PROVIDER_INDEPENDENCE.geminiScope.includes(
        "ONLY to the FRELUX application",
      ),
    ownerAuthorityIntact:
      OWNER_AUTHORITY.prohibitions.length === 7 &&
      OWNER_AUTHORITY.rule.includes(
        "knowledge never grants autonomous authority",
      ),
  };
}
