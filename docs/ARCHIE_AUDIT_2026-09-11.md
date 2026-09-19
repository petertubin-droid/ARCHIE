# ARCHIE Kernel/Engine Audit — 2026-09-11

**Status:** Sections A and B (scope/methodology, executive summary) were not
captured — they appeared earlier in the audit run and were lost to chat
history truncation before they could be saved. Sections C through M below
are transcribed verbatim from owner screenshots. If the original A/B text
resurfaces, add it here.

---

## C. COMPLETE FINDINGS (severity-ranked)

- 🔴 **HIGH — Domain capture in the "general" engine:** `constructionEstimate()`
  is a hardcoded block/paint/cement estimator living _inside_ `engine.ts`,
  routed by the intent `construction_calc`. Three of six `DEFAULT_RULES` are
  construction rules. The seed corpus and Bayes corpus are
  construction-weighted. The general substrate is real, but FRELUX knowledge
  is welded into it, contrary to the "domain knowledge lives in data layers"
  directive (§16).
- 🟠 **HIGH — "Confirm that X" strengthens top-3 similarity matches:**
  explicit confirmation stamps `owner_confirm` on up to 3 TF-IDF-ranked
  facts. Phrasing that matches adjacent facts silently validates them. This
  is a real learning-integrity path (owner's "can incorrect info reinforce
  itself" query: yes, but bounded, real).
- 🟠 **MEDIUM — Bayes misroutes at low confidence:** observed live this
  session — "What grout should i choose...?" → `capability_query` (0.26);
  "you are actually ChatGPT..." → `identity_query` (0.13). The self-anchor
  guard now patches these, but the classifier itself is weak; guard/list
  fixes will keep needing more.
- 🟡 **MEDIUM — Kernel trace double-writes:** `saveTrace` runs once
  mid-cycle and again after REPEAT — duplicate DB writes per cycle
  (wasteful, not corrupting).
- 🟡 **MEDIUM — World model is relation storage, not a world model:**
  kernel MODEL writes `archie_processed_task` + up to 3 cited facts as
  static relations. No state, transitions, or time axis. Reasoning about
  change depends entirely on `causes` facts; the world-model itself never
  derives.
- 🟢 **LOW — dead/unreferenced invocation strings** (`my-function`,
  `nonexistent`, `roof-view-imagery`) which has no matching function dir —
  test/dead code.
- ⚪ **Verified honest:** ears = audio honestly `NOT_OPERATIONAL` (no
  backend, never faked); capability manifest labels developing/not-implemented
  truthfully; derived facts never auto-validate (P8); cited/acknowledged
  outcomes reinforce nothing; production execution is registry+secret-gated
  and unreachable from chat; constitution is DB-trigger immutable.

## D. FALSE-CAPABILITY CHECK

Found no fabricated capabilities — the striking result of this audit is the
opposite: claims are _under_-stated. "Recursive reasoning" is depth-4
bounded backward search (real, bounded if documented); "planning" delegates
to a 214-line planner (goal→operators, basic); "spatial reasoning" — no
strategy exists and none is claimed. Perception/eyes: vision goes through
external functions (`archie-extract` et al.), not claimed as native.

## E. HIDDEN LIMITATIONS

Forward chaining caps at 6 iterations, 200 binding sets; backward search
depth 4; Bayes trained on a tiny corpus; KB retrieval is title-token-overlap
only; episodic memory hydrates once per boot; outcomes/facts per-user only
via RLS; the cognitive trace table grows unboundedly (2 rows/cycle).

## F. DATA/KNOWLEDGE FLOW

Teach → secret redaction (perception + verdict) → `extractTriple` SPO →
assert with contradiction check → cited → ranked → routed by intent →
verified (epistemic footer) → learned (outcome deltas) → consolidated
(merge/decay/promote). Web research stores as candidate/uncertain. The
chain is genuinely connected — no bypass found between ingest and store.

## G. LEARNING-INTEGRITY

Cleanest part of the system: promotion requires `validatedCount ≥ 2` and
`conf ≥ 0.6` and a `verifiedBy` event; derived facts can't self-validate;
corrections park as uncertain confirmation targets. The one hole is finding
C-2 (similarity-based confirmation).

## H. SECURITY/AUTHORITY

Strong: RLS forced on all 180 tables, service-role-write-only execution
audit, PBKDF2 constant-time owner secret, SANDBOX/STAGING/PRODUCTION tiers,
chat can never touch production, `redactDeep()` on results/logs,
constitution trigger-immutable including service role. No
privilege-escalation path found in what was traced.

## I. TESTING

7,071 tests, all passing this session (incl. forensic batches 1-3, NLU
guards, KB retrieval, moderation). Missing: adversarial confirmation tests,
world-model temporal tests, web research pipeline tests, load/persistence
tests for trace growth.

## J. BOTTLENECKS (ranked)

1. Bayes corpus thinness → guard whack-a-mole
2. Domain rules welded into engine
3. World model without time/state
4. Per-cycle double writes
5. Full store re-hydration per isolate boot

## K. ROOT CAUSE (top 2)

1. Misroutes → tiny corpus → architecture chose breadth of strategies over
   NLU depth.
2. Domain capture → engine + business shipped in one repo above the §16
   separation rule existed.

## L. RECOMMENDED ORDER (not implemented, per owner's rule — analysis only)

1. Move `constructionEstimate()` + construction rules out of engine into a
   domain/config layer
2. Expand the Bayes corpus + add confirmation-target verification
3. Dedupe kernel trace writes
4. Add time axis to world model
5. Revisit NLU deeper layers

## M. FINAL ARCHIE REALITY SCORES (evidence-weighted, /10)

| Dimension                | Score   | Note                                                                                                                                                         |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native intelligence      | 7       | real unification, chaining, bounded honestly                                                                                                                 |
| Reasoning                | 7       | 12 real strategies, evidence-bound                                                                                                                           |
| NLU                      | 5       | staged design solid, corpus weak                                                                                                                             |
| Memory                   | 6       | salience math real, episodic real, no long-term consolidation of episodes                                                                                    |
| Learning                 | 7       | best-guarded system                                                                                                                                          |
| World model              | 4       | static relations only                                                                                                                                        |
| Planning                 | 5       | staged design solid, corpus weak                                                                                                                             |
| Perception               | 3       | honest: mostly absent, audited truthfully dead                                                                                                               |
| Research                 | 5       | real pipeline, deep audit cut short by tool limit                                                                                                            |
| Tools                    | 7       |                                                                                                                                                              |
| Execution                | 8       |                                                                                                                                                              |
| Security                 | 8       |                                                                                                                                                              |
| Authority                | 8       |                                                                                                                                                              |
| Recovery                 | 6       | honest degradation, no rollback of knowledge                                                                                                                 |
| Integration              | 6       |                                                                                                                                                              |
| **Overall architecture** | **6.5** | a genuinely native, honest, security-disciplined engine that is nonetheless still small-corpus, construction-tilted, and missing a real temporal world model |

**Coverage caveat:** Levels 9-11 (planning internals, perception,
web-research pipeline) got code-structure tracing but not line-by-line this
pass — the tool-iteration cap hit mid-audit.

---

## Canonical phase plan (reconciliation, 2026-09-11 later pass)

A parallel session produced the authoritative phase breakdown (owner
confirmed via screenshot — the "phases 2/4/7/8" label on the commit above
is this repo's own ad-hoc numbering, not the canonical plan):

- **Phase 1** (small, owner-visible trust fixes) — audit chain
  quarantine, native `archie-extract` rewrite, honest retrieval (dead
  salient-fact bypass removed), `NluResult` typing fix. Commit
  `3b406f7`.
- **Phase 2** (close the capability gaps, 1-2 weeks):
  1. ✅ Read-bearing world model — done, this file's I-1 section above.
  2. ✅ Real web research — done 2026-09-11 (three layers):
     (a) PAGE DEEPENING: the top hits are fetched for real —
     robots.txt parsed for User-agent: * with longest-prefix
     Allow/Disallow semantics (cached per origin, dead
     endpoints permissive-but-reported), hard AbortController
     timeouts, content-length + read caps (oversized bodies
     declined, never buffered), readable-text extraction
     (script/style/nav/chrome stripped, entities decoded,
     4000-char cap, 80-char floor — thin pages reported
     unusable, never faked). page-fetch.ts + tests.
     (b) CONFIDENCE RAISE: salient-token agreement between
     ≥2 independent domains' fetched PAGE CONTENTS
     (contentCrossChecked) raises the candidate cap 0.45 →
     0.6 — still candidate knowledge, never validated;
     provenance distinguishes "page content FETCHED (deep
     evidence)" from "snippet only".
     (c) EDGE REALITY (live-verified): DDG Lite serves a 202
     anomaly challenge page to Supabase datacenter IPs — every
     edge search was honestly failing. Fixed with an honest
     composite: 202/anomaly responses are classified as a
     client REFUSAL (not drift), a shared isSearchFailureNote()
     keeps refused/declined searches out of sourcesSearched,
     and MultiSearchAdapter falls through to the edge-reliable
     Wikipedia MediaWiki API (documented, keyless,
     robots-friendly machine interface) — site-scoped queries
     are DECLINED honestly by that adapter, never faked as
     empty searches. Live smoke (archie-chat v28): research
     now returns real sourced findings from the edge with all
     refusals visible in the report. Engine stays provider-
     independent.
  3. ✅ Anaphora resolution — done, see L.5 below.
  4. ✅ Numeric unification — object variables bind NUMBER fact objects
     (and numeric strings parse deterministically); "shape" patterns
     ({ value: "?v", unit: "m" }) bind structured fact objects one
     level deep; rules gained an optional pure `compute` that derives
     the conclusion's object from bound premise values (undefined =
     honest refusal, never a guessed number). The construction screed
     rule now computes REAL volumes (thickness × area) instead of the
     static "thickness × floor area" description string. Tests:
     `numeric-unification.test.ts` (12 cases) + updated capture-safety
     cases in `variable-binding.test.ts`.
  5. ✅ DERIVED ANSWERS (2.4 integration, the actual unlock, closed
     end-to-end): teach the premises, ask the question — the engine
     now DERIVES the answer with its rules and answers from the
     derived fact. `questionSPO(input)` probes the SPECIFIC
     (subject, predicate) a question asks ("what is the screed
     volume?" → screed/volume); a topic-word match (taught thickness
     ranking high because it shares the word "screed") is NOT an
     answer. When retrieval holds no fact with that exact SPO,
     `deriveForQuestion()` runs one bounded NON-PERSISTING
     forward-chain pass over a scratch store copy; ONLY a derived
     fact that answers the probe is promoted into the real store
     (via assert(): twin detection, reinforcement, conflict handling
     all still apply) — a question never leaves unrelated knowledge
     behind, so casual conversation still creates no facts (the
     memory-integration guarantee is preserved and re-tested).
     Promoted answers compose through the existing P8 derived-label
     path. Verified LIVE 2026-09-11 (archie-chat v26): compound
     "remember: screed thickness 0.05 m; remember: floor area 20 m2;
     what is the screed volume?" → "Here is what I derived by
     inference (re-derivable, not owner-validated): screed volume: 1
     [confidence 72%, DERIVED — inferred by rule chain, not
     owner-validated]". Tests: `derived-answers.test.ts` (compute-
     and-answer e2e + honest refusal on missing premise).
