# ARCHIE Deep Forensic Audit — Intelligence Architecture (16 Levels)

**Date:** 2026-09-13 · **Auditor:** Koda (Superagent, direct execution — no sub-agents) · **Scope:** the complete ARCHIE intelligence stack in `frelux` repo HEAD, verified live at time of audit.

This is the companion to `ARCHIE_FORENSIC_AUDIT_2026-09-13.md` (database/security fixes F1–F4). That report audited _where ARCHIE's data lives and how it is locked down_; this one audits _what the intelligence actually is_ — component by component, claim by claim, against the running code and test suite.

**Method.** Every file cited below was read in full or in structural depth; every capability claim was traced to its executing code path; runtime evidence comes from the repo's own test suite (7,809 tests green at audit time; targeted forensic subsets re-run clean: 44/44 reasoning/NLU/planner/learning/memory, 173/173 kernel/world-model/life-safety/cognitive-runtime). No production data was modified. Temporary diagnostics were read-only.

---

## A. Executive summary

ARCHIE's intelligence is **real, native, and honest at its core** — a genuine GOFAI (classic symbolic AI) system, not a provider wrapper and not theater. The knowledge store, unification-based reasoning, rule lifecycle, learning reinforcement, life-safety gate, and execution authority chain all execute real, testable logic with no external AI anywhere in the intelligence path.

The architecture's defining strength is **radical honesty**: skipped phases are recorded as skipped, unimplemented capabilities refuse with clear errors instead of fabricating, derived knowledge can never auto-promote, and consequential action permanently ends at PROPOSE.

The findings below are real but **secondary to that core**: one duplicated front door (`archie-core`) that predates the life-safety gate and bypasses it; residual domain contamination (construction + crypto vocabulary and constants welded into the "general" engine despite the pluggable skill registry); an internal-agents system that is a real budget/lifecycle ledger with **no execution semantics behind it**; and bounded intelligence depth everywhere (pattern-based NLU, cue-driven strategies, presentational plan steps).

**Top findings (risk order):**

| #   | Finding                                                                                                                                                                               | Severity   | Classification                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| 1   | `archie-core` edge function is a second owner chat front door with its own tool orchestration and **no life-safety gate, no security verdict gate**                                   | HIGH       | Genuine (older parallel path)                |
| 2   | Internal-agents orchestration has no execution engine — agents are lifecycle DB rows + budget events; nothing ever _does_ the task                                                    | MEDIUM     | Partial (scaffold)                           |
| 3   | Domain contamination residue: `construction_calc` intent + Nigerian constants + cement-price extractor + crypto routes welded into the core engine, despite the domain-skill registry | MEDIUM     | Genuine (architecture violation of own rule) |
| 4   | `frelux_*` table names hardcoded through the "provider-independent" shared layer (ARCHIE layer is FRELUX-named)                                                                       | LOW–MEDIUM | Genuine (naming coupling)                    |
| 5   | Plan step "execution" is mostly labeling (`executed`/`awaiting-owner`/`proposed`); only inventory/gap steps do real computation                                                       | MEDIUM     | Partial (honest but thin)                    |
| 6   | Strategies are cue-regex → store pattern queries; "probabilistic" is confidence-weighted averaging, not probability calculus                                                          | LOW        | Genuine (real but shallow)                   |
| 7   | Vision is PNG-pixel-analysis only (honest about it), not object recognition; not wired into the main chat loop                                                                        | LOW        | Genuine (bounded, honest)                    |
| 8   | Two TF-IDF rankers were consolidated (FIX 46); ranking tests now exercise production code                                                                                             | —          | Fixed during audit trail                     |

No fabricated capabilities, no fake data, no simulated results were found anywhere. Every stub found **refuses honestly** rather than pretending.

---

## B. Evidence base

