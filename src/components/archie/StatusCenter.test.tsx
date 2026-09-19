// =========================================================
// ARCHIE PWA — STATUS CENTER
//
// Live system status with NO fake states: loading skeleton
// while the status service answers, an honest disconnected
// alert on failure, and real tiles with the live data.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const statusState = vi.fn();
vi.mock("@/hooks/useSystemStatus", () => ({
  useSystemStatus: () => statusState(),
}));

import StatusCenter, { StatusTile } from "@/components/archie/StatusCenter";
import type { ArchieSystemStatus } from "@/lib/archie/stage1-client";

function statusFixture(): ArchieSystemStatus {
  return {
    archie_core: { state: "ONLINE", note: "core nominal" },
    knowledge_core: {
      state: "OPERATIONAL",
      knowledge_items: 42,
      approved: 30,
      domains: 31,
    },
    learning: { state: "READY", awaiting_approval: 2 },
    frelux_connection: { state: "CONNECTED", estimates: 5, materials: 120 },
    internal_agents: { active: 1, total: 6 },
    devices: { trusted: 2, pending: 1 },
    conversations: 12,
    ears: {
      state: "NORMAL",
      configured: true,
      transcriptions: 8,
      note: "ears ok",
    },
    security: { state: "NORMAL", audit_events: 40, critical_events: 0 },
    infrastructure: { cost_records: 3, api_keys: 2 },
  } as ArchieSystemStatus;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StatusCenter", () => {
  it("shows skeleton tiles while loading — no invented status", () => {
    statusState.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refresh: vi.fn(),
    });
    const { container } = render(<StatusCenter />);
    const tiles = container.querySelectorAll(".animate-pulse");
    expect(tiles.length).toBe(9);
    expect(screen.queryByText("ONLINE")).toBeNull();
  });

  it("says honestly when the status service is unreachable", () => {
    statusState.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refresh: vi.fn(),
    });
    render(<StatusCenter />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Status unavailable/i)).toBeTruthy();
  });

  it("renders the real tiles from live data", () => {
    statusState.mockReturnValue({
      data: statusFixture(),
      isLoading: false,
      isError: false,
      refresh: vi.fn(),
    });
    render(<StatusCenter />);
    expect(screen.getByText("ARCHIE Core")).toBeTruthy();
    expect(screen.getByText("core nominal")).toBeTruthy();
    expect(screen.getByText("42 items · 31 domains")).toBeTruthy();
    // Awaiting approval is surfaced, never hidden.
    expect(screen.getByText("2 awaiting approval")).toBeTruthy();
    expect(screen.getByText("40 audit events")).toBeTruthy();
    expect(screen.getByText("SAVED")).toBeTruthy(); // 12 conversations
  });

  it("shows IDLE/NONE honestly when nothing is active", () => {
    const empty = statusFixture();
    empty.internal_agents = { active: 0, total: 6 };
    empty.devices = { trusted: 0, pending: 0 };
    empty.conversations = 0;
    empty.learning = { state: "READY", awaiting_approval: 0 };
    statusState.mockReturnValue({
      data: empty,
      isLoading: false,
      isError: false,
      refresh: vi.fn(),
    });
    render(<StatusCenter />);
    expect(screen.getByText("IDLE")).toBeTruthy();
    expect(screen.getByText("NONE")).toBeTruthy();
    expect(screen.getByText("EMPTY")).toBeTruthy(); // 0 conversations
    expect(screen.getByText("nothing awaiting approval")).toBeTruthy();
  });
});

describe("StatusTile", () => {
  it("renders label, state and optional detail", () => {
    render(<StatusTile label="Test" state="ONLINE" detail="detail text" />);
    expect(screen.getByText("Test")).toBeTruthy();
    expect(screen.getByText("ONLINE")).toBeTruthy();
    expect(screen.getByText("detail text")).toBeTruthy();
  });
});
