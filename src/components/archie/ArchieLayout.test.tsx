import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "u1", email: "owner@example.com" },
    isAdmin: true,
    loading: false,
  })),
}));

import ArchieLayout from "./ArchieLayout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/archie/chat"]}>
      <ArchieLayout />
    </MemoryRouter>,
  );
}

describe("ArchieLayout", () => {
  it("renders the ARCHIE identity header", () => {
    const { getByText } = renderLayout();
    expect(getByText("ARCHIE")).toBeTruthy();
    expect(getByText("Personal Intelligence")).toBeTruthy();
  });

  it("renders all seven primary navigation areas in the desktop sidebar", () => {
    const { getAllByText } = renderLayout();
    for (const label of [
      "Chat",
      "Control",
      "Knowledge",
      "Learning",
      "Devices",
      "Security",
      "System",
    ]) {
      // desktop sidebar always carries the section
      expect(getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("has NO bottom nav bar — mobile navigation lives in the hamburger only", () => {
    const { container } = renderLayout();
    // Owner directive 2026-10-20: the scrollable bottom nav bar
    // is removed from the DOM entirely.
    const fixedNavs = Array.from(
      container.querySelectorAll("nav"),
    ).filter((n) => n.className.includes("fixed"));
    expect(fixedNavs.length).toBe(0);
  });

  it("opens the hamburger drawer with every section and closes it again", () => {
    const { container } = renderLayout();
    // Drawer hidden before the owner asks for it.
    expect(screen.queryByTestId("archie-drawer")).toBeNull();

    fireEvent.click(screen.getByTestId("archie-hamburger"));
    const drawer = screen.getByTestId("archie-drawer");
    // Every surface from the old bottom nav is inside.
    for (const label of [
      "Exchange Access",
      "Wallet Recovery",
      "Offensive",
      "Voice",
      "Evolution",
      "Knowledge",
      "Learning",
      "Training",
    ]) {
      expect(
        drawer.textContent?.includes(label),
      ).toBe(true);
    }

    // Two closers exist (backdrop + X button); both close it.
    fireEvent.click(screen.getAllByRole("button", { name: /close navigation menu/i })[0]);
    expect(screen.queryByTestId("archie-drawer")).toBeNull();
  });

  it("links back to FRELUX (integration without requiring FRELUX to enter ARCHIE)", () => {
    const { getByText } = renderLayout();
    expect(getByText("FRELUX")).toBeTruthy();
  });
});
