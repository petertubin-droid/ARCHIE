// =========================================================
// MARKET KNOWLEDGE PANEL TESTS (Archie evolution console)
//
// Two Stage-2 surfaces driven by the REAL validation logic
// (no mocks of the lib modules):
//   * raw observations enter UNVERIFIED and must carry a
//     named source — invalid input is refused with the exact
//     validator error, nothing is silently accepted
//   * VERIFIED knowledge requires human verification evidence;
//     without it the registry refuses the entry
//   * aggregates appear only after valid observations exist
// =========================================================
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MarketKnowledgePanel from "@/components/archie/MarketKnowledgePanel";

beforeEach(() => {
  // crypto.randomUUID is required by the panel (happy-dom provides it)
});

function fill(aria: string, value: string) {
  fireEvent.change(screen.getByLabelText(aria), { target: { value } });
}

describe("MarketKnowledgePanel — observation pool", () => {
  it("renders both Stage-2 surfaces with the honest framing", () => {
    render(<MarketKnowledgePanel />);
    expect(screen.getByText(/observation pool/i)).toBeTruthy();
    expect(screen.getByText(/Validated knowledge registry/i)).toBeTruthy();
    expect(
      screen.getByText(
        /VERIFIED is reachable only through human verification/i,
      ),
    ).toBeTruthy();
  });

  it("an observation without a named source is refused with the validator's exact error", () => {
    render(<MarketKnowledgePanel />);
    fill("Observation statement", "Cement up 8%");
    fill("Observation source", "  ");
    fireEvent.click(screen.getByRole("button", { name: /Add observation/i }));
    expect(screen.getByText("Refused")).toBeTruthy();
    expect(
      screen.getByText("Observations must name their source."),
    ).toBeTruthy();
    // aggregates never appear from a refused entry
    expect(screen.queryByText(/Aggregates \(/)).toBeNull();
  });

  it("a valid observation enters UNVERIFIED and produces an aggregate", () => {
    render(<MarketKnowledgePanel />);
    fill("Observation region", "NG-Lagos");
    fill("Observation statement", "Cement up 8% in Lagos");
    fill("Observation source", "dealer survey");
    fireEvent.click(screen.getByRole("button", { name: /Add observation/i }));
    expect(screen.getByText(/Aggregates \(1\)/)).toBeTruthy();
    expect(screen.getAllByText(/UNVERIFIED/).length).toBeGreaterThan(0);
  });
});

describe("MarketKnowledgePanel — knowledge registry", () => {
  it("VERIFIED without human verification evidence is refused", () => {
    render(<MarketKnowledgePanel />);
    fill("Knowledge key", "cement-price-ng");
    fill("Knowledge statement", "Cement retail in Lagos costs X");
    fireEvent.change(screen.getByLabelText("Validation state"), {
      target: { value: "VERIFIED" },
    });
    fill("Verification evidence", "");
    fireEvent.click(
      screen.getByRole("button", { name: /Register knowledge/i }),
    );
    expect(screen.getAllByText("Refused").length).toBeGreaterThan(0);
    expect(screen.getByText(/VERIFIED requires/i)).toBeTruthy();
  });

  it("VERIFIED with evidence registers and is retrievable-ranked", () => {
    render(<MarketKnowledgePanel />);
    fill("Knowledge key", "cement-price-ng");
    fill("Knowledge statement", "Cement retail in Lagos costs X per bag");
    fireEvent.change(screen.getByLabelText("Validation state"), {
      target: { value: "VERIFIED" },
    });
    fill("Verification evidence", "receipt + dealer interview 2026-09-18");
    fireEvent.click(
      screen.getByRole("button", { name: /Register knowledge/i }),
    );
    expect(screen.getAllByText(/cement-price-ng/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Refused/i)).toHaveLength(0);
  });

  it("INFERRED without an inference basis is refused — ARCHIE cannot invent its own reasoning", () => {
    render(<MarketKnowledgePanel />);
    fill("Knowledge key", "inferred-key");
    fill("Knowledge statement", "Cement demand will rise next quarter");
    fireEvent.change(screen.getByLabelText("Validation state"), {
      target: { value: "INFERRED" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Register knowledge/i }),
    );
    expect(
      screen.getByText(/INFERRED knowledge requires its inference basis/i),
    ).toBeTruthy();
  });

  it("OWNER_PROVIDED is honest about its source default and registers", () => {
    render(<MarketKnowledgePanel />);
    fill("Knowledge key", "owner-fact");
    fill("Knowledge statement", "FRELUX uses the 2026 OEWN snapshot");
    // default state is OWNER_PROVIDED with source OWNER — a valid entry
    fireEvent.click(
      screen.getByRole("button", { name: /Register knowledge/i }),
    );
    expect(screen.queryAllByText(/Refused/i)).toHaveLength(0);
    expect(screen.getAllByText(/owner-fact/).length).toBeGreaterThan(0);
  });
});
