// =========================================================
// ARCHIE PWA — OWNER GUARD
//
// Three states, no fake access: loading, sign-in required,
// or an honest "Owner access only" boundary for non-owners.
// Admin/owner accounts render the guarded children.
// =========================================================

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = vi.fn();
vi.mock("@/lib/auth", () => ({ useAuth: () => authState() }));

import RequireOwner from "@/components/archie/RequireOwner";

function renderGuard() {
  return render(
    <MemoryRouter>
      <RequireOwner>
        <div>SECRET OWNER SURFACE</div>
      </RequireOwner>
    </MemoryRouter>,
  );
}

describe("RequireOwner", () => {
  it("shows the loading state while authorization is being checked", () => {
    authState.mockReturnValue({
      user: null,
      profile: null,
      isAdmin: false,
      loading: true,
    });
    renderGuard();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("SECRET OWNER SURFACE")).toBeNull();
  });

  it("requires sign-in — ARCHIE is never public", () => {
    authState.mockReturnValue({
      user: null,
      profile: null,
      isAdmin: false,
      loading: false,
    });
    renderGuard();
    expect(screen.getByText("Sign in required")).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByText("SECRET OWNER SURFACE")).toBeNull();
  });

  it("refuses non-owner accounts honestly and records the attempt", () => {
    authState.mockReturnValue({
      user: { id: "u" },
      profile: { role: "user" },
      isAdmin: false,
      loading: false,
    });
    renderGuard();
    expect(screen.getByText("Owner access only")).toBeTruthy();
    expect(screen.getByText(/This attempt is recorded/i)).toBeTruthy();
    expect(screen.queryByText("SECRET OWNER SURFACE")).toBeNull();
  });

  it("renders the guarded children only for the owner", () => {
    authState.mockReturnValue({
      user: { id: "owner" },
      profile: { role: "admin" },
      isAdmin: true,
      loading: false,
    });
    renderGuard();
    expect(screen.getByText("SECRET OWNER SURFACE")).toBeTruthy();
    expect(screen.queryByText("Owner access only")).toBeNull();
  });
});
