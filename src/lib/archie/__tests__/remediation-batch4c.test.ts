// =========================================================
// REMEDIATION BATCH 4C TESTS (2026-09-13)
//
// Fix 8 — durable consolidation scheduling: at most one
// pass per CONSOLIDATION_INTERVAL_SECONDS system-wide; a
// skipped (locked) pass does NOT refresh the timestamp.
//
// Fix 9 — configurable native caps: envInt falls back to
// safe defaults on missing/malformed values; NATIVE_CONFIG
// exposes sane defaults under a clean environment.
// =========================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  consolidateIfDue,
  CONSOLIDATION_INTERVAL_SECONDS,
} from "@studio-shared/archie-ai/native-engine/learning.ts";
import {
  envInt,
  NATIVE_CONFIG,
} from "@studio-shared/archie-ai/native-engine/config.ts";

type Counts = Record<string, number>;

function makeStore(counts: Counts) {
  const saved: Counts[] = [];
  const store = {
    loadCounters: async () => counts,
    saveCounters: async (c: Counts) => {
      saved.push(c);
      Object.assign(counts, c);
    },
    saved,
  };
  return store;
}

describe("Durable consolidation scheduling (fix 8)", () => {
  it("consolidates when overdue and stamps the timestamp", async () => {
    const store = makeStore({ last_consolidation_ts: 1000 });
    const calls: number[] = [];
    const learner = {
      improve: async () => {
        calls.push(1);
        return { merged: 1, decayed: 0, promoted: 0, dropped: 0 };
      },
    };
    const ran = await consolidateIfDue(
      learner,
      store,
      1000 + CONSOLIDATION_INTERVAL_SECONDS + 1,
    );
    expect(ran).toBe(true);
    expect(calls).toHaveLength(1);
    expect(store.saved[0]["last_consolidation_ts"]).toBe(
      1000 + CONSOLIDATION_INTERVAL_SECONDS + 1,
    );
  });

  it("does nothing inside the interval", async () => {
    const store = makeStore({ last_consolidation_ts: 5000 });
    const learner = {
      improve: async () => ({ merged: 1, decayed: 0, promoted: 0, dropped: 0 }),
    };
    const ran = await consolidateIfDue(learner, store, 5000 + 60);
    expect(ran).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("a locked (skipped) pass does not refresh the timestamp", async () => {
    const store = makeStore({}); // never consolidated
    const learner = {
      improve: async () => ({
        merged: 0,
        decayed: 0,
        promoted: 0,
        dropped: 0,
        skipped: true,
      }),
    };
    const ran = await consolidateIfDue(learner, store, 9000);
    expect(ran).toBe(false);
    expect(store.saved).toHaveLength(0);
    expect(
      (await store.loadCounters())["last_consolidation_ts"],
    ).toBeUndefined();
  });

  it("no counter store means no durable scheduling", async () => {
    const learner = {
      improve: async () => ({ merged: 0, decayed: 0, promoted: 0, dropped: 0 }),
    };
    expect(await consolidateIfDue(learner, null)).toBe(false);
  });
});

describe("Configurable native caps (fix 9)", () => {
  const KEY = "FRELUX_TEST_CAP";
  beforeEach(() => {
    delete process.env[KEY];
  });
  afterEach(() => {
    delete process.env[KEY];
  });

  it("missing env value uses the default", () => {
    expect(envInt(KEY, 500)).toBe(500);
  });

  it("valid positive integer overrides", () => {
    process.env[KEY] = "42";
    expect(envInt(KEY, 500)).toBe(42);
  });

  it("malformed and non-positive values fall back to the default", () => {
    process.env[KEY] = "abc";
    expect(envInt(KEY, 500)).toBe(500);
    process.env[KEY] = "-3";
    expect(envInt(KEY, 500)).toBe(500);
    process.env[KEY] = "  ";
    expect(envInt(KEY, 500)).toBe(500);
  });

  it("NATIVE_CONFIG ships sane production defaults", () => {
    expect(NATIVE_CONFIG.factHydrateLimit).toBeGreaterThanOrEqual(100);
    expect(NATIVE_CONFIG.outcomeLimit).toBeGreaterThanOrEqual(50);
    expect(NATIVE_CONFIG.episodicLimit).toBeGreaterThanOrEqual(50);
    expect(NATIVE_CONFIG.rankK).toBeGreaterThanOrEqual(3);
  });
});
