// =========================================================
// FRELUX PHASE 8 FINAL, ARCHIE ↔ FRELUX CORE REGISTRY
//
// ARCHIE is not an isolated chatbot: it is wired to the real
// FRELUX application core. This registry binds every major
// capability to its REAL implementation module and its REAL
// exported entry functions, no simulated, placeholder or
// duplicate bindings. core-orchestrator verifies every
// binding by dynamically importing the actual module and
// confirming the exported functions exist, so a disconnected
// or renamed core function fails the health check loudly.
// =========================================================

export type CoreSystemKey =
  | "AI_CORE"
  | "DETERMINISTIC_ENGINES"
  | "CALCULATORS"
  | "PROJECTS_PROPERTIES"
  | "CONTRACTOR_INTELLIGENCE"
  | "MATERIALS_ESTIMATES"
  | "QUOTATIONS_PDF"
  | "PLAN_VISION"
  | "MARKET_INTELLIGENCE"
  | "WEB_INTELLIGENCE"
  | "KNOWLEDGE_LEARNING"
  | "USER_FILES_STORAGE"
  | "FRELUX_API"
  | "SOURCE_CODE_INTELLIGENCE"
  | "DIAGNOSTICS_HEALTH"
  | "ARCHIE_INTERNAL_AGENTS"
  | "CRYPTO_INTELLIGENCE"
  | "FOUNDATION_KNOWLEDGE"
  | "COST_GOVERNANCE"
  | "ENGINEERING_OBJECTIVE"
  | "STUDIO"
  | "PROVIDER_INDEPENDENCE"
  | "NATIVE_INTELLIGENCE"
  | "NATIVE_ENGINE"
  | "PWA_ARCHITECTURE";

export interface CoreSystemBinding {
  key: CoreSystemKey;
  label: string;
  /** The prompt's capability family. */
  family: string;
  /** REAL module specifier, dynamically imported for every
   *  health check and for actual invocation. */
  module: string;
  /** REAL exported function names in that module. The health
   *  check verifies each exists and is callable. */
  exports: string[];
  /** true → deterministic: ARCHIE relays output, never
   *  replaces the math. */
  deterministic: boolean;
  /** Read/analysis vs owner-gated write operations. */
  autonomy:
    "ARCHIE_AUTONOMOUS" | "OWNER_GATED" | "AUTONOMOUS_READS_GATED_WRITES";
  /** Where the binding lives in the core (for diagnostics). */
  note: string;
}

