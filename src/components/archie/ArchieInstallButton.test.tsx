// =========================================================
// ARCHIE PWA — INSTALL BUTTON
//
// No fake buttons: the install option appears ONLY when the
// browser actually offers beforeinstallprompt. iOS Safari
// gets an honest dismissible hint instead. Already-installed
// clients render nothing.
// =========================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import ArchieInstallButton from "@/components/archie/ArchieInstallButton";

function fireBeforeInstallPrompt() {
  const evt = new Event("beforeinstallprompt");
  Object.assign(evt, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => {
    window.dispatchEvent(evt);
  });
  return evt;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // restore a desktop UA if a test swapped it
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    configurable: true,
    writable: true,
  });
});

describe("ArchieInstallButton", () => {
  it("renders nothing until the browser actually offers installation", () => {
    const { container } = render(<ArchieInstallButton />);
    expect(container.innerHTML).toBe("");
  });

  it("offers Install only when beforeinstallprompt fires", () => {
    render(<ArchieInstallButton />);
    fireBeforeInstallPrompt();
    expect(screen.getByRole("button", { name: /install/i })).toBeTruthy();
  });

  it("prompts the browser on tap and reports the accepted choice", async () => {
    render(<ArchieInstallButton />);
    const evt = fireBeforeInstallPrompt();
    fireEvent.click(screen.getByRole("button", { name: /install/i }));
    await waitFor(() =>
      expect(
        (evt as unknown as { prompt: () => unknown }).prompt,
      ).toHaveBeenCalledTimes(1),
    );
  });

  it("drops the offer when the owner dismisses the native prompt", async () => {
    render(<ArchieInstallButton />);
    const evt = new Event("beforeinstallprompt");
    Object.assign(evt, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    act(() => {
      window.dispatchEvent(evt);
    });
    fireEvent.click(screen.getByRole("button", { name: /install/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /install/i })).toBeNull(),
    );
  });

  it("renders nothing once the app is installed (appinstalled)", () => {
    const { container } = render(<ArchieInstallButton />);
    fireBeforeInstallPrompt();
    expect(screen.getByRole("button", { name: /install/i })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(container.innerHTML).toBe("");
  });

  it("gives iOS Safari an honest, dismissible Add-to-Home-Screen hint", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
      writable: true,
    });
    render(<ArchieInstallButton />);
    const btn = screen.getByRole("button", {
      name: /install/i,
    }) as HTMLButtonElement;
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/add to home screen/i);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(btn); // toggle off again
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
