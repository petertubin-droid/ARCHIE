// =========================================================
// ARCHIE VOICE INTELLIGENCE — OWNER ENROLLMENT (CLIENT) TESTS
// src/lib/archie/__tests__/voice-enrollment.test.ts
//
// The deliberate owner voice-enrollment flow, verified:
//   * enroll / finalize / status / verify / disable / delete
//     contract with the archie-voice-enroll edge
//   * PRIVACY: only the derived vector transits — raw audio
//     is NEVER uploaded for recognition
//   * short / silent samples refuse honestly — nothing is
//     enrolled from unusable audio
//   * server refusals (too few samples, already enrolled)
//     surface as typed failures, never fake success
// =========================================================
import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(async () => ({
    functions: { invoke },
  })),
  isSupabaseConfigured: true,
}));

import {
  deleteEnrollment,
  disableEnrollment,
  enrollSample,
  fetchEnrollmentStatus,
  finalizeEnrollment,
  recordEnrollmentSample,
  verifySpeakerSignal,
  ENROLL_MIN_DURATION_SEC,
} from "../mobile/voice-enrollment";
import type { VoiceprintVector } from "@studio-shared/archie-ai/native-engine/voiceprint";

const vector: VoiceprintVector = {
  features: [120, 0.1, 0.9, 0.02, 900, 600, 0.05, 3],
  voicedFrames: 40,
  sampleRate: 22050,
  durationSec: 4,
};

function edge(body: Record<string, unknown>) {
  invoke.mockResolvedValueOnce({ data: { ok: true, ...body }, error: null });
}

beforeEach(() => {
  invoke.mockReset();
});

describe("enrollSample", () => {
  it("sends ONLY the derived vector — never raw audio", async () => {
    edge({
      enrollment_state: "ENROLLING",
      sample_count: 1,
      required_samples: 3,
    });
    const res = await enrollSample(vector);
    expect(res.ok).toBe(true);
    const payload = invoke.mock.calls[0][1].body;
    expect(payload.action).toBe("enroll-sample");
    expect(payload.vector.features).toEqual(vector.features);
    // no audio blob, no PCM, no bytes ever in the payload
    expect(JSON.stringify(payload)).not.toMatch(/blob|pcm|audiobuffer/i);
  });

  it("surfaces a server refusal honestly (already enrolled)", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        code: "ALREADY_ENROLLED",
        error: "Voice profile is complete.",
      },
      error: null,
    });
    const res = await enrollSample(vector);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("complete");
  });
});

describe("finalizeEnrollment", () => {
  it("completes only through the server's deliberate-sample gate", async () => {
    edge({ enrollment_state: "COMPLETE", sample_count: 3, threshold: 0.72 });
    const res = await finalizeEnrollment();
    expect(res.ok).toBe(true);
    expect(invoke.mock.calls[0][1].body.action).toBe("finalize");
  });

  it("reports TOO_FEW_SAMPLES as an honest failure", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        code: "TOO_FEW_SAMPLES",
        error: "Enrollment needs at least 3 deliberate samples (have 2).",
      },
      error: null,
    });
    const res = await finalizeEnrollment();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("3");
  });
});

describe("fetchEnrollmentStatus", () => {
  it("returns the live enrollment state (no vector data)", async () => {
    edge({
      enrollment_state: "COMPLETE",
      sample_count: 3,
      required_samples: 3,
      threshold: 0.72,
      security_label: "signal",
    });
    const status = await fetchEnrollmentStatus();
    expect(status?.enrollment_state).toBe("COMPLETE");
    expect(status?.sample_count).toBe(3);
    expect(invoke.mock.calls[0][1].body.action).toBe("status");
  });

  it("returns null on edge failure — never a guessed status", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false }, error: null });
    expect(await fetchEnrollmentStatus()).toBeNull();
  });
});

describe("verifySpeakerSignal", () => {
  it("carries the SERVER-side speaker decision (never client-forged)", async () => {
    edge({
      enrollment_state: "COMPLETE",
      speaker: {
        determinable: true,
        match: false,
        score: 0.4,
        security_label: "statistical signal",
      },
    });
    const signal = await verifySpeakerSignal(vector);
    expect(signal).not.toBeNull();
    expect(signal!.match).toBe(false);
    expect(signal!.score).toBe(0.4);
    expect(invoke.mock.calls[0][1].body.action).toBe("verify");
  });

  it("returns null when the edge cannot verify — no fabricated identity", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false }, error: null });
    expect(await verifySpeakerSignal(vector)).toBeNull();
  });
});

describe("lifecycle controls", () => {
  it("disable / reset / delete all flow through the owner-gated edge", async () => {
    edge({ enrollment_state: "DISABLED" });
    expect(await disableEnrollment()).toBe(true);
    edge({ enrollment_state: "NONE" });
    expect(await verifyLifecycleReset()).toBe(true);
    edge({ enrollment_state: "NONE" });
    expect(await deleteEnrollment()).toBe(true);
  });

  async function verifyLifecycleReset() {
    const { resetEnrollment } = await import("../mobile/voice-enrollment");
    return resetEnrollment();
  }
});

describe("recordEnrollmentSample", () => {
  it("REFUSES a too-short sample — nothing is enrolled from unusable audio", async () => {
    // fake ears.startListening: resolves a 1-second recording
    const ears = await import("../ears");
    vi.spyOn(ears, "startListening").mockResolvedValueOnce({
      stop: async () => ({
        blob: new Blob(["x"]),
        durationSec: 1,
        capped: false,
      }),
      cancel: () => undefined,
    } as Awaited<ReturnType<typeof ears.startListening>>);
    const res = await recordEnrollmentSample();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("too short");
    expect(ENROLL_MIN_DURATION_SEC).toBe(3);
    // nothing reached the edge
    expect(invoke).not.toHaveBeenCalled();
  });
});
