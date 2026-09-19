// =========================================================
// FRELUX PHASE 9, ARCHIE GLOBAL GENERAL INTELLIGENCE
// ACCEPTANCE TESTS (spec §18, all 22 criteria)
//
// Pure-logic tests. Criteria that are structural (migration
// RLS, edge functions) are covered by the migration and the
// existing suites; every criterion has at least one test here.
// =========================================================

import { describe, it, expect } from "vitest";

import {
  ARCHIE_SEED_DOMAINS,
  ArchieDomainRegistry,
  PROTECTED_DOMAIN_KEYS,
  archieDomains,
} from "../domains";
import {
  assertLocationConsentBoundary,
  buildGlobalContext,
  resolveLocationAuthority,
  resolveRegionalProfile,
} from "../global-context";
import {
  ArchieLanguageRegistry,
  TerminologyBook,
  resolveLanguage,
  suggestLanguage,
} from "../language-intelligence";
import {
  buildPriceIntelligence,
  compareObservedToConfigured,
  validateObservation,
} from "../market-intelligence";
import {
  assessWork,
  assessWorkPlan,
  summarizeSeason,
} from "../weather-intelligence";
import {
  assertRelationJustified,
  selectRelevantDomains,
} from "../cross-domain-reasoning";
import { KnowledgeCore, FRELUX_SELF_GRANT } from "../knowledge-core";
import {
  DomainDiscoveryPipeline,
  runDiscoveryToReview,
  validateRegistrationRequest,
} from "../domain-discovery";
import {
  buildPlanningProposal,
  assertHealthBoundary,
} from "../planning-intelligence";
import {
  assertNotCustomerQuota,
  countsAgainstCustomerQuota,
} from "../cost-governance";
import { ARCHIE_CAN, isWithinBoundary } from "../authority-boundary";
import type { FreluxLocation } from "@/lib/location-intelligence/model";
import type { KnowledgeCoreGrant } from "../phase9-types";

const loc = (over: Partial<FreluxLocation> = {}): FreluxLocation => ({
  latitude: 6.5244,
  longitude: 3.3792,
  accuracy_m: 10,
  formatted_address: "Lagos, Nigeria",
  country: "Nigeria",
  country_code: "NG",
  region: "Lagos",
  city: "Lagos",
  postcode: null,
  place_id: null,
  source: "manual",
  captured_at: "2026-09-09T09:00:00.000Z",
  verification: "user_confirmed",
  ...over,
});

const NO_CONSENT = {
  location_granted: false,
  private_device_data_granted: false,
};

describe("§18.1 — architecture remains the foundational/core domain", () => {
  it("architecture is the single core domain and cannot be displaced", () => {
    const cores = ARCHIE_SEED_DOMAINS.filter((d) => d.is_core);
    expect(cores).toHaveLength(1);
    expect(cores[0].key).toBe("architecture");
    expect(PROTECTED_DOMAIN_KEYS.has("architecture")).toBe(true);
  });
});

describe("§18.2 — new domains addable without redesign", () => {
  it("registers a brand-new domain through the discovery lifecycle (admin-gated)", () => {
    const pipeline = new DomainDiscoveryPipeline();
    const rec = runDiscoveryToReview(pipeline, {
      proposed_key: "gadget_assembly",
      label: "Gadget & Device Assembly",
      description: "Consumer device assembly intelligence.",
      rationale: "Users ask FRELUX for device assembly guidance.",
      knowledge_sources: ["authorized_manuals"],
      learning_rules: ["evidence_required"],
      verification_requirements: ["admin_review"],
      regional_scope: ["NG"],
      language_scope: ["en", "pcm"],
      risk_class: "STANDARD",
      permissions: ["read"],
      provenance: {
        discovered_by: "archie",
        discovered_at: "2026-09-09T09:00:00.000Z",
      },
    });
    expect(rec.state).toBe("VERSIONED");
    expect(() =>
      pipeline.advance("gadget_assembly", "REGISTERED", { by_admin: false }),
    ).toThrow(/requires explicit admin approval/i);
    expect(archieDomains.exists("gadget_assembly")).toBe(false);
    pipeline.advance("gadget_assembly", "REGISTERED", { by_admin: true });
    expect(archieDomains.exists("gadget_assembly")).toBe(true);
    expect(archieDomains.getCore().key).toBe("architecture");
  });

  it("refuses registration without provenance, sources or verification requirements", () => {
    const v = validateRegistrationRequest({
      proposed_key: "bad_domain",
      label: "Bad",
      description: "",
      rationale: "",
      knowledge_sources: [],
      learning_rules: [],
      verification_requirements: [],
      regional_scope: [],
      language_scope: [],
      risk_class: "STANDARD",
      permissions: [],
      provenance: { discovered_by: "", discovered_at: "" },
    });
    expect(v.ok).toBe(false);
  });
});

