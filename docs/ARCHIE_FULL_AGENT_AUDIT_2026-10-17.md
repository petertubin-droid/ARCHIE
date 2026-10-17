# ARCHIE Full-Agent Audit — 2026-10-17

**Repo:** petertubin-droid/ARCHIE (standalone engine, extracted from FRELUX 2026-09-19)
**HEAD audited:** a39471d (`docs: add evidence-based ARCHIE engine audit`)
**Method:** full pull + fresh verification + source inventory. No sub-agents used, no code changed, nothing pushed.

## Verification snapshot (run today)

- `npx tsc --noEmit -p tsconfig.app.json` — **clean**
- `npx vitest run` — **268 files / 3,157 tests: 3,154 passed, 2 documented expected-fail, 1 skipped** (84s)
- 26 `archie-*` edge functions, 63 total functions in repo
- 15-phase cognitive kernel loop; 23 anatomy subsystems with live probes
- 37 native capabilities: 34 OPERATIONAL, 2 DEVELOPING (coding-generation, web-research), 1 NOT_IMPLEMENTED (generative-language-model — honest)
- LLM router ships with **zero providers** (deliberate owner plug point)
- **Scheduler PAUSED since 2026-10-10** (`archie-maintenance-hourly` unscheduled to conserve Gemini quota)

---

## A. Current engines inside ARCHIE

### Core cognition (the loop)
| Engine | Module | State |
|---|---|---|
| Cognitive kernel | `cognitive/kernel.ts` (1,164 lines) — 15 phases: PERCEIVE→UNDERSTAND→RETRIEVE→REASON→MODEL→PLAN→CREATE→VERIFY→ACT→OBSERVE→EVALUATE→LEARN→REMEMBER→IMPROVE→REPEAT | FULL, every phase bound to a real organ |
| Anatomy skeleton | `anatomy/registry.ts` — 23 subsystems (heart, brain, head, dna, skeleton, spinal-cord, blood, eyes, ears, mouth, digestive, liver-kidneys, immune, hands, muscles, legs, nervous, pain, balance, stem-cells), live DB probes, honest NOT_OPERATIONAL | FULL |
| Orchestrator / conversation | `cognitive/orchestrator.ts`, `native-engine/conversation.ts` (anaphora, follow-up) | FULL |
| Composer | `native-engine/composer.ts` — FNV-1a frame selection, epistemic markers enforced | FULL |
| NLU | `native-engine/nlu.ts` — intents, compound decomposition, negation, Nigerian English | FULL (English-primary) |
| Perception | `cognitive/perception.ts` — secret redaction, input shaping | FULL (text + audio JSON only) |
| Memory | `native-engine/memory.ts` + `persistence.ts` — context, Supabase, episodic, cross-session | FULL |
| Knowledge / FactStore | `knowledge.ts`, `seed-corpus.ts` v2, derived-vs-taught split, contradiction arbitration | FULL |
| Reasoning | `reasoning.ts` + `reasoning-loop.ts` — rule chains, means-ends, budget-bounded loop | FULL (deterministic) |
| Planning | `planning.ts` — operator-library planner | FULL (no long-horizon replan) |
| World model | `cognitive/world-model.ts` — owner-data entities | FULL (no physics sim) |
| Verification | `verification.ts`, `engine.verifyCitations()` — citations checked against real evidence | FULL |
| Self-evaluation | `selfeval.ts` — self-scores in `archie_self_evaluations` | FULL |
| Learning | `learning.ts` (OutcomeLearner), `lessons.ts` — verification-event ledger, promotion gates | FULL |
| Task completion (new) | `cognitive/task-completion.ts` + `task-state.ts` — supervised decomposition → gated cycle → formal verdict (ACHIEVED/PARTIAL/NOT_ACHIEVED) | FULL (but not interruption-proof — see D-2) |
| Metacognition | `cognitive/metacognition.ts` | FULL |
| Tool intelligence | `cognitive/tool-intelligence.ts`, `tools.ts`, `tool-router.ts`, `tool-budget.ts` — registered natives only, no dynamic discovery | FULL |
| Creation | `cognitive/creation.ts` — deterministic creation paths | FULL (no open-ended generation) |
| Security & integrity | `security-integrity.ts`, security sentry, verdict + life-safety hard gates | FULL |
| Evolution | `evolution/` — owner-approved change lifecycle §9 | FULL (proposals only) |
| Migration / continuity | `src/lib/archie/migration/` — manifest, SHA-256, secret scanner, owner-authorization gates | FULL |

