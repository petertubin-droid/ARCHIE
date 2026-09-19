// =========================================================
// FRELUX ARCHIE — EARS (NATIVE AUDIO INTELLIGENCE) TESTS
//
// Hermetic: the Supabase client is mocked, the browser's
// MediaRecorder/getUserMedia/AudioContext and the NATIVE
// SpeechRecognition engine are stubbed. These tests lock in
// the honesty invariants of the Ears subsystem and the
// OpenAI Separation Rule:
//   * failures are typed, never silently swallowed
//   * an empty recognition result is NEVER fabricated into
//     text (speechDetected:false, transcript exactly "")
//   * the microphone is only ever turned on via the
//     owner-initiated start()/recognizeSpeech()
//   * NO provider exists anywhere in the pipeline — the
//     recognition is native (on-device), the voice print is
//     deterministic pitch math against the voice bank
// =========================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: async () => ({
    functions: { invoke: invokeMock },
  }),
}));

import {
  startListening,
  recognizeSpeech,
  reportTranscription,
  detectEarSupport,
  detectAudioCaptureSupport,
  EarsError,
} from "@/lib/archie/ears";
import {
  normalizeTranscript,
  sanitizeLanguageHint,
  voicePrintMatch,
  validateEarsIntake,
  EARS_MAX_TRANSCRIPT_CHARS,
} from "@studio-shared/archie-ai/native-engine/ears";

// ---- Browser stubs ----
class MockRecorder {
  static instances: MockRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((ev: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  started = false;
  stopped = false;
  constructor(_stream: MediaStream, _opts?: unknown) {
    MockRecorder.instances.push(this);
  }
  start() {
    this.started = true;
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.onstop?.();
  }
}

/** Stub of the browser/OS NATIVE recognition engine — the
 *  same interface recognizeSpeech drives in production. */
class MockRecognition {
  static instances: MockRecognition[] = [];
  constructor() {
    MockRecognition.instances.push(this);
  }
  lang = "en";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

/** Deterministic 200 Hz voiced frame — pure math, no audio. */
class MockAnalyser {
  fftSize = 2048;
  getFloatTimeDomainData(arr: Float32Array) {
    const sampleRate = 48_000;
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.sin((2 * Math.PI * 200 * i) / sampleRate);
    }
  }
}

class MockAudioContext {
  sampleRate = 48_000;
  createMediaStreamSource() {
    return { connect: () => undefined, disconnect: () => undefined };
  }
  createAnalyser() {
    return new MockAnalyser();
  }
  close() {
    return Promise.resolve();
  }
}

function stubMicDevice(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
}

let originalMediaRecorder: unknown;
let originalMediaDevices: unknown;
let originalSpeechRecognition: unknown;
let originalAudioContext: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  MockRecorder.instances = [];
  MockRecognition.instances = [];
  invokeMock.mockReset();
  const g = globalThis as Record<string, unknown>;
  originalMediaRecorder = g["MediaRecorder"];
  originalMediaDevices = (navigator as unknown as Record<string, unknown>)[
    "mediaDevices"
  ];
  originalSpeechRecognition = g["SpeechRecognition"];
  originalAudioContext = g["AudioContext"];
  vi.stubGlobal("MediaRecorder", MockRecorder);
  // native recognition absent by default — each test opts in
  g["SpeechRecognition"] = undefined;
  g["AudioContext"] = undefined;
  stubMicDevice(
    async () =>
      ({
        getTracks: () => [{ stop: () => {} }],
      }) as unknown as MediaStream,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", {
    value: originalMediaDevices,
    configurable: true,
  });
  const g = globalThis as Record<string, unknown>;
  g["MediaRecorder"] = originalMediaRecorder;
  g["SpeechRecognition"] = originalSpeechRecognition;
  g["AudioContext"] = originalAudioContext;
});

// ---------------------------------------------------------
// Support detection — honest about the browser
// ---------------------------------------------------------
describe("detectEarSupport (native recognition)", () => {
  it("reports false when the browser has no native speech recognition", () => {
    expect(detectEarSupport()).toBe(false);
  });

  it("reports true when the native engine exists", () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    expect(detectEarSupport()).toBe(true);
  });

  it("audio capture support requires getUserMedia + AudioContext", () => {
    vi.stubGlobal("AudioContext", MockAudioContext);
    expect(detectAudioCaptureSupport()).toBe(true);
    vi.stubGlobal("AudioContext", undefined);
    expect(detectAudioCaptureSupport()).toBe(false);
  });
});