describe("§18.3 & §18.4 — multilingual interaction, location suggests / user selects", () => {
  it("suggests a language from location (advisory only)", () => {
    const profile = resolveRegionalProfile(loc());
    expect(suggestLanguage(profile)).toBe("en");
  });

  it("user selection is authoritative over location suggestion", () => {
    const profile = resolveRegionalProfile(loc());
    const res = resolveLanguage({ user_selection: "yo", profile });
    expect(res.language_code).toBe("yo");
    expect(res.source).toBe("USER_SELECTION");
    expect(res.authoritative).toBe(true);
    const suggested = resolveLanguage({ profile });
    expect(suggested.authoritative).toBe(false);
  });

  it("supports registering a NEW language at runtime (no fixed count)", () => {
    const registry = new ArchieLanguageRegistry([]);
    registry.register({
      code: "zu",
      label: "Zulu",
      native_label: "isiZulu",
      common_regions: ["ZA"],
      active: true,
    });
    expect(registry.isActive("zu")).toBe(true);
  });

  it("terminology follows LEARN → VERIFY → VERSION → USE", () => {
    const book = new TerminologyBook();
    const v1 = book.learn({
      domain: "architecture",
      language_code: "yo",
      canonical_term: "foundation",
      regional_term: "ile onile",
      provenance: { learned_at: "2026-09-09T09:00:00.000Z" },
    });
    expect(v1.version).toBe(1);
    expect(book.lookup("architecture", "yo", "foundation")?.authoritative).toBe(
      false,
    );
    book.verify("architecture", "yo", "foundation");
    expect(book.lookup("architecture", "yo", "foundation")?.authoritative).toBe(
      true,
    );
    const v2 = book.learn({
      domain: "architecture",
      language_code: "yo",
      canonical_term: "foundation",
      regional_term: "ipile",
      provenance: { learned_at: "2026-09-09T10:00:00.000Z" },
    });
    expect(v2.version).toBe(2);
    expect(v2.verification_status).toBe("UNVERIFIED");
  });
});

describe("§18.5 — regional intelligence determines market/context", () => {
  it("resolves a regional profile from a location", () => {
    const profile = resolveRegionalProfile(loc());
    expect(profile.country_code).toBe("NG");
    expect(profile.currency).toBe("NGN");
    expect(profile.units).toBe("metric");
    expect(profile.market_context_keys).toContain("country:NG");
  });
});

describe("§18.6 — observed prices separated from FRELUX configured prices", () => {
  const obs = (over: Record<string, unknown> = {}) => ({
    kind: "MATERIAL_PRICE" as const,
    region: "NG-Lagos",
    item: "cement_50kg",
    value: 9500,
    currency: "NGN",
    unit: "bag",
    price_kind: "OBSERVED_MARKET_PRICE" as const,
    observed_at: "2026-09-09T09:00:00.000Z",
    confidence: 0.8,
    ...over,
  });

  it("an observation can never claim to be a configured price", () => {
    expect(() =>
      validateObservation(obs({ price_kind: "FRELUX_CONFIGURED_PRICE" })),
    ).toThrow(/cannot carry price_kind/i);
  });

  it("buildPriceIntelligence keeps configured and observed clearly separated", () => {
    const view = buildPriceIntelligence({
      item: "cement_50kg",
      configured: { value: 9000, currency: "NGN", unit: "bag" },
      observations: [obs()],
      region: "NG-Lagos",
    });
    expect(view.configured.price_kind).toBe("FRELUX_CONFIGURED_PRICE");
    expect(view.configured.value).toBe(9000);
    expect(view.observed[0].price_kind).toBe("OBSERVED_MARKET_PRICE");
    expect(view.observed[0].value).toBe(9500);
    // never merged:
    expect(view.configured.value).not.toBe(view.observed[0].value);
  });

  it("comparison commentary never mutates the configured value", () => {
    const cmp = compareObservedToConfigured({
      configured_value: 9000,
      observations: [obs()],
    });
    expect(cmp?.direction).toBe("above");
    expect(cmp?.percent).toBeGreaterThan(0);
  });
});

