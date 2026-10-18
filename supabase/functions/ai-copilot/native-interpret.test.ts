import { describe, expect, it } from "vitest";
import { nativeInterpret } from "./native-interpret.ts";

/** ARCHIE-native Copilot interpretation (owner directive
 * 2026-10-18: ARCHIE powers FRELUX when Gemini is down). Same
 * honesty rules as the Gemini prompt: only stated facts,
 * never a calculation, feet converted with evidence. */
describe("native copilot interpreter", () => {
  it("classifies a building estimate with stated bedrooms and floors", () => {
    const out = nativeInterpret("I want to build a 3 bedroom duplex in Lagos");
    expect(out.taskType).toBe("building_estimate");
    const beds = out.facts.find((f) => f.key === "bedrooms");
    expect(beds?.value).toBe(3);
    const type = out.facts.find((f) => f.key === "building_type");
    expect(type?.value).toBe("duplex");
  });

  it("converts explicitly stated feet to meters and records the evidence", () => {
    const out = nativeInterpret("paint a wall 20 ft long and 3 m high");
    expect(out.taskType).toBe("painting_estimate");
    const length = out.facts.find((f) => f.key === "length");
    expect(length?.unit).toBe("m");
    expect(length?.value).toBeCloseTo(6.096, 2);
    expect(length?.evidence).toContain("converted");
    expect(length?.evidence).toContain("20 ft");
  });

  it("NEVER invents numbers the user did not state", () => {
    const out = nativeInterpret("how much paint do I need");
    expect(out.taskType).toBe("painting_materials");
    expect(out.facts).toHaveLength(0);
    expect(out.followUpQuestion).toBeDefined();
    expect(out.followUpQuestion).toContain("dimensions");
  });

  it("classifies a roof estimate", () => {
    const out = nativeInterpret("estimate the roof of my bungalow");
    expect(out.taskType).toBe("roof_estimate");
  });

  it("classifies finish comparison", () => {
    const out = nativeInterpret("compare tyrolene vs pop finish for my walls");
    expect(out.taskType).toBe("finish_compare");
  });

  it("classifies tyrolene, pop, screeding and tiles", () => {
    expect(nativeInterpret("tyrolene my fence").taskType).toBe("tyrolene_estimate");
    expect(nativeInterpret("POP ceiling for the room").taskType).toBe("pop_estimate");
    expect(nativeInterpret("screeding the floor tomorrow").taskType).toBe("screeding_estimate");
    expect(nativeInterpret("tiles for the kitchen").taskType).toBe("tile_estimate");
  });

  it("routes general questions to project_question", () => {
    const out = nativeInterpret("is it cheaper to build in the dry season?");
    expect(out.taskType).toBe("project_question");
  });

  it("marks genuinely unsupported requests as unsupported", () => {
    const out = nativeInterpret("book me a flight to Kano");
    expect(out.taskType).toBe("unsupported");
  });

  it("extracts floor counts in both word and number form", () => {
    const words = nativeInterpret("two storey building estimate");
    expect(words.facts.find((f) => f.key === "number_of_floors")?.value).toBe(2);
    const nums = nativeInterpret("4 storey building");
    expect(nums.facts.find((f) => f.key === "number_of_floors")?.value).toBe(4);
  });

  it("never emits an interpretation fact that was not stated", () => {
    const out = nativeInterpret("estimate my building");
    const dims = out.facts.filter(
      (f) => f.key === "length" || f.key === "building_length",
    );
    expect(dims).toHaveLength(0);
  });
});
