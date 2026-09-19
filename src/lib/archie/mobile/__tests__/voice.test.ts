import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  archieVoiceSupported,
  speakableText,
  chunkForSpeech,
  speakArchie,
  stopArchieVoice,
} from "../voice";
import type { ArchieConsent } from "../types";

const granted = (on: boolean): ArchieConsent => ({
  capability: "VOICE_OUTPUT",
  granted: on,
  granted_at: on ? new Date().toISOString() : null,
});

class FakeUtterance {
  text: string;
  constructor(t: string) {
    this.text = t;
  }
}

let spoken: FakeUtterance[] = [];
let cancelMock: ReturnType<typeof vi.fn>;

function installEngine() {
  spoken = [];
  cancelMock = vi.fn();
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance =
    FakeUtterance;
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    speak: (u: FakeUtterance) => spoken.push(u),
    cancel: cancelMock,
  };
}

const BANNER = String.fromCodePoint(0x1f6d7); // construction emoji

describe("ARCHIE voice", () => {
  beforeEach(installEngine);
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
  });

  it("detects platform support", () => {
    expect(archieVoiceSupported()).toBe(true);
  });

  it("reports unsupported when the engine is not functional", () => {
    (window as unknown as Record<string, unknown>).speechSynthesis = {
      speak: "not-a-function",
    };
    expect(archieVoiceSupported()).toBe(false);
  });

  it("NEVER speaks without an explicit granted consent", () => {
    for (const consent of [undefined, null, granted(false)]) {
      const res = speakArchie("Hello owner", consent);
      expect(res.ok).toBe(false);
      expect(res.chunks).toBe(0);
      expect(spoken.length).toBe(0);
      expect(res.error).toMatch(/switched off|Capabilities/i);
    }
  });

  it("speaks when consent is granted", () => {
    const res = speakArchie("Hello owner", granted(true));
    expect(res.ok).toBe(true);
    expect(res.chunks).toBe(1);
    expect(spoken.length).toBe(1);
    expect(spoken[0].text).toBe("Hello owner");
  });

  it("never speaks emoji, markdown or raw URLs", () => {
    const clean = speakableText(
      BANNER +
        " **Roof area** is 42m2 - see https://freluxtools.netlify.app/r/9 for details.",
    );
    expect(clean).not.toMatch(/\*\*|https?:\/\/|frelux\.app/);
    expect(clean.includes(BANNER)).toBe(false);
    expect(clean).toContain("Roof area");
    expect(clean).toContain("a link");
  });

  it("chunks long text at sentence/word boundaries (never mid-word)", () => {
    const long =
      "Screeding for this room is complete. ".repeat(20) +
      "Tiling comes next after the screed cures fully.";
    const chunks = chunkForSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(220);
    }
    expect(chunks.join(" ")).toContain("Tiling comes next");
  });

  it("returns ok with zero chunks for symbol-only text", () => {
    const res = speakArchie(BANNER, granted(true));
    expect(res.ok).toBe(true);
    expect(res.chunks).toBe(0);
    expect(spoken.length).toBe(0);
  });

  it("stops immediately when asked to be silent", () => {
    speakArchie("speaking now", granted(true));
    stopArchieVoice();
    expect(cancelMock).toHaveBeenCalled();
  });
});
