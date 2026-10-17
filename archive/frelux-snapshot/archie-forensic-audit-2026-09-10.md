# ARCHIE — DEEPEST-ROOT → OUTER-LAYER FORENSIC AUDIT

**Date:** 2026-09-10 · **Method:** code-traced execution paths + production database state + test inventory. NO modifications made. NO sub-agents. AUDIT ONLY.

---

## A. ARCHIE ROOT MAP — what physically executes

```
Browser (React SPA/PWA)
  └→ archie-chat (edge fn, 1815 ln)  ──auth: JWT + rate limit──→
       CognitiveKernel.cycle()  [_shared/archie-ai/cognitive/kernel.ts, 732 ln]
         ├─ understand()          [native-engine/nlu.ts]          REAL (regex cascade + Naive Bayes)
         ├─ PerceptionEngine      [cognitive/perception.ts]       REAL (modality normalize + secret redaction)
         ├─ substrate.converse() [native-engine/engine.ts 1465 ln] ← THE ACTUAL INTELLIGENCE
         │    ├─ IntentRouter (big switch, 20 intents)
         │    ├─ FactStore       [knowledge.ts]  SPO triples + confidence + provenance + status
         │    ├─ ContextMemory    [memory.ts]    TF-IDF salience, in-memory per isolate
         │    ├─ ReasoningEngine  [reasoning.ts] forward chaining + unification [unify.ts]
         │    ├─ Strategies       [strategies.ts] 11 deterministic reasoning modes
         │    ├─ Planner         [planning.ts]  means-ends over 7 operators
         │    ├─ ToolOrchestrator [tools.ts]    3 deterministic math tools (shunting-yard)
         │    ├─ ResearchPipeline [webresearch.ts] DDG-Lite fetch — the ONLY network call in engine
         │    ├─ SelfEvaluator   [selfeval.ts] contradiction scan, inference stability
         │    └─ OutcomeLearner  [learning.ts]  confidence reinforcement
         ├─ WorldModel           [cognitive/world-model.ts]      typed triple store (1 table)
         ├─ VerificationEngine   [cognitive/verification.ts]    citation/arithmetic verdicts
         └─ Trace persistence    → frelux_archie_cognitive_traces (3 rows in prod)
  Persistence bus: frelux_archie_native_facts (10 rows), _native_outcomes (3), _world_model (6)
Other organs: archie-execute (audited execution engine, 3 targets, 0 runs), archie-whatsapp (real Cloud API
  wiring, 0 accounts), archie-ears (transcript intake; ASR = browser/OS), archie-owner-auth (PBKDF2),
  archie-anatomy (23-subsystem probes), archie-legal/-family/-crypto/-social-connect/-studio/-ingestion.
```

**The engine is 38 files / 12,839 lines of deterministic TypeScript GOFAI. Zero external AI model calls anywhere in `_shared/archie-ai`.** The only network fetch in the engine is the research adapter (DuckDuckGo Lite). ARCHIE_OWN_MODEL is registered and honestly refuses (`ArchieRuntimeNotImplementedError`). Provider independence is real, not marketing.

**Production runtime reality (queried live 2026-09-10):**

| table                           | live rows | meaning                                                                          |
| ------------------------------- | --------- | -------------------------------------------------------------------------------- |
| frelux_archie_native_facts      | 10        | ≈ the 6 boot seeds + situational facts. The knowledge base is essentially empty. |
| frelux_archie_native_outcomes   | 3         | learning has fired 3 times, ever                                                 |
| frelux_archie_cognitive_traces  | 3         | the cognitive loop has run 3 times, ever                                         |
| frelux_archie_world_model       | 6         | world model = 1 processed-task + cited facts                                     |
| frelux_archie_execution_runs    | 0         | execution engine never used                                                      |
| frelux_archie_voice_samples     | 0         | voice bank empty → voice-print can never match                                   |
| frelux_archie_whatsapp_accounts | 0         | WhatsApp organ not connected                                                     |

