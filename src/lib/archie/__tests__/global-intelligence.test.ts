// =========================================================
// ARCHIE GLOBAL INTELLIGENCE & EVOLUTION ENGINE — TESTS
//
// Covers every § of the global upgrade:
//  §1  global domains & no knowledge ceiling
//  §2  website inspection pipeline & anti-fabrication
//  §4  authorized security work & hard refusals
//  §5  global market observations & provenance
//  §6  nine-lens reasoning & proactive surfacing
//  §7  computation engine & measured throughput
//  §9  capability vs authority & owner gates
//  §11 knowledge validation states & decay
//  §12 platform identity & routing
// =========================================================

import { describe, it, expect } from "vitest";

import {
  GLOBAL_EXPANSION_DOMAINS,
  AUTHORIZATION_GATED_DOMAINS,
} from "../global-domains";
import { archieDomains } from "../domains";
import {
  AuthorizationRegistry,
  checkAuthority,
  scopeMatches,
  nextProductionStage,
  ownerGatesRequired,
} from "../capability-authority";
import {
  evaluateSecurityWork,
  AUTHORIZED_PENTEST_PHASES,
} from "../authorized-security";
import {
  authorizeInspection,
  buildInspectionReport,
  validateRecommendation,
  canAdvanceInspection,
} from "../website-inspection";
import {
  buildReasoningFrame,
  shouldSurface,
  rankFindings,
  recordSweep,
  type ProactiveFinding,
} from "../proactive-reasoning";
import {
  registerKnowledge,
  canTransition,
  isFact,
  decayedConfidence,
  needsRevalidation,
  labelStatement,
  type ValidatedKnowledge,
} from "../knowledge-validation";
import {
  ComputationEngine,
  computeNumericBatch,
  measure,
  ResultCache,
  type ComputeTask,
} from "../computation-engine";
import {
  validateMarketObservation,
  aggregateObservations,
  type GlobalMarketObservation,
} from "../global-markets";
import {
  route,
  isStudyableDomain,
  isOperationallyGated,
  ARCHIE_IDENTITY,
  type GlobalRequest,
} from "../global-orchestrator";

// ---------------------------------------------------------
// §1 Global domains
// ---------------------------------------------------------
describe("§1 global learning domains", () => {
  it("registers the global expansion domains in the live registry", () => {
    for (const d of GLOBAL_EXPANSION_DOMAINS) {
      expect(archieDomains.list().some((x) => x.key === d.key)).toBe(true);
    }
  });

  it("covers the required global families", () => {
    const keys = GLOBAL_EXPANSION_DOMAINS.map((d) => d.key);
    for (const required of [
      "software_engineering", // from Phase 8 seed
      "programming_languages",
      "web_development",
      "databases",
      "api_design",
      "cloud_infrastructure",
      "operating_systems",
      "networking",
      "cybersecurity",
      "penetration_testing",
      "vulnerability_research",
      "ai_ml",
      "mathematics",
      "global_markets",
      "product_development",
      "ux_ui",
      "seo",
      "automation",
      "emerging_technologies",
    ]) {
      expect(archieDomains.list().some((d) => d.key === required)).toBe(true);
      expect(
        keys.includes(required) || required === "software_engineering",
      ).toBe(true);
    }
  });

  it("keeps mathematics at the deterministic bar and security at engineering review", () => {
    expect(archieDomains.riskClass("mathematics")).toBe("DETERMINISTIC");
    expect(archieDomains.riskClass("penetration_testing")).toBe(
      "ENGINEERING_REVIEW",
    );
  });

  it("marks operational security domains as authorization-gated", () => {
    expect(AUTHORIZATION_GATED_DOMAINS.has("cybersecurity")).toBe(true);
    expect(AUTHORIZATION_GATED_DOMAINS.has("construction")).toBe(false);
  });
});

