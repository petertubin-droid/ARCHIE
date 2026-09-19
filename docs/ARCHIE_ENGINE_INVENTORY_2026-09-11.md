# ARCHIE Engine Ecosystem Inventory (2026-09-11)

Owner directive: complete native engine ecosystem expansion —
inspect first, no duplicate engines, strengthen what exists,
complete what is partial, implement what is genuinely missing,
one coherent cognitive architecture.

This is the **inspection baseline**. Status codes:

- **FULL** — real implementation, runtime-integrated, tested, observable
- **PARTIAL** — real but incomplete; gap named under "Remaining"
- **GAP** — genuinely missing as an engine (may have a data table or probe only)

Runtime reachability: edge engines live in
`supabase/functions/_shared/archie-ai/**` and are invoked by the
`archie-*` edge functions; client engines live in `src/lib/archie/**`
and run in the PWA / admin surfaces. One kernel
(`cognitive/kernel.ts`, 15 phases) binds every loop phase to a real
anatomical subsystem (`ORGAN_PHASE_BINDINGS`); specialized engines are
callable from `native-engine/engine.ts` (the Native Intelligence
Engine core). 103 ARCHIE test files, 1,605 ARCHIE tests as of
2026-09-11.

## Inventory (30 required engines)

| #   | Engine              | Module(s)                                                                                                                                                                                                                                                                                                                                                                                            | Status   | Tests (examples)                                                                                                                              | Remaining limitations                                                                                                                                                             |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Native Intelligence | `native-engine/engine.ts` (3.1k lines), `runtime.ts`                                                                                                                                                                                                                                                                                                                                                 | FULL     | `core-integration`, `native-engine-benchmark`                                                                                                 | Model-runtime inference is an explicit boundary (`archie-model-runtime` reports `operational:false` honestly)                                                                     |
| 2   | Conversation        | `cognitive/kernel.ts` (15-phase loop), `orchestrator.ts`, `composer.ts`                                                                                                                                                                                                                                                                                                                              | FULL     | `anaphora-followup`, `cognitive-engine`                                                                                                       | Turn-level context; no multi-party conversation sessions                                                                                                                          |
| 3   | Language / NLU      | `native-engine/nlu.ts` (1.4k lines)                                                                                                                                                                                                                                                                                                                                                                  | FULL     | `nlu-*` suites, benchmark lu-1..4 (1.0)                                                                                                       | English-primary                                                                                                                                                                   |
| 4   | Perception          | `cognitive/perception.ts` (secret redaction, input shaping)                                                                                                                                                                                                                                                                                                                                          | FULL     | `cognitive-engine`, kernel trace honesty                                                                                                      | Text/audio-JSON perception; no live sensor stream                                                                                                                                 |
| 5   | Memory              | `memory.ts` (ContextMemory), `persistence.ts` (Supabase/Counter/Episodic)                                                                                                                                                                                                                                                                                                                            | FULL     | `cross-session-memory`, `episodic-persistence`                                                                                                | Working-memory window bounded; long-term = fact store                                                                                                                             |
| 6   | Knowledge           | `knowledge.ts` (FactStore), `seed-corpus.ts`, `frelux_knowledge_items`                                                                                                                                                                                                                                                                                                                               | FULL     | `derived-store`, `fact-id-concurrency`                                                                                                        | Knowledge acquisition is research-driven (no bulk ingest)                                                                                                                         |
| 7   | Learning            | `learning.ts` (OutcomeLearner), `lessons.ts` (RecordedLesson)                                                                                                                                                                                                                                                                                                                                        | FULL     | `archie-p3/p5`, benchmark learning (1.0)                                                                                                      | Outcome-based; no unsupervised clustering                                                                                                                                         |
| 8   | Research            | `webresearch.ts`, `web-sources.ts`, `page-fetch.ts`, `wikipedia-search.ts`                                                                                                                                                                                                                                                                                                                           | FULL     | `archie-web-source-registry`, research suites                                                                                                 | Source registry governs fetches; some sites need adapters                                                                                                                         |
| 9   | World Model         | `cognitive/world-model.ts` (425 lines)                                                                                                                                                                                                                                                                                                                                                               | FULL     | `forensic-worldmodel-authority`                                                                                                               | Owner-data-centric entities; no physics simulation                                                                                                                                |
| 10  | Reasoning           | `reasoning.ts` + `reasoning-loop.ts`                                                                                                                                                                                                                                                                                                                                                                 | FULL     | benchmark logic/causal/multi-step (all 1.0)                                                                                                   | Deterministic rule chains, not open-ended theory building                                                                                                                         |
| 11  | Planning            | `planning.ts` (Planner, DEFAULT/PLANNING operators)                                                                                                                                                                                                                                                                                                                                                  | FULL     | benchmark planning (1.0)                                                                                                                      | Operator-library planning; no long-horizon replan loop                                                                                                                            |
| 12  | Tool                | `tools.ts` (ToolOrchestrator + manifest), `cognitive/tool-intelligence.ts`                                                                                                                                                                                                                                                                                                                           | FULL     | `tool-intelligence`, benchmark tool-selection                                                                                                 | Tools are registered natives; no dynamic tool discovery                                                                                                                           |
| 13  | Execution           | `execution/engine.ts` (548 lines, ROLLED_BACK compensation), `archie-execute`                                                                                                                                                                                                                                                                                                                        | FULL     | `execution-engine`                                                                                                                            | Registry-gated targets only; every run audited                                                                                                                                    |
| 14  | Coding              | `coding.ts` (analyzeSource, generateUnitTestScaffold) + `coding-project.ts` (multi-file project analysis: internal dependency graph, broken-import detection, DFS import cycles, entry candidates, metrics; dependency-aware scaffolds with vi.mock) — engine methods analyzeProject/scaffoldProjectTests                                                                                            | **FULL** | `coding-project.test.ts` (17), `code-intelligence.test.ts`, `native-engine.test.ts`                                                           | Deterministic only; open-ended generative coding stays honestly NOT_IMPLEMENTED                                                                                                   |
| 15  | Validation          | `cognitive/verification.ts` (VerificationEngine)                                                                                                                                                                                                                                                                                                                                                     | FULL     | kernel VERIFY phase, `cognitive-engine`                                                                                                       | Verifies verdicts/plans; no property-based proof search                                                                                                                           |
| 16  | Self Evaluation     | `selfeval.ts` (SelfEvaluator), `cognitive/metacognition.ts`                                                                                                                                                                                                                                                                                                                                          | FULL     | `archie-p5`, metacognition suites                                                                                                             | Self-scores recorded in `archie_self_evaluations`                                                                                                                                 |
| 17  | Evolution           | `src/lib/archie/evolution/**` (authority, change-request, lifecycle)                                                                                                                                                                                                                                                                                                                                 | FULL     | `evolution-*` suites                                                                                                                          | Owner-approved changes only; §9 lifecycle enforced                                                                                                                                |
| 18  | Recovery            | `recovery/engine.ts` (classification → plan → retry/compensate/escalate/close → append-only ledger), `frelux_archie_recovery_events` (migration 20260912090000), archie-execute `recover`/`recovery` actions, anatomy healing probe                                                                                                                                                                  | **FULL** | `recovery-engine` (33), `execution-engine`                                                                                                    | Bounded to 3 recovery steps/run; non-idempotent targets without compensation escalate to the owner                                                                                |
| 19  | Security            | `security/verdict.ts`, `security-integrity.ts`, `security/life-safety.ts` (protected)                                                                                                                                                                                                                                                                                                                | FULL     | `life-safety-gate`, security suites                                                                                                           | Verdict gate + integrity + life-safety hard gate live                                                                                                                             |
| 20  | Owner Authority     | `evolution/authority.ts` (PROTECTED_SURFACES, mayApprove), `archie-owner-auth`                                                                                                                                                                                                                                                                                                                       | FULL     | `evolution-authority`, `kernel-trace-honesty`                                                                                                 | ARCHIE approval is code-impossible                                                                                                                                                |
| 21  | Voice / Audio       | `ears.ts` + `archie-ears` (STT intake, voiceprint) + `mouth.ts` (native prosody planner: sentence units, punctuation pauses, intonation, owner voice-bank shaping, consent-gated at library level; native PCM/WAV synthesis: click-free tones, byte-exact RIFF/WAVE, listen/confirm/alert cues) + `mobile/voice.ts` (client consumes the native plan) + `mobile/voice-profile.ts` (owner voice bank) | **FULL** | `mouth.test.ts` (21), `voice.test.ts` (8), `voice-profile.test.ts`, ears suites                                                               | Speech AUDIO synthesis honestly NOT_IMPLEMENTED — the plan drives the on-device engine; cues are non-speech audio; provider-free                                                  |
| 22  | Vision              | `cognitive/vision.ts` (analyzeImage, 683 lines)                                                                                                                                                                                                                                                                                                                                                      | FULL     | vision suites                                                                                                                                 | Deterministic image analysis; camera ingest via ears/PWA                                                                                                                          |
| 23  | Communication       | `whatsapp/protocol.ts` (442), `archie-whatsapp`, `archie-social-connect`, push notifications                                                                                                                                                                                                                                                                                                         | FULL     | whatsapp/protocol suites, moderation                                                                                                          | WhatsApp-first; social-connect surface per-channel adapters                                                                                                                       |
| 24  | Integration / API   | `connections.ts` (569 lines, pairing/permission/maintenance gate), `docs/API.md`                                                                                                                                                                                                                                                                                                                     | FULL     | `connections`                                                                                                                                 | Owner-scoped connection registry                                                                                                                                                  |
| 25  | Device              | `connections.ts` (connective-tissue state machine) + `src/lib/archie/mobile/**` (BT/USB)                                                                                                                                                                                                                                                                                                             | FULL     | `connections`, mobile suites                                                                                                                  | PWA transports for Web Bluetooth / WebUSB; edge holds policy                                                                                                                      |
| 26  | Infrastructure      | `infrastructure/engine.ts` (dependency probes + cost aggregation + budget evaluation + linear projection), `frelux_archie_infrastructure_snapshots` append-only (migration 20260912100000), archie-infra (assess/snapshots/costs/budgets), anatomy legs probe                                                                                                                                        | **FULL** | `infrastructure-engine` (24), `archie-anatomy`                                                                                                | Budgets remain the owner's rules; engine reports + recommends, never invents billing                                                                                              |
| 27  | Blockchain          | `crypto/blockchain.ts` (472), `hd-crypto.ts`, `bip39.ts`                                                                                                                                                                                                                                                                                                                                             | FULL     | `blockchain`, `hd-crypto`                                                                                                                     | Deterministic derivation; signing gated by owner authority                                                                                                                        |
| 28  | Market Intelligence | `crypto/market-data.ts` (1.3k), `market-analysis.ts`, `probability.ts`                                                                                                                                                                                                                                                                                                                               | FULL     | `crypto-intelligence`                                                                                                                         | Live market data sources registered in web-source registry                                                                                                                        |
| 29  | Trading             | `crypto/trade-gate.ts` + `crypto/order-lifecycle.ts` + `crypto/exchange/` (venue contract, Binance Spot HMAC-SHA256 adapter with TESTNET default, guarded execution pipeline: emergency stop → eligibility → staleness → per-session mainnet authorization → pre-flight balance → validate → place → lifecycle sync at ACTUAL fill price, emergency cancel-all, owner-credential boot factory)       | **FULL** | `trade-gate.test.ts`, `order-lifecycle.test.ts` (18), `exchange-execution.test.ts` (30), `crypto-intelligence.test.ts`, `market-data.test.ts` | NO live fill ever observed — owner must provision BINANCE_API_KEY/SECRET (testnet first); MAINNET doubly gated (construction + per-session authorization); never financial advice |
| 30  | Domain Intelligence | `domains/registry.ts` + `domains/construction.ts` (+ data) — audit pass 4 domain capture                                                                                                                                                                                                                                                                                                             | FULL     | `domain-capture`, `domain-intelligence`                                                                                                       | Construction domain live; registry extensible per domain                                                                                                                          |

