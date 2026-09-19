# ARCHIE Mobile & Secure Data Protection (Phase 8b)

ARCHIE Mobile is FRELUX's on-device assistant surface. It complements — never
bypasses — Android's normal permission/security model. Every capability is
**explicit, consented, observable, and revocable**. The phone is never the only
copy of protected information.

## The four ARCHIE rules

1. **Never silent** — no device capability is accessed without an explicit,
   recorded consent. All free capabilities default to **OFF**.
2. **Never assume paid** — paid services are **DISABLED BY DEFAULT**. ARCHIE
   never silently consumes paid services; activation is a deliberate user act.
3. **Never unverified** — production changes require server-side **owner
   authorization** (PBKDF2-hashed secret, constant-time verify, full audit
   trail: before/after state, versions, tests flag, rollback reference).
4. **Never the only copy** — user-selected data is encrypted client-side
   (AES-GCM, WebCrypto) and backed up to a private, owner-scoped storage
   bucket. Stolen or lost phone ≠ lost data.

## Capability model

Free capabilities (`src/lib/archie/mobile/capabilities.ts`): microphone,
camera, contacts, calendar, location, notifications, clipboard, storage — each
individually consented in `frelux_archie_mobile_consents` (RLS owner-only).
Android's own permission dialogs are always requested in addition.

Paid capabilities (`paid-services.ts`): `document-intelligence`,
`regional-intelligence`, `project-intelligence` — activation state persisted
in `frelux_archie_paid_capabilities` with explicit `activated_at` provenance.
A paid capability without an active entitlement is never invoked.

## Session & security events

- Device sessions (`frelux_security_sessions`): fingerprinted devices can be
  revoked — a stolen phone loses access even with a valid login.
- Security events (`frelux_security_events`): new device, session revoked,
  vault recovery, failed owner-auth attempts — surfaced as in-app
  notifications with mark-as-read.

## Protected vault

`vault.ts`: user explicitly selects data → AES-GCM encrypted client-side →
ciphertext-only upload to the private `archie-protected` bucket under
`{user_id}/{item_id}/v{n}` with version history. Storage policies are
owner-scoped (`storage.foldername(name)[1] = auth.uid()`). Recovery is
passphrase-authenticated and event-logged.

## Owner authorization (server-side)

`supabase/functions/archie-owner-auth` (JWT required):

- Secret arrives once over HTTPS → PBKDF2 (310k iterations) hash only.
  The plaintext is **never stored, echoed, or logged** — the live table
  `frelux_owner_credentials` has **no RLS policy at all** (service-role only).
- Every authorization records: authenticated owner identity, before/after
  state, current & proposed versions, tests flag, rollback reference
  (`frelux_owner_authorizations`).
- Failures are rate-limited and recorded as security events.

## Database (migration 20260908150000_phase8b_archie_mobile_security.sql)

8 tables, all RLS-enabled, owner-scoped (`user_id = auth.uid()`):
`frelux_archie_mobile_consents`, `frelux_archie_paid_capabilities`,
`frelux_security_sessions`, `frelux_security_events`,
`frelux_protected_items`, `frelux_protected_item_versions`,
`frelux_owner_authorizations`, `frelux_owner_credentials`.
Plus the private `archie-protected` storage bucket with owner-scoped
upload/read/delete policies.

**Deployed live 2026-09-08** — all tables verified `rowsecurity = true`;
credential table verified policy-free.

## UI

`/assistant` (Assistant.tsx, mobile-first): four tabs — Assistant,
Capabilities (consent switches), Security (paid capabilities, devices &
sessions, security feed, owner authorization), Vault (explicit data
selection + protection + recovery). Uses the golden crown icon for premium
features (no text labels).

## Tests

- `mobile-crypto.test.ts` — AES-GCM round-trips, PBKDF2 derivation, key
  non-determinism, tamper rejection.
- `mobile-security.test.ts` — consent lifecycle, session
  registration/revocation, security events, paid-capability default-off
  guarantees, owner-authorization audit records.
- `Assistant.test.tsx` — UI: consent switches default OFF, paid capabilities
  OFF by default, revoked-device handling, vault selection flow, owner-auth
  verification copy.

Full regression: **5,650 tests / 615 files green**, production build green.

## ARCHIE's voice (Phase 8c, 2026-09-08)

`voice.ts` — ARCHIE speaks its responses aloud through the browser's native
`speechSynthesis` engine:

- **Consent-gated at the library level**: `speakArchie()` refuses to speak
  without an explicitly granted `VOICE_OUTPUT` consent (a new free
  capability, default OFF — same registry, same switch UI).
- **No provider, no keys, no cost**: browser-native TTS only; output-only
  (nothing is recorded or uploaded; `VOICE_INPUT` remains the separate,
  consented input path).
- **Never speaks junk**: emoji, markdown syntax and raw URLs are stripped
  (`speakableText`); long replies are chunked at sentence/word boundaries
  (max 220 chars, never mid-word) for engines that cut long utterances.
- **Silent on new input**: `stopArchieVoice()` fires whenever the user sends
  a new message or starts voice input — ARCHIE stops talking the moment you
  speak.
- Consent-denied replies surface a one-line system hint in the transcript
  (muted, italic) instead of blocking the chat.

## ARCHIE's voice bank (Phase 8d, 2026-09-08)

The owner records their own voice in **Admin → ARCHIE's Voice**:

- Samples are recorded via the browser's MediaRecorder and saved to the
  private `archie-voice-samples` bucket + `frelux_archie_voice_samples`
  table (RLS owner-only, deployed live).
- ARCHIE derives a **deterministic** pitch/pace profile from the bank
  (`voice-profile.ts`): autocorrelation fundamental-frequency estimation
  (60–400 Hz, 2048-frame, 0.35 voiced threshold) and an energy-envelope
  syllable-nuclei rate estimate — pure math, free, no cloud AI ever.
- Every ARCHIE reply (Assistant + admin voice test) applies the saved
  profile to `speechSynthesisUtterance` pitch/rate, so ARCHIE approximates
  the owner's voice. Profile persists locally + in the bank.
- Owner can play (signed 5-min URL) or delete samples; the profile
  recalculates from the remaining bank. Free capability — no paid path.
