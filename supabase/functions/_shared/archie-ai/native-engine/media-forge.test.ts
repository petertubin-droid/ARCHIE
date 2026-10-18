// =========================================================
// ARCHIE MEDIA-FORGE TESTS (B-4)
// =========================================================

import { describe, expect, it } from "vitest";
import {
  generateDiagram,
  generateMotionGraphic,
  synthesizeTone,
} from "./media-forge.ts";

describe("media-forge — bar charts", () => {
  it("bar heights are real math (tallest bar reaches the plot top)", () => {
    const r = generateDiagram({
      kind: "bar",
      title: "Paint sales by month",
      bars: [
        { label: "Q1", value: 10 },
        { label: "Q2", value: 40 },
        { label: "Q3", value: 25 },
      ],
    });
    expect(r.ok).toBe(true);
    // plot area: H=400, pad=48 → tallest bar height = 400-96 = 304
    expect(r.svg).toContain(`height="304"`);
    // 40 (max) → 304; 25 → 190; 10 → 76
    expect(r.svg).toContain(`height="190"`);
    expect(r.svg).toContain(`height="76"`);
  });

  it("XML-escaped labels cannot inject markup", () => {
    const r = generateDiagram({
      kind: "bar",
      title: "Evil <title> & \"quotes\"",
      bars: [{ label: "<script>alert(1)</script>", value: 1 }],
    });
    expect(r.ok).toBe(true);
    expect(r.svg).not.toContain("<script>");
    expect(r.svg).toContain("&lt;script&gt;");
    expect(r.svg).toContain("&amp;");
  });

  it("hostile MARKUP is escaped inert; the output stays executable-free", () => {
    // hostile markup in labels is TEXT: escaping renders it
    // inert, and the forged output contains no executable
    // vector. (Scheme strings like javascript: are refused
    // at input — see the next test.)
    const r = generateDiagram({
      kind: "bar",
      title: "Careful: <iframe src='x'> onload=x <script>alert(1)</script>",
      bars: [{ label: "<script>alert(1)</script>", value: 1 }],
    });
    expect(r.ok).toBe(true);
    expect(r.svg.toLowerCase()).not.toContain("<script");
    expect(r.svg.toLowerCase()).not.toContain("<iframe");
    // "onload=x" survives as inert ESCAPED TEXT (see the
    // engine's OUTPUT_BANNED comment) — harmless by design.
    expect(r.svg).toContain("onload=x");
    expect(r.svg).toContain("&lt;script&gt;");
  });

  it("URL-scheme attack strings refused at input", () => {
    const r = generateDiagram({
      kind: "bar",
      title: "javascript:alert(1)",
      bars: [{ label: "x", value: 1 }],
    });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("refused honestly");
  });

  it("negative / NaN values refused honestly", () => {
    const r = generateDiagram({
      kind: "bar",
      title: "bad",
      bars: [{ label: "x", value: -5 }],
    });
    expect(r.ok).toBe(false);
    expect(r.note).toContain("refused honestly");
  });
});

describe("media-forge — line charts", () => {
  it("polyline path maps points into the viewBox with real math", () => {
    const r = generateDiagram({
      kind: "line",
      title: "Latency",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 100 },
      ],
    });
    expect(r.ok).toBe(true);
    // x: 0 → pad 48; 10 → 640-48 = 592. y: 0 (min) → bottom 352; 100 (max) → top 48
    expect(r.svg).toContain("M48,352");
    expect(r.svg).toContain("L592,48");
  });

  it("too few points refused", () => {
    expect(generateDiagram({ kind: "line", title: "t", points: [{ x: 1, y: 1 }] }).ok).toBe(false);
  });
});

describe("media-forge — flow diagrams", () => {
  it("steps and arrows emitted in order", () => {
    const r = generateDiagram({
      kind: "flow",
      title: "Onboarding",
      steps: ["Collect specs", "Verify", "Forge"],
    });
    expect(r.ok).toBe(true);
    expect(r.svg).toContain("Collect specs");
    expect(r.svg).toContain("Verify");
    expect(r.svg).toContain("Forge");
    // 3 steps → 2 connector lines
    expect((r.svg.match(/marker-end/g) ?? []).length).toBe(2);
  });

  it("single-step flow refused honestly", () => {
    expect(generateDiagram({ kind: "flow", title: "t", steps: ["only"] }).ok).toBe(false);
  });
});