export const FRELUX_CORE_SYSTEMS: readonly CoreSystemBinding[] = [
  {
    key: "AI_CORE",
    label: "FRELUX AI Core",
    family: "AI generation & consultation",
    module: "@/lib/ai",
    exports: [
      "requestColorConsultation",
      "requestColorConsultationWithCredits",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Credit-gated AI consultation core (Phase 4-5 AI foundation paths).",
  },
  {
    key: "DETERMINISTIC_ENGINES",
    label: "Calculation Engines Registry",
    family: "Deterministic calculators",
    module: "@/lib/ai-foundation/engines-registry",
    exports: ["listEngines", "registerEngine"],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Phase 2 engine registry, every deterministic calculator ARCHIE selects must be registered here.",
  },
  {
    key: "CALCULATORS",
    label: "Paint & Finish Calculators",
    family: "Deterministic calculators",
    module: "@/lib/calc",
    exports: [
      "DEFAULT_COVERAGE_M2_PER_LITER",
      "DEFAULT_CONTAINER_SIZES_LITERS",
    ],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Deterministic paint/finish math constants + computation.",
  },
  {
    key: "PROJECTS_PROPERTIES",
    label: "Projects & Properties",
    family: "Projects, properties and intelligence",
    module: "@/lib/local-projects",
    exports: ["saveLocalProject", "getLocalProjects", "getLocalProjectsByType"],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "User's own project data, reads autonomous, writes stay user-owned.",
  },
  {
    key: "CONTRACTOR_INTELLIGENCE",
    label: "Contractor Intelligence",
    family: "Contractor & project intelligence",
    module: "@/lib/contractor",
    exports: [
      "createContractorProject",
      "fetchContractorProjects",
      "fetchContractorProject",
    ],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "Contractor projects (Pro Connect), RLS-shaped, user-scoped.",
  },
  {
    key: "MATERIALS_ESTIMATES",
    label: "Materials, Estimates & Shopping Lists",
    family: "Materials, estimates, shopping lists",
    module: "@/lib/shopping-list",
    exports: [
      "generatePaintShoppingList",
      "generateCostEstimateShoppingList",
      "shoppingListToText",
    ],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Deterministic shopping-list generation from calculation results.",
  },
  {
    key: "QUOTATIONS_PDF",
    label: "Quotations & Documents",
    family: "Quotations, documents, timelines",
    module: "@/lib/pdf",
    exports: ["generateQuotationPDF", "generateShoppingListPDF"],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Branded PDF generation for quotations and shopping lists.",
  },
  {
    key: "PLAN_VISION",
    label: "AI Image/Document Intelligence",
    family: "Image & document intelligence",
    module: "@/lib/plan-vision/extraction",
    exports: [
      "requestPlanExtraction",
      "sanitizeExtractionResponse",
      "shouldReextract",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Plan-vision extraction: images/drawings → structured quantities, sanitized.",
  },
  {
    key: "MARKET_INTELLIGENCE",
    label: "Market & Price Intelligence",
    family: "Market and price intelligence",
    module: "@/lib/market-intelligence/queries",
    exports: ["fetchProviders", "fetchSources"],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "Provider/source registry for price intelligence (admin-gated writes).",
  },
  {
    key: "WEB_INTELLIGENCE",
    label: "External Web Intelligence",
    family: "External web intelligence",
    module: "@/lib/archie/web-intelligence",
    exports: [
      "isEligibleWebSource",
      "wrapAsUntrustedData",
      "canAdvanceWebIntel",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Eligible-source checks + untrusted-data wrapping, external content never trusted blindly.",
  },
  {
    key: "KNOWLEDGE_LEARNING",
    label: "Knowledge & Learning Systems",
    family: "Knowledge and learning",
    module: "@/lib/learning/learning-engine",
    exports: ["checkPromotion", "evaluateScopePromotion", "regionMatches"],
    deterministic: false,
    autonomy: "OWNER_GATED",
    note: "Phase 6.5 knowledge governance: scope promotion needs human approval, ARCHIE reads, never promotes alone.",
  },
  {
    key: "USER_FILES_STORAGE",
    label: "User-Approved Files & Media",
    family: "User-approved files and project data",
    module: "@/lib/storage",
    exports: ["uploadProductImage"],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "Storage layer, user-approved uploads only; ARCHIE never ingests unselected files.",
  },
  {
    key: "FRELUX_API",
    label: "FRELUX API",
    family: "FRELUX API platform",
    module: "@/lib/frelix-api/portal-client",
    exports: ["listApiKeys", "createApiKey", "revokeApiKey", "rotateApiKey"],
    deterministic: false,
    autonomy: "OWNER_GATED",
    note: "API subscriber platform. Key management is privileged: ARCHIE may inspect usage, never mint or revoke keys.",
  },
  {
    key: "SOURCE_CODE_INTELLIGENCE",
    label: "Application Architecture & Source",
    family: "Website/application architecture and authorized source code",
    module: "@/lib/archie/code-intelligence",
    exports: ["AUTHORIZED_CODE_ROOTS"],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "Read-only inspection of AUTHORIZED roots; production changes go through the owner gate.",
  },
  {
    key: "DIAGNOSTICS_HEALTH",
    label: "Testing, Diagnostics & System Health",
    family: "Testing, diagnostics and system health",
    module: "@/lib/error-analysis",
    exports: ["buildErrorContext", "analyzeErrorWithAI", "generateErrorFix"],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Error analysis + fix generation; read-only diagnostics (monitoredQuery wrappers in supabase-monitor).",
  },
  {
    key: "ARCHIE_INTERNAL_AGENTS",
    label: "ARCHIE Internal Agent Orchestration",
    family: "Internal task-agent orchestration",
    module: "@/lib/archie/internal-agents",
    exports: [
      "planAgentFleet",
      "canTransition",
      "validateAgentEvent",
      "AGENT_ROLES",
    ],
    deterministic: false,
    autonomy: "AUTONOMOUS_READS_GATED_WRITES",
    note: "Phase 8 P5: dynamic internal task agents with enforced lifecycle; no arbitrary ceiling, real budget/concurrency limits via cost governance; production actions still owner-gated.",
  },
  {
    key: "CRYPTO_INTELLIGENCE",
    label: "Crypto & Digital Asset Intelligence",
    family: "Owner-only crypto intelligence",
    module: "@/lib/archie/crypto-intelligence",
    exports: [
      "finalizeCryptoRecord",
      "assessPortfolioConcentration",
      "assertNoFinancialAction",
      "screenForScamIndicators",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Phase 8 P5: owner-only research/analysis domain. Financial execution is structurally impossible (FORBIDDEN_FINANCIAL_ACTIONS); predictions never guaranteed; owner-private data.",
  },
  {
    key: "PWA_ARCHITECTURE",
    label: "ARCHIE Owner PWA — complete capability exposure",
    family: "ARCHIE owner command center",
    module: "@/lib/archie/pwa-architecture",
    exports: ["PWA_CAPABILITY_MAP", "assertPwaExposure"],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "Permanent Owner rule: every new core capability is " +
      "integrated into the standalone PWA in the same feature " +
      "implementation — same identity, backend, memory, " +
      "knowledge, workspace and permissions. Enforced by " +
      "assertPwaExposure() + CI tests; exceptions require an " +
      "explicit Owner Authority restriction with a reason.",
  },
  {
    key: "STUDIO",
    label: "ARCHIE Coding Studio",
    family: "ARCHIE engineering workspace",
    module: "@/lib/studio/preview",
    exports: ["composePreview"],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "Isolated owner-only workspace: ARCHIE plans, writes REAL code, " +
      "validates it deterministically, runs it in a sandboxed live preview " +
      "and iterates on Owner feedback with immutable versions. Approval " +
      "packages a verified build; deployment stays owner-authorized.",
  },
  {
    key: "ENGINEERING_OBJECTIVE",
    label: "Long-Term Engineering Objective",
    family: "ARCHIE core principles",
    module: "@/lib/archie/engineering-objective",
    exports: [
      "ENGINEERING_OBJECTIVE",
      "classifyEngineeringAction",
      "verifyEngineeringObjectiveIntegrity",
    ],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "Permanent architectural principle from birth: continuously develop " +
      "engineering mastery toward eventually proposing ARCHIE-owned " +
      "infrastructure. Grants ZERO authority — every non-grant routes to " +
      "the Owner Authority Layer. Persisted in frelux_archie_core_principles.",
  },
  {
    key: "PROVIDER_INDEPENDENCE",
    label: "Provider Independence (Gemini Separation Rule)",
    family: "ARCHIE core principles",
    module: "@/lib/archie/provider-independence",
    exports: ["PROVIDER_INDEPENDENCE", "verifyProviderIndependenceIntegrity"],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "Permanent architectural principle from birth: ARCHIE is an " +
      "independent intelligence system — Gemini (or any external provider) " +
      "is NEVER part of ARCHIE Core, Coding Studio, Memory, Learning, " +
      "Evolution or PWA, and exists only as a FRELUX application fallback " +
      "under strict owner-defined conditions. Inference resolves through " +
      "ARCHIE's provider-agnostic engine registry. Persisted in " +
      "frelux_archie_core_principles; statically enforced by tests.",
  },
  {
    key: "NATIVE_ENGINE",
    label: "Native Intelligence Engine (own inference runtime)",
    family: "ARCHIE core intelligence",
    module: "@/lib/archie/native-engine-core",
    exports: [
      "getNativeEngine",
      "ArchieNativeEngine",
      "nativeEngineCapabilityManifest",
      "nativeEngineStatusSummary",
    ],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "ARCHIE's own native independent inference engine — foundational core " +
      "component from birth (owner directive). Real executable subsystems: " +
      "NLU (Naive Bayes + TF-IDF, trained at boot), working memory with " +
      "salience retrieval, SPO knowledge store with contradiction detection, " +
      "forward-chaining reasoning with derivation traces, means-ends " +
      "planning, tool orchestration with a deterministic arithmetic " +
      "evaluator, web research pipeline, static code analysis + test " +
      "scaffolds, self-evaluation, and outcome-based reinforcement " +
      "learning. ZERO external AI APIs. Registered as archie-native-engine " +
      "in the provider-agnostic engine registry (resolved by ARCHIE Core, " +
      "archie-chat, Coding Studio, app). Durable stores: " +
      "frelux_archie_native_facts / frelux_archie_native_outcomes. Honest " +
      "capability manifest — not-implemented capabilities are reported, " +
      "never faked.",
  },
  {
    key: "NATIVE_INTELLIGENCE",
    label: "Native Intelligence & Universal Learning Architecture",
    family: "ARCHIE core principles",
    module: "@/lib/archie/native-intelligence",
    exports: [
      "NATIVE_INTELLIGENCE_ARCHITECTURE",
      "verifyNativeIntelligenceIntegrity",
    ],
    deterministic: true,
    autonomy: "ARCHIE_AUTONOMOUS",
    note:
      "Permanent nine-pillar architecture directive from birth: ARCHIE " +
      "operates on its own native inference engine (never Gemini/OpenAI/" +
      "Claude, never dormant when external engines are unavailable, no " +
      "fake intelligence or scripted responses), acquires universal " +
      "knowledge with no subject ceiling, learns through the validated " +
      "DISCOVER→…→IMPROVE pipeline, researches the web legitimately, " +
      "learns coding in isolation (never touching production), pursues " +
      "coding independence owner-gated, keeps Gemini FRELUX-only, and " +
      "obeys LEARN FREELY→…→OWNER AUTHORIZES EXECUTION. Persisted in " +
      "frelux_archie_core_principles; statically enforced by tests.",
  },
  {
    key: "FOUNDATION_KNOWLEDGE",
    label: "Foundational Engineering Knowledge (Base44-taught)",
    family: "Engineering knowledge acquisition",
    module: "@/lib/archie/engineering-knowledge",
    exports: [
      "FOUNDATION_PACKAGE",
      "packageToTrainingInputs",
      "learnTechnology",
      "screenKnowledgeSource",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Phase 8 P5: authorized Base44/FRELUX engineering knowledge through the existing learning pipeline; knowledge acquisition NEVER authorizes production changes; no ceiling on future technologies.",
  },
  {
    key: "COST_GOVERNANCE",
    label: "Infrastructure Cost Governance",
    family: "Internal cost governance and budget control",
    module: "@/lib/archie/cost-governance",
    exports: [
      "budgetDecision",
      "assertNotCustomerQuota",
      "validateCostRecord",
      "OPERATION_CLASSES",
    ],
    deterministic: false,
    autonomy: "ARCHIE_AUTONOMOUS",
    note: "Phase 8 P5: internal agent provider costs land on the FRELUX infrastructure ledger and can NEVER consume user/subscriber/API-customer credits; budgets, concurrency, rate limits and emergency stop are owner/admin-configured.",
  },
];

export function findCoreSystem(key: CoreSystemKey): CoreSystemBinding {
  const s = FRELUX_CORE_SYSTEMS.find((c) => c.key === key);
  if (!s) throw new Error(`Unknown core system "${key}"`);
  return s;
}
