// =========================================================
// FRELUX PHASE 8 P5 TEST SUITE
//
// Covers the P5 contract acceptance criteria:
//  * Crypto intelligence: classification taxonomy, guaranteed-
//    profit rejection, mandatory disclaimers, forbidden
//    financial actions, portfolio concentration, scam
//    indicators, exchange-integration governance.
//  * Foundational engineering knowledge: provenance-complete
//    seed package, secret/excluded screening, pipeline
//    mapping, extensible learning (no fixed ceiling).
//  * Internal agent orchestration: lifecycle state machine,
//    fleet planning with consolidation, budget gate.
//  * Cost governance: usage classification, ledger separation
//    (internal ops NEVER touch customer credits), budget
//    decision matrix, cost-record validation.
//  * Core integration: new systems are REAL modules bound
//    into the ARCHIE core with verified exports.
// =========================================================
import { describe, it, expect } from "vitest";

import {
  CRYPTO_CLASSIFICATION_ORDER,
  finalizeCryptoRecord,
  assertNoFinancialAction,
  cryptoPredictionGuardrails,
  CRYPTO_MANDATORY_DISCLAIMER,
  FORBIDDEN_FINANCIAL_ACTIONS,
  screenForScamIndicators,
  assessPortfolioConcentration,
  concentrationFromHhi,
  validateExchangeIntegration,
  EXCHANGE_INTEGRATION_REQUIREMENTS,
} from "@/lib/archie/crypto-intelligence";
import {
  FOUNDATION_PACKAGE,
  EXCLUDED_KNOWLEDGE,
  screenKnowledgeSource,
  packageToTrainingInputs,
  learnTechnology,
  CODE_CAPABILITIES,
} from "@/lib/archie/engineering-knowledge";
import type { AgentLifecycleState } from "@/lib/archie/internal-agents";
import {
  AGENT_LIFECYCLE,
  canTransition,
  assertTransition,
  planAgentFleet,
  validateAgentEvent,
  findAgentRole,
  AGENT_ROLES,
} from "@/lib/archie/internal-agents";
import {
  OPERATION_CLASSES,
  CUSTOMER_OPERATION_CLASSES,
  INTERNAL_OPERATION_CLASSES,
  assertNotCustomerQuota,
  countsAgainstCustomerQuota,
  budgetDecision,
  estimateExternalCostCents,
  validateCostRecord,
  DECISION_BEHAVIOR,
  findApplicableBudget,
} from "@/lib/archie/cost-governance";
import {
  ArchieDomainRegistry,
  ARCHIE_SEED_DOMAINS,
} from "@/lib/archie/domains";
import {
  FRELUX_CORE_SYSTEMS,
  findCoreSystem,
} from "@/lib/archie/core-capabilities";

