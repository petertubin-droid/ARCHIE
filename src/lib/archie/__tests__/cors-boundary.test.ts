import { describe, it, expect, afterEach } from "vitest";
import {
  allowedOrigins,
  resolveCorsHeaders,
  PRODUCTION_ORIGINS,
  DEV_ORIGINS,
} from "@studio-shared/cors.ts";
import { serveWithCors } from "@studio-shared/serve.ts";

// DOM environments strip the Origin header (a forbidden header
// name) from Request constructors — stub the request instead
// so the CORS logic is tested directly.
function req(origin?: string): Request {
  return {
    method: "GET",
    headers: {
      get: (k: string) => (k === "origin" && origin ? origin : null),
    },
  } as unknown as Request;
}

const realDeno = (globalThis as { Deno?: unknown }).Deno;
afterEach(() => {
  (globalThis as { Deno?: unknown }).Deno = realDeno;
});

// In vitest there is no Deno runtime: allowedOrigins() falls
// back to the default allowlist, which is exactly what these
// tests assert. The env-driven paths are covered by mocking
// globalThis.Deno below.

describe("CORS allowlist (audit M-5)", () => {
  it("defaults to production + dev origins, never a wildcard", () => {
    const origins = allowedOrigins();
    expect(origins).toContain(PRODUCTION_ORIGINS[0]);
    for (const d of DEV_ORIGINS) expect(origins).toContain(d);
    expect(origins).not.toContain("*");
  });

  it("echoes an allowed origin exactly, with Vary", () => {
    const h = resolveCorsHeaders(req("https://freluxtools.netlify.app"));
    expect(h["Access-Control-Allow-Origin"]).toBe(
      "https://freluxtools.netlify.app",
    );
    expect(h["Vary"]).toContain("Origin");
  });

  it("gives an unlisted origin NO read access (no ACAO)", () => {
    const h = resolveCorsHeaders(req("https://evil.example"));
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Vary"]).toContain("Origin");
  });

  it("omits ACAO for server-to-server requests (no Origin header)", () => {
    const h = resolveCorsHeaders(req());
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    // CORS only governs cross-origin browser reads — non-browser
    // callers are unaffected by design.
    expect(h["Access-Control-Allow-Methods"]).toBeDefined();
  });

  it("echoes every configured dev origin", () => {
    for (const d of DEV_ORIGINS) {
      expect(resolveCorsHeaders(req(d))["Access-Control-Allow-Origin"]).toBe(d);
    }
  });

  it("restores the wildcard only via explicit ARCHIE_ALLOWED_ORIGINS=*", () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: {
        get: (k: string) => (k === "ARCHIE_ALLOWED_ORIGINS" ? "*" : undefined),
      },
    };
    const h = resolveCorsHeaders(req("https://anything.example"));
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("honors a custom deploy allowlist from ARCHIE_ALLOWED_ORIGINS", () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: {
        get: (k: string) =>
          k === "ARCHIE_ALLOWED_ORIGINS"
            ? "https://a.example, https://b.example"
            : undefined,
      },
    };
    expect(
      resolveCorsHeaders(req("https://a.example"))[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("https://a.example");
    expect(
      resolveCorsHeaders(req("https://b.example"))[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("https://b.example");
    expect(
      resolveCorsHeaders(req("https://freluxtools.netlify.app"))[
        "Access-Control-Allow-Origin"
      ],
    ).toBeUndefined();
  });
});

describe("serveWithCors boundary", () => {
  it("overrides a stale wildcard set inside the handler", async () => {
    let captured!: (r: Request) => Promise<Response>;
    serveWithCors(
      () =>
        Promise.resolve(
          new Response("hi", {
            headers: { "Access-Control-Allow-Origin": "*" },
          }),
        ),
      (h) => {
        captured = h as (r: Request) => Promise<Response>;
        return {} as unknown;
      },
    );
    const res = await captured(req("https://freluxtools.netlify.app"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://freluxtools.netlify.app",
    );
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  it("blocks an unlisted origin at the boundary", async () => {
    let captured!: (r: Request) => Promise<Response>;
    serveWithCors(
      () => Promise.resolve(new Response("hi")),
      (h) => {
        captured = h as (r: Request) => Promise<Response>;
        return {} as unknown;
      },
    );
    const res = await captured(req("https://evil.example"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("passes body, status and custom headers through untouched", async () => {
    let captured!: (r: Request) => Promise<Response>;
    serveWithCors(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 201,
            headers: { "X-Custom": "yes" },
          }),
        ),
      (h) => {
        captured = h as (r: Request) => Promise<Response>;
        return {} as unknown;
      },
    );
    const res = await captured(req());
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Custom")).toBe("yes");
    expect(await res.json()).toEqual({ ok: true });
  });
});
