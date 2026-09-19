// =========================================================
// FRELUX ARCHIE STAGE 1, CHAT CLIENT TESTS
//
// Covers the Owner Chat Center persistence contract:
//  * sendMessage: owner turn persisted, ARCHIE Core invoked,
//    reply persisted with honest engine provenance
//  * external-adapter replies are LABELED as such, never as
//    ARCHIE-native inference
//  * failures surface as errors (no fake intelligence)
//  * conversation list/search/create
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

// ---------------------------------------------------------
// Minimal supabase mock: chainable query + insert capture
// ---------------------------------------------------------
const state = {
  conversations: [] as Row[],
  messages: [] as Row[],
  invokeImpl: null as
    | ((
        fn: string,
        opts?: { body?: unknown },
      ) => Promise<{ data: unknown; error: Error | null }>)
    | null,
};

function table(name: string) {
  const rows = () =>
    name === "frelux_archie_conversations"
      ? state.conversations
      : state.messages;
  const filters: ((r: Row) => boolean)[] = [];
  let inserted: Row | null = null;
  let single = false;

  const apply = () => rows().filter((r) => filters.every((f) => f(r)));

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return chain;
    },
    ilike: (col: string, val: string) => {
      const term = String(val).slice(1, -1);
      filters.push((r) =>
        String(r[col] ?? "")
          .toLowerCase()
          .includes(term.toLowerCase()),
      );
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    single: () => {
      single = true;
      return finish();
    },
    maybeSingle: () => Promise.resolve({ data: null }),
    insert: (row: Row) => {
      inserted = { ...row };
      return chain;
    },
    update: (patch: Row) => {
      const matched = apply();
      for (const r of matched) Object.assign(r, patch);
      return chain;
    },
  };

  async function finish() {
    if (inserted) {
      const row: Row = {
        ...inserted,
        id: `${name}_${rows().length + 1}`,
        created_date: new Date().toISOString(),
      };
      rows().push(row);
      return { data: row, error: null };
    }
    const list = apply();
    return { data: single ? (list[0] ?? null) : list, error: null };
  }

  (chain as { then: unknown }).then = (
    resolve: (v: { data: unknown; error: null }) => void,
    reject: (e: unknown) => void,
  ) => finish().then(resolve).catch(reject);

  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "owner_1" } } }),
    },
    from: (t: string) => table(t),
    functions: {
      invoke: (fn: string, opts?: { body?: unknown }) =>
        state.invokeImpl
          ? state.invokeImpl(fn, opts)
          : Promise.reject(new Error("not configured")),
    },
    storage: {
      from: () => ({ upload: () => Promise.resolve({ error: null }) }),
    },
  },
}));

import {
  listConversations,
  searchConversations,
  createConversation,
  sendMessage,
} from "@/lib/archie/chat-client";

const conv = {
  id: "conv_1",
  title: "New conversation",
  archived: false,
  last_message_at: new Date().toISOString(),
  created_date: new Date().toISOString(),
};

beforeEach(() => {
  state.conversations = [];
  state.messages = [];
  state.invokeImpl = null;
});

describe("ArchieChat sendMessage", () => {
  it("persists the owner turn and ARCHIE's reply with native engine provenance", async () => {
    state.conversations.push({ ...conv });
    state.invokeImpl = async () => ({
      data: {
        reply: "Hello, Owner. ARCHIE online.",
        toolRuns: [],
        engine: { path: "archie-native", note: "own runtime" },
      },
      error: null,
    });

    const { ownerMessage, archieMessage } = await sendMessage(
      conv as never,
      "Check the platform status please",
      [],
      [],
    );

    expect(ownerMessage.role).toBe("owner");
    expect(ownerMessage.content).toBe("Check the platform status please");

    expect(archieMessage.role).toBe("archie");
    expect(archieMessage.content).toBe("Hello, Owner. ARCHIE online.");
    expect(archieMessage.engine).toBe("archie-native");
    expect(state.messages).toHaveLength(2);
  });

  it("labels external-adapter replies honestly, never as ARCHIE-native", async () => {
    state.conversations.push({ ...conv });
    state.invokeImpl = async () => ({
      data: {
        reply: "Here is the status.",
        toolRuns: [],
        engine: {
          path: "external-adapter",
          adapter: "gemini",
          note: "External development adapter. Not ARCHIE.",
        },
      },
      error: null,
    });

    const { archieMessage } = await sendMessage(
      conv as never,
      "status?",
      [],
      [],
    );
    expect(archieMessage.engine).toBe("external-adapter");
  });

  it("surfaces ARCHIE Core not-operational states instead of faking a reply", async () => {
    state.conversations.push({ ...conv });
    state.invokeImpl = async () => ({
      data: {
        error:
          "ARCHIE's own model runtime is an implementation boundary and is not operational yet.",
      },
      error: null,
    });

    await expect(sendMessage(conv as never, "hello", [], [])).rejects.toThrow(
      /implementation boundary/i,
    );
  });

  it("surfaces transport errors from the Core", async () => {
    state.conversations.push({ ...conv });
    state.invokeImpl = async () => ({
      data: null,
      error: new Error("Function failed"),
    });
    await expect(sendMessage(conv as never, "hello", [], [])).rejects.toThrow(
      "Function failed",
    );
  });
});

describe("ArchieChat conversations", () => {
  it("lists and searches conversations", async () => {
    state.conversations.push(
      { ...conv, id: "a", title: "Roofing discussion" },
      { ...conv, id: "b", title: "Paint specs" },
    );
    const all = await listConversations();
    expect(all).toHaveLength(2);
    const found = await searchConversations("roofing");
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("Roofing discussion");
  });

  it("creates conversations via the client", async () => {
    const created = await createConversation("Owner brief");
    expect(created.title).toBe("Owner brief");
  });
});
