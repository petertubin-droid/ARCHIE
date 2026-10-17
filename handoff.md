# ARCHIE Engineering Handoff: Production Gaps and Full-Agent Readiness

**Audit date:** 2026-10-17  
**Repository:** [`petertubin-droid/ARCHIE`](https://github.com/petertubin-droid/ARCHIE)  
**Branch audited:** `main`  
**Audited HEAD:** `a0f161c80578754bc33b41938fb97bd745825702`  
**Purpose:** Give the next engineer a prioritized, evidence-based worklist for making ARCHIE reliable and more capable without overstating what it can do.

## Executive summary

ARCHIE has substantial deterministic reasoning, tools, memory, verification, security gates, and an extensive test suite. It is not yet a generally capable, continuously operating AI agent. The most immediate release blockers are observable on the audited HEAD: CI reports four failing tests, and the latest edge-function deployment attempted 26 deployments and failed all 26 because GitHub Actions supplied an invalid Supabase access token. The server-side ARCHIE model runtime explicitly reports itself non-operational. The maintenance scheduler is described as paused in a newer operations note, despite an older audit describing it as active.

Treat capability and operational claims as separate: a code path or passing unit test is not proof that the deployed system, external credentials, scheduled jobs, or production data are live and healthy.

## Audit scope and confidence

Reviewed the public GitHub repository tree and current source on `main`, including README, CI/deploy workflows, the September 16 gap audit, October 10 scheduler pause note, capability/performance documents, native runtime selection, agent worker, core runtime modules, and the latest GitHub Actions logs. Queried current repository metadata, recent workflow runs, security-alert endpoints, and main-branch protection status.

This was a remote source/repository audit, not a local clean-room install or a production Supabase/edge-function/database inspection. No production query, migration, deployment, secret change, or runtime request was made. Findings below are marked **verified in source/GitHub** or **requires live verification** accordingly.

## P0 — unblock release and trustworthy verification

### 1. Latest CI is red: four tests fail on audited HEAD

**Evidence:** GitHub Actions CI run [38958794745](https://github.com/petertubin-droid/ARCHIE/actions/runs/38958794745), commit `a0f161c`. Type-check passed; Vitest finished with **4 failed, 3,105 passed, 2 expected-fail, 1 skipped** across 262 files.

- `supabase/functions/_shared/archie-ai/native-engine/__tests__/calculation-trace.test.ts`: three failures. The statistics query returns no recorded computation; arithmetic and unit-conversion cases cannot find the expected trace records. The commit message says these calculation traces were ported, but the new tests show the trace integration is not working for those paths.
- `supabase/functions/archie-escrow/index.test.ts`: “accepts by window lapse only when it has truly lapsed” expected HTTP 409 for a premature acceptance but received 200. This is a potentially consequential escrow acceptance-window behavior, not just a cosmetic test failure.

**Next work:** Reproduce each failure on a clean checkout; fix the implementation or correct a demonstrably invalid test without weakening the intended safety behavior; add focused regression tests; rerun the full suite and type-check. For escrow, test timestamps at just-before, exactly-at, and after the acceptance boundary, including timezone and clock control. Do not merge while CI is red.

**Done when:** full CI passes on a fresh commit; escrow cannot be accepted before its defined window; real calculations create trace records with inputs, operation, result, and honest verdict; traces do not change the computed answer when persistence fails.

### 2. Edge deploy is blocked by an invalid Supabase Actions credential

**Evidence:** Latest deploy run [38958794950](https://github.com/petertubin-droid/ARCHIE/actions/runs/38958794950) attempted **26** function deployments to project ref `hqhvlkunkdrxyuvziorm`; all 26 failed with Supabase CLI `401: Invalid access token`. Zero functions were deployed; post-deploy health checks were skipped.

**Next work:** A project/workspace owner must rotate or replace the expired/revoked Supabase access token through Supabase and GitHub Actions secret settings. Keep it in GitHub Secrets only, never in code, issue comments, or commit history. Then rerun the deploy workflow and verify deployment and health checks. Do not infer that the code is live from a successful GitHub commit.

**Done when:** deploy workflow succeeds with the intended target list and the authenticated post-deploy checks pass for each intended live project.

## P1 — resolve capability and operations gaps

### 3. ARCHIE’s own generative model is explicitly unavailable

**Evidence:** `supabase/functions/_shared/archie-ai/runtime.ts`, `ArchieModelRuntime.isOperational()` returns `false`, `capabilities()` returns an empty list, and `generate()` throws `ArchieRuntimeNotImplementedError("inference")`. `resolveArchieCapabilityEngine()` prefers operational cognitive/native engines, but the native runtime is structured inference/tool reasoning, not proof of a generally generative language model. The September 16 gap audit also labels open-ended generative language as the defining gap.

**Next work:** Make and document an owner-level product/architecture decision: define the intended boundary of “full AI agent” and whether open-ended generation is intentionally out of scope or a future, separately evaluated capability. If pursuing generation, specify model provenance, serving, latency/cost limits, privacy, safety, evaluation, versioning, rollback, and explicit authority boundaries before implementation. Preserve honest runtime labels and refusal behavior; do not register aspirational capabilities as operational.

**Done when:** product claims match tested behavior; capability registry and user-facing status clearly distinguish deterministic native reasoning from open-ended generation; any added model has independent, reproducible evaluations and safe failure behavior.

### 4. Maintenance scheduler status is contradictory and likely paused

**Evidence:** `docs/ARCHIE_SCHEDULER_PAUSED_2026-10-10.md` states the hourly maintenance job was paused on October 10 to conserve Gemini quota. `docs/ARCHIE_GAP_AUDIT_2026-09-16.md` still describes the scheduler as active/live and marks F-1/C-2/C-3 resolved. The older document also ranks the scheduler as a future gap in its closing priority list. No live `cron.job` or recent `archie_scheduler_runs` query was available during this audit.

**Next work:** Query the intended production Supabase project’s scheduler state and recent run records using an authorized secure channel. Update the stale audit and operational note to one current, timestamped status. Keep scheduled work disabled unless the owner approves its cost/quota envelope; if re-enabled, use a bounded cadence, idempotency, run limits, failure alerts, and a documented pause/recovery procedure.

**Done when:** one evidence-backed operational status is documented, scheduled calls are confirmed against live run records, quota/cost caps and alerting are defined, and owner approval is recorded before reactivation.

### 5. Escrow audit/event writes can fail silently in the agent worker

**Evidence:** `supabase/functions/archie-agent-worker/index.ts`, `appendEvent()` catches insert exceptions and ignores them (`/* audit events never break the worker */`, around lines 63–77). This conflicts with the worker’s own header comments describing an append-only agent report/lifecycle event and can make work appear successful without a durable audit record.

**Next work:** Decide which event classes are mandatory evidence. For consequential actions/results, fail closed or persist an outbox/retryable audit record before returning success; surface audit degradation explicitly. Retain best-effort behavior only for non-authoritative telemetry and label it as such. Add fault-injection tests for insert failures and partial completion.

**Done when:** every consequential task result has a durable, correlated audit/report record or returns an explicit incomplete/error state; retries are idempotent; telemetry failures cannot silently impersonate a complete audit trail.

### 6. Migration version collision can make fresh/replayed database histories ambiguous

**Evidence:** `supabase/migrations/` contains **304 SQL migration files** and two files share version prefix `20260918140000`: `20260918140000_archie_code_finding_rule_types.sql` and `20260918140000_reconcile_out_of_band_tables.sql`. Supabase migration tracking keys migrations by version; identical versions risk one migration being treated as duplicate/skipped or chain behavior differing between clean installs and databases that already applied both out-of-band.

**Next work:** Inspect migration history for every intended Supabase project and the Supabase CLI’s current handling before changing migration files. Produce a safe reconciliation plan for already-applied databases and clean installs. Do not casually rename or rewrite a migration that has been applied in production; create a forward-only reconciliation where appropriate and obtain owner approval before applying it.

**Done when:** a clean database can replay the chain deterministically, each tracked migration version is unique, and existing production ledgers reconcile without re-running destructive or non-idempotent work.

### 7. CI does not run the build or lint that README says CI guarantees

**Evidence:** `.github/workflows/ci.yml` runs `npm ci`, TypeScript, and `npx vitest run` only. `README.md` says CI proceeds through `npm run build`, but no build step exists in this workflow; lint is also not in CI. Build generates/prerenders assets and service worker files, so type-check/test success alone does not guarantee a releasable PWA.

**Next work:** Add `npm run build` and `npm run lint` (or explicitly revise the documented guarantee if intentionally excluded). Ensure generated files are deterministic and do not leave uncommitted build artifacts. Consider separate, clearly reported jobs for unit tests, build/lint, E2E/browser smoke, and security/dependency checks.

**Done when:** workflow checks match README; build, lint, typecheck, and tests are required checks on pull requests and main; failure prevents merge.

### 8. Deployment configuration and health-check target list disagree

**Evidence:** `.github/workflows/archie-deploy.yml` sets `ARCHIE_PROJECT_REFS` to only `hqhvlkunkdrxyuvziorm`, but its post-deploy check targets both `pjvtqkshewerpvggtgqx` and `hqhvlkunkdrxyuvziorm`. Workflow comments alternately describe Freluxtools-only and claim both projects are deployed. The current deploy is blocked before health checks, so this audit cannot tell whether both URLs should be current or whether one is a stale/disconnected target.

**Next work:** Confirm with the owner which Supabase projects serve ARCHIE today, where FRELUX routes production traffic, and which mirror is intentionally disconnected. Align deploy targets, trigger comments, health-check URLs, and README. A stale target must not be represented as a production check; an intended live target must not be omitted from deploy.

**Done when:** a single authoritative target inventory exists; deployment and health checks cover exactly the intended environments; no workflow claims dual deployment if only one ref is configured.

### 9. Public repository has no main-branch protection; dependency alerts are disabled

**Evidence:** GitHub API reports `main` is not protected (404 “Branch not protected”); Dependabot alerts return 403 because disabled; secret-scanning alerts currently return zero open alerts. Zero open alerts does not prove absence of historical exposures.

**Next work:** Repository owner should enable a pull-request rule for `main`, require passing CI and at least one review as appropriate, block force-push/deletion, enable Dependabot security updates/alerts and secret scanning/push protection where plan supports them, and review/remediate any existing findings. Keep credential rotation separate from code commits.

**Done when:** required checks cannot be bypassed through routine pushes; dependency and secret alerts are active; documented exceptions have an owner and expiry.

## P2 — expand capability and harden the product honestly

### 10. Perception and communication remain materially bounded

**Evidence:** `docs/ARCHIE_GAP_AUDIT_2026-09-16.md` records no OCR/scene understanding, no video perception, audio limited to transcripts, English-only NLU/code-switching, and no broad proactive email/Telegram/iMessage channels. The capability matrix notes PNG pixel analysis but structural-only JPEG/GIF and explicitly no object recognition. These are documented gaps; this audit did not implement or independently benchmark them.

**Next work:** Maintain a capability matrix with one row per modality/language/channel: supported inputs, tested limit, provenance, privacy boundary, operational status, and refusal copy. Prioritize only user-approved use cases; add bounded OCR/scene/video/language support behind explicit consent and adversarial tests. Do not describe the existing PNG statistics or transcript input as general vision/audio understanding.

### 11. Web research, coding, and calibrated uncertainty need outcome-grade evaluation

**Evidence:** The September 16 gap audit labels open-ended code authoring as scaffold-only, web research as DuckDuckGo-Lite adapter-bounded, and probabilistic/causal reasoning as thin or uncalibrated. The capability matrix reports 52/52 benchmark cases, but a small authored benchmark is not by itself broad real-world accuracy evidence.

**Next work:** Expand held-out, adversarial, and task-success evaluations using documented datasets and independently reviewed expected outcomes. Measure source quality/citation correctness and refusal calibration for research; keep code-generation in propose/test/owner-approve/apply stages; evaluate confidence calibration and contradiction handling across unseen tasks. Report sample sizes, false-positive/false-negative rates, and supported domain boundaries rather than a single “full score.”

### 12. Repository documentation and status counts are stale

**Evidence:** `README.md` says 25 deployed edge functions and a 302-migration chain; current source tree contains 304 SQL migrations, while the latest deploy workflow iterates 26 `archie-*` function directories. The capability matrix is labeled final 2026-09-11; the gap audit was last updated 2026-09-16, predates the October 10 scheduler pause, and contains contradictory priority/status statements. Current production deployment count is not verifiable because deployment authentication fails.

**Next work:** After repairing CI/deploy and confirming live state, update the README and audit docs with reproducible generated counts, commit SHA, date, exact test/build outputs, current scheduler state, and per-environment deployment evidence. Avoid “deployed/live” labels without direct health/DB evidence.

## Recommended execution order

1. Repair the three calculation-trace failures and escrow acceptance-window test/behavior; get CI green.
2. Replace the invalid GitHub Actions Supabase token through secure settings; rerun deployment and verify intended targets.
3. Reconcile the two same-version migrations against all live ledgers before any migration changes or application.
4. Verify and document scheduler state; keep paused until owner-approved quota/cost safeguards are set.
5. Harden mandatory audit persistence and align deploy/health-check target inventory.
6. Add build/lint and required GitHub branch protections/security alerts.
7. Update capability claims and prioritize the owner-approved generative/perception/research gaps with measurable evaluations.

## Guardrails for the next engineer

- No secrets, access tokens, service-role keys, or database URLs in this file, source, commits, or chat.
- Do not apply migrations, change production secrets, re-enable scheduled jobs, or deploy functions without the project owner’s explicit approval and a verified target.
- Preserve owner authorization, life-safety, security-verdict, consent, and honest-refusal gates. Learning or agent tasks must never grant new execution authority.
- Do not mark a capability “operational” because a module exists, a test passes, or an endpoint returned once. Record the evidence and limit.
- Use one ARCHIE intelligence core; do not create sub-agent minds or silent external-model substitution.

## Source-code audit addendum — deep agent-readiness review

**Audit date:** 2026-10-17  
**Source snapshot:** `main` at `cdc22fa648110c760f580b4e8d3977139244aa29`  
**Scope:** Targeted source review of the native runtime, cognitive kernel, reasoning loop, verifier, `archie-chat` request/tool boundary, fetchers, persistence configuration, and related tests. This is a code review of the checked-out GitHub snapshot, not a clean install, full test run, database audit, or live exploit test. Findings below distinguish directly visible code behavior from risks requiring concurrency/runtime reproduction. The previous repository/workflow findings above are retained; their CI/deployment observations were not re-run as part of this source review.

### Source-review verdict

ARCHIE contains substantial deterministic logic, but the checked-in code does not implement a general-purpose language model or a fully autonomous agent. The native stack is largely hand-coded NLU, pattern routing, deterministic templates/tools, and bounded clause processing. A future model runtime is explicitly disabled. More importantly, several control-plane claims are stronger than the enforcement: the verifier can return `PASS` while key checks fail, request-level privacy is implemented by mutating process-wide engine singletons, and the public website-fetch path follows redirects after validating only the initial host. These are production-trust/security issues, not cosmetic capability gaps.

## P0 — resolve before claiming production-safe agent operation

### C-01. Request-level memory consent is applied by mutating a process-wide singleton

**Severity:** P0 privacy/isolation risk; source-confirmed design flaw, concurrent impact requires runtime reproduction.  
**Evidence:** `supabase/functions/archie-chat/index.ts:2320-2335` reads the current request's `personalization_memory` consent and calls `configureCognitiveEnginePersistence(revoked ? null : db)`. That function in `supabase/functions/_shared/archie-ai/cognitive/kernel.ts:74-87` mutates module-global `configuredDb`, clears a module-global `kernelSingleton`, and also changes the native engine's module-global persistence configuration. The native engine repeats this pattern in `native-engine/engine.ts:4044-4063, 4105-4115`. These are shared isolate variables, not request-scoped dependencies.

**Impact:** Concurrent requests can interleave between the consent lookup/configuration and `getCognitiveEngine()`/cycle startup. A request whose consent is revoked can therefore resolve a kernel created after another request re-enabled DB persistence, or a granted request can replace a singleton while another request is being initialized. The code comment promises a per-request privacy gate, but the implementation configures shared process state. No concurrency test or live reproduction was run, so the exact race window and deployment frequency remain to be measured.

**Required work:** Pass persistence/consent as immutable per-request engine dependencies or use isolated engine instances for consent-sensitive requests. Never reset a shared singleton to implement one user's consent. Add deterministic concurrent tests that interleave granted/revoked requests around resolution and prove revoked requests make zero persistent reads/writes, while another request cannot change their configuration.

**Acceptance:** The privacy test suite demonstrates zero persistence access for revoked requests under forced concurrency; no request can alter another request's persistence configuration.

### C-02. The formal verifier can issue `PASS` when completeness, source quality, and uncertainty checks fail

**Severity:** P0 trust/assurance defect.  
**Evidence:** `supabase/functions/_shared/archie-ai/cognitive/verification.ts:140-150` records missing required aspects as a failed completeness check; `:175-191` records source-quality failure for all-web-cited outputs; `:207-219` records low-confidence facts as an uncertainty failure. But `:221-235` computes a hard failure from correctness, consistency, or security only, and returns `PASS` whenever there is at least one cited fact and no hard failure. `kernel.ts:790-812` invokes the verifier with `requiredAspects: []`, making completeness vacuous for the actual response path; the result is not used to block or qualify the response unless verdict is `FAIL` and the route is strict (`kernel.ts` around the verification-result handling after line 850).

**Impact:** The prominent formal verdict is not an overall verification result. It can say `PASS` with a recorded failed check, and the production call currently supplies no completeness requirements. Web-sourced claims can pass without cross-checking, and low-confidence citations can pass. This undermines the stated verification-before-presentation gate.

**Required work:** Define an explicit policy mapping each check to `FAIL`, `UNVERIFIED`, warning, or pass; never label the aggregate `PASS` when required checks fail or are not run. Supply task-specific required aspects for supported workflows. Re-verify tool/calculation outputs against the exact final output, not merely `invocation.ok`; add tests for each combination and assert both verdict and user-visible behavior.

**Acceptance:** No output receives `PASS` if a mandatory check fails or is skipped; absence of evidence becomes `UNVERIFIED`; critical tasks fail closed or receive an unmistakable limitation.

## P1 — security, correctness, and operational reliability gaps

### C-03. Website inspection allows redirects after checking only the original hostname

**Severity:** P1 SSRF risk.  
**Evidence:** `supabase/functions/archie-chat/index.ts:1320-1344` checks the user-supplied hostname for private/local patterns. The subsequent helper at `:1392-1412` sets `redirect: "follow"`; the `web_intelligence` path at `:760-790` fetches the original URL and consumes the final response without validating `res.url` against the blocked-host rules. A public URL can therefore redirect to a private/reserved destination without a per-hop host check. The separate research `PageFetcher` has a first-hop hostname/IP guard but also uses `redirect: "follow"` (`supabase/functions/_shared/archie-ai/native-engine/page-fetch.ts:306-349`), with DNS resolution explicitly out of scope at `:313-315`.

**Impact:** Server-side fetches may reach internal or metadata endpoints through redirects (and potentially DNS rebinding depending on runtime resolver behavior). This is a code-path risk identified by inspection, not a live exploit demonstration.

**Required work:** Use manual redirect handling with a strict hop cap; resolve and validate each destination before following; reject private/reserved IPv4/IPv6 and non-public DNS answers; defend against rebinding at connection time or use a controlled egress proxy. Apply the same policy to both website inspection and research fetches. Test public-to-loopback, public-to-link-local, redirect chains, IPv6, encoded/alternate IP forms, and DNS changes.

**Acceptance:** Every network connection destination is validated, redirects are bounded, and adversarial redirect/DNS tests prove private destinations are never contacted.

### C-04. Fetch response size is checked after full body buffering in the research fetcher

**Severity:** P1 resource-exhaustion risk.  
**Evidence:** `native-engine/page-fetch.ts:385-414` checks `Content-Length`, then calls `await res.text()` at `:398`, and only afterwards checks `html.length > maxBytes` at `:408`. Missing, false, or compressed `Content-Length` therefore does not bound memory consumed before rejection. The comment says the body is never buffered when oversized, but this implementation buffers it first.

**Impact:** A large or endless response can consume edge-function memory before the cap is enforced. The separate `archie-chat` inspection path streams and cancels after 500,000 characters (`index.ts:777-789`), showing the bounded-stream pattern is available but not shared with this fetcher.

**Required work:** Read the response stream incrementally, count actual bytes, cancel immediately at the configured byte cap, and enforce an overall deadline on both headers and body. Test missing/incorrect length headers, compressed responses, multibyte content, and stalled streams.

**Acceptance:** Memory use is bounded by a small fixed buffer plus configured maximum, regardless of server-supplied headers.

### C-05. Tool execution results are reported as successful even when the tool returns an error object

**Severity:** P1 observability and trust defect.  
**Evidence:** In `supabase/functions/archie-chat/index.ts:2459-2468`, tool output is awaited and every returned value is appended to `toolRuns` with `ok: true`; several tools return `{ error: ... }` or `{ persisted_to_learning: false, ... }` instead of throwing (for example `market_intelligence` around `:890-905`, `web_intelligence` around `:802-819`, and database-backed tool handlers). The caller does not normalize the tool's result into a failure status before recording it.

**Impact:** API consumers and operators can see `toolRuns[].ok === true` for failed queries, denied operations, or failed persistence. This corrupts run telemetry and may cause downstream logic or users to treat failure payloads as successful work.

**Required work:** Standardize a discriminated tool-result contract (`ok`, `data`, `error`, provenance) for every tool. Catch thrown failures and normalize returned errors; preserve partial results separately. Add tests for returned errors, thrown errors, partial persistence, and successful empty results.

**Acceptance:** `ok` is true only when the tool contract reports success; a successful empty result is distinct from query failure, and all outcomes are auditable.

### C-06. Public visitor rate limiting is keyed by a caller-controlled client ID and stored per isolate

**Severity:** P1 abuse/cost-control weakness.  
**Evidence:** `archie-chat/index.ts:2102-2107` derives the visitor rate-limit key from request-body `clientId` (default `anon`) and calls the in-memory `checkRateLimit`. The shared limiter in `supabase/functions/_shared/rate-limit.ts` documents that buckets are per Deno isolate. A caller can choose new client IDs and requests can be distributed across isolates, avoiding a dependable per-user/IP global limit.

**Impact:** The 12-requests-per-minute check is not an effective public abuse or spend-control boundary. Anonymous traffic can evade it by rotating IDs and/or reaching multiple isolates. This is not proof of a current abuse incident.

**Required work:** Apply a distributed edge/API-gateway rate limit keyed by trusted network identity and, when available, authenticated user; treat client ID only as a conversation identifier. Add global concurrency and request-size/time budgets, abuse monitoring, and load tests across multiple instances. Do not trust an unvalidated `x-forwarded-for` value unless the platform guarantees it.

**Acceptance:** Limits hold across isolates and client-ID rotation, with measured request ceilings and a documented abuse response.

### C-07. The production tool-resume loop is capped at three hops and does not report remaining pending work

**Severity:** P1 agent capability/contract gap.  
**Evidence:** `archie-chat/index.ts:2436-2476` executes at most three tool-call/resume iterations. After the third result, a subsequent tool call is not executed, but the handler proceeds to assemble text from `result.parts` at `:2481-2505` without an explicit “tool budget exhausted / pending tool not run” status. The cognitive reasoning loop advertises a separate budget of eight tool hops (`native-engine/reasoning-loop.ts` constants near the top), so the production caller and loop have different budgets.

**Impact:** Multi-tool requests can stop mid-task or return an incomplete/ambiguous response while the tool budget in the reasoning layer suggests more work was allowed. Tool calls are not guaranteed to be completed or explicitly marked pending.

**Required work:** Unify the caller and kernel tool budgets; track executed, failed, and pending calls; return an explicit incomplete/budget-exhausted result and do not phrase it as completed. Add tests for 0, 1, 3, and >3 calls and for a tool call emitted on the final allowed hop.

**Acceptance:** Every requested action ends in completed, failed, blocked, or explicitly pending state; no tool call is silently dropped.

### C-08. The advertised “reason → act → observe → continue” loop is primarily independent clause passes, not an observation-driven agent loop

**Severity:** P1 capability-claim/code gap.  
**Evidence:** `native-engine/reasoning-loop.ts:178-206` runs a single clause once. For compound requests, `:251-275` calls `engine.converse(clause.text, history, ...)` separately for each clause; it does not add earlier step outputs/tool results to the next step's history or create a plan from observed results. `:277-322` concatenates the per-clause answers. The kernel comments at `cognitive/kernel.ts:628-647` describe a reason-act-observe-continue loop, but this controller is sentence/intent decomposition with bounded passes.

**Impact:** It does not reliably plan from intermediate findings, adapt when a tool fails, or use one step's result as the next step's evidence. Multi-part conversation is not equivalent to an autonomous agent loop.

**Required work:** Either accurately describe this as deterministic compound-request decomposition, or implement an explicit plan/action/observation/replan state machine with typed observations, evidence linkage, per-step authorization, bounded retries, idempotency, cancellation, and completion criteria. Never invent progress between steps. Evaluate on held-out multi-tool tasks with injected failures.

**Acceptance:** Tests demonstrate that later actions are selected from actual earlier results, failures trigger safe replanning/refusal, and completion claims correspond to recorded evidence.

### C-09. Tool parameter schemas are advertised but not enforced as runtime validation

**Severity:** P1 input-integrity gap.  
**Evidence:** `native-engine/tools.ts:96-105` validates only whether required keys are present. It does not validate the declared parameter kinds, reject extra fields, constrain string lengths/numeric ranges, or validate nested object shapes before dispatch. The general tool dispatcher then passes raw arguments to handlers (around `:107-123`).

**Impact:** Malformed model/tool inputs can reach handlers as wrong types, extreme values, or unexpected objects. Individual tools sometimes coerce and cap inputs, but there is no shared schema guarantee; this increases inconsistent behavior and makes safe tool expansion difficult.

**Required work:** Adopt strict runtime schemas for every tool (including nested objects and enums), set size/range bounds, reject unknown fields where appropriate, and validate again at the execution boundary. Add fuzz/property tests for malformed JSON values and boundary values.

**Acceptance:** No tool handler receives input until its complete runtime schema passes; invalid calls produce structured errors and never execute side effects.

### C-10. The actual user-facing verifier currently has no completeness criteria

**Severity:** P1 quality gap, separate from the aggregate-verdict defect C-02.  
**Evidence:** The production kernel call in `cognitive/kernel.ts:790-812` always passes `requiredAspects: []`. The verifier's completeness implementation (`verification.ts:117-150`) therefore has no required items to check on this path.

**Impact:** Despite the completeness subsystem existing and being listed in diagnostics, the live response path cannot catch omitted user-requested requirements through this check.

**Required work:** Derive explicit required aspects from supported structured task schemas and user requests, or report completeness as not evaluated. Do not pretend free-form extraction is reliable; use workflow-specific contracts for calculators, research, code review, and execution.

**Acceptance:** Each supported task class has tests proving requested outputs/constraints are captured and checked, with “not evaluated” represented honestly.

## P2 — product separation, maturity labeling, and maintenance debt

### C-11. The chat execution path is FRELUX-bound, not an independently deployable ARCHIE product boundary

**Evidence:** `supabase/functions/archie-chat/index.ts` hard-wires FRELUX tables and product flows throughout the tool registry (for example `frelux_archie_ingestions`, `material_prices`, `profiles`, `client_estimates`, FRELUX execution targets, and FRELUX market observations). The `archie-chat` module creates a service-role client and queries those tables directly. The file itself describes API-credential support as “extraction-ready,” but there is no separate ARCHIE data/service abstraction replacing these FRELUX dependencies.

**Impact:** Removing ARCHIE from FRELUX or deploying it as a standalone agent requires a compatibility schema and host integration, not merely moving this function. FRELUX data models and the agent core are coupled.

**Required work:** Separate the agent core from host tools using a typed host-adapter interface; keep FRELUX-specific tool implementations in an explicit integration package. Document required tables/scopes and provide a no-host mode. Add contract tests with a fake host adapter and integration tests for FRELUX.

### C-12. “Operational” capability status is not equivalent to general agent capability

**Evidence:** `runtime.ts:167-185` explicitly reports the future model runtime as non-operational, with no capabilities and an inference error. The active native/cognitive runtimes register inference and reasoning capabilities (`runtime.ts:208-224`), but those engines are deterministic code, keyword/intent routing, stored facts, templates, and bounded tools rather than a general language model. The cognitive manifest in `cognitive/kernel.ts` also documents open-ended generation and multimodal image/audio as unimplemented (see `capabilities()`/manifest near lines 180-225). Owner-local generation is a separate optional path in `native-engine/engine.ts:2685-2703` and is not the ARCHIE-owned model runtime.

**Impact:** “Inference” or “operational cognitive engine” can be read as general-purpose language intelligence when the underlying behavior is substantially narrower. The correct distinction is between a working deterministic agent substrate and absent/optional open-ended model generation.

**Required work:** Publish a capability matrix that maps each user-visible ability to actual implementation, dependencies, test evidence, supported domain, and refusal behavior. Label generation, image/audio, web research, code authoring, and multi-step tool autonomy separately. Decide whether FRELUX requires a hosted model or a genuinely ARCHIE-owned model; do not imply the latter exists today.

### C-13. Consent-read errors default to persistent memory enabled

**Severity:** P1 privacy policy fallback risk; independent of the concurrency defect.  
**Evidence:** `archie-chat/index.ts:2321-2335` reads consent; when the query throws, the catch calls `configureCognitiveEnginePersistence(db)`, enabling persistence. Missing consent rows also default to not revoked (`:2328-2330`).

**Impact:** If the consent store is unavailable or unreadable, the code fails open for personalization rather than disabling it or clearly requiring a policy-backed default. Whether this violates product policy depends on the intended consent model; the code comments claim revoked consent is honored but do not define what absence/error means.

**Required work:** Obtain and document the product/legal default for no consent and consent-service failure. For an opt-in consent model, fail closed to no personalized persistence on unknown/error; distinguish “unset,” “granted,” “revoked,” and “lookup failed.” Test each state.

### C-14. Full source-level validation remains outstanding

**Evidence:** This review used a GitHub tarball snapshot and targeted source reads. It did not run `npm ci`, the complete test suite, lint, typecheck, build, migration replay, Supabase function tests, or live runtime/security probes on the audited snapshot.

**Required work:** After addressing priority findings, run a clean reproducible install and all repository checks on a fresh checkout; add focused regression tests for C-01 through C-10; record exact command results and commit SHA. Separately verify deployed function revision, database migration ledger, consent behavior, and egress controls in the authorized production environment. Do not claim the code is fixed/live from this handoff alone.

## Priority sequence for the next engineer

1. Fix request-scoped persistence/consent isolation (C-01) and define fail-closed consent semantics (C-13).
2. Correct verifier verdict policy and wire real completeness requirements (C-02, C-10).
3. Close redirect and streaming-body SSRF/resource gaps (C-03, C-04).
4. Correct tool outcome reporting, shared rate limiting, tool-hop completion, and strict schema validation (C-05 through C-07, C-09).
5. Decide whether to implement a genuine observation-driven agent loop or narrow the claims (C-08); publish capability labels (C-12).
6. Separate FRELUX-specific adapters from the agent core if ARCHIE must power other products or operate independently (C-11).
7. Run clean full validation and obtain live operational evidence (C-14).

## Audit discipline

- “Verified in source” means the cited code path is present in the audited commit; it does not mean a live exploit or production incident was demonstrated.
- Concurrency and SSRF findings need regression tests and safe test harnesses, not assumptions about a particular edge runtime.
- Keep the previous repository/workflow findings above until each is individually rechecked and completed. This addendum does not mark any old work done.
- Do not apply migrations, rotate secrets, deploy, or change production behavior without the owner’s explicit authorization and a verified target.
