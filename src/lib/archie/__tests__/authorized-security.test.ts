// =========================================================
// AUTHORIZED-SECURITY TESTS (batch 24, fix 91)
// Forbidden patterns are absolute even with claimed
// authorization; study is free; real-system execution needs
// BOTH test + access authority on the exact target.
// =========================================================

import { describe, expect, it } from "vitest";
import { AuthorizationRegistry } from "@/lib/archie/capability-authority";
import {
  AUTHORIZED_PENTEST_PHASES,
  evaluateSecurityWork,
  FINDING_TO_DEFENSE,
  type SecurityWorkRequest,
} from "@/lib/archie/authorized-security";

const NOW = Date.parse("2026-09-15T12:00:00Z");

function registry(
  ...grants: Array<{
    authority: "run_authorized_security_test" | "access_authorized_target";
    scope: string;
  }>
) {
  const r = new AuthorizationRegistry();
  for (const g of grants) {
    r.grant({
      id: `auth_${g.authority}_${g.scope}`,
      authority: g.authority,
      scope: g.scope,
      granted_by: "OWNER",
      granted_at: NOW - 1000,
      expires_at: NOW + 60_000,
      evidence: "owner session",
    });
  }
  return r;
}

describe("evaluateSecurityWork", () => {
  it("hard-refuses forbidden operations regardless of claimed authorization", () => {
    const r = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION" as never,
        context: "EXECUTION" as never,
        target: { identifier: "frelux.example", environment: "REAL_SYSTEM" },
        operation: "bypass the RLS on this table",
      } as SecurityWorkRequest,
      registry({
        authority: "run_authorized_security_test",
        scope: "frelux.example",
      }),
      NOW,
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.hardRefused).toBe(true);
      expect(r.reason).toMatch(/Hard-refused/i);
    }
  });

  it("allows study unconditionally — learning security is free", () => {
    const r = evaluateSecurityWork(
      {
        kind: "PENTEST_METHODOLOGY_STUDY" as never,
        context: "STUDY" as never,
        operation: "study pentest methodology",
      } as SecurityWorkRequest,
      registry(),
      NOW,
    );
    expect(r).toMatchObject({ allowed: true, basis: "STUDY" });
  });

  it("requires a named target for execution work", () => {
    const r = evaluateSecurityWork(
      {
        kind: "AUTHORIZED_PENTEST_EXECUTION" as never,
        context: "EXECUTION" as never,
        operation: "scan the authorized app",
      } as SecurityWorkRequest,
      registry(),
      NOW,
    );
    expect(r.allowed).toBe(false);
  });

  it("allows controlled labs only with a live test authorization", () => {
    const req = {
      kind: "AUTHORIZED_PENTEST_EXECUTION",
      context: "EXECUTION",
      target: { identifier: "lab-1", environment: "CONTROLLED_LAB" },
      operation: "probe the lab",
    } as unknown as SecurityWorkRequest;
    expect(evaluateSecurityWork(req, registry(), NOW).allowed).toBe(false);
    const ok = evaluateSecurityWork(
      req,
      registry({
        authority: "run_authorized_security_test",
        scope: "CONTROLLED_LAB",
      }),
      NOW,
    );
    expect(ok).toMatchObject({ allowed: true, basis: "CONTROLLED_LAB" });
  });

  it("requires BOTH test and access authority for real systems", () => {
    const req = {
      kind: "AUTHORIZED_PENTEST_EXECUTION",
      context: "EXECUTION",
      target: { identifier: "frelux.example", environment: "REAL_SYSTEM" },
      operation: "run the authorized vulnerability assessment",
    } as unknown as SecurityWorkRequest;
    const oneOnly = evaluateSecurityWork(
      req,
      registry({
        authority: "run_authorized_security_test",
        scope: "frelux.example",
      }),
      NOW,
    );
    expect(oneOnly.allowed).toBe(false);
    const both = evaluateSecurityWork(
      req,
      registry(
        { authority: "run_authorized_security_test", scope: "frelux.example" },
        { authority: "access_authorized_target", scope: "frelux.example" },
      ),
      NOW,
    );
    expect(both).toMatchObject({ allowed: true, basis: "OWNER_AUTHORIZED" });
  });

  it("refuses real-system testing outside the authorized scope", () => {
    const req = {
      kind: "AUTHORIZED_PENTEST_EXECUTION",
      context: "EXECUTION",
      target: { identifier: "other-site.example", environment: "REAL_SYSTEM" },
      operation: "run the authorized vulnerability assessment",
    } as unknown as SecurityWorkRequest;
    const r = evaluateSecurityWork(
      req,
      registry(
        { authority: "run_authorized_security_test", scope: "frelux.example" },
        { authority: "access_authorized_target", scope: "frelux.example" },
      ),
      NOW,
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/No valid owner authorization/i);
  });
});

describe("methodology and remediation knowledge", () => {
  it("has ordered phases and defensive mappings for finding classes", () => {
    expect(AUTHORIZED_PENTEST_PHASES.length).toBeGreaterThan(5);
    expect(Object.keys(FINDING_TO_DEFENSE).length).toBeGreaterThan(3);
  });
});
