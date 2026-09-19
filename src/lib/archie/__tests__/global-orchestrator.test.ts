// =========================================================
// GLOBAL-ORCHESTRATOR TESTS (batch 25, fix 105)
// Capabilities are free; consequential actions demand recorded
// owner authority; unknown domains become discovery candidates
// instead of refusals to learn; identity stays stated.
// =========================================================

import { describe, expect, it } from "vitest";
import { AuthorizationRegistry } from "@/lib/archie/capability-authority";
import {
  ARCHIE_IDENTITY,
  INSPECTABLE_LAYERS,
  isOperationallyGated,
  isStudyableDomain,
  route,
} from "@/lib/archie/global-orchestrator";

const NOW = Date.now();

describe("route — capabilities are free, consequences are gated", () => {
  it("routes global knowledge and market research without authority", () => {
    expect(
      route(
        { world: "GLOBAL_KNOWLEDGE", action: "learn" },
        new AuthorizationRegistry(),
      ),
    ).toMatchObject({
      ok: true,
      route: "knowledge-pipeline",
      authorityBasis: "CAPABILITY_FREE",
    });
    expect(
      route(
        { world: "MARKET_RESEARCH", action: "study prices" },
        new AuthorizationRegistry(),
      ),
    ).toMatchObject({
      route: "global-markets",
    });
  });

  it("routes computation to the deterministic engine", () => {
    expect(
      route(
        { world: "COMPUTATION", action: "compute" },
        new AuthorizationRegistry(),
      ),
    ).toMatchObject({
      route: "computation-engine",
      authorityBasis: "CAPABILITY_FREE",
    });
  });

  it("gates consequential FRELUX actions on recorded owner authority", () => {
    const reg = new AuthorizationRegistry();
    const denied = route(
      {
        world: "FRELUX_ENVIRONMENT",
        action: "apply a production change",
        authorityRequired: "deploy_production" as never,
        scope: "main",
      },
      reg,
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.needsOwner).toBe(true);
    }
    reg.grant({
      id: "auth1",
      authority: "deploy_production" as never,
      scope: "main",
      granted_by: "OWNER",
      granted_at: NOW - 1000,
      expires_at: NOW + 60_000,
      evidence: "owner session",
    });
    const allowed = route(
      {
        world: "FRELUX_ENVIRONMENT",
        action: "apply a production change",
        authorityRequired: "deploy_production" as never,
        scope: "main",
      },
      reg,
    );
    expect(allowed).toMatchObject({
      ok: true,
      authorityBasis: "OWNER_AUTHORIZED",
    });
  });

  it("lets non-consequential FRELUX requests through free", () => {
    expect(
      route(
        { world: "FRELUX_ENVIRONMENT", action: "read project data" },
        new AuthorizationRegistry(),
      ),
    ).toMatchObject({ ok: true, authorityBasis: "CAPABILITY_FREE" });
  });

  it("refuses website inspection of non-public targets", () => {
    const r = route(
      {
        world: "WEBSITE_INSPECTION",
        action: "inspect",
        scope: "http://localhost:3000",
      },
      new AuthorizationRegistry(),
    );
    expect(r.ok).toBe(false);
    const ok = route(
      {
        world: "WEBSITE_INSPECTION",
        action: "inspect",
        scope: "https://freluxtools.netlify.app",
      },
      new AuthorizationRegistry(),
    );
    expect(ok).toMatchObject({ ok: true, authorityBasis: "CAPABILITY_FREE" });
  });

  it("hard-refuses forbidden security operations and gates real-system work", () => {
    const forbidden = route(
      {
        world: "SECURITY_WORK",
        action: "bypass the authentication on this account",
      },
      new AuthorizationRegistry(),
    );
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.needsOwner).toBe(false); // hard-refused never needs an owner decision

    const real = route(
      {
        world: "SECURITY_WORK",
        action: "run the authorized vulnerability assessment",
        authorityRequired: "run_authorized_security_test" as never,
        scope: "uncovered-target.example",
      },
      new AuthorizationRegistry(),
    );
    expect(real.ok).toBe(false);
    if (!real.ok) expect(real.needsOwner).toBe(true);
  });

  it("treats unknown domains as discovery candidates, never refusals to learn", () => {
    const r = route(
      {
        world: "GLOBAL_KNOWLEDGE",
        domains: ["some_unregistered_domain_xyz"],
        action: "learn about it",
      },
      new AuthorizationRegistry(),
    );
    expect(r).toMatchObject({
      ok: true,
      route: "new-domain-discovery:some_unregistered_domain_xyz",
      authorityBasis: "CAPABILITY_FREE",
    });
  });
});

describe("domain vocabulary", () => {
  it("keeps registered domains studyable and security domains operationally gated", () => {
    expect(isStudyableDomain("construction")).toBe(true);
    expect(isOperationallyGated("cybersecurity")).toBe(true);
    expect(isStudyableDomain("cybersecurity")).toBe(true); // studyable even though operationally gated
    expect(isStudyableDomain("defensive_security")).toBe(true);
  });

  it("states the identity and inspectable layers honestly", () => {
    expect(ARCHIE_IDENTITY.is).toMatch(/general intelligence/i);
    expect(ARCHIE_IDENTITY.authority_boundary).toMatch(
      /Owner is the only authority/i,
    );
    expect(ARCHIE_IDENTITY.never).toContain("bypass owner authorization");
    expect(INSPECTABLE_LAYERS.length).toBeGreaterThan(0);
  });
});
