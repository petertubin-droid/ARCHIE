# ARCHIE STAGE 2 — INDEPENDENT INTELLIGENCE, FAMILY NETWORK & SENTRIES

Stage 2 extends the Stage 1 Owner PWA without touching working
Stage 1 functionality. Architecture:

```
OWNER → ARCHIE PWA → ARCHIE CHAT → ARCHIE INTELLIGENCE CORE
      → ARCHIE AI ABSTRACTION → MODEL RUNTIME (replaceable)
      → ARCHIE KNOWLEDGE + MEMORY + TOOLS
```

## 1. ARCHIE AI Abstraction (spec §§1, 10-12)

- `supabase/functions/archie-core/model-runtime.ts` — the server-side
  runtime registry. `archie-core` now contains ZERO direct provider
  calls: every inference request flows through `infer()`.
- **ARCHIE_OWN_MODEL** is registered as the preferred runtime with the
  honest status NOT_YET_AVAILABLE (it refuses rather than faking
  inference). Until ARCHIE's own model exists, an **isolated external
  adapter** serves inference. The adapter is a replaceable PART:
  provider keys, endpoints and formats live only inside the adapter
  module — never in ARCHIE Core, never in the frontend.
- Chat responses now report `runtime.core = "ARCHIE_INTELLIGENCE_CORE"`
  plus the active `adapter`/`model` separately. ARCHIE is never
  branded "Gemini-powered" — the runtime is a part, not the identity.
- `src/lib/archie/ai-abstraction.ts` — shared contract + the §39
  provider-independence invariants (asserted by tests).
- `src/lib/archie/model-lifecycle.ts` — future-model infrastructure
  interface (datasets, cleaning, versioning, tokenization, embeddings,
  training, evaluation, registry, serving, monitoring, rollback).
  Training capabilities are honestly NOT_YET_IMPLEMENTED; registry,
  versioning, serving and rollback are READY today. No placeholder
  is ever presented as functioning (§40).

## 2. Family & Trusted People (spec §§25-28)

- Migration `20260910100000_archie_stage2_family_people.sql` (deployed
  LIVE): `frelux_archie_people`, `frelux_archie_invitations`,
  `frelux_archie_shares`, all RLS-enabled, plus two SECURITY DEFINER
  RPCs (`frelux_archie_shared_conversations`,
  `frelux_archie_shared_knowledge`).
- Edge function `archie-family` (deployed, verify_jwt on):
  - `invite` — Owner generates a crypto-random 10-char code. Only the
    SHA-256 hash is stored; the code is returned exactly ONCE, expires
    in 24h, single-use.
  - `redeem` — the code ALONE grants nothing: redemption creates a
    PENDING_REQUEST for Owner review.
  - `approve` — Owner configures permissions (starts from ZERO) and
    access expiry (1h / 1d / 7d / 30d / permanent) before activation.
  - `update` / `remove` — suspend, reinstate, revoke, permanently
    remove with all shares. Every unauthorized attempt is audited.
- Data isolation: family members see ONLY their own person record and
  resources the Owner explicitly shared — enforced by RLS policies and
  the owner-scoped RPCs, re-checked on every call (status + expiry).
- UI: `/archie/people` (nav "People") — invitation flow, review panel
  with explicit permission chips, access duration, suspend/revoke/remove.

## 3. Code Sentry (spec §20)

`src/lib/archie/code-sentry.ts` — deterministic scan of owner-authorized
code content: provider API keys (CRITICAL), service keys (CRITICAL),
hardcoded passwords (HIGH), eval (HIGH), string-built SQL (HIGH), raw
HTML injection (MEDIUM), plain http (MEDIUM), debug logging (LOW).
Reports and proposes only — never modifies production code. Whole-repo
verification runs in the authorized dev environment (CI suite).
When nothing is authorized, it says so honestly (`notScannedReport`).

## 4. Security Sentry (spec §21)

