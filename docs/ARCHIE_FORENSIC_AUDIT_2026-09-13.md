# ARCHIE Forensic Audit — 2026-09-13

Three-pass audit per the standing directive: (1) breadth sweep of
every admin/archie surface, (2) depth check of items the first pass
could miss, (3) skeptical adversarial pass for authority bypasses.
Findings are DOCUMENTED, not silently repaired. Fix recommendations
follow each finding; nothing was changed during the audit.

**Verdict: NO fake integrations found. No silent failures found.
Two CRITICAL exposures and one broken edge found — all in the
FRELUX perimeter, not in ARCHIE's cognitive core. ARCHIE's
authority chain survives adversarial probing.**

---

## FINDINGS (action required)

### F1 — CRITICAL: 11 tables exist WITHOUT Row Level Security

grep-verified across all migrations: these tables are created with
no ENABLE ROW LEVEL SECURITY and no later policy anywhere in the
repo:

- frelux_archie_domain_constants
- frelux_archie_engine_counters
- frelux_archie_episodic_turns
- frelux_archie_native_facts
- frelux_archie_native_outcomes
- frelux_archie_whatsapp_accounts
- frelux_archie_whatsapp_events
- frelux_archie_whatsapp_messages
- frelux_archie_whatsapp_reminders
- frelux_archie_whatsapp_settings
- frelux_vocabulary

**Impact:** in Supabase, a table without RLS is fully readable AND
writable by anyone holding the public anon key (which ships in the
client bundle). Concretely: (a) every WhatsApp message ARCHIE
handles is world-readable — a privacy breach for every person who
messages the owner; (b) frelux_archie_native_facts /
native_outcomes are ARCHIE's learned knowledge — anyone can poison
them: **remote knowledge-poisoning of ARCHIE without touching the
owner's account**.

**Fix (recommended; owner approval needed to deploy):** one
migration that ALTER TABLE ... ENABLE ROW LEVEL SECURITY on all 11
and deny-all policies for anon/authenticated (the edge functions
use the service role, which bypasses RLS and keeps working).
Verify the Daily Frelux Migration Check stays green.

### F2 — HIGH: Termii API key baked into the client bundle

src/lib/worker-channels.ts:724 (sendSmsOTP) reads
import.meta.env.VITE_TERMII_API_KEY and sends OTPs **directly from
the browser** to Termii. A VITE_ variable is compiled into the
public JS bundle — the key is extractable by anyone. A proper
server path ALREADY EXISTS: supabase/functions/send-sms-otp uses
TERMII_API_KEY as an edge secret.

**Fix:** route all OTP sends through the send-sms-otp edge; delete
VITE_TERMII_API_KEY from worker-channels.ts and from the Netlify
env. The variable is undocumented even in .env.example.

### F3 — MEDIUM: roof-view-imagery edge invoked but NOT deployed

src/lib/roof/provider-registry.ts invokes the roof-view-imagery
edge function; supabase/functions/ contains no such directory.
The code self-reports at runtime ("may not be deployed") — honest,
but the feature is dead. Cross-check of all other
invoked-vs-deployed edges resolved cleanly (arithmetic /
nonexistent / my-function are test-only references).

**Fix:** deploy the roof-view-imagery function or disable the
imagery provider until it exists.

### F4 — LOW: minor observations

- VITE_OPENWEATHER_API_KEY is client-exposed (public-tier weather
  key — low risk, but consider proxying).
- archie-execute pre-flight uses
  `target?.requires_owner_secret && body.ownerSecret`, which skips
  the pre-verify when the secret is absent. **No bypass** — the
  execution engine re-checks at execution/engine.ts:390 with
  brute-force throttling (FIX 24) — but failing faster would be
  cleaner.
- Schema drift: prod reports 345 tables in public (per the Daily
  Frelux Migration Check) vs 317 created in repo migrations. Some
  drift is expected (SQL-editor history), but a reconciliation
  pass is recommended so no prod-only table hides an unaudited
  surface.

---

## PASSES (evidence recorded)

### A. Gemini boundary — PASS

GEMINI_API_KEY / Gemini API is used ONLY by the frelux domain
functions (ai-color-consult, ai-studio, ai-copilot, ...). Inside
ARCHIE's core (supabase/functions/_shared/archie-ai/**, all
archie-* edges) the only "gemini" occurrences are NLU patterns for
identity questions ("are you gemini" -> truthful denial). ARCHIE
does not call any LLM as its intelligence.

### B. Owner authority chain — PASS (adversarial)

- archie-owner-auth: authenticated-user check -> profiles.role ===
  'admin' server-side owner check -> PBKDF2 (310k iter)
  constant-time secret verify -> rate-limited failures recorded as
  critical security events. Plaintext secret never persisted,
  logged, or echoed.
- archie-execute: requires_owner_secret targets verified
  server-side (edge pre-flight + engine-level re-check with
  5-failure lockout); execution journal records initiator,
  authority_method, attempts, compensation_run_id.
- Voice: voice-session.ts routes authorization keywords
  (/authoriz|approve|deploy|.../) to the owner-authorization
  workflow — voice can INITIATE, never AUTHORIZE. In-flight voice
  buffer is purged on authorization to prevent replay.
- I probed the edge-level && short-circuit for a bypass: the
  engine independently re-verifies. No bypass found.

### C. No fake integrations / silent failures — PASS

- No empty catch {} blocks in src/lib, src/pages.
- No console logging of secret VALUES in edge functions (the two
  hits log absence/mismatch messages, never the value).
- .env.example exists and documents the server-only
  VAPID_PRIVATE_KEY convention.
- All client-invoked edge functions exist and are deployed (except
  F3, which self-reports honestly at runtime).
- ARCHIE capability registry discloses NOT_IMPLEMENTED states
  explicitly (e.g. spoken-audio transcription, open-ended code
  generation "not implemented — and is not claimed").

### D. Tests can fail (mutation probe) — PASS

Injected a deliberate bug (winRatePct: 100.0 constant) into
portfolio.ts -> the portfolio test FAILED. Reverted -> green. The
suite is not decorative; it pins real behavior.

### E. Test / runtime / production parity — recorded

Full suite green at audit time (see commit), including the
engine-deepening suites for Coding impact analytics, Trading
portfolio/slippage, and Security secret/header/sink scanning.
Production build verified with npm run build (vite + tsc) before
push.

---

## Engine-deepening work audited in the same pass

This audit covers the deepening landed 2026-09-13: Coding Engine
impact analytics (coding-impact.ts, 12 tests), Trading Engine
portfolio + slippage analytics (11 tests), Security Engine native
modules — secret-scan / header-audit / sink-scan (34 tests). All
produce evidence-carrying findings, refuse to extrapolate past
visible evidence, and disclose honest NOT_IMPLEMENTED states.

_Every finding above awaits the owner's decision — nothing was
repaired silently, per the audit directive._
