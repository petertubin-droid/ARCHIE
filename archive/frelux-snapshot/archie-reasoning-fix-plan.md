# ARCHIE REASONING FIX PLAN — DRAFT (NOT IMPLEMENTED)

**Date drafted:** 2026-09-10 · **Basis:** `archie-forensic-audit-2026-09-10.md` (findings C1, H1, H2, H3, M1–M5)
**Goal:** Make ARCHIE reason like a fluent agent — decompose compound requests, use its tools mid-reasoning, validate its own learning, compose natural responses, and persist knowledge honestly — while keeping its core 100% provider-free (no Gemini/OpenAI/Claude anywhere, per the permanent architecture).

---

## 0. GUIDING CONSTRAINTS (non-negotiable, from the audit + owner directives)

1. **Provider independence stays.** No external AI model enters the engine. Every upgrade below is deterministic, in-engine, testable.
2. **Honesty stays.** Every new capability must have an honest refusal path. Nothing fakes reasoning.
3. **Owner authority stays.** Nothing auto-executes consequential actions; learning never grants authority.
4. **Workflow rules:** batches of ≤4 changes → commit AND push immediately; tests only on touched files per commit (CI runs the full suite); never sub-agents for FRELUX work.

## 0.1 PHASE DEPENDENCY MAP

```
P0 fact-id safety (H3) ────────────────┐
P1 toolCall seam (C1) ──────────────┐   │
P2 compound-NLU decomposition (M3) ─┼──► P5 multi-step reasoning loop
P3 evidence-quality learning (H1,H2)│   │
P4 knowledge seeding (empty KB) ───┘   │
P6 response composer (fluid phrasing) ◄┘
P7 kernel honesty pass (M1)
P8 episodic persistence + cross-isolate state (M4, partial M2)
P9 derived-vs-taught store separation
P10 temporal world model (OPTIONAL, only if time-varying reasoning is needed)
```

---

## PHASE 0 — Fix the fact-ID race first (H3) — SIZE: S

**Why first:** every later phase writes more facts concurrently; the ID race (`fact_${Date.now}_${per-isolate counter}`) becomes a live PK-collision bug the moment traffic grows.

**Changes (1 batch = 2 changes + tests):**

1. `native-engine/knowledge.ts` — replace `factId()` with a collision-proof scheme: `crypto.randomUUID()` (available in edge runtime; no runtime-API import at module top level, matching ears.ts convention).
2. `native-engine/persistence.ts` — `saveFact` switches to upsert semantics on id conflict (belt-and-braces).

**Acceptance:** new test `fact-id-concurrency.test.ts` — 500 parallel asserts across 10 simulated isolates → zero id collisions, zero lost writes. Existing 449 suite stays green (touched-file tests run locally; full suite in CI).

---

## PHASE 1 — Bridge the toolCall seam (C1) — SIZE: M — _the keystone_

**Why:** all 11 real chat tools are dead code; no engine emits `toolCall` parts. Until this seam exists, ARCHIE cannot _act on_ its reasoning (look up a price, inspect a site, check status), which is the single biggest "doesn't reason like an agent" gap.

**Changes (2 batches):**

- **Batch A (engine side):**
  1. `native-engine/engine.ts` — extend `ConverseResult` with `toolCall?: { name: string; args: Record<string, unknown> }`; in `route()`, the price_query / documents/images/voice/social/family / system_status handlers emit a toolCall INSTEAD of the "adapter not wired" refusal when the deployment declares the tool available. Add a constructor option `availableTools: string[]` (the chat deployment passes its 11 tool names; tests pass doubles).
  2. `runtime.ts` — extend the `ArchieRuntime` inference result contract so `parts[]` may carry `toolCall` (the protocol already defines it — the type just needs to permit it).
  3. `cognitive/kernel.ts` — `generate()` maps `result.toolCall` into the returned parts; VERIFY phase treats a pending toolCall as "not yet verifiable" (honest epistemic status, not VERIFIED).
  4. Test: `toolcall-emission.test.ts` — price query with market tool available → emits toolCall; with no tool declared → honest refusal (both assertions).