**Verdict:** ARCHIE is a genuinely-built, well-tested, honest, deterministic symbolic engine that has been _deployed but not yet operated_. Its intelligence at this moment is ~6 seed facts, 10 reasoning rules, 20 NLU regexes, a ~100-utterance Naive Bayes corpus, and template composition.

### Dead / unreachable / duplicated code

- **DEAD (highest-value finding): the entire 11-tool chat registry.** `archie-chat` registers 11 real tools (frelux_status, knowledge_search, web_intelligence, market_intelligence, code_intelligence, property_intelligence, execution_engine_list/run/history, archie_domains, archie_agent_status, sentry_diagnostics — ~600 lines of real DB/exec implementations) and runs a 3-hop tool loop. **Nothing in the native or cognitive engine ever emits a `toolCall` part** (grep across the engine: zero producers). The engine returns text-only parts; the loop never triggers. All 11 tools are unreachable in production. ⚫
- `selectStrategies` can bump kinds (`mathematical`, and any cue-driven kind) that `executeStrategy` has no case for — but the default branch is an **honest refusal** ("declared but not yet implemented natively"), not a fake. 🟢 (with a small naming-vs-execution gap)
- Duplicate intelligence: `rule_part_of_transitivity` (DEFAULT_RULES) duplicates `rule_general_transitivity` (GENERAL_RULES) — same semantics, two rules.
- `compose()` attaches a dummy `nlu: understand("")` to every composed result — the NLU in ConverseResult is not the real parse of the input (it is returned separately at the converse() level, so mostly cosmetic).

---

## B. INTELLIGENCE MAP — where intelligence actually originates

1. **Intent routing** — 20-rule regex cascade → Naive Bayes (trained at boot over ~100 labeled utterances). This decides everything downstream.
2. **Retrieval** — TF-IDF cosine over fact surfaces + episodic turn salience (0.7 relevance + 0.3 recency, 24 h horizon).
3. **Deduction** — forward chaining over SPO facts with real first-order unification (variables `?x` bind strings; conclusions with unbound variables refused — a genuine soundness property; 6-iteration bound; derived confidence = min(premise) × rule weight; full derivation traces; bounded backward search `canReach`).
4. **Specialized strategies** — 11 deterministic modes: causal (BFS over `causes` edges), counterfactual (real intervention: remove a cause, find orphaned effects), consistency (same-SPO-different-object scan), inductive (≥3 validated subjects → generalization _proposals_), abductive/hypothesis (ranked from store evidence only, always status `hypothesis`), probabilistic, temporal, constraint, comparative.
5. **Deterministic computation** — shunting-yard arithmetic, unit conversion, 3 hardcoded construction calculators.
6. **Template composition** — every response is assembled from retrieved facts/reasoning outputs with provenance and epistemic labels. There is no free-text generation anywhere; hallucination is structurally impossible, at the cost of rigid, repetitive phrasing.

The **CognitiveKernel is a wrapper/trace layer over the native engine**, not a second brain: REASON, PLAN, EVALUATE, LEARN, REPEAT phases are recorded as trace annotations (`durationMs: 0`, summary strings) while the real work happens inside `substrate.converse()` (RETRIEVE) and a handful of phases that do execute: PERCEIVE (redaction), MODEL (world writes), VERIFY (citation/arithmetic verdict), REMEMBER (trace persist), IMPROVE (owner-gated proposals). The 14-phase "permanent loop" is thus **partly ceremonial** — honest in its comments ("REASON + PLAN happen inside the substrate") but overstated in its branding.

---

## C. COMPLETE FINDINGS

### CRITICAL

- **C1 — Chat tool layer is dead code.** 11 real tools registered, 3-hop loop present, zero possible invocations (no `toolCall` producer in either engine). Capability surfaces list these tools as operational. Impact: web_intelligence, market_intelligence, property_intelligence, execution_engine_run etc. are unreachable through chat — the main advertised capability gap between what is built and what executes.

### HIGH

