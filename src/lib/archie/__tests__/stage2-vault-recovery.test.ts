import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------
// Mock the supabase client for knowledge-client + recovery.
// ---------------------------------------------------------
const chainable = (result: unknown, err: unknown = null) => {
  const c: Record<string, unknown> = {};
  const passthrough = () => c;
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "is",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
    c[m] = vi.fn(passthrough);
  }
  c.then = (onDone: (r: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve({ data: result, error: err }).then(onDone, onErr);
  return c as Record<string, ReturnType<typeof vi.fn>>;
};

const fromMock = vi.fn();
const authGetUser = vi
  .fn()
  .mockResolvedValue({ data: { user: { id: "owner-1" } } });

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(async () => ({
    from: fromMock,
    auth: { getUser: authGetUser },
  })),
}));

const revokeAllOtherSessions = vi.fn().mockResolvedValue(2);
vi.mock("@/lib/archie/mobile/device-sessions", () => ({
  revokeAllOtherSessions: (...a: unknown[]) => revokeAllOtherSessions(...a),
}));

const recordAuditEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/archie/stage1-client", () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a),
}));

import {
  listKnowledgeHistory,
  rollbackKnowledgeItem,
  updateKnowledgeItem,
} from "../stage2-knowledge-client";
import { recoverLostDevice } from "../stage2-device-recovery";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Knowledge Vault client (Stage 2)", () => {
  it("updateKnowledgeItem bumps the version and stores the change reason", async () => {
    // select() for current → single(); update() chain → select() → single()
    let call = 0;
    fromMock.mockImplementation((_table: string) => {
      call++;
      if (call === 1) return chainable({ version: 3 }); // current version
      return chainable({
        // updated row
        id: "k1",
        version: 4,
        topic: "Cement price",
        change_reason: "typo fix",
      });
    });
    const updated = await updateKnowledgeItem(
      "k1",
      { topic: "Cement price" },
      "typo fix",
    );
    expect(updated.version).toBe(4);
    expect(updated.change_reason).toBe("typo fix");
    const updateArgs = fromMock.mock.calls[1];
    expect(updateArgs[0]).toBe("frelux_knowledge_items");
  });

  it("REFUSES to save without a change reason — nothing edited silently", async () => {
    await expect(
      updateKnowledgeItem("k1", { topic: "x" }, "   "),
    ).rejects.toThrow(/change reason is required/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rollbackKnowledgeItem restores the prior version AS A NEW VERSION", async () => {
    let call = 0;
    fromMock.mockImplementation((_t: string) => {
      call++;
      if (call === 1)
        return chainable({
          version: 2,
          topic: "Old topic",
          capability: "c",
          scope: "USER",
          content: { a: 1 },
          evidence_state: "USER_PROVIDED",
          confidence: null,
        }); // history lookup
      if (call === 2) return chainable({ version: 4 }); // current version
      return chainable({
        id: "k1",
        version: 5,
        topic: "Old topic",
        change_reason: "Owner rollback to version 2.",
      });
    });
    const rolled = await rollbackKnowledgeItem("k1", 2);
    expect(rolled.version).toBe(5);
    expect(rolled.change_reason).toMatch(/rollback to version 2/i);
    // history table was consulted first
    expect(fromMock.mock.calls[0][0]).toBe("frelux_archie_knowledge_history");
  });

  it("rollback refuses when the version is not in history", async () => {
    fromMock.mockReturnValue(chainable(null)); // no history row
    await expect(rollbackKnowledgeItem("k1", 9)).rejects.toThrow(
      /not found in history/i,
    );
  });

  it("listKnowledgeHistory reads the history table ordered by version", async () => {
    const c = chainable([
      { item_id: "k1", version: 2 },
      { item_id: "k1", version: 1 },
    ]);
    fromMock.mockReturnValue(c);
    const h = await listKnowledgeHistory("k1");
    expect(h.length).toBe(2);
    expect(fromMock).toHaveBeenCalledWith("frelux_archie_knowledge_history");
    expect(c.order).toHaveBeenCalledWith("version", { ascending: false });
  });
});

describe("Lost-device recovery (Stage 2 §24)", () => {
  it("revokes the device, kills other sessions, audits and returns the checklist", async () => {
    fromMock.mockReturnValue(chainable({})); // device update
    const res = await recoverLostDevice("dev-1", "Pixel 7");
    expect(res.ok).toBe(true);
    expect(res.revokedSessions).toBe(2);
    expect(revokeAllOtherSessions).toHaveBeenCalledWith("owner-1");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "archie.device.recovery",
      "WARNING",
      expect.objectContaining({ device_id: "dev-1", revoked_sessions: 2 }),
    );
    expect(res.steps.length).toBe(4);
    expect(res.steps.join(" ")).toMatch(/never the only copy/i);
    // the device row was set REVOKED
    const c = fromMock.mock.results[0].value as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    expect(c.update).toHaveBeenCalledWith({ status: "REVOKED" });
  });

  it("refuses when not signed in", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(recoverLostDevice("dev-1", "x")).rejects.toThrow(/sign in/i);
  });
});
