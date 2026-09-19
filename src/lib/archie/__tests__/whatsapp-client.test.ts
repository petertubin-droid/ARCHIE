// =========================================================
// ARCHIE WHATSAPP CLIENT TESTS
//
// Thin wrapper over archie-whatsapp with the shared envelope.
// Pinned: every console operation sends its documented action,
// engine-reported errors inside data become {ok:false}, and
// the transport error path never throws to the console.
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: vi.fn() }));

import { getSupabase } from "@/lib/supabase-lazy";
import {
  fetchWaStatus,
  saveWaSettings,
  addWaAccount,
  updateWaAccount,
  revokeWaAccount,
  deleteWaAccount,
  fetchWaMessages,
  fetchWaReminders,
  testWaConnection,
  disconnectWa,
} from "@/lib/archie/whatsapp-client";

const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  vi.mocked(getSupabase).mockResolvedValue({ functions: { invoke } } as never);
});

async function bodyOf(
  fn: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  await fn();
  return (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
}

describe("the archie-whatsapp envelope", () => {
  it("success → {ok:true, data}", async () => {
    const status = { enabled: true, accounts: [] };
    invoke.mockResolvedValue({ data: status, error: null });
    const res = await fetchWaStatus();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(status);
    expect(invoke).toHaveBeenCalledWith("archie-whatsapp", {
      body: { action: "status" },
    });
  });

  it("transport error → {ok:false, error}", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "404" } });
    const res = await fetchWaReminders();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("404");
  });

  it("engine-reported error inside data → {ok:false}, never fake success", async () => {
    invoke.mockResolvedValue({
      data: { error: "account already linked" },
      error: null,
    });
    const res = await addWaAccount("234801", "Andrew", "owner");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("already linked");
  });
});

describe("action bodies", () => {
  it.each([
    ["status", () => fetchWaStatus()],
    ["reminders", () => fetchWaReminders()],
    ["test_connection", () => testWaConnection()],
    ["disconnect", () => disconnectWa()],
    ["account_revoke", () => revokeWaAccount("acc-1")],
    ["account_delete", () => deleteWaAccount("acc-1")],
  ])("%s", async (action, fn) => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(fn)).toMatchObject({ action });
  });

  it("settings_save carries the three settings fields", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(() => saveWaSettings(true, false, 30))).toEqual({
      action: "settings_save",
      enabled: true,
      ownerLearningMode: false,
      retentionDays: 30,
    });
  });

  it("account_add carries waId/displayName/role", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(
      await bodyOf(() => addWaAccount("234801", "Andrew", "owner", "user-1")),
    ).toEqual({
      action: "account_add",
      waId: "234801",
      displayName: "Andrew",
      role: "owner",
      userId: "user-1",
    });
  });

  it("account_update spreads the patch", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(
      await bodyOf(() => updateWaAccount("acc-1", { learningMode: true })),
    ).toEqual({ action: "account_update", id: "acc-1", learningMode: true });
  });

  it("messages default to a limit of 50", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(() => fetchWaMessages())).toEqual({
      action: "messages",
      limit: 50,
    });
  });
});
