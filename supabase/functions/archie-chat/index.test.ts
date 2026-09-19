// Unit tests for archie-chat (visitor + voice brain — same engine,
// same consent records as the owner chat).
// E2E-verified live 2026-09-15: visitor paint question → real
// deterministic estimate; owner path → full cognitive engine.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-chat — request validation", () => {
  it("rejects a non-JSON body with 400", async () => {
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/Invalid JSON/);
  });

  it("rejects an empty message with 400", async () => {
    const res = await handler(req("POST", "", { message: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/Message is required/);
  });
});

describe("archie-chat — visitor engine path", () => {
  it("answers a paint question through the real cognitive engine", async () => {
    const res = await handler(
      req("POST", "", {
        conversationId: "visitor-test",
        message: "What paint do I need for a 12 by 12 room?",
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.reply).toBe("string");
    expect(body.reply.length).toBeGreaterThan(0);
    // the engine self-reports its path — never a fake reply
    expect(body.engine?.path).toBeTruthy();
  });

  it("greets a simple hello (no math dead-end)", async () => {
    const res = await handler(
      req("POST", "", { conversationId: "visitor-greet", message: "hello" }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.reply.toLowerCase()).not.toMatch(/arithmetic expression/);
  });
});

describe("archie-chat — OPTIONS", () => {
  it("answers preflights at the CORS boundary", async () => {
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "OPTIONS",
        headers: {
          Origin: "https://freluxtools.netlify.app",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );
    expect(res.status).toBeLessThan(400);
  });
});

// ── Gap 3: SSE STREAMING (owner upgrade 2026-09-16) ────────
describe("archie-chat — SSE streaming (gap 3)", () => {
  /** Parse an SSE body into ordered [event, data] pairs. */
  function parseSSE(raw: string): Array<[string, Record<string, unknown>]> {
    const events: Array<[string, Record<string, unknown>]> = [];
    for (const block of raw.split("\n\n")) {
      const evLine = block.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (evLine && dataLine) {
        events.push([evLine.slice(7), JSON.parse(dataLine.slice(6))]);
      }
    }
    return events;
  }

  it("streams a visitor answer as start → deltas → done (stream flag)", async () => {
    const res = await handler(
      req("POST", "", {
        conversationId: "stream-visitor",
        message: "What paint do I need for a 12 by 12 room?",
        stream: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = parseSSE(await res.text());
    const names = events.map(([n]) => n);
    expect(names[0]).toBe("start");
    expect(names[names.length - 1]).toBe("done");
    // deltas carry the reply text, word-group chunked
    const deltas = events
      .filter(([n]) => n === "delta")
      .map(([, d]) => String((d as { text: string }).text));
    expect(deltas.length).toBeGreaterThan(0);
    const done = events.find(([n]) => n === "done")![1] as { reply: string };
    expect(deltas.join("")).toBe(done.reply);
  });

  it("streams the OWNER path with LIVE progress events from the kernel", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        {
          conversationId: "stream-owner",
          message: "what is screeding and what is mortar",
          stream: true,
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const events = parseSSE(await res.text());
    const names = events.map(([n]) => n);
    // live kernel phases arrived BEFORE the text deltas
    const firstProgress = names.indexOf("progress");
    const firstDelta = names.indexOf("delta");
    expect(firstProgress).toBeGreaterThan(-1);
    expect(firstDelta).toBeGreaterThan(firstProgress);
    // at least one executed phase + one reasoning step streamed
    const progress = events
      .filter(([n]) => n === "progress")
      .map(([, d]) => d as Record<string, unknown>);
    expect(progress.some((e) => e.type === "phase")).toBe(true);
    expect(progress.some((e) => e.type === "step")).toBe(true);
    // done payload matches the classic JSON shape
    const done = events.find(([n]) => n === "done")![1] as {
      reply: string;
      cognitiveTrace?: unknown[];
    };
    expect(typeof done.reply).toBe("string");
    expect(Array.isArray(done.cognitiveTrace)).toBe(true);
  });

  it("Accept: text/event-stream also selects streaming", async () => {
    const res = await handler(
      req(
        "POST",
        "",
        { conversationId: "stream-accept", message: "hello" },
        { Accept: "text/event-stream" },
      ),
    );
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = parseSSE(await res.text());
    expect(events[0][0]).toBe("start");
  });

  it("non-streaming requests are unchanged (no SSE without opt-in)", async () => {
    const res = await handler(
      req("POST", "", {
        conversationId: "stream-classic",
        message: "hello",
      }),
    );
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("streaming an invalid request finishes honestly (400 as done event)", async () => {
    const res = await handler(req("POST", "", { message: "", stream: true }));
    expect(res.status).toBe(200); // the stream itself opens fine
    const events = parseSSE(await res.text());
    const done = events.find(([n]) => n === "done")![1] as { error: string };
    expect(done.error).toMatch(/Message is required/);
  });
});
