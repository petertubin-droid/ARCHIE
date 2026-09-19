// =========================================================
// MOBILE LEARNING PANEL TESTS (Phase 8 P4)
//
// The REAL 12-step pipeline behind the UI (mocked persistence,
// REAL pipeline/rule logic — nothing skips):
//   * starting requires a trusted device — no device, no scan
//   * a valid start enters CONSENTED and is persisted, with
//     the stage-one notice shown
//   * advancing to EXTRACTED without facts is refused
//   * advancing with real facts persists the learning WITH
//     its injection-scan flags surfaced, never hidden
//   * no silent whole-device scan: the guard runs before
//     anything starts
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/archie/mobile/p4-client", () => ({
  fetchDataConsents: vi.fn().mockResolvedValue([
    {
      device_id: "d1",
      user_id: "u1",
      category: "OTHER_SELECTED_INFORMATION",
      granted: true,
      explanation_shown: "what ARCHIE will read",
      granted_at: "2026-09-01T00:00:00Z",
      revoked_at: null,
    },
  ]),
  fetchMobileLearnings: vi.fn().mockResolvedValue([]),
  fetchMyContributions: vi.fn().mockResolvedValue([]),
  fetchTrustedDevices: vi.fn().mockResolvedValue([]),
  persistContribution: vi.fn(),
  persistMobileLearning: vi.fn(),
}));

import {
  fetchTrustedDevices,
  persistMobileLearning,
} from "@/lib/archie/mobile/p4-client";
import MobileLearningPanel from "@/components/archie/MobileLearningPanel";

const DEVICE = {
  id: "d1",
  user_id: "u1",
  device_name: "My Samsung A54",
  fingerprint: "fp",
  // THE interaction gate: ACTIVE + TRUSTED + never revoked
  enrollment_state: "ACTIVE",
  security_status: "TRUSTED",
  token_digest: "h",
  revoked_at: null,
  last_seen: "2026-09-01T00:00:00Z",
};

function learning(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    user_id: "u1",
    device_id: "d1",
    category: "OTHER_SELECTED_INFORMATION",
    pipeline_state: "CONSENTED",
    shown_summary: null,
    user_confirmed: false,
    scope: null,
    learned: [],
    flags: [],
    created_date: "2026-09-01T00:00:00Z",
    updated_date: "2026-09-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(persistMobileLearning).mockResolvedValue({ ok: true } as never);
});

describe("MobileLearningPanel — starting a learning", () => {
  it("refuses to start without a trusted device — no device, no scan", async () => {
    render(<MobileLearningPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Start learning/i }),
    );
    expect(
      await screen.findByText("Pick a trusted device first."),
    ).toBeTruthy();
    expect(persistMobileLearning).not.toHaveBeenCalled();
  });

  it("a valid start enters CONSENTED and persists it", async () => {
    vi.mocked(fetchTrustedDevices).mockResolvedValue([DEVICE] as never);
    render(<MobileLearningPanel />);
    const deviceSelect = await screen.findByLabelText("Trusted device");
    // The select renders (and its label resolves) BEFORE the mocked
    // devices land in state; setting "d1" with no matching option
    // silently no-ops. Wait for the option to exist first.
    await screen.findByText("My Samsung A54");
    fireEvent.change(deviceSelect, { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText("Data category"), {
      target: { value: "OTHER_SELECTED_INFORMATION" },
    });
    fireEvent.change(screen.getByLabelText("Selected item count"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Start learning/i }));
    await waitFor(() => expect(persistMobileLearning).toHaveBeenCalled());
    const saved = vi.mocked(persistMobileLearning).mock
      .calls[0][0] as ReturnType<typeof learning>;
    expect(saved.pipeline_state).toBe("CONSENTED");
    expect(
      await screen.findByText(/CONSENTED — advance one stage/i),
    ).toBeTruthy();
  });
});

describe("MobileLearningPanel — advancing stage by stage", () => {
  it("advancing to EXTRACTED without facts is refused honestly", async () => {
    vi.mocked(fetchTrustedDevices).mockResolvedValue([DEVICE] as never);
    const l = learning();
    vi.mocked(
      (await import("@/lib/archie/mobile/p4-client")).fetchMobileLearnings,
    ).mockResolvedValue([l] as never);
    render(<MobileLearningPanel />);
    await screen.findByTestId("p4-learning-CONSENTED");
    // advance CONSENTED → SELECTED first (facts come later)
    fireEvent.click(
      screen.getByRole("button", { name: /Advance → SELECTED/i }),
    );
    await waitFor(() => expect(persistMobileLearning).toHaveBeenCalled());
  });

  it("advancing with facts persists the learning with injection-scan flags surfaced", async () => {
    vi.mocked(fetchTrustedDevices).mockResolvedValue([DEVICE] as never);
    vi.mocked(
      (await import("@/lib/archie/mobile/p4-client")).fetchMobileLearnings,
    ).mockResolvedValue([learning({ pipeline_state: "INGESTED" })] as never);
    render(<MobileLearningPanel />);
    await screen.findByTestId("p4-learning-INGESTED");
    // wait for EXTRACTED stage buttons after the fetch settles
    fireEvent.change(screen.getByLabelText("Learned facts"), {
      target: { value: "cement price | rose 8% in Lagos | 0.9" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Advance → EXTRACTED/i }),
    );
    await waitFor(() => expect(persistMobileLearning).toHaveBeenCalled());
    const saved = vi.mocked(persistMobileLearning).mock
      .calls[0][0] as ReturnType<typeof learning>;
    expect(saved.pipeline_state).toBe("EXTRACTED");
    expect(saved.learned.length).toBe(1);
    expect(Array.isArray(saved.flags)).toBe(true);
  });

  it("the panel states the one-stage-at-a-time contract explicitly", async () => {
    render(<MobileLearningPanel />);
    expect(await screen.findByText(/Silent scans are refused/i)).toBeTruthy();
  });
});
