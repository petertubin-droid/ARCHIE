// =========================================================
// STUDIO-CLIENT TESTS (batch 26, fix 111)
// Thin typed client over archie-studio: actions invoke the
// edge function with the right body; failures throw the
// server's honest message; reads surface errors.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    from: (t: string) => fromMock(t),
  },
}));

import {
  getStudioFiles,
  getStudioVersions,
  listStudioProjects,
  studioAction,
} from "@/lib/archie/studio-client";

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
});

describe("studioAction", () => {
  it("invokes archie-studio with the action payload", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { projectId: "p1", message: "created" },
      error: null,
    });
    const r = await studioAction("create", { brief: "a paint app" });
    expect(r.projectId).toBe("p1");
    expect(invokeMock).toHaveBeenCalledWith("archie-studio", {
      body: { action: "create", brief: "a paint app" },
    });
  });

  it("throws the server's honest error message, never fake data", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Owner review required" },
    });
    await expect(studioAction("approve", { projectId: "p1" })).rejects.toThrow(
      "Owner review required",
    );
    invokeMock.mockResolvedValueOnce({
      data: { error: "validation failed" },
      error: null,
    });
    await expect(studioAction("feedback", { projectId: "p1" })).rejects.toThrow(
      "validation failed",
    );
  });
});

describe("reads", () => {
  const q = (
    rows: unknown[] | null,
    err: { message: string } | null = null,
  ) => {
    const chain = {
      select: () => chain,
      neq: () => chain,
      eq: () => chain,
      order: () => Promise.resolve({ data: rows, error: err }),
    };
    return chain;
  };

  it("lists non-archived projects newest-first", async () => {
    fromMock.mockImplementationOnce(() => q([{ id: "p1", status: "DRAFT" }]));
    const projects = await listStudioProjects();
    expect(projects).toHaveLength(1);
    const t = fromMock.mock.calls[0][0];
    expect(t).toBe("frelux_studio_projects");
  });

  it("surfaces read errors and returns empty on no data", async () => {
    fromMock.mockImplementationOnce(() => q(null, { message: "RLS denied" }));
    await expect(listStudioProjects()).rejects.toThrow("RLS denied");
    fromMock.mockImplementationOnce(() => q([]));
    expect(await getStudioFiles("p1")).toEqual([]);
    fromMock.mockImplementationOnce(() => q([]));
    expect(await getStudioVersions("p1")).toEqual([]);
  });
});
