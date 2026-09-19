# ARCHIE — Native Intelligence Engine

ARCHIE is a **unified, provider-independent cognitive intelligence engine**: one
intelligence core — never sub-agents — that perceives, understands, retrieves,
reasons, models, plans, creates, verifies, acts, observes, evaluates, learns,
remembers, improves, and repeats.

This repository is the **independent engine core**, extracted from the FRELUX
platform so the engine can evolve on its own and be embedded by any host app.

## Core principles (permanent)

- **Native inference** — ARCHIE never depends on Gemini, OpenAI, Claude, or any
  external AI for its core intelligence. External models, where used at all by a
  host, are replaceable components only.
- **Universal knowledge, no subject ceiling.**
- **Never fabricate.** Epistemic taxonomy: KNOWN → VERIFIED → INFERRED →
  ASSUMED → UNKNOWN.
- **Learning never grants execution authority.** Self-modification, deployment,
  infrastructure changes, data migration, and security-control changes always
  require explicit owner authorization.
- **Real production architecture** — no mocks, placeholders, or fake
  intelligence in the engine path.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/lib/archie/` | The engine core: the 15 cognitive systems (perception, knowledge, memory, reasoning, world model, planning, creation, coding, tool intelligence, verification, meta-cognition, learning, self-improvement, security & integrity, cognitive orchestration) |
| `supabase/functions/_shared/archie-ai/` | Server-side runtime: native NLU, planner, goal-scoped chains, semantic verification |
| `supabase/functions/_shared/{evidence,inference,knowledge,lexicon,semantic-graph,studio}/` | Engine subsystems: Evidence & Truth, Context & Inference, knowledge repository |
| `supabase/functions/archie-*/` | 25 deployed edge functions (chat, status, studio, owner-auth, escrow, voice, WhatsApp, and more) |
| `src/lib/` (non-archie files) | **Host bindings** — FRELUX modules the engine's operators and tools bind to (calculators, estimation engines, intelligence subsystems). These are the current host's contributions; a different host replaces them. |
| `supabase/migrations/` | The complete platform schema chain (302 migrations) ARCHIE operates on — kept whole because SQL migrations must apply in order |
| `docs/` | Architecture audits, forensic reports, capability matrix, performance ledger |

## Development

```bash
npm install
npx tsc --noEmit -p tsconfig.app.json   # type check
npx vitest run                          # full test suite (engine + edge functions)
```

## Provenance

Extracted from [FRELUX](https://github.com/petertubin-droid/frelux) on
2026-09-19; the FRELUX repo was then stripped of all ARCHIE code. Full
git history of the engine remains in the FRELUX repository; this
repository begins its own history from the extraction point. The FRELUX
frontend remains the engine's live host, calling the deployed archie-*
functions through its remote bridge.

## CI/CD

Two GitHub Actions workflows protect this repo:

### 1. CI — `.github/workflows/ci.yml`
Runs on every push to `main` and every pull request:
`npm ci` → `npx tsc --noEmit -p tsconfig.app.json` → `npx vitest run`
(full engine test suite: app project + edge-function project under one
vitest config) → `npm run build`.

### 2. Deploy — `.github/workflows/archie-deploy.yml`
Deploys every `archie-*` edge function to the Supabase project
(Freluxtools, hqhvlkunkdrxyuvziorm) on pushes that touch
`supabase/functions/archie-*/**`, `supabase/functions/_shared/**`,
`supabase/migrations/**` or the workflow file, plus manual dispatch
from the Actions tab. Visitor-path functions deploy with
`--no-verify-jwt` (they enforce their own owner/visitor gates
internally); the agent worker deploys with the default JWT lock.

**Required secret (repo → Settings → Secrets → Actions):**
`SUPABASE_ACCESS_TOKEN` — a Supabase access token with functions
deploy permission. Without it the deploy workflow fails and the
functions stay on their last deployed versions.

Database migrations are intentionally NOT deployed here: the
Supabase GitHub integration replays the migration chain from this
repo against the project.

### What CI guarantees
- Type safety across engine core + edge functions + PWA surface
- No regression in the 15 cognitive systems (2,900+ tests)
- The provider-independence, no-fabrication and owner-authority
  principles stay enforced by their dedicated test suites