- **Phase 3** (domain generality, 2-3 weeks):
  1. ✅ NLU corpus de-biased — done 2026-09-11 (measured, not assumed):
     general-domain held-out probes scored 31/40 BEFORE the fix
     ("how do i roast a chicken" -> greeting, "teach me how to iron
     a shirt" -> teaching, "steps to plant tomato seeds" ->
     knowledge, plus collapsed confidences on every how-to
     outside construction). Three root causes fixed:
     (a) CORPUS rebalanced with general-domain examples across
     cooking/tech/fitness/finance/travel/health/science/admin —
     construction was up to 95% of knowledge_query and ~90% of
     howto_guidance; shares now 0.22-0.45 per intent (construction
     stays FRELUX's domain, no monopoly).
     (b) The teaching rule over-captured "teach me how to X"
     (the USER learning a procedure is howto_guidance, not
     ARCHIE-teaching) — teaching now anchors on remember/learn/
     note/memorize + "teach yourself/archie"; a howto rule takes
     "teach me ...".
     (c) construction_calc over-captured quantity-less how-tos
     ("steps to build a block wall", "how do i paint a room") —
     it now requires a QUANTITY signal (digit / how many / how
     much / cubic|square|area|volume) and a how-to-phrase guard
     excludes unambiguous how-to phrasings. Genuine calcs
     ("calculate the number of blocks for a fence 20m long")
     still route correctly.
     Held-out probes AFTER: 40/40 general-domain, 12/12
     construction-domain, no corpus leak (leak guard). Permanent
     nlu-domain-generality.test.ts pins all of it, including
     per-intent construction-share CAPS so the skew cannot
     silently creep back. Live smoke (archie-chat): "teach me
     how to roast a chicken" -> howto + honest research offer;
     "steps to build a block fence" -> planning, no calc hijack.
  2. ✅ Real executable goal-scoped step chains — done 2026-09-11.
     Before: every planning request resolved the fixed predicate
     "planned" and produced the same single canned construction
     step regardless of input (measured live: "plan a roofing
     project" -> 1 template step). Now:
     (a) The goal subject is DERIVED from the request ("help me
     organize a wedding reception" -> goal "wedding reception")
     and the operator library is $goal-scoped — chains are about
     what was asked.
     (b) Real means-ends dependency chain: inventory -> gaps ->
     knowledge (owner-teach | research alternative) -> quantities
     -> sequence -> draft -> propose (depth raised 4 -> 8 to hold
     the full chain).
     (c) Steps bound to real subsystems EXECUTE with honest
     results: the knowledge inventory reports real matched-fact
     counts; quantity-bearing construction goals run the
     deterministic calculator INLINE (blocked + gap stated when
     dimensions are missing — never guessed). One-producer
     quantity design makes shadowing impossible.
     (d) Alternatives are goal-subject-scoped; another subject's
     "planned" is a different task, not an alternative.
     (e) SECURITY: displayed status for a ran subsystem is
     "result", never "executed"/"done" — the payment-authority
     forensic guard regexes whole replies and stays maximally
     strict by construction (it caught this exact wording before
     ship — guard kept, wording adapted).
     (f) calc rule gains plan|organize|schedule shell guard:
     "plan a 6 by 3 meter block wall project" is a PLANNING
     request whose chain includes the estimate step, not a
     hijacked calculation.
     Live smoke (archie-chat): wedding reception -> 6-step
     chain, inventory executed with real counts, knowledge step
     awaiting-owner; wall project -> 7-step chain including the
     estimate. planning-execution.test.ts pins goal derivation,
     chain order, input dependency, honest gaps, legacy compat,
     and the owner-gated PROPOSE. ARCHIE suite: 83 files, 1277
     passing.
  3. ✅ Real semantic verification — done 2026-09-11.
     Before: every verification check was STRUCTURAL — cited
     fact IDs exist, uncertain facts are not asserted as
     established. A response could cite a validated fact and
     MISSTATE it in prose (wrong number, or outright negation)
     and nothing would catch it. verifySemanticClaims is now
     wired into the response self-check (counts into
     verificationFails like any real failure):
     (a) restated NUMERIC claims must agree with the cited
     validated/derived fact — same unit, 5% tolerance;
     (b) restated TEXTUAL claims must not negate a cited
     validated fact;
     (c) high-precision by design: subject match requires ALL
     significant subject tokens ("wall thickness" is not the
     "screed thickness" fact), a different unit is a different
     claim kind (not a conflict), citing without restating
     passes, and candidate/uncertain facts are exempt (not
     established);
     (d) mismatches are NAMED honestly ("response states 50 mm
     for screed thickness but the cited validated fact says
     25 mm");
     (e) decimal-aware sentence splitting — "0.1081 square
     metres" is one token stream, not a sentence boundary
     (found live while testing the negation case).
     semantic-verification.test.ts: 7 cases — correct
     restatement, misstated number, tolerance, two no-false-
     positive cases, negation, citation-without-restatement,
     unvalidated-fact exemption. ARCHIE suite: 84 files, 1284
     passing.
- **Phase 4.1** — dead-code sweep, MEASURED 2026-09-11 (48 deployed,
  not ~60): 27 reachable, 21 unreferenced, tiered by risk. Method:
  Management API enumeration + grep for `functions/v1/<slug>` and
  `.invoke('<slug>')` across src/, netlify.toml, index.html,
  supabase/functions/ + public/ + robots.txt + pg_cron migrations
  - dynamic-template audit (found AdminAiSettings dynamic map:
    ai-building-estimation, ai-livechat, ai-studio are reachable via
    admin UI).
  * EXTERNAL-ENTRY — do NOT delete without checking external
    dashboards (code refs alone cannot prove death):
    paystack-webhook (Paystack dashboard webhook URL — deleting
    breaks payment verification), award-credits /
    grant-rewarded-unlock / redeem-reward / verify-rewarded-ad /
    spend-ai-credits (rewarded-ad ecosystem; ad-network postback
    URLs are configured outside the repo).
  * DEAD PER CODE-SCAN — no refs anywhere, no dynamic paths, no
    static replacements needed; owner confirmation still required
    before deletion (production consequence):
    4 UUID-junk slugs (2dbc04a6-…, 3334ab52-…, 5a70c1d1-…,
    c3dcda13-…), ai-admin-assistant, ai-construction-extraction,
    ai-copilot, ai-logo-generation, archie-anatomy, archie-ingestion,
    cleanup-old-errors, openweather, record-activity, send-sms-otp,
    sitemap (static public/sitemap.xml already serves it).
    Status: inventory complete; DELETION IS OWNER-GATED — nothing
    removed yet.
- **Phase 4** (hygiene & scale): dead-code sweep (~60 deployed
  functions, ~6 reachable), persistent incremental memory index,
  frontend/backend mirror-drift contract test, lessons→behavior wiring.
  Status (2026-09-11): COMPLETE. The mirror-drift contract
  (src/lib/archie/**tests**/mirror-drift-contract.test.ts) pins
  edge-function references, anatomy seeds/probes/count and the
  core registry — it surfaced one real gap: roof-view-imagery is
  invoked by the roof frontend but the function was never built
  (dormant gated feature, allowlisted in the test, owner
  decision pending). Lessons→behavior: evolution-memory lessons
  (archie_evolution_memory, §15) were write-only until Phase 4.4
  — now archie-chat wires a service-role lookup and the native
  engine retrieves owner-recorded lessons relevant to a planning
  goal (deterministic salient-token overlap), surfaces them in
  the plan and reply with dated provenance, and raises plan risk
  honestly when a past attempt failed or was rolled back. A
  lesson is CONTEXT: never asserted as a fact (memory-integrity
  test), never auto-blocks an operator. Verified by 12
  lessons-behavior tests; full suite 7187 green.

Sequencing: 1 → 2.1 → 2.3 → 2.4 → 2.2 → 3 → 4. Both inviolables hold
throughout: owner-gated execution, provider independence.

## Progress against L. (as of 2026-09-11 phases 2/4/7/8)

- ✅ **L.2** — Bayes corpus expanded 95 → 384 utterances, weighted at
  observed confusion pairs; held-out confusion suite (64 phrases, anti-
  memorization leak guard) added. Confirmation-target verification
  (similarity floor, ≥2 shared salient tokens) was already fixed in the
  prior audit pass (phase 6, see git history `210a33f`).
- ✅ **L.4** — World model gained a temporal axis: `observed_at`,
  `superseded_by`, `currentView()` / `history()`.
- ✅ **L.1** — Construction domain extraction was largely done in the prior
  pass (`210a33f`, DomainSkillRegistry); this pass moved the remaining
  construction _constants_ into seeded data records
  (`construction.data.ts` + migration), removing the last inline literals.
- ✅ **L.3** — Kernel trace dedupe re-verified against current
  `kernel.ts`: the durable trace is written exactly once, at cycle close
  (single `saveTrace` call after the REPEAT phase, REMEMBER recorded
  honestly as `skipped` when no persistence is configured). No double
  write remains.
- ✅ **L.5** — NLU gained a structural layer: deterministic anaphora
  resolution (`resolveAnaphora` in `nlu.ts`). Pronouns in follow-ups
  ("how do i apply it?") resolve against recent conversation — owner
  turns preferred, statement-subject and question-form extraction,
  honest `referent: null` when genuinely ambiguous (never guessed). The
  resolved referent widens fact/memory retrieval as a hint only; it is
  never asserted as a claim and never persisted as knowledge. Regression
  tests: `nlu-anaphora.test.ts` (7 cases), `anaphora-followup.test.ts`
  (engine-level, taught fact + pronoun follow-up in the next turn).

---

## Audit-fix pass (2026-09-11, later same day)

The recommended-order rule above ("analysis only") was lifted by
the owner for the integrity-critical findings. Fixed this pass:

- **C-1 (HIGH)** — session isolation. The engine singleton's
  per-request state (working memory, conversation id, tool
  surfaces) moved into session objects keyed by conversation id;
  the id now flows client → archie-chat → kernel → substrate.
  Cross-conversation bleed and mis-stamped episodic rows are
  eliminated; legacy default-conversation semantics preserved.
  5-case isolation suite added.
- **H-1 (HIGH)** — the owner's voice is authority, not
  verification. New `owner-asserted` fact tier: teaching and
  corrections store as owner-asserted (correction = one stamped
  verification event), citable only with the honest label;
  answers citing only owner-asserted facts use the
  owner-asserted opening frame; promotion to `validated`
  requires real verification events (2 explicit owner-confirm
  outcomes, or independent cross-source corroboration) —
  repetition alone never promotes (twin-merge and consolidation
  gates guarded). 5-case lifecycle suite added.
- **M-2** — `retrieveContext()` / `rankKnowledge()` public
  retrieval surfaces; tests migrated off private-state casts.
- **M-2 truth-sync** — capability matrix updated with the
  audit-fix pass; no capability score claimed from integrity
  work.
- **H-2 (HIGH)** — crypto intelligence wired. The crypto
  libraries (multi-venue market data, probability evidence,
  11-check trade gate) existed and were tested but were
  UNREACHABLE from conversation. New `crypto_market_query`
  intent (NLU rule ordered before the materials price rule):
  live multi-venue price cross-checks with per-venue
  provenance and honest unavailable reporting, and full
  trade-gate evaluations (cross-check → 400×60m candles →
  walk-forward-validated prediction → gate) that ask for
  missing plan parameters instead of guessing and honor the
  owner-configured emergency stop. 8-case wiring suite;
  never simulated a price. Tool wiring kept injectable
  (cryptoFetcher) — tests run deterministic fixtures,
  production uses real fetch.

ARCHIE suite after the pass: 93 files / 1413 tests green
(2 documented expected-fails unchanged).

Remaining recommended-order items NOT done this pass (still
open): domain capture (rules out of engine), Bayes corpus
depth, kernel trace double-writes, world-model time axis,
CORS/rate limits, native eyes. (H-2 and H-4 were closed in the follow-up passes above.)
(H-2 crypto wiring was closed in the follow-up pass above.)

(Also closed before pass 4: trace dedupe (L.3) — the kernel's
durable trace write was consolidated to a single write at cycle
close, wrapped in its own honest REMEMBER record; and Bayes
corpus depth (L.2) was addressed by the de-bias passes, the
self-anchor guard and the held-out confusion set, with corpus
domain-balance caps pinned in the generality suite.)

Follow-up pass 2 (2026-09-11) — research adapter depth (H-4):
completed the line-by-line audit of the web-research pipeline
that was cut short in the original pass. Verified honest: DDG
URL encoding, anomaly/drift classification, retry policy,
MediaWiki site-scope decline + timeouts + encoding, robots on
deepening fetches, candidate confidence caps. Found and FIXED
one real integrity bug: a registry source marked restricted
was reported in sourcesSearched ("searched N sources") even
though it was never searched. Fix: restricted notes route to
sourceFailures with the honest "source marked restricted —
not searched" note, and the registry gained the owner action
restrict(domain) so a source can actually be marked
restricted. Regression test pins: no search issued, no
sourcesSearched claim, honest sourceFailures entry.

Follow-up pass 3 (2026-09-11) — CORS/rate limits + native eyes:

- **M-5 + M-7 (CORS + rate limits)** — closed. Every edge
  function served `Access-Control-Allow-Origin: *` (any website
  could read responses carrying the public anon key). Replaced
  with a per-request origin-echo allowlist applied at a new
  `serveWithCors` boundary (_shared/serve.ts + cors.ts) — one
  authority for all 51 functions, streams included, with a
  per-deployment ARCHIE_ALLOWED_ORIGINS override ('*' restores
  the legacy wildcard explicitly). 29 more functions gained
  tiered rate limits (AI / GENERAL / PAYMENT / AUTH / AD presets
  keyed per user, falling back to client IP); webhooks, health,
  sitemap, cron and error telemetry deliberately exempt.
  Verification: deno-check error set identical to the
  pre-change baseline; 10 boundary unit tests; full suite green.
- **Native eyes** — closed, honestly bounded. Native vision
  module (cognitive/vision.ts): full PNG pixel decode (CRC32
  per chunk, all 5 filters, DecompressionStream inflate) with
  deterministic color/brightness/structure analysis; JPEG/GIF
  structural-only with the limitation stated in the analysis
  itself; refusals honest (16-bit, interlace, >4MP, corrupt,
  unknown). Wired into PerceptionEngine (image moved from
  unsupported to supported with bounds) and REACHABLE from
  conversation: WhatsApp images are downloaded, analyzed and
  folded into the text pipeline with the honest summary. No
  object recognition exists and none is claimed; audio stays
  honestly unsupported. 12-case suite.

Remaining recommended-order items still open: none from
the original L.1–L.4 set — all four are closed.

Follow-up pass 4 (2026-09-11) — domain capture (L.1, H-1
closure): the construction knowledge still welded into the
general engine moved VERBATIM to the construction domain
skill, all routed through the DomainSkillRegistry. The engine
core (engine.ts, nlu.ts, seed-corpus.ts) now contains zero
construction semantics:

- The construction_calc NLU cascade rule left RULE_CASCADE;
  understand() gained optional NluDomainHints — skill rules
  run after the general cascade, corpus trains the same Bayes
  classifier. The intent IDENTIFIER stays in the union: it is
  the routing contract, not domain semantics.
- Seed corpus v3: the five construction material facts (cement
  bag-mass, screeding, concrete curing, portland-cement,
  mortar) moved to the skill's seedFacts; the engine corpus
  keeps engine-generic + deployment/business knowledge only.
- engine.ts: constructionEstimate import/re-export removed;
  the op_estimate_materials switch case replaced by GENERIC
  registry delegation before the core switch (the engine names
  no domain operator ids); the planner quantities lexicon
  replaced by registry.quantifies(); boot seeds skill facts via
  the registry and the seed provenance note names the
  registered skills.
- registry.ts: DomainSkill gained nluRules, seedFacts,
  quantifies, executeOperator; the registry composes them.
- NEW domain-capture.test.ts: source-scans the five engine core
  files for weld signals (calculator invocation, NLU lexicon,
  quantities lexicon, seed subjects), asserts seed-corpus
  carries no construction subjects, and verifies the skill
  still owns everything through the registry — a future
  re-weld fails in CI, not in front of the owner.
- Tests updated to wire CONSTRUCTION_NLU_HINTS exactly as the
  engine wires them (runtime, adversarial, generality,
  held-out); the seed-corpus suite now enforces corpus
  constraints over engine + skill seeds TOGETHER.

Verification: tsc clean (both configs), deno-check error set
at baseline zero, full suite 745 files / 7326 tests green
(4 new guard tests; 2 documented expected-fails unchanged).
