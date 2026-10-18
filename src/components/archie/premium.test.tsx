// =========================================================
// ARCHIE PWA — PREMIUM UI KIT
//
// The shared presentational building blocks. The contract is
// simple but load-bearing: every ARCHIE screen uses these, so
// they must render their content faithfully — titles, stats,
// badges in every tone, and disabled buttons that stay
// disabled.
// =========================================================

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ArchieBadge,
  ArchieButton,
  ArchieEmptyState,
  ArchieField,
  ArchieGhostButton,
  ArchieInput,
  ArchiePage,
  ArchiePanel,
  ArchieSectionTitle,
  ArchieSkeleton,
  ArchieStat,
  ArchieTextarea,
} from "@/components/archie/premium";

describe("ArchiePage", () => {
  it("renders eyebrow, gradient title and subtitle", () => {
    render(
      <ArchiePage
        eyebrow="ARCHIE / OPERATIONS"
        title="Command Center"
        subtitle="Live system state"
      >
        <p>content</p>
      </ArchiePage>,
    );
    expect(screen.getByText("ARCHIE / OPERATIONS")).toBeTruthy();
    expect(screen.getByText("Command Center")).toBeTruthy();
    expect(screen.getByText("Live system state")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("omits eyebrow and subtitle when not provided", () => {
    const { container } = render(<ArchiePage title="Bare">x</ArchiePage>);
    expect(container.textContent).toBe("Barex");
  });
});

describe("ArchiePanel / ArchieSectionTitle", () => {
  it("renders panels with and without the accent treatment", () => {
    const { container } = render(
      <div>
        <ArchiePanel>plain</ArchiePanel>
        <ArchiePanel accent>accented</ArchiePanel>
      </div>,
    );
    expect(container.textContent).toContain("plain");
    expect(container.textContent).toContain("accented");
  });

  it("renders the section title as a small uppercase label", () => {
    render(<ArchieSectionTitle>Memory</ArchieSectionTitle>);
    expect(screen.getByText("Memory").tagName).toBe("H2");
  });
});

describe("ArchieStat", () => {
  it("renders the label and value in every tone without losing content", () => {
    for (const tone of [
      "neutral",
      "positive",
      "warning",
      "critical",
    ] as const) {
      const { unmount } = render(
        <ArchieStat label="Estimates" value={12} tone={tone} />,
      );
      expect(screen.getByText("Estimates")).toBeTruthy();
      expect(screen.getByText("12")).toBeTruthy();
      unmount();
    }
  });
});

describe("ArchieButton", () => {
  it("fires onClick when enabled and stays inert when disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ArchieButton onClick={onClick}>Act</ArchieButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    onClick.mockClear();
    rerender(
      <ArchieButton onClick={onClick} disabled>
        Act
      </ArchieButton>,
    );
    const btn = screen.getByRole("button", {
      name: "Act",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ArchieBadge", () => {
  it("renders badge text in every tone", () => {
    for (const tone of [
      "neutral",
      "positive",
      "warning",
      "critical",
      "accent",
    ] as const) {
      const { unmount } = render(
        <ArchieBadge tone={tone}>{tone} badge</ArchieBadge>,
      );
      expect(screen.getByText(`${tone} badge`)).toBeTruthy();
      unmount();
    }
  });
});

// ---------- UI upgrade pass 2026-10-18: new primitives ----------

describe("ArchieInput / ArchieTextarea", () => {
  it("renders accessible input wired to its label via ArchieField", () => {
    render(
      <ArchieField label="Target" htmlFor="tgt">
        <ArchieInput id="tgt" placeholder="e.g. src/lib/engine.ts" />
      </ArchieField>,
    );
    const input = screen.getByLabelText("Target");
    expect(input.id).toBe("tgt");
    expect(input.getAttribute("placeholder")).toBe("e.g. src/lib/engine.ts");
  });

  it("renders hint text under the field", () => {
    render(
      <ArchieField label="Secret" hint="Minimum 12 characters">
        <ArchieInput />
      </ArchieField>,
    );
    expect(screen.getByText("Minimum 12 characters")).toBeTruthy();
  });

  it("textarea carries its value", () => {
    render(<ArchieTextarea defaultValue="hello" />);
    expect(
      (screen.getByRole("textbox") as HTMLTextAreaElement).value,
    ).toBe("hello");
  });
});

describe("ArchieGhostButton", () => {
  it("fires onClick and forwards attributes", () => {
    const onClick = vi.fn();
    render(
      <ArchieGhostButton onClick={onClick} data-testid="ghost">
        Cancel
      </ArchieGhostButton>,
    );
    fireEvent.click(screen.getByTestId("ghost"));
    expect(onClick).toHaveBeenCalled();
  });

  it("stays disabled", () => {
    render(
      <ArchieGhostButton disabled data-testid="ghost2">
        No
      </ArchieGhostButton>,
    );
    expect(
      (screen.getByTestId("ghost2") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("ArchieEmptyState / ArchieSkeleton", () => {
  it("renders title and description, no fake content", () => {
    render(
      <ArchieEmptyState
        title="Nothing to report"
        description="No alerts were raised today."
      />,
    );
    expect(screen.getByText("Nothing to report")).toBeTruthy();
    expect(
      screen.getByText("No alerts were raised today."),
    ).toBeTruthy();
  });

  it("skeleton is aria-hidden decoration", () => {
    const { container } = render(<ArchieSkeleton />);
    const skel = container.firstElementChild as HTMLElement;
    expect(skel.getAttribute("aria-hidden")).toBe("true");
  });
});
