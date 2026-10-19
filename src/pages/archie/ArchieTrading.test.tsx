import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The trading page is a thin wrapper around TradingConsole
// (which carries its own full test file). Pin the wrapper
// contract: it renders the console inside the page container.

const TradingConsole = vi.fn(() => <div data-testid="trading-console" />);
vi.mock("@/components/archie/TradingConsole", () => ({
  default: (...a: unknown[]) => TradingConsole(...a),
}));

import ArchieTrading from "@/pages/archie/ArchieTrading";

beforeEach(() => vi.clearAllMocks());

describe("ArchieTrading page (coverage batch 2026-10-19)", () => {
  it("renders the TradingConsole inside the page container", () => {
    const { container } = render(<ArchieTrading />);
    expect(TradingConsole).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("trading-console")).toBeTruthy();
    expect(container.firstChild?.nodeName).toBe("DIV");
  });
});