- **Repo:** `frelux` (`petertubin-droid`), HEAD healthy, 7,809 tests green.
- **Read in depth:** `runtime.ts`, `archie-chat/index.ts` (1,850+ lines), `archie-core/index.ts` + `model-runtime.ts`, `native-engine/{knowledge,reasoning,unify,nlu,memory,learning,selfeval,strategies,planning,engine,tools,mouth,ears,voiceprint,webresearch,page-fetch,seed-corpus,conversation-corpus}.ts`, `cognitive/{kernel,world-model,perception,metacognition,verification,creation,orchestrator,security-integrity,tool-intelligence}.ts`, `execution/engine.ts`, `recovery/engine.ts`, `security/{life-safety,verdict,cross-project-auth,api-credentials}.ts`, `domains/{registry,construction}.ts`, `archie-{anatomy,status,agents,voice-enroll,ears}/index.ts`, client: `ears.ts`, `mobile/voice.ts`, `voice-session.ts`, `internal-agents.ts`, `native-intelligence.ts`, `stage1-client.ts`, `chat-client.ts`.
- **Runtime evidence:** `vitest run` on 12 forensic test files — all green (2 expected-fails are the system's own honesty tests).
- **Domain contamination scan:** regex sweep for construction/FRELUX/crypto vocabulary across `_shared/archie-ai`, per-file counts, then manual classification of each hit (logic vs data vs comment).

---

## C. Level 0 — Runtime & entry points

**Claim:** "One unified ARCHIE intelligence — never multiple sub-agents." **Verdict: TRUE at the core, with one duplicate front door.**

The engine registry (`runtime.ts`) resolves: cognitive engine → native engine → env-configured engine → honest "no engine operational" refusal. Never a silent provider substitution; adapters are labeled `external-adapter` if configured.

- **`archie-chat`** (the PWA front door, `ArchieChat.tsx` → `chat-client.ts`): full gate stack in order — life-safety classification → security verdict → vocabulary capture → cognitive kernel cycle (honest fallback to native substrate). 14+ real tools (arithmetic, knowledge ops, execution engine SANDBOX/STAGING with owner secret, web research, website inspection, etc.), each marked `operational: true/false` honestly.
- **`archie-core`** (Stage-1 front door, `Assistant.tsx` + `stage1-client.ts` + `voice-session.ts`): owner-only, own intent-classification via schema-constrained inference, 4–5 tools (system status, knowledge search, frelux data, learning initiate, planning). **No life-safety gate. No security verdict gate.** Its system prompt hardcodes FRELUX calculator routing (domain coupling).
- Other surfaces (`archie-whatsapp`, `archie-legal`, admin ops) reuse the shared kernel where they do intelligence.

**Finding C-1 (HIGH):** `archie-core` is a live, owner-used parallel conversational path (used by `Assistant.tsx`, `voice-session.ts`, `StatusCenter`, device recovery) that predates the life-safety layer and never received it. The owner directive says the life-safety gate is _the_ code-enforced first layer — on this path it does not exist. Recommendation: route `archie-core` through `classifyLifeSafety` + the security verdict at entry (same order as `archie-chat`), or deprecate it in favor of `archie-chat`.

---

## D. Level 2 — Knowledge store & reasoning core

**Claim:** real rule-based inference over SPO facts with unification, confidence propagation, explanations. **Verdict: GENUINE — the strongest part of the system.**

- `FactStore` (`knowledge.ts`): SPO facts with confidence, provenance (seed/inferred/owner-taught/web-research), status lifecycle (candidate → derived → validated / uncertain), twin-reinforcement detection, promotion gates requiring real verification events (owner confirm, cross-source), conflict arbitration by provenance rank, consolidation (merge/decay/promote/drop), inverted-index ranking (cached `FactRankIndex`).
- `unify.ts`: real unification — variables in subject/predicate/object positions, numeric bindings, one-level typed shape patterns (`{value:"?v", unit:"m"}`), compiled patterns in the hot loop.
- `reasoning.ts`: forward chaining (≤6 iterations, fixpoint-bounded), literal fast path + unification path with single-slot capture completion (sound; refuses fabrication), `compute` rules producing numeric conclusions from premise values (refuses on undefined/non-finite), backward goal search (depth 4, 20-binding cap, compute rules excluded — they cannot be soundly "proved" backwards), full derivation traces including variable bindings, shared rule-validity predicate for both chains with surfaced refusal reasons (`invalidRules` — never silently dropped).

**Bounds (honest, stated):** bounded iterations/depth/caps mean the chain is decidable, not complete; no negation-as-failure; no truth maintenance beyond supersede/conflict status. These are classic GOFAI trade-offs, correctly enforced and disclosed.

---

## E. Level 3 — Language understanding (NLU)

**Claim:** native intent classification, no external NLP. **Verdict: GENUINE (pattern-based, measured).**

- Deterministic regex cascade first (high-precision rules incl. compound-clause decomposition, max 4), then trained **multinomial Naive Bayes** (~1,350 utterances, cached classifier) with domain hints, then known-token honesty guards.
- Anaphora resolution over recent turns; emoji/tone detection; Nigerian-English vocabulary normalization.
- **Held-out confusion tests** exist and pass (capability-vs-knowledge, identity-vs-status, greeting-overreach families) — real regression evidence, though the held-out set is small (~40 phrases).

**Bound:** this is keyword/pattern classification, not semantic parsing. The honesty guards (refusing when tokens are unknown) are the right mitigation and are present. `construction_calc` is a core intent — see Finding L-1.

---

## F. Level 4 — Cognitive kernel (15-phase loop)

**Claim:** PERCEIVE→…→REPEAT permanent loop, every phase real, skipped phases recorded. **Verdict: GENUINE orchestration/trace layer over the substrate — the trace honesty is excellent; the kernel itself is thin.**

- `kernel.ts` runs the 15 phases with honest status taxonomy: `executed` (measured, with produced-artifact summary), `delegated` (named component), `skipped` (reason). Route from `orchestrate()` decides the phase set per intent.
- Real work in-kernel: perception secret-redaction (+ audit), NLU, reasoning-loop budget accounting, world-model writes, verification verdicts, metacognition assessment, IMPROVE proposals (owner-gated), single durable trace write at cycle close.
- CREATE is minimal by design: deterministic unit-test scaffolds for fenced code only.
- **Life-safety self-gate:** the kernel classifies its _own outgoing response_ and replaces it with the safety stop + audit event when blocked. Genuinely well-designed defense-in-depth point.

**Bound:** most phases wrap substrate calls; PLAN/LEARN/REPEAT are recorded as delegated. This is honest, and the honesty system (P9) is test-enforced (`kernel-trace-honesty.test.ts`).

---

## G. Levels 5, 6, 14 — Memory, learning, self-evaluation

**Memory (`memory.ts`): GENUINE.** TF-IDF turn vectors; salience = cosine relevance × 0.7 + recency × 0.3; 24h session horizon, 30-day episodic horizon; three buffers (seeded/live/episodic) preventing duplicate seeding; salient-fact extraction deliberately removed (audit G-1) so memory can never silently mint knowledge — facts enter only through gated paths.

**Learning (`learning.ts`): GENUINE and unusually well-guarded.** Reinforcement with credit assignment: success +0.05 (also stamps `owner-confirm:` verification events, promoting after ≥2 validations), failure −0.12, correction −0.15 (facts parked `uncertain` — never silently retained as established). **Citing is not reinforcement** (`cited` kind); **gratitude is not reinforcement** (`acknowledged` kind — "thanks"/"great" reinforce nothing). The owner-confirmation path requires an explicit-confirm phrase AND ≥2 shared salient tokens with stored facts, else it is honestly recorded as below-similarity-floor acknowledgement. The historic "success learning" self-reinforcement hole is closed on all sides I could construct.

Consolidation is time-durable across isolates (shared counter store + single-writer claim; skipped passes do not refresh the timestamp).

**Self-evaluation (`selfeval.ts`): GENUINE.** Contradiction scan (same-SPO different-object), inference re-derivation stability, plan-validity, response self-check (cited facts must exist; sub-validated citations must be epistemically labeled in the reply text — FIX 47 made the check observable rather than dead-flag-gated), calibration statistics.

---

## H. Levels 7–9 — World model, strategies, planning

**World model (Level 7): GENUINE but modest.** Versioned relation store with `observed_at`, supersede chains (`superseded_by`), current-view projection and time-travel `currentView(t)`, `history(subject)`. It is a versioned triple log, **not** a predictive state model: no forward simulation, no causal projection beyond supersede chains, no forecasting. The kernel writes one `processed-task` relation + up to 3 cited facts per cycle — usage is currently more ledger than model. (Audit I-1 already fixed the read side: current view is injected as reasoning context.)

**Strategies (Level 8): GENUINE, shallow.** Deterministic cue-regex selection (≤2 strategies) over 12+ modes. Real operations on the store: causal = BFS over `causes` edges (conf-multiplied chains); consistency = SPO conflict scan; temporal = date-sorted facts with validFrom/validUntil; comparative = numeric dimension comparison incl. object-valued facts; abductive = rule/cause candidates ranked by premise support; inductive = ≥3-subject generalization _proposals only_; counterfactual = causal-graph intervention finding orphaned effects; hypothesis = relabeled abductive with kill-tests. Every result carries assumptions, uncertainty band, evidence ids; hypotheses never promote. **Bound:** "probabilistic" is provenance-weighted confidence averaging, not probability theory; strategies are store-pattern queries, not deep inference.

**Planning (Level 9): GENUINE core, PARTIAL execution.** Means-ends analysis with `$goal`-scoped operators, backward-chain derivability probe (simulated progress with proof note, never store writes), effect chaining within a plan, cost-ranked alternatives, gap reports that fail the plan honestly. Domain operators execute through the skill registry (construction calculators do real math). **But** core operator "execution" in `executePlanSteps` is mostly status labeling — inventory/gap steps compute, teach/research/propose steps emit `awaiting-owner`/`proposed` strings. This matches the authority design (execution is owner-gated) yet means a "7-step plan" contains ~2 computational steps and 5 protocol labels. The plan _text_ discloses statuses, so it is honest — but the intelligence density is low.

---

## I. Levels 10–11 — Perception, voice, web research

**Eyes (Level 10): GENUINE, bounded, honest.** Native PNG decode (CRC-verified chunks, zlib inflate, 8-bit gray/RGB/palette/RGBA) → deterministic color/brightness/structure analysis. JPEG/GIF structural-only, explicitly refused beyond that. No object recognition, none faked. Not wired into the main chat loop (used by legal/WhatsApp surfaces for attachment triage).

**Ears (Level 10): GENUINE, provider-free.** Browser `SpeechRecognition` (on-device) → owner-gated, rate-limited, audited `archie-ears` intake → transcript normalization (control-char strip, 2000-char cap, `speech_detected:false` honesty) → deterministic voiceprint (median voiced pitch vs voice-bank profile, ±30%, honestly labeled lightweight). No cloud STT, no API key anywhere.

**Mouth (Level 10): GENUINE.** `mouth.ts` native prosody planner (sentence-level segmentation, per-unit pitch/rate/pause) consumed by `mobile/voice.ts` via browser `speechSynthesis` with engine-safe clamps. Consent-gated speaking in `voice-session.ts`.

**Web research (Level 11): GENUINE and unusually compliant.** Domain classification → priority-source registry → parallel site-scoped searches (DDG Lite adapter, no keys; Wikipedia adapter) → robots.txt compliance with cached rules and longest-prefix matching → real page fetch + content extraction → cross-source agreement (snippet-level and content-level, raising candidate confidence cap) → early stop → findings stored as **candidate knowledge only** with full provenance. Honest `searched:false`, `sourceFailures`, `reusedCache` fields. Findings cache TTL-bounded.

---

## J. Levels 12–13 — Execution, tools, security, authority

**Execution engine (`execution/engine.ts`): GENUINE, the strongest security surface.** Registered targets only (no code-execution path for unregistered code); schema validation in and out; authority = admin JWT + server-side Owner Secret (PBKDF2, constant-time compare, throttle); initiator allowlists; idempotent-only retries with backoff (network/5xx/429 only); compensation/rollback as depth-1 audited execution; full PENDING→RUNNING→terminal audit; deep secret redaction (`redactDeep`) on results, records, logs, errors.

**Recovery engine (`recovery/engine.ts`): GENUINE.** Deterministic failure classification, policy-table recovery planning, budget cap (3 steps/run), retries re-enter the engine with original input (all gates re-run), authority failures escalate never retry, append-only decision ledger.

**Life-safety gate (`security/life-safety.ts`): GENUINE and correctly designed.** Pattern-based hazard lexicons (high-precision), enforced at archie-chat entry **and** kernel VERIFY on ARCHIE's own output. Honest bounds stated in every verdict: pattern absence ≠ proof of safety; study is always free, only execution/endorsement/instruction of credibly lethal operations is stopped; **no authorization override exists** — owner claims cannot switch it off; resumption is a recorded human protocol that downgrades to caution naming the hazard. Constitution-protected (immutable article + trigger).

**Caveat:** the gate is on `archie-chat` and the kernel — not `archie-core` (Finding C-1). Defense in depth is excellent _on the path that has it_.

---

## K. Levels 14–15 — Cross-system seams

- Persistence: `frelux_archie_*` tables, owner-scoped, hydration once per isolate; collision-proof UUID ids everywhere (H3 fixed).
- Counters: best-effort read-modify-write upsert, honestly documented as diagnostics (last-write-wins under concurrency).
- Consolidation scheduling: time-durable across isolates (cold isolates now consolidate via shared counter).
- Conversation isolation: `conversationId` scoping (audit C-1 fix), episodic hydration, memory re-seed dedupe.
- Registry: `configureCognitiveEnginePersistence(db|null)` — passing null = true in-memory privacy mode (no loads, no learning writes). Real personalization control.
- Anatomy health probes: load real modules and verify bindings live (heart, web research, ears, mouth all probed against actual exports).

No silent seam failures found; all best-effort paths say so in comments and results.

---

## L. Level 16 — UI claims vs reality + special requirements

**UI pages:** no feature placeholders found (all "placeholder" hits are input fields). Admin/archie pages drive real endpoints; the anatomy view renders live probe results, not static claims.

**Internal agents (`internal-agents.ts` + `archie-agents`): PARTIAL — real ledger, no executor.**
Finding L-2 (MEDIUM): `spawn_fleet` creates up to 64 `frelux_archie_internal_agents` rows after a real budget gate (month-to-date spend + active count vs configured budget, honest 429 refusal); lifecycle transitions are a real enforced state machine with append-only events; `record_cost` books to the infrastructure ledger with `assertNotCustomerQuota` (internal usage can never consume customer credits). **But nothing executes agent work.** EXECUTING is a status, not a process — there is no code path where an agent performs its task. This is a lifecycle/budget scaffold awaiting an execution layer. It does not fake work (no fabricated reports found), but the "orchestration" claim outruns the implementation. Recommendation: either wire agent execution through the audited execution engine (registered targets only), or relabel the surface as fleet _bookkeeping_.

**Domain contamination (CRITICAL SPECIAL REQUIREMENT): PARTIALLY REMEDIATED — residue remains.**
Finding L-1 (MEDIUM): the 2026-09-11 domain-capture removal did real work — construction rules/operators/NLU lexicon/calculator moved to `domains/construction.ts` behind a pluggable registry, and unregistered skills yield an honest "capability not installed". But:

- `construction_calc` is still a **core intent** in `nlu.ts`'s INTENTS list and in the general engine's route switch (`engine.ts` case "construction_calc" → `this.domains.handlerFor(...)` — the handler is pluggable, the intent and route are welded).
- **Deterministic construction calculators with "Standard Nigerian construction constants" still live in `engine.ts` itself** (line ~3393 block), plus the cement/price extractor and roofing-sheet knowledge examples.
- The crypto/trading domain (symbols, candles, predictions, trade gate, Binance execution) is welded directly into the core engine and its routes — not behind the skill registry at all.
- Training corpora (NLU ~1,350 utterances, seed facts, conversation corpus) are construction-heavy — acceptable as data, but it biases classification toward the first domain.
- Every shared-layer table name is `frelux_*`, so the "provider-independent" ARCHIE layer is structurally FRELUX-branded (naming coupling, not logic coupling).

None of this is _fake_ — it is all real code doing real work — but it violates the system's own domain-neutrality rule for the core engine. The clean fix: move the remaining calculator/constants/price-extractor into the construction skill, move crypto routes into a `crypto` skill behind the same registry, and rename shared tables behind a config prefix (large migration — schedule, don't rush).

