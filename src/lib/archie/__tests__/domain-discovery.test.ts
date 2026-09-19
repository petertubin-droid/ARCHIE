// =========================================================
// DOMAIN-DISCOVERY TESTS (batch 26, fix 106)
// Open-ended domain registration through a fixed lifecycle:
// ARCHIE runs DISCOVER→VERSIONED, only an ADMIN registers;
// protected keys and duplicate keys are refused; the
// architecture core can never be displaced.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  canDiscoveryTransition,
  DISCOVERY_TRANSITIONS,
  DomainDiscoveryPipeline,
  runDiscoveryToReview,
  validateRegistrationRequest,
} from "@/lib/archie/domain-discovery";
import { archieDomains } from "@/lib/archie/domains";
import type { DomainRegistrationRequest } from "@/lib/archie/phase9-types";

function req(key = "test_domain_discovery_sample"): DomainRegistrationRequest {
  return {
    proposed_key: key,
    label: "Test Domain",
    description: "A domain for tests",
    rationale: "coverage of the discovery lifecycle",
    knowledge_sources: ["public docs"],
    learning_rules: ["evidence-based only"],
    verification_requirements: ["two independent sources"],
    regional_scope: ["NG"],
    language_scope: ["en"],
    risk_class: "STANDARD",
    permissions: [],
    provenance: {
      discovered_by: "ARCHIE",
      discovered_at: "2026-09-15T00:00:00Z",
    },
  };
}

describe("validateRegistrationRequest", () => {
  it("requires snake_case keys that do not collide or hit protected domains", () => {
    expect(validateRegistrationRequest(req("Bad-Key")).ok).toBe(false);
    expect(validateRegistrationRequest(req("architecture")).ok).toBe(false);
    expect(validateRegistrationRequest(req("construction")).ok).toBe(false);
    expect(validateRegistrationRequest(req("safety")).ok).toBe(false);
    expect(validateRegistrationRequest(req()).ok).toBe(true);
  });

  it("requires label, rationale, sources, verification requirements, provenance", () => {
    expect(validateRegistrationRequest({ ...req(), label: "" }).ok).toBe(false);
    expect(validateRegistrationRequest({ ...req(), rationale: " " }).ok).toBe(
      false,
    );
    expect(
      validateRegistrationRequest({ ...req(), knowledge_sources: [] }).ok,
    ).toBe(false);
    expect(
      validateRegistrationRequest({ ...req(), verification_requirements: [] })
        .ok,
    ).toBe(false);
    expect(
      validateRegistrationRequest({
        ...req(),
        provenance: { discovered_by: "", discovered_at: "x" },
      }).ok,
    ).toBe(false);
  });
});

describe("the lifecycle state machine", () => {
  it("advances one step at a time and allows REJECTED from any live state", () => {
    expect(canDiscoveryTransition("DISCOVERED", "CLASSIFIED")).toBe(true);
    expect(canDiscoveryTransition("DISCOVERED", "REGISTERED")).toBe(false);
    expect(canDiscoveryTransition("VERSIONED", "REGISTERED")).toBe(true);
    expect(canDiscoveryTransition("REGISTERED", "CLASSIFIED")).toBe(false);
    expect(canDiscoveryTransition("CLASSIFIED", "REJECTED")).toBe(true);
    expect(DISCOVERY_TRANSITIONS.REGISTERED).toEqual([]);
  });
});

describe("DomainDiscoveryPipeline", () => {
  it("refuses duplicate in-flight discoveries and unknown keys", () => {
    const p = new DomainDiscoveryPipeline();
    p.discover(req());
    expect(() => p.discover(req())).toThrow(/already in flight/i);
    expect(() => p.advance("nope", "CLASSIFIED")).toThrow(
      /No in-flight discovery/i,
    );
  });

  it("runs ARCHIE's side up to VERSIONED and stops for admin review", () => {
    const p = new DomainDiscoveryPipeline();
    const rec = runDiscoveryToReview(p, req());
    expect(rec.state).toBe("VERSIONED");
    expect(rec.admin_approved).toBe(false);
    expect(archieDomains.exists("test_domain_discovery_sample")).toBe(false);
  });

  it("registers ONLY with explicit admin approval, into the governed registry", () => {
    const p = new DomainDiscoveryPipeline();
    runDiscoveryToReview(p, req("test_domain_admin_sample"));
    expect(() => p.advance("test_domain_admin_sample", "REGISTERED")).toThrow(
      /requires explicit admin approval/i,
    );
    const rec = p.advance("test_domain_admin_sample", "REGISTERED", {
      by_admin: true,
      note: "admin approved",
    });
    expect(rec.admin_approved).toBe(true);
    const registered = archieDomains.get("test_domain_admin_sample");
    expect(registered).toBeDefined();
    expect(registered!.is_core).toBe(false); // architecture stays the only core
    expect(registered!.active).toBe(true);
  });
});
