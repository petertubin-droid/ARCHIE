# ARCHIE Gap Audit — 2026-09-16

**Scope:** the entire ARCHIE codebase (native engine + cognitive kernel + 24 edge
functions + 308 live migrations) and its infrastructure (Supabase Freluxtools,
CI/CD, GitHub Actions deploy pipeline).

**Method:** every "lacks" claim below was verified against the code this session
(grep/read evidence), not recalled. "Lives" claims were verified live
(migration history API) or by test suite (8,655 tests green at commit `08a15a39`).

**What is measured and TRUE today:**

- 37 native-engine capabilities: 34 OPERATIONAL, 2 DEVELOPING (coding
  generation, web research), 1 NOT_IMPLEMENTED (generative language model —
  deliberate honesty, never faked).
- 16 cognitive systems (all OPERATIONAL), incl. today's **supervised task
  completion engine**: sentence-driven decomposition → one full gated cycle
  per step → per-step formal verification → bounded retry → deterministic
  ACHIEVED/PARTIAL/NOT_ACHIEVED verdict.
- 23/23 anatomy subsystems operational; 24 `archie-*` edge functions deployed;
  hash-chained audit ledger; owner authority gates; zero console/TS/ESLint
  errors; 8,655 tests green; build clean.
- Task completion anatomy migration `20260916030000` applied and verified live
  (308 migrations in chain).

---

## Status update — 2026-09-16 (later, same day)

Verified this session (live checks, not recalls):

- **F-1 RESOLVED (deployed live):** `archie-maintenance` edge function +
  migration `20260916040000` (pg_cron + pg_net, hourly heartbeat at :05,
  CSPRNG token gated in-DB) is **applied and ACTIVE on live Supabase**
  (`archie-maintenance-hourly`, `5 * * * *`, verified via `cron.job`).
  This unlocks C-3 (scheduled consolidation) and C-2 (scheduled trace
  reflection — the reflect mode feeds weak traces to the OutcomeLearner).
- **Benchmark full score:** 52/52 (1.000, from 0.962) — mr-3 (validated-fact
  salience end-to-end) and cd-2 (contradictions surfaced in conversation,
  never silently ignored) closed at the honest capability level. Ledger
  Entry 9; report in `benchmarks/full-score-capability-2026-09-16.json`.
- **11 pending migrations deployed live** (320 total in
  `schema_migrations`), incl. task-completion anatomy, scheduler, agent
  execution, constitution v3 anatomy 23/23, trading surface, recovery
  jobs, engine states, console grants, vocab seed, message star, web
  source registry.
- **Full regression:** 8,663 tests green / 899 files (2 documented
  expected-fail); tsc/ESLint/build clean; commit `c0f49b30` pushed with
  all 5 CI checks green (edge deploy, preview, type-check, E2E smoke,
  Lighthouse).

The gap list below is updated accordingly: F-1, C-3, C-2 are CLOSED.
The remaining priority order (my recommendation) is now:

1. **D-2 durable task-step state** — supervised task completion becomes
   interruption-proof across isolate recycling.
2. **C-1 bounded auto-tuning envelope** — the self-evolution loop closes
   (owner-approved parameter bounds, audit-logged, auto-rollback).
3. **E-1 proactive briefings** — the most owner-visible "alive" behavior;
   the scheduler now exists to carry it.
4. **F-2 observability plane** — success-rate/verification/latency metrics
   and alerts over the existing traces and audit ledger.
5. **A-1 generative component decision** — the owner's architectural call.
6. B-1 OCR/scene, E-2 language detection, F-3 distributed rate limiting,
   F-5 DR runbook — next tranche.

## A. Core intelligence gaps

**A-1. No open-ended generative language (the defining gap).**
`capabilities.ts` reports `generative-language-model` NOT_IMPLEMENTED: ARCHIE
composes structured responses from retrieved knowledge, reasoning outputs and
tool results, and refuses honestly when knowledge is insufficient. It cannot
write original open-ended prose (essays, open-domain conversation on untaught
topics, creative synthesis).
_Needs:_ an owner decision — either accept this as the architectural boundary,
or add an owner-gated, self-hosted generative component (small local model
served behind the existing gates) WITHOUT violating the OpenAI separation
rule (`openai_separation` principle). This is the single largest distance
between ARCHIE and a "fully functional general AI".