- **Batch B (chat side):**
  1. `archie-chat/index.ts` — feed the tool's real output back as a `toolResult` turn and run a second inference pass (the 3-hop loop already exists — it just needs a producer).
  2. The native engine gains a small `resumeWithToolResult()` path: the router sees a trailing `toolResult` in history and composes the final answer FROM the real output (provenance: the tool name + run id — never fabricated).
  3. Rate-limit + audit every toolCall turn in chat (reuse existing rate limiter).
  4. Test: `chat-tool-loop.test.ts` — full round trip: question → toolCall → toolResult → final answer cites the tool output.

**Acceptance:** asking ARCHIE in chat "what's the price of cement" returns a real mi_approved_prices answer; "inspect this URL" runs web_intelligence; production execution targets still refuse in chat.

---

## PHASE 2 — Compound-NLU decomposition (M3) — SIZE: L — _the core reasoning fix_

**Why:** today one utterance = one intent; «Do X, but don't do Y, compare A with B, then plan C» loses 3 of 4 clauses. Real reasoning needs a plan-of-clauses.

**Changes (3 batches):**

- **Batch A — segmenter:**
  1. New `native-engine/clauses.ts` — deterministic clause segmentation: split on coordinating conjunctions (but/and then/then/also/plus), semicolons, imperative boundaries (a new verb-first token after a comma/period), keeping quoted material intact. Pure function, table-driven, fully testable.
  2. `nlu.ts` — `understand()` keeps its single-intent contract (zero regression), new `understandMulti(input)` returns `{ clauses: Array<{ text, nlu }> }`; segments of length 1 short-circuit to today's exact behavior.
  3. Tests: `clauses.test.ts` — the required case plus 20 others («compare A and B then tell me which is cheaper», negations, questions with embedded "but").