describe("media-forge — audio cues", () => {
  it("synthesizes a real PCM tone: length, amplitude bounds, envelope", () => {
    const r = synthesizeTone({ freqHz: 440, durationSec: 0.5, sampleRate: 16000 });
    expect(r.ok).toBe(true);
    expect(r.pcm.length).toBe(8000);
    // bounded
    for (let i = 0; i < r.pcm.length; i += 97) {
      expect(Math.abs(r.pcm[i])).toBeLessThanOrEqual(0.6 + 1e-6);
    }
    // envelope: start near silence, middle non-silent, end near silence
    expect(Math.abs(r.pcm[0])).toBeLessThan(0.01);
    // 3750 samples = 0.234375 s → 103.125 cycles: mid-scale,
    // never a sine zero point (found by test: index 4000 was
    // an exact integer cycle at 440 Hz/16 kHz → zero)
    expect(Math.abs(r.pcm[3750])).toBeGreaterThan(0.1);
    expect(Math.abs(r.pcm[7999])).toBeLessThan(0.01);
  });

  it("sinusoid frequency is honest: ~440 Hz zero crossings", () => {
    const sr = 16000;
    const r = synthesizeTone({ freqHz: 440, durationSec: 1, sampleRate: sr, harmonic: 0 });
    expect(r.ok).toBe(true);
    // count zero-crossings in the stable middle region
    let zc = 0;
    for (let i = 4000; i < 12000 - 1; i++) {
      if ((r.pcm[i] >= 0) !== (r.pcm[i + 1] >= 0)) zc += 1;
    }
    // window = 0.5 s → 220 cycles → ≈440 crossings
    expect(zc).toBeGreaterThan(440 * 0.9);
    expect(zc).toBeLessThan(440 * 1.1);
  });

  it("determinism: same spec → identical PCM", () => {
    const a = synthesizeTone({ freqHz: 880, durationSec: 0.2 });
    const b = synthesizeTone({ freqHz: 880, durationSec: 0.2 });
    expect(Array.from(a.pcm.slice(0, 100))).toEqual(Array.from(b.pcm.slice(0, 100)));
  });

  it("out-of-range specs refused honestly", () => {
    expect(synthesizeTone({ freqHz: 0, durationSec: 1 }).ok).toBe(false);
    expect(synthesizeTone({ freqHz: 440, durationSec: 99 }).ok).toBe(false);
    expect(synthesizeTone({ freqHz: 440, durationSec: 1, amplitude: 2 }).ok).toBe(false);
  });

  it("honest note: cues, never speech", () => {
    const r = synthesizeTone({ freqHz: 440, durationSec: 0.1 });
    expect(r.note).toContain("not speech");
  });
});

describe("media-forge — motion graphics", () => {
  it("pulse emits a scale animation with real growth math", () => {
    const r = generateMotionGraphic({ kind: "pulse", label: "beacon", magnitude: 20, periodSec: 2 });
    expect(r.ok).toBe(true);
    expect(r.svg).toContain('values="1;1.2;1"');
    expect(r.svg).toContain('dur="2s"');
    expect(r.svg).toContain("repeatCount");
  });

  it("slide emits a real x-translate", () => {
    const r = generateMotionGraphic({ kind: "slide", label: "ticker", magnitude: 30, periodSec: 1.5 });
    expect(r.ok).toBe(true);
    expect(r.svg).toContain('values="85;115;85"');
  });

  it("orbit emits rotation around center", () => {
    const r = generateMotionGraphic({ kind: "orbit", label: "ring", magnitude: 40, periodSec: 3 });
    expect(r.ok).toBe(true);
    expect(r.svg).toContain('values="0 100 100;360 100 100"');
    expect(r.svg).toContain('cy="60"'); // 100 - 40
  });

  it("bad period / magnitude / kind refused honestly", () => {
    expect(generateMotionGraphic({ kind: "spin", label: "x", magnitude: 1, periodSec: 1 }).ok).toBe(false);
    expect(generateMotionGraphic({ kind: "pulse", label: "x", magnitude: 1, periodSec: 0.01 }).ok).toBe(false);
    expect(generateMotionGraphic({ kind: "pulse", label: "x", magnitude: 5000, periodSec: 1 }).ok).toBe(false);
  });

  it("injected label refused", () => {
    const r = generateMotionGraphic({ kind: "pulse", label: "<script>x", magnitude: 1, periodSec: 1 });
    expect(r.ok).toBe(false);
  });
});
