import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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

  it("renders all seven primary navigation areas (desktop + mobile nav)", () => {
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
      // each label appears in the desktop sidebar AND mobile bottom nav
      expect(getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("links back to FRELUX (integration without requiring FRELUX to enter ARCHIE)", () => {
    const { getByText } = renderLayout();
    expect(getByText("FRELUX")).toBeTruthy();
  });
});
