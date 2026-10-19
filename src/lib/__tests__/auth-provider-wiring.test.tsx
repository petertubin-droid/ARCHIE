import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

// Direct test pinning that useAuth throws without AuthProvider,
// but succeeds when wrapped inside AuthProvider.

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

function Consumer() {
  const { user, loading } = useAuth();
  return <div data-testid="consumer">{loading ? "loading" : user ? "user" : "guest"}</div>;
}

describe("AuthProvider wiring contract", () => {
  it("throws clear error when useAuth is consumed without AuthProvider", () => {
    // Suppress console.error from React during intentional uncaught exception
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });

  it("renders child tree safely when wrapped in AuthProvider", () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("consumer")).toBeTruthy();
  });
});
