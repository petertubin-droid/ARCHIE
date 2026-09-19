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
2026-09-19. Full git history of the engine remains in the FRELUX repository;
this repository begins its own history from the extraction point. The FRELUX
app continues to run the same engine code as the live host.
