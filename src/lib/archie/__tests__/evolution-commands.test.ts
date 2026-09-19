// =========================================================
// EVOLUTION-COMMANDS TESTS (batch 28, fix 127)
// Owner command parsing: "improve yourself" is OBSERVE-only;
// staging/rollback/approval are owner-gated; NO command
// grants production; external content is never a command.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  isExternalInstruction,
  parseOwnerCommand,
} from "@/lib/archie/evolution/commands";

describe("parseOwnerCommand", () => {
  it("maps self-improvement to OBSERVE-only with the honest explanation", () => {
    const r = parseOwnerCommand("improve yourself");
    expect(r.action).toBe("IMPROVE_YOURSELF");
    expect(r.grantsProduction).toBe(false);
    expect(r.requiresOwnerAuth).toBe(false);
    expect(r.explanation).toMatch(/no modification authority/i);
  });

  it("recognizes observe, propose, test and show-change without owner auth", () => {
    expect(parseOwnerCommand("archie, analyze the codebase")).toMatchObject({
      action: "OBSERVE",
      requiresOwnerAuth: false,
    });
    expect(parseOwnerCommand("propose a fix for the login bug")).toMatchObject({
      action: "PROPOSE",
      requiresOwnerAuth: false,
    });
    expect(parseOwnerCommand("test the staged change")).toMatchObject({
      action: "TEST_STAGED",
      requiresOwnerAuth: false,
    });
    expect(parseOwnerCommand("show me exactly what will change")).toMatchObject(
      {
        action: "SHOW_CHANGE",
        requiresOwnerAuth: false,
      },
    );
  });

  it("owner-gates staging, approval, rejection and rollback — the command approves nothing", () => {
    const stage = parseOwnerCommand("stage the approved change CR-2026-0001");
    expect(stage).toMatchObject({
      action: "STAGE",
      target: "CR-2026-0001",
      requiresOwnerAuth: true,
    });
    const approve = parseOwnerCommand("approve change CR-2026-0002");
    expect(approve).toMatchObject({
      action: "APPROVE_PRODUCTION",
      requiresOwnerAuth: true,
    });
    expect(approve.explanation).toMatch(/approves nothing/i);
    expect(parseOwnerCommand("reject that change")).toMatchObject({
      action: "REJECT",
      requiresOwnerAuth: true,
    });
    expect(parseOwnerCommand("rollback CR-2026-0003")).toMatchObject({
      action: "ROLLBACK",
      requiresOwnerAuth: true,
    });
    // no command ever grants production by itself
    expect(approve.grantsProduction).toBe(false);
  });

  it("refuses approval without a CR number and unknown/empty commands", () => {
    expect(parseOwnerCommand("archie, approve").action).toBe("UNKNOWN");
    expect(parseOwnerCommand("").action).toBe("UNKNOWN");
    expect(parseOwnerCommand("delete the database").action).toBe("UNKNOWN");
  });

  it("parses language learning, validation and show", () => {
    expect(parseOwnerCommand("learn this language: Yoruba")).toMatchObject({
      action: "LEARN_LANGUAGE",
    });
    expect(parseOwnerCommand("validate what you learned")).toMatchObject({
      action: "VALIDATE_LANGUAGE",
    });
    expect(
      parseOwnerCommand("show me everything you currently know about Igbo"),
    ).toMatchObject({
      action: "SHOW_LANGUAGE",
    });
  });
});

describe("isExternalInstruction", () => {
  it("flags document/message content as never-a-command", () => {
    expect(isExternalInstruction("uploaded document")).toBe(true);
    expect(isExternalInstruction("a website I read")).toBe(true);
    expect(isExternalInstruction("typed directly by the owner in chat")).toBe(
      false,
    );
  });
});