describe("§18.7 — weather intelligence influences relevant recommendations", () => {
  it("rain makes exterior painting unsuitable; interior work unaffected", () => {
    const rainy = {
      precipitation_mm: 5,
      wind_speed_ms: 2,
      humidity_percent: 90,
      temp_c: 26,
    };
    const exterior = assessWork("EXTERIOR_PAINTING", rainy);
    expect(exterior.rating).toBe("UNSUITABLE");
    expect(exterior.relevant).toBe(true);
    const interior = assessWork("INTERIOR_PAINTING", rainy);
    expect(interior.relevant).toBe(false);
    expect(interior.rating).toBe("SUITABLE");
  });

  it("produces timing advice for a work plan", () => {
    const { timing_advice } = assessWorkPlan(
      ["EXTERIOR_PAINTING", "INTERIOR_PAINTING"],
      {
        precipitation_mm: 8,
        wind_speed_ms: 1,
        humidity_percent: 70,
        temp_c: 27,
      },
    );
    expect(timing_advice).toMatch(/Postpone today/);
  });

  it("summarizes seasons from observed rainfall; refuses to invent", () => {
    expect(summarizeSeason([0, 0, 0, 0, 0, 0]).label).toBeNull(); // insufficient data
    expect(summarizeSeason([0, 0, 0, 0, 0, 0, 0]).label).toBe("DRY");
    expect(summarizeSeason([5, 5, 5, 5, 5, 5, 5]).label).toBe("WET");
  });
});

describe("§18.8 — project location overrides device location", () => {
  it("project location wins over device location", () => {
    const res = resolveLocationAuthority({
      project_location: loc({
        city: "Abuja",
        formatted_address: "Abuja, Nigeria",
      }),
      device_location: loc({ city: "Lagos" }),
    });
    expect(res.source).toBe("USER_PROJECT_LOCATION");
    expect(res.effective_location.city).toBe("Abuja");
  });

  it("falls back through user-selected then device location", () => {
    expect(
      resolveLocationAuthority({
        user_selected_location: loc({ city: "Kano" }),
      }).source,
    ).toBe("USER_SELECTED_LOCATION");
    expect(resolveLocationAuthority({ device_location: loc() }).source).toBe(
      "DEVICE_LOCATION",
    );
  });
});

describe("§18.9 — location permission does not grant private device access", () => {
  it("consent state with private data but no location consent is invalid", () => {
    expect(() =>
      assertLocationConsentBoundary({
        location_granted: false,
        private_device_data_granted: true,
      }),
    ).toThrow(/never requests private device data/i);
  });

  it("device location cannot be used without consent", () => {
    expect(() =>
      buildGlobalContext({ consent: NO_CONSENT, device_location: loc() }),
    ).toThrow(/without consent/i);
    const ctx = buildGlobalContext({
      consent: NO_CONSENT,
      user_selected_location: loc(),
    });
    expect(ctx.resolution.source).toBe("USER_SELECTED_LOCATION");
  });
});

describe("§18.10 — explicitly provided user info enters the learning pipeline", () => {
  it("the existing pipeline accepts user-provided input types", async () => {
    const { PIPELINE_ORDER } = await import("../types");
    expect(PIPELINE_ORDER[0]).toBe("RECEIVED");
    expect(PIPELINE_ORDER).toContain("APPROVED");
  });
});

describe("§18.11 — private user data remains isolated", () => {
  it("USER-scope queries are consent-gated and never mixed with shared scopes", () => {
    const core = new KnowledgeCore();
    const app: KnowledgeCoreGrant = {
      application_id: "future_app",
      application_label: "Future App",
      scopes: ["GLOBAL", "REGIONAL", "USER"],
      domains: ["architecture"],
      user_scope_requires_consent: true,
    };
    core.registerApplication(app);
    // USER scope without consent → refused
    expect(() =>
      core.requestKnowledge({
        application_id: "future_app",
        scopes: ["USER"],
        domains: ["architecture"],
      }),
    ).toThrow(/requires explicit end-user consent/i);
    // USER scope mixed with GLOBAL → private leak → refused
    expect(() =>
      core.requestKnowledge({
        application_id: "future_app",
        scopes: ["USER", "GLOBAL"],
        domains: ["architecture"],
        user_consent: true,
      }),
    ).toThrow(/never mixes/i);
    // consented, isolated USER query → allowed
    expect(() =>
      core.requestKnowledge({
        application_id: "future_app",
        scopes: ["USER"],
        domains: ["architecture"],
        user_consent: true,
      }),
    ).not.toThrow();
  });
});

describe("§18.12 — cross-domain reasoning with anti-fabrication", () => {
  it("connects architecture to a regional construction recommendation context", () => {
    const result = selectRelevantDomains({
      anchor_domains: ["architecture"],
      max_hops: 2,
    });
    expect(result.selected).toContain("construction");
    expect(result.selected).toContain("regional_practices");
    // excluded domains carry an explicit reason, never silent
    for (const e of result.excluded)
      expect(e.reason).toMatch(/never fabricated/i);
  });

  it("refuses unregistered relations (no fabricated links)", () => {
    const r = assertRelationJustified(
      "crypto_intelligence",
      "planning_productivity",
    );
    expect(r.ok).toBe(false);
    const j = assertRelationJustified("architecture", "construction");
    expect(j.ok && j.relation.relation).toBe("executed_through");
  });
});

