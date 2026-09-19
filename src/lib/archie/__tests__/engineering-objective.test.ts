import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ENGINEERING_OBJECTIVE,
  classifyEngineeringAction,
  objectivePhases,
  verifyEngineeringObjectiveIntegrity,
} from "@/lib/archie/engineering-objective";
import { findCoreSystem } from "@/lib/archie/core-capabilities";
import * as objectiveModule from "@/lib/archie/engineering-objective";

// =========================================================
// The Long-Term Engineering Objective is a PERMANENT
// ARCHITECTURAL PRINCIPLE of ARCHIE — encoded in core code,
// persisted from birth, granting ZERO authority.
// =========================================================

describe("engineering objective integrity", () => {
  it("passes the full integrity report", () => {
    const report = verifyEngineeringObjectiveIntegrity();
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(8);
    for (const check of report.checks) {
      expect({ name: check.name, ok: check.ok }).toEqual({
        name: check.name,
        ok: true,
      });
    }
  });

  it("states the objective verbatim as ARCHIE's permanent direction", () => {
    for (const term of [
      "software engineering",
      "databases",
      "systems architecture",
      "cloud infrastructure",
      "DevOps",
      "cybersecurity",
      "testing",
      "deployment",
      "debugging",
      "infrastructure operations",
    ]) {
      expect(ENGINEERING_OBJECTIVE.objective).toContain(term);
    }
    expect(ENGINEERING_OBJECTIVE.reason).toContain("independent");
  });

  it("encodes all six authorized learning sources", () => {
    expect(ENGINEERING_OBJECTIVE.learningSources).toHaveLength(6);
    expect(ENGINEERING_OBJECTIVE.learningSources).toContain(
      "Its own codebase and architecture",
    );
    expect(ENGINEERING_OBJECTIVE.learningSources).toContain(
      "Legitimate documentation, open-source software and engineering knowledge",
    );
  });

  it("follows LEARN → BUILD → TEST → VERIFY → IMPROVE → MASTER → PROPOSE", () => {
    expect(objectivePhases()).toEqual([
      "LEARN",
      "BUILD",
      "TEST",
      "VERIFY",
      "IMPROVE",
      "MASTER",
      "PROPOSE",
    ]);
  });

  it("requires the Supabase-independence transition to not need a rewrite", () => {
    expect(ENGINEERING_OBJECTIVE.infrastructureTransition).toContain(
      "without requiring a complete rewrite",
    );
  });

  it("is permanent — never a prompt, mock or placeholder", () => {
    expect(ENGINEERING_OBJECTIVE.permanence).toContain("Never implemented");
    expect(ENGINEERING_OBJECTIVE.permanence).toContain("mock");
  });
});

describe("objective grants ZERO authority — non-grants enforced", () => {
  const prohibited = [
    [
      "modify its own core authority or safety controls",
      "modify its own core authority controls",
    ],
    ["deploy itself without authorization", "deploy itself to production"],
    [
      "acquire infrastructure or services without authorization",
      "acquire infrastructure servers",
    ],
    [
      "migrate, delete or alter persistent data without authorization",
      "migrate persistent data",
    ],
    ["remove security controls", "remove security controls"],
    ["conceal changes or audit history", "conceal audit history"],
    ["grant itself permissions", "grant itself permissions"],
  ] as const;

  it.each(prohibited)("%s → OWNER_APPROVAL_REQUIRED", (grant, probe) => {
    const verdict = classifyEngineeringAction(probe);
    expect(verdict.verdict).toBe("OWNER_APPROVAL_REQUIRED");
    expect(verdict.nonGrant).toBe(grant);
  });

  it("learning and engineering work within ARCHIE's scope stays autonomous", () => {
    for (const action of [
      "analysis",
      "read-only source code inspection",
      "learning from runtime errors",
    ]) {
      const verdict = classifyEngineeringAction(action);
      expect(verdict.verdict).toBe("ARCHIE_MAY_ACT");
      expect(verdict.nonGrant).toBeUndefined();
    }
  });
});

describe("registered as an ARCHIE core system (birthright)", () => {
  it("is a core capability binding with real exports", () => {
    const binding = findCoreSystem("ENGINEERING_OBJECTIVE");
    expect(binding.module).toBe("@/lib/archie/engineering-objective");
    expect(binding.autonomy).toBe("ARCHIE_AUTONOMOUS");
    // The health-check contract: every named export really exists.
    for (const name of binding.exports) {
      expect(
        (objectiveModule as unknown as Record<string, unknown>)[name],
      ).toBeDefined();
    }
  });
});

describe("persisted from birth in the durable store", () => {
  const migration = readFileSync(
    path.join(
      __dirname.replace("src/lib/archie/__tests__", "supabase/migrations"),
      "20260911230000_archie_engineering_objective.sql",
    ),
    "utf8",
  );

  it("creates the persistent principles table", () => {
    expect(migration).toContain("frelux_archie_core_principles");
  });

  it("seeds the objective idempotently — upgrades never erase it", () => {
    expect(migration).toContain("ON CONFLICT (principle_id) DO NOTHING");
    expect(migration).toContain("'engineering_objective'");
    expect(migration).toContain("OWNER_DIRECTIVE");
  });

  it("keeps write authority admin-only (ARCHIE cannot alter its birthright)", () => {
    expect(migration).toContain("admins manage core principles");
    expect(migration).toContain("public.is_admin()");
    // Read policy for authenticated exists but no blanket write policy.
    expect(migration).toContain("authenticated read core principles");
  });
});