## One architecture, not thirty brains

Pipeline (kernel `cognitive/kernel.ts`): PERCEIVE → UNDERSTAND →
RETRIEVE → REASON → PLAN → MODEL → CREATE → VERIFY → ACT → OBSERVE →
EVALUATE → LEARN → REMEMBER → IMPROVE → REPEAT. Every phase binds to
a real anatomical subsystem; `archie-chat` runs the life-safety gate
and security verdict BEFORE the loop, and VERIFY/ACT re-classify
ARCHIE's own outgoing response (defense in depth). Specialized
engines (blockchain, market, vision, research…) are invoked BY the
native engine / kernel — never as parallel brains. No engine may
bypass the authority, security or life-safety layers.

## Learning vs execution authority

Learning authority (research, knowledge, lessons) is free by
constitution. Execution authority (production code, deployment,
destructive/consequential ops, funds) is owner-gated server-side and
code-enforced — `mayApprove("ARCHIE")` is constant-false and tested.

## Work queue (strengthen/complete, in protocol order)

1. **Recovery Engine (18)** — DONE 2026-09-12:
   `recovery/engine.ts` (failure classification, deterministic plan
   policy, retry/compensate/escalate/close, append-only ledger),
   migration `20260912090000`, archie-execute `recover`/`recovery`
   actions, anatomy healing probe, 33 tests.