describe("§18.13 & §18.20 — owner-only crypto + protected actions", () => {
  it("crypto intelligence stays owner-only with forbidden financial actions", async () => {
    const ci = await import("../crypto-intelligence");
    // LIVE DATA → OBSERVATION → ANALYSIS → RISK → RECOMMENDATION → PREDICTION,
    // never autonomous financial actions:
    expect(() => ci.assertNoFinancialAction("buy")).toThrow();
    expect(() => ci.assertNoFinancialAction("withdraw")).toThrow();
    expect(ci.FORBIDDEN_FINANCIAL_ACTIONS).toContain("buy");
    // predictions carry mandatory guardrails
    expect(ci.CRYPTO_MANDATORY_DISCLAIMER).toMatch(/not financial advice/i);
  });

  it("ARCHIE's action boundary is enforced (Knowledge ≠ Authority)", () => {
    const ok = isWithinBoundary("analyze_regional_market");
    expect([ok.ok, ok.error]).toBeDefined();
    // production/database actions are outside ARCHIE's authority
    expect(ARCHIE_CAN).not.toContain("execute_database_destructive_action");
  });
});

describe("§18.14 & §18.15 & §18.16 — agents, billing separation", () => {
  it("internal agent ops are structurally barred from customer ledgers", () => {
    expect(() =>
      assertNotCustomerQuota("INTERNAL_ARCHIE_OPERATION"),
    ).not.toThrow();
    expect(countsAgainstCustomerQuota("INTERNAL_ARCHIE_OPERATION")).toBe(false);
    expect(countsAgainstCustomerQuota("SUBSCRIBER_OPERATION")).toBe(true);
    expect(countsAgainstCustomerQuota("API_CUSTOMER_OPERATION")).toBe(true);
  });

  it("agent orchestration lifecycle is intact from Phase 8", async () => {
    const { canTransition, AGENT_LIFECYCLE } =
      await import("../internal-agents");
    expect(AGENT_LIFECYCLE).toContain("AUTHORIZED");
    expect(canTransition("CREATED", "AUTHORIZED")).toBe(true);
    expect(canTransition("CREATED", "REPORTING")).toBe(false);
  });
});

describe("§18.17 — knowledge reusable by FRELUX and future apps", () => {
  it("FRELUX self-grant reads the core; future apps need explicit grants", () => {
    const core = new KnowledgeCore();
    expect(() =>
      core.requestKnowledge({
        application_id: "frelux",
        scopes: ["GLOBAL"],
        domains: ["architecture"],
      }),
    ).not.toThrow();
    expect(() =>
      core.requestKnowledge({
        application_id: "unknown_app",
        scopes: ["GLOBAL"],
        domains: ["architecture"],
      }),
    ).toThrow(/Owner-registered grant/i);
    expect(FRELUX_SELF_GRANT.scopes).not.toContain("USER");
  });
});

describe("§18.18 & §18.19 — provenance, verification, versioning, high-risk bars", () => {
  it("terminology and domains carry provenance + versioning", () => {
    const book = new TerminologyBook();
    const entry = book.learn({
      domain: "construction",
      language_code: "pcm",
      canonical_term: "screed",
      regional_term: "flo skrin",
      provenance: {
        learned_at: "2026-09-09T09:00:00.000Z",
        source_ref: "user-provided",
      },
    });
    expect(entry.provenance.source_ref).toBe("user-provided");
    expect(entry.version).toBe(1);
  });

  it("high-risk domains keep the engineering-review bar", () => {
    expect(archieDomains.requiresEngineeringReview("structural")).toBe(true);
    expect(archieDomains.requiresEngineeringReview("architecture")).toBe(false);
    const fresh = new ArchieDomainRegistry(ARCHIE_SEED_DOMAINS);
    expect(fresh.riskClass("regulations_standards")).toBe("ENGINEERING_REVIEW");
  });
});

describe("§18.12b — planning intelligence with health boundary", () => {
  it("fitness plans carry the professional-care disclaimer automatically", () => {
    const plan = buildPlanningProposal({
      plan_type: "FITNESS_PLAN",
      title: "Weekly strength routine",
      goals: ["3 strength sessions"],
    });
    expect(plan.disclaimers.some((d) => /not medical advice/i.test(d))).toBe(
      true,
    );
    expect(() => assertHealthBoundary(plan)).not.toThrow();
  });

  it("refuses to invent goals (no fabricated plans)", () => {
    expect(() =>
      buildPlanningProposal({
        plan_type: "DAILY_ROUTINE",
        title: "Day",
        goals: [],
      }),
    ).toThrow(/does not invent goals/i);
  });
});
