// =========================================================
// CAPABILITY-AUTHORITY TESTS (batch 22, fix 74)
// Traces actual execution of the single decision point:
// capabilities are free; authority requires a live OWNER
// authorization; ARCHIE can never self-approve.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ALL_CAPABILITIES,
  AuthorizationRegistry,
  checkAuthority,
  FREE_CAPABILITIES,
  nextProductionStage,
  ownerGatesRequired,
  scopeMatches,
  type ArchieAuthority,
} from "@/lib/archie/capability-authority";

const NOW = Date.parse("2026-09-15T12:00:00Z");

function reg(
  ...records: Array<Partial<Parameters<AuthorizationRegistry["grant"]>[0]>>
) {
  const r = new AuthorizationRegistry();
  for (const rec of records) {
    r.grant({
      id: "auth_x",
      authority: "deploy_code" as ArchieAuthority,
      scope: "repo:frelux",
      granted_at: NOW - 1000,
      expires_at: NOW + 60_000,
      evidence: "owner session",
      ...rec,
    } as Parameters<AuthorizationRegistry["grant"]>[0]);
  }
  return r;
}

describe("AuthorizationRegistry", () => {
  it("refuses grants with expiry before/at grant time or empty scope", () => {
    const r = new AuthorizationRegistry();
    expect(() =>
      r.grant({
        id: "b",
        authority: "spend_money",
        scope: "x",
        granted_at: NOW,
        expires_at: NOW,
        evidence: "",
      }),
    ).toThrow(/expiry must be after grant time/i);
    expect(() =>
      r.grant({
        id: "b",
        authority: "spend_money",
        scope: "  ",
        granted_at: NOW,
        expires_at: NOW + 1,
        evidence: "",
      }),
    ).toThrow(/must name its scope/i);
  });

  it("revokes by id", () => {
    const r = reg({ id: "auth_x" });
    expect(r.revoke("auth_x")).toBe(true);
    expect(
      checkAuthority(
        { authority: "deploy_code", scope: "repo:frelux" },
        r,
        NOW,
      ),
    ).toMatchObject({ allowed: false });
  });
});

describe("scopeMatches", () => {
  it("matches exactly and by prefix wildcard only", () => {
    expect(scopeMatches("repo:frelux", "repo:frelux")).toBe(true);
    expect(scopeMatches("repo:*", "repo:frelux")).toBe(true);
    expect(scopeMatches("repo:frelux", "repo:frelux/other")).toBe(false);
    expect(scopeMatches("repo:frelux", "repo:*")).toBe(false);
  });
});

describe("checkAuthority — the single decision point", () => {
  it("allows any capability freely (thinking is free)", () => {
    for (const cap of ALL_CAPABILITIES) {
      const d = checkAuthority({ capability: cap }, reg(), NOW);
      expect(d.allowed).toBe(true);
      if (d.allowed) expect(d.basis).toBe("CAPABILITY_FREE");
    }
  });

  it("refuses authority actions with no matching live record", () => {
    const d = checkAuthority(
      { authority: "spend_money", scope: "frelux-ads" },
      reg({ id: "other", authority: "deploy_code" }),
      NOW,
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.required).toBe("spend_money");
      expect(d.reason).toMatch(/Owner authorization required/i);
    }
  });

  it("allows when a live OWNER record covers the scope, and reports the id", () => {
    const d = checkAuthority(
      { authority: "deploy_code", scope: "repo:frelux" },
      reg({ id: "auth_9", scope: "repo:*" }),
      NOW,
    );
    expect(d).toMatchObject({
      allowed: true,
      basis: "OWNER_AUTHORIZED",
      authorizationId: "auth_9",
    });
  });

  it("refuses expired authorizations — expiry is enforced at decision time", () => {
    const d = checkAuthority(
      { authority: "deploy_code", scope: "repo:frelux" },
      reg({ expires_at: NOW - 1 }),
      NOW,
    );
    expect(d.allowed).toBe(false);
  });

  it("refuses actions naming neither capability nor authority", () => {
    const d = checkAuthority({}, reg(), NOW);
    expect(d.allowed).toBe(false);
  });
});

describe("production-change pipeline — ARCHIE can never self-approve", () => {
  it("refuses ARCHIE at both owner gates and allows the owner", () => {
    const archie1 = nextProductionStage("PROPOSED", "ARCHIE");
    expect(archie1).toMatchObject({ ok: false });
    expect((archie1 as { error: string }).error).toMatch(
      /OWNER_APPROVED_1 is an OWNER gate/i,
    );
    const archie2 = nextProductionStage("TESTED", "ARCHIE");
    expect(archie2).toMatchObject({ ok: false });
    expect(nextProductionStage("PROPOSED", "OWNER")).toEqual({
      ok: true,
      to: "OWNER_APPROVED_1",
    });
    expect(nextProductionStage("TESTED", "OWNER")).toEqual({
      ok: true,
      to: "OWNER_APPROVED_2",
    });
  });

  it("has no next stage from DEPLOYED and requires exactly two owner gates", () => {
    expect(nextProductionStage("DEPLOYED", "OWNER")).toMatchObject({
      ok: false,
    });
    expect(ownerGatesRequired()).toEqual([
      "OWNER_APPROVED_1",
      "OWNER_APPROVED_2",
    ]);
  });
});

describe("FREE_CAPABILITIES invariant", () => {
  it("every capability is free (authority lives only in AuthorizationRecords)", () => {
    expect(FREE_CAPABILITIES.length).toBe(ALL_CAPABILITIES.length);
  });
});
