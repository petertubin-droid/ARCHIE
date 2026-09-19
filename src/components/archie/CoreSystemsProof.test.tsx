// =========================================================
// ARCHIE CORE SYSTEMS & RUNTIME PROOF (PWA)
//
// The connectivity proof is a measured fact: coreHealthCheck
// dynamically imports every registered core module in the
// live runtime. Tests mock ONLY the probe (its dynamic imports
// are browser-work); the runtime registry, model lifecycle
// and provider-independence invariants render from the REAL
// contract modules.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const coreHealthCheck = vi.fn();
vi.mock("@/lib/archie/core-orchestrator", () => ({
  coreHealthCheck: (...a: unknown[]) => coreHealthCheck(...a),
}));

import {
  CoreSystemsProof,
  RuntimeRegistryPanel,
} from "@/components/archie/CoreSystemsProof";
import {
  RUNTIME_REGISTRY,
  PROVIDER_INDEPENDENCE,
} from "@/lib/archie/ai-abstraction";
import { modelLifecycleReport } from "@/lib/archie/model-lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CoreSystemsProof", () => {
  it("renders the measured live count — never a claimed one", async () => {
    coreHealthCheck.mockResolvedValue({
      systems: [
        {
          key: "knowledge",
          label: "Knowledge Core",
          status: "LIVE",
          error: null,
          missing_exports: [],
        },
        {
          key: "broken",
          label: "Broken Binding",
          status: "DISCONNECTED",
          error: null,
          missing_exports: ["exportA", "exportB"],
        },
      ],
    });
    render(<CoreSystemsProof />);
    expect(
      await screen.findByText("1/2 bindings live — measured, not claimed."),
    ).toBeTruthy();
    // The DISCONNECTED entry is shown honestly with its missing exports.
    expect(screen.getByText(/missing exports: exportA, exportB/i)).toBeTruthy();
    expect(screen.getByText("DISCONNECTED")).toBeTruthy();
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("reports a wiring failure with the probe's error, never hides it", async () => {
    coreHealthCheck.mockResolvedValue({
      systems: [
        {
          key: "boom",
          label: "Boom",
          status: "DISCONNECTED",
          error: "module load exploded",
          missing_exports: [],
        },
      ],
    });
    render(<CoreSystemsProof />);
    expect(await screen.findByText("module load exploded")).toBeTruthy();
  });

  it("surfaces a probe exception honestly in the alert region", async () => {
    coreHealthCheck.mockRejectedValue(new Error("import chain failed"));
    render(<CoreSystemsProof />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/import chain failed/i)).toBeTruthy();
  });

  it("re-runs the real probe on Re-verify", async () => {
    coreHealthCheck.mockResolvedValue({ systems: [] });
    render(<CoreSystemsProof />);
    await screen.findByText(/0\/0 bindings live/i);
    fireEvent.click(screen.getByRole("button", { name: /re-verify/i }));
    await waitFor(() => expect(coreHealthCheck).toHaveBeenCalledTimes(2));
  });
});

describe("RuntimeRegistryPanel", () => {
  it("renders the REAL runtime registry and lifecycle report", () => {
    render(<RuntimeRegistryPanel />);
    // Every registered runtime appears with its honest status.
    for (const r of RUNTIME_REGISTRY) {
      expect(screen.getAllByText(r.label).length).toBeGreaterThan(0);
    }
    // Model lifecycle: every real capability rendered.
    for (const c of modelLifecycleReport()) {
      expect(screen.getAllByText(c.capability).length).toBeGreaterThan(0);
    }
    // NOT_YET_AVAILABLE stays NOT_YET_AVAILABLE — no fake readiness.
    const notYet = modelLifecycleReport().filter(
      (c) => c.status === "NOT_YET_AVAILABLE",
    );
    if (notYet.length > 0) {
      expect(screen.getAllByText("not_yet_available").length).toBe(
        notYet.length,
      );
    }
  });

  it("renders every provider-independence invariant from the real contract", () => {
    render(<RuntimeRegistryPanel />);
    for (const inv of PROVIDER_INDEPENDENCE) {
      expect(
        screen.getAllByText(new RegExp(inv.invariant, "i")).length,
      ).toBeGreaterThan(0);
    }
  });
});
