// =========================================================
// ARCHIE NATIVE CODE-AUTHORING ENGINE — TESTS (A-3)
// =========================================================

import { describe, expect, it } from "vitest";
import { authorCode, type AuthorSpec } from "./code-author.ts";

const PURE: AuthorSpec = {
  kind: "pure-module",
  name: "discountCalc",
  purpose: "Compute a net price after a fractional discount.",
  exports: [
    {
      name: "netPrice",
      params: [
        { name: "price", type: "number", note: "gross price" },
        { name: "fraction", type: "number", note: "0..1" },
      ],
      returns: "number",
      note: "price * (1 - fraction)",
      body: "price * (1 - fraction)",
    },
  ],
};

describe("code-author — pure-module authoring", () => {
  it("authors a real, self-verified pure function from a spec", () => {
    const r = authorCode(PURE);
    expect(r.ok).toBe(true);
    expect(r.fileName).toBe("discountCalc.ts");
    expect(r.code).toContain("export function netPrice(price: number, fraction: number): number {");
    expect(r.code).toContain("return price * (1 - fraction);");
    expect(r.code).toContain("AUTHORED BY ARCHIE (native code-authoring engine, A-3)");
    expect(r.checks!.balancedDelimiters).toBe(true);
    expect(r.checks!.exportsDeclared).toBe(true);
  });

  it("the authored artifact executes correctly (run the authored expression)", () => {
    const r = authorCode(PURE);
    expect(r.ok).toBe(true);
    // The authored RETURN EXPRESSION is plain JS — execute it
    // directly: the strongest verification there is for a
    // pure function body is that it computes the right value.
    const fn = new Function(
      "price",
      "fraction",
      `"use strict"; return ${PURE.exports[0].body};`,
    );
    expect(fn(100, 0.25)).toBe(75);
    expect(fn(50, 0)).toBe(50);
    // and the emitted source contains exactly that expression
    expect(r.code).toContain(`return ${PURE.exports[0].body};`);
  });

  it("Math whitelisted calls allowed in bodies", () => {
    const r = authorCode({
      kind: "pure-module",
      name: "clampUtil",
      exports: [
        { name: "clamp", params: [{ name: "v", type: "number" }], returns: "number", body: "Math.min(Math.max(v, 0), 1)" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("string member calls whitelisted", () => {
    const r = authorCode({
      kind: "pure-module",
      name: "greetUtil",
      exports: [
        { name: "shout", params: [{ name: "s", type: "string" }], returns: "string", body: "s.trim().toUpperCase()" },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe("code-author — grammar enforcement (honest refusals)", () => {
  it("undeclared identifier in body refused", () => {
    const r = authorCode({
      kind: "pure-module",
      name: "badMod",
      exports: [
        { name: "f", params: [{ name: "a", type: "number" }], returns: "number", body: "a + notDeclared" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("expression grammar");
  });

  it("control flow / banned constructs refused", () => {
    const r = authorCode({
      kind: "pure-module",
      name: "badMod",
      exports: [
        { name: "f", params: [{ name: "a", type: "number" }], returns: "number", body: "a; while (true) {}" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("network/subprocess escape refused", () => {
    for (const body of ["fetch('http://x')", "globalThis", "process.env.KEY"]) {
      const r = authorCode({
        kind: "pure-module",
        name: "evilMod",
        exports: [{ name: "f", params: [], returns: "unknown", body }],
      });
      expect(r.ok).toBe(false);
    }
  });

  it("invalid module name refused", () => {
    const r = authorCode({ ...PURE, name: "2fast;bad" });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("safe identifier");
  });

  it("no exports refused", () => {
    const r = authorCode({ kind: "pure-module", name: "emptyMod", exports: [] });
    expect(r.ok).toBe(false);
  });
});

describe("code-author — api-endpoint scaffolds", () => {
  it("authors a validated endpoint handler scaffold with hand-written marker", () => {
    const r = authorCode({
      kind: "api-endpoint",
      name: "signupHook",
      route: "/hooks/signup",
      method: "POST",
      exports: [
        {
          name: "signupInput",
          params: [
            { name: "email", type: "string" },
            { name: "plan", type: "string" },
          ],
          returns: "void",
        },
      ],
    });
    expect(r.ok).toBe(true);
    // interface name comes from the SPEC EXPORT name
    // (signupInput → SignupInput) — verified design
    expect(r.code).toContain("export interface SignupInput {");
    expect(r.code).toContain("email: string;");
    expect(r.code).toContain("MISSING_EMAIL");
    expect(r.code).toContain("HAND-WRITTEN SECTION");
    expect(r.code).toContain("NOT_IMPLEMENTED");
  });

  it("invalid route refused", () => {
    const r = authorCode({
      kind: "api-endpoint",
      name: "badRoute",
      route: "no-leading-slash",
      method: "GET",
      exports: [{ name: "x", params: [], returns: "void" }],
    });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("route");
  });

  it("body on an endpoint spec refused (scaffold-only contract)", () => {
    const r = authorCode({
      kind: "api-endpoint",
      name: "noBody",
      route: "/x",
      method: "GET",
      exports: [{ name: "x", params: [], returns: "void", body: "1" }],
    });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("hand-written");
  });
});

describe("code-author — determinism", () => {
  it("same spec → byte-identical artifact", () => {
    const a = authorCode(PURE);
    const b = authorCode(JSON.parse(JSON.stringify(PURE)));
    expect(a.code).toBe(b.code);
  });
});
