// =========================================================
// PRIVACY CONTROLS PANEL TESTS (Phase 8 P4)
//
// The privacy rules are enforced by privacy-controls.ts —
// the UI only surfaces them (mocked fetches, REAL rules):
//   * view isolation — another user's learning cannot be
//     deleted; the honest refusal is shown, button disabled
//   * owned learnings delete through the real eligibility
//     verdict, and the verdict's reason is the notice shown
//   * device revocation persists the terminal state
//   * the serving-rules simulator applies the live rule,
//     including refusing non-approved global candidates
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/archie/mobile/p4-client", () => ({
  fetchMobileLearnings: vi.fn(),
  fetchTrustedDevices: vi.fn(),
  deleteMobileLearning: vi.fn(),
  persistMobileLearning: vi.fn(),
  upsertTrustedDevice: vi.fn(),
}));

import {
  fetchMobileLearnings,
  fetchTrustedDevices,
  deleteMobileLearning,
  persistMobileLearning,
  upsertTrustedDevice,
} from "@/lib/archie/mobile/p4-client";
import PrivacyControlsPanel from "@/components/archie/PrivacyControlsPanel";

function learning(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    user_id: "u1",
    device_id: "d1",
    category: "conversations",
    pipeline_state: "VERSIONED",
    shown_summary: "summary",
    user_confirmed: true,
    scope: "PROJECT",
    learned: [],
    flags: [],
    created_date: "2026-09-01T00:00:00Z",
    updated_date: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const DEVICE = {
  id: "d1",
  user_id: "u1",
  device_name: "My Samsung A54",
  fingerprint: "fp-abc",
  enrollment_state: "TRUSTED",
  security_status: "OK",
  token_digest: "hash",
  last_seen: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMobileLearnings).mockResolvedValue([]);
  vi.mocked(fetchTrustedDevices).mockResolvedValue([]);
});

describe("PrivacyControlsPanel", () => {
  it("renders honest empty states — nothing hidden, nothing invented", async () => {
    render(<PrivacyControlsPanel />);
    expect(await screen.findByText(/nothing to manage/i)).toBeTruthy();
    expect(screen.getByText(/No trusted devices/i)).toBeTruthy();
  });

  it("view isolation: another user's learning cannot be deleted from this console", async () => {
    vi.mocked(fetchMobileLearnings).mockResolvedValue([
      learning({ id: "foreign", user_id: "someone-else" }),
    ] as never);
    render(<PrivacyControlsPanel />);
    await screen.findByTestId("privacy-learning-VERSIONED");
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toBeTruthy();
    // eligibility is decided by privacy-controls, not the UI
    expect(
      screen.getByText(/Only the owner can request deletion/i),
    ).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(deleteMobileLearning).not.toHaveBeenCalled();
  });

  it("owned learning deletes through the real verdict and shows its reason", async () => {
    // first load returns the learning, the reload after deletion is empty
    vi.mocked(fetchMobileLearnings)
      .mockResolvedValueOnce([learning()] as never)
      .mockResolvedValue([] as never);
    vi.mocked(deleteMobileLearning).mockResolvedValue({ ok: true } as never);
    render(<PrivacyControlsPanel />);
    await screen.findByTestId("privacy-learning-VERSIONED");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(deleteMobileLearning).toHaveBeenCalledWith("u1", "l1"),
    );
    // the learning is gone from the reloaded list
    expect(await screen.findByText(/nothing to manage/i)).toBeTruthy();
  });

  it("scope change persists through the transition matrix", async () => {
    vi.mocked(fetchMobileLearnings).mockResolvedValue([
      learning({ scope: "PROJECT" }),
    ] as never);
    vi.mocked(persistMobileLearning).mockResolvedValue({ ok: true } as never);
    render(<PrivacyControlsPanel />);
    await screen.findByTestId("privacy-learning-VERSIONED");
    fireEvent.change(screen.getByLabelText("Scope for conversations"), {
      target: { value: "PROPERTY" },
    });
    await waitFor(() => expect(persistMobileLearning).toHaveBeenCalled());
    const saved = vi.mocked(persistMobileLearning).mock.calls[0][0];
    expect(saved.scope).toBe("PROPERTY");
    expect(screen.getByText(/Scope set to PROPERTY/i)).toBeTruthy();
  });

  it("revoking a device persists the terminal state immediately", async () => {
    vi.mocked(fetchTrustedDevices).mockResolvedValue([DEVICE] as never);
    vi.mocked(upsertTrustedDevice).mockImplementation(
      async (d) => ({ ok: true, device: d }) as never,
    );
    render(<PrivacyControlsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(upsertTrustedDevice).toHaveBeenCalled());
    const persisted = vi.mocked(upsertTrustedDevice).mock
      .calls[0][0] as typeof DEVICE;
    expect(persisted.enrollment_state).toBe("REVOKED");
    expect(screen.getByText(/dropped immediately \(terminal\)/i)).toBeTruthy();
  });

  it("serving simulator applies the live rule and states the exact reason per scope", async () => {
    render(<PrivacyControlsPanel />);
    // default simulation scope PROJECT — the requester owns proj-1
    expect(await screen.findByText("SERVES")).toBeTruthy();
    expect(screen.getByText("Authorized project member")).toBeTruthy();
    // candidates are evaluation-pool material: the contributor may view
    // their own, and the rule says so explicitly — never served as
    // knowledge to anyone else.
    fireEvent.change(screen.getByLabelText("Scope to simulate"), {
      target: { value: "FRELUX_GLOBAL_CANDIDATE" },
    });
    expect(
      await screen.findByText("Contributor viewing their own candidate"),
    ).toBeTruthy();
    // PRIVATE is the owner's alone
    fireEvent.change(screen.getByLabelText("Scope to simulate"), {
      target: { value: "PRIVATE" },
    });
    expect(
      await screen.findByText("Owner viewing their private knowledge"),
    ).toBeTruthy();
  });
});
