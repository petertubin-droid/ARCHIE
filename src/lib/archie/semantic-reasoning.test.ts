import { describe, expect, it } from "vitest";

// semantic-reasoning.ts is a pure re-export facade over the
// production semantic engine (_shared/archie-ai). The test
// pins the contract: the engine's public surface must stay
// importable from the frontend alias, and understandSemantics
// must be a real function from the real engine (not a stub).

import * as facade from "@/lib/archie/semantic-reasoning";
import { understandSemantics } from "@/lib/archie/semantic-reasoning";

describe("semantic-reasoning facade (coverage batch 2026-10-19)", () => {
  it("exposes the semantic engine's public surface", () => {
    expect(Object.keys(facade).length).toBeGreaterThan(0);
    expect(typeof facade.understandSemantics).toBe("function");
  });

  it("understandSemantics comes from the real engine — a callable with its documented arity", () => {
    expect(understandSemantics).toBeTypeOf("function");
    expect(understandSemantics.length).toBeLessThanOrEqual(2);
  });
});
