import { describe, expect, it } from "vitest";
// =========================================================
// DOMAIN-CAPTURE GUARD (audit H-1 closure, 2026-09-11 pass 4)
// The "general" engine must contain ZERO construction
// semantics. Domain knowledge (calculator, reasoning rules,
// NLU lexicon, seed facts, quantities hint, operator
// execution) lives in the construction domain skill
// (native-engine/domains/construction.ts) and reaches the
// engine ONLY through the DomainSkillRegistry.
// This test reads the actual shipped source files — a future
// re-weld fails here, in CI, not in front of the owner.
// =========================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constructionSkill } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { DomainSkillRegistry } from "@studio-shared/archie-ai/native-engine/domains/registry.ts";

const ENGINE_CORE_FILES = [
  "native-engine/engine.ts",
  "native-engine/nlu.ts",
  "native-engine/seed-corpus.ts",
  "native-engine/reasoning.ts",
  "native-engine/planning.ts",
];

/** Words that only exist in construction-domain semantics.
 *  Comments that DOCUMENT the move may name the skill — but no
 *  live lexicon, calculator, rule or corpus entry may. */
const WELD_SIGNALS: Array<[RegExp, string]> = [
  // the calculator's own invocation
  [/constructionEstimate\s*\(/, "the construction calculator"],
  // the NLU cascade lexicon
  [/blocks\?\|bricks\?/, "the construction_calc NLU lexicon"],
  // the quantities lexicon used by the planner
  [/screed\|plaster\|met\(\?:er\|re\)s\?/, "the planner quantities lexicon"],
  // construction seed facts
  [/subject:\s*"portland-cement"/, "a construction seed fact"],
  [/subject:\s*"mortar"/, "a construction seed fact"],
];

function readCore(name: string): string {
  return readFileSync(
    join(process.cwd(), "supabase/functions/_shared/archie-ai", name),
    "utf8",
  );
}

describe("domain-capture guard (audit H-1 closure)", () => {
  it("the engine core contains no construction semantics", () => {
    for (const file of ENGINE_CORE_FILES) {
      const src = readCore(file);
      for (const [signal, label] of WELD_SIGNALS) {
        expect(
          signal.test(src),
          `${label} welded into engine core file ${file}`,
        ).toBe(false);
      }
    }
  });

  it("seed-corpus.ts carries no construction subjects", () => {
    const src = readCore("native-engine/seed-corpus.ts");
    expect(src).not.toMatch(
      /subject:\s*"(?:cement|screeding|concrete|portland-cement|mortar)"/,
    );
  });

  it("the construction skill still owns everything that moved", () => {
    // calculator
    expect(typeof constructionSkill.handler).toBe("function");
    // NLU rules composed through the registry
    const registry = new DomainSkillRegistry();
    registry.register(constructionSkill);
    expect(registry.nluRules().length).toBeGreaterThan(0);
    // seed facts
    expect((constructionSkill.seedFacts ?? []).length).toBe(5);
    // quantities hint
    expect(
      constructionSkill.quantifies?.("how many blocks for a 6m wall"),
    ).toBe(true);
    // operator execution
    const exec = registry.executeOperator(
      "op_estimate_materials",
      "how many blocks do I need for a 6 by 3 meter wall",
    );
    expect(exec?.status).toBe("executed");
    expect(String(exec?.result)).toContain("approximately");
    // a non-domain operator stays unowned
    expect(registry.executeOperator("op_draft_plan", "anything")).toBeNull();
  });

  it("the registry alone reaches the engine — the skill's handler produces the calculator's answer", () => {
    const registry = new DomainSkillRegistry();
    registry.register(constructionSkill);
    const handler = registry.handlerFor("construction_calc");
    expect(handler).not.toBeNull();
    const answer = handler!(
      "how many bags of cement for 2 cubic meters of concrete",
    );
    expect(answer).toContain("bags");
  });
});