// ---------------------------------------------------------
// §1 Crypto & Digital Asset Intelligence (Owner-only)
// ---------------------------------------------------------
describe("ARCHIE crypto intelligence", () => {
  it("distinguishes LIVE MARKET DATA → … → PREDICTION in order", () => {
    expect(CRYPTO_CLASSIFICATION_ORDER).toEqual([
      "LIVE_MARKET_DATA",
      "OBSERVED_INFORMATION",
      "ANALYSIS",
      "RISK_ASSESSMENT",
      "RECOMMENDATION",
      "PREDICTION",
    ]);
  });

  it("rejects guaranteed-profit and guaranteed-outcome language", () => {
    const violations = cryptoPredictionGuardrails(
      "BTC will go up, this trade is guaranteed profit and risk-free.",
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(() =>
      finalizeCryptoRecord({
        classification: "PREDICTION",
        statement: "Ethereum will 100% surely double — it cannot lose.",
      }),
    ).toThrow(/never be presented as guaranteed/i);
  });

  it("appends the mandatory disclaimer to RECOMMENDATION/PREDICTION records only", () => {
    const rec = finalizeCryptoRecord({
      classification: "PREDICTION",
      statement: "Based on observed halving-cycle history, ETH may outperform.",
    });
    expect(rec.statement).toContain(CRYPTO_MANDATORY_DISCLAIMER);

    const analysis = finalizeCryptoRecord({
      classification: "ANALYSIS",
      statement: "BTC dominance has risen for three consecutive weeks.",
    });
    expect(analysis.statement).not.toContain(CRYPTO_MANDATORY_DISCLAIMER);
  });

  it("can never perform financial actions", () => {
    for (const action of FORBIDDEN_FINANCIAL_ACTIONS) {
      expect(() => assertNoFinancialAction(action)).toThrow(
        /financial decisions and execution remain under Owner control/i,
      );
    }
    expect(() => assertNoFinancialAction("buy")).toThrow();
    expect(() => assertNoFinancialAction("withdraw")).toThrow();
    expect(() =>
      finalizeCryptoRecord({
        classification: "ANALYSIS",
        statement: "ok",
        requested_action: "transfer",
      }),
    ).toThrow();
  });

  it("computes portfolio concentration risk correctly (HHI)", () => {
    // Single asset → extreme concentration (HHI 10000)
    const single = assessPortfolioConcentration([
      { symbol: "BTC", value: 1000 },
    ]);
    expect(single.hhi).toBe(10000);
    expect(single.concentration).toBe("EXTREME_CONCENTRATION");

    // Equal split across 5 → HHI 5 × 0.04 = 2000 = moderate
    const split5 = assessPortfolioConcentration([
      { symbol: "A", value: 200 },
      { symbol: "B", value: 200 },
      { symbol: "C", value: 200 },
      { symbol: "D", value: 200 },
      { symbol: "E", value: 200 },
    ]);
    expect(split5.hhi).toBe(2000);
    expect(split5.concentration).toBe("MODERATE_CONCENTRATION");
    expect(split5.largest_weight).toBeCloseTo(0.2);
    // The 2500 boundary itself belongs to HIGH.
    expect(concentrationFromHhi(2500)).toBe("HIGH_CONCENTRATION");

    // Well diversified: 10 equal positions → HHI 1000
    const many = assessPortfolioConcentration(
      Array.from({ length: 10 }, (_, i) => ({ symbol: `T${i}`, value: 100 })),
    );
    expect(many.concentration).toBe("WELL_DIVERSIFIED");

    expect(concentrationFromHhi(3000)).toBe("HIGH_CONCENTRATION");
    // Risk notes never claim to be a trade recommendation.
    expect(many.risk_notes.join(" ")).not.toMatch(/recommend to trade/i);
  });

  it("screens project descriptions against the scam indicator taxonomy", () => {
    const hits = screenForScamIndicators(
      "Join our pump group for the guaranteed 300% APY; anonymous team, unverified contract.",
    );
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("guaranteed_apy");
    expect(ids).toContain("anon_team");
    expect(ids).toContain("no_audit");
    expect(ids).toContain("pump_signal");
    expect(
      screenForScamIndicators("A vetted open-source protocol with audits."),
    ).toHaveLength(0);
  });

  it("enforces exchange-integration governance (no withdrawal by default)", () => {
    expect(EXCHANGE_INTEGRATION_REQUIREMENTS.join(" ")).toMatch(
      /NO_WITHDRAWAL_BY_DEFAULT/,
    );
    const bad = validateExchangeIntegration({
      provider: "examplex",
      authentication: "official oauth",
      requested_scopes: ["read_balances", "withdraw_funds"],
      credential_storage: "localStorage",
      token_rotation: false,
      audit_logging: true,
      withdrawal_permission: true,
      financial_action_policy: "archie may trade",
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations.join(" ")).toMatch(/withdraw/i);
    expect(bad.violations.join(" ")).toMatch(/server-side/i);
    expect(bad.violations.join(" ")).toMatch(/token rotation/i);
    expect(bad.violations.join(" ")).toMatch(/owner/i);

    const good = validateExchangeIntegration({
      provider: "examplex",
      authentication: "official oauth",
      requested_scopes: ["read_balances"],
      credential_storage: "server-side supabase secrets",
      token_rotation: true,
      audit_logging: true,
      withdrawal_permission: false,
      financial_action_policy:
        "every financial action requires owner authorization",
    });
    expect(good.ok).toBe(true);
    expect(good.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------
// §2 Foundational Engineering Knowledge (Base44-taught)
// ---------------------------------------------------------
describe("ARCHIE foundational engineering knowledge", () => {
  it("seed package is provenance-complete (source, evidence, confidence, verification)", () => {
    expect(FOUNDATION_PACKAGE.length).toBeGreaterThanOrEqual(20);
    for (const topic of FOUNDATION_PACKAGE) {
      expect(topic.technology.trim()).toBeTruthy();
      expect(topic.source.trim()).toBeTruthy();
      expect(topic.frelux_evidence.trim()).toBeTruthy();
      expect(topic.confidence).toBeGreaterThanOrEqual(0);
      expect(topic.confidence).toBeLessThanOrEqual(1);
      expect([
        "UNVERIFIED",
        "VERIFIED_BY_BUILD",
        "VERIFIED_BY_TEST",
        "VERIFIED_BY_DOC",
      ]).toContain(topic.verification);
    }
    const techs = FOUNDATION_PACKAGE.map((t) => t.technology.toLowerCase());
    for (const required of [
      "typescript",
      "react",
      "vite",
      "supabase",
      "postgres",
    ]) {
      expect(techs.some((t) => t.includes(required))).toBe(true);
    }
  });

  it("never ingests secrets or excluded knowledge", () => {
    expect(EXCLUDED_KNOWLEDGE.join(" ")).toMatch(/model weights/i);
    expect(EXCLUDED_KNOWLEDGE.join(" ")).toMatch(/secrets/i);
    const secretScreen = screenKnowledgeSource(
      "Here is an api_key sk-abc123 and bearer abcdefghijklmnop",
    );
    expect(secretScreen.ok).toBe(false);

    const clean = screenKnowledgeSource(
      "React components compose via props and hooks.",
    );
    expect(clean.ok).toBe(true);
  });

  it("maps the package onto the EXISTING ingestion pipeline (never auto-approved)", () => {
    const inputs = packageToTrainingInputs({
      user_id: "admin-1",
      display_name: "Owner",
      role: "ARCHIE_ADMIN",
      allowed_domains: ["software_engineering"],
      must_review: false,
      active: true,
    });
    expect(inputs).toHaveLength(FOUNDATION_PACKAGE.length);
    for (const input of inputs) {
      expect(input.domain).toBe("software_engineering");
      expect(input.source_ref).toMatch(/^foundation-package\//);
      // Knowledge acquisition NEVER authorizes: still needs human approval.
      expect(input.user_confirmed).toBe(false);
      expect(input.text).toMatch(/SOURCE:/);
      expect(input.text).toMatch(/FRELUX EVIDENCE:/);
      expect(input.text).toMatch(/CONFIDENCE:/);
    }
  });

  it("supports the READ→…→EXPLAIN capability ladder", () => {
    expect(CODE_CAPABILITIES).toEqual([
      "READ",
      "UNDERSTAND",
      "ANALYZE",
      "DESIGN",
      "WRITE",
      "TEST",
      "REVIEW",
      "EXPLAIN",
    ]);
  });

  it("has NO artificial ceiling: new technologies learn through the same governance", () => {
    const learned = learnTechnology({
      technology: "Rust",
      family: "LANGUAGE",
      summary: "Memory-safe systems programming language.",
      source: "Rust public documentation",
      frelux_evidence: "future engine bindings",
      confidence: 0.6,
    });
    expect(learned.ok).toBe(true);
    expect(learned.topic?.verification).toBe("UNVERIFIED");

    // Confidence out of range → rejected.
    expect(
      learnTechnology({
        technology: "X",
        family: "LANGUAGE",
        summary: "s",
        source: "d",
        frelux_evidence: "e",
        confidence: 1.5,
      }).ok,
    ).toBe(false);
    // Missing provenance (source) → rejected.
    expect(
      learnTechnology({
        technology: "X",
        family: "LANGUAGE",
        summary: "s",
        source: " ",
        frelux_evidence: "e",
        confidence: 0.5,
      }).ok,
    ).toBe(false);
    // Secrets in source material → rejected.
    expect(
      learnTechnology({
        technology: "X",
        family: "LANGUAGE",
        summary: "uses api_key xyz",
        source: "docs",
        frelux_evidence: "e",
        confidence: 0.5,
      }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------
// §3 Internal agent orchestration
// ---------------------------------------------------------
describe("ARCHIE internal agent orchestration", () => {
  it("enforces the CREATE→AUTHORIZE→ASSIGN→EXECUTE→MONITOR→REPORT→TERMINATE lifecycle", () => {
    expect(AGENT_LIFECYCLE).toContain("TERMINATED");
    const happy: Array<[AgentLifecycleState, AgentLifecycleState]> = [
      ["CREATED", "AUTHORIZED"],
      ["AUTHORIZED", "ASSIGNED"],
      ["ASSIGNED", "EXECUTING"],
      ["EXECUTING", "MONITORING"],
      ["MONITORING", "REPORTING"],
      ["REPORTING", "TERMINATED"],
    ];
    for (const [from, to] of happy) {
      expect(canTransition(from, to)).toBe(true);
    }
    // Illegal jumps are rejected.
    expect(canTransition("CREATED", "REPORTING")).toBe(false);
    expect(canTransition("TERMINATED", "EXECUTING")).toBe(false);
    expect(() => assertTransition("CREATED", "EXECUTING")).toThrow(
      /Invalid agent lifecycle transition/,
    );
    // Terminal states have no exits.
    expect(canTransition("TERMINATED", "CREATED")).toBe(false);
    expect(canTransition("FAILED", "AUTHORIZED")).toBe(false);
  });

  it("maps lifecycle events to states and validates them", () => {
    expect(validateAgentEvent("CREATED", "AUTHORIZE")).toBe("AUTHORIZED");
    expect(validateAgentEvent("AUTHORIZED", "ASSIGN")).toBe("ASSIGNED");
    expect(validateAgentEvent("MONITORING", "REPORT")).toBe("REPORTING");
    // COST events don't change state.
    expect(validateAgentEvent("EXECUTING", "COST")).toBe("EXECUTING");
    expect(() => validateAgentEvent("CREATED", "REPORT")).toThrow();
  });

  it("has a rich registered role catalog with permissions", () => {
    const roles = AGENT_ROLES.map((r) => r.role);
    for (const required of [
      "code_analysis",
      "debugging",
      "frontend",
      "backend",
      "supabase",
      "calculator_validation",
      "testing_qa",
      "cybersecurity",
      "performance",
      "seo",
      "pwa_mobile",
      "documentation",
      "web_research",
      "infrastructure",
      "integrations",
      "market_intelligence",
      "crypto_research",
      "architecture",
    ]) {
      expect(roles).toContain(required);
    }
    expect(findAgentRole("crypto_research")?.required_permissions).toContain(
      "crypto:research",
    );
    // Unknown roles are rejected, not silently accepted.
    expect(findAgentRole("does_not_exist")).toBeUndefined();
  });

  it("plans fleets: validates roles, consolidates duplicates, gates on budgets", () => {
    const snapshot = {
      month_to_date_spend_cents: 1000,
      active_agents: 2,
      calls_last_minute: 0,
      emergency_stop: false,
      budgets: [
        {
          provider: "*",
          monthly_budget_cents: 5000,
          concurrency_limit: 8,
          rate_limit_per_minute: 60,
          emergency_threshold_pct: 90,
          exhaustion_policy: "QUEUE" as const,
          active: true,
        },
      ],
    };
    const plan = planAgentFleet(
      {
        task: "Audit postback verification",
        requested_roles: [
          "cybersecurity",
          "cybersecurity",
          "not_a_role",
          "code_analysis",
          "architecture",
        ],
        estimated_cost_cents: 500,
      },
      snapshot,
    );
    // Duplicate consolidated.
    expect(plan.roles.filter((r) => r.role === "cybersecurity")).toHaveLength(
      1,
    );
    expect(plan.consolidations.length).toBeGreaterThan(0);
    // Unknown role rejected with a reason.
    expect(plan.rejected_roles[0].role).toBe("not_a_role");
    // Within budget → allowed.
    expect(plan.decision).toBe("ALLOW");

    // Over budget → policy decides.
    const over = planAgentFleet(
      {
        task: "big",
        requested_roles: ["web_research"],
        estimated_cost_cents: 9_999,
      },
      snapshot,
    );
    expect(over.decision).toBe("QUEUE");

    // Concurrency limit hit → REDUCE.
    expect(
      planAgentFleet(
        {
          task: "t",
          requested_roles: ["web_research"],
          estimated_cost_cents: 10,
        },
        { ...snapshot, active_agents: 8 },
      ).decision,
    ).toBe("REDUCE");

    // Emergency threshold crossed → EMERGENCY_STOP.
    expect(
      planAgentFleet(
        {
          task: "t",
          requested_roles: ["web_research"],
          estimated_cost_cents: 10,
        },
        { ...snapshot, month_to_date_spend_cents: 4600 },
      ).decision,
    ).toBe("EMERGENCY_STOP");
  });
});

// ---------------------------------------------------------
// §4/§5 Cost governance: internal ≠ customer
// ---------------------------------------------------------
describe("infrastructure cost governance", () => {
  it("classifies operations explicitly", () => {
    expect(OPERATION_CLASSES).toEqual([
      "INTERNAL_ARCHIE_OPERATION",
      "OWNER_OPERATION",
      "SUBSCRIBER_OPERATION",
      "PUBLIC_USER_OPERATION",
      "API_CUSTOMER_OPERATION",
    ]);
    expect(CUSTOMER_OPERATION_CLASSES).toEqual([
      "SUBSCRIBER_OPERATION",
      "PUBLIC_USER_OPERATION",
      "API_CUSTOMER_OPERATION",
    ]);
    expect(INTERNAL_OPERATION_CLASSES).toEqual(["INTERNAL_ARCHIE_OPERATION"]);
  });

  it("internal ARCHIE operations NEVER map to customer quota (structural rule)", () => {
    expect(() =>
      assertNotCustomerQuota("INTERNAL_ARCHIE_OPERATION"),
    ).not.toThrow();
    expect(() => assertNotCustomerQuota("OWNER_OPERATION")).not.toThrow();
    for (const customerClass of CUSTOMER_OPERATION_CLASSES) {
      expect(() => assertNotCustomerQuota(customerClass)).toThrow(
        /may never consume user/i,
      );
      expect(countsAgainstCustomerQuota(customerClass)).toBe(true);
    }
    expect(countsAgainstCustomerQuota("INTERNAL_ARCHIE_OPERATION")).toBe(false);
    expect(countsAgainstCustomerQuota("OWNER_OPERATION")).toBe(false);
  });

  it("makes budget decisions: allow/queue/reduce/stop/emergency", () => {
    const budgets = [
      {
        provider: "*",
        monthly_budget_cents: 10_000,
        concurrency_limit: 10,
        rate_limit_per_minute: 100,
        emergency_threshold_pct: 90,
        exhaustion_policy: "QUEUE" as const,
        active: true,
      },
      {
        provider: "GEMINI_PRO",
        monthly_budget_cents: 2_000,
        concurrency_limit: 2,
        rate_limit_per_minute: 30,
        emergency_threshold_pct: 80,
        exhaustion_policy: "STOP" as const,
        active: true,
      },
    ];
    const base = {
      month_to_date_spend_cents: 100,
      active_agents: 1,
      calls_last_minute: 0,
      emergency_stop: false,
      budgets,
    };
    // Within all limits → ALLOW.
    expect(budgetDecision(base, 500)).toBe("ALLOW");
    // Provider-specific budget wins over global.
    expect(findApplicableBudget(base, "GEMINI_PRO")?.provider).toBe(
      "GEMINI_PRO",
    );
    // Provider budget applies within its own limits → ALLOW.
    expect(budgetDecision(base, 1_500, "GEMINI_PRO")).toBe("ALLOW");
    // Over budget but below the emergency threshold → configured policy.
    // Global: 8800 spent (88% < 90%) + 1500 = 10300 > 10000 → QUEUE.
    expect(
      budgetDecision({ ...base, month_to_date_spend_cents: 8_800 }, 1_500),
    ).toBe("QUEUE");
    // GEMINI_PRO: 1500 spent (75% < 80%) + 600 = 2100 > 2000 → STOP.
    expect(
      budgetDecision(
        { ...base, month_to_date_spend_cents: 1_500 },
        600,
        "GEMINI_PRO",
      ),
    ).toBe("STOP");
    // Concurrency.
    expect(budgetDecision({ ...base, active_agents: 10 }, 10)).toBe("REDUCE");
    // Rate limit.
    expect(budgetDecision({ ...base, calls_last_minute: 100 }, 10)).toBe(
      "QUEUE",
    );
    // Emergency stop flag halts everything.
    expect(budgetDecision({ ...base, emergency_stop: true }, 10)).toBe(
      "EMERGENCY_STOP",
    );
    // Emergency threshold percent.
    expect(
      budgetDecision({ ...base, month_to_date_spend_cents: 9_100 }, 10),
    ).toBe("EMERGENCY_STOP");
    // No budget configured → safe default QUEUE (never unlimited).
    expect(
      budgetDecision(
        {
          month_to_date_spend_cents: 0,
          active_agents: 0,
          calls_last_minute: 0,
          emergency_stop: false,
          budgets: [],
        },
        10,
      ),
    ).toBe("QUEUE");
    // Every decision has a defined behavior.
    for (const behavior of Object.values(DECISION_BEHAVIOR)) {
      expect(behavior.length).toBeGreaterThan(10);
    }
  });

  it("estimates external provider costs conservatively before spawning", () => {
    expect(estimateExternalCostCents("GEMINI_FLASH", 10)).toBe(1);
    expect(estimateExternalCostCents("GEMINI_PRO", 2)).toBe(5);
    expect(estimateExternalCostCents("UNKNOWN_PROVIDER", 5)).toBe(5);
    expect(estimateExternalCostCents("TAVILY_SEARCH", 0)).toBe(1);
  });

  it("validates ledger records: infrastructure ledger accepts internal classes only", () => {
    const ok = validateCostRecord({
      operation_class: "INTERNAL_ARCHIE_OPERATION",
      provider: "GEMINI_FLASH",
      operation: "code analysis",
      agent_id: null,
      cost_estimate_cents: 1,
      cost_actual_cents: 1,
      usage_meta: {},
    });
    expect(ok.ok).toBe(true);

    // A customer class on the infrastructure ledger is a violation.
    const bad = validateCostRecord({
      operation_class: "API_CUSTOMER_OPERATION",
      provider: "GEMINI_FLASH",
      operation: "x",
      agent_id: null,
      cost_estimate_cents: 1,
      cost_actual_cents: 1,
      usage_meta: {},
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations.join(" ")).toMatch(/customer class/i);

    // Zero-cost records are rejected (a cost record must record cost).
    const zero = validateCostRecord({
      operation_class: "INTERNAL_ARCHIE_OPERATION",
      provider: "GEMINI_FLASH",
      operation: "x",
      agent_id: null,
      cost_estimate_cents: 0,
      cost_actual_cents: 0,
      usage_meta: {},
    });
    expect(zero.ok).toBe(false);
  });
});

// ---------------------------------------------------------
// §7 Core integration: real modules, real exports
// ---------------------------------------------------------
describe("P5 systems are bound into the ARCHIE core", () => {
  const NEW_SYSTEMS = [
    "ARCHIE_INTERNAL_AGENTS",
    "CRYPTO_INTELLIGENCE",
    "FOUNDATION_KNOWLEDGE",
    "COST_GOVERNANCE",
  ] as const;

  it("registers the new core systems with real module bindings", () => {
    for (const key of NEW_SYSTEMS) {
      const binding = findCoreSystem(key);
      expect(binding.module).toMatch(/^@\/lib\/archie\//);
      expect(binding.exports.length).toBeGreaterThan(0);
      expect(FRELUX_CORE_SYSTEMS).toContainEqual(
        expect.objectContaining({ key }),
      );
    }
  });

  it("dynamically imports each new system's REAL module and verifies exports", async () => {
    const { loadCoreSystem } = await import("@/lib/archie/core-orchestrator");
    for (const key of NEW_SYSTEMS) {
      const mod = await loadCoreSystem(key);
      const binding = findCoreSystem(key);
      for (const name of binding.exports) {
        expect(
          mod[name],
          `${binding.module} must export ${name}`,
        ).toBeDefined();
      }
    }
  });

  it("extends (never replaces) the domain registry", () => {
    const registry = new ArchieDomainRegistry();
    const keys = ARCHIE_SEED_DOMAINS.map((d) => d.key);
    expect(keys).toContain("crypto_intelligence");
    expect(keys).toContain("engineering_foundations");
    // The architecture core domain survives untouched.
    expect(registry.getCore().key).toBe("architecture");
    // No fixed ceiling: new domains can be added.
    registry.addDomain({
      key: "future_domain",
      label: "Future",
      is_core: false,
      risk_class: "STANDARD",
      active: true,
    });
    expect(registry.exists("future_domain")).toBe(true);
  });

  it("keeps crypto domain knowledge out of customer-facing flows by scoping", async () => {
    const { ARCHIE_SEED_DOMAINS: domains } =
      await import("@/lib/archie/domains");
    const crypto = domains.find((d) => d.key === "crypto_intelligence");
    expect(crypto?.description).toMatch(/OWNER-ONLY/i);
    expect(crypto?.description).toMatch(/never executes financial actions/i);
  });
});