- **H1 — Gratitude counts as verification ("success" learning).** `converse()` treats intent `gratitude` or praise regexes ("that's right", "good answer", "well done") as owner confirmation, recording kind `success` → +0.05 confidence + validatedCount+1 on cited facts. Two thank-yous after answers promote those facts to **validated** (`validatedCount ≥ 2 && confidence ≥ 0.6`). "Thanks" is politeness, not fact-checking. This is a self-validation path: ARCHIE's own cited output becomes established knowledge via owner courtesy.
- **H2 — Re-assertion promotes unverified claims.** `FactStore.assert()` on an identical twin adds +0.05 and validatedCount+1; `consolidate()` promotes candidates at validatedCount ≥ 2. A research finding stored twice (e.g., two research passes after cache TTL, or owner repeating a claim) reaches **validated with no independent validation ever**. Promotion has no provenance-quality gate (source weight exists in strategies but not in the promotion path).
- **H3 — Fact-ID collision race across isolates.** `factId() = fact_${Date.now().toString(36)}_${counter.toString(36)}` — the counter is per-isolate module state. Two concurrent edge-function isolates asserting facts in the same millisecond produce identical ids → primary-key conflict or silent `saveFacts` overwrite behavior in `frelux_archie_native_facts`. Edge functions are multi-isolate by design, so this is a live concurrency bug in the persistence path.

### MEDIUM

- **M1 — Ceremonial kernel phases.** REASON/PLAN/EVALUATE/LEARN/REPEAT are trace annotations (see B). The UI/trace presents a 14-phase loop; ~6 phases do real work per cycle.
- **M2 — World model cannot represent time.** Typed triple store (10 entity kinds, open set, confidence, provenance) but no temporal versioning of relations (created_at only), no state transitions, no causality inside the model, no predicted/historical states. ARCHIE cannot reason about change over time in the world model; the only temporal logic in the whole engine is FactStore validFrom/validUntil demotion at consolidation.
- **M3 — Single-intent NLU loses compound requests.** One intent per utterance. The required test — «Do X, but don't do Y, compare A with B, then plan C» — classifies to ONE intent (first cascade match; likely `task_planning` or `correction`); the other three clauses are discarded. No negation semantics (only the correction intent), no multi-goal handling, no reference resolution outside one route (pronoun heuristic: "his/her/their/its" → last capitalized noun in salient owner turns, knowledge_query route only).
- **M4 — Per-isolate state loss.** All engine counters (inferences, confidenceSum, unknownTopicHits, verificationFails, calibration) and ContextMemory live-turns reset when the isolate recycles. Diagnostics/calibration are per-instance noise, not system truth; improvement triggers (unknownTopicHits ≥ 3) reset randomly.
- **M5 — Service-role writes without RLS flow-down.** The engine's persistence writes run through the service-role client passed at boot; correctness depends entirely on code discipline (owner-scoped by convention), not on the database policy layer for these internal tables.

### LOW

- **L1 — Duplicate part-of transitivity rule** (DEFAULT_RULES + GENERAL_RULES).
- **L2 — Contradiction-scan rule is a special case**: fires only on the literal `verified-not` + `is` predicate pair (the general SelfEvaluator scan is the real detector).
- **L3 — Pronoun/coreference resolution** is a capitalized-noun heuristic in a single route; gendered pronoun mapping assumes "his → last male-sounding context" with no actual gender model.
- **L4 — `compose()` stamps `understand("")`** into results (cosmetic data-integrity issue for consumers of ConverseResult.nlu).
- **L5 — Research cross-check is domain-based agreement** (two hits sharing a registrable domain may count as "independent"), not source-independence verification.

### INFORMATIONAL

- Construction specialization of the _default configuration_ (see D/F and the special requirement below).
- Anatomy registry probes 23 subsystems with real probes and reports NOT_OPERATIONAL honestly (ears).
- Execution engine: PBKDF2 owner secret, constant-time compare, idempotent-only retries, compensation keys, redacted audit runs — well-architected, zero production use.
- WhatsApp layer: real Cloud-API protocol (verify token, payload parse, message lifecycle) — zero accounts in prod.

