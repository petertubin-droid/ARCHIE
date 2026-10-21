import { describe, expect, it } from "vitest";
import { professionalNumber, professionalText } from "./text-hygiene.ts";

describe("professionalText (owner directive 2026-10-21)", () => {
  it("replaces em and en dashes with clause commas", () => {
    expect(professionalText("Momentum — the product of mass and velocity – stated simply")).toBe(
      "Momentum, the product of mass and velocity, stated simply",
    );
  });

  it("converts curly quotes to straight ASCII", () => {
    expect(professionalText("\u201Cquoted\u201D and \u2018single\u2019")).toBe(
      '"quoted" and \'single\'',
    );
  });

  it("converts the ellipsis character to three dots", () => {
    expect(professionalText("wait\u2026")).toBe("wait...");
  });

  it("converts decorative bullets and arrows to plain text", () => {
    expect(professionalText("\u2022 first \u2192 second")).toBe("- first to second");
  });

  it("collapses repeated emphasis punctuation", () => {
    expect(professionalText("great!! really??")).toBe("great! really?");
  });

  it("strips zero-width characters", () => {
    expect(professionalText("a\u200Bb")).toBe("ab");
  });

  it("never collapses newlines or meaning-bearing punctuation", () => {
    const input = "line one\nline two\n(url: https://x.dev/a—b)";
    const out = professionalText(input);
    expect(out.split("\n").length).toBe(3);
    expect(out).toContain("https://x.dev/a");
  });

  it("leaves plain professional text untouched", () => {
    expect(professionalText("momentum means: an impelling force or strength")).toBe(
      "momentum means: an impelling force or strength",
    );
  });

  it("returns empty input unchanged", () => {
    expect(professionalText("")).toBe("");
  });
});

describe("professionalNumber", () => {
  it("formats counts with standard thousands separators", () => {
    expect(professionalNumber(87716)).toBe("87,716");
    expect(professionalNumber(130696)).toBe("130,696");
  });

  it("passes small numbers through", () => {
    expect(professionalNumber(42)).toBe("42");
  });
});
