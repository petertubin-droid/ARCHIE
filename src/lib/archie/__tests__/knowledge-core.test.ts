// =========================================================
// KNOWLEDGE-CORE TESTS (batch 22, fix 77)
// Explicit grants only; USER scope requires consent and
// never mixes with shared scopes; unknown apps/domains are
// refused with precise reasons.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  archieKnowledgeCore,
  FRELUX_SELF_GRANT,
  KnowledgeCore,
} from "@/lib/archie/knowledge-core";
import type {
  KnowledgeCoreGrant,
  KnowledgeCoreQuery,
} from "@/lib/archie/phase9-types";

function grant(over: Partial<KnowledgeCoreGrant> = {}): KnowledgeCoreGrant {
  return {
    application_id: "app2",
    application_label: "Second App",
    scopes: ["PROJECT"],
    domains: ["architecture"],
    user_scope_requires_consent: true,
    ...over,
  };
}

function query(over: Partial<KnowledgeCoreQuery> = {}): KnowledgeCoreQuery {
  return {
    application_id: "app2",
    scopes: ["PROJECT"],
    domains: ["architecture"],
    user_consent: false,
    ...over,
  } as KnowledgeCoreQuery;
}

describe("KnowledgeCore grant registry", () => {
  it("seeds FRELUX's own grant by default", () => {
    expect(archieKnowledgeCore.getGrant("frelux")).toEqual(FRELUX_SELF_GRANT);
  });

  it("refuses duplicate application registration", () => {
    const core = new KnowledgeCore();
    expect(() => core.registerApplication(grant())).not.toThrow();
    expect(() => core.registerApplication(grant())).toThrow(
      /already registered/i,
    );
  });

  it("refuses grants that do not require USER-scope consent", () => {
    const core = new KnowledgeCore();
    expect(() =>
      core.registerApplication(
        grant({ user_scope_requires_consent: false as never }),
      ),
    ).toThrow(/explicit consent/i);
  });
});

describe("authorizeQuery — grant validation", () => {
  it("refuses unknown applications", () => {
    const core = new KnowledgeCore([grant()]);
    expect(() =>
      core.authorizeQuery(query({ application_id: "ghost" })),
    ).toThrow(/Unknown application "ghost"/i);
  });

  it("refuses scopes not in the grant", () => {
    const core = new KnowledgeCore([grant()]);
    expect(() => core.authorizeQuery(query({ scopes: ["GLOBAL"] }))).toThrow(
      /not granted scope GLOBAL/i,
    );
  });

  it("refuses USER scope without explicit consent even when granted", () => {
    const core = new KnowledgeCore([grant({ scopes: ["USER", "PROJECT"] })]);
    expect(() => core.authorizeQuery(query({ scopes: ["USER"] }))).toThrow(
      /requires explicit end-user consent/i,
    );
    expect(() =>
      core.authorizeQuery(query({ scopes: ["USER"], user_consent: true })),
    ).not.toThrow();
  });

  it("refuses domains outside the grant", () => {
    const core = new KnowledgeCore([grant()]);
    expect(() =>
      core.authorizeQuery(query({ domains: ["climate_environment"] })),
    ).toThrow(/not granted domain "climate_environment"/i);
  });

  it("resolves empty grant domains to all registered domains (FRELUX self)", () => {
    const core = new KnowledgeCore();
    const r = core.requestKnowledge({
      application_id: "frelux",
      scopes: ["GLOBAL"],
      domains: [],
    } as KnowledgeCoreQuery);
    expect(r.domains.length).toBeGreaterThan(0);
  });
});

describe("assertNoPrivateLeak — USER isolation (§9, §18.11)", () => {
  it("refuses queries mixing USER scope with shared scopes", () => {
    const core = new KnowledgeCore([grant({ scopes: ["USER", "GLOBAL"] })]);
    expect(() =>
      core.requestKnowledge(query({ scopes: ["USER", "GLOBAL"] })),
    ).toThrow(/never mixes with shared-scope queries/i);
  });

  it("allows USER-scope queries issued alone (with consent)", () => {
    const core = new KnowledgeCore([grant({ scopes: ["USER"] })]);
    expect(() =>
      core.requestKnowledge(
        query({
          scopes: ["USER"],
          user_consent: true,
          domains: ["architecture"],
        }),
      ),
    ).not.toThrow();
  });
});