2. **Infrastructure Engine (26)** — real module: deployment/dependency — DONE 2026-09-12:
   `infrastructure/engine.ts` (live probes: Supabase REST /
   edge runtime / frontend; per-provider cost aggregation;
   budget states incl. exhaustion policy; linear projection),
   append-only snapshots ledger, archie-infra edge function,
   legs probe upgrade, 24 tests. Remaining work queue:
   Coding Engine (14), Trading Engine (29), Voice Engine (21).
   health, cost tracking + projection, wired into anatomy "legs".
3. **Coding Engine (14)** — deepen: multi-file project analysis, — DONE 2026-09-12:
   coding-project.ts (dependency graph with alias/relative/
   extensionless/index resolution, broken imports, DFS cycle
   detection, entry candidates, project metrics, dependency-
   aware scaffolds), engine methods, 2 new OPERATIONAL
   capabilities, 17 tests. Remaining work queue: Trading
   Engine (29), Voice Engine (21).
   dependency-aware scaffolds (native, deterministic — no fake AI).
4. **Trading Engine (29)** — order lifecycle state machine behind the hard trade gate — DONE 2026-09-12:
   order-lifecycle.ts (positions open ONLY from eligible gate
   decisions — structural refusal, no override; tick monitor;
   gap-through stops fill at the worse price so loss is never
   understated; emergency stop closes immediately at market;
   closed positions are terminal, double close refused;
   deterministic direction-aware P&L with explicit per-side
   fees; append-only journal), 18 tests. Remaining work queue:
   Voice Engine (21).
   existing gate (still owner-gated for consequential fills).