---

## D. FALSE-CAPABILITY CHECK (claimed vs actually implemented)

| Claim / surface                               | Reality                                                                                                                                  | Class                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| "11 chat tools operational"                   | Registered & implemented but **unreachable** (C1)                                                                                        | 🔴 OVERSTATED (dead path)                            |
| "14-phase permanent cognitive loop"           | ~6 phases execute; rest are trace annotations                                                                                            | 🟠 OVERSTATED (honest comments, overstated branding) |
| "World model"                                 | Typed triple store, no temporal/causal/state reasoning                                                                                   | 🟢 REAL / PARTIAL                                    |
| "Ears / voice"                                | Browser/OS ASR (external dependency); engine does transcript sanitization + ±30% median-pitch check vs an EMPTY voice bank               | 🟡 EXTERNAL-DEPENDENT (honestly labeled)             |
| "Eyes / image understanding"                  | Not in engine at all; Gemini Vision lives in the FRELUX app layer                                                                        | 🟡 EXTERNAL-DEPENDENT                                |
| "ARCHIE own model"                            | Registered, honestly refuses                                                                                                             | ⚪ NOT IMPLEMENTED (honest)                          |
| "Research pipeline with source hierarchy"     | Real: domain classification, priority sources, parallel site-scoped search, early stop, candidate-only storage, honest failure reporting | 🟢 REAL / OPERATIONAL                                |
| "Deterministic arithmetic/conversion"         | Real shunting-yard + unit tables                                                                                                         | 🟢 REAL / OPERATIONAL                                |
| "Learning from outcomes"                      | Real mechanism; evidence-quality weak (H1, H2)                                                                                           | 🟢 REAL / PARTIAL                                    |
| "Execution engine with owner authority"       | Real, audited, gated — never executed (0 runs)                                                                                           | 🟢 REAL / OPERATIONAL (unexercised)                  |
| "Spatial / quantitative reasoning strategies" | Selector can choose them; executor honestly refuses                                                                                      | ⚪ NOT IMPLEMENTED (honest refusal)                  |

---

## E. HIDDEN LIMITATIONS (not visible from the UI)

1. Knowledge ceiling: answers exist only for what's in ~10 facts + 6 seeds. Everything else routes to honest "I don't know — teach me / research" paths.
2. Rigidity: responses are templates; phrasing repeats exactly for the same intent.
3. Unification binds strings only — no structured objects, no nested terms, no function symbols; cap 200 bindings.
4. Forward chaining auto-asserts derived facts into the store (inference pollutes the KB; ≥0.6 becomes "validated" immediately — inference products become established knowledge with no owner gate).
5. Episodic memory exists only within one request isolate; prior conversation is re-seeded from the chat history sent by the client — nothing else persists.
6. Naive Bayes corpus is ~100 short utterances; unseen phrasings fall to `knowledge_query` defaults.
7. Market prices, documents, images, voice, social, family answers depend on adapters wired in archie-chat; unwired adapters produce honest refusals (by design).
8. Rate limits on research: DDG-Lite scraping only; no API keys; robots-friendly by construction.
9. `canReach` backward search is bounded to depth 4 and used only diagnostically; the planner does not consume it.

---

## F. DATA / KNOWLEDGE FLOW

```
Owner text → archie-chat (JWT, rate limit, sanitize)
  → kernel.cycle → understand() [cascade→NB] → perception (redact secrets)
  → substrate.converse():
      route(intent) → one of ~20 handlers →
        retrieve: rankFacts(TF-IDF) + memory.retrieve(salience)
        compute: tools (arithmetic/convert) or constructionEstimate()
        reason: strategies/forwardChain as needed
      → compose(template + provenance labels + confidence)
  → kernel: VERIFY (citations re-checked vs store; arithmetic re-executed)
  → MODEL: world.relate (processed-task + ≤3 cited facts)
  → epistemic footer + owner-gate suffix → REMEMBER (trace row)
TEACH: teaching intent → parse "X is/are/has Y" → assert(owner-taught, validated, conflict→uncertain)
RESEARCH: research_request → DDG-Lite searches (priority sources first) → hits →
  candidate facts (low confidence, web-research provenance) — never validated automatically
CORRECT: correction intent → related facts → uncertain; owner replacement asserted validated
LEARN: gratitude/confirm → success (+0.05) | correction (−0.15, uncertain) | failure (−0.12)
CONSOLIDATE (learning improve): merge twins, decay candidates, promote validatedCount≥2 ∧ conf≥0.6,
  demote expired validUntil
```

