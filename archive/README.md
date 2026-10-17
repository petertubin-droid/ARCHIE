# Archive

Material moved here from the frelux repo on 2026-10-17, per the owner
directive that ARCHIE is fully separated from frelux. Nothing in this
folder is compiled, tested, or deployed: `tsconfig.app.json` only
includes `src/`, vitest only matches `src/**` and
`supabase/functions/**/*.test.ts`, and the deploy workflow only
triggers on `supabase/` paths. This is reference material only.

## Contents

### `pre-crypto-refactor/`

The Sep-11-era Crypto & Blockchain Intelligence snapshot that was left
behind (untracked) in the frelux working tree, plus a stashed
engine-wiring savepoint. Delta analysis against this repo's current
code (2026-10-17):

| Archived file | Status in current repo |
|---|---|
| `native-engine/blockchain.ts` (272 lines) | Superseded by `native-engine/crypto/blockchain.ts` (472 lines) |
| `native-engine/market-analysis.ts` (155) | Superseded by `native-engine/crypto/market-analysis.ts` (429) |
| `native-engine/market-data.ts` (314) | Superseded by `native-engine/crypto/market-data.ts` (1355) |
| `native-engine/probability.ts` (176) | Superseded by `native-engine/crypto/probability.ts` (410) |
| `native-engine/trade-gate.ts` (296) | Superseded by `native-engine/crypto/trade-gate.ts` (288, refactored) |
| `native-engine/passphrase-tools.ts` (163) | Superseded by `native-engine/crypto/passphrase-recovery.ts` (271) |
| `native-engine/paper-trading.ts` | Superseded by `native-engine/crypto/order-lifecycle.ts` + `crypto/portfolio.ts` + `crypto/exchange/` |
| `native-engine/domains/bip39-english.data.ts` | Superseded by the inline wordlist in `native-engine/crypto/bip39.ts` |
| `native-engine/domains/crypto.ts` (old skill shape: `cryptoSkill`/`cryptoAnswerAsync`/`newCryptoSkillState`, 4 intents) | Superseded by the registry-based `createCryptoSkill()` in `native-engine/domains/crypto.ts` and the consolidated `crypto_market_query` intent |
| `tests/*.test.ts` (6 files) | Coverage now lives in `src/lib/archie/__tests__/` (crypto-intelligence, market-intelligence, market-data, blockchain, trade-gate, hd-crypto, global-markets) and `native-engine/__tests__/` |

**Not superseded — the one unique piece:**
`native-engine/trade-gate-verifier.ts` exports `fnv1aForDecision` and
`verifyDecision`: an FNV-1a decision hash that sealed a gate ELIGIBLE
decision to its exact inputs, verified at the execution seam so a
replayed or tampered decision is rejected. The current
`crypto/trade-gate.ts` has no decision-hash mechanism. If tamper
sealing at the execution seam is wanted, port the verifier and adapt
it to the current `GateDecision` shape (the archived version binds to
the old interface, so it cannot be dropped in as-is).

`frelux-stash-engine-wip.patch` — the "Oct 17 savepoint" stash from
the frelux repo: +42 lines wiring the crypto skill into
`engine.ts` (4 intents: market_query, trade_request, wallet_query,
blockchain_query) and +100 lines of NLU corpus for those intents.
Superseded by the current single `crypto_market_query` intent wiring;
kept for reference only.

### `frelux-snapshot/`

- `ArchieMark.tsx` — the inline-SVG ARCHIE identity mark (violet-cyan
  FRELUX brand gradient). It was unreferenced dead code in frelux;
  moved here in case the ARCHIE frontend wants a shared mark.
- `archie-forensic-audit-2026-09-10.md` and
  `archie-reasoning-fix-plan.md` — older (Sep-10) working documents.
  The Sep-13 forensic work lives in `docs/`.
