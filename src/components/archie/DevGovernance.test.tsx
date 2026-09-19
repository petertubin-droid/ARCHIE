import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DevGovernance from "@/components/archie/DevGovernance";

function renderPanel() {
  return render(<DevGovernance />);
}

describe("DevGovernance", () => {
  it("shows ARCHIE's autonomous stages end at a proposal", () => {
    renderPanel();
    expect(screen.getByText("Development authority")).toBeTruthy();
    expect(screen.getAllByText(/READ → UNDERSTAND/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Output: proposal/)).toBeTruthy();
    expect(
      screen.getByText(/ARCHIE PROPOSES → OWNER REVIEWS → OWNER AUTHORIZES/),
    ).toBeTruthy();
  });

  it("the workflow gate refuses ARCHIE advancing past its proposal", async () => {
    renderPanel();
    // Act as ARCHIE, current stage: ARCHIE PROPOSES.
    await userEvent.click(screen.getByText("Advance stage"));
    expect(await screen.findByText("OWNER REVIEWS")).toBeTruthy();
    // Now try to advance OWNER REVIEWS as ARCHIE — must be refused.
    await userEvent.click(screen.getByText("Advance stage"));
    expect(await screen.findByText(/Only the Owner advances/i)).toBeTruthy();
  });

  it("the Owner may advance the workflow", async () => {
    renderPanel();
    await userEvent.selectOptions(screen.getByLabelText("Acting as"), "OWNER");
    await userEvent.click(screen.getByText("Advance stage"));
    expect(await screen.findByText("OWNER REVIEWS")).toBeTruthy();
    await userEvent.click(screen.getByText("Advance stage"));
    expect(await screen.findByText("OWNER AUTHORIZES")).toBeTruthy();
  });

  it("the code sentry scans authorized content with cited findings", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Scan authorized content"));
    // The seeded snippet contains live-key/eval-shaped tokens.
    expect(await screen.findAllByText(/sk_live|eval|password/i)).not.toBeNull();
    expect(screen.getByText(/finding\(s\)/)).toBeTruthy();
    // Fixes are proposals, never applied automatically.
    expect(screen.getAllByText(/→ /).length).toBeGreaterThan(0);
  });
});
