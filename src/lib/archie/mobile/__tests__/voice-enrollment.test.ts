// =========================================================
// ARCHIE MOBILE — VOICE ENROLLMENT (Phase 13)
//
// The contract under test:
//   * Raw audio NEVER leaves the device — only the derived
//     voiceprint vector is sent to the enrollment edge
//     function. Enrollment samples are deliberate: too-short
//     samples are refused, silence is refused.
//   * The enrollment server is the ONLY authority for status;
//     every action is a thin, honest client of the real edge
//     function. Failures surface as failures.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: async () => ({
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  }),
}));

const recordingMock = { stop: vi.fn() };
vi.mock("@/lib/archie/ears", () => ({
  startListening: (opts?: unknown) => {
    void opts;
    return Promise.resolve(recordingMock);
  },
}));

const extractMock = vi.fn();
vi.mock("@studio-shared/archie-ai/native-engine/voiceprint", () => ({
  extractVoiceprint: (...a: unknown[]) => extractMock(...a),
}));

import {
  ENROLL_MIN_DURATION_SEC,
  deleteEnrollment,
  disableEnrollment,
  enrollSample,
  fetchEnrollmentStatus,
  finalizeEnrollment,
  recordEnrollmentSample,
  resetEnrollment,
  verifySpeakerSignal,
} from "../voice-enrollment";

const VECTOR = { centroidHz: 220, spreadHz: 40 } as unknown as Parameters<
  typeof enrollSample
>[0];

function okData(over: Record<string, unknown> = {}) {
  return { data: { ok: true, ...over }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("edge-function client", () => {
  it("enrolls a sample vector and reports progress", async () => {
    invokeMock.mockResolvedValue(
      okData({ sample_count: 2, required_samples: 3 }),
    );
    const res = await enrollSample(VECTOR);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sample_count).toBe(2);
      expect(res.required_samples).toBe(3);
    }
    expect(invokeMock).toHaveBeenCalledWith("archie-voice-enroll", {
      body: { action: "enroll-sample", vector: VECTOR },
    });
  });

  it("finalizes with the server threshold and defaults honestly", async () => {
    invokeMock.mockResolvedValue(okData({ sample_count: 3, threshold: 0.81 }));
    expect(await finalizeEnrollment()).toEqual({
      ok: true,
      sample_count: 3,
      threshold: 0.81,
    });

    invokeMock.mockResolvedValue(okData({})); // server sent no counts
    const defaulted = await finalizeEnrollment();
    expect(defaulted.ok).toBe(true);
    if (defaulted.ok) expect(defaulted.sample_count).toBe(0);
  });

  it("surfaces enrollment refusals as failures", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: "Not the owner" },
      error: null,
    });
    const res = await enrollSample(VECTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Not the owner/i);
  });

  it("surfaces transport errors as failures", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "network down" },
    });
    const res = await enrollSample(VECTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/network down/i);
  });

  it("status returns the server's enrollment state, null when unavailable", async () => {
    invokeMock.mockResolvedValue(
      okData({
        enrollment_state: "ENROLLING",
        sample_count: 1,
        required_samples: 3,
        threshold: 0.72,
        security_label: "biometric-opt-in",
      }),
    );
    const status = await fetchEnrollmentStatus();
    expect(status).not.toBeNull();
    expect(status!.enrollment_state).toBe("ENROLLING");
    expect(status!.security_label).toBe("biometric-opt-in");

    invokeMock.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await fetchEnrollmentStatus()).toBeNull();
  });

  it("status never carries vector data — counts and labels only", async () => {
    invokeMock.mockResolvedValue(
      okData({
        enrollment_state: "COMPLETE",
        sample_count: 3,
        required_samples: 3,
        threshold: 0.72,
        security_label: "enrolled",
      }),
    );
    const status = await fetchEnrollmentStatus();
    expect(JSON.stringify(status)).not.toMatch(/vector|pcm|centroid/i);
  });

  it("verify returns the server's speaker signal or null", async () => {
    invokeMock.mockResolvedValue(
      okData({
        speaker: {
          determinable: true,
          match: true,
          score: 0.9,
          security_label: "owner",
        },
      }),
    );
    const signal = await verifySpeakerSignal(VECTOR);
    expect(signal).not.toBeNull();
    expect(signal!.match).toBe(true);

    invokeMock.mockResolvedValue(okData({})); // no speaker field
    expect(await verifySpeakerSignal(VECTOR)).toBeNull();
  });

  it("disable / re-enroll / delete are owner actions with boolean outcomes", async () => {
    expect(await disableEnrollment()).toBe(true);
    invokeMock.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await disableEnrollment()).toBe(false);
    expect(await resetEnrollment()).toBe(false);
    invokeMock.mockResolvedValue(okData());
    expect(await resetEnrollment()).toBe(true);
    expect(await deleteEnrollment()).toBe(true);
    // Each action reaches the real edge function with its own verb.
    const actions = invokeMock.mock.calls.map(
      (c) => (c[1] as { body: { action: string } }).body.action,
    );
    expect(actions).toContain("disable");
    expect(actions).toContain("re-enroll");
    expect(actions).toContain("delete");
  });
});

