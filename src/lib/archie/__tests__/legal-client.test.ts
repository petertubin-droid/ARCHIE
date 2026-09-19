// =========================================================
// ARCHIE LEGAL CLIENT TESTS
//
// Thin wrapper over archie-legal with the shared result
// envelope. Pinned:
//   * every operation sends its documented action
//   * PWA consents are tagged source: "pwa"
//   * transport errors AND engine-reported errors both become
//     {ok:false, error} — the caller never sees a raw throw
//   * the full export surface is exercised once each
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: vi.fn() }));

import { getSupabase } from "@/lib/supabase-lazy";
import {
  fetchLegalDocs,
  fetchLegalDoc,
  fetchGovernance,
  fetchConsents,
  setConsent,
  searchMemory,
  correctMemory,
  deleteMemory,
  deleteMemorySubject,
  clearConversations,
  exportMyData,
  requestDeletion,
  myRightsRequests,
  adminAllDocuments,
  adminSaveDraft,
  adminApprove,
  adminPublish,
  adminHistory,
} from "@/lib/archie/legal-client";

const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  vi.mocked(getSupabase).mockResolvedValue({ functions: { invoke } } as never);
});

async function bodyOf(
  fn: () => Promise<unknown>,
  call = 0,
): Promise<Record<string, unknown>> {
  invoke.mockResolvedValue({ data: {}, error: null });
  await fn();
  return (invoke.mock.calls[call][1] as { body: Record<string, unknown> }).body;
}

describe("the archie-legal envelope", () => {
  it("success → {ok:true, data}", async () => {
    invoke.mockResolvedValue({
      data: { documents: [], disclosure: "d", copyright: "c" },
      error: null,
    });
    const res = await fetchLegalDocs();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.documents).toEqual([]);
    expect(invoke).toHaveBeenCalledWith(
      "archie-legal",
      expect.objectContaining({ body: { action: "docs" } }),
    );
  });

  it("transport error → {ok:false, error: message}", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "502" } });
    const res = await fetchGovernance();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("502");
  });

  it("engine-reported error inside data → {ok:false}, never fake success", async () => {
    invoke.mockResolvedValue({
      data: { error: "consent denied" },
      error: null,
    });
    const res = await setConsent("analytics", false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("consent denied");
  });
});

describe("action bodies", () => {
  it.each([
    ["docs", () => fetchLegalDocs()],
    ["governance", () => fetchGovernance()],
    ["consent_get", () => fetchConsents()],
    ["memory_delete", () => deleteMemory("f1")],
    ["memory_delete_subject", () => deleteMemorySubject("payments")],
    ["clear_conversations", () => clearConversations()],
    ["memory_export", () => exportMyData()],
    ["my_requests", () => myRightsRequests()],
    ["all_documents", () => adminAllDocuments()],
    ["approve", () => adminApprove("d1")],
  ])("%s", async (action, fn) => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await bodyOf(fn)).toMatchObject({ action });
  });

  it("doc fetch carries the key", async () => {
    expect(await bodyOf(() => fetchLegalDoc("privacy"))).toEqual({
      action: "doc",
      key: "privacy",
    });
  });

  it("consent_set is tagged as coming from the PWA", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(
      await bodyOf(() =>
        setConsent("marketing", true, { channels: ["email"] }),
      ),
    ).toEqual({
      action: "consent_set",
      consent_key: "marketing",
      granted: true,
      value: { channels: ["email"] },
      source: "pwa",
    });
  });

  it("memory_search carries the query", async () => {
    expect(await bodyOf(() => searchMemory("roof load"))).toEqual({
      action: "memory_search",
      q: "roof load",
    });
  });

  it("memory_correct carries id + object", async () => {
    expect(await bodyOf(() => correctMemory("f1", { k: 1 }))).toEqual({
      action: "memory_correct",
      id: "f1",
      object: { k: 1 },
    });
  });

  it("request_deletion defaults detail to {}", async () => {
    expect(await bodyOf(() => requestDeletion("export"))).toEqual({
      action: "request_deletion",
      kind: "export",
      detail: {},
    });
  });

  it("save_draft / publish / history carry their payloads", async () => {
    expect(
      await bodyOf(() => adminSaveDraft("privacy", "Privacy", "body"), 0),
    ).toEqual({
      action: "save_draft",
      key: "privacy",
      title: "Privacy",
      body: "body",
    });
    expect(await bodyOf(() => adminPublish("d1", "2026-10-01"), 1)).toEqual({
      action: "publish",
      id: "d1",
      effective_date: "2026-10-01",
    });
    expect(await bodyOf(() => adminHistory("privacy"), 2)).toEqual({
      action: "history",
      key: "privacy",
    });
  });
});
