import { describe, expect, it, vi } from "vitest";
import { readBoundedJsonRequest } from "./bounded-json.ts";

function requestFromStream(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}) {
  return new Request("https://archie.test/", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
}

describe("readBoundedJsonRequest", () => {
  it("parses a body exactly at the byte limit", async () => {
    const body = new TextEncoder().encode('{"ok":true}');
    await expect(readBoundedJsonRequest(new Request("https://archie.test/", {
      method: "POST", body, headers: { "content-length": String(body.byteLength) },
    }), body.byteLength)).resolves.toEqual({ ok: true, value: { ok: true } });
  });

  it("rejects declared over-limit bodies before reading", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const request = requestFromStream(body, { "content-length": "100" });
    await expect(readBoundedJsonRequest(request, 10)).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalled();
  });

  it("cancels an oversized streamed body even without a declared length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); },
      cancel,
    });
    await expect(readBoundedJsonRequest(requestFromStream(stream), 10)).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalled();
  });

  it("times out stalled request bodies and cancels their streams", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    await expect(readBoundedJsonRequest(requestFromStream(stream), 100, 5))
      .resolves.toEqual({ ok: false, reason: "timeout" });
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid UTF-8", async () => {
    await expect(readBoundedJsonRequest(new Request("https://archie.test/", { method: "POST", body: "{" }), 100))
      .resolves.toEqual({ ok: false, reason: "invalid_json" });
    await expect(readBoundedJsonRequest(new Request("https://archie.test/", { method: "POST", body: new Uint8Array([0xff]) }), 100))
      .resolves.toEqual({ ok: false, reason: "invalid_json" });
  });
});