// ---------------------------------------------------------
// Voice-note capture lifecycle — explicit, owner-initiated only
// ---------------------------------------------------------
describe("startListening", () => {
  it("throws UNSUPPORTED when the browser has no MediaRecorder", async () => {
    (globalThis as Record<string, unknown>)["MediaRecorder"] = undefined;
    await expect(startListening()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("throws PERMISSION_DENIED when the owner refuses the mic", async () => {
    stubMicDevice(() =>
      Promise.reject(new DOMException("denied", "NotAllowedError")),
    );
    await expect(startListening()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("throws NO_MIC when no input device exists", async () => {
    stubMicDevice(() =>
      Promise.reject(new DOMException("not found", "NotFoundError")),
    );
    await expect(startListening()).rejects.toMatchObject({ code: "NO_MIC" });
  });

  it("records only after startListening, and stop() returns the real audio", async () => {
    const rec = await startListening();
    const recorderInstance = MockRecorder.instances[0];
    expect(recorderInstance.started).toBe(true);
    expect(MockRecorder.instances).toHaveLength(1);

    const recording = await rec.stop();
    expect(recorderInstance.stopped).toBe(true);
    expect(recording.blob).toBeInstanceOf(Blob);
    expect(recording.blob.size).toBeGreaterThan(0);
    expect(recording.durationSec).toBeGreaterThanOrEqual(0);
    expect(recording.capped).toBe(false);
  });

  it("rejects NOT_RECORDED when nothing was captured", async () => {
    // a recorder that produces no chunks at all
    class EmptyRecorder extends MockRecorder {
      start() {
        this.started = true; // no ondataavailable fired
      }
    }
    vi.stubGlobal("MediaRecorder", EmptyRecorder);
    const rec = await startListening();
    await expect(rec.stop()).rejects.toMatchObject({ code: "NOT_RECORDED" });
  });
});

// ---------------------------------------------------------
// Native speech recognition — on-device, no provider
// ---------------------------------------------------------
describe("recognizeSpeech", () => {
  it("throws UNSUPPORTED when the browser has no native recognition engine", async () => {
    await expect(recognizeSpeech()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("applies the language hint to the native engine", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const pending = recognizeSpeech({ languageHint: "en-NG" });
    const rec = MockRecognition.instances[0];
    expect(rec.lang).toBe("en-NG");
    rec.onend?.(); // engine ran, heard nothing → honest empty result
    const result = await pending;
    expect(result.transcript).toBe("");
    expect(result.speechDetected).toBe(false);
  });

  it("resolves the final transcript — exactly as the engine heard it", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const pending = recognizeSpeech({ languageHint: "en" });
    const rec = MockRecognition.instances[0];
    rec.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          length: 1,
          0: { transcript: "  what is the   paint coverage " },
        },
      ],
    });
    rec.onend?.();
    const result = await pending;
    expect(result.transcript).toBe("what is the paint coverage");
    expect(result.speechDetected).toBe(true);
    expect(result.language).toBe("en");
    expect(result.durationSec).not.toBeNull();
  });

  it("NEVER fabricates text when nothing was recognized", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const pending = recognizeSpeech();
    MockRecognition.instances[0].onend?.(); // ran, heard nothing
    const result = await pending;
    expect(result.transcript).toBe("");
    expect(result.speechDetected).toBe(false);
  });

  it("maps native permission denial to PERMISSION_DENIED", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const pending = recognizeSpeech();
    MockRecognition.instances[0].onerror?.({ error: "not-allowed" });
    await expect(pending).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("maps no-speech to NO_SPEECH — honest, not an error text", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const pending = recognizeSpeech();
    MockRecognition.instances[0].onerror?.({ error: "no-speech" });
    await expect(pending).rejects.toMatchObject({ code: "NO_SPEECH" });
  });

  it("voice-print: deterministic pitch math against the voice bank", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("AudioContext", MockAudioContext);
    const pending = recognizeSpeech({ bankPitchHz: 200 });
    const rec = MockRecognition.instances[0];
    // let the pitch sampler capture a couple of 200 Hz frames
    await vi.advanceTimersByTimeAsync(250);
    rec.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, length: 1, 0: { transcript: "status report" } },
      ],
    });
    rec.onend?.();
    const result = await pending;
    expect(result.speechDetected).toBe(true);
    expect(result.voicePrint).not.toBeNull();
    expect(result.voicePrint?.bankPitchHz).toBe(200);
    expect(result.voicePrint?.utterancePitchHz).toBeGreaterThan(150);
    expect(result.voicePrint?.utterancePitchHz).toBeLessThan(250);
    expect(result.voicePrint?.match).toBe(true); // within ±30%
  });

  it("voice-print: a far-off profile pitch reports match:false honestly", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("AudioContext", MockAudioContext);
    const pending = recognizeSpeech({ bankPitchHz: 800 });
    const rec = MockRecognition.instances[0];
    await vi.advanceTimersByTimeAsync(250);
    rec.onend?.();
    const result = await pending;
    expect(result.voicePrint?.match).toBe(false);
  });

  it("voice-print is null (honest) when pitch capture is unavailable", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    // no AudioContext → pitch cannot be computed
    const pending = recognizeSpeech({ bankPitchHz: 200 });
    const rec = MockRecognition.instances[0];
    rec.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, length: 1, 0: { transcript: "hello" } }],
    });
    rec.onend?.();
    const result = await pending;
    expect(result.transcript).toBe("hello");
    expect(result.voicePrint?.match).toBeNull();
  });
});