---

## G. LEARNING-INTEGRITY REPORT (every path that can corrupt knowledge/confidence)

1. **Owner teaching** — authoritative by design (owner authority principle). Can store false owner claims as validated — accepted risk of the authority model, provenance is honest.
2. **Gratitude-reinforcement (H1)** — politeness promotes facts to validated. Corrupts _confidence_, not content.
3. **Twin-reassertion promotion (H2)** — repetition of an unverified claim (research re-runs, repeated teaching) reaches validated without any validation event.
4. **Inference auto-validation** — derived facts with conf ≥ 0.6 enter the store as validated; a bad rule over bad premises launders candidate knowledge into established knowledge silently (derivation traces exist, but status promotion is automatic).
5. **Research candidates** — stored low-confidence, cross-check flag honest, never auto-promoted. Cleanest path.
6. **Correction** — parks contradicted facts uncertain, keeps history, owner replacement validated. No deletion (good for audit, bad for purge-right).
7. **Model-generated claims** — none possible (no free-text generation in engine). Web snippets stored as candidates with provenance.
8. **Consolidation decay is weak** (−0.03) and candidates with validatedCount 0 but conf ≥ 0.15 never expire — stale low-quality candidates persist indefinitely.

---

## H. SECURITY / AUTHORITY REPORT

- Chat: JWT + per-identity rate limit; visitor mode = fresh in-memory engine per request, zero persistence, zero tools — good isolation.
- Owner secret: server-side only (archie-owner-auth), PBKDF2 + constant-time compare, plaintext never stored/logged.
- Execution engine: registered targets only, admin JWT + owner secret for production, idempotent-only retries, compensation, redacted runs. Chat refuses production targets (by code; and the whole chat tool path is dead anyway — C1).
- Perception redacts secrets on ingest; execution redacts results (redactDeep).
- Family invites: SHA-256 hashed, single-use, short-lived. WhatsApp: verify-token protocol.
- Weak points: engine persistence writes with service-role client (M5 — RLS not a defense-in-depth here); factId race (H3); 23-subsystem anatomy probes are unauthenticated read paths for admin UI (verify exposure); the FRELUX-platform RLS posture is covered in the prior platform audit (F1/F2 fixed 2026-09-10).
- No privilege-escalation path found inside the engine: nothing in `_shared/archie-ai` can modify policies, roles, or the authority layer; production execution requires the owner secret verified server-side.

---

## I. TESTING REPORT

- 52 ARCHIE test files (~449 tests, green in CI as of 2026-09-10): native-engine runtime, unification, benchmark, cognitive engine, execution engine, security verdict, ears, connections, PWA architecture/quality, provider independence, stage 1/2 acceptance, cross-domain, global intelligence, code/property intelligence.
- What is genuinely tested: every primitive (tokenizer, NB, TF-IDF, shunting-yard), forward chaining + unification paths, all 11 strategies, planner, learner, selfeval, kernel phases, trace persistence, visitor isolation, execution authority (incl. owner-secret refusal paths), WhatsApp protocol.
- What is NOT tested: multi-user concurrent persistence (H3 race), real network research (adapter doubled in tests — correct, but means DDG-Lite HTML drift would be caught only in production), e2e suite never executed, mobile layer (107 sources untested), archie-chat's tool loop (untested because untestable — it's dead).
- Test quality: high — tests assert honesty properties (refusals, provenance labels, epistemic statuses), not just happy paths.

