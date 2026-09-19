import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------
// Mock the lazy supabase client with RPC + own-row select.
// ---------------------------------------------------------
const rpcMock = vi.fn();
const fromMock = vi.fn();
const authGetUser = vi.fn();

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(async () => ({
    rpc: rpcMock,
    auth: { getUser: authGetUser },
    from: fromMock,
  })),
}));

import {
  fetchMyPersonhood,
  fetchSharedConversations,
  fetchSharedKnowledge,
} from "../stage2-shared-client";
import ArchieShared from "@/pages/archie/ArchieShared";

const chainable = (result: unknown) => {
  const c: Record<string, unknown> = {};
  const passthrough = () => c;
  for (const m of [
    "select",
    "eq",
    "neq",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
    c[m] = vi.fn(passthrough);
  }
  c.then = (onDone: (r: unknown) => unknown) =>
    Promise.resolve({ data: result, error: null }).then(onDone);
  return c as Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  authGetUser.mockResolvedValue({ data: { user: { id: "member-1" } } });
});

describe("shared client (§28)", () => {
  it("reads the person's OWN record only (RLS person-sees-own)", async () => {
    fromMock.mockReturnValue(chainable(null));
    expect(await fetchMyPersonhood()).toBeNull();
    expect(fromMock).toHaveBeenCalledWith("frelux_archie_people");
  });

  it("returns null when not signed in", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await fetchMyPersonhood()).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("shared conversations / knowledge come ONLY from the server RPCs", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: "c1", title: "Lagos build plan", created_date: "2026-09-01" },
      ],
      error: null,
    });
    const conv = await fetchSharedConversations();
    expect(conv.length).toBe(1);
    expect(conv[0].title).toBe("Lagos build plan");
    expect(rpcMock).toHaveBeenCalledWith("frelux_archie_shared_conversations");

    rpcMock.mockResolvedValue({
      data: [
        { id: "k1", topic: "Cement", capability: "CONSTRUCTION", version: 2 },
      ],
      error: null,
    });
    const know = await fetchSharedKnowledge();
    expect(know[0].version).toBe(2);
    expect(rpcMock).toHaveBeenLastCalledWith("frelux_archie_shared_knowledge");
  });

  it("surfaces RPC errors honestly", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(fetchSharedConversations()).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe("ArchieShared page (member view)", () => {
  it("shows the honest no-access state for an unlinked account", async () => {
    fromMock.mockReturnValue(chainable(null));
    render(
      <MemoryRouter>
        <ArchieShared />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("no-access")).toBeTruthy();
    expect(screen.getByText(/not been invited/i)).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("PENDING_REQUEST shows the waiting state and NEVER fetches shared content", async () => {
    fromMock.mockReturnValue(
      chainable({
        id: "p1",
        display_name: "Ada",
        relation: "FAMILY",
        status: "PENDING_REQUEST",
        permissions: [],
        access_expires_at: null,
      }),
    );
    render(
      <MemoryRouter>
        <ArchieShared />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("pending-state")).toBeTruthy();
    expect(screen.getByText(/nothing is granted yet/i)).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("ACTIVE member sees permissions, expiry and both shared lists", async () => {
    fromMock.mockReturnValue(
      chainable({
        id: "p1",
        display_name: "Ada",
        relation: "FAMILY",
        status: "ACTIVE",
        permissions: ["ARCHIE_CHAT", "SHARED_KNOWLEDGE"],
        access_expires_at: "2026-09-16T00:00:00Z",
      }),
    );
    rpcMock.mockImplementation((fn: string) =>
      fn === "frelux_archie_shared_conversations"
        ? Promise.resolve({
            data: [
              {
                id: "c1",
                title: "Lagos build plan",
                created_date: "2026-09-01",
              },
            ],
            error: null,
          })
        : Promise.resolve({
            data: [
              {
                id: "k1",
                topic: "Cement prices",
                capability: "COST",
                version: 3,
              },
            ],
            error: null,
          }),
    );
    render(
      <MemoryRouter>
        <ArchieShared />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Active — access until/i)).toBeTruthy();
    expect(screen.getByText("Lagos build plan")).toBeTruthy();
    expect(await screen.findByText(/Cement prices/)).toBeTruthy();
    expect(screen.getByText("ARCHIE CHAT")).toBeTruthy();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });

  it("REVOKED member sees the revoked state and no shared content is fetched", async () => {
    fromMock.mockReturnValue(
      chainable({
        id: "p1",
        display_name: "Ada",
        relation: "FAMILY",
        status: "REVOKED",
        permissions: [],
        access_expires_at: null,
      }),
    );
    render(
      <MemoryRouter>
        <ArchieShared />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/revoked by the Owner/i)).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
