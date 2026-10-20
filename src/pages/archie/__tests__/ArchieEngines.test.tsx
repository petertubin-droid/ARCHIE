import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ArchieEngines from "../ArchieEngines";

describe("ArchieEngines Component", () => {
  it("renders the unified engine federation with all 15 core engines", () => {
    render(<ArchieEngines />);
    expect(screen.getByText(/Calculation Engines & Formulas/i)).toBeTruthy();
    expect(screen.getByText(/15\/15 registered/i)).toBeTruthy();
    expect(screen.getByText(/Cognitive Synthesis & Reasoning/i)).toBeTruthy();
    expect(screen.getByText(/Algorithmic Trading & Risk Gate/i)).toBeTruthy();
    expect(screen.getByText(/Real-Time Multi-Asset Feeds/i)).toBeTruthy();
  });

  it("switches to the deterministic formulas tab and executes roof geometry calculation", async () => {
    render(<ArchieEngines />);
    const calcTab = screen.getByTestId("engine-calculators-tab");
    fireEvent.click(calcTab);

    expect(screen.getAllByText(/Roof Geometry Engine/i).length).toBeGreaterThan(0);
    const execBtn = screen.getByRole("button", { name: /Execute Formula/i });
    fireEvent.click(execBtn);

    await waitFor(() => {
      expect(screen.getByText(/Deterministic Calculation Output/i)).toBeTruthy();
    });
  });
});
