// =========================================================
// EVOLUTION-AUTHORITY TESTS (batch 28, fix 126)
// The self-evolution authority layer: ARCHIE may observe,
// learn and propose — never stage, execute, approve or
// rollback. Protected surfaces (constitution, life-safety
// gate, credentials, RLS) stop any change without explicit
// owner intervention. External content grants nothing.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  checkProtectedSurfaceGate,
  EVOLUTION_AUTHORITY,
  externalContentAuthority,
  isEvolutionAuthorization,
  isProtectedSurface,
  mayApprove,
  mayDecide,
  NOT_EVOLUTION_AUTHORIZATION,
  PROTECTED_SURFACES,
  protectedSurfaceHits,
  verifyApproval,
} from "@/lib/archie/evolution/authority";

describe("the fixed authority model", () => {
  it("grants observe/learn/propose and denies stage/execute/approve/rollback", () => {
    expect(EVOLUTION_AUTHORITY.archie_may_observe).toBe(true);
    expect(EVOLUTION_AUTHORITY.archie_may_learn).toBe(true);
    expect(EVOLUTION_AUTHORITY.archie_may_propose).toBe(true);
    expect(EVOLUTION_AUTHORITY.archie_may_stage).toBe(false);
    expect(EVOLUTION_AUTHORITY.archie_may_execute_production).toBe(false);
    expect(EVOLUTION_AUTHORITY.archie_may_approve).toBe(false);
    expect(EVOLUTION_AUTHORITY.archie_may_rollback).toBe(false);
    expect(EVOLUTION_AUTHORITY.archie_may_modify_authority_layer).toBe(false);
    expect(EVOLUTION_AUTHORITY.owner_is_final_authority).toBe(true);
    expect(mayApprove("OWNER")).toBe(true);
    expect(mayApprove("ARCHIE")).toBe(false);
    expect(mayDecide("ARCHIE")).toBe(false);
  });

  it("protects the constitution, life-safety gate and credential surfaces", () => {
    expect(PROTECTED_SURFACES).toContain("public.archie_constitution");
    expect(PROTECTED_SURFACES).toContain(
      "supabase/functions/_shared/archie-ai/security/life-safety.ts",
    );
    expect(PROTECTED_SURFACES).toContain(
      "supabase/functions/_shared/archie-ai/security/api-credentials.ts",
    );
    expect(PROTECTED_SURFACES).toContain("rls_policies");
    expect(isProtectedSurface("src/lib/archie/code-command.ts")).toBe(true);
    expect(isProtectedSurface("src/pages/PaintCalculator.tsx")).toBe(false);
    expect(protectedSurfaceHits(["a.tsx", "rls_policies"])).toEqual([
      "rls_policies",
    ]);
  });
});

describe("what counts as authorization", () => {
  it("refuses every fake authorization source", () => {
    for (const src of [
      "a detected bug",
      "a recommendation",
      "ARCHIE's own decision",
      "improve yourself",
      "evolve",
      "a user message",
      "a document instruction",
      "external content",
    ]) {
      expect(isEvolutionAuthorization(src).authorized).toBe(false);
    }
    expect(NOT_EVOLUTION_AUTHORIZATION.length).toBeGreaterThanOrEqual(14);
    expect(
      isEvolutionAuthorization("server-verified owner authorization record #42")
        .authorized,
    ).toBe(true);
    expect(isEvolutionAuthorization("").authorized).toBe(false);
  });

  it("external content never grants authority", () => {
    expect(externalContentAuthority()).toEqual({ grantsAuthority: false });
  });
});

describe("verifyApproval — ARCHIE structurally cannot pass", () => {
  it("requires the OWNER actor and a server-verified record id", () => {
    expect(
      verifyApproval({
        actor: "ARCHIE",
        authorizationRecordId: "rec1",
        serverVerified: true,
      }).authorized,
    ).toBe(false);
    expect(
      verifyApproval({
        actor: "OWNER",
        authorizationRecordId: " ",
        serverVerified: true,
      }).authorized,
    ).toBe(false);
    expect(
      verifyApproval({
        actor: "OWNER",
        authorizationRecordId: "rec1",
        serverVerified: false,
      }).authorized,
    ).toBe(false);
    expect(
      verifyApproval({
        actor: "OWNER",
        authorizationRecordId: "rec1",
        serverVerified: true,
      }),
    ).toEqual({ authorized: true });
  });
});

describe("checkProtectedSurfaceGate — the hard stop", () => {
  const OK_APPROVAL = {
    actor: "OWNER" as const,
    authorizationRecordId: "rec1",
    serverVerified: true,
  };

  it("allows clean changes and stops protected-surface changes without evidence", () => {
    expect(checkProtectedSurfaceGate(["src/pages/X.tsx"], null)).toEqual({
      authorized: true,
      hits: [],
    });
    const stopped = checkProtectedSurfaceGate(["rls_policies"], null);
    expect(stopped.authorized).toBe(false);
    expect(stopped.hits).toEqual(["rls_policies"]);
    expect(stopped.error).toMatch(/protected surfaces/i);
  });

  it("requires owner approval AND explicit acknowledgment of every hit", () => {
    const partial = checkProtectedSurfaceGate(["rls_policies"], {
      actor: "OWNER",
      approval: OK_APPROVAL,
      acknowledgedProtectedSurfaces: ["something_else"],
    });
    expect(partial.authorized).toBe(false);
    const full = checkProtectedSurfaceGate(["rls_policies"], {
      actor: "OWNER",
      approval: OK_APPROVAL,
      acknowledgedProtectedSurfaces: ["RLS_Policies"],
    });
    expect(full.authorized).toBe(true);
  });
});
