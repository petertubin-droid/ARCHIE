// =========================================================
// CODE-COMMAND TESTS (batch 24, fix 94)
// Only the authenticated Owner's server-verified explicit
// command opens protected code modification; bugs/warnings/
// recommendations are NEVER authorization; the 12-stage
// workflow gates at OWNER AUTHORIZATION.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  advanceCodeCommand,
  beginCodeModification,
  buildCodeModificationRecord,
  CODE_COMMAND_WORKFLOW,
  isAuthorization,
  NOT_AUTHORIZATION,
  OWNER_SECRET_SURFACES_FORBIDDEN,
} from "@/lib/archie/code-command";

describe("isAuthorization — what is NEVER authorization", () => {
  it("refuses detected bugs, warnings, recommendations, conversations", () => {
    for (const source of NOT_AUTHORIZATION) {
      const r = isAuthorization(source);
      expect(r.authorized).toBe(false);
      expect(r.error).toMatch(/NOT authorization/i);
    }
  });

  it("refuses 'ARCHIE's own decision' explicitly", () => {
    const r = isAuthorization("ARCHIE's own decision");
    expect(r.authorized).toBe(false);
    expect(r.error).toMatch(/authenticated Owner's explicit/i);
  });

  it("accepts only the authenticated Owner's explicit command", () => {
    expect(isAuthorization("the Owner's explicit command").authorized).toBe(
      true,
    );
    expect(isAuthorization("the subscriber asked nicely").authorized).toBe(
      false,
    );
  });
});

describe("beginCodeModification", () => {
  it("refuses empty commands, unverified servers and missing identity", () => {
    expect(
      beginCodeModification({
        command_text: " ",
        owner_identity: "o",
        server_verified: true,
      }).ok,
    ).toBe(false);
    expect(
      beginCodeModification({
        command_text: "fix bug",
        owner_identity: "o",
        server_verified: false,
      }).ok,
    ).toBe(false);
    expect(
      beginCodeModification({
        command_text: "fix bug",
        owner_identity: " ",
        server_verified: true,
      }).ok,
    ).toBe(false);
    const ok = beginCodeModification({
      command_text: "fix the rounding in paint-formula.ts",
      owner_identity: "owner@frelux",
      server_verified: true,
    });
    expect(ok).toMatchObject({ ok: true, stage: "ARCHIE UNDERSTANDS" });
  });
});

describe("advanceCodeCommand — the 12-stage gated workflow", () => {
  it("ARCHIE advances its own stages up to the gate", () => {
    expect(advanceCodeCommand("OWNER COMMAND", "ARCHIE")).toEqual({
      ok: true,
      next: "ARCHIE UNDERSTANDS",
    });
    // ARCHIE advances only UP TO the gate, never into it
    const atGate = advanceCodeCommand("WRITE/TEST IN ISOLATION", "ARCHIE");
    expect(atGate.ok).toBe(false);
    if (!atGate.ok) expect(atGate.error).toMatch(/waits at the gate/i);
  });

  it("the gate opens only with the Owner's server-verified approval", () => {
    const archieTries = advanceCodeCommand(
      "WRITE/TEST IN ISOLATION",
      "ARCHIE",
      {
        server_verified_approval: true,
      },
    );
    expect(archieTries.ok).toBe(false);
    const ownerNoVerify = advanceCodeCommand(
      "WRITE/TEST IN ISOLATION",
      "OWNER",
    );
    expect(ownerNoVerify.ok).toBe(false);
    const ownerVerified = advanceCodeCommand(
      "WRITE/TEST IN ISOLATION",
      "OWNER",
      {
        server_verified_approval: true,
      },
    );
    expect(ownerVerified).toEqual({ ok: true, next: "APPLY" });
  });

  it("post-gate stages are owner-driven and sensitive audits need verification", () => {
    expect(advanceCodeCommand("APPLY", "ARCHIE").ok).toBe(false);
    expect(advanceCodeCommand("APPLY", "OWNER")).toEqual({
      ok: true,
      next: "REGRESSION TEST",
    });
    const sensitive = advanceCodeCommand("AUDIT", "OWNER", {
      sensitive_change: true,
    });
    expect(sensitive.ok).toBe(false);
    expect(
      advanceCodeCommand("AUDIT", "OWNER", {
        sensitive_change: true,
        server_verified_approval: true,
      }),
    ).toEqual({ ok: true, next: "VERSION" });
  });

  it("refuses unknown stages and completing past DEPLOY", () => {
    expect(advanceCodeCommand("NOT_A_STAGE" as never, "OWNER").ok).toBe(false);
    expect(advanceCodeCommand("DEPLOY", "OWNER").ok).toBe(false);
    expect(CODE_COMMAND_WORKFLOW).toHaveLength(12);
  });
});

describe("buildCodeModificationRecord — full auditability", () => {
  const good = {
    owner_identity: "owner@frelux",
    requested_change: "fix rounding",
    affected_components: ["src/lib/paint-formula.ts"],
    version: "1.2.0",
    tests: ["vitest suite green"],
    timestamp: "2026-09-15T12:00:00Z",
    approval: {
      server_verified: true as const,
      authorization_record_id: "ar_1",
    },
    rollback: "git revert <sha>",
  };

  it("requires identity, change, components, rollback, approval, version, tests, timestamp", () => {
    expect(
      buildCodeModificationRecord({ ...good, owner_identity: " " }).ok,
    ).toBe(false);
    expect(
      buildCodeModificationRecord({ ...good, affected_components: [] }).ok,
    ).toBe(false);
    expect(buildCodeModificationRecord({ ...good, rollback: "" }).ok).toBe(
      false,
    );
    expect(
      buildCodeModificationRecord({
        ...good,
        approval: {
          server_verified: false as never,
          authorization_record_id: "x",
        },
      }).ok,
    ).toBe(false);
    expect(
      buildCodeModificationRecord({ ...good, timestamp: "yesterday" }).ok,
    ).toBe(false);
    expect(buildCodeModificationRecord(good)).toMatchObject({ ok: true });
  });

  it("keeps Owner secrets off every client-facing surface", () => {
    expect(OWNER_SECRET_SURFACES_FORBIDDEN).toContain("AI prompts");
    expect(OWNER_SECRET_SURFACES_FORBIDDEN).toContain("voice transcripts");
    expect(OWNER_SECRET_SURFACES_FORBIDDEN).toContain("browser storage");
  });
});
