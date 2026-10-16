// =========================================================
// ARCHIE PWA — RESEARCH VIEW TESTS
//
// NO THEATER: the panel reads the REAL research register via
// the owner-gated archie-research function (mocked here at
// the supabase boundary), validate/reject hit the real POST
// path, and empty/error states are honest.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));

import ArchieResearch from "@/pages/archie/ArchieResearch";

function finding(over: Record<string, unknown> = {}) {
  return {
    id: "fact_1",
    query: "zustand persist middleware",
    title: "Persist middleware docs",
    snippet: "Rehydrate state from storage",
    url: "https://example.com/docs",
    confidence: 0.6,
    status: "candidate",
    provenanceNote: "candidate finding from example.com — pending validation",
    verifiedBy: [],
    updatedAt: "2026-09-16T00:00:00Z",
    ...over,
  };
}

function registerResponse() {
  return {
    findings: [
      finding(),
      finding({ id: "fact_2", title: "Validated one", status: "validated" }),
    ],
    vocabulary: [
      {
        term: "obstreperous",
        meaning: "noisy, unruly",
        provenance: "researched from dictionary sites",
        confidence: 0.6,
        timesSeen: 3,
        updatedAt: "2026-09-16T00:00:00Z",
      },
    ],
    vocabulary_error: undefined,
    counts: { total: 2, candidate: 1, validated: 1, uncertain: 0 },
    checked_at: "2026-09-16T00:00:00Z",
  };
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe("ArchieResearch — register load", () => {
  it("renders real findings, counts and researched vocabulary", async () => {
    invokeMock.mockResolvedValue({ data: registerResponse(), error: null });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByText("Persist middleware docs")).toBeTruthy();
    });
    expect(screen.getByText("Total").previousElementSibling?.textContent).toBe(
      "2",
    );
    expect(screen.getByText("obstreperous")).toBeTruthy();
    // Candidate shows verdict buttons; validated does not.
    expect(screen.getByText("Validate")).toBeTruthy();
    expect(screen.queryByText("Reject")).toBeTruthy();
  });

  it("renders an honest empty state — no fabricated rows", async () => {
    invokeMock.mockResolvedValue({
      data: {
        findings: [],
        vocabulary: [],
        counts: { total: 0, candidate: 0, validated: 0, uncertain: 0 },
        checked_at: "2026-09-16T00:00:00Z",
      },
      error: null,
    });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(
        screen.getByText(/No research findings stored yet/i),
      ).toBeTruthy();
    });
  });

  it("surfaces a function error honestly with a retry", async () => {
    invokeMock.mockRejectedValue(new Error("Research register unavailable"));
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/Research register unavailable/)).toBeTruthy();
  });
});

describe("ArchieResearch — provenance disclosure", () => {
  it("expands a finding to show its REAL provenance", async () => {
    invokeMock.mockResolvedValue({ data: registerResponse(), error: null });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByText("Persist middleware docs")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Persist middleware docs"));

    await waitFor(() => {
      expect(
        screen.getByText(/candidate finding from example.com/i),
      ).toBeTruthy();
    });
    expect(screen.getByText("Confidence 60% — cross-checked")).toBeTruthy();
    expect(screen.getByText("https://example.com/docs")).toBeTruthy();
  });
});

describe("ArchieResearch — owner verdicts", () => {
  it("validates a candidate finding through the real POST path", async () => {
    invokeMock.mockImplementation((_fn: string, opts?: { method?: string; body?: unknown }) => {
      if (opts?.method === "GET") {
        return { data: registerResponse(), error: null };
      }
      return {
        data: { ok: true, fact_id: "fact_1", action: "validate", status: "validated" },
        error: null,
      };
    });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByText("Persist middleware docs")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("archie-research", {
        method: "POST",
        body: { fact_id: "fact_1", action: "validate" },
      });
    });
  });

  it("rejects a candidate finding (parks it, never deletes)", async () => {
    invokeMock.mockImplementation((_fn: string, opts?: { method?: string; body?: unknown }) => {
      if (opts?.method === "GET") {
        return { data: registerResponse(), error: null };
      }
      return {
        data: { ok: true, fact_id: "fact_1", action: "reject", status: "uncertain" },
        error: null,
      };
    });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByText("Persist middleware docs")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("archie-research", {
        method: "POST",
        body: { fact_id: "fact_1", action: "reject" },
      });
    });
  });

  it("surfaces a verdict failure honestly instead of pretending", async () => {
    invokeMock.mockImplementation((_fn: string, opts?: { method?: string }) => {
      if (opts?.method === "GET") {
        return { data: registerResponse(), error: null };
      }
      return { data: { ok: false, error: "Fact lookup failed" }, error: null };
    });
    render(<ArchieResearch />);

    await waitFor(() => {
      expect(screen.getByText("Persist middleware docs")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/Fact lookup failed/)).toBeTruthy();
  });
});