### Domain & specialist engines
Construction calculators (with per-bucket pricing), market intelligence, crypto suite (market-data, exchange-execution owner-gated, order-lifecycle, portfolio, slippage, gates, ledger analysis, passphrase-vault recovery), code intelligence (analysis, impact, project, scaffold generation), engineering-objective, offensive-security + cybersecurity + api-credential-security, cross-project auth (JWKS owner identity), trusted-device enrollment, escrow intelligence, legal client, weather intelligence, web intelligence + website inspection (bounded), research (Wikipedia, arXiv, Google Books, Stack Exchange, DDG Lite, page-fetch, web-source registry, deep-page verification), voice: ears (on-device transcripts) + voiceprint identity + voice sessions + native PCM cue synthesis (mouth.ts), WhatsApp integration, social intelligence/connections, advertising intelligence, language intelligence.

### Infrastructure & governance
Internal agent orchestration (`internal-agents.ts`, 7-state lifecycle, cost-governance, `archie-agent-worker`), api-governance, cost-governance, provider-independence guard, authority boundary, capability-authority, model-lifecycle, change-pipeline, global orchestrator/context, status + capability manifests, hash-chained audit ledger, runtime schema enforcement (C-09), portable migration system.

### Edge runtime
26 `archie-*` functions (chat, core, engines, execute, agents, agent-worker, ears, eyes→? — status, studio, trading, crypto, escrow, family, infra, ingestion, legal, maintenance, credentials, anatomy, extract, voice-enroll, wallet-recovery, whatsapp) + shared subsystems: `evidence`, `inference`, `knowledge`, `lexicon`, `semantic-graph`, `studio`, `reasoning` (**WIP fifth intelligence layer — modules + migration 20260920140000 shipped but NOT wired**: classify, decompose, engine, math, units, validate, persistence).

---

## B. Every gap keeping ARCHIE from being a full AI agent

### Core intelligence
1. **No open-ended generative language (A-1, the defining gap).** Cannot write essays or converse on untaught topics; composes only from retrieved knowledge + reasoning + tool results, refuses honestly. Owner decision pending: accept boundary, or owner-gated self-hosted generative component.
2. **Thin causal/probabilistic reasoning (A-2).** No uncertainty propagation, no calibrated probabilities, no Bayesian updating over outcomes, no causal graphs. Confidence moves via fixed multipliers.
3. **Generative coding is scaffold-only (A-3).** Open-ended code authoring honestly refused.
4. **Web research adapter-bounded (A-4).** DuckDuckGo Lite only, no JS-rendered page fetch, no second failover adapter.
5. **Fifth reasoning layer unwired.** The Sept-19 WIP layer (math/units/decompose/classify/validate, 3,478 lines + migration) exists but is dead code until wired.

### Perception
6. **No OCR / scene understanding (B-1).** Vision is deterministic statistics (dimensions, palette, brightness, coarse classification); cannot read text in images or recognize objects/scenes.
7. **No audio understanding beyond transcripts (B-2).** Voiceprints + transcripts exist; no diarization, ambient events, or sound classification.
8. **No video perception (B-3).** Absent entirely.
9. **No media generation (B-4).** No image/audio/video synthesis (TTS is native PCM cues only).

### Learning / self-evolution
10. **Self-improvement is proposals-only (C-1).** Weakness detection drafts owner-gated proposals; nothing self-applies. No bounded auto-tuning envelope with rollback.
11. **Strategy-level learning thin (C-4).** Which composer/response patterns work for the owner is not itself learned.
12. **Reflection + consolidation OFF (regression).** The hourly maintenance cron that carried trace reflection (C-2) and consolidation (C-3) has been PAUSED since 2026-10-10. Both "resolved" items are dormant again until resumed or re-hosted; learning loops only fire on live traffic.

### Memory
13. **Kernel state per-isolate (D-1).** Counters (cycles, unknownTopicHits, verificationFails) reset on cold start.
14. **No durable task-step state (D-2).** A multi-step task interrupted mid-step cannot checkpoint/resume across isolate recycling.

### Communication / agency
15. **Reactive-only (E-1).** No proactive briefings, follow-ups, or reminders ARCHIE initiates (and its carrier, the scheduler, is paused).
16. **English-only (E-2).** No language detection or multilingual handling, no code-switching.
17. **Partial channel surface (E-3).** WhatsApp + social-connect + voice exist; no email, Telegram, or iMessage channels.
18. **No goal engine.** No long-horizon autonomous objectives with progress tracking; planning is per-request operator-library.

