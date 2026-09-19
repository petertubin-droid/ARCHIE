// =========================================================
// ARCHIE AUTHORITY & GOVERNANCE PANEL (PWA)
//
// The panel is a LIVE rendering of ARCHIE's own policy
// modules (no copied text). The tests therefore use the REAL
// modules and assert the panel reflects them — and that the
// interactive authorization verifier is the real
// isAuthorization function: only the Owner's explicit command
// authorizes; bugs, warnings and recommendations never do.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ARCHIE_CAN, ARCHIE_DOES_NOT } from "@/lib/archie/authority-boundary";
import {
  CODE_COMMAND_WORKFLOW,
  NOT_AUTHORIZATION,
  isAuthorization,
} from "@/lib/archie/code-command";
import {
  OWNER_ADMIN_CONFIGURED_FIELDS,
  canSubscriberAlterLimits,
} from "@/lib/archie/api-governance";

import AuthorityGovernance from "@/components/archie/AuthorityGovernance";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthorityGovernance", () => {
  it("renders the live authority boundary from the real policy modules", () => {
    render(<AuthorityGovernance />);
    expect(screen.getByText("ARCHIE may")).toBeTruthy();
    expect(screen.getByText("ARCHIE never")).toBeTruthy();
    // Every real policy line is rendered — the panel cannot drift.
    for (const canItem of ARCHIE_CAN) {
      expect(screen.getAllByText(canItem).length).toBeGreaterThan(0);
    }
    for (const neverItem of ARCHIE_DOES_NOT) {
      expect(screen.getAllByText(neverItem).length).toBeGreaterThan(0);
    }
  });

  it("renders the protected-change workflow with the Owner gate", () => {
    render(<AuthorityGovernance />);
    for (const stage of CODE_COMMAND_WORKFLOW) {
      expect(
        screen.getAllByText(new RegExp(stage, "i")).length,
      ).toBeGreaterThan(0);
    }
  });

  it("verifies with the REAL isAuthorization: the Owner's explicit command is the only authorization", () => {
    // Sanity on the real function first.
    const authorized = isAuthorization("the Owners explicit command");
    expect(authorized.authorized).toBe(true);
    expect(isAuthorization("a detected bug").authorized).toBe(false);

    render(<AuthorityGovernance />);
    const input = screen.getByLabelText(/authorization claim/i);
    fireEvent.change(input, {
      target: { value: "the Owners explicit command" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(
      screen.getByText(
        /Authorized: the authenticated Owner's explicit command/i,
      ),
    ).toBeTruthy();
  });

  it("verifies honestly that a detected bug is NOT authorization", () => {
    render(<AuthorityGovernance />);
    const input = screen.getByLabelText(/authorization claim/i);
    fireEvent.change(input, { target: { value: "a detected bug" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/is NOT authorization/i);
    expect(status.textContent).toMatch(/a detected bug/i);
  });

  it("rejects ARCHIE's own decision as an authorization source", () => {
    render(<AuthorityGovernance />);
    const input = screen.getByLabelText(/authorization claim/i);
    fireEvent.change(input, { target: { value: "ARCHIE's own decision" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("status").textContent).toMatch(
      /is NOT authorization/i,
    );
  });

  it("lists every non-authorization source so nothing is ambiguous", () => {
    render(<AuthorityGovernance />);
    const neverList = screen.getByText(/Never authorization:/i);
    for (const n of NOT_AUTHORIZATION) {
      expect(neverList.textContent).toContain(n);
    }
  });

  it("states the subscriber API governance from the real module", () => {
    render(<AuthorityGovernance />);
    expect(
      screen.getByText(
        new RegExp(`${OWNER_ADMIN_CONFIGURED_FIELDS.length} fields`, "i"),
      ),
    ).toBeTruthy();
    // Subscribers can never alter their own limits.
    expect(canSubscriberAlterLimits()).toBe(false);
    expect(
      screen.getByText(/A subscriber can alter their own limits:/i),
    ).toBeTruthy();
    expect(screen.getByText("never")).toBeTruthy();
  });
});
