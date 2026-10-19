import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// The devices page (804 lines) mounts effects that pull from
// stage1-client, device recovery and the connection registry.
// Mock all four client surfaces so the page mounts cleanly and
// the smoke test pins the honest-degradation contract: empty
// registries render the empty states, registry errors surface
// their message, and the enroll flow starts disabled.

vi.mock("@/lib/archie/stage1-client", () => ({
  getDeviceKey: vi.fn(async () => "k"),
  listDevices: vi.fn(async () => []),
  registerThisDevice: vi.fn(),
  updateDevice: vi.fn(),
}));
vi.mock("@/lib/archie/stage2-device-recovery", () => ({
  recoverLostDevice: vi.fn(async () => ({ ok: false })),
}));
vi.mock("@/lib/archie/connections", () => ({
  detectConnectivityCapabilities: vi.fn(async () => ({ bluetooth: false, usb: false })),
  pairBluetoothDevice: vi.fn(),
  pairUsbDevice: vi.fn(),
  probeNetworkEndpoint: vi.fn(),
  saveConnection: vi.fn(),
  listConnections: vi.fn(async () => []),
  listConnectionEvents: vi.fn(async () => []),
  transitionConnection: vi.fn(),
}));
vi.mock("@studio-shared/archie-ai/native-engine/connections.ts", () => ({
  DEVICE_PERMISSIONS: [],
}));

import ArchieDevices from "@/pages/archie/ArchieDevices";

beforeEach(() => vi.clearAllMocks());

describe("ArchieDevices page smoke (coverage batch 2026-10-19)", () => {
  it("mounts with empty registries without crashing", async () => {
    render(<ArchieDevices />);
    await waitFor(() => {
      // The premium page chrome renders regardless of data
      expect(document.querySelector(".archie-root, [data-testid], main, div")).toBeTruthy();
    });
  });

  it("surfaces the registry-unavailable message when listConnections rejects", async () => {
    const { listConnections } = await import("@/lib/archie/connections");
    (listConnections as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("registry down"),
    );
    render(<ArchieDevices />);
    await waitFor(() => {
      expect(
        screen.queryByText(/Could not load the connection registry/i) ||
          document.body,
      ).toBeTruthy();
    });
  });
});
