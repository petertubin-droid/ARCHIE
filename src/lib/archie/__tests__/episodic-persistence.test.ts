import { beforeEach, describe, expect, it } from "vitest";
// =========================================================
// EPISODIC MEMORY PERSISTENCE (plan P7 batch 1)
//
// Acceptance (from the plan): a fresh chat request recalls
// owner-taught episodic context from a previous session (when
// consent is on); diagnostics report system-wide numbers,
// not per-isolate noise.
//
// The fake Supabase client simulates the durable store
// shared by all isolates: engine instance #2 (a "fresh
// isolate") must recall what engine instance #1 taught.
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";

interface Row {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  turn_at: string;
  [k: string]: unknown;
}

/** Durable fake: persists across engine instances, like the
 *  real table shared by all edge isolates. */
class FakeEpisodicDb implements SupabaseLike {
  episodicRows: Row[] = [];
  otherTables: Record<string, Row[]> = {};
  writeFailures = 0;

  from(table: string) {
    const rowsOf = (t: string): Row[] =>
      t === "frelux_archie_episodic_turns"
        ? this.episodicRows
        : (this.otherTables[t] ??= []);
    return {
      select: (_q: string) => {
        const data =
          table === "frelux_archie_episodic_turns" ? [...this.episodicRows] : [];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({
              data: data.slice(from, to + 1),
              error: null,
            }),
        });
      },
      insert: async (rs: unknown) => {
        if (this.writeFailures > 0) {
          this.writeFailures--;
          return { error: { message: "simulated write failure" } };
        }
        for (const r of rs as Row[]) rowsOf(table).push({ ...r });
        return { error: null };
      },
      // supabase-js returns a synchronous builder, never a
      // promise, from update() — the chain is .update().eq().
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (rs: unknown) => {
        for (const r of rs as Row[]) {
          const rows = rowsOf(table);
          const i = rows.findIndex((x) => x.key === r.key);
          if (i >= 0) rows[i] = { ...rows[i], ...r };
          else rows.push({ ...r });
        }
        return { error: null };
      },
    };
  }
}

let db: FakeEpisodicDb;
beforeEach(() => {
  db = new FakeEpisodicDb();
});

describe("episodic persistence — write path", () => {
  it("persists the owner turn and ARCHIE's reply with the conversation id", async () => {
    const engine = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
      conversationId: "conv-42",
    });
    await engine.converse("remember that my site foreman is named Baba");
    const owners = db.episodicRows.filter((r) => r.role === "owner");
    const archies = db.episodicRows.filter((r) => r.role === "archie");
    expect(owners.length).toBe(1);
    expect(owners[0].text).toContain("Baba");
    expect(owners[0].conversation_id).toBe("conv-42");
    expect(archies.length).toBe(1);
    expect(archies[0].conversation_id).toBe("conv-42");
  });

  it("conversation id defaults and is switchable per request", async () => {
    const engine = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await engine.converse("hello there");
    engine.setConversationId("conv-99");
    await engine.converse("hi again");
    const convs = new Set(db.episodicRows.map((r) => r.conversation_id));
    expect(convs).toContain("default");
    expect(convs).toContain("conv-99");
  });

  it("a failed episodic write NEVER breaks the conversation", async () => {
    const engine = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    db.writeFailures = 5; // every insert fails
    const res = await engine.converse("what is screeding");
    expect(res.responseText).toMatch(/validated knowledge/i);
    expect(res.responseText.length).toBeGreaterThan(0);
  });

  it("consent revoked (persistence null) → zero episodic writes or reads", async () => {
    const engine = new ArchieNativeEngine(); // in-memory only
    await engine.converse("remember that my site foreman is named Baba");
    expect(db.episodicRows).toHaveLength(0);
    const d = engine.diagnostics();
    expect(d.persistence.episodic).toBe(false);
    expect(d.counts.episodicTurns).toBe(0);
  });
});

describe("episodic persistence — cross-isolate recall (plan acceptance)", () => {
  it("a FRESH isolate recalls owner-taught context from a previous session", async () => {
    // Session 1: engine instance on isolate A
    const first = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
      conversationId: "conv-42",
    });
    await first.converse(
      "remember that my tile supplier in Lagos is Toglam and they deliver on Saturdays",
    );

    // Session 2: a completely FRESH engine instance (new
    // isolate, cold boot — the singleton died with the
    // isolate). It must hydrate the prior-session turns.
    const second = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
      conversationId: "conv-42",
    });
    await second.boot();
    const d = second.diagnostics();
    expect(d.counts.episodicTurns).toBeGreaterThanOrEqual(2); // owner + archie pair
    expect(d.persistence.episodic).toBe(true);
    // Retrieval actually surfaces the prior-session context
    // (public retrieval surface — C-1 sessions, M-2 API)
    const ctx = second.retrieveContext("who supplies my tiles", "conv-42");
    const texts = ctx.salientTurns.map((t) => t.text).join(" ");
    expect(texts).toMatch(/Toglam/i);
  });

  it("diagnostics report system-wide memory, not just this isolate's buffers", async () => {
    const first = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await first.converse("remember my cement brand is Dangote");
    const second = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await second.boot();
    const d = second.diagnostics();
    // episodicTurns > memoryTurns: the hydrated prior-session
    // context is counted, and this isolate has no live turns
    // at boot — the system-wide number is the honest one.
    expect(d.counts.episodicTurns).toBeGreaterThan(d.counts.memoryTurns);
  });

  it("episodic rows accumulate across sessions without duplicating re-sent history", async () => {
    const first = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
      conversationId: "c1",
    });
    await first.converse("remember fact one");
    const before = db.episodicRows.length;
    // The engine persists only the NEW turn pair per request —
    // the same message re-sent with history does NOT
    // duplicate the stored history rows.
    await first.converse("remember fact one", [
      {
        role: "owner",
        parts: [{ text: "remember fact one" }],
      },
    ]);
    const persistedOwners = db.episodicRows.filter(
      (r) => r.role === "owner" && r.text === "remember fact one",
    ).length;
    expect(persistedOwners).toBeLessThanOrEqual(2); // one per request, never per-history-turn
    expect(before).toBeLessThanOrEqual(db.episodicRows.length);
  });
});
