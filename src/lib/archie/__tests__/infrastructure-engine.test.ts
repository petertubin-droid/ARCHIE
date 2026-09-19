// =========================================================
// ARCHIE INFRASTRUCTURE ENGINE — unit + orchestration tests
// src/lib/archie/__tests__/infrastructure-engine.test.ts
//
// Engine inventory #26 (anatomy "legs"):
//   * month window math (UTC)
//   * cost aggregation per provider + linear projection
//   * budget evaluation: per-provider, global '*' fallback,
//     UNBUDGETED honesty, emergency + exhaustion policy
//   * overall status classification (probe failures,
//     database-down, budget emergency)
//   * full assessInfrastructure orchestration with fakes
//     (no network, no DB)
//
// HARD RULES under test:
//   * probes are read-only and report failures honestly —
//     unreachable is a failure, never OK
//   * unknown data is UNKNOWN/UNBUDGETED, never green
//   * projection is linear and labelled, never invented
// =========================================================
import { describe, it, expect } from "vitest";
import {
  aggregateCosts,
  assessInfrastructure,
  BudgetRow,
  classifyInfraStatus,
  CostRow,
  evaluateBudgets,
  InfrastructureDeps,
  monthWindow,
} from "@studio-shared/archie-ai/infrastructure/engine.ts";

// ---------------------------------------------------------
// Fakes
// ---------------------------------------------------------
const NOW = new Date("2026-09-15T12:00:00Z"); // mid-month, 15 days elapsed of 30

