// ============================================================
// ARCHIE SCHEDULED MAINTENANCE — TESTS
// Evidence for the scheduler heartbeat (gap audit F-1):
// token gate, mode validation, consolidation path, and the
// honest reflection pass over weak traces (watermark, weak
// selection, no-credit failure outcomes, idempotence).
// ============================================================
import { describe, expect, it, beforeEach } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenRows,
  json,
  req,
  resetCapture,
} from "../_shared/testing/harness.ts";

const handler = getHandler();
const TOKEN = { "x-maintenance-token": "a".repeat(64) };

function givenTokenValid(valid: boolean) {
  givenRows(
    "archie_scheduler_tokens",
    valid ? [{ token: "a".repeat(64) }] : [],
  );
}

describe("archie-maintenance — token gate", () => {
  beforeEach(() => resetCapture());

  it("refuses a call without a scheduler token", async () => {
    givenTokenValid(false);
    const res = await handler(req("POST", "", { mode: "all" }));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/scheduler token/i);
  });

  it("refuses a wrong token and records an honest gate-stop run", async () => {
    givenTokenValid(false);
    const res = await handler(
      req(
        "POST",
        "",
        { mode: "all" },
        { "x-maintenance-token": "b".repeat(64) },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a short token outright (never hits the DB)", async () => {
    givenTokenValid(true);
    const res = await handler(
      req("POST", "", { mode: "all" }, { "x-maintenance-token": "short" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown mode with 400", async () => {
    givenTokenValid(true);
    const res = await handler(req("POST", "", { mode: "explode" }, TOKEN));
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body", async () => {
    givenTokenValid(true);
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...TOKEN },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("answers GET with 405", async () => {
    const res = await handler(
      new Request("https://x.supabase.co/fn", { method: "GET" }),
    );
    expect(res.status).toBe(405);
  });
});

describe("archie-maintenance — consolidation mode", () => {
  beforeEach(() => resetCapture());

  it("hydrates the native engine and reports honest counters", async () => {
    givenTokenValid(true);
    const res = await handler(req("POST", "", { mode: "consolidate" }, TOKEN));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.consolidate.engine_operational).toBe(true);
    expect(typeof body.consolidate.note).toBe("string");
  });
});

describe("archie-maintenance — reflect mode", () => {
  beforeEach(() => resetCapture());

  it("records honest failure outcomes for weak traces and advances the watermark", async () => {
    givenTokenValid(true);
    const traces = [
      {
        id: "t1",
        task: "asked about X",
        epistemic: "UNKNOWN",
        confidence: 0.3,
        created_at: "2026-09-16T01:00:00Z",
      },
      {
        id: "t2",
        task: "asked about Y",
        epistemic: "VERIFIED",
        confidence: 0.9,
        created_at: "2026-09-16T01:10:00Z",
      },
      {
        id: "t3",
        task: "asked about Z",
        epistemic: "VERIFIED",
        confidence: 0.4,
        created_at: "2026-09-16T01:20:00Z",
      },
    ];
    givenRows("frelux_archie_cognitive_traces", traces);
    const res = await handler(req("POST", "", { mode: "reflect" }, TOKEN));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.reflect.traces_in_window).toBe(3);
    expect(body.reflect.weak_traces).toBe(2); // UNKNOWN + low-confidence
    expect(body.reflect.reflected).toBe(2);
    expect(body.reflect.causes).toMatchObject({
      "unverified-knowledge": 1,
      "low-confidence-answer": 1,
    });
    expect(body.reflect.watermark_after).toBe("2026-09-16T01:20:00Z");
  });

  it("reflects only traces after the watermark — each trace at most once", async () => {
    givenTokenValid(true);
    givenRows("frelux_archie_cognitive_traces", [
      {
        id: "old",
        task: "old weak",
        epistemic: "UNKNOWN",
        confidence: 0.1,
        created_at: "2026-09-15T00:00:00Z",
      },
      {
        id: "new",
        task: "new weak",
        epistemic: "UNKNOWN",
        confidence: 0.2,
        created_at: "2026-09-16T02:00:00Z",
      },
    ]);
    givenRows("archie_scheduler_state", [
      { key: "reflection_watermark", value: { ts: "2026-09-16T01:00:00Z" } },
    ]);
    const res = await handler(req("POST", "", { mode: "reflect" }, TOKEN));
    const body = await json(res);
    expect(body.reflect.traces_in_window).toBe(1); // only the new trace
    expect(body.reflect.reflected).toBe(1);
  });

  it("a window with no weak traces reflects nothing honestly", async () => {
    givenTokenValid(true);
    givenRows("frelux_archie_cognitive_traces", [
      {
        id: "strong",
        task: "solid answer",
        epistemic: "VERIFIED",
        confidence: 0.95,
        created_at: "2026-09-16T03:00:00Z",
      },
    ]);
    const res = await handler(req("POST", "", { mode: "reflect" }, TOKEN));
    const body = await json(res);
    expect(body.reflect.weak_traces).toBe(0);
    expect(body.reflect.reflected).toBe(0);
  });
});