`src/lib/archie/security-sentry.ts` — deterministic analysis of REAL
audit events: unauthorized Owner-action attempts, anomaly bursts,
revocation bursts, prompt-injection / knowledge-poisoning markers in
learning submissions. Response levels OBSERVE → ALERT →
CONTAIN_CANDIDATE → OWNER_DECISION. It recommends, collects evidence
and never escalates its own privileges; suspension decisions stay
with the Owner (§§21-22).

## 5. Owner Central Control Dashboard (spec §2)

`ArchieControl` now includes the real Stage 2 subsystems: Family &
Trusted People, ARCHIE Model & Inference, Code Sentry, Security Sentry
— each linked to its live surface.

## Tests

- `stage2-abstraction.test.ts` (11) — runtime registry honesty, adapter
  isolation, never-branded-as-provider invariants, lifecycle §40.
- `stage2-sentries.test.ts` (13) — Code Sentry rule matrix, Security
  Sentry signal analysis, evidence collection.
- `stage2-acceptance.test.ts` (11) — static architecture guarantees
  (§§11, 25, 27, 28, 39, 41): no provider calls in Core, keys only in
  the adapter module, crypto-random hashed single-use invitations,
  server-side Owner enforcement, DB-level isolation.
- `ArchiePeople.test.tsx` (4) — invitation shown once, zero default
  permissions, server-error surfacing.

Full regression is now 6,081/6,081 green (654 files), tsc clean. All
Stage 1 functionality unchanged; every ARCHIE page has a hermetic test
file.

## 6. Knowledge Vault per-item controls (Stage 2 continuation)

- Migration `20260910120000_archie_stage2_knowledge_history.sql` (deployed
  LIVE): `frelux_archie_knowledge_history` + a BEFORE UPDATE trigger that
  snapshots every `frelux_knowledge_items` row before it is modified.
  History reads are admin-gated (RLS); writes happen only via the trigger.
- `src/lib/archie/stage2-knowledge-client.ts`:
  - `listKnowledgeItems` — full provenance (evidence_state, confidence,
    approved_by/date, change_reason, content).
  - `updateKnowledgeItem(id, patch, reason)` — reason REQUIRED; saves as a
    NEW version (trigger preserves the prior state). Nothing is edited
    silently.
  - `rollbackKnowledgeItem(id, toVersion)` — restores a prior state from
    history AS A NEW VERSION, so the rollback itself is versioned.
  - `listKnowledgeHistory(item)` — full lineage.
- `/archie/knowledge` is now the **Knowledge Vault**: scope tiles, per-item
  expandable detail (provenance, content JSON), version history with
  one-click Restore, and an edit form (topic / capability / scope + scope
  key / content) that requires a change reason.

## 7. Lost-device recovery (Stage 2 continuation, §24)

- `src/lib/archie/stage2-device-recovery.ts` — `recoverLostDevice()`:
  1. revokes the device row,
  2. terminates EVERY other session (the lost phone's session dies; its
     cached data becomes ciphertext without access),
  3. audits `archie.device.recovery` into the Owner stream,
  4. returns the re-enrollment checklist for the replacement device
     (sign in → PENDING → Trust — protected data restored from vault
     backups; the phone is never the only copy).
- `/archie/devices` gains a "Lost this device?" action (confirmation
  guarded) plus the recovery checklist panel.

Tests: `stage2-vault-recovery.test.ts` (7) — reason-required edit guard,
version bump, rollback-from-history + missing-version refusal, recovery
ordering/audit. Full regression 5,907/5,907 (632 files), tsc clean.

## 8. Shared-with-you member view (Stage 2 continuation, §28)

- `src/lib/archie/stage2-shared-client.ts` — the read path for invited
  people: `fetchMyPersonhood()` (RLS: a person sees ONLY their own record),
  `fetchSharedConversations()` / `fetchSharedKnowledge()` — both call the
  deployed SECURITY DEFINER RPCs, which re-check person status, expiry and
  the exact permission on every call. The client never decides access;
  isolation is entirely server-side.