---

## J. ARCHITECTURAL BOTTLENECKS (deepest → most impactful)

1. **The toolCall contract gap** — the runtime interface defines `toolCall`/`toolResult` parts, archie-chat implements the loop, and no engine produces them. The single deepest architectural disconnect.
2. **Per-isolate engine lifecycle** — no shared state between requests; every multi-turn capability (memory, calibration, improvement triggers) is hostage to client-supplied history.
3. **Empty knowledge base** — the engine's value scales with its fact store; production holds 10 facts. The intelligence exists; the knowledge doesn't.
4. **Intent-switch monolith** — `route()` in engine.ts is a 500-line switch; every capability is a special case rather than a composable flow (the compound-request failure, M3, is structural).
5. **Inference writes to the KB** — reasoning and memory share one store with automatic promotion; no epistemic separation between derived and taught knowledge.
6. **Kernel-as-branding** — the cognitive layer adds real value (perception redaction, verification, world model, traces) but wraps the substrate in phase theater.

---

## K. ROOT-CAUSE TREE (Critical/High)

**C1 dead tools**
Symptom: tools never fire in chat → Immediate cause: no engine emits toolCall parts → Deeper cause: the native engine was built as a text-composition engine; the toolCall protocol survived from an earlier adapter architecture → Root: two generations of architecture (external-adapter era, native era) coexist; the contract seam was never bridged.

**H1 gratitude-learning / H2 twin-promotion**
Symptom: facts reach "validated" without validation → Immediate cause: success = gratitude regex; promotion = repetition count → Deeper cause: no evidence-quality model (provenance weights exist in `evidenceWeight()` but are unused by the promotion path) → Root: the learning system measures _engagement signals_, not _verification events_, because no verification oracle exists in a provider-free engine.

**H3 factId race**
Symptom: rare PK conflicts/lost writes under concurrent chat → Immediate cause: per-isolate counter + ms timestamp ids → Deeper cause: engine was designed single-instance → Root: in-memory-engine mindset carried into a multi-isolate edge deployment.

---

## L. RECOMMENDED REBUILD/UPGRADE ORDER (dependency-aware; NOT implemented — audit only)

1. **Bridge the toolCall seam (C1)** — either have the intent router emit toolCall parts for the 11 registered tools, or delete the registry. Everything else in chat capability depends on this decision.
2. **Evidence-quality gate for promotion (H1/H2)** — promotion requires a real verification event (owner explicit confirm command, cross-source agreement, or rule derivation), not gratitude/repetition; use the existing `evidenceWeight` for source-graded confidence.
3. **Fact-ID strategy (H3)** — DB-generated ids (uuid default) or per-insert collision check; unblocks safe concurrent persistence (also prerequisite for any multi-user future).
4. **Separate derived-vs-taught knowledge stores (or a mandatory provenance-status gate)** — before the KB grows; retrofitting is harder later.
5. **Compound-NLU decomposition (M3)** — multi-intent segmentation (clause split → per-clause routing) once the tool seam exists, because per-clause actions need tools to act.
6. **Kernel phase honesty pass (M1)** — either implement REASON/PLAN/EVALUATE as real stages consuming strategy outputs, or rename the trace phases to reflect substrate delegation.
7. **Knowledge seeding program** — the engine's real bottleneck is content: owner-led teaching + validation passes, research-and-validate cycles. (The engine is ready; it's starving.)
8. **Temporal world model (M2)** — validFrom/validUntil on world relations + state-transition records, if time-varying reasoning is ever needed.
9. Then: e2e execution, mobile-layer tests, lint cleanup (tracked separately).

---

## M. FINAL ARCHIE REALITY SCORES (evidence-based)