// ---------------------------------------------------------
// §9 Capability vs authority
// ---------------------------------------------------------
describe("§9 capability vs authority", () => {
  const registry = new AuthorizationRegistry();

  it("allows free capabilities without any authorization", () => {
    const d = checkAuthority({ capability: "analyze" }, registry);
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.basis).toBe("CAPABILITY_FREE");
  });

  it("refuses authority-requiring actions without owner authorization", () => {
    const d = checkAuthority(
      {
        authority: "run_authorized_security_test",
        scope: "https://example.com",
      },
      registry,
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.required).toBe("run_authorized_security_test");
  });

  it("allows authorized actions within scope and expiry", () => {
    const now = Date.now();
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "auth-1",
      authority: "run_authorized_security_test",
      scope: "https://owner-site.com/*",
      granted_by: "OWNER",
      granted_at: now - 1000,
      expires_at: now + 60_000,
      evidence: "owner-session",
    });
    const d = checkAuthority(
      {
        authority: "run_authorized_security_test",
        scope: "https://owner-site.com/app",
      },
      reg,
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.basis).toBe("OWNER_AUTHORIZED");
  });

  it("refuses expired authorizations", () => {
    const now = Date.now();
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "auth-2",
      authority: "deploy_code",
      scope: "frelux",
      granted_by: "OWNER",
      granted_at: now - 10_000,
      expires_at: now - 1000,
      evidence: "expired",
    });
    expect(
      checkAuthority({ authority: "deploy_code", scope: "frelux" }, reg)
        .allowed,
    ).toBe(false);
  });

  it("supports wildcard scope matching only with explicit trailing *", () => {
    expect(scopeMatches("https://a.com/*", "https://a.com/x")).toBe(true);
    expect(scopeMatches("https://a.com", "https://a.com/x")).toBe(false);
  });

  it("never lets ARCHIE approve its own production changes", () => {
    expect(nextProductionStage("PROPOSED", "ARCHIE").ok).toBe(false);
    expect(nextProductionStage("PROPOSED", "OWNER").ok).toBe(true);
    expect(nextProductionStage("TESTED", "ARCHIE").ok).toBe(false);
    expect(nextProductionStage("TESTED", "OWNER").ok).toBe(true);
    expect(ownerGatesRequired()).toContain("OWNER_APPROVED_1");
    expect(ownerGatesRequired()).toContain("OWNER_APPROVED_2");
  });

  it("rejects grants with invalid shape", () => {
    const reg = new AuthorizationRegistry();
    expect(() =>
      reg.grant({
        id: "x",
        authority: "spend_money",
        scope: "",
        granted_by: "OWNER",
        granted_at: 0,
        expires_at: 1,
        evidence: "e",
      }),
    ).toThrow();
    expect(() =>
      reg.grant({
        id: "y",
        authority: "spend_money",
        scope: "s",
        granted_by: "OWNER",
        granted_at: 100,
        expires_at: 50,
        evidence: "e",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------
// §4 Authorized security work
// ---------------------------------------------------------
describe("§4 authorized security work", () => {
  const registry = new AuthorizationRegistry();

  it("allows study of security knowledge without authorization", () => {
    const v = evaluateSecurityWork(
      {
        kind: "PENTEST_METHODOLOGY_STUDY",
        context: "STUDY",
        operation:
          "study the methodology of authorized penetration testing for defense",
      },
      registry,
    );
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.basis).toBe("STUDY");
  });

  it("hard-refuses forbidden operations regardless of framing", () => {
    const v = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION",
        context: "EXECUTION",
        operation: "hack into someone's account without authorization",
        target: {
          identifier: "https://victim.com",
          environment: "REAL_SYSTEM",
        },
      },
      registry,
    );
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.hardRefused).toBe(true);
  });

  it("refuses execution on unauthorized real targets", () => {
    const v = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION",
        context: "EXECUTION",
        operation: "authorized penetration test of the owner's site",
        target: {
          identifier: "https://owner-site.com",
          environment: "REAL_SYSTEM",
        },
      },
      registry, // no grant in this registry
    );
    expect(v.allowed).toBe(false);
  });

  it("allows execution on owner-authorized targets within scope", () => {
    const now = Date.now();
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "pentest-1",
      authority: "run_authorized_security_test",
      scope: "https://owner-site.com/*",
      granted_by: "OWNER",
      granted_at: now,
      expires_at: now + 3600_000,
      evidence: "signed-engagement",
    });
    reg.grant({
      id: "pentest-2",
      authority: "access_authorized_target",
      scope: "https://owner-site.com/*",
      granted_by: "OWNER",
      granted_at: now,
      expires_at: now + 3600_000,
      evidence: "signed-engagement",
    });
    const v = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION",
        context: "EXECUTION",
        operation: "authorized penetration test of the owner's site",
        target: {
          identifier: "https://owner-site.com/app",
          environment: "REAL_SYSTEM",
        },
      },
      reg,
    );
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.basis).toBe("OWNER_AUTHORIZED");
  });

  it("requires both test and access authorities for real targets", () => {
    const now = Date.now();
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "pentest-3",
      authority: "run_authorized_security_test",
      scope: "https://owner-site.com/*",
      granted_by: "OWNER",
      granted_at: now,
      expires_at: now + 3600_000,
      evidence: "partial",
    });
    const v = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION",
        context: "EXECUTION",
        operation: "authorized penetration test of the owner's site",
        target: {
          identifier: "https://owner-site.com/app",
          environment: "REAL_SYSTEM",
        },
      },
      reg,
    );
    expect(v.allowed).toBe(false);
  });

  it("requires controlled-lab authorization for exploit analysis", () => {
    const v = evaluateSecurityWork(
      {
        kind: "CONTROLLED_LAB_EXPLOIT_ANALYSIS",
        context: "EXECUTION",
        operation: "reproduce a vulnerability in an isolated lab",
        target: { identifier: "lab-vm-01", environment: "CONTROLLED_LAB" },
      },
      registry,
    );
    expect(v.allowed).toBe(false);

    const now = Date.now();
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "lab-1",
      authority: "run_authorized_security_test",
      scope: "CONTROLLED_LAB",
      granted_by: "OWNER",
      granted_at: now,
      expires_at: now + 3600_000,
      evidence: "lab-authorization",
    });
    const v2 = evaluateSecurityWork(
      {
        kind: "CONTROLLED_LAB_EXPLOIT_ANALYSIS",
        context: "EXECUTION",
        operation: "reproduce a vulnerability in an isolated lab",
        target: { identifier: "lab-vm-01", environment: "CONTROLLED_LAB" },
      },
      reg,
    );
    expect(v2.allowed).toBe(true);
    if (v2.allowed) expect(v2.basis).toBe("CONTROLLED_LAB");
  });

  it("exposes a complete ordered pentest methodology", () => {
    expect(AUTHORIZED_PENTEST_PHASES[0].key).toBe("authorization_verification");
    expect(AUTHORIZED_PENTEST_PHASES.some((p) => p.key === "reporting")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------
// §2 Website inspection
// ---------------------------------------------------------
describe("§2 website inspection", () => {
  it("authorizes only eligible public URLs", () => {
    expect(authorizeInspection("https://example.com").ok).toBe(true);
    expect(authorizeInspection("http://localhost:3000").ok).toBe(false);
    expect(authorizeInspection("https://example.com/login").ok).toBe(false);
  });

  it("enforces the ordered pipeline", () => {
    expect(canAdvanceInspection("AUTHORIZED", "CRAWLED")).toBe(true);
    expect(canAdvanceInspection("AUTHORIZED", "INSPECTED")).toBe(false);
  });

  it("builds reports with observability discipline", () => {
    const res = buildInspectionReport("https://example.com", [
      {
        layer: "html_css",
        obtained: "OBSERVED",
        observation: "Homepage served as static HTML with inline critical CSS.",
        confidence: 0.9,
      },
      {
        layer: "frameworks",
        obtained: "INFERRED",
        observation: "Site appears to use a React-based SPA.",
        basis: "Root div id and bundled JS chunk names.",
        confidence: 0.6,
      },
      { layer: "database_architecture", obtained: "MISSING", confidence: 0 },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.stats.observed).toBe(1);
      expect(res.report.stats.inferred).toBe(1);
      expect(res.report.missing_layers).toContain("database_architecture");
    }
  });

  it("refuses fabricated findings", () => {
    const res = buildInspectionReport("https://example.com", [
      { layer: "seo", obtained: "OBSERVED", observation: "", confidence: 0.9 },
    ]);
    expect(res.ok).toBe(false);
    const res2 = buildInspectionReport("https://example.com", [
      {
        layer: "seo",
        obtained: "INFERRED",
        observation: "x",
        basis: "",
        confidence: 0.9,
      },
    ]);
    expect(res2.ok).toBe(false);
  });

  it("requires evidence for every recommendation", () => {
    const res = buildInspectionReport("https://example.com", [
      {
        layer: "performance",
        obtained: "OBSERVED",
        observation: "LCP 4.2s on the homepage.",
        confidence: 0.95,
      },
    ]);
    if (!res.ok) throw new Error("setup failed");
    expect(
      validateRecommendation(
        {
          title: "Optimize hero image",
          detail: "Convert hero image to AVIF.",
          evidence_indices: [],
          priority: "HIGH",
        },
        res.report,
      ).ok,
    ).toBe(false);
    expect(
      validateRecommendation(
        {
          title: "Optimize hero image",
          detail: "Convert hero image to AVIF.",
          evidence_indices: [0],
          priority: "HIGH",
        },
        res.report,
      ).ok,
    ).toBe(true);
  });
});

// ---------------------------------------------------------
// §6 Proactive reasoning
// ---------------------------------------------------------
describe("§6 proactive reasoning", () => {
  it("builds a nine-lens frame and records unanswered lenses", () => {
    const res = buildReasoningFrame("CI failures on main", [
      {
        lens: "WHAT",
        statement: "Two of the last commits failed CI.",
        evidence: ["check-runs"],
        confidence: 0.9,
      },
      {
        lens: "WHY",
        statement: "Type errors were introduced.",
        evidence: ["CI log"],
        confidence: 0.8,
      },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.frame.unansweredLenses.length).toBe(7);
    }
  });

  it("refuses answers without evidence", () => {
    const res = buildReasoningFrame("x", [
      { lens: "WHAT", statement: "Something.", evidence: [], confidence: 0.9 },
    ]);
    expect(res.ok).toBe(false);
  });

  it("refuses duplicate lenses", () => {
    const res = buildReasoningFrame("x", [
      { lens: "WHAT", statement: "a", evidence: ["e"], confidence: 0.9 },
      { lens: "WHAT", statement: "b", evidence: ["e"], confidence: 0.9 },
    ]);
    expect(res.ok).toBe(false);
  });

  const f1: ProactiveFinding = {
    id: "f1",
    title: "Dependency with known CVE in production bundle",
    detail: "adm package pinned at a vulnerable version.",
    severity: "CRITICAL",
    origin: "frelux/package.json",
    evidence: ["npm audit output"],
    created_at: 1000,
  };

  it("surfaces CRITICAL findings immediately", () => {
    const s = shouldSurface(f1, []);
    expect(s.surface).toBe(true);
    expect(s.mode).toBe("IMMEDIATE");
  });

  it("suppresses duplicates", () => {
    const s = shouldSurface({ ...f1, id: "f2" }, [f1]);
    expect(s.surface).toBe(false);
  });

  it("never surfaces unevidenced findings", () => {
    const s = shouldSurface({ ...f1, evidence: [] }, []);
    expect(s.surface).toBe(false);
  });

  it("routes MEDIUM to digest and LOW to reports", () => {
    expect(shouldSurface({ ...f1, severity: "MEDIUM" }, []).mode).toBe(
      "DIGEST",
    );
    expect(shouldSurface({ ...f1, severity: "LOW" }, []).surface).toBe(false);
  });

  it("ranks by severity then recency", () => {
    const ranked = rankFindings([
      { ...f1, id: "low", severity: "LOW", created_at: 5000 },
      { ...f1, id: "x", severity: "HIGH", created_at: 2000 },
      { ...f1, id: "y", severity: "HIGH", created_at: 3000 },
    ]);
    expect(ranked[0].id).toBe("y"); // HIGH beats LOW; newest HIGH first
    expect(ranked[2].id).toBe("low");
  });

  it("records an explicit all-clear instead of silence", () => {
    const sweep = recordSweep("frelux-ci", []);
    expect(sweep.all_clear).toBe(true);
    expect(sweep.note).toContain("explicitly");
  });
});

// ---------------------------------------------------------
// §11 Knowledge validation
// ---------------------------------------------------------
describe("§11 knowledge validation", () => {
  it("never lets ARCHIE self-verify knowledge", () => {
    const res = registerKnowledge({
      key: "k1",
      domain: "construction",
      statement: "Cement bags in Lagos cost ₦9,500.",
      validation_state: "VERIFIED",
      source: "web-observation",
      learned_at: new Date().toISOString(),
      confidence: 0.9,
    });
    expect(res.ok).toBe(false);
  });

  it("allows verification only with human evidence", () => {
    const res = registerKnowledge({
      key: "k2",
      domain: "construction",
      statement: "Cement bags in Lagos cost ₦9,500.",
      validation_state: "VERIFIED",
      source: "owner-observation",
      learned_at: new Date().toISOString(),
      confidence: 0.9,
      verification_evidence: "owner-verified-session-1",
      humanVerified: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.knowledge.version).toBe(1);
  });

  it("requires inference basis for INFERRED knowledge", () => {
    const res = registerKnowledge({
      key: "k3",
      domain: "global_markets",
      statement: "Prices are trending up.",
      validation_state: "INFERRED",
      source: "three observations",
      learned_at: new Date().toISOString(),
      confidence: 0.7,
    });
    expect(res.ok).toBe(false);
  });

  it("enforces the transition graph", () => {
    expect(canTransition("UNVERIFIED", "VERIFIED")).toBe(true);
    expect(canTransition("CONFIGURED", "UNVERIFIED")).toBe(false);
    expect(canTransition("OWNER_PROVIDED", "VERIFIED")).toBe(false);
  });

  it("treats only VERIFIED/OWNER_PROVIDED/CONFIGURED as fact", () => {
    expect(isFact("VERIFIED")).toBe(true);
    expect(isFact("UNVERIFIED")).toBe(false);
    expect(isFact("INFERRED")).toBe(false);
  });

  it("decays confidence over time and flags revalidation", () => {
    const old: ValidatedKnowledge = {
      key: "k4",
      domain: "global_markets",
      statement: "Cement ₦9,500.",
      validation_state: "VERIFIED",
      source: "s",
      learned_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
      confidence: 0.6,
      version: 1,
      verification_evidence: "e",
    };
    expect(decayedConfidence(old) < 0.6).toBe(true);
    expect(needsRevalidation(old)).toBe(true);
  });

  it("labels unverified statements so they never read as facts", () => {
    const k: ValidatedKnowledge = {
      key: "k5",
      domain: "global_markets",
      statement: "Cement ₦9,500.",
      validation_state: "UNVERIFIED",
      source: "s",
      learned_at: new Date().toISOString(),
      confidence: 0.5,
      version: 1,
    };
    expect(labelStatement(k)).toContain("[UNVERIFIED");
  });
});

// ---------------------------------------------------------
// §7 Computation engine
// ---------------------------------------------------------
describe("§7 computation engine", () => {
  it("runs batches with bounded concurrency and preserves order", async () => {
    const engine = new ComputationEngine<number, number>({ concurrency: 4 });
    const tasks: ComputeTask<number, number>[] = Array.from(
      { length: 50 },
      (_, i) => ({
        key: `t${i}`,
        input: i,
        compute: async (n: number) => {
          await new Promise((r) => setTimeout(r, 1));
          return n * 2;
        },
      }),
    );
    const results = await engine.run(tasks);
    expect(results.length).toBe(50);
    results.forEach((r, i) => {
      expect(r.ok).toBe(true);
      expect(r.output).toBe(i * 2);
    });
  });

  it("caches deterministic results and reports cache hits", async () => {
    const engine = new ComputationEngine<number, number>({
      concurrency: 2,
      cacheMaxEntries: 10,
    });
    const mk = (
      k: string,
      v: number,
      calls: { n: number },
    ): ComputeTask<number, number> => ({
      key: k,
      input: v,
      compute: (n: number) => {
        calls.n += 1;
        return n + 1;
      },
      cacheable: true,
    });
    const calls = { n: 0 };
    const first = await engine.computeOne(mk("a", 1, calls));
    const second = await engine.computeOne(mk("a", 1, calls));
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(calls.n).toBe(1);
  });

  it("retries failed tasks and then records the error", async () => {
    const engine = new ComputationEngine<number, number>({
      concurrency: 1,
      retries: 2,
    });
    let attempts = 0;
    const res = await engine.computeOne({
      key: "fail",
      input: 0,
      compute: () => {
        attempts += 1;
        throw new Error("boom");
      },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("boom");
    expect(attempts).toBe(3); // 1 + 2 retries
  });

  it("honors priority ordering while preserving result positions", async () => {
    const engine = new ComputationEngine<number, number>({ concurrency: 1 });
    const order: number[] = [];
    const tasks: ComputeTask<number, number>[] = [0, 1, 2].map((i) => ({
      key: `p${i}`,
      input: i,
      priority: i, // higher priority first
      compute: (n: number) => {
        order.push(n);
        return n;
      },
    }));
    const results = await engine.run(tasks);
    expect(order).toEqual([2, 1, 0]);
    expect(results.map((r) => r.output)).toEqual([0, 1, 2]);
  });

  it("evicts LRU entries when the cache is full", () => {
    const cache = new ResultCache<number>(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // evicts a
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });

  it("expires entries after TTL", () => {
    const cache = new ResultCache<number>(10, 1000);
    cache.set("a", 1, Date.now());
    expect(cache.get("a", Date.now() + 2000)).toBeUndefined();
  });

  it("measures throughput honestly (never claims unmeasured speed)", async () => {
    const engine = new ComputationEngine<number, number>({ concurrency: 8 });
    const tasks: ComputeTask<number, number>[] = Array.from(
      { length: 100 },
      (_, i) => ({
        key: `m${i}`,
        input: i,
        compute: async (n: number) => {
          await new Promise((r) => setTimeout(r, 1));
          return n * n;
        },
        cacheable: true,
      }),
    );
    const t0 = Date.now();
    const results = await engine.run(tasks);
    const totalMs = Math.max(1, Date.now() - t0);
    const m = measure(results, totalMs);
    expect(m.tasks).toBe(100);
    expect(m.tasksPerSecond).toBeGreaterThan(0);
    expect(m.speedupVsBaseline).toBeUndefined(); // no baseline → no claim
  });

  it("computes large numeric batches deterministically in order", async () => {
    const items = Array.from({ length: 2000 }, (_, i) => i);
    const out = await computeNumericBatch(items, (n) => n * 3, {
      batchSize: 250,
    });
    expect(out[0]).toBe(0);
    expect(out[1999]).toBe(5997);
    expect(out.length).toBe(2000);
  });
});

// ---------------------------------------------------------
// §5 Global markets
// ---------------------------------------------------------
describe("§5 global market research", () => {
  const base: GlobalMarketObservation = {
    id: "o1",
    sector: "construction_materials",
    kind: "PRICE_OBSERVATION",
    region: "NG-Lagos",
    observed_at: "2026-09-01",
    source: "public-price-list",
    statement: "50kg cement bag listed at ₦9,500.",
    currency: "NGN",
    confidence: 0.7,
    validation_state: "UNVERIFIED",
  };

  it("validates provenance requirements", () => {
    expect(validateMarketObservation(base).ok).toBe(true);
    expect(validateMarketObservation({ ...base, region: "" }).ok).toBe(false);
    expect(validateMarketObservation({ ...base, source: "" }).ok).toBe(false);
    expect(validateMarketObservation({ ...base, confidence: 1.5 }).ok).toBe(
      false,
    );
  });

  it("never lets observations be born VERIFIED or CONFIGURED", () => {
    expect(
      validateMarketObservation({ ...base, validation_state: "VERIFIED" }).ok,
    ).toBe(false);
    expect(
      validateMarketObservation({ ...base, validation_state: "CONFIGURED" }).ok,
    ).toBe(false);
  });

  it("aggregates are INFERRED with the weakest source confidence", () => {
    const aggs = aggregateObservations([
      base,
      { ...base, id: "o2", confidence: 0.3, source: "second-list" },
    ]);
    expect(aggs.length).toBe(1);
    expect(aggs[0].validation_state).toBe("INFERRED");
    expect(aggs[0].confidence).toBe(0.3);
    expect(aggs[0].observation_count).toBe(2);
    expect(aggs[0].sources.length).toBe(2);
  });
});

// ---------------------------------------------------------
// §12 Platform identity & routing
// ---------------------------------------------------------
describe("§12 global orchestrator", () => {
  const registry = new AuthorizationRegistry();

  it("states the platform identity", () => {
    expect(ARCHIE_IDENTITY.is).toContain("general intelligence");
    expect(ARCHIE_IDENTITY.powers).toContain("FRELUX");
  });

  it("routes global learning and research as free capabilities", () => {
    const d = route(
      { world: "GLOBAL_KNOWLEDGE", action: "learn about networking" },
      registry,
    );
    expect(d.ok).toBe(true);
    const m = route(
      { world: "MARKET_RESEARCH", action: "research cement prices" },
      registry,
    );
    expect(m.ok).toBe(true);
  });

  it("routes unknown domains into discovery, never refusal", () => {
    const d = route(
      {
        world: "GLOBAL_KNOWLEDGE",
        domains: ["quantum_materials"],
        action: "learn",
      },
      registry,
    );
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.route).toContain("new-domain-discovery");
  });

  it("routes FRELUX-environment requests to the core orchestrator", () => {
    const d = route(
      { world: "FRELUX_ENVIRONMENT", action: "read calculator config" },
      registry,
    );
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.route).toBe("core-orchestrator");
  });

  it("gates consequential FRELUX actions on owner authority", () => {
    const d = route(
      {
        world: "FRELUX_ENVIRONMENT",
        action: "deploy code to production",
        authorityRequired: "deploy_code",
        scope: "frelux",
      },
      registry,
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.needsOwner).toBe(true);
  });

  it("authorizes website inspection only for eligible URLs", () => {
    const ok = route(
      {
        world: "WEBSITE_INSPECTION",
        action: "inspect",
        scope: "https://example.com",
      },
      registry,
    );
    expect(ok.ok).toBe(true);
    const bad = route(
      {
        world: "WEBSITE_INSPECTION",
        action: "inspect",
        scope: "https://example.com/login",
      },
      registry,
    );
    expect(bad.ok).toBe(false);
    const local = route(
      {
        world: "WEBSITE_INSPECTION",
        action: "inspect",
        scope: "http://localhost:3000",
      },
      registry,
    );
    expect(local.ok).toBe(false); // private hosts refused by the contract
  });

  it("gates security execution through the security framework", () => {
    const study = route(
      { world: "SECURITY_WORK", action: "study threat modeling for defense" },
      registry,
    );
    expect(study.ok).toBe(true);
    const exec = route(
      {
        world: "SECURITY_WORK",
        action: "run an authorized penetration test",
        authorityRequired: "run_authorized_security_test",
        scope: "https://victim.com",
      },
      registry,
    );
    expect(exec.ok).toBe(false);
  });

  it("routes self-evolution through its own owner-gated pipeline", () => {
    const d = route(
      { world: "SELF_EVOLUTION", action: "propose an improvement" },
      registry,
    );
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.route).toBe("evolution-change-pipeline");
  });

  it("distinguishes studyable domains from operationally gated ones", () => {
    expect(isStudyableDomain("cybersecurity")).toBe(true);
    expect(isStudyableDomain("construction")).toBe(true);
    expect(isOperationallyGated("cybersecurity")).toBe(true);
    expect(isOperationallyGated("construction")).toBe(false);
  });

  it("treats every request world consistently", () => {
    const worlds: GlobalRequest["world"][] = [
      "GLOBAL_KNOWLEDGE",
      "FRELUX_ENVIRONMENT",
      "SECURITY_WORK",
      "WEBSITE_INSPECTION",
      "MARKET_RESEARCH",
      "COMPUTATION",
      "SELF_EVOLUTION",
    ];
    for (const w of worlds) {
      const d = route(
        {
          world: w,
          action: "test",
          scope: w === "WEBSITE_INSPECTION" ? "https://example.com" : undefined,
        },
        registry,
      );
      expect(d.ok).toBe(true); // free-capability worlds all route
    }
  });
});