- `/archie/shared` (nav "Shared"): honest states — no access (ask the Owner
  for an invitation), PENDING_REQUEST (waiting for Owner review, nothing
  fetched), ACTIVE (permission chips, expiry date, shared conversations
  and knowledge lists), SUSPENDED / REVOKED. Shared content is only
  fetched for ACTIVE people.
- Tests: `stage2-shared.test.tsx` (8) — RPC-only reads, own-row-only
  personhood, honest error surfacing, and every page state including
  "pending never fetches shared content".

## 9. Connected Device, Household & Account Intelligence (owner directive 2026-09-10)

Anatomical subsystem #23 — `connective-tissue` — migration
`20260913130000_archie_connected_intelligence.sql`. ARCHIE connects
real external hardware and accounts through explicit, authorized
pairing only. Four owner-owned tables:

- `frelux_archie_connections` — the IDENTITY → DEVICE chain: one
  authorized connection to real hardware over bluetooth / wifi /
  hotspot / usb / local-network / internet / api transports. Status
  lifecycle `DISCOVERED → PAIRING → PAIRED ⇄ CONNECTED`,
  `SUSPENDED`, `REVOKED` (terminal). `permissions` jsonb holds only
  granted canonical capabilities (power, media, volume, settings,
  routines, automation, monitoring, maintenance); `access_scope`
  jsonb holds an explicit action list + time windows.
- `frelux_archie_device_accounts` — the ACCOUNT link per connection:
  service name, honest reference label ONLY (never passwords, tokens
  or secrets), its own permission set and link status.
- `frelux_archie_connection_events` — AUDIT HISTORY: every action
  attributed to the acting identity (`owner`/`family`/`archie`),
  with result `success`/`failure`/`denied` — denials are recorded
  exactly like successes.
- `frelux_archie_device_health` — MONITORING snapshots: real values
  read from the device (battery, storage, health, firmware version
  and verification) — never fabricated.

Core engine: `supabase/functions/_shared/archie-ai/native-engine/
connections.ts` (deterministic, provider-free): the pairing state
machine, permission/scope evaluation, the maintenance gate (never
installs unverified, incompatible, malicious or unauthorized
updates) and audit shaping. Client runtime: `src/lib/archie/
connections.ts` — real `navigator.bluetooth.requestDevice` /
`navigator.usb.requestDevice` pairing (the browser's own prompt is
the pairing requirement), an honest network reachability probe,
owner-scoped persistence and audited action evaluation. PWA surface:
the Devices page "Connected hardware & accounts" section with honest
capability reporting (a transport the browser lacks is shown as
unavailable, never claimed).

Standing rules encoded as permanent core principles (seeded
`OWNER_DIRECTIVE`, `ON CONFLICT DO NOTHING`):

- `connected_device_authority` — connectivity is NEVER
  authorization; never bypass passwords, MFA, encryption, pairing
  requirements, OS/manufacturer security or account permissions;
  no fake integrations; family members never inherit Owner
  privileges (RLS: family members read ONLY connections bound to
  their own active person row).
- `learning_authority` — broad authorized access for learning and
  knowledge acquisition without per-activity Owner approval;
  learning never grants production-modification rights.
- `code_production_authority` — owner approval required before
  consequential changes to production code, calculators,
  databases or deployment; ARCHIE may freely analyze, propose,
  generate, test and verify in sandbox environments. Change
  chain: DISCOVER → ANALYZE → PROPOSE → OWNER APPROVAL → STAGE →
  TEST → VERIFY → OWNER APPROVAL → PRODUCTION.

Tests: `connections.test.ts` (35) — lifecycle, permission/scope
gate, family non-inheritance, maintenance gates, audit shaping,
honest capability detection, network-probe honesty, static
no-fabrication integrity. `archie-anatomy.test.ts` extended to 23
subsystems with the connective-tissue registration + real-bindings
tests. `ArchieDevices.test.tsx` extended with the honest
capability UI and registry states (8 total).
