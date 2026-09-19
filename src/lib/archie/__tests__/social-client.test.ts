// =========================================================
// SOCIAL-CLIENT TESTS (batch 27, fix 117)
// The owner's social surfaces: connect flows route through
// the platform's official OAuth (ARCHIE never touches the
// token), disconnect keeps the vault, REVOKE destroys it;
// insight reports keep observed data / recommendations /
// assumptions as SEPARATE labeled kinds.
// =========================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const authMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (t: string) => fromMock(t),
    auth: { getSession: () => authMock() },
  },
}));

import {
  completeSocialConnection,
  disconnectSocialAccount,
  getSocialAuthorizeUrl,
  listSocialAccounts,
  listSocialAnalyses,
  revokeSocialAccess,
  saveSocialAnalysis,
  syncSocialAccount,
} from "@/lib/archie/social-client";

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  fetchMock.mockReset();
  authMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const q = (opts: {
  rows?: unknown[] | null;
  err?: { message: string } | null;
  capture?: (u: Record<string, unknown>) => void;
  /** which chain method the real code awaits */
  resolveVia?: "order" | "limit" | "insert";
}) => {
  const done = { data: opts.rows ?? null, error: opts.err ?? null };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () =>
    opts.resolveVia === "order" ? Promise.resolve(done) : chain;
  chain.limit = () =>
    opts.resolveVia === "limit" ? Promise.resolve(done) : chain;
  chain.update = (u: Record<string, unknown>) => {
    opts.capture?.(u);
    return chain;
  };
  chain.eq = () => Promise.resolve({ error: opts.err ?? null });
  chain.insert = (u: Record<string, unknown>) => {
    opts.capture?.(u);
    return Promise.resolve({ error: opts.err ?? null });
  };
  return chain;
};

describe("listSocialAccounts", () => {
  it("maps raw rows to typed accounts and returns [] on error (no fake data)", async () => {
    fromMock.mockImplementationOnce(() =>
      q({
        resolveVia: "order",
        rows: [
          {
            id: 7,
            platform: "x",
            account_handle: "@archie",
            status: "SYNCED",
            scopes: ["read"],
            owner_explicitly_authorized: true,
            token_rotation_due: false,
            connected_at: "2026-09-01",
          },
        ],
      }),
    );
    const accounts = await listSocialAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe("7");
    expect(accounts[0].owner_explicitly_authorized).toBe(true);
    fromMock.mockImplementationOnce(() =>
      q({ rows: null, err: { message: "rls" }, resolveVia: "order" }),
    );
    expect(await listSocialAccounts()).toEqual([]);
  });
});

describe("OAuth connect flows — the owner authorizes on the platform itself", () => {
  it("CONNECT returns the platform's official authorize URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authorize_url: "https://platform.example/oauth" }),
    });
    const r = await getSocialAuthorizeUrl("x");
    expect(r).toEqual({
      ok: true,
      authorize_url: "https://platform.example/oauth",
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("archie-social-connect/authorize?platform=x");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("surfaces the platform's error envelope honestly", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "unsupported platform" }),
    });
    const r = await getSocialAuthorizeUrl("myspace");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("unsupported platform");
  });

  it("completes the code exchange with the official redirect URI", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const r = await completeSocialConnection({
      platform: "x",
      code: "c",
      account_handle: "@a",
      scopes: ["read"],
    });
    expect(r.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.redirect_uri).toContain(
      "/functions/v1/archie-social-connect/callback",
    );
  });
});

describe("sync / disconnect / revoke", () => {
  it("SYNC marks SYNCED with a fresh timestamp", async () => {
    const updated: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated, u) }),
    );
    const r = await syncSocialAccount("a1");
    expect(r.ok).toBe(true);
    expect(updated.status).toBe("SYNCED");
    expect(typeof updated.synced_at).toBe("string");
  });

  it("DISCONNECT marks DISCONNECTED (the vaulted token stays)", async () => {
    const updated: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(updated, u) }),
    );
    const r = await disconnectSocialAccount("a1");
    expect(r.ok).toBe(true);
    expect(updated.status).toBe("DISCONNECTED");
  });

  it("REVOKE destroys the vault entry via the server", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const r = await revokeSocialAccess("a1");
    expect(r.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("archie-social-connect/revoke");
  });
});

describe("insight reports — separate labeled kinds, never merged", () => {
  it("saves and lists observations/recommendations/assumptions as distinct kinds", async () => {
    const saved: Record<string, unknown> = {};
    fromMock.mockImplementationOnce(() =>
      q({ capture: (u) => Object.assign(saved, u) }),
    );
    const r = await saveSocialAnalysis({
      account_id: "a1",
      platform: "x",
      observed_platform_data: ["engagement down 12%"],
      archie_recommendations: ["post earlier"],
      archie_assumptions: ["audience is NG-based"],
    });
    expect(r.ok).toBe(true);
    expect(saved.observed_platform_data).toEqual(["engagement down 12%"]);
    expect(saved.archie_assumptions).toEqual(["audience is NG-based"]);

    fromMock.mockImplementationOnce(() =>
      q({
        resolveVia: "limit",
        rows: [
          {
            id: 1,
            platform: "x",
            observed_platform_data: ["d1"],
            archie_recommendations: ["r1"],
            archie_assumptions: ["a1"],
            created_date: "2026-09-15",
          },
        ],
      }),
    );
    const analyses = await listSocialAnalyses();
    expect(analyses[0].archie_recommendations).toEqual(["r1"]);
    expect(analyses[0].created_date).toBe("2026-09-15");
  });
});