| Dimension                | Score  | Evidence                                                                                                                                           |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native intelligence      | 62     | Real deterministic engine, sound unification, honest refusals; but ~empty KB in prod, per-isolate, construction-seeded                             |
| Reasoning                | 60     | Forward chaining + 11 strategies genuinely implemented & tested; narrow (store-bound), bounded, no negation as failure, no probabilistic inference |
| NLU                      | 42     | Real cascade+NB; single intent, no decomposition, no negation, heuristic coreference                                                               |
| Memory                   | 55     | TF-IDF episodic + persisted fact store w/ provenance; per-isolate episodic loss, no long-term episodic table                                       |
| Learning                 | 45     | Real mechanism; engagement-signal evidence (H1/H2), weak decay                                                                                     |
| World model              | 35     | Honest typed triple store; zero temporal/state/causal representation                                                                               |
| Planning                 | 40     | Real means-ends over 7 operators w/ gaps/alternatives/risk; no execution loop, no replanning, static operators                                     |
| Perception               | 30     | Text/code/JSON/CSV real; images external (app layer), ASR browser-dependent; voice bank empty                                                      |
| Research                 | 70     | Best organ: real pipeline, priority sources, cross-check, candidates-only, honest failures                                                         |
| Tools                    | 30     | 3 native math tools reachable; 11 chat tools dead (C1)                                                                                             |
| Execution                | 65     | Audited, authority-gated, compensation-capable; 0 production runs                                                                                  |
| Security                 | 70     | PBKDF2, redaction, visitor isolation, no engine escalation path; service-role writes, ID race                                                      |
| Authority                | 72     | PROPOSE-not-execute enforced, owner-secret server-verified, correction = owner authority                                                           |
| Recovery                 | 45     | Contradiction parking, honest degradation, anatomy probes; no knowledge rollback, execution rollback unused                                        |
| Integration              | 40     | DB-as-bus + traces work; per-isolate state loss, event tables empty                                                                                |
| **Overall architecture** | **55** | Clean layering, honest design culture, real tests — undermined by the tool seam, ceremonial loop phases, and an unexercised production brain       |

**Overall ARCHIE reality score: 55/100** — a genuinely built, honest, provider-free symbolic engine (not a fake — the honesty systems are real and tested), whose actual intelligence today is small and idle: 10 facts in the store, 3 cognitive cycles ever run, 0 tool calls, 0 executions. The gap is not aspiration vs code; it is **code vs operation**.

---

## SPECIAL REQUIREMENT — construction/FRELUX specialization inside general components

Domain-specific logic found in supposedly general ARCHIE components (each verified in code):

1. **SEED_FACTS** (engine.ts): 5 of 6 boot-seed facts are construction (cement bag-mass, screeding, concrete curing, portland-cement, mortar). Baked into the general engine constructor.
2. **DEFAULT_RULES** (reasoning.ts): 3 construction rules (concrete grade/mix, screed thickness×area, cement bag volume) + 1 FRELUX-specific production-authorization rule, alongside genuinely general rules.
3. **NLU corpus** (nlu.ts): construction utterances across knowledge/howto/price/planning intents ("what is screeding", "how do i calculate cement bags", "plan a roofing project").
4. **`construction_calc` intent + calculators** with hardcoded building assumptions (450×225 mm block, 10 m²/litre/coat, 1:2:4 mix) — in the general engine and registered in the capability manifest as a core capability ("construction-calculators").
5. **Market price lookup** is materials-oriented (mi_approved_prices/mi_price_observations wiring in archie-chat).
6. **constructionEstimate()** lives inside the general engine's router.

Domain-NEUTRAL (verified): GENERAL_RULES, all strategies, unify/reasoning core, memory, planner operators (except op_plan_project_phases description), web-source registry (wikipedia/MDN/arxiv/NIST...), cognitive kernel, execution engine, world model.

**Classification:** the reasoning _substrate_ is genuinely domain-general (owner directive §16 was honored structurally), but the engine's **default configuration** is construction/FRELUX-specialized, and ~30% of default knowledge, intents, rules and one capability manifest entry are construction-specific. The engine generalizes only when taught; out of the box it is a construction-domain assistant. This is additive by design and honestly labeled — but "general intelligence" claims should be read as "general substrate, specialized defaults."
