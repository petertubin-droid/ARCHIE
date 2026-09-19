// =========================================================
// REMEDIATION BATCH 4B TESTS (2026-09-13)
//
// Single-writer consolidation: FactStore.consolidate() claims
// a DB-backed lock before its pass. Another writer holding
// the claim makes this instance HONESTLY SKIP (skipped:true,
// no writes) instead of interleaving last-writer-wins
// updates. Fail-open: missing rpc = legacy unlocked behavior.
// =========================================================

import { describe, it, expect, vi } from "vitest";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import { SupabasePersistence } from "@studio-shared/archie-ai/native-engine/persistence.ts";

function rpcDb(claim: boolean) {
  const rpcCalls: string[] = [];
  const db = {
    rpc: async (fn: string, _args?: Record<string, unknown>) => {
      rpcCalls.push(fn);
      if (fn === "frelux_try_engine_lock") {
        return { data: claim, error: null };
      }
      return { data: null, error: null };
    },
    from: (_t: string) => ({
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
    }),
  };
  return { db, rpcCalls };
}

describe("Single-writer consolidation (remediation batch 4)", () => {
  it("skips honestly when another writer holds the claim", async () => {
    const { db, rpcCalls } = rpcDb(false);
    const pers = new SupabasePersistence(db as never);
    const spy = vi.spyOn(pers, "saveFacts");
    const store = new FactStore(pers as never);
    const res = await store.consolidate();
    expect(res.skipped).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(rpcCalls).toContain("frelux_try_engine_lock");
    // A refused claim is never released — it belongs to the other writer.
    expect(rpcCalls).not.toContain("frelux_release_engine_lock");
  });

  it("consolidates and releases when the claim is acquired", async () => {
    const { db, rpcCalls } = rpcDb(true);
    const pers = new SupabasePersistence(db as never);
    const store = new FactStore(pers as never);
    const res = await store.consolidate();
    expect(res.skipped).toBeFalsy();
    expect(rpcCalls).toContain("frelux_release_engine_lock");
  });

  it("legacy in-memory persistence keeps the old unlocked behavior", async () => {
    const store = new FactStore({
      loadFacts: async () => [],
      saveFact: async () => {},
      saveFacts: async () => {},
    } as never);
    const res = await store.consolidate();
    expect(res.skipped).toBeUndefined();
  });

  it("supabase client without rpc fails open (legacy behavior)", async () => {
    const db = {
      from: (_t: string) => ({
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      }),
    };
    const pers = new SupabasePersistence(db as never);
    expect(await pers.tryLock("s", "h", 60)).toBe(true);
  });
});