**A-2. Causal / probabilistic reasoning is thin (DEVELOPING).**
Forward/backward rule chaining, means-ends planning, TF-IDF retrieval,
Bayesian NLU fallback all exist — but there is no uncertainty propagation:
confidence flows through fixed weight multipliers, with no calibrated
probability model, no Bayesian updating over outcome history, no causal
graph (A→B because C). _Needs:_ a probabilistic inference layer over the
existing FactStore confidence axis, and a small causal model for the
domains ARCHIE actually serves (construction, crypto, family).

**A-3. Generative coding is scaffold-only (DEVELOPING).**
Deterministic unit-test scaffolds and analysis exist; open-ended code
authoring is honestly refused. _Needs:_ owner-gated code authoring tied to
the `code_production_authority` principle (already seeded) — propose → test
→ owner-approve → apply.

**A-4. Web research is adapter-bounded (DEVELOPING).**
DuckDuckGo Lite only, no keys, static fetch — JS-rendered sources are
unreachable, and depth is capped by the early-stopping policy.
_Needs:_ a second independent no-key adapter (failover), and a rendering-capable
fetch path for JS-heavy priority sources.

## B. Perception gaps

**B-1. No OCR / no scene understanding in vision.** `vision.ts` analyzes PNG
pixels (palette/dimensions) and JPEG/GIF structure, refuses >4MP and unknown
formats honestly. It cannot read text in images, recognize objects/scenes, or
identify faces. _Needs:_ owner-gated OCR + bounded scene classification to
extend the existing honest-refusal pattern.

**B-2. No audio understanding beyond transcripts.** Ears produce on-device
speech transcripts with voice-print identity. No speaker diarization, no
ambient audio events, no sound classification. (No code matches either.)

**B-3. No video perception.** Absent entirely — no frame extraction, no
motion analysis.

**B-4. No media generation.** No image/audio/video synthesis (TTS is native
PCM cue synthesis only). Fine by the separation rule — but a "full AI"
typically answers "draw me…".

## C. Learning / self-evolution gaps

**C-1. Self-improvement is proposals-only.** Weakness detection drafts
owner-gated proposals; NOTHING self-applies (by design, `IMPROVE` phase).
There is no bounded auto-tuning with rollback (e.g., retrieval thresholds,
strategy weights adjusted within owner-approved envelopes).
_Needs:_ an owner-approved auto-tuning envelope: parameter bounds persisted,
changes logged to the audit chain, automatic rollback on regression.

**C-2. RESOLVED 2026-09-16 (scheduler reflect mode, deployed live):** ~~No reflection over past traces.~~ (Original note kept for history:) Cognitive traces are persisted but
never re-examined as learning material ("what did I get wrong last week?").
_Needs:_ a scheduled reflection pass over saved traces feeding the
OutcomeLearner's cause taxonomy.

**C-3. RESOLVED 2026-09-16 (hourly scheduler heartbeat, deployed live):** ~~Consolidation is cold-start-only.~~ (Original note kept for history:) `consolidateIfDue` runs inside
engine init (engine.ts:578) — with no traffic, nothing consolidates.
_Needs:_ a scheduled background invocation (see F-1).

**C-4. Strategy-level learning is thin.** The OutcomeLearner reinforces
knowledge confidence with credit assignment; which composer strategies /
response patterns actually work for the owner is not itself learned.

## D. Memory gaps

**D-1. Kernel state is per-isolate.** Counters (cycles, unknownTopicHits,
verificationFails) live in memory; edge isolates reset them on cold start.
Durable stores (facts, outcomes, world model, traces, audit) are fine — the
ephemeral operating-state layer is not.

**D-2. No working-memory persistence across restarts.** A conversation
resumed after isolate recycling re-hydrates history from the client, but
in-flight task state (a multi-step task interrupted mid-step) has no
checkpoint/resume. _Needs:_ durable task-step state so supervised tasks
survive isolate recycling and complete from where they stopped.

