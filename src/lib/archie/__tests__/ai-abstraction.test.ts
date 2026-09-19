// =========================================================
// AI-ABSTRACTION TESTS (batch 26, fix 109)
// ARCHIE's identity is the Intelligence Core, never a
// provider; the own model is registered with the HONEST
// NOT_YET_AVAILABLE status (no fabricated graduation); the
// runtime registry is replaceable by design.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ARCHIE_OWN_MODEL_DESCRIPTOR,
  ARCHIE_RUNTIME_CORE,
  PROVIDER_INDEPENDENCE,
  RUNTIME_REGISTRY,
  runtimeIdentityLabel,
} from "@/lib/archie/ai-abstraction";

describe("the runtime registry", () => {
  it("registers ARCHIE's own model as the designed primary, honestly unavailable", () => {
    expect(ARCHIE_OWN_MODEL_DESCRIPTOR).toEqual({
      id: "ARCHIE_OWN_MODEL",
      kind: "ARCHIE_NATIVE",
      label: "ARCHIE own model — registered, not yet available",
      status: "NOT_YET_AVAILABLE",
    });
    expect(RUNTIME_REGISTRY).toContain(ARCHIE_OWN_MODEL_DESCRIPTOR);
  });

  it("names the core identity constant", () => {
    expect(ARCHIE_RUNTIME_CORE).toBe("ARCHIE_INTELLIGENCE_CORE");
  });
});

describe("runtimeIdentityLabel — never provider-branded", () => {
  it("labels the core plainly when no adapter is active", () => {
    expect(runtimeIdentityLabel("")).toBe("ARCHIE Intelligence Core");
  });

  it("discloses an active adapter as replaceable, never as the identity", () => {
    const label = runtimeIdentityLabel("some_adapter_v1");
    expect(label).toContain("external inference adapter active, replaceable");
    expect(label).not.toMatch(/gemini|openai|claude/i);
  });
});

describe("the provider-independence invariants (spec §39)", () => {
  it("keeps knowledge, learning, memory and tool routing provider-free", () => {
    const invariants = PROVIDER_INDEPENDENCE.map((p) => p.invariant);
    expect(invariants).toContain("Knowledge is provider-independent");
    expect(invariants).toContain("Learning is provider-independent");
    expect(invariants).toContain("Memory is provider-independent");
    expect(invariants).toContain("Tool routing is provider-independent");
    for (const inv of PROVIDER_INDEPENDENCE) {
      expect(inv.detail.trim().length).toBeGreaterThan(20);
    }
  });

  it("keeps external providers outside ARCHIE core entirely", () => {
    const noExternal = PROVIDER_INDEPENDENCE.find(
      (p) => p.invariant === "No external adapter exists inside ARCHIE",
    );
    expect(noExternal?.detail).toMatch(
      /Gemini exists only as a FRELUX application fallback/i,
    );
    expect(
      PROVIDER_INDEPENDENCE.find(
        (p) => p.invariant === "The model runtime is replaceable",
      ),
    ).toBeDefined();
  });
});