// ---------------------------------------------------------
// Audited intake — every real transcript is recorded
// ---------------------------------------------------------
describe("reportTranscription", () => {
  it("sends the native transcript for audited intake", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, audited: true },
      error: null,
    });
    await reportTranscription({
      transcript: "what is the paint coverage per litre",
      speechDetected: true,
      languageHint: "en",
      durationSec: 4.2,
    });
    expect(invokeMock).toHaveBeenCalledWith("archie-ears", {
      body: expect.objectContaining({
        transcript: "what is the paint coverage per litre",
        speech_detected: true,
        language_hint: "en",
      }),
    });
  });

  it("throws SERVICE_UNAVAILABLE when the audit intake is unreachable", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error("FunctionsHttpError: 502"),
    });
    await expect(
      reportTranscription({
        transcript: "x",
        speechDetected: true,
      }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("surfaces RATE_LIMITED / FORBIDDEN / REJECTED as typed errors", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, code: "RATE_LIMITED", error: "slow down" },
      error: null,
    });
    await expect(
      reportTranscription({ transcript: "x", speechDetected: true }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    invokeMock.mockResolvedValueOnce({
      data: { ok: false, code: "FORBIDDEN", error: "owner only" },
      error: null,
    });
    await expect(
      reportTranscription({ transcript: "x", speechDetected: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    invokeMock.mockResolvedValueOnce({
      data: { ok: false, code: "SOMETHING", error: "refused" },
      error: null,
    });
    try {
      await reportTranscription({ transcript: "x", speechDetected: true });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EarsError);
      expect((e as EarsError).code).toBe("REJECTED");
      expect((e as EarsError).message).toContain("refused");
    }
  });
});

// ---------------------------------------------------------
// Shared native core — normalization, language, voice print
// (the exact module the edge function imports)
// ---------------------------------------------------------
describe("native-engine/ears core", () => {
  it("normalizeTranscript cleans and collapses whitespace", () => {
    const r = normalizeTranscript("  hello   world \n again ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transcript).toBe("hello world again");
      expect(r.speechDetected).toBe(true);
    }
  });

  it("normalizeTranscript reports EMPTY honestly — never invents text", () => {
    expect(normalizeTranscript("   ").ok).toBe(false);
    expect(normalizeTranscript(null).ok).toBe(false);
  });

  it("normalizeTranscript caps absurd payloads", () => {
    const r = normalizeTranscript("a".repeat(EARS_MAX_TRANSCRIPT_CHARS + 5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TRANSCRIPT_TOO_LONG");
  });

  it("sanitizeLanguageHint accepts ISO codes and rejects garbage", () => {
    expect(sanitizeLanguageHint("en")).toBe("en");
    expect(sanitizeLanguageHint("en-NG")).toBe("en-NG");
    expect(sanitizeLanguageHint("English")).toBeNull();
    expect(sanitizeLanguageHint(42)).toBeNull();
  });

  it("voicePrintMatch is deterministic pitch math with honest nulls", () => {
    expect(voicePrintMatch(210, 200).match).toBe(true); // within ±30%
    expect(voicePrintMatch(400, 200).match).toBe(false); // far off
    expect(voicePrintMatch(null, 200).match).toBeNull();
    expect(voicePrintMatch(200, null).match).toBeNull();
    // deliberately generous tolerance — honest, not forensic
    expect(voicePrintMatch(259, 200).match).toBe(true); // +29.5%
    expect(voicePrintMatch(261, 200).match).toBe(false); // +30.5%
  });

  it("validateEarsIntake accepts an empty transcript as speech_detected:false", () => {
    const r = validateEarsIntake({ transcript: "" });
    expect(r.ok).toBe(true);
    expect(r.speechDetected).toBe(false);
    expect(r.transcript).toBe("");
  });

  it("validateEarsIntake rejects non-object bodies and oversized transcripts", () => {
    expect(validateEarsIntake(null).ok).toBe(false);
    expect(validateEarsIntake({ transcript: "a".repeat(3000) }).ok).toBe(false);
  });

  it("validateEarsIntake normalizes the voice-print payload defensively", () => {
    const r = validateEarsIntake({
      transcript: "hello",
      language_hint: "en-NG",
      duration_sec: 2.5,
      voice_print: { utterance_pitch_hz: 205, bank_pitch_hz: 200 },
    });
    expect(r.ok).toBe(true);
    expect(r.voicePrint?.match).toBe(true);
    expect(r.voicePrint?.bankPitchHz).toBe(200);
    expect(r.languageHint).toBe("en-NG");
    expect(r.durationSec).toBe(2.5);
  });
});
