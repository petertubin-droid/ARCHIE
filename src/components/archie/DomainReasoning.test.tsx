import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DomainReasoning from "@/components/archie/DomainReasoning";

// persistDomainGaps hits the network via stage clients — mock it.
vi.mock("@/lib/archie/intelligence-client", () => ({
  persistDomainGaps: vi.fn().mockResolvedValue({ ok: true, inserted: 0 }),
}));

function renderWorkspace() {
  return render(<DomainReasoning />);
}

describe("DomainReasoning", () => {
  it("renders the workspace with ARCHIE's real identity", () => {
    renderWorkspace();
    expect(screen.getByText("Domain reasoning")).toBeTruthy();
    expect(
      screen.getByText(/A general intelligence, learning, reasoning/i),
    ).toBeTruthy();
  });

  it("routes a request through the real orchestrator", async () => {
    renderWorkspace();
    const action = screen.getByLabelText("Request action");
    await userEvent.type(action, "study roofing markets in Lagos");
    await userEvent.click(screen.getByText("Route request"));
    expect(await screen.findByText(/Orchestrator decision/)).toBeTruthy();
    // The honest registry grants nothing: owner-only routes show pending.
    expect(screen.getByText(/CAPABILITY_FREE|OWNER_AUTHORIZED/)).toBeTruthy();
  });

  it("the reasoning frame enforces evidence (anti-fabrication)", async () => {
    renderWorkspace();
    await userEvent.click(screen.getByText("Reasoning frame"));
    const subject = screen.getByLabelText("Reasoning subject");
    await userEvent.type(subject, "expanding to Ibadan");
    await userEvent.click(screen.getByText("Build frame"));
    // Zero answers → an honest frame: every lens listed as unanswered.
    expect(await screen.findByText(/0 answered/)).toBeTruthy();
    // Unanswered lenses are listed, never silently dropped.
    expect(screen.getByText(/Unanswered lenses:/)).toBeTruthy();
  });

  it("the weather panel gives deterministic advisories", async () => {
    renderWorkspace();
    await userEvent.click(screen.getByText("Weather plan"));
    // EXTERIOR_PAINTING is selected by default; add ROOFING too.
    await userEvent.click(screen.getByText("ROOFING"));
    await userEvent.click(screen.getByText("Assess plan"));
    expect(await screen.findByText(/Advisories/)).toBeTruthy();
    // Two selected works → two rated advisory lines.
    expect(
      (await screen.findAllByText(/UNSUITABLE|CAUTION|SUITABLE/)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("the audience panel refuses un-authorized accounts", async () => {
    renderWorkspace();
    await userEvent.click(screen.getByText("Audience"));
    // Owner authorization is checked by default true; flip it off.
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /Owner explicitly authorized this account/,
      }),
    );
    await userEvent.click(screen.getByText("Build insight report"));
    expect(
      (await screen.findAllByText(/not explicitly authorized|refused|consent/i))
        .length,
    ).toBeGreaterThan(0);
  });

  it("plan proposals carry high-consequence disclaimers", async () => {
    renderWorkspace();
    await userEvent.click(screen.getByText("Plan proposal"));
    const title = screen.getByLabelText("Plan title");
    await userEvent.type(title, "Improve cardio fitness");
    const goals = screen.getByLabelText("Goals");
    await userEvent.type(goals, "run 3 times a week");
    await userEvent.click(screen.getByText("Build proposal"));
    expect(
      await screen.findByText(/Proposal \(never an irreversible action\)/),
    ).toBeTruthy();
    // FITNESS_PLAN is health-adjacent → disclaimers required.
    expect(screen.getByText(/Disclaimers:/)).toBeTruthy();
  });
});
