// =========================================================
// ARCHIE VOICE SESSION — CONVERSATIONAL PIPELINE TESTS
// src/lib/archie/__tests__/voice-session.test.ts
//
// The voice conversation loop, verified end to end with
// injected ports (the SAME pipeline code the real session
// uses — only the edges are faked):
//
//   LISTEN → HEAR (interim) → AUDIT → SPEAKER SIGNAL →
//   THINK (REAL archie-core contract) → SPEAK → LISTEN
//
//   * consent / support / duplicate-session refusals
//   * an empty transcript NEVER reaches the engine
//   * HIGH-RISK spoken phrases route to the owner-authorization
//     workflow and never execute — voice ≠ authority
//   * barge-in: the owner's speech silences ARCHIE instantly
//   * every failure is typed and honest
// =========================================================
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createVoiceSession,
  DEFAULT_VOICE_SESSION_CONFIG,
  MAX_CONSECUTIVE_NO_SPEECH,
  voiceSessionActive,
  type VoiceSessionConfig,
  type VoiceSessionEvents,
  type VoiceSessionPorts,
  type VoiceSessionState,
  type SpeakerStatus,
} from "../voice-session";
import type { ArchieConsent } from "../mobile/types";

// ---------------------------------------------------------
// Fixtures
// ---------------------------------------------------------
const grantedInput = (on = true): ArchieConsent => ({
  capability: "VOICE_INPUT",
  granted: on,
  granted_at: on ? "2026-09-13T00:00:00Z" : null,
});
const grantedOutput = (on = true): ArchieConsent => ({
  capability: "VOICE_OUTPUT",
  granted: on,
  granted_at: on ? "2026-09-13T00:00:00Z" : null,
});

function baseConfig(
  over: Partial<VoiceSessionConfig> = {},
): VoiceSessionConfig {
  return {
    voiceInputConsent: grantedInput(),
    voiceOutputConsent: grantedOutput(),
    ...DEFAULT_VOICE_SESSION_CONFIG,
    conversationId: "conv-1",
    history: () => [{ role: "owner", content: "hello" }],
    ...over,
  };
}

/** Drivable fake for the ears port. Queue transcripts; the
 *  last entry repeats. onInterim is captured for barge-in. */
function fakeRecognize(transcripts: string[]) {
  const calls: Array<Record<string, unknown>> = [];
  let i = 0;
  const fn = (async (opts?: {
    onInterim?: (t: string) => void;
    languageHint?: string | null;
  }) => {
    calls.push({ ...(opts ?? {}) });
    const t = transcripts[Math.min(i, transcripts.length - 1)];
    i++;
    if (t === "__NO_SPEECH__") {
      return {
        transcript: "",
        language: "en",
        durationSec: 2,
        speechDetected: false,
        voicePrint: null,
      };
    }
    return {
      transcript: t,
      language: opts?.languageHint ?? "en",
      durationSec: 3,
      speechDetected: true,
      voicePrint: null,
    };
  }) as VoiceSessionPorts["recognize"];
  return { fn, calls };
}

function fakePorts(over: Partial<VoiceSessionPorts> = {}) {
  const silence = vi.fn();
  const ports: VoiceSessionPorts = {
    supported: () => true,
    recognize: undefined, // set by caller
    record: (async () => ({
      stop: async () => ({
        blob: new Blob(["x"]),
        durationSec: 3,
        capped: false,
      }),
      cancel: () => undefined,
    })) as unknown as VoiceSessionPorts["record"],
    decodeBlob: async () => null, // speaker vector path is optional
    audit: vi.fn(async () => undefined),
    think: vi.fn(async () => ({
      ok: true as const,
      reply: "The material requirement is 42 bags of cement.",
    })),
    speak: vi.fn(() => ({ ok: true, chunks: 2 })),
    silence,
    ...over,
  };
  return { ports, silence };
}

interface EventLog {
  states: VoiceSessionState[];
  errors: Array<{ kind: string; message: string }>;
  replies: Array<{ text: string; spoken: boolean }>;
  auth: string[];
  transcripts: Array<{ transcript: string; speaker: SpeakerStatus | null }>;
  hearing: string[];
}

