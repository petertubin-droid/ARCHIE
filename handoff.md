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
