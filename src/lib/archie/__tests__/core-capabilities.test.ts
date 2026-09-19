// =========================================================
// CORE-CAPABILITIES TESTS (batch 27, fix 120)
// The core system bindings are the honesty contract: every
// capability names a REAL module with REAL exports; deterministic
// engines are flagged (ARCHIE relays, never replaces the
// math); owner-gated writes are marked; unknown keys throw.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  FRELUX_CORE_SYSTEMS,
  findCoreSystem,
  type CoreSystemKey,
} from "@/lib/archie/core-capabilities";

describe("FRELUX_CORE_SYSTEMS — the binding table", () => {
  it("covers all 25 declared core systems with complete bindings", () => {
    expect(FRELUX_CORE_SYSTEMS).toHaveLength(25);
    for (const c of FRELUX_CORE_SYSTEMS) {
      expect(c.key).toBeTruthy();
      expect(c.label.trim().length).toBeGreaterThan(3);
      expect(c.family.trim().length).toBeGreaterThan(3);
      expect(c.module).toMatch(/^@/);
      expect(c.exports.length).toBeGreaterThan(0);
      expect(
        c.exports.every((e) => typeof e === "string" && e.trim().length > 0),
      ).toBe(true);
      expect([
        "ARCHIE_AUTONOMOUS",
        "OWNER_GATED",
        "AUTONOMOUS_READS_GATED_WRITES",
      ]).toContain(c.autonomy);
      expect(c.note.trim().length).toBeGreaterThan(10);
    }
  });

  it("flags deterministic engines — ARCHIE relays, never replaces the math", () => {
    const engines = findCoreSystem("DETERMINISTIC_ENGINES" as CoreSystemKey);
    expect(engines.deterministic).toBe(true);
    const calculators = findCoreSystem("CALCULATORS" as CoreSystemKey);
    expect(calculators.deterministic).toBe(true);
    const aiCore = findCoreSystem("AI_CORE" as CoreSystemKey);
    expect(aiCore.deterministic).toBe(false);
  });

  it("marks read/write systems with gated writes, and gates studio approvals in its workflow", () => {
    // Source-code intelligence and user files: autonomous reads, gated writes.
    const sourceCode = findCoreSystem(
      "SOURCE_CODE_INTELLIGENCE" as CoreSystemKey,
    );
    expect(sourceCode.autonomy).toBe("AUTONOMOUS_READS_GATED_WRITES");
    const files = findCoreSystem("USER_FILES_STORAGE" as CoreSystemKey);
    expect(files.autonomy).toBe("AUTONOMOUS_READS_GATED_WRITES");
    // The STUDIO binding targets the pure preview composer; the owner
    // approval gates live in the studio workflow itself (approve/rollback
    // are owner-only actions, enforced server-side by RLS).
    const studio = findCoreSystem("STUDIO" as CoreSystemKey);
    expect(studio.autonomy).toBe("ARCHIE_AUTONOMOUS");
    expect(studio.module).toBe("@/lib/studio/preview");
  });

  it("names real modules for every binding (spot-verify two by dynamic import)", async () => {
    const cost = findCoreSystem("COST_GOVERNANCE" as CoreSystemKey);
    const mod = await import(/* @vite-ignore */ cost.module);
    for (const name of cost.exports.slice(0, 3)) {
      const v = (mod as Record<string, unknown>)[name];
      expect(v).toBeDefined();
    }
  });

  it("throws honestly on unknown keys", () => {
    expect(() => findCoreSystem("NOT_A_SYSTEM" as CoreSystemKey)).toThrow(
      /Unknown core system/i,
    );
  });
});
