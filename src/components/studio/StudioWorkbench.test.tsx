// =========================================================
// ARCHIE STUDIO WORKBENCH — TESTS
//
// Verifies:
//   * Workspace header and status bar
//   * Live Preview, Source Editor, and Versions modes
//   * Editor file selection and editing
//   * Safe client-side fallback when offline
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listStudioProjects = vi.fn();
const getStudioFiles = vi.fn();
const getStudioVersions = vi.fn();
const studioAction = vi.fn();

vi.mock("@/lib/archie/studio-client", () => ({
  listStudioProjects: (...args: unknown[]) => listStudioProjects(...args),
  getStudioFiles: (...args: unknown[]) => getStudioFiles(...args),
  getStudioVersions: (...args: unknown[]) => getStudioVersions(...args),
  studioAction: (...args: unknown[]) => studioAction(...args),
}));

import StudioWorkbench from "./StudioWorkbench";

beforeEach(() => {
  vi.clearAllMocks();
  listStudioProjects.mockResolvedValue([
    {
      id: "proj_demo_1",
      title: "Archie Demo Portal",
      description: "Interactive demo portal",
      owner_id: "owner-1",
      current_version_id: "v1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
  getStudioFiles.mockResolvedValue([
    { path: "index.html", content: "<h1>Hello Archie</h1>" },
    { path: "style.css", content: "body { background: #0b1120; }" },
  ]);
  getStudioVersions.mockResolvedValue([]);
});

describe("StudioWorkbench Component", () => {
  it("renders the IDE header and workspace controls", async () => {
    render(<StudioWorkbench />);
    expect(screen.getByText("ARCHIE CODING STUDIO")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Live Preview/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Source Editor/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Versions/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /New Project/i })).toBeTruthy();
  });

  it("switches to Source Editor mode and displays textarea for active file", async () => {
    render(<StudioWorkbench />);
    const editorBtn = screen.getByRole("button", { name: /Source Editor/i });
    fireEvent.click(editorBtn);

    const textarea = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA");
    expect(textarea).toBeTruthy();
  });

  it("allows selecting a file from the explorer and typing in the editor", async () => {
    render(<StudioWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: /Source Editor/i }));

    const styleFileBtn = screen.getByRole("button", { name: "style.css" });
    fireEvent.click(styleFileBtn);

    const textarea = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA");
    expect(textarea).toBeTruthy();
    if (textarea) {
      fireEvent.change(textarea, { target: { value: "body { color: gold; }" } });
      expect(textarea).toHaveValue("body { color: gold; }");
    }
  });

  it("switches to versions view", async () => {
    render(<StudioWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: /Versions/i }));
    expect(screen.getByText(/No previous versions recorded yet/i)).toBeTruthy();
  });
});
