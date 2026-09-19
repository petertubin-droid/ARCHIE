// =========================================================
// REMOTE-BRIDGE TESTS (batch 26, fix 110)
// The consolidated bridge routes archie-* invocations to the
// app's own project with the session JWT; errors surface
// honestly (JSON envelope or network), never fake data.
// =========================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { createArchieInvoker } from "@/lib/archie/remote-bridge";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const OK_RES = { ok: true, json: async () => ({ hello: 1 }) };

describe("createArchieInvoker", () => {
  it("sends the anon key, the session JWT and the JSON body to the function", async () => {
    fetchMock.mockResolvedValueOnce(OK_RES);
    const invoke = createArchieInvoker(async () => "jwt-token-123");
    const r = await invoke("archie-chat", { body: { action: "ping" } });
    expect(r).toEqual({ data: { hello: 1 }, error: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/functions/v1/archie-chat");
    // apikey header is always attached; its value comes from the
    // publishable env key (empty in the test environment).
    expect("apikey" in init.headers).toBe(true);
    expect(init.headers.Authorization).toBe("Bearer jwt-token-123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ action: "ping" });
  });

  it("works for visitor sessions with no token (no Authorization header)", async () => {
    fetchMock.mockResolvedValueOnce(OK_RES);
    const invoke = createArchieInvoker(async () => null);
    await invoke("archie-chat");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("surfaces the server's JSON error message on HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Owner authority required" }),
    });
    const invoke = createArchieInvoker(async () => "t");
    const r = await invoke("archie-owner-auth");
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("Owner authority required");
  });

  it("falls back to a status message for non-JSON error bodies", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    const invoke = createArchieInvoker(async () => "t");
    const r = await invoke("archie-extract");
    expect(r.error?.message).toContain("archie-extract error (500)");
  });

  it("returns a network error instead of crashing or faking data", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const invoke = createArchieInvoker(async () => "t");
    const r = await invoke("archie-chat");
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("connection refused");
  });
});
