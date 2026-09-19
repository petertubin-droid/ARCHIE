// =========================================================
// INFRASTRUCTURE PANEL TESTS (Archie Ops console)
//
// The real archie-infra assessment surface:
//   * healthy + degraded assessments render their true state
//   * the cost block is explicitly INTERNAL — never customer
//     credits — and is labeled as such
//   * emergency assessments are impossible to miss
//   * a failed assessment surfaces the error honestly and the
//     re-assess button still works
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/archie/infrastructure-client", () => ({
  assessInfrastructure: vi.fn(),
  getInfrastructureSnapshots: vi.fn(),
}));

import {
  assessInfrastructure,
  getInfrastructureSnapshots,
} from "@/lib/archie/infrastructure-client";
import InfrastructurePanel from "@/components/archie/InfrastructurePanel";

const HEALTHY = {
  ok: true,
  overall_status: "HEALTHY",
  checks: [
    { name: "supabase", ok: true, detail: "reachable", latency_ms: 40 },
    { name: "lexicon", ok: false, detail: "grant gap (403)", latency_ms: null },
  ],
  cost_summary: {
    total_actual_cents: 12345,
    projected_month_actual_cents: 20000,
    projection_basis: "month-to-date",
    by_provider: [
      {
        provider: "openai",
        actual_cents: 10000,
        estimate_cents: 9000,
        operations: 7,
      },
    ],
  },
  budget_states: [
    {
      provider: "openai",
      status: "OK",
      budget_cents: 50000,
      spend_cents: 10000,
      pct_used: 20,
    },
    {
      provider: "*",
      status: "OK",
      budget_cents: null,
      spend_cents: 0,
      pct_used: 0,
    },
  ],
  emergency: false,
  assessed_at: "2026-09-18T10:00:00Z",
};

const SNAPSHOTS = {
  ok: true,
  snapshots: [
    {
      id: "s1",
      overall_status: "HEALTHY",
      checks: HEALTHY.checks,
      cost_summary: HEALTHY.cost_summary,
      budget_states: HEALTHY.budget_states,
      emergency: false,
      assessed_at: "2026-09-18T09:00:00Z",
      created_by: "owner",
      created_date: "2026-09-18T09:00:00Z",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assessInfrastructure).mockResolvedValue(HEALTHY as never);
  vi.mocked(getInfrastructureSnapshots).mockResolvedValue(SNAPSHOTS as never);
});

describe("InfrastructurePanel", () => {
  it("renders the live assessment with its dependency checks", async () => {
    render(<InfrastructurePanel />);
    expect(
      await screen.findByText("Live infrastructure assessment"),
    ).toBeTruthy();
    expect(screen.getAllByText("HEALTHY").length).toBeGreaterThan(0); // assessment + snapshot history both show it
    expect(screen.getByText("supabase")).toBeTruthy();
    expect(screen.getByText(/grant gap/)).toBeTruthy();
  });

  it("the cost block is explicitly internal, never customer credits", async () => {
    render(<InfrastructurePanel />);
    expect(await screen.findByText(/never customer credits/i)).toBeTruthy();
    expect(screen.getAllByText(/₦123/).length).toBeGreaterThan(0); // 12345 cents → ₦123.45 (assessment + snapshots)
    expect(screen.getAllByText(/openai/i).length).toBeGreaterThan(0);
  });

  it("emergency assessments are impossible to miss", async () => {
    vi.mocked(assessInfrastructure).mockResolvedValue({
      ...HEALTHY,
      emergency: true,
      overall_status: "CRITICAL",
    } as never);
    render(<InfrastructurePanel />);
    expect(await screen.findByText("EMERGENCY")).toBeTruthy();
    expect(screen.getByText("CRITICAL")).toBeTruthy();
  });

  it("a failed assessment shows the honest error and stays re-assessable", async () => {
    vi.mocked(assessInfrastructure).mockResolvedValue({
      ok: false,
      error: "gateway unreachable",
    } as never);
    render(<InfrastructurePanel />);
    expect(await screen.findByText("Assessment failed")).toBeTruthy();
    expect(screen.getByText("gateway unreachable")).toBeTruthy();
    // snapshot read still worked, panel stays functional
    const btn = screen.getByRole("button", { name: /re-assess/i });
    vi.mocked(assessInfrastructure).mockResolvedValue(HEALTHY as never);
    fireEvent.click(btn);
    await waitFor(() => expect(assessInfrastructure).toHaveBeenCalledTimes(2));
  });

  it("re-assess button re-runs both the assessment and the snapshot read", async () => {
    render(<InfrastructurePanel />);
    await screen.findAllByText("HEALTHY"); // assessment + snapshot rows
    fireEvent.click(screen.getByRole("button", { name: /re-assess/i }));
    await waitFor(() => expect(assessInfrastructure).toHaveBeenCalledTimes(2));
    expect(getInfrastructureSnapshots).toHaveBeenCalledTimes(2);
  });
});
