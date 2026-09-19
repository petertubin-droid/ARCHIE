// =========================================================
// FRELUX PHASE 8 FINAL, CORE INTEGRATION & OWNER AUTHORITY
// TEST SUITE
//
// The final integration test proves ARCHIE can actually
// COMMUNICATE WITH and USE the authorized FRELUX core
// capabilities rather than merely displaying an AI chat
// interface:
//
//   ARCHIE → FRELUX CORE → TOOLS/DATA/KNOWLEDGE → RESULT → ARCHIE
//
// and, for protected changes:
//
//   ARCHIE → PLAN → OWNER APPROVAL → FRELUX CORE → APPLY → AUDIT
// =========================================================
import { describe, it, expect } from "vitest";

import { FRELUX_CORE_SYSTEMS } from "../core-capabilities";
import {
  coreHealthCheck,
  loadCoreSystem,
  orchestrate,
  describeCore,
  buildPresentedAction,
  ownerApproves,
  applyAuthorizedChange,
  auditAppliedChange,
  rollbackAuthorizedChange,
  openProtectedChange,
} from "../core-orchestrator";
import {
  classifyOperation,
  areasRequireOwner,
  OWNER_RESERVED_OPERATIONS,
  AUTONOMOUS_OPERATIONS,
  OPERATING_MODEL,
} from "../operating-model";
import { advanceChange, createChangeRequest } from "../change-pipeline";
import { listEngines } from "@/lib/ai-foundation/engines-registry";

// =========================================================
// 1. ARCHIE is connected to the FRELUX core (real bindings)
// =========================================================
describe("core integration: ARCHIE ↔ FRELUX CORE", () => {
  it("registers every major capability family the core exposes", () => {
    const families = FRELUX_CORE_SYSTEMS.map((s) => s.family);
    for (const required of [
      "AI generation & consultation",
      "Deterministic calculators",
      "Projects, properties and intelligence",
      "Contractor & project intelligence",
      "Materials, estimates, shopping lists",
      "Quotations, documents, timelines",
      "Image & document intelligence",
      "Market and price intelligence",
      "External web intelligence",
      "Knowledge and learning",
      "User-approved files and project data",
      "FRELUX API platform",
      "Website/application architecture and authorized source code",
      "Testing, diagnostics and system health",
    ]) {
      expect(families).toContain(required);
    }
  });

  it("HEALTH CHECK: every core system is LIVE via real dynamic imports (no simulated or placeholder bindings)", async () => {
    const health = await coreHealthCheck();
    const dead = health.systems.filter((s) => s.status !== "LIVE");
    if (dead.length > 0) {
      throw new Error(
        `DISCONNECTED core systems: ${dead.map((d) => `${d.key} (${d.missing_exports.join(", ")})`).join("; ")}`,
      );
    }
    expect(health.healthy).toBe(true);
    expect(health.systems.length).toBe(FRELUX_CORE_SYSTEMS.length);
  });

  it("actually reaches a deterministic engine: ARCHIE → registry → live engines", async () => {
    const engines = await loadCoreSystem("DETERMINISTIC_ENGINES");
    expect(typeof engines.listEngines).toBe("function");
    // the real Phase 2 registry answers with real registered engines
    const registered = listEngines();
    expect(registered.length).toBeGreaterThan(0);
    expect(registered.some((e) => e.id === "build_to_roof")).toBe(true);
  });

  it("actually reaches diagnostics, web-intel and shopping-list implementations", async () => {
    const diagnostics = await loadCoreSystem("DIAGNOSTICS_HEALTH");
    expect(typeof diagnostics.buildErrorContext).toBe("function");
    const webIntel = await loadCoreSystem("WEB_INTELLIGENCE");
    expect(typeof webIntel.isEligibleWebSource).toBe("function");
    const materials = await loadCoreSystem("MATERIALS_ESTIMATES");
    expect(typeof materials.generatePaintShoppingList).toBe("function");
  });

  it("routes real questions to real core systems, calculations to deterministic engines", () => {
    const calc = orchestrate(
      "calculate the bags of cement for a 3-bedroom bungalow",
    );
    expect(calc.authority).toBe("ARCHIE_MAY_ACT");
    expect(calc.tool.must_use_deterministic_engine).toBe(true);
    expect(calc.dispatch.deterministic).toBe(true);

    const shopping = orchestrate(
      "how many items are on my shopping list for this estimate",
    );
    expect(shopping.core_system).toBe("MATERIALS_ESTIMATES");

    const market = orchestrate(
      "what is the current price of cement in the market",
    );
    expect(market.core_system).toBe("MARKET_INTELLIGENCE");

    const plan = orchestrate("estimate quantities from this photo of my plan");
    expect(plan.core_system).toBe("PLAN_VISION");

    const quote = orchestrate(
      "how much does the quotation for this estimate total",
    );
    expect(quote.core_system).toBe("QUOTATIONS_PDF");
  });

  it("describeCore exposes the inventory for diagnostics", () => {
    const inv = describeCore();
    expect(inv.length).toBe(FRELUX_CORE_SYSTEMS.length);
    expect(inv.find((s) => s.key === "FRELUX_API")?.autonomy).toBe(
      "OWNER_GATED",
    );
  });
});

