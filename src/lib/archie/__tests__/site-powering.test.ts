// =========================================================
// ARCHIE SITE POWERING & RESILIENCE TESTS
//
// Verifies ARCHIE's capability to power FRELUX or any website
// owned by the user efficiently, reliably, and without glitches,
// bugs, gaps, or errors.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  registerOwnerWebsite,
  resolveOwnerWebsite,
  listOwnerWebsites,
  executeWithGlitchShield,
  inspectAndHealSiteGaps,
  optimizeExecution,
  purgeStalePerformanceCache,
  getSiteHealthReport,
  powerWebsite,
} from "@/lib/archie/site-powering";

describe("ARCHIE Multi-Site Registry", () => {
  it("has FRELUX registered as the primary powered website", () => {
    const frelux = resolveOwnerWebsite("frelux");
    expect(frelux).toBeDefined();
    expect(frelux?.isPrimary).toBe(true);
    expect(frelux?.domains).toContain("frelux.tools");
    expect(frelux?.capabilities).toContain("calculators");
    expect(frelux?.capabilities).toContain("error_shield");
  });

  it("registers and resolves any owner website by id or domain", () => {
    const newSite = registerOwnerWebsite({
      siteId: "my-portfolio-2026",
      name: "Anthony's Engineering Studio",
      domains: ["studio.anthony.dev", "anthonystudio.com"],
      environment: "production",
      capabilities: ["ai_chat", "search", "error_shield"],
      config: { theme: "dark", author: "Anthony" },
    });

    expect(newSite.siteId).toBe("my-portfolio-2026");
    expect(resolveOwnerWebsite("my-portfolio-2026")?.name).toBe("Anthony's Engineering Studio");
    expect(resolveOwnerWebsite("studio.anthony.dev")?.siteId).toBe("my-portfolio-2026");
    expect(resolveOwnerWebsite("anthonystudio.com")?.siteId).toBe("my-portfolio-2026");

    const all = listOwnerWebsites();
    expect(all.some((s) => s.siteId === "my-portfolio-2026")).toBe(true);
  });
});

describe("ARCHIE GlitchShield (Zero-Glitch Runtime Guard)", () => {
  it("executes operations successfully without glitch", async () => {
    const res = await executeWithGlitchShield("frelux", "computeEstimate", () => {
      return { cost: 50000, currency: "NGN" };
    });
    expect(res.ok).toBe(true);
    expect(res.data.cost).toBe(50000);
    expect(res.preventedGlitch).toBe(false);
  });

  it("recovers from transient network or execution failures via automatic retry", async () => {
    let callCount = 0;
    const res = await executeWithGlitchShield(
      "frelux",
      "flakyApiCall",
      () => {
        callCount++;
        if (callCount < 2) {
          throw new Error("Temporary network glitch");
        }
        return { recovered: true, callCount };
      },
      { retries: 2, retryDelayMs: 10 },
    );

    expect(res.ok).toBe(true);
    expect(res.data.recovered).toBe(true);
    expect(res.preventedGlitch).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it("activates graceful fallback when an operation completely fails (eliminating crashes)", async () => {
    const res = await executeWithGlitchShield(
      "frelux",
      "fatalDatabaseError",
      () => {
        throw new Error("Critical database failure");
      },
      {
        retries: 1,
        retryDelayMs: 5,
        fallback: { status: "cached_offline", items: [] },
      },
    );

    expect(res.ok).toBe(true);
    expect(res.preventedGlitch).toBe(true);
    expect(res.data).toEqual({ status: "cached_offline", items: [] });
    expect(res.error).toContain("Critical database failure");
  });

  it("enforces timeout budgets and shields against freezing promises", async () => {
    const res = await executeWithGlitchShield(
      "frelux",
      "hangingPromise",
      () => new Promise((resolve) => setTimeout(resolve, 500)),
      {
        timeoutMs: 50,
        retries: 0,
        fallback: { timedOutGracefully: true },
      },
    );

    expect(res.ok).toBe(true);
    expect((res.data as any).timedOutGracefully).toBe(true);
    expect(res.preventedGlitch).toBe(true);
    expect(res.error).toMatch(/timed out/i);
  });
});

describe("ARCHIE GapEliminator (Proactive Data & Config Healing)", () => {
  it("detects and heals missing site configurations", () => {
    registerOwnerWebsite({
      siteId: "empty-config-site",
      name: "Empty Site",
      domains: ["emptysite.com"],
      config: {},
    });

    const report = inspectAndHealSiteGaps("empty-config-site");
    expect(report.gapsDetected).toBeGreaterThan(0);
    expect(report.gapsHealed).toBe(report.gapsDetected);

    const site = resolveOwnerWebsite("empty-config-site");
    expect(site?.config.poweredBy).toBe("ARCHIE");
    expect(site?.config.currency).toBe("NGN");
  });

  it("synthesizes missing calculation parameters in runtime payloads", () => {
    const payload: Record<string, unknown> = {
      length: 10,
      height: 3,
    };

    const report = inspectAndHealSiteGaps("frelux", payload);
    expect(report.gapsHealed).toBeGreaterThan(0);
    expect(payload.wallArea).toBe(30);
  });
});

describe("ARCHIE Performance Optimizer", () => {
  it("deduplicates concurrent in-flight requests (request coalescing)", async () => {
    let executionTimes = 0;
    const task = () =>
      optimizeExecution(
        "heavy-calc-key",
        async () => {
          executionTimes++;
          await new Promise((r) => setTimeout(r, 20));
          return 42;
        },
        500,
      );

    const [r1, r2, r3] = await Promise.all([task(), task(), task()]);
    expect(r1).toBe(42);
    expect(r2).toBe(42);
    expect(r3).toBe(42);
    expect(executionTimes).toBe(1);
  });

  it("purges stale cache entries", () => {
    const purged = purgeStalePerformanceCache();
    expect(typeof purged).toBe("number");
  });
});

describe("ARCHIE Unified Site Powering", () => {
  it("powers calculations on FRELUX with zero gaps and errors", async () => {
    const res = await powerWebsite("frelux", {
      action: "CALCULATE",
      payload: {
        length: 8,
        height: 2.5,
        coveragePerLitre: 10,
      },
    });

    expect(res.ok).toBe(true);
    expect(res.siteId).toBe("frelux");
    expect((res.data as any).calculatedArea).toBe(20);
    expect((res.data as any).litresNeeded).toBe(2);
    expect(res.resilience.gapsHealed).toBeGreaterThanOrEqual(1); // healed wallArea gap
  });

  it("powers custom owner websites reliably", async () => {
    registerOwnerWebsite({
      siteId: "lagos-build",
      name: "Lagos Build Depot",
      domains: ["lagosbuild.com"],
    });

    const res = await powerWebsite("lagosbuild.com", {
      action: "CHAT",
      payload: { message: "What paint primer should I use for damp wall?" },
    });

    expect(res.ok).toBe(true);
    expect(res.siteId).toBe("lagos-build");
    expect((res.data as any).poweredBy).toBe("ARCHIE");
  });

  it("provides comprehensive self-healing site diagnostics", () => {
    const report = getSiteHealthReport("frelux");
    expect(report.siteId).toBe("frelux");
    expect(report.healthy).toBe(true);
    expect(report.uptimePercentage).toBeGreaterThanOrEqual(99);
    expect(report.capabilitiesActive).toContain("error_shield");
  });
});