function costRow(overrides: Partial<CostRow> = {}): CostRow {
  return {
    provider: "openai",
    operation: "chat-completion",
    cost_actual_cents: 10,
    cost_estimate_cents: 10,
    occurred_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function budget(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    provider: "openai",
    monthly_budget_cents: 10000,
    emergency_threshold_pct: 90,
    exhaustion_policy: "QUEUE",
    active: true,
    ...overrides,
  };
}

function makeDeps(
  overrides: {
    costs?: CostRow[];
    budgets?: BudgetRow[];
    fetchImpl?: typeof fetch;
  } = {},
): InfrastructureDeps {
  return {
    getMonthCosts: async () => overrides.costs ?? [],
    getBudgets: async () => overrides.budgets ?? [],
    fetchFn:
      overrides.fetchImpl ?? (async () => new Response("{}", { status: 200 })),
    supabaseUrl: "https://fake.supabase.co",
    serviceRoleKey: "fake-key",
    frontendUrl: "https://fake-frontend.example",
    probeTimeoutMs: 5000,
    now: () => NOW,
    log: () => {},
  };
}

// ---------------------------------------------------------
// 1. Month window (UTC)
// ---------------------------------------------------------
describe("monthWindow", () => {
  it("computes the UTC month key, start and day count", () => {
    const w = monthWindow(new Date("2026-09-15T12:00:00Z"));
    expect(w.key).toBe("2026-09");
    expect(w.start).toBe("2026-09-01T00:00:00.000Z");
    expect(w.daysInMonth).toBe(30);
  });

  it("handles February in non-leap years", () => {
    const w = monthWindow(new Date("2027-02-05T00:00:00Z"));
    expect(w.daysInMonth).toBe(28);
  });

  it("handles February in leap years", () => {
    const w = monthWindow(new Date("2028-02-05T00:00:00Z"));
    expect(w.daysInMonth).toBe(29);
  });
});

// ---------------------------------------------------------
// 2. Cost aggregation + projection
// ---------------------------------------------------------
describe("aggregateCosts", () => {
  it("aggregates spend per provider, sorted by actual spend desc", () => {
    const rows = [
      costRow({ provider: "openai", cost_actual_cents: 100 }),
      costRow({ provider: "openai", cost_actual_cents: 50 }),
      costRow({ provider: "anthropic", cost_actual_cents: 300 }),
      costRow({ provider: "exa", cost_actual_cents: 20 }),
    ];
    const s = aggregateCosts(rows, monthWindow(NOW), NOW);
    expect(s.total_actual_cents).toBe(470);
    expect(s.by_provider.map((p) => p.provider)).toEqual([
      "anthropic",
      "openai",
      "exa",
    ]);
    expect(s.by_provider[0].operations).toBe(1);
    expect(s.by_provider[1].operations).toBe(2);
  });

  it("projects linearly: 15 elapsed days of a 30-day month doubles the spend", () => {
    const s = aggregateCosts(
      [costRow({ cost_actual_cents: 500 })],
      monthWindow(NOW),
      NOW,
    );
    // NOW is Sept 15 12:00 UTC → 14.5 elapsed days:
    // 500 / 14.5 × 30 = 1034.48 → 1034
    expect(s.projected_month_actual_cents).toBe(1034);
    expect(s.projection_basis).toContain("linear projection");
  });

  it("never divides by zero on day 1 of the month", () => {
    const firstDay = new Date("2026-09-01T00:30:00Z");
    const s = aggregateCosts(
      [costRow({ cost_actual_cents: 100 })],
      monthWindow(firstDay),
      firstDay,
    );
    expect(Number.isFinite(s.projected_month_actual_cents)).toBe(true);
    expect(s.projected_month_actual_cents).toBeGreaterThan(0);
  });

  it("reports an empty month honestly as zero, not unknown", () => {
    const s = aggregateCosts([], monthWindow(NOW), NOW);
    expect(s.total_actual_cents).toBe(0);
    expect(s.by_provider).toEqual([]);
  });
});

// ---------------------------------------------------------
// 3. Budget evaluation
// ---------------------------------------------------------
describe("evaluateBudgets", () => {
  const spend = [
    {
      provider: "openai",
      actual_cents: 8000,
      estimate_cents: 8000,
      operations: 80,
    },
    {
      provider: "anthropic",
      actual_cents: 500,
      estimate_cents: 500,
      operations: 5,
    },
    { provider: "exa", actual_cents: 50, estimate_cents: 50, operations: 1 },
  ];

  it("OK below 75%, WARNING at 75%+, EMERGENCY only at the configured threshold", () => {
    const states = evaluateBudgets(spend, [
      budget({ provider: "openai", monthly_budget_cents: 10000 }),
    ]);
    const openai = states.find((s) => s.provider === "openai");
    expect(openai?.pct_used).toBe(80);
    expect(openai?.status).toBe("WARNING"); // 80% ≥ 75, below the 90% threshold
    expect(openai?.exhaustion_policy).toBeNull(); // no emergency yet

    const at = evaluateBudgets(spend, [
      budget({ provider: "openai", monthly_budget_cents: 8800 }),
    ]);
    expect(at.find((s) => s.provider === "openai")?.status).toBe("EMERGENCY"); // ≥ 90%
  });

  it("EMERGENCY carries the owner's exhaustion policy, not an invented one", () => {
    const states = evaluateBudgets(spend, [
      budget({
        provider: "openai",
        monthly_budget_cents: 8000,
        exhaustion_policy: "STOP",
      }),
    ]);
    const openai = states.find((s) => s.provider === "openai");
    expect(openai?.status).toBe("EMERGENCY");
    expect(openai?.exhaustion_policy).toBe("STOP");
  });

  it("uses the global '*' budget for providers without their own row", () => {
    const states = evaluateBudgets(spend, [
      budget({ provider: "*", monthly_budget_cents: 1000 }),
    ]);
    const exa = states.find((s) => s.provider === "exa");
    expect(exa?.budget_cents).toBe(1000);
    expect(exa?.status).toBe("OK"); // 50/1000 = 5%
  });

  it("reports UNBUDGETED honestly when no budget covers the provider", () => {
    const states = evaluateBudgets(spend, [budget({ provider: "openai" })]);
    const anthropic = states.find((s) => s.provider === "anthropic");
    expect(anthropic?.status).toBe("UNBUDGETED");
    expect(anthropic?.budget_cents).toBeNull();
    expect(anthropic?.exhaustion_policy).toBeNull();
  });

  it("ignores inactive budget rows (falls back to global or UNBUDGETED)", () => {
    const states = evaluateBudgets(spend, [
      budget({ provider: "openai", active: false }),
      budget({ provider: "*", monthly_budget_cents: 100000 }),
    ]);
    const openai = states.find((s) => s.provider === "openai");
    expect(openai?.budget_cents).toBe(100000); // fell back to global
  });

  it("per-provider budget wins over the global budget", () => {
    const states = evaluateBudgets(spend, [
      budget({ provider: "anthropic", monthly_budget_cents: 600 }),
      budget({ provider: "*", monthly_budget_cents: 100000 }),
    ]);
    const anthropic = states.find((s) => s.provider === "anthropic");
    expect(anthropic?.budget_cents).toBe(600);
  });
});

// ---------------------------------------------------------
// 4. Overall status classification
// ---------------------------------------------------------
describe("classifyInfraStatus", () => {
  const okCheck = (name: string) => ({
    name,
    ok: true,
    latency_ms: 100,
    detail: "HTTP 200 in 100ms",
  });
  const failCheck = (name: string) => ({
    name,
    ok: false,
    latency_ms: null,
    detail: "unreachable",
  });
  const okBudget = [
    {
      provider: "x",
      spend_cents: 1,
      budget_cents: 100,
      pct_used: 1,
      status: "OK" as const,
      exhaustion_policy: null,
    },
  ];

  it("HEALTHY when all probes pass and budgets are OK", () => {
    expect(
      classifyInfraStatus(
        [
          okCheck("supabase-rest"),
          okCheck("edge-runtime"),
          okCheck("frontend"),
        ],
        okBudget,
      ),
    ).toBe("HEALTHY");
  });

  it("DEGRADED when a non-database probe fails", () => {
    expect(
      classifyInfraStatus(
        [
          okCheck("supabase-rest"),
          failCheck("edge-runtime"),
          okCheck("frontend"),
        ],
        okBudget,
      ),
    ).toBe("DEGRADED");
  });

  it("CRITICAL when the database probe fails", () => {
    expect(
      classifyInfraStatus(
        [
          failCheck("supabase-rest"),
          okCheck("edge-runtime"),
          okCheck("frontend"),
        ],
        okBudget,
      ),
    ).toBe("CRITICAL");
  });

  it("CRITICAL when half or more of the probes fail", () => {
    expect(
      classifyInfraStatus(
        [
          okCheck("supabase-rest"),
          failCheck("edge-runtime"),
          failCheck("frontend"),
        ],
        okBudget,
      ),
    ).toBe("CRITICAL");
  });

  it("CRITICAL on a budget EMERGENCY even with all probes up", () => {
    const emergency = [
      {
        provider: "x",
        spend_cents: 100,
        budget_cents: 100,
        pct_used: 100,
        status: "EMERGENCY" as const,
        exhaustion_policy: "STOP" as const,
      },
    ];
    expect(
      classifyInfraStatus(
        [
          okCheck("supabase-rest"),
          okCheck("edge-runtime"),
          okCheck("frontend"),
        ],
        emergency,
      ),
    ).toBe("CRITICAL");
  });

  it("DEGRADED on a budget WARNING with all probes up", () => {
    const warning = [
      {
        provider: "x",
        spend_cents: 80,
        budget_cents: 100,
        pct_used: 80,
        status: "WARNING" as const,
        exhaustion_policy: null,
      },
    ];
    expect(
      classifyInfraStatus(
        [
          okCheck("supabase-rest"),
          okCheck("edge-runtime"),
          okCheck("frontend"),
        ],
        warning,
      ),
    ).toBe("DEGRADED");
  });
});

// ---------------------------------------------------------
// 5. assessInfrastructure orchestration
// ---------------------------------------------------------
describe("assessInfrastructure", () => {
  it("runs probes, aggregates costs, evaluates budgets and reports HEALTHY", async () => {
    const deps = makeDeps({
      costs: [costRow({ cost_actual_cents: 500 })],
      budgets: [budget({ provider: "*", monthly_budget_cents: 100000 })],
    });
    const a = await assessInfrastructure(deps);
    expect(a.overall_status).toBe("HEALTHY");
    expect(a.checks.map((c) => c.name)).toEqual([
      "supabase-rest",
      "edge-runtime",
      "frontend",
    ]);
    expect(a.checks.every((c) => c.ok && c.latency_ms !== null)).toBe(true);
    expect(a.cost_summary.total_actual_cents).toBe(500);
    expect(a.emergency).toBe(false);
    expect(a.assessed_at).toBe(NOW.toISOString());
  });

  it("treats an auth-gated edge endpoint (401) as a live runtime", async () => {
    const deps = makeDeps({ fetchImpl: undefined });
    // route map: edge-runtime probe gets 401, everything else 200
    deps.fetchFn = (async (url: RequestInfo | URL) => {
      if (String(url).includes("/functions/v1/health")) {
        return new Response("{}", { status: 401 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const a = await assessInfrastructure(deps);
    const edge = a.checks.find((c) => c.name === "edge-runtime");
    expect(edge?.ok).toBe(true);
    expect(edge?.detail).toContain("401");
  });

  it("reports unreachable dependencies as failed probes, never OK", async () => {
    const deps = makeDeps();
    deps.fetchFn = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    const a = await assessInfrastructure(deps);
    expect(a.checks.every((c) => !c.ok)).toBe(true);
    expect(a.overall_status).toBe("CRITICAL");
    expect(a.checks[0].detail).toContain("connection refused");
  });

  it("surfaces a budget EMERGENCY through the overall status and flag", async () => {
    const deps = makeDeps({
      costs: [costRow({ cost_actual_cents: 9500 })],
      budgets: [budget({ provider: "openai", monthly_budget_cents: 10000 })],
    });
    const a = await assessInfrastructure(deps);
    expect(a.emergency).toBe(true);
    expect(a.overall_status).toBe("CRITICAL");
    const openai = a.budget_states.find((b) => b.provider === "openai");
    expect(openai?.status).toBe("EMERGENCY");
    expect(openai?.exhaustion_policy).toBe("QUEUE");
  });

  it("projects the month from real elapsed days", async () => {
    const deps = makeDeps({
      costs: [costRow({ cost_actual_cents: 1500 })],
    });
    const a = await assessInfrastructure(deps);
    // 1500c over 14.5 elapsed days × 30-day month = 3103
    expect(a.cost_summary.projected_month_actual_cents).toBe(3103);
    expect(a.cost_summary.month).toBe("2026-09");
  });
});