## E. Communication gaps

**E-1. ARCHIE is reactive-only.** No proactive outreach: no daily briefings,
no "you asked me to follow up on X", no reminders ARCHIE initiates. Every
message must come from the owner first (or the automations the owner
configures in Base44). _Needs:_ a proactive scheduler + an owner-set channel
policy (what may ARCHIE initiate, when, where).

**E-2. English-only.** The NLU (incl. Nigerian English forms) has no
multilingual intent handling — no language detection, no code-switching.
_Needs:_ at minimum language identification with honest "I only speak
English today" refusal, then incremental multilingual corpora.

**E-3. Channel surface is partial.** WhatsApp integration, social-connect
and voice exist; no email channel, no Telegram/iMessage, no group-chat
presence beyond the existing WhatsApp path.

## F. Infrastructure gaps

**F-1. RESOLVED 2026-09-16 (deployed live — see status update): background scheduler.** ~~No background scheduler for ARCHIE.~~ No pg_cron (only the FRELUX
crawler schema), no GitHub Actions cron calling archie functions.
Consolidation (C-3), knowledge TTL enforcement, trace reflection (C-2),
and briefing generation (E-1) all need this. _Highest-leverage single fix._

**F-2. No observability plane.** Audit ledger + traces + security events
exist, but there is no aggregated metrics/alerting: no cycle-success-rate,
verification-pass-rate, latency percentiles, or unknown-answer-rate
dashboards, no alert on gate stops or verification regressions.

**F-3. Per-isolate rate limiting.** The chat intake rate limiter is
in-memory per isolate — a distributed limiter (DB-backed token bucket) is
missing.

**F-4. Frelukx mirror project is disconnected (2026-09-13).** ARCHIE now runs
inside the FRELUX app project (Freluxtools) — shared quotas, single blast
radius, no AI/app infrastructure separation. _Needs:_ a re-dedicated ARCHIE
project (or documented acceptance of the shared blast radius).

**F-5. No DR runbook / verified backup story.** Migrations replay from the
repo, but no scheduled verified backup restore test, no documented
recovery procedure for the ARCHIE project DB.

**F-6. No secrets-rotation automation.** Encrypted at rest; no rotation
schedule or expiry detection for owner credentials and API keys.

## G. Product-surface gaps

**G-1. Device coverage is thin.** The connections subsystem (Web
Bluetooth/USB/network transports, pairing lifecycle, permissions) is real,
but production-tested device profiles are few.

**G-2. No native mobile surface.** ARCHIE lives in the FRELUX web app and
WhatsApp; no app shell with offline queueing (tasks composed offline,
executed on reconnect).

**G-3. Crypto subsystem is gated by design.** Market/ledger analysis is
OPERATIONAL; exchange execution is behind owner gates with slippage limits —
by principle, not by omission (listed for completeness).

---

## Priority order to "fully built functional AI" (my recommendation)

1. **F-1 background scheduler** — unlocks C-3, C-2, E-1 with one fix.
2. **D-2 durable task-step state** — supervised task completion (shipped
   today) becomes interruption-proof.
3. **C-1 bounded auto-tuning envelope** — the self-evolution loop closes.
4. **E-1 proactive briefings** — the most owner-visible "alive" behavior.
5. **F-2 observability plane** — everything above becomes measurable.
6. **A-1 generative component decision** — the owner's architectural call;
   everything else can proceed without it.
7. B-1 OCR, E-2 language detection, F-4 infrastructure separation —
   next tranche.

**Honest bottom line:** ARCHIE today is a verified, gated, self-auditing,
task-completing intelligence with real persistence and no fabricated
capabilities — 34/37 native capabilities operational, 16/16 cognitive
systems operational. What it lacks to be a "fully built functional AI" is,
in order: autonomy of time (scheduling), resilience of state (durable
tasks), evolution (auto-tuning), initiative (proactive channel), sight
(OCR/scene), and finally the owner's decision on open-ended generation.
