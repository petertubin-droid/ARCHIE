# ARCHIE Engineering Handoff: Remaining Production and Agent-Readiness Work

**Updated:** 2026-10-17
**Repository:** [`petertubin-droid/ARCHIE`](https://github.com/petertubin-droid/ARCHIE)
**Base reviewed:** `main` at `5293e3c80792103a32fef1e5b0cfd2a4ec1ed8f2`
**Purpose:** Open work only. Completed source items have been removed from this handoff; this file is not a claim that production is deployed or fully operational.

## Current verified state

- The current source includes request-body limits for `archie-chat` and `archie-agent-worker`; chat validates its request shape, and the worker validates UUID identifiers before database lookup.
- The native page fetcher validates redirect destinations and streams response bodies with byte limits. This update adds hard deadlines for response acquisition and body reads, with cancellation on stalled/oversized bodies.
- Chat's tool-resume loop and the native reasoning loop now use one shared eight-execution budget. Chat records and tells the caller when a further tool call remains pending rather than claiming it ran.
- Validation on this checkout: focused tests passed (4 files, 52 tests); full suite passed (267 files, 3,147 passed, 2 expected-fail, 1 skipped); `npm run typecheck` and `git diff --check` passed.
- `npm run lint` is blocked because the repository has no ESLint 9 flat config. `npm run build` is blocked because this checkout has no root `index.html` entry. The CI workflow does not run either command.
- The latest checked GitHub CI run `39037279856` passed for `a5f4756`; the deployment run `39037279902` failed with Supabase CLI `401 Invalid access token` while listing functions. No functions deployed and the health check was skipped. Production is **not verified**.
- This update adds an atomic report-plus-terminal-event RPC and immutable execution-run identity to the agent-worker path. Source typecheck and the full suite passed (268 files; 3,154 passed, 2 expected-fail, 1 skipped). The SQL migration has not been applied to any database or integration-tested against production; source is not yet operational in a deployed environment.

## P0 — deployment and verifiable release

### R-02. Supabase deployment credential is invalid

**Evidence:** GitHub Actions run [39036236619](https://github.com/petertubin-droid/ARCHIE/actions/runs/39036236619) failed while listing Supabase functions with `401 Invalid access token`; zero functions deployed and post-deploy health checks were skipped.

**Remaining work:** A project owner must rotate the token in Supabase and replace the GitHub Actions secret through secure settings. Then authorize and run the workflow, verify the intended target list, and check post-deploy health. Never place the credential in code, issues, this file, or chat. Until the owner action and a successful authenticated run, production remains stale/unverified.

### R-08. Deployment targets and health-check targets disagree

**Evidence:** `.github/workflows/archie-deploy.yml` configures `ARCHIE_PROJECT_REFS` with `hqhvlkunkdrxyuvziorm`, while health checks also reference `pjvtqkshewerpvggtgqx`; comments disagree about whether one or both are live.

**Remaining work:** Owner confirms the intended Supabase projects and production routing. Align deployment refs, health checks, comments, and docs, then verify each intended environment after an authorized deploy.

### R-12. Live operational status and documentation counts need reconciliation

**Evidence:** Existing README/audit notes disagree on deployed function and migration counts and scheduler state. Deployment authentication currently prevents source-to-production verification.

**Remaining work:** After access and target issues are resolved, record commit SHA, per-environment deployed function revisions, migration ledger, scheduler state, and reproducible counts. Do not label source features “live” without direct evidence.

## P1 — security, reliability, and agent behavior

### C-03. Public URL fetching still lacks controlled egress and DNS-rebinding protection

**Evidence:** Native `PageFetcher` and chat inspect redirects manually and revalidate each URL, but hostname checks do not pin the resolved address used by the connection. DNS rebinding and controlled egress are not implemented or live-tested.

**Remaining work:** Add a supported controlled-egress/proxy layer that validates the connected IP, or another runtime-supported DNS pinning control. Cover private/reserved IPv4 and IPv6, alternate encodings, redirect chains, and rebinding. Do not claim the current hostname checks close the DNS/egress risk.

### C-04. Audit and bound every outbound response path

**Evidence:** Native research page and robots responses are now byte-bounded and deadline-limited in source; tests cover oversized/stalled bodies. A repository search still shows other outbound paths using `Response.text()`, `Response.json()` or `arrayBuffer()` (including market research, web research, AI provider errors, and WhatsApp media). Each has different trust, payload and size expectations.

**Remaining work:** Inventory ARCHIE-owned outbound fetches, add endpoint-specific byte/time limits and cancellation before parse/buffer, and test missing/false length headers, slow streams, malformed payloads and error bodies. Exclude trusted small fixed provider APIs only with documented provider limits and explicit caps.

### C-06. Public anonymous rate limiting is not global or identity-bound

**Evidence:** `archie-chat` uses an isolate-local limiter. Authenticated visitors are keyed by user ID, but anonymous client IDs are caller-controlled, and counters do not coordinate across isolates. The shared in-memory limiter is not a dependable spend-control boundary.

**Remaining work:** Select and configure a shared atomic limiter or supported gateway-level policy keyed by trusted edge identity plus authenticated user when available. Do not use caller-supplied `clientId` or unverified forwarding headers as identity. Add multi-instance and rotation/load tests, concurrency/time limits, and abuse monitoring. Required provider configuration/credentials are not present in source.

### C-07. Prove the shared chat tool budget and pending-result contract end to end

**Evidence:** Chat and native reasoning now share an eight-execution budget. A common helper has boundary tests; existing chat code records a pending call after the budget. The endpoint-level tool-call/resume path has no test proving exact execution counts, final pending status, and honest response across the 0/1/8/9-call boundaries.

**Remaining work:** Add deterministic HTTP/chat runner tests using a fake inference runtime and fake tools. Prove no more than eight handlers execute, every failure is distinguished from success, and a ninth or unresolved call is returned as pending/incomplete. Keep the helper's shared limit as the only production source of truth.

### C-08. The advertised agent loop is not observation-driven

**Evidence:** `native-engine/reasoning-loop.ts` decomposes compound requests into independent clause passes and composes their answers; it does not reliably plan the next action from prior tool observations or replan on tool failure.

**Remaining work:** Either narrow capability language to deterministic request decomposition or design and test a genuine bounded plan/action/observe/replan state machine with typed observations, evidence links, per-step authorization, idempotency, cancellation, failure recovery and completion criteria. Do not describe the present loop as general autonomous planning.

### C-10. User-facing completeness is not checked against task-specific requirements

**Evidence:** `cognitive/kernel.ts` calls the verifier with `requiredAspects: []`. The verifier honestly marks completeness as not evaluated, but does not check omissions from the actual user request.

**Remaining work:** Define explicit contracts for supported structured workflows (for example calculations and research), validate required inputs/outputs against those contracts, and show “not evaluated” for unconstrained free-form replies. Add omission and unknown-value tests; do not infer reliable completeness from free-form extraction alone.

### C-11. ARCHIE chat remains coupled to FRELUX host data and tools

**Evidence:** `archie-chat/index.ts` directly uses FRELUX tables, product flows, execution targets and credentials. There is no complete host-adapter boundary replacing those dependencies.

**Remaining work:** Define a typed host adapter, move FRELUX tools into a separate integration package, document required scopes/tables, and provide a no-host mode with fake-adapter contract tests. Do this if standalone ARCHIE deployment remains a product requirement.

### C-12. User-facing capability claims need an evidence-backed matrix

**Evidence:** Native reasoning and deterministic tools are operational in source, but open-ended generation is intentionally unavailable without an external model. Image/audio, broad perception, open-ended coding, and autonomous multi-tool planning have narrower support than a general AI-agent claim implies.

**Remaining work:** Publish a capability matrix containing exact supported input/output, tested limit, provenance/dependency, operational status, and refusal behavior. Keep model-free/native capabilities separate from absent generative-model capability. Expand only against owner-approved use cases and held-out evaluations.

## P1 — repository and data-integrity operations

### R-05. Atomic report/audit fix awaits database rollout and integration proof

**Evidence:** Source now calls one `SECURITY DEFINER` database RPC to persist the report and matching `REPORT`/`FAIL` event in one transaction. The immutable execution-run UUID is propagated from the execution engine; per-run advisory locking makes retries idempotent, validates the active `archie-agent-task` run and agent owner, and can reconcile a legacy report missing its event. The worker returns persisted prior results on replay rather than executing the same run twice. The execution engine now maps worker `{ok:false}` to a failed run rather than HTTP-success. Unit tests and full source suite pass.

**Remaining work:** Apply migration `20261017135800_archie_atomic_agent_report_audit.sql` through the owner-authorized deployment process, then integration-test successful, failed, interrupted and retried runs against a disposable/approved database. Confirm report and event counts and run linkage; do not mark operational until the migration and live behavior are verified. No production database change has been made from this chat.

### R-06. Duplicate migration version requires database-ledger reconciliation

**Evidence:** `supabase/migrations/` contains two files with version prefix `20260918140000`; Supabase migration history keys versions, creating ambiguity for clean replay versus already-updated databases.

**Remaining work:** Inspect ledgers for every intended project and confirm current CLI behavior. Prepare a forward-only reconciliation for both clean installs and existing ledgers. Do not rename/rewrite an applied migration or apply a reconciliation without owner approval.

### R-07. CI does not run documented build/lint checks

**Evidence:** `.github/workflows/ci.yml` runs install, typecheck and tests but not build or lint. The current `npm run lint` fails because there is no ESLint 9 flat config; `npm run build` fails because root `index.html` is absent. This appears to be an engine-oriented checkout, so do not invent a placeholder app entry.

**Remaining work:** Decide whether this repo is meant to be a web app or engine package. If engine-only, update scripts/docs and provide relevant package/build checks. If a full web app, restore the real app entry and configure ESLint. Make CI and README agree and require passing checks before merge.

### R-09. Main branch protection and security alert configuration need owner action

**Evidence:** The earlier GitHub audit reported `main` unprotected and Dependabot alerts unavailable/disabled. These settings were not rechecked during this update.

**Remaining work:** Recheck repository settings; owner enables required reviews/checks, force-push/deletion protection, dependency alerts/updates and supported secret scanning. Record actual settings, not assumed status.

### R-04. Scheduler state and quota policy need live verification

**Evidence:** Repository notes conflict about whether the maintenance scheduler is paused or active; no live scheduler/job-run query was performed during this update.

**Remaining work:** Confirm live jobs and recent run records through an authorized Supabase channel. Keep paused until an owner approves quota/cost limits, idempotency, run bounds, alerts and recovery steps. Update docs to one timestamped state.

## P2 — broader capability and architecture decisions

### R-03. Native deterministic reasoning is not open-ended generation

**Evidence:** The ARCHIE-owned model runtime reports non-operational. The native/cognitive stack is model-free deterministic reasoning, routing, stored facts, templates and bounded tools. No external model is added or assumed by this handoff.

**Remaining work:** Keep user-facing claims aligned with tested behavior. An owner/product decision is needed on whether model-free limits are intentional or a future capability gap; no external model or new inference provider should be introduced without explicit direction and separate privacy/safety/evaluation design.

### R-10. Modality and channel coverage remains limited

**Evidence:** Existing capability notes describe narrow image/audio support and limited languages/channels; these are not equivalent to general vision, speech understanding or multilingual autonomy.

**Remaining work:** Reconcile the capability matrix with tested behavior. Prioritize only approved use cases, with consent, privacy controls, bounded inputs and adversarial tests.

### R-11. Research and calibrated uncertainty need outcome-grade evaluation

**Evidence:** Existing benchmarks are small authored suites; passing them alone does not establish broad real-world source quality, citation correctness, or confidence calibration.

**Remaining work:** Add held-out/adversarial task-success evaluations and independently reviewed expected outcomes. Report samples, error rates, citation correctness and supported domain boundaries.

## Guardrails

- No credentials, service-role keys, database URLs or secrets in source, commits, handoff, or chat.
- Do not apply migrations, change production secrets, re-enable scheduled jobs, or manually deploy functions without explicit owner authorization and a verified target.
- A push to `main` may trigger the configured deployment workflow; inspect its result, report it truthfully, and do not retry a failed deployment unless asked.
- Passing source tests does not establish deployment, production-data quality, live credentials, scheduler operation, or external service health.
- Preserve consent, owner authorization, life-safety, security-verdict and honest-refusal gates. Do not create sub-agent minds or silently substitute an external model.

## ENGINE AUDIT

**Audit base:** `main` at `5293e3c80792103a32fef1e5b0cfd2a4ec1ed8f2` (2026-10-17).
**Scope/method:** Broad static inventory of `supabase/functions/_shared/archie-ai/` (110 TypeScript files, including 10 tests), targeted source tracing of native construction, image perception, crypto market data and exchange execution, capability-manifest review, and focused tests. This is a source audit, not a line-by-line proof of every engine or a live production verification. The focused suites passed: 4 files, 120 tests (`native-engine-runtime`, `vision`, `market-data`, `exchange-execution`). No production credentials, external venue, or deployed database were exercised.

### EA-01 — Exchange fill price and completion status can be reported inaccurately (P1)

**Evidence:** `supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/binance.ts:189-223` averages `fills[].price` by fill count, despite the comment saying volume-weighted; fill `qty` is ignored. The same method labels every HTTP-success response `FILLED`, without validating the venue's order status or executed quantity. `crypto/exchange/execution.ts:210-255` uses that result to mark execution successful and writes `filledPrice` into the opened portfolio position. The current adapter test at `src/lib/archie/__tests__/exchange-execution.test.ts:282-313` uses equal fill quantities, so it cannot expose the arithmetic-average defect.

**Required closure:** Compute the actual quantity-weighted average from validated `price × qty` values (or use a validated venue cumulative quote/executed quantity); verify order status, requested versus executed quantity, and positive finite values. Represent partial, pending, rejected, and malformed/unknown outcomes distinctly; do not open a full-size position from an incomplete fill. Add unequal-quantity, partial-fill, zero-fill, malformed-fill, and missing-status regression cases, including execution-to-portfolio propagation. Retest only against the explicitly authorized venue mode; production execution is not verified by the mock suite.

### EA-02 — PNG pixel/dimension caps are checked after full decompression (P1)

**Evidence:** `cognitive/vision.ts:142-225` reads dimensions, concatenates IDAT, inflates the entire zlib stream into an `ArrayBuffer`, and allocates decoded pixel arrays. The 4-megapixel check is only in `analyzeImage` at lines 447-470, after `decodePng` has already decompressed and allocated. The 20 MB compressed-input cap at lines 456-459 does not bound decompressed output; a crafted PNG can therefore consume excessive memory/CPU before the advertised pixel cap refuses it.

**Required closure:** Validate safe integer dimensions and the pixel cap immediately after IHDR parsing and before inflate/large allocation; use bounded decompression that stops when expected output or a documented ceiling is exceeded. Keep overflow checks on width, height, stride, and byte counts. Add adversarial compressed-expansion, huge-dimension, malformed-IHDR, and exact-boundary tests; confirm refusal occurs before expensive allocation.

### EA-03 — Construction chat parser silently normalizes ambiguous or invalid dimensions (P1)

**Evidence:** `native-engine/domains/construction.ts:23-25, 42-44, 70-89` extracts unsigned digit substrings and decides units with one request-wide `isFeet` flag. Consequently a negative dimension loses its sign, grouped values such as `1,200` are split into multiple numbers, and a mixed-unit request such as `12 ft × 3 m` converts both numbers as feet. The calculator can then return a plausible-looking estimate with an incorrect area; current cases at `src/lib/archie/__tests__/native-engine-runtime.test.ts:636-676` cover common valid inputs and missing values, not these ambiguous/error inputs.

**Required closure:** Parse each measurement with an explicit value and unit, convert dimensions independently, reject negative/zero or malformed dimensions, and refuse ambiguous grouping/locale syntax rather than extracting digits and guessing. Add tests for negative/zero values, thousands separators and decimals, mixed units, unsupported units, and multiple unrelated numbers. Preserve the existing assumptions/refusal wording and verify no false estimate is returned.

### EA-04 — Crypto public market-data requests have no explicit timeout or response-byte cap (P1; extends C-04)

**Evidence:** `native-engine/crypto/market-data.ts:28-50, 272-285` defines a fetcher without signal/deadline/size controls and calls `r.json()` directly. This path reaches public market-data adapters for several venues; a slow or unexpectedly large upstream response can hold execution or buffer an unbounded body before JSON parsing. This is a distinct outbound path from the bounded native page fetcher already described under C-04.

**Required closure:** Add endpoint-appropriate abort deadlines and streamed byte caps before parse, validate the parsed response shape and numeric fields before returning an `ok` snapshot, and bound error payloads. Test stalled fetches, oversized bodies with absent/false `Content-Length`, malformed JSON, and invalid numeric/order-book levels. Keep venue failures `unavailable`; never convert them to stale or fabricated data.

### EA-05 — Vision capability wording exceeds demonstrated semantic capability (P2)

**Evidence:** The native vision implementation documents deterministic image statistics and no OCR/object recognition (`cognitive/vision.ts` module header); its outputs include dimensions, brightness/color and coarse content classification. The manifest calls `vision-perception` OPERATIONAL and describes “document and site inspection intelligence” at `native-engine/capabilities.ts:258-264`. That status is evidence for the bounded implemented analyzer and tests, not for semantic site/object inspection or OCR.

**Required closure:** Clarify capability descriptions and UI/report language to name the exact supported formats, first-frame/structure-only behavior, deterministic statistics, and absent OCR/object/site interpretation. Keep semantic inspection, if later added, a separate capability with its own data, safety boundaries, and independently evaluated tests. Do not claim an external-model or live inspection capability.

### Confirmed intentional limits — do not mistake these for hidden working features

- The base ARCHIE model runtime is intentionally non-operational, and the default LLM router has no providers. Any owner-authorized local-model route is optional and distinct; this audit does not add or recommend an external model.
- Open-ended code/image/design generation and auditory perception are explicitly unavailable. Existing code analysis, deterministic scaffolds, and narrow image statistics must not be described as those broader capabilities.
- Several market-data venue operations explicitly return `unavailable` when unsupported. That honest refusal is preferable to pretending every venue supports every endpoint; keep the manifest and UI aligned with the actual per-venue support table.
- Capability status marked OPERATIONAL and passing fixture tests are source-level evidence only. They do not prove database migration rollout, live credentials, upstream service availability, external venue authorization, or production deployment. Existing C-04, C-10, C-12, R-02, R-05 and R-12 track related outstanding verification and should remain open until their stated evidence exists.

**Audit disposition:** The focused source tests passed, but EA-01 through EA-04 are code-level defects/gaps and EA-05 is a capability-claim precision issue. No engine code was changed in this audit-only task; do not mark these items complete until the remediation and closure tests above pass. Production remains unverified as recorded under R-02/R-12.
