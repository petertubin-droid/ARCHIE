// =========================================================
// FRELUX ARCHIE STAGE 1, SYSTEM REGISTRY TESTS
//
// Honesty contract for the Owner Control Dashboard:
//  * systems with a real backend report operational with
//    real figures
//  * systems without a backend report ADAPTER PENDING —
//    never fake "operational"
//  * security severity drives alert/degraded states
// =========================================================
import { describe, it, expect } from "vitest";
import { buildSystemsRegistry, type ArchieStatus } from "@/lib/archie/status";

const base: ArchieStatus = {
  coreReachable: true,
  domains: { total: 10, active: 8 },
  knowledge: { active: 42 },
  learning: {
    ingestions: 5,
    processing: 0,
    pipeline_states: { AWAITING_APPROVAL: 5 },
  },
  agents: { total: 3, active: 1, by_status: { EXECUTING: 1, TERMINATED: 2 } },
  devices: { trusted: 2, pending: 1 },
  security: { events24h: 0, latestSeverity: null },
  projects: { contractorProjects: 7, estimates: 120 },
  conversations: 4,
  infraCostMonthCents: 5432,
};

describe("buildSystemsRegistry", () => {
  it("reports real systems as operational with real figures", () => {
    const sections = buildSystemsRegistry(base);
    const knowledge = sections.find((s) => s.key === "knowledge");
    expect(knowledge?.state).toBe("operational");
    expect(knowledge?.detail).toContain("42");

    const devices = sections.find((s) => s.key === "devices");
    expect(devices?.detail).toContain("2 trusted");
    expect(devices?.detail).toContain("1 pending");

    const costs = sections.find((s) => s.key === "costs");
    expect(costs?.detail).toContain("$54.32");
  });

  it("marks systems without a backend as adapter-pending, never operational", () => {
    const sections = buildSystemsRegistry(base);
    // Only systems with NO deployed backend remain pending.
    const pendingKeys = ["properties", "location"];
    for (const key of pendingKeys) {
      const s = sections.find((x) => x.key === key);
      expect(s, `missing section ${key}`).toBeDefined();
      expect(s?.state).toBe("pending");
      expect(s?.detail.length).toBeGreaterThan(0);
    }
  });

  it("claims operational ONLY for adapters with a real deployed backend", () => {
    const sections = buildSystemsRegistry(base);
    // market: price lookup wired in archie-chat (mi_approved_prices /
    // mi_price_observations), tested end-to-end.
    const market = sections.find((x) => x.key === "market");
    expect(market?.state).toBe("operational");
    expect(market?.detail).toContain("mi_approved_prices");
    // web: in-engine research pipeline (DuckDuckGo Lite, tested).
    const web = sections.find((x) => x.key === "web");
    expect(web?.state).toBe("operational");
    expect(web?.detail).toContain("research pipeline");
    // code: deterministic static analysis in chat (tested).
    const code = sections.find((x) => x.key === "code");
    expect(code?.state).toBe("operational");
    expect(code?.detail).toContain("static analysis");
    // documents/images: ingestion adapter over real pipeline rows.
    for (const key of ["documents", "images"]) {
      const row = sections.find((x) => x.key === key);
      expect(row?.state).toBe("operational");
      expect(row?.detail).toContain("frelux_archie_ingestions");
    }
    // voice: bank status only — transcription honestly disclaimed.
    const voice = sections.find((x) => x.key === "voice");
    expect(voice?.state).toBe("operational");
    expect(voice?.detail).toContain("frelux_archie_voice_samples");
    expect(voice?.detail).toContain("NOT implemented");
    // social: account status, tokens never surfaced.
    const social = sections.find((x) => x.key === "social");
    expect(social?.state).toBe("operational");
    expect(social?.detail).toContain("frelux_social_accounts");
    // family: trusted-people roster.
    const family = sections.find((x) => x.key === "family");
    expect(family?.state).toBe("operational");
    expect(family?.detail).toContain("frelux_archie_people");
    // construction: deterministic calculators.
    const construction = sections.find((x) => x.key === "construction");
    expect(construction?.state).toBe("operational");
    expect(construction?.detail).toContain("stated assumptions");
  });

  it("escelates security state from real event severity", () => {
    const critical = buildSystemsRegistry({
      ...base,
      security: { events24h: 1, latestSeverity: "CRITICAL" },
    });
    expect(critical.find((s) => s.key === "security")?.state).toBe("alert");

    const warning = buildSystemsRegistry({
      ...base,
      security: { events24h: 3, latestSeverity: "WARNING" },
    });
    expect(warning.find((s) => s.key === "security")?.state).toBe("degraded");

    const calm = buildSystemsRegistry(base);
    expect(calm.find((s) => s.key === "security")?.state).toBe("operational");
  });

  it("covers every Owner dashboard section with unique keys", () => {
    const sections = buildSystemsRegistry(base);
    const expected = [
      "intelligence",
      "knowledge",
      "learning",
      "projects",
      "properties",
      "construction",
      "calculators",
      "market",
      "web",
      "code",
      "sentry",
      "documents",
      "images",
      "voice",
      "location",
      "social",
      "professional",
      "devices",
      "family",
      "api",
      "agents",
      "infrastructure",
      "security",
      "permissions",
      "audit",
      "integrations",
      "costs",
      "config",
    ];
    expect(sections.map((s) => s.key).sort()).toEqual([...expected].sort());
    expect(new Set(sections.map((s) => s.key)).size).toBe(expected.length);
  });
});
