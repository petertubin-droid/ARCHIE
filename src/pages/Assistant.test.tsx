import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ARCHIE PWA FRONT DOOR — mount smoke test.
//
// The page (1580 lines) is the signed-in owner's assistant
// shell: 4 tabs (Assistant / Capabilities / Vault / Security),
// the family-network gate (frelux_archie_people), privileged
// conversations through the chat-client, and the mobile
// capability/consent/vault surfaces. This test pins the MOUNT
// contract: the shell renders, tabs exist, the composer is
// present, and the family-gate effect settles honestly with
// an empty registry (status "none" → not privileged).

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com" },
    isAdmin: true,
    profile: null,
    loading: false,
  }),
}));

// supabase: family-gate query chain must resolve empty data.
vi.mock("@/lib/supabase", () => {
  const b: Record<string, unknown> = {};
  const chain = {
    select: () => b,
    eq: () => b,
    neq: () => b,
    order: () => b,
    limit: () => b,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(cb ? cb({ data: [], error: null }) : { data: [], error: null }),
  };
  Object.assign(b, chain);
  return {
    supabase: { from: () => b, auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
    getFunctionErrorMessage: () => "Function unavailable",
  };
});

// Constants stay REAL; only the predicate functions are pinned.
vi.mock("@/lib/archie/mobile/capabilities", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/archie/mobile/capabilities")
  >();
  return {
    ...actual,
    checkCapabilityConsent: () => true,
    isCapabilitySupported: () => true,
    isSafeLink: () => true,
  };
});
vi.mock("@/lib/archie/mobile/paid-services", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/archie/mobile/paid-services")
  >();
  return {
    ...actual,
    fetchPaidActivations: vi.fn(async () => ({})),
    activatePaidCapability: vi.fn(),
    deactivatePaidCapability: vi.fn(),
  };
});
vi.mock("@/lib/archie/mobile/owner-policy", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/archie/mobile/owner-policy")
  >()),
}));

vi.mock("@/lib/archie/mobile/consent", () => ({
  fetchConsents: vi.fn(async () => ({})),
  loadCachedConsents: vi.fn(() => ({})),
  grantCapability: vi.fn(async () => true),
  revokeCapability: vi.fn(async () => true),
}));
vi.mock("@/lib/archie/mobile/voice", () => ({
  speakArchie: vi.fn(),
  stopArchieVoice: vi.fn(),
}));
vi.mock("@/components/archie/ChatComposer", () => ({
  default: () => <div data-testid="chat-composer" />,
}));
vi.mock("@/lib/archie/chat-client", () => ({
  sendMessage: vi.fn(async () => ({ reply: "ok" })),
  listConversations: vi.fn(async () => []),
  listMessages: vi.fn(async () => []),
  createConversation: vi.fn(async () => null),
  renameConversation: vi.fn(async () => true),
  archiveConversation: vi.fn(async () => true),
  searchConversations: vi.fn(async () => []),
}));
vi.mock("@/lib/archie/tool-router", () => ({
  assertAuthority: vi.fn(() => ({ allowed: true })),
  selectTool: vi.fn(() => null),
}));
vi.mock("@/lib/archie/mobile/device-sessions", () => ({
  registerCurrentSession: vi.fn(async () => ({ ok: true })),
  fetchSessions: vi.fn(async () => []),
  revokeSession: vi.fn(async () => ({ ok: true })),
  revokeAllOtherSessions: vi.fn(async () => ({ ok: true })),
  validateCurrentSession: vi.fn(async () => ({ valid: true })),
}));
vi.mock("@/lib/archie/mobile/security-events", () => ({
  fetchSecurityEvents: vi.fn(async () => []),
  markSecurityEventsRead: vi.fn(async () => true),
  requestNotificationPermission: vi.fn(async () => "denied"),
  notifyUserDevice: vi.fn(async () => true),
}));
vi.mock("@/lib/archie/mobile/vault", () => ({
  protectItem: vi.fn(async () => ({ ok: true })),
  listProtectedItems: vi.fn(async () => []),
  recoverProtectedItem: vi.fn(async () => ({ ok: false })),
  clearLocalProtectedCache: vi.fn(),
}));
vi.mock("@/lib/archie/mobile/owner-authorization", () => ({
  checkOwnerCredential: vi.fn(async () => false),
  setOwnerSecret: vi.fn(async () => ({ ok: true })),
  authorizeOwnerChange: vi.fn(async () => ({ ok: true })),
  listOwnerAuthorizations: vi.fn(async () => []),
  purgeTranscriptsForAuthorization: vi.fn(async () => ({ ok: true })),
}));

import Assistant from "@/pages/Assistant";

beforeEach(() => vi.clearAllMocks());

describe("Assistant page — the PWA front door (2026-10-20 full-screen chat)", () => {
  it("mounts the full-screen chat shell with no console banner", async () => {
    const { container } = render(<Assistant />);
    await waitFor(
      () =>
        expect(
          container.querySelector('[data-testid="archie-fullscreen-chat"]'),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
    // Owner directive: the ARCHIE INTELLIGENCE console box is gone.
    expect(screen.queryByText("ARCHIE INTELLIGENCE")).toBeNull();
    expect(container.textContent).toContain("ARCHIE");
  });

  it("starts with NO seeded greeting — ARCHIE answers only when spoken to", async () => {
    const { container } = render(<Assistant />);
    await waitFor(
      () =>
        expect(
          container.querySelector('[data-testid="archie-fullscreen-chat"]'),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(
      screen.queryByText(/Hi, I'm ARCHIE/i),
    ).toBeNull();
    // A quiet empty state invites the first message instead of
    // ARCHIE speaking first.
    expect(
      container.querySelector('[data-testid="archie-empty-state"]'),
    ).toBeTruthy();
  });

  it("renders all four feature tabs", async () => {
    render(<Assistant />);
    await waitFor(
      () => expect(screen.getByTestId("archie-fullscreen-chat")).toBeTruthy(),
      { timeout: 5000 },
    );
    for (const label of ["Assistant", "Capabilities", "Vault", "Security"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders the chat composer on the assistant tab", async () => {
    const { container } = render(<Assistant />);
    await waitFor(
      () =>
        expect(container.querySelector('[data-testid="chat-composer"]')).toBeTruthy(),
      { timeout: 5000 },
    );
  });
});
