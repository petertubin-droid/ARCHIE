# ARCHIE Advanced Voice Intelligence — Engineering Report

**Date:** 2026-09-13
**Scope:** The conversational voice interface on the ONE ARCHIE spine — owner directive "Advanced Voice Intelligence for ARCHIE".
**Status:** Implemented and verified — 7,750 tests passing, `tsc --noEmit` clean, production build clean.

---

## What was actually built

A genuinely functional conversational voice interface where **voice and text feed the SAME REAL cognitive engine** (`archie-core`). The previous fake on-device chat path (`generateFree`) was **removed** — every spoken and typed reply now comes from the actual engine.

```
MICROPHONE
  → EARS (native STT + audited intake — no provider, no key)
  → SPEAKER RECOGNITION (derived vectors only, server-side comparison)
  → LANGUAGE
  → COGNITIVE ENGINE (archie-core — the REAL intelligence)
  → AUTHORITY (unchanged: voice NEVER authorizes)
  → MOUTH (TTS, native prosody plan)
  → LISTEN AGAIN (continuous, genuine barge-in)
```

Nothing here is a second intelligence. The voice layer is an interface onto the existing cognitive pipeline.

## Component-by-component status (honest)

| Capability                                                       | Status         | Where                                                                                     |
| ---------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Native speech recognition (no provider, no API key)              | ✅ Implemented | `src/lib/archie/ears.ts`, `supabase/functions/_shared/archie-ai/native-engine/ears.ts`    |
| Audited intake for every utterance                               | ✅ Implemented | `archie-ears` edge → `frelux_archie_audit_events`                                         |
| Real conversational sessions (listen→hear→think→speak→listen)    | ✅ Implemented | `src/lib/archie/voice-session.ts`                                                         |
| Genuine barge-in (owner's speech silences ARCHIE mid-reply)      | ✅ Implemented | interim-speech hook → `silence()` → `INTERRUPTED` state                                   |
| Real interim transcripts surfaced in the UI                      | ✅ Implemented | `onHearing` → Assistant panel (`aria-live`)                                               |
| Honest bounded silence handling                                  | ✅ Implemented | `MAX_CONSECUTIVE_NO_SPEECH = 3`, then `timeout` stop — never an unbounded spin            |
| Voiceprint extraction (on-device, derived vector only)           | ✅ Implemented | `native-engine/voiceprint.ts`                                                             |
| Deliberate owner enrollment (3 samples, server-gated)            | ✅ Implemented | `archie-voice-enroll` edge, `frelux_archie_speaker_profile`                               |
| Server-side speaker comparison                                   | ✅ Implemented | edge compares derived vectors; result labeled a **similarity signal, NOT identity proof** |
| Enrollment UI (record / finalize / disable / re-enroll / delete) | ✅ Implemented | Assistant tab, `data-testid="archie-voice-enrollment"`                                    |
| Text path through the REAL engine                                | ✅ Implemented | `runEngineTurn` → `sendChatTurn` (archie-core)                                            |
| Voice path through the REAL engine                               | ✅ Implemented | session `think` port → `sendChatTurn`                                                     |
| Fake `generateFree` chat answers                                 | ❌ REMOVED     | deleted from `Assistant.tsx`                                                              |

## What is deliberately NOT implemented (honest limitations)

- **Raw audio upload for recognition** — never. Only derived feature vectors transit to the server for speaker comparison; speech-to-text stays on-device in the browser engine.
- **Voiceprint vectors stored in the database** — never. Vectors are compared server-side against the enrolled profile held in `frelux_archie_speaker_profile` (owner-only RLS); transcript text is never combined with the vector at rest.
- **Speaker recognition as authorization** — never. It is a statistical similarity hint for personalization only. Protected operations require the existing owner-authorization workflow regardless of who is speaking.
- **No cross-browser STT provider** — recognition uses the browser's native engine (`detectEarSupport()` gates honestly; unsupported devices get a clear refusal and full text parity).
- **Enrollment quality analysis (noise/speed feedback)** — samples are duration-gated (≥ 3 s) but there is no acoustic-quality scoring; a poor sample is refused only by duration and voiced-frame thresholds.

## Security model (unchanged spine, new interface)

1. **Consent first.** `VOICE_INPUT` / `VOICE_OUTPUT` consents gate everything; a duplicate session is refused (`SESSION_CONFLICT`) — never two microphones.
2. **Voice ≠ authority.** High-risk spoken phrases (deploy / approve / authorize / production change) are routed to the owner-authorization workflow, the buffer is purged, and the engine is never called. Voice can initiate an authorization; it can never complete one.
3. **Identification ≠ authorization.** The speaker-similarity signal personalizes responses; it unlocks nothing.
4. **Transcript hygiene.** `purgeTranscriptsForAuthorization` clears the voice buffer when an authorization workflow begins.
5. **Owner-gated edge.** `archie-voice-enroll` requires the owner's authenticated session, is rate-limited, and writes an audit event for every enrollment state change.

## Privacy

- Raw audio never leaves the device for recognition.
- Only derived voiceprint vectors transit, only to the owner-gated enrollment/verify edge.
- The enrollment table is owner-only (RLS); audit events record _what_ changed, never audio or vector contents.

## Anatomy registration

The `ears` subsystem row in `archie_subsystems` was updated (migration `20260918120000_archie_voice_intelligence_anatomy.sql`) to describe the full voice-intelligence layer, its code bindings, data bindings — with an audit event recording the change.

## Verification

- `src/lib/archie/__tests__/voice-session.test.ts` — 16 tests: consent/support/duplicate-session gates, full turn contract, empty-transcript refusal, audit-down resilience, engine-failure honesty, muted output, mute, voice-never-authorizes (3 phrases), barge-in, speaker-signal flow, failed-capture honesty.
- `src/lib/archie/__tests__/voice-enrollment.test.ts` — 10 tests: vector-only transit (no raw audio), server refusals, lifecycle controls, short-sample refusal.
- Full suite: **7,750 tests passing** (2 expected-fail = intentional todos), `tsc --noEmit` clean, production build clean.