- **Batch B — negation semantics:**
  1. `clauses.ts` — negation markers (don't/never/avoid/except/not) attach a `negated: true` flag to their clause's intent.
  2. `engine.ts` — a negated clause inverts the action: a negated research_request doesn't search; a negated teaching stores the constraint as `verified-not` (feeding the existing contradiction rule honestly); a negated plan-step excludes that step.
- **Batch C — multi-clause execution:**
  1. `engine.ts` — `converse()` routes each clause through `route()` sequentially (bounded to 5 clauses; over-limit gets an honest "I handle up to 5 requests at once"), collecting each result.
  2. New `native-engine/synthesis.ts` — deterministic synthesis of per-clause results into ONE coherent answer: ordered by the user's clause order, connected by discourse markers, shared subject elided (the pronoun-resolution state carries across clauses — fixing coreference for free).
  3. Per-clause toolCalls queue and execute in order (Phase 1 loop handles them).
  4. Tests: `compound-requests.test.ts` — the full required case end-to-end + tool + negation combos.

**Acceptance:** the audit's test sentence produces 4 clause results, executes/plans/refuses each correctly, and reads as one composed answer — no clause silently dropped. Single-clause behavior byte-identical to today (regression-guarded).

---

## PHASE 3 — Evidence-quality learning gates (H1, H2) — SIZE: M

**Why:** "thanks" and repetition currently promote facts to _validated_. For ARCHIE's reasoning to be trustworthy, confidence must track verification, not engagement.

**Changes (2 batches):**

- **Batch A:**
  1. `engine.ts` — gratitude/praise NO LONGER records `kind: "success"`; it records a new `kind: "acknowledged"` (no confidence effect). Explicit confirmations only ("you were right about X", "confirm that") require naming the subject — `kind: "success"` fires only then.
  2. `learning.ts` — promotion gate: `validatedCount ≥ 2` is no longer sufficient. Promotion to _validated_ requires at least one `verificationEvent` (owner-explicit confirm, cross-source research agreement, or rule derivation with seed/owner premises). Add `verifiedBy: string[]` to the Fact type (schema additive).
  3. `knowledge.ts` — twin re-assertion increments confidence ONLY if the new assertion has _different provenance_ (owner-teach vs research vs seed); same-source repeats add a diminishing +0.02.
- **Batch B:**
  1. `strategies.ts` — the existing `evidenceWeight()` provenance weights now feed the probabilistic strategy and the promotion gate (one source of truth).
  2. `consolidate()` — candidates with zero verification events and conf < 0.35 now decay to drop range after 30 days (real forgetting; today they linger forever).
  3. Tests: `learning-gates.test.ts` — gratitude does NOT promote; two different-provenance assertions + one confirm DO; research-only repetition does NOT.

**Acceptance:** no path to _validated_ without a real verification event. The audit's G-report table reruns clean.

---

## PHASE 4 — Feed the brain: knowledge seeding + owner teaching flow — SIZE: M

**Why:** the engine reasons over a 10-fact store. Reasoning quality is knowledge-bound; the substrate is ready and starving.

**Changes (2 batches):**

- **Batch A:**
  1. New `native-engine/seed-corpus.ts` — move SEED_FACTS out of engine.ts into a versioned corpus file (construction stays the DEFAULT domain but becomes swappable per deployment — closing the "general substrate, specialized defaults" classification honestly).
  2. Add the FRELUX-domain corpus: screeding systems, em_engine settings semantics, pricing buckets, ARCHIE's own architecture (the fact ARCHIE cites about itself today is one seed line).
- **Batch B:**
  1. New owner command "teach ARCHIE" flow (edge function `archie-teach` or extension of archie-chat): batch teach from a document paste → clause-split into SPO candidates → owner reviews a diff of proposed facts → validated on approval (owner authority, provenance-stamped).
  2. Research-validate loop: after `research_request`, a follow-up "validate these findings" command promotes cross-checked findings through the Phase 3 gate with owner sign-off.
  3. Tests: `seed-corpus.test.ts`, `teach-flow.test.ts` — teaching N facts stores N owner-validated facts; conflicting teach surfaces the contradiction, doesn't overwrite.

**Acceptance:** knowledge store grows from 10 to a corpus of hundreds (owner-approved), and knowledge_query answers cite real stored facts instead of routing to "teach me".

---

## PHASE 5 — Multi-step reasoning loop (REASON/PLAN become real) — SIZE: L

**Why:** after P1+P2, ARCHIE can decompose and act — now give it a genuine reason→act→observe→continue loop instead of one-shot routing.

**Changes (3 batches):**

- **Batch A:** new `native-engine/reasoning-loop.ts` — bounded iterative controller: decompose (P2) → per-clause: retrieve → select strategy (existing `selectStrategies`) → execute or emit toolCall (P1) → observe result → revise or finish. Budget-bounded (max 6 steps, max 2 tool hops) with an honest "I stopped at the budget" report.
- **Batch B:** `kernel.ts` — REASON/PLAN/EVALUATE phases stop being annotations: the kernel calls the loop controller and records real outputs, durations, and step traces per phase (this folds the M1 honesty fix for those three phases into real work rather than renaming).
- **Batch C:** strategy upgrades where evidence exists in store: comparative (real dimension extraction — numeric fields in stored objects), constraint (bound-checking over quantities), temporal (validFrom/validUntil window queries). Each keeps its honest refusal when the store lacks the needed predicate.

**Acceptance:** a question like "compare granite vs sand prices in my market and tell me which is cheaper for a 30 m² screed" — impossible today — routes comparative + price toolCalls + construction calc through the loop and returns one verified answer with per-step trace.

---

## PHASE 6 — Response composer (fluid, honest language) — SIZE: M

**Why:** current answers are rigid templates — the most visible "doesn't feel like an agent" symptom, and the safe half of "reasoning like Vesper" (fluency without fabrication).

**Changes (2 batches):**

- **Batch A:** new `native-engine/composer.ts` — deterministic discourse composer: builds answers from result parts (facts with provenance, tool outputs, plan steps, hypotheses) using varied sentence frames selected by a stable hash of the content (same input = same output; different content = different phrasing). Content NEVER changes — only connective tissue and ordering. Maintains the epistemic labels exactly as today.
- **Batch B:** personalization layer (optional flag): tone/verbosity set by owner profile (concise/detailed), stored in owner settings — the engine stays deterministic; the profile selects among composed variants.

**Acceptance:** same factual content as today's engine (test asserts identical cited facts and epistemic statuses), phrasing varies naturally; zero new hallucination surface (composer only reorders/frames parts that already carry provenance).

---

## PHASE 7 — Episodic memory + cross-isolate state (M4) — SIZE: M

**Changes (2 batches):**

1. New table `frelux_archie_episodic_turns` (owner-scoped, RLS, owner consent-gated via the existing personalization_memory flag) — ContextMemory salient turns persist; retrieval hydrates them first.
2. Improvement/calibration counters (`unknownTopicHits`, `verificationFails`, `inferences`) move to a small `frelux_archie_engine_counters` table (or derive from traces) so IMPROVE proposals and diagnostics stop resetting per isolate.
3. `memory.ts` — relevance floor + dedup already exist; add session grouping (conversation id) to retrieval.
4. Tests: `episodic-persistence.test.ts`, `counter-persistence.test.ts`.

**Acceptance:** a fresh chat request recalls owner-taught episodic context from a previous session (when consent on); diagnostics report system-wide numbers, not per-isolate noise.

---

## PHASE 8 — Derived-vs-taught knowledge separation — SIZE: M

1. New `frelux_archie_derived_facts` table (or `status: "derived"` + `derivedFrom` chain in one store) — forward-chaining output stops auto-entering the validated KB; derived facts feed answers with explicit "derived" epistemic labels and re-derive instead of persist.
2. `reasoning.ts` — derived confidence ≥ 0.6 no longer auto-"validates"; promotion follows Phase 3 gates.
3. Tests: `derived-store.test.ts` — derived facts survive re-derivation, never appear as owner/validated knowledge, contradiction with a taught fact parks the DERIVED one (owner wins).

## PHASE 9 — Kernel honesty completion (M1 remainder) — SIZE: S

RENAME (not fake): remaining ceremonial phases become explicit `delegated` status in traces with the substrate component named — OBSERVE/LEARN/REPEAT recorded as delegated when they are, executed when the new loop actually runs them. Anatomy + UI read from the same statuses. Tests assert no phase is ever labeled "executed" without measured duration > 0 or a real artifact.

## PHASE 10 (OPTIONAL) — Temporal world model (M2) — SIZE: M

Only if time-varying reasoning is a real product need: add validFrom/validUntil + `superseded_by` to world relations, a `transition` relation kind, and a temporal strategy querying windows. Not required for "reasons like an agent" — defer unless a use case lands.

---

## EXECUTION ORDER & MILESTONES

| Milestone             | Phases            | Delivers                                                             |
| --------------------- | ----------------- | -------------------------------------------------------------------- |
| M1 — Safe foundations | P0 + P3           | No races; learning only from real evidence                           |
| M2 — Acting agent     | P1 + P4           | Tools live; brain fed                                                |
| M3 — Reasoning agent  | P2 + P5           | Compound requests, multi-step loop, real kernel phases               |
| M4 — Fluid agent      | P6 + P7 + P8 + P9 | Natural phrasing, persistent memory, clean epistemics, honest traces |

Rough sizes: P0 S · P1 M · P2 L · P3 M · P4 M · P5 L · P6 M · P7 M · P8 M · P9 S · P10 optional. Total ≈ 17 batches, each ≤4 changes, each committed AND pushed with touched-file tests (CI runs the full suite). No sub-agents.

## RISKS / OPEN QUESTIONS (for owner decision before implementation)

1. **Deno/global sandbox choice for decomposition** — clause segmentation quality is the ceiling of P2; if segmentation mis-splits, answers mis-scope. Mitigation: conservative splitter (falls back to single-clause when unsure) + the regression guard.
2. **Tool-call security surface** — P1 re-enables 11 tools in chat; execution_engine_run stays sandbox/staging-only, but the audit should re-verify rate limits + redaction on each tool's execute path before merge.
3. **Phrasing variance vs determinism** — P6's hash-seeded variance must never vary content; tests assert byte-stable outputs per input.
4. **Whether "like Vesper" also means open-domain chat** — that is NOT in this plan: open-ended generation is structurally out of scope for a provider-free engine (and should stay so). Fluency here = composition, not generation. Confirm the boundary.
5. CI status of the four audit-fix commits (febdea9, 8fe54d5, 4d41625, 50cf760) should be confirmed green before P0 starts.

**Nothing in this plan has been implemented. Draft for review.**
