import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";

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

describe("App root render hierarchy (mirrors main.tsx)", () => {
  it("renders the root application shell without throwing missing context errors", () => {
    render(
      <React.StrictMode>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="*" element={<div data-testid="app-shell">Shell Mounted</div>} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </React.StrictMode>
    );

    expect(screen.getByTestId("app-shell")).toBeTruthy();
  });
});