describe("recordEnrollmentSample — on-device processing", () => {
  it("refuses samples shorter than the deliberate minimum", async () => {
    recordingMock.stop.mockResolvedValueOnce({
      blob: new Blob(["x"]),
      durationSec: 1.2,
      capped: false,
    });
    const res = await recordEnrollmentSample();
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toMatch(
        new RegExp(`at least ${ENROLL_MIN_DURATION_SEC} seconds`),
      );
  });

  it("refuses honestly when the device cannot decode audio", async () => {
    recordingMock.stop.mockResolvedValueOnce({
      blob: new Blob(["x"]),
      durationSec: 5,
      capped: false,
    });
    // jsdom has no real AudioContext — the decode path must
    // refuse rather than pretend the sample was analyzed.
    const res = await recordEnrollmentSample();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/could not be analyzed/i);
  });

  it("extracts the voiceprint ON-DEVICE and refuses silence", async () => {
    recordingMock.stop.mockResolvedValue({
      blob: new Blob(["x"]),
      durationSec: 5,
      capped: false,
    });
    // Provide a fake decode pipeline so extraction is reached.
    const pcm = new Float32Array(16000);
    const g = globalThis as unknown as Record<string, unknown>;
    // A constructor whose instances expose the decode pipeline.
    g.AudioContext = function FakeAudioContext() {
      return {
        decodeAudioData: async () => ({
          length: pcm.length,
          numberOfChannels: 1,
          sampleRate: 16000,
          getChannelData: () => pcm,
        }),
        close: async () => {},
      };
    } as unknown as { new (): never };

    extractMock.mockReturnValueOnce({ ok: false, code: "SILENCE" });
    const silent = await recordEnrollmentSample();
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.error).toMatch(/No clear speech/i);

    extractMock.mockReturnValueOnce({ ok: false, code: "TOO_SHORT" });
    const short = await recordEnrollmentSample();
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toMatch(/too short/i);

    const vector = { centroidHz: 210, spreadHz: 35 };
    extractMock.mockReturnValueOnce({ ok: true, vector });
    const good = await recordEnrollmentSample();
    expect(good.ok).toBe(true);
    if (good.ok) {
      // The vector — not the raw audio — is what leaves the device.
      expect(good.vector).toEqual(vector);
      expect(good.durationSec).toBe(5);
    }
    // The extraction ran on device with decoded PCM + sample rate.
    expect(extractMock).toHaveBeenCalledWith(pcm, 16000);
    delete g.AudioContext;
  });

  it("reports recording failures honestly", async () => {
    recordingMock.stop.mockRejectedValueOnce(new Error("mic busy"));
    const res = await recordEnrollmentSample();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/mic busy/i);
  });
});
