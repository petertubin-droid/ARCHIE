// Batch 15 (Level 11) — fixes 48-49: domain registry decline
// contract and data-derived estimate prose.
import { describe, expect, it } from "vitest";
import {
  DomainSkillRegistry,
  type DomainSkill,
} from "@studio-shared/archie-ai/native-engine/domains/registry.ts";
import { constructionEstimate } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

describe("batch 15 — fix 48: registry decline contract", () => {
  it("returns null when no skill serves the intent", () => {
    const reg = new DomainSkillRegistry();
    expect(reg.handlerFor("construction_calc")).toBeNull();
  });

  it("a declining skill resolves to a null answer — not an empty string", () => {
    const reg = new DomainSkillRegistry();
    const declining: DomainSkill = {
      id: "decliner",
      intents: ["construction_calc"],
      handler: () => null, // documented decline contract
    };
    reg.register(declining);
    const h = reg.handlerFor("construction_calc");
    expect(h).not.toBeNull();
    // The OLD wrapper returned "" here — a blank reply.
    expect(h!("estimate 2 cubic meters of concrete")).toBeNull();
  });

  it("a later-registered serving skill is asked when the first declines", () => {
    const reg = new DomainSkillRegistry();
    reg.register({
      id: "decliner",
      intents: ["construction_calc"],
      handler: () => null,
    });
    reg.register({
      id: "answerer",
      intents: ["construction_calc"],
      handler: (_intent, input) => `answered: ${input.slice(0, 10)}`,
    });
    const h = reg.handlerFor("construction_calc");
    expect(h!("estimate blocks")).toMatch(/^answered:/);
  });

  it("whitespace-only answers are treated as declines", () => {
    const reg = new DomainSkillRegistry();
    reg.register({
      id: "blank",
      intents: ["construction_calc"],
      handler: () => "   ",
    });
    expect(reg.handlerFor("construction_calc")!("x")).toBeNull();
  });
});

describe("batch 15 — fix 49: estimate prose mirrors the data records", () => {
  it("cement prose states the seeded bag mass and waste — not hardcoded text", () => {
    const out = constructionEstimate(
      "how many bags of cement for 2 cubic meters",
    );
    expect(out).toContain("50kg bags");
    expect(out).toContain("plus 5% waste");
    expect(out).toContain("1440 kg/m3");
  });

  it("paint prose states the seeded coverage and coats", () => {
    const out = constructionEstimate("how much paint for 4 by 5 meter wall");
    expect(out).toContain("for 2 coats");
    expect(out).toContain("~10 m2 per litre per coat");
  });

  it("blocks prose states the seeded waste allowance", () => {
    const out = constructionEstimate("how many blocks for 6 by 3 meter wall");
    expect(out).toContain("5% breakage/waste allowance");
    expect(out).toContain("0.1081 m2 face");
  });
});
