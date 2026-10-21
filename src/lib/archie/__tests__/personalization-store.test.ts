import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: { data: null as unknown, error: null as unknown } }));
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  maybeSingle: vi.fn(async () => query),
  upsert: vi.fn(async () => ({ error: null })),
};
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(() => chain) } }));

import { loadPersonalization, savePersonalization } from "../personalization-store";

const config = {
  accentColor: "violet", verbosity: "balanced", voiceSpeed: 1,
  proactiveSuggestions: false, defaultWorkspace: "chat",
} as const;

describe("account-scoped personalization store", () => {
  beforeEach(() => {
    localStorage.clear();
    query.data = null;
    query.error = null;
    vi.clearAllMocks();
  });

  it("persists settings to the authenticated user's database row", async () => {
    await savePersonalization("u-1", config);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u-1", settings: config }),
      { onConflict: "user_id" },
    );
  });

  it("loads cloud settings and refreshes the offline cache", async () => {
    query.data = { settings: config };
    await expect(loadPersonalization("u-1")).resolves.toEqual(config);
    expect(localStorage.getItem("archie_personalization_v1:u-1")).toContain("violet");
  });

  it("uses the account's cache only when the database request fails", async () => {
    localStorage.setItem("archie_personalization_v1:u-1", JSON.stringify(config));
    query.error = new Error("offline");
    await expect(loadPersonalization("u-1")).resolves.toEqual(config);
  });
});