### Infrastructure
19. **No observability plane (F-2).** No success-rate/verification-rate/latency/unknown-answer metrics, dashboards, or alerts over the traces and audit ledger that already exist.
20. **Per-isolate rate limiting (F-3).** In-memory only; no DB-backed distributed token bucket.
21. **No DR runbook / verified backup story (F-5).** Migrations replay from repo; no scheduled restore test or documented recovery procedure.
22. **No secrets rotation (F-6).** Encrypted at rest; no rotation schedule or expiry detection.
23. **Shared blast radius (F-4).** Engine runs in the Freluxtools project shared with the FRELUX host — single quota pool and failure domain.
24. **No native mobile shell (G-2).** PWA + WhatsApp only; no offline task queueing/composition.

### Fresh code-level defects (owner's 2026-10-17 audit, EA-01..05 — still open)
25. **EA-01 (P1):** Binance adapter averages fills by count not volume, ignores qty, labels every HTTP-success as FILLED without validating order status/executed qty → wrong `filledPrice` in portfolio positions; test fixture can't expose it (equal quantities).
26. **EA-02 (P1):** PNG 4MP/20MB caps checked AFTER full zlib decompression → crafted PNG can exhaust memory/CPU before refusal.
27. **EA-03 (P1):** Construction parser strips negative signs, splits `1,200`, mis-converts mixed units (`12 ft × 3 m` both as feet) → plausible but wrong estimates.
28. **EA-04 (P1):** Market-data fetcher has no timeout/abort/byte cap and calls `r.json()` unbounded → slow/huge upstream responses can hang or OOM.
29. **EA-05 (P2):** `vision-perception` capability wording ("document and site inspection") exceeds the deterministic statistics actually implemented.

---

## C. Suggested new engines (all native / provider-independent)

Ranked by distance-to-full-agent per unit of work:

1. **Durable Task Continuity Engine** — checkpoint/resume of task-step state in the DB keyed by task id; closes D-2, makes the supervised task engine interruption-proof. Small, high value.
2. **Uncertainty & Causal Inference Engine** — calibrated confidence propagation, Bayesian updating over outcome history, small causal models for ARCHIE's real domains; closes A-2. Wiring the existing WIP fifth reasoning layer (math/units/classify) is the first tranche.
3. **Bounded Self-Tuning Engine** — owner-approved parameter envelopes (retrieval thresholds, strategy weights) with audit-chained changes and automatic rollback on regression; closes C-1 and completes the IMPROVE phase as a real loop.
4. **Proactive Briefing Engine** — owner-set channel policy + scheduled digests ("here's what happened overnight", follow-ups on promised tasks); closes E-1. Needs the scheduler resumed (or a quota-free native path — the cron is native code; the Gemini cost came from a separate consumer and should be split off rather than pausing the whole heartbeat).
5. **Strategy Learning Engine** — record which composer frames/response patterns correlate with owner satisfaction signals; feed the OutcomeLearner; closes C-4.
6. **Observability & Alerting Engine** — aggregate metrics + alerts over existing traces/audit ledger (success rate, verification pass rate, latency, unknown-answer rate, gate stops); closes F-2. Pure native computation.
7. **Goal Engine (long-horizon intent)** — persistent owner-declared goals with decomposition into scheduled tasks, progress tracking, and honest status reporting; turns ARCHIE from per-request into continuous agency.
8. **Semantic Vector Memory Engine** — deterministic hashed-embedding retrieval index (n-gram/minhash style, no external model) to upgrade TF-IDF recall across facts, episodes, and lessons; strengthens RETRIEVE for every other engine.
9. **OCR & Scene Perception Engine** (owner-gated flag REMOVED — owner directive 2026-10-18: ARCHIE learning is NOT owner gated; perception-to-knowledge learning builds ungated) — deterministic in-process OCR + bounded scene classification behind the existing honest-refusal pattern; closes B-1. (Deterministic libraries are provider-independent and consistent with the native principle.)
10. **Audio-Event Engine** — diarization, ambient sound classification on top of existing voiceprint/ears; closes B-2.
11. **Multilingual Engine** — language detection + honest refusal ("English only today") first, then incremental corpora (Yoruba/Igbo/Hausa/French/Pidgin given the host market); closes E-2.
12. **User-Modeling / Theory-of-Mind Engine** — per-person preference, tone, and priority models driving personalization across composer, planner, and briefings (data already flows through social/family modules).
13. **Email/Telegram Channel Engines** — inbound/outbound adapters behind the existing channel-abstraction + consent framework; closes E-3.
14. **Distributed Rate-Limit Engine** — DB-backed token bucket shared across isolates; closes F-3.
15. **Simulation Engine (world-model extension)** — bounded physics/quantity simulation for construction/trading scenarios ("what if wall area doubles"), closing the world-model's no-simulation limit.

Not recommended (boundary, by owner directive): generative-language or generative-coding via external models, any sub-agent minds, or un-gated self-modification. If open-ended generation is ever wanted, the owner-gated self-hosted local-model route behind the existing LLM-router plug point is the only compatible path.