**Gemini boundary: HELD.** Zero provider wiring in `_shared/archie-ai` (the only "Gemini" mentions are the identity answer, the secret scanner's lexicon, and the boundary rule itself). Gemini exists only in the FRELUX app layer as a fallback, with the boundary rule encoded twice (native-intelligence §7 + provider-independence) imported from one source to prevent drift. ARCHIE's self-description ("no Gemini, OpenAI or Claude anywhere in my core") is accurate.

---

## M. Classification matrix & scores

Legend — **Genuine:** real, tested logic doing what is claimed. **Partial:** real core, material gap. **Scaffold:** real infrastructure awaiting its purpose. Honesty column = does it fabricate when it cannot do? (Never found.)

| Component                         | Class                       | Depth (1–10) | Honesty                              | Key bound                              |
| --------------------------------- | --------------------------- | ------------ | ------------------------------------ | -------------------------------------- |
| Knowledge store / facts lifecycle | Genuine                     | 8            | Yes                                  | Bounded consolidation                  |
| Unification & reasoning engine    | Genuine                     | 8            | Yes                                  | Iteration/depth caps, no negation      |
| NLU                               | Genuine                     | 6            | Yes (guards)                         | Pattern-based, small held-out set      |
| Cognitive kernel loop             | Genuine                     | 7            | Yes (test-enforced)                  | Thin phases, delegated work            |
| Memory (context/episodic)         | Genuine                     | 7            | Yes                                  | TF-IDF salience only                   |
| Learning / reinforcement          | Genuine                     | 8            | Yes                                  | Acknowledged no-op paths               |
| Self-evaluation                   | Genuine                     | 7            | Yes                                  | Pattern checks only                    |
| World model                       | Genuine                     | 5            | Yes                                  | Ledger, not predictive                 |
| Reasoning strategies              | Genuine                     | 5            | Yes                                  | Cue-regex → store queries              |
| Planner                           | Genuine core / Partial exec | 6            | Yes                                  | 5 of 7 steps are labels                |
| Web research                      | Genuine                     | 8            | Yes                                  | DDG-Lite only, candidates              |
| Execution engine + authority      | Genuine                     | 9            | Yes                                  | Registered targets only                |
| Recovery engine                   | Genuine                     | 7            | Yes                                  | Budget 3                               |
| Life-safety gate                  | Genuine                     | 8            | Yes                                  | Pattern-based, no override (by design) |
| Eyes (vision)                     | Genuine                     | 4            | Yes                                  | PNG pixels only, not in chat loop      |
| Ears (STT)                        | Genuine                     | 6            | Yes                                  | Browser engine dependency              |
| Mouth (voice out)                 | Genuine                     | 6            | Yes                                  | Browser TTS engine                     |
| Voiceprint                        | Genuine                     | 3            | Yes                                  | ±30% pitch, honestly lightweight       |
| Internal agents                   | **Partial/Scaffold**        | 3            | Yes                                  | **No execution semantics**             |
| archie-chat front door            | Genuine                     | 8            | Yes                                  | —                                      |
| archie-core front door            | Genuine (stale)             | 5            | **Gap: no life-safety/verdict gate** | Parallel path                          |
| Domain neutrality of core         | **Partial**                 | 4            | Yes                                  | Construction+crypto welded in          |
| UI (archie/admin surfaces)        | Genuine                     | 7            | Yes                                  | No placeholders found                  |

**Overall: 7.2/10.** A real, working, honest native intelligence system whose core (knowledge → reasoning → learning → gated execution) is production-grade for its scale, held back by: the ungated legacy front door (C-1), the agent scaffold gap (L-2), core domain contamination (L-1), and uniformly shallow depth outside the core (world model, strategies, plan execution).

### Dependency graph (simplified)

```
ArchieChat.tsx ──chat-client──▶ archie-chat ─┬─ life-safety gate ── security verdict
Assistant.tsx ──stage1-client──▶ archie-core │  (⚠ no gates on archie-core path)
voice-session ────────────────▶ archie-core │
                                             ▼
        runtime registry ──▶ cognitive kernel (15 phases)
                                  │ perception · metacognition · verification
                                  │ creation · security-integrity · world model
                                  ▼
                             native engine substrate
        ┌──────────┬──────────┬──────────┬──────────┬─────────┐
     FactStore  Reasoning   NLU       Memory     Learning  Strategies
        └── domains/registry ◀── construction skill (crypto: NOT via registry)
                                  ▼
                 execution engine ── recovery engine (targets table, owner secret)
                 web research (DDG/Wikipedia, robots-compliant)
                 ears/mouth (browser native), vision (PNG analysis)
```

### Priority recommendations

1. **(HIGH, small)** Add life-safety + security verdict classification to `archie-core` entry, or route it through `archie-chat`. The gate's own documentation says it is the first layer — make that true on every owner path.
2. **(MEDIUM)** Decide the internal-agents story: execution through registered targets, or relabel as bookkeeping. Do not leave EXECUTING as a status with no process.
3. **(MEDIUM, staged)** Finish domain extraction: construction calculators/constants/price-extractor → construction skill; crypto routes → crypto skill behind the registry; keep `construction_calc`/crypto intents as registry-declared intents only.
4. **(LOW, later)** Table-prefix indirection for the shared layer (`frelux_*` → configured prefix), planned as a migration batch — not urgent, it is naming not logic.
5. **(LOW)** Grow the NLU held-out set and add strategy-level regression tests (counterfactual/abductive currently tested lightly).

_All evidence for this report was gathered directly from the repo at HEAD and the live test suite; no production data was modified during the audit._