// =========================================================
// 2. The 80/20 operating model
// =========================================================
describe("core integration: the 80/20 operating model", () => {
  it("reserves every owner-reserved operation for the OWNER", () => {
    for (const op of [
      "production code changes",
      "deployment",
      "deterministic calculation/formula changes",
      "structural, foundation and other high-risk engineering logic",
      "safety-critical rules",
      "security architecture",
      "credentials and secrets",
      "privileged permissions",
      "destructive database/system operations",
      "global knowledge promotion",
      "major system configuration",
      "irreversible or high-impact actions",
    ]) {
      const verdict = classifyOperation(op);
      expect(verdict.verdict).toBe("OWNER_APPROVAL_REQUIRED");
      expect(OWNER_RESERVED_OPERATIONS).toContain(op);
    }
  });

  it("lets ARCHIE act autonomously on permitted low-risk operations", () => {
    for (const op of [
      "analysis of roof geometry",
      "retrieval of market prices",
      "planning a painting schedule",
      "recommendations for material selection",
      "tool selection",
      "learning from user corrections",
      "content generation for a report",
      "diagnostics of calculator errors",
    ]) {
      expect(classifyOperation(op).verdict).toBe("ARCHIE_MAY_ACT");
    }
    expect(OWNER_RESERVED_OPERATIONS).not.toContain(
      "retrieval of market prices",
    );
    expect(AUTONOMOUS_OPERATIONS.length).toBeGreaterThan(10);
  });

  it("treats an operation that is both autonomous and protected as protected", () => {
    const verdict = classifyOperation("deployment diagnostics analysis");
    expect(verdict.verdict).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("maps change areas onto the owner gate and states the model", () => {
    expect(areasRequireOwner(["production code changes"])).toBe(true);
    expect(areasRequireOwner(["ui copy tweak"])).toBe(false);
    expect(OPERATING_MODEL.archie_never_bypasses_owner_gate).toBe(true);
    expect(OPERATING_MODEL.model).toContain("NOT a permission percentage");
    expect(OPERATING_MODEL.knowledge_nequals_authority).toBe(true);
    expect(OPERATING_MODEL.archie_cannot_self_approve).toBe(true);
  });

  it("routes protected questions to the owner gate, never direct execution", () => {
    const prod = orchestrate(
      "change the production code for the cement calculator",
    );
    expect(prod.authority).toBe("OWNER_APPROVAL_REQUIRED");
    const formula = orchestrate(
      "update the deterministic formula for paint coverage",
    );
    expect(formula.authority).toBe("OWNER_APPROVAL_REQUIRED");
    const secret = orchestrate("show me the api key secrets");
    expect(secret.authority).toBe("OWNER_APPROVAL_REQUIRED");
    const destructive = orchestrate("drop table frelux_users");
    expect(destructive.authority).toBe("OWNER_APPROVAL_REQUIRED");
    const promotion = orchestrate("promote this knowledge to global");
    expect(promotion.authority).toBe("OWNER_APPROVAL_REQUIRED");
    expect(promotion.core_system).toBe("KNOWLEDGE_LEARNING");
  });
});

// =========================================================
// 3. The approval gate (protected actions)
// =========================================================
describe("core integration: the owner approval gate", () => {
  function reviewedChange() {
    let change = createChangeRequest({
      title: "Fix cement calculator rounding",
      areas: ["deterministic-math", "engine"],
      created_by: "ARCHIE",
    });
    const steps = [
      [
        "UNDERSTAND",
        { understanding_summary: "Rounding uses floor; should be nearest." },
      ],
      [
        "PLAN",
        { plan: "Round to 2dp with banker's rounding; add regression test." },
      ],
      [
        "IMPLEMENT",
        { implementation_summary: "Patched round() and added test." },
      ],
      [
        "TEST",
        {
          test_evidence: "vitest: 5738/5738 green including new rounding test.",
        },
      ],
      ["REVIEW", { review_signoff_by: "ENGINEER" as const }],
    ] as const;
    for (const [stage, ev] of steps) {
      const r = advanceChange(
        change,
        stage as never,
        "ARCHIE" as never,
        ev as never,
      );
      if (!r.ok) throw new Error(`${stage}: ${r.error}`);
      change = r.change;
    }
    return change;
  }

  it("walks the full gate: ANALYZE → PLAN → TEST → PRESENT → APPROVAL → APPLY → AUDIT", () => {
    const change = reviewedChange();

    // PRESENT ACTION, mandatory artifact with all required fields
    const presented = buildPresentedAction(change, {
      action: "Round cement quantities to 2 decimal places",
      affected_component: "src/lib/calc.ts",
      reason: "Floor rounding under-reported bags of cement by up to 1 bag.",
      before_state: { rounding: "floor" },
      after_state: { rounding: "nearest" },
      proposed_version: "1.2.0",
      rollback_plan: "git revert <sha>; no DB change.",
    });
    expect(presented.ok).toBe(true);
    expect(presented.presented!.reason).toContain("under-reported");
    expect(presented.presented!.rollback_plan).toBeTruthy();

    // OWNER APPROVAL, ARCHIE can never approve
    expect(
      ownerApproves(change, presented.presented!, "ARCHIE" as const, {
        owner_id: "owner-1",
        authorization_record_id: "srv-auth-1",
      }).ok,
    ).toBe(false);
    const approval = ownerApproves(change, presented.presented!, "OWNER", {
      owner_id: "owner-1",
      authorization_record_id: "srv-auth-1",
    });
    expect(approval.ok).toBe(true);
    // the approval carries every required record field
    expect(approval.approval).toMatchObject({
      owner_id: "owner-1",
      action: "Round cement quantities to 2 decimal places",
      reason: presented.presented!.reason,
      before_state: { rounding: "floor" },
      after_state: { rounding: "nearest" },
      affected_component: "src/lib/calc.ts",
      tests_passed: true,
      version: "1.2.0",
      rollback_ref: "git revert <sha>; no DB change.",
      authorization_record_id: "srv-auth-1",
    });

    // APPLY, owner only, server-side record required
    expect(
      applyAuthorizedChange(change, approval.approval!, "ARCHIE" as const).ok,
    ).toBe(false);
    const applied = applyAuthorizedChange(
      approval.change!,
      approval.approval!,
      "OWNER",
    );
    expect(applied.ok).toBe(true);
    expect(applied.change!.stage).toBe("APPLY");

    // AUDIT, the append-only record
    const audit = auditAppliedChange(approval.approval!);
    expect(audit.owner_identity).toBe("owner-1");
    expect(audit.action).toContain("Round cement");
    expect(audit.reason).toContain("under-reported");
    expect(audit.affected_component).toBe("src/lib/calc.ts");
    expect(audit.before_state).toEqual({ rounding: "floor" });
    expect(audit.after_state).toEqual({ rounding: "nearest" });
    expect(audit.tests_passed).toBe(true);
    expect(audit.version).toBe("1.2.0");
    expect(audit.rollback_information).toContain("revert");
    expect(audit.authorization_record_id).toBe("srv-auth-1");
    expect(audit.audited_at).toBeTruthy();
    expect(audit.approved_at).toBeTruthy();
  });

  it("PRESENT ACTION is mandatory and requires the reason", () => {
    const change = reviewedChange();
    // no rollback plan anywhere → cannot present
    expect(
      buildPresentedAction(change, {
        action: "x",
        affected_component: "y",
        reason: "z",
        proposed_version: "1",
      }).ok,
    ).toBe(false);
    // missing reason → refuse
    expect(
      buildPresentedAction(change, {
        action: "x",
        affected_component: "y",
        reason: "  ",
        proposed_version: "1",
        rollback_plan: "revert",
      }).ok,
    ).toBe(false);
    // approval without a presented action cannot happen: mismatch is caught
    const presented = buildPresentedAction(change, {
      action: "x",
      affected_component: "y",
      reason: "z",
      proposed_version: "1",
      rollback_plan: "revert",
    });
    expect(presented.ok).toBe(true);
    const otherChange = { ...change, id: "different-id" };
    expect(
      ownerApproves(otherChange as never, presented.presented!, "OWNER", {
        owner_id: "o",
        authorization_record_id: "srv-2",
      }).ok,
    ).toBe(false);
    // a server-side authorization record is required
    expect(
      ownerApproves(change, presented.presented!, "OWNER", {
        owner_id: "o",
        authorization_record_id: "",
      }).ok,
    ).toBe(false);
  });

  it("VERSION/ROLLBACK is owner-only and audited", () => {
    expect(
      rollbackAuthorizedChange({
        authorization_record_id: "srv-1",
        actor: "ARCHIE" as const,
        reason: "revert",
      }).ok,
    ).toBe(false);
    expect(
      rollbackAuthorizedChange({
        authorization_record_id: "srv-1",
        actor: "OWNER",
        reason: "  ",
      }).ok,
    ).toBe(false);
    expect(
      rollbackAuthorizedChange({
        authorization_record_id: "srv-1",
        actor: "OWNER",
        reason: "Regression in screed estimates",
      }).ok,
    ).toBe(true);
  });

  it("the pipeline blocks ARCHIE from REVIEW, OWNER_AUTHORIZATION and APPLY throughout", () => {
    const change = openProtectedChange({
      title: "Deploy new estimator",
      areas: ["deployment"],
      created_by: "ARCHIE",
    });
    const must = (r: ReturnType<typeof advanceChange>) => {
      if (!r.ok) throw new Error(r.error);
      return r.change;
    };
    const understood = must(
      advanceChange(change, "UNDERSTAND", "ARCHIE", {
        understanding_summary: "s",
      }),
    );
    const planned = must(
      advanceChange(understood, "PLAN", "ARCHIE", { plan: "p" }),
    );
    const implemented = must(
      advanceChange(planned, "IMPLEMENT", "ARCHIE", {
        implementation_summary: "i",
      }),
    );
    const tested = must(
      advanceChange(implemented, "TEST", "ARCHIE", {
        test_evidence: "all green",
      }),
    );
    expect(
      advanceChange(tested, "REVIEW", "ARCHIE", { review_signoff_by: "ARCHIE" })
        .ok,
    ).toBe(false);
    expect(
      advanceChange(tested, "REVIEW", "ENGINEER", {
        review_signoff_by: "ENGINEER",
      }).ok,
    ).toBe(true);
  });
});