5. **Voice Engine (21)** — close the loop: TTS back into ears
   transcripts (audit) + prosody shaping via composer — DONE
   2026-09-12: mouth.ts (native prosody planner — sentence-
   first units, punctuation pauses, statement-fall/question-rise
   intonation, owner voice-bank pitch/rate shaping, consent-
   gate at library level; native PCM/WAV synthesis — click-free
   tone envelopes, byte-exact RIFF/WAVE encoding, listen/
   confirm/alert cues), mobile/voice.ts rewired onto the native
   plan (behavior-compatible, 8 existing tests green), anatomy
   mouth probe verifies the native module binds, 21 new
   tests. Speech AUDIO synthesis stays honestly NOT_IMPLEMENTED
   — the plan drives the on-device engine. THE 30-ENGINE WORK
   QUEUE IS NOW COMPLETE.

5b. **Coding Engine (14) DEEPENING — impact & graph analytics** — DONE 2026-09-13:
coding-impact.ts (reverse-transitive blast-radius impact
analysis with BFS depth and exact via-chains; dead-file
detection with detached-cycle reachability vs. isolated
true orphans, never conflated; fan-in/fan-out coupling
metrics with load-bearing ranking; dependency-depth
layering with cycle-guarded, memoization-poisoning-free
per-file computation), 3 OPERATIONAL + 1 honest
NOT_IMPLEMENTED capabilities, 12 tests.

5c. **Trading Engine (29) DEEPENING — portfolio analytics + execution-cost estimation** — DONE 2026-09-13:
portfolio.ts (win rate, profit factor, payoff ratio,
expectancy, per-trade Sharpe-style ratio honestly labeled
NOT-annualized, realized equity curve with max drawdown,
HHI open-exposure concentration — all fees-included, all
insufficient-data paths return determinable:false with
nulls, never invented statistics), slippage.ts
(deterministic order-book walk: VWAP fill, mid-relative
adverse cost in bps both sides, visible-depth consumption;
REFUSES to estimate past the last visible level — never
extrapolates), 2 OPERATIONAL + 2 honest NOT_IMPLEMENTED
capabilities, 11 tests.

5d. **Hacking / Security Engine (31) DEEPENING — evidence-based native security modules** — DONE 2026-09-13:
security/secret-scan.ts (11 known key formats + Shannon-
entropy token candidates, masked evidence so the audit
trail never leaks the secret, explicit ENTROPY_REVIEW vs
HIGH_FORMAT confidence), security/header-audit.ts
(6-header OWASP baseline over captured evidence —
PASS/WEAK/FAIL with severities, never invents uncaptured
headers), security/sink-scan.ts (9 dangerous-sink patterns
— SQL interpolation, eval, shell exec, innerHTML, path
traversal, SSRF — with TAINTED_CANDIDATE vs SINK_REVIEW
classification; never claims a confirmed vulnerability),
3 OPERATIONAL + 3 honest NOT_IMPLEMENTED capabilities,
34 tests. All three modules produce EVIDENCE-CARRYING
findings for owner-authorized engagements only.

Each item follows DESIGN → IMPLEMENT → TEST → INTEGRATE → RUNTIME
VERIFY → ACCEPT/REJECT, with full ARCHIE suites green and per-engine
tests added. Existing engines hold their baselines
(`docs/archie-performance-ledger.md`).
