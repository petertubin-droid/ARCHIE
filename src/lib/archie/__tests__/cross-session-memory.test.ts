import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { understand } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";

// =========================================================
// ARCHIE — CROSS-SESSION MEMORY + TEMPORAL FALL-THROUGH
// src/lib/archie/__tests__/cross-session-memory.test.ts
//
// Perf-pass entry 2 (2026-09-11, capability gap cx-3).
// Two fixes, both found by honest probing:
//   1. The temporal strategy intercepted "when is X?" and,
//      finding no DATED facts, declared "no history" — even
//      when a plain stored fact (X, is, "on Tuesday") answered
//      the question. It now falls through to the standard
//      knowledge path when plain facts exist; the honest
//      no-history answer is reserved for genuinely unknown
//      subjects.
//   2. "what day is X?" / "on which date is X?" were
//      misclassified capability_query (weak Bayes token
//      overlap). A deterministic stage-1 rule now routes
//      day/date questions to knowledge_query.
// =========================================================

class DurableMemDb {
  tables: Record<string, Array<Record<string, unknown>>> = {};
  from(table: string) {
    const rows = () => (this.tables[table] ??= []);
    return {
      // Contract (hydrate cap, 2026-09-16): selects page via
      // .range(); the thenable covers legacy bare awaits.
      select: () => ({
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows().slice(from, to + 1), error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [...rows()], error: null })) as never,
      }),
      insert: async (rs: unknown) => {
        for (const r of rs as Array<Record<string, unknown>>) rows().push({ ...r });
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (rs: unknown) => {
        for (const r of rs as Array<Record<string, unknown>>) rows().push({ ...r });
        return { error: null };
      },
    };
  }
}

function twoSessions() {
  const db = new DurableMemDb();
  return {
    db,
    e1: new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
      conversationId: "cx",
    }),
    e2: () =>
      new ArchieNativeEngine({
        persistence: db as unknown as SupabaseLike,
        conversationId: "cx",
      }),
  };
}

describe("cross-session memory (cx-3)", () => {
  it("a fresh session answers from a fact taught in a previous session", async () => {
    const { e1, e2 } = twoSessions();
    await e1.converse("remember that the delivery is on Tuesday");
    const second = e2();
    await second.boot();
    const r = await second.converse("when is the delivery?");
    expect(r.responseText.toLowerCase()).toContain("tuesday");
    expect(r.responseText).toContain("delivery"); // names the subject
    // provenance preserved across the session boundary
    expect(r.responseText.toLowerCase()).toContain("owner-taught");
  });

  it("the taught fact is DURABLE (persisted once, hydrated by the new instance)", async () => {
    const { db, e1, e2 } = twoSessions();
    await e1.converse("remember that the delivery is on Tuesday");
    const factRows = db.tables["frelux_archie_native_facts"] ?? [];
    const delivery = factRows.find((f) => String(f.subject) === "delivery");
    expect(delivery).toBeDefined();
    expect(delivery!.object).toBe("on Tuesday");
    const second = e2();
    await second.boot();
    const d = second.diagnostics();
    expect(d.counts.facts).toBeGreaterThan(0); // hydrated, not empty
  });

  it("episodic turns from the prior session are recalled (P7 integration)", async () => {
    const { e1, e2 } = twoSessions();
    await e1.converse("remember that my tile supplier is Toglam");
    const second = e2();
    await second.boot();
    const d = second.diagnostics();
    expect(d.counts.episodicTurns).toBeGreaterThanOrEqual(2); // owner + archie
  });
});

describe("temporal fall-through (no dated facts must not mask plain facts)", () => {
  it("falls through to the knowledge path when a plain fact answers the question", async () => {
    const e = new ArchieNativeEngine({ persistence: null });
    await e.converse("remember that the delivery is on Tuesday");
    const r = await e.converse("when is the delivery?");
    expect(r.responseText.toLowerCase()).toContain("tuesday");
    // must NOT have answered the stale "no dated facts" refusal
    expect(r.responseText).not.toContain("no dated facts");
  });

  it("keeps the honest no-history answer for genuinely unknown subjects", async () => {
    const e = new ArchieNativeEngine({ persistence: null });
    const r = await e.converse("when was the ziggurat renovated?");
    // unknown subject — either the honest unknown answer or the
    // honest no-dated-history answer, never a fabricated date.
    const t = r.responseText.toLowerCase();
    expect(
      t.includes("no dated facts") ||
        t.includes("i don't know") ||
        t.includes("i do not know") ||
        t.includes("not in my validated knowledge") ||
        t.includes("no historical") ||
        t.includes("honest") ||
        t.includes("cannot"),
    ).toBe(true);
    expect(t).not.toContain("ziggurat was renovated in");
  });
});

describe("NLU: day/date questions route to knowledge_query", () => {
  it("classifies day/date questions deterministically", () => {
    for (const q of [
      "what day is the delivery?",
      "on what day is the delivery",
      "which date is the handover",
      "what time is the pour?",
    ]) {
      const u = understand(q);
      expect(u.intent, `${q} → ${u.intent}`).toBe("knowledge_query");
      expect(u.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("does not capture capability or identity questions about ARCHIE itself", () => {
    expect(understand("what can you do").intent).toBe("capability_query");
    expect(understand("who are you").intent).toBe("identity_query");
    expect(understand("what is screeding").intent).toBe("knowledge_query");
  });
});