function collect(): { log: EventLog; events: VoiceSessionEvents } {
  const log: EventLog = {
    states: [],
    errors: [],
    replies: [],
    auth: [],
    transcripts: [],
    hearing: [],
  };
  return {
    log,
    events: {
      onState: (s) => log.states.push(s),
      onError: (kind, message) => log.errors.push({ kind, message }),
      onArchieReply: (text, spoken) => log.replies.push({ text, spoken }),
      onAuthorizationRequired: (t) => log.auth.push(t),
      onUserTranscript: (t) => log.transcripts.push(t),
      onHearing: (t) => log.hearing.push(t),
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 8) {
  for (let i = 0; i < n; i++) await tick();
}

let activeCleanup: (() => void) | null = null;
afterEach(async () => {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  await settle(4);
});

// ---------------------------------------------------------
// Structural gates — before anything touches the microphone
// ---------------------------------------------------------
describe("session creation gates", () => {
  it("REFUSES to start without the VOICE_INPUT consent", async () => {
    const res = await createVoiceSession(
      baseConfig({ voiceInputConsent: grantedInput(false) }),
      collect().events,
      fakePorts().ports,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("PERMISSION_DENIED");
      expect(res.message).toContain("VOICE_INPUT");
    }
    expect(voiceSessionActive()).toBe(false);
  });

  it("REFUSES on unsupported browsers — honestly, text stays available", async () => {
    const res = await createVoiceSession(baseConfig(), collect().events, {
      ...fakePorts().ports,
      supported: () => false,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("UNSUPPORTED");
      expect(res.message).toContain("not supported");
    }
  });

  it("REFUSES a duplicate session — never two microphones at once", async () => {
    const rec = fakeRecognize(["__NO_SPEECH__"]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { events: ev } = collect();
    const first = await createVoiceSession(baseConfig(), ev, ports);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    activeCleanup = () => first.session.stop("manual");
    const second = await createVoiceSession(baseConfig(), ev, ports);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.kind).toBe("SESSION_CONFLICT");
    first.session.stop("manual");
    activeCleanup = null;
    await settle();
    // cleared: a new session may start
    const third = await createVoiceSession(baseConfig(), ev, ports);
    expect(third.ok).toBe(true);
    if (third.ok) third.session.stop("manual");
  });
});

// ---------------------------------------------------------
// One real conversational turn
// ---------------------------------------------------------
describe("a full conversational turn", () => {
  it("LISTEN → HEAR → AUDIT → THINK (REAL engine contract) → SPEAK, then re-listens in continuous mode", async () => {
    const rec = fakeRecognize([
      "ARCHIE, what is your current status?",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports, silence } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { session } = created;
    activeCleanup = () => session.stop("manual");

    await session.start();
    await settle(12);

    // the real transcript reached the engine with the full contract
    const think = ports.think as ReturnType<typeof vi.fn>;
    expect(think).toHaveBeenCalledTimes(1);
    const call = think.mock.calls[0][0];
    expect(call.conversationId).toBe("conv-1");
    expect(call.message).toBe("ARCHIE, what is your current status?");
    expect(call.history).toEqual([{ role: "owner", content: "hello" }]);
    expect(call.language).toEqual({
      language_code: "en",
      source: "USER_SELECTION",
    });

    // audited intake carried the real transcript
    const audit = ports.audit as ReturnType<typeof vi.fn>;
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0].transcript).toBe(
      "ARCHIE, what is your current status?",
    );
    expect(audit.mock.calls[0][0].speechDetected).toBe(true);

    // the reply came from the engine and was SPOKEN
    expect(events.replies).toEqual([
      { text: "The material requirement is 42 bags of cement.", spoken: true },
    ]);
    expect(ports.speak).toHaveBeenCalledWith(
      "The material requirement is 42 bags of cement.",
      baseConfig().voiceOutputConsent,
    );

    // full state sequence: listening → processing → thinking → speaking → back to listening
    expect(events.states).toContain("LISTENING");
    expect(events.states).toContain("PROCESSING");
    expect(events.states).toContain("THINKING");
    expect(events.states).toContain("SPEAKING");
    // continuous: LISTENING re-armed after SPEAKING
    expect(
      events.states.indexOf("LISTENING", events.states.indexOf("SPEAKING")),
    ).toBeGreaterThan(events.states.indexOf("SPEAKING"));

    // bounded silence retries → honest timeout stop
    expect(events.states[events.states.length - 1]).toBe("STOPPED");
    expect(silence).toHaveBeenCalled();
  });

  it("single-shot mode stops after one turn", async () => {
    const rec = fakeRecognize(["what is one plus one"]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(
      baseConfig({ continuous: false }),
      ev,
      ports,
    );
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(10);
    expect(events.states[events.states.length - 1]).toBe("STOPPED");
    expect(events.states.filter((s) => s === "LISTENING").length).toBe(1);
  });
});

// ---------------------------------------------------------
// Honesty boundaries
// ---------------------------------------------------------
describe("honesty boundaries", () => {
  it("an EMPTY transcript NEVER reaches the engine — and bounded retries stop the session honestly", async () => {
    const rec = fakeRecognize([
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(16);

    expect(ports.think).not.toHaveBeenCalled();
    expect(events.errors.some((e) => e.kind === "NO_SPEECH")).toBe(true);
    expect(events.states[events.states.length - 1]).toBe("STOPPED");
    // bounded: exactly MAX_CONSECUTIVE_NO_SPEECH recognitions, never a spin
    expect(rec.calls.length).toBe(MAX_CONSECUTIVE_NO_SPEECH);
  });

  it("the audit being down does NOT fake a lost request — the real turn continues", async () => {
    const rec = fakeRecognize([
      "what is your status",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({
      recognize: rec.fn,
      audit: vi.fn(async () => {
        throw new Error("audit down");
      }),
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(12);
    expect(events.errors.some((e) => e.kind === "AUDIT_UNAVAILABLE")).toBe(
      true,
    );
    expect(ports.think).toHaveBeenCalledTimes(1); // turn continued
    expect(events.replies.length).toBe(1);
  });

  it("an engine failure is reported honestly and the session continues", async () => {
    const rec = fakeRecognize([
      "what is your status",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({
      recognize: rec.fn,
      think: vi.fn(async () => ({ ok: false, error: "core unreachable" })),
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(12);
    expect(events.errors.some((e) => e.kind === "ENGINE_UNREACHABLE")).toBe(
      true,
    );
    expect(events.replies.length).toBe(0); // NO fabricated success
  });

  it("with VOICE_OUTPUT off the reply is text-only — no fabricated speech", async () => {
    const rec = fakeRecognize(["what is your status"]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(
      baseConfig({
        voiceOutputConsent: grantedOutput(false),
        continuous: false,
      }),
      ev,
      ports,
    );
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(10);
    expect(events.replies).toEqual([
      { text: "The material requirement is 42 bags of cement.", spoken: false },
    ]);
    expect(ports.speak).not.toHaveBeenCalled();
  });

  it("mute silences ARCHIE while the conversation continues", async () => {
    const rec = fakeRecognize([
      "first question",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    created.session.mute();
    await created.session.start();
    await settle(12);
    expect(ports.speak).not.toHaveBeenCalled();
    expect(events.replies[0]?.spoken).toBe(false);
  });
});

// ---------------------------------------------------------
// SECURITY: voice ≠ authority
// ---------------------------------------------------------
describe("voice NEVER authorizes protected operations", () => {
  it.each([
    ["ARCHIE, deploy this to production", "deploy"],
    ["ARCHIE, approve the production change", "approve"],
    ["ARCHIE, authorize the database deletion", "authoriz"],
  ])(
    "routes %j to the owner-authorization workflow — the engine is NEVER called",
    async (phrase) => {
      const rec = fakeRecognize([phrase]);
      const { ports } = fakePorts({ recognize: rec.fn });
      const { log: events, events: ev } = collect();
      const created = await createVoiceSession(baseConfig(), ev, ports);
      if (!created.ok) throw new Error("creation failed");
      activeCleanup = () => created.session.stop("manual");

      // seed the transcript buffer, then fire the high-risk phrase
      created.session.transcriptBuffer.push("earlier benign utterance");
      await created.session.start();
      await settle(8);

      expect(ports.think).not.toHaveBeenCalled(); // NO execution
      expect(events.auth).toEqual([phrase]); // workflow took over
      expect(created.session.transcriptBuffer.length).toBe(0); // purged
    },
  );
});

// ---------------------------------------------------------
// BARGE-IN
// ---------------------------------------------------------
describe("barge-in: the owner's voice takes priority", () => {
  it("REAL interim speech while ARCHIE speaks silences it instantly and becomes the new request", async () => {
    let turn = 0;
    const interimCalls: Array<(t: string) => void> = [];
    const recognize = (async (opts?: { onInterim?: (t: string) => void }) => {
      if (opts?.onInterim) interimCalls.push(opts.onInterim);
      turn++;
      if (turn === 1) {
        return {
          transcript: "ARCHIE, what is your current status",
          language: "en",
          durationSec: 3,
          speechDetected: true,
          voicePrint: null,
        };
      }
      if (turn === 2) {
        // the owner barges in mid-reply: fire the REAL interim
        // hook the session registered, then deliver the final
        opts?.onInterim?.("stop, what about the");
        return {
          transcript: "stop, what about the cost",
          language: "en",
          durationSec: 2,
          speechDetected: true,
          voicePrint: null,
        };
      }
      return {
        transcript: "",
        language: "en",
        durationSec: 1,
        speechDetected: false,
        voicePrint: null,
      };
    }) as VoiceSessionPorts["recognize"];
    // the scenario is genuinely mid-reply: ARCHIE's speech
    // is playing when the owner barges in
    const { ports, silence } = fakePorts({
      recognize,
      speechActive: () => true,
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(6); // first turn processed, ARCHIE speaking

    // barge-in happened during the second recognition:
    expect(silence.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(events.states).toContain("INTERRUPTED");
    expect(events.hearing).toContain("stop, what about the");

    await settle(10); // second request processed
    const think = ports.think as ReturnType<typeof vi.fn>;
    expect(think).toHaveBeenCalledTimes(2);
    expect(think.mock.calls[1][0].message).toBe("stop, what about the cost");
    // the interrupted reply was re-shown and re-spoken for the NEW request
    expect(events.replies.length).toBe(2);
  });
});

// ---------------------------------------------------------
// Speaker signal flows through (personalization, NOT authority)
// ---------------------------------------------------------
describe("speaker recognition signal", () => {
  it("carries the server-side speaker signal to the turn — labeled as a signal, never authority", async () => {
    const vector = {
      features: [120, 0.1, 0.9, 0.02, 900, 600, 0.05, 3],
      voicedFrames: 40,
      sampleRate: 22050,
      durationSec: 3,
    };
    const rec = fakeRecognize([
      "hello ARCHIE",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({
      recognize: rec.fn,
      decodeBlob: async () => ({
        pcm: new Float32Array(1000),
        sampleRate: 22050,
      }),
      extractVector: () => ({ ok: true, vector }),
      speakerCheck: vi.fn(async () => ({
        determinable: true,
        match: true,
        score: 0.91,
        security_label:
          "statistical speaker-similarity signal — NOT cryptographic proof of identity",
      })),
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(12);

    expect(events.transcripts.length).toBe(1);
    const speaker = events.transcripts[0].speaker;
    expect(speaker).not.toBeNull();
    expect(speaker!.match).toBe(true);
    expect(speaker!.score).toBe(0.91);
    expect(speaker!.securityLabel).toContain("NOT cryptographic proof");
    // the speaker signal did NOT grant anything: the engine turn
    // carried the transcript, and only the transcript
    const think = ports.think as ReturnType<typeof vi.fn>;
    expect(think.mock.calls[0][0].message).toBe("hello ARCHIE");
  });

  it("a failed vector capture is an honest null — no fabricated identity", async () => {
    const rec = fakeRecognize([
      "hello again",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({
      recognize: rec.fn,
      decodeBlob: async () => null,
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(12);
    expect(events.transcripts[0].speaker).toBeNull();
    expect(ports.think).toHaveBeenCalledTimes(1);
  });
});

// =========================================================
// BATCH 17 (Level 13) — fixes 53-55: honest barge-in state,
// mute never kills a continuous session, no zombie after
// authorization routing.
// =========================================================
describe("batch 17 — fix 53: INTERRUPTED only on genuine barge-in", () => {
  it("a new utterance after the reply FINISHED is a normal turn — no false INTERRUPTED", async () => {
    let turn = 0;
    const recognize = (async (opts?: { onInterim?: (t: string) => void }) => {
      turn++;
      if (turn === 2) opts?.onInterim?.("next question please");
      if (turn >= 3) {
        // bounded: silence after the two real turns ends the
        // session via the honest no-speech streak
        return {
          transcript: "",
          language: "en",
          durationSec: 1,
          speechDetected: false,
          voicePrint: null,
        };
      }
      return {
        transcript: turn === 1 ? "first question" : "next question please",
        language: "en",
        durationSec: 2,
        speechDetected: true,
        voicePrint: null,
      };
    }) as VoiceSessionPorts["recognize"];
    const { ports } = fakePorts({
      recognize,
      speechActive: () => false, // reply already finished playing
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(10);
    expect(events.states).not.toContain("INTERRUPTED");
    expect(events.replies.length).toBe(2); // both turns answered
  });

  it("wasSpeaking arms only when speakable units were actually queued", async () => {
    const rec = fakeRecognize(["hello there"]);
    const { ports } = fakePorts({
      recognize: rec.fn,
      speechActive: () => true,
      speak: () => ({ ok: true, chunks: 0 }), // empty plan
    });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(
      baseConfig({ continuous: false }),
      ev,
      ports,
    );
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    await created.session.start();
    await settle(8);
    // chunks=0: nothing was ever playing — no INTERRUPTED-able
    // state ever armed (verified by the absence of a stale flag
    // path: the session ends cleanly after one turn).
    expect(events.replies.length).toBe(1);
    expect(events.states).toContain("STOPPED");
  });
});

describe("batch 17 — fix 54: mute silences ARCHIE, never the conversation", () => {
  it("continuous mode keeps listening after a muted reply", async () => {
    const rec = fakeRecognize([
      "question one",
      "question two",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
      "__NO_SPEECH__",
    ]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    activeCleanup = () => created.session.stop("manual");
    created.session.mute();
    await created.session.start();
    await settle(14);
    expect(ports.speak).not.toHaveBeenCalled();
    // BOTH questions answered as text — the loop re-armed
    // after the muted reply instead of dying (the old bug
    // returned out of the loop after the first muted turn)
    expect(events.replies.length).toBe(2);
    expect(events.replies.every((r) => r.spoken === false)).toBe(true);
  });
});

describe("batch 17 — fix 55: authorization routing never leaves a zombie session", () => {
  it("after a HIGH-RISK phrase the session is STOPPED — a new session may start", async () => {
    const rec = fakeRecognize(["ARCHIE, deploy this to production"]);
    const { ports } = fakePorts({ recognize: rec.fn });
    const { log: events, events: ev } = collect();
    const created = await createVoiceSession(baseConfig(), ev, ports);
    if (!created.ok) throw new Error("creation failed");
    await created.session.start();
    await settle(8);
    expect(ports.think).not.toHaveBeenCalled();
    expect(events.auth).toEqual(["ARCHIE, deploy this to production"]);
    // the session ended cleanly — no SESSION_CONFLICT zombie
    expect(events.states).toContain("STOPPED");
    expect(voiceSessionActive()).toBe(false);
    // a fresh session can actually start afterwards
    const rec2 = fakeRecognize(["status check"]);
    const { ports: ports2 } = fakePorts({ recognize: rec2.fn });
    const second = await createVoiceSession(baseConfig(), ev, ports2);
    expect(second.ok).toBe(true);
    if (second.ok) second.session.stop("manual");
  });
});
