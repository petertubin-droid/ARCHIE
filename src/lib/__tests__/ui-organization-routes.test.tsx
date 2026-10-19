import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import ArchieLayout from "@/components/archie/ArchieLayout";
import PersonalizationModal, { loadPersonalization, savePersonalization } from "@/components/archie/PersonalizationModal";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-owner-id", email: "owner@frelux.test" },
    session: null,
    loading: false,
  }),
}));

vi.mock("@/components/archie/StatusCenter", () => ({
  default: () => <div data-testid="status-center">Mock Status Center</div>,
}));

vi.mock("@/components/archie/CoreSystemsProof", () => ({
  CoreSystemsProof: () => <div data-testid="core-systems-proof">Mock Core Systems Proof</div>,
}));

vi.mock("@/components/archie/DevGovernance", () => ({
  default: () => <div data-testid="dev-governance">Mock Dev Governance</div>,
}));

vi.mock("@/components/archie/PrivacyControlsPanel", () => ({
  default: () => <div data-testid="privacy-controls">Mock Privacy Controls</div>,
}));

vi.mock("@/components/archie/ArchieInstallButton", () => ({
  default: () => <div data-testid="install-button">Install Button</div>,
}));

describe("UI Organization & Admin Separation", () => {
  it("renders AdminDashboard with isolated administrative tabs", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/ARCHIE Admin & Governance Center/i)).toBeDefined();
    expect(screen.getByText(/Restricted/i)).toBeDefined();
    expect(screen.getByTestId("status-center")).toBeDefined();
  });

  it("switches tabs in AdminDashboard cleanly", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminDashboard />
      </MemoryRouter>
    );

    const securityTab = screen.getByRole("button", { name: /Security & Audit/i });
    fireEvent.click(securityTab);

    expect(screen.getByText(/Audit Trail & Device Policies/i)).toBeDefined();
  });

  it("ArchieLayout includes Personalization trigger and Admin navigation link", () => {
    render(
      <MemoryRouter initialEntries={["/archie"]}>
        <ArchieLayout />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /Personalize/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Admin/i })).toBeDefined();
  });

  it("manages personalization preferences locally in PersonalizationModal", () => {
    const handleClose = vi.fn();
    render(
      <PersonalizationModal isOpen={true} onClose={handleClose} />
    );

    expect(screen.getByText(/ARCHIE Personalization/i)).toBeDefined();
    
    // Test selecting a theme accent
    const sapphireBtn = screen.getByText(/Sapphire Blue/i);
    fireEvent.click(sapphireBtn);

    const saveBtn = screen.getByRole("button", { name: /Save Preferences/i });
    fireEvent.click(saveBtn);

    const config = loadPersonalization();
    expect(config.accentColor).toBe("sapphire");
  });
});
