// ============================================================
// OWNER-GATED LOCAL GENERATIVE MODEL — TESTS
// Evidence for gap A-1: the gate, the honest absence paths,
// the labeled output, and the never-throw contract.
// ============================================================
import { describe, expect, it } from "vitest";
import {
  generatedLabel,
  localModelName,
  localModelUrl,
  ownerLocalGenerate,
} from "./generative.ts";

function okFetch(text: string): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ response: text }), { status: 200 }),
    );
}

describe("owner-gated local generative model (A-1)", () => {
  it("forbids generation without owner authorization", async () => {
    const out = await ownerLocalGenerate({
      prompt: "write a poem",
      ownerAuthorized: false,
      fetchFn: okFetch("should never be called") as never,
    });
    expect(out.status).toBe("forbidden");
    // family/visitor/agent traffic can never generate
  });

  it("reports honest absence when no endpoint is configured", async () => {
    const out = await ownerLocalGenerate({
      prompt: "write a poem",
      ownerAuthorized: true,
      fetchFn: okFetch("x") as never,
    });
    // ARCHIE_LOCAL_MODEL_URL is unset in the test environment
    if (!localModelUrl()) {
      expect(out.status).toBe("unavailable");
      expect(out.status === "unavailable" && out.reason).toContain(
        "ARCHIE_LOCAL_MODEL_URL",
      );
    } else {
      expect(["generated", "unavailable"]).toContain(out.status);
    }
  });

  it("generates with model + latency when the endpoint answers", async () => {
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    process.env.ARCHIE_LOCAL_MODEL_NAME = "test-model";
    try {
      const out = await ownerLocalGenerate({
        prompt: "write a poem",
        ownerAuthorized: true,
        fetchFn: okFetch("a real generated answer") as never,
      });
      expect(out.status).toBe("generated");
      if (out.status === "generated") {
        expect(out.text).toBe("a real generated answer");
        expect(out.model).toBe("test-model");
        expect(out.latencyMs).toBeGreaterThanOrEqual(0);
      }
    } finally {
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
      delete process.env.ARCHIE_LOCAL_MODEL_NAME;
    }
  });

  it("reports honest absence on HTTP error — never retries into a guess", async () => {
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    try {
      const out = await ownerLocalGenerate({
        prompt: "write a poem",
        ownerAuthorized: true,
        fetchFn: (() =>
          Promise.resolve(new Response("boom", { status: 500 }))) as never,
      });
      expect(out.status).toBe("unavailable");
      if (out.status === "unavailable") {
        expect(out.reason).toContain("HTTP 500");
      }
    } finally {
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
    }
  });

  it("reports honest absence on an empty model answer", async () => {
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    try {
      const out = await ownerLocalGenerate({
        prompt: "write a poem",
        ownerAuthorized: true,
        fetchFn: okFetch("   ") as never,
      });
      expect(out.status).toBe("unavailable");
      if (out.status === "unavailable") {
        expect(out.reason).toContain("empty");
      }
    } finally {
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
    }
  });

  it("reports honest absence on network failure — never throws", async () => {
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    try {
      const out = await ownerLocalGenerate({
        prompt: "write a poem",
        ownerAuthorized: true,
        fetchFn: (() =>
          Promise.reject(new Error("connection refused"))) as never,
      });
      expect(out.status).toBe("unavailable");
      if (out.status === "unavailable") {
        expect(out.reason).toContain("unreachable");
      }
    } finally {
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
    }
  });

  it("reports honest absence on timeout", async () => {
    process.env.ARCHIE_LOCAL_MODEL_URL = "https://local-model.test";
    try {
      const out = await ownerLocalGenerate({
        prompt: "write a poem",
        ownerAuthorized: true,
        timeoutMs: 20,
        fetchFn: ((_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          })) as never,
      });
      expect(out.status).toBe("unavailable");
      if (out.status === "unavailable") {
        expect(out.reason).toContain("did not answer");
      }
    } finally {
      delete process.env.ARCHIE_LOCAL_MODEL_URL;
    }
  });

  it("every generated label carries the GENERATED marker", () => {
    for (const seed of ["a", "b", "hello world", "xyzzy", "0", "plaque"]) {
      expect(generatedLabel(seed)).toMatch(/GENERATED/);
    }
  });
});
