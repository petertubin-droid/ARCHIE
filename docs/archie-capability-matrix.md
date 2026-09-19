# ARCHIE Native Engine — Capability Matrix (final, 2026-09-11)

Consolidated result of the capability + speed pass of 2026-09-11
(baseline → final). Benchmark: `native-engine-benchmark.test.ts`
(52 cases across 17 categories, run against the live engine).
Speed harness: `native-engine-perf.test.ts`. Performance ledger:
`docs/archie-performance-ledger.md` (entries 1–5).

## Capability: 0.942 → 1.000 (52/52)

| Category                         | Status |
| -------------------------------- | ------ |
| authority-enforcement (au-1..3)  | 1.0    |
| causal-reasoning                 | 1.0    |
| context-retention                | 1.0    |
| contradiction-detection          | 1.0    |
| cross-domain-reasoning           | 1.0    |
| error-recovery                   | 1.0    |
| hypothesis-testing               | 1.0    |
| language-understanding (lu-1..4) | 1.0    |
| learning-from-outcomes           | 1.0    |
| logic                            | 1.0    |
| mathematics                      | 1.0    |
| memory-retrieval                 | 1.0    |
| multi-step-reasoning             | 1.0    |
| planning                         | 1.0    |
| temporal-reasoning               | 1.0    |
| tool-selection                   | 1.0    |
| uncertainty                      | 1.0    |

Gaps closed this pass: ms-2 single-slot capture completion
(variable binding/transitivity), cx-3 cross-session memory
(temporal fall-through + day/date NLU), lu-3 engine-level
negation, lu-4 compound multi-intent handling.

## Speed (per docs/archie-performance-ledger.md)

| Workload                         | Before   | After    | Gain   | Entry |
| -------------------------------- | -------- | -------- | ------ | ----- |
| store-query-subject@10k          | 0.268 ms | 0.003 ms | ~134×  | 4     |
| reasoning-forward-chain@200facts | 6.341 ms | 0.934 ms | 6.8×   | 5     |
| store-query-subj-pred@10k        | 0.212 ms | 0.003 ms | ~70×   | 4     |
| converse-per-turn                | 1.379 ms | 1.321 ms | stable | —     |
| memory-recall@500turns           | 0.371 ms | 0.377 ms | stable | —     |

## Forensic coverage (batches 1–3)

- Batches 1–2 (84 behavioral tests): 2 documented defects,
  dead flow layers activated (P4 device token rotation,
  evolution barrel import), cross-source provenance template,
  honest teaching status.
- Batch 3 (14 probes, world model / owner authority / seams):
  2 real defects found and fixed:
  1. **Self-model integrity at boot** — a persisted identity
     fact (stale or poisoned) silently outranked the seed
     corpus: the seed newcomer parked itself as uncertain and
     the rogue identity answered "who are you". Fix: P8
     arbitration tiering — the seed corpus (versioned
     deployment baseline) now demotes conflicting persisted
     facts at boot, EXCEPT owner corrections (provenance note
     "owner correction: …"), which outrank the corpus and
     survive reboots. (`knowledge.ts`)
  2. **identity_query cited uncertain facts** — the answer
     path took `identity[0]` without the status filter the
     knowledge path already had. Fix: same `status !==
"uncertain"` filter. (`engine.ts`)
  - Probes passed as-is (no defects): identity answers
    provider-independent; contradictory identity teaching
    does not flip the self-model; honest unknowns; injected
    "authorization"/"admin"/behavior-instruction teachings
    grant nothing; repetition never mints validation; taught
    authorization never enables execution (propose-only
    stands); correction durability across reboot; store
    indexes consistent after consolidate().

## Commits (perf/forensic pass)

a9bda4d, 6c6ff00, 74312c7, 962f412, a765464, 511d02d, + batch 3.
Full suite: 1287 green (2 documented expected-fails). CI green on
HEAD (E2E smoke + Lighthouse included).

## Standing principles (unchanged, enforced by tests)

- Provider independence: no external AI in ARCHIE, ever.
- Consequential actions end at PROPOSE; execution is the owner's.
- Knowledge never silently flips; contradictions are audible.
- Repetition is not validation — real verification events only.

## Audit-fix pass (2026-09-11, later same day)

Findings C-1 (HIGH) and H-1 (HIGH) from the audit closed; the
epistemic taxonomy gained an honest tier. No capability score
was claimed from this pass — these are integrity fixes, not new
capabilities:

- **C-1 — session isolation (HIGH, fixed):** the engine
  singleton carried one shared working memory, one conversation
  id and one tool surface; concurrent requests inside an edge
  isolate bled context across conversations and stamped
  episodic rows under the wrong id. All per-request state now
  lives in session objects keyed by conversation id; the client
  sends the id and it flows through the chat edge function,
  the kernel and the substrate. Legacy default-conversation
  behavior is preserved (switchable, tested).
  `session-isolation.test.ts` (5 cases) pins isolation AND
  within-conversation continuity.
- **H-1 — owner-asserted epistemic tier (HIGH, fixed):**
  teaching used to mint `validated` on arrival and corrections
  force-validated — an owner's voice was being labeled as
  independent verification. Facts now enter as
  `owner-asserted`: citable with an explicit
  "taught by you, not independently verified" label, answers
  citing ONLY owner-asserted facts open with the honest
  owner-asserted frame (never the validated banner), and
  `validated` is earned through real verification events —
  explicit owner confirmation outcomes (two confirms) or
  independent cross-source corroboration. Repetition of the
  same assertion never promotes (guarded in both the twin-merge
  and consolidation gates). Corrections are stamped as one real
  verification event (`owner-correction:`) but still enter as
  owner-asserted. `owner-asserted-status.test.ts` (5 cases)
  pins the full lifecycle including promotion.
- **M-2 — public retrieval surface:** `retrieveContext()` /
  `rankKnowledge()` expose the SAME retrieval paths converse()
  uses, so callers and tests no longer reach into private
  state (`episodic-persistence.test.ts` migrated).
- Benchmark re-run after the pass: benchmark + perf suites
  green (capability claims unchanged — 52/52 categories stand).
  ARCHIE suite at this point: 93 files, 1413 tests
  (1411 passed, 2 documented expected-fails).

## Native vision (audit item "native eyes", 2026-09-11 pass 3)

Real, native, bounded — measured by `vision.test.ts` (12 cases):

- **PNG**: full native pixel decode (bit depth 8; gray / RGB /
  palette / gray+alpha / RGBA; all 5 scanline filters; per-chunk
  CRC32 verified; zlib via the platform's DecompressionStream).
  Analysis on real pixels: dimensions, orientation, 16-bin
  brightness histogram, mean luma (Rec.709), top-3 dominant
  colors with honest coverage %, downsampled Sobel-lite edge
  density, and a labeled flat/graphics-like/photo-like heuristic
  with confidence.
- **JPEG / GIF**: structural only — dimensions from SOF
  markers / logical screen descriptor. Pixel analysis honestly
  NOT performed (no native JPEG/GIF decoder exists; the analysis
  says so in `notes`).
- **Refusals**: 16-bit PNG, interlaced PNG, >4MP, >20MB, CRC
  corruption, truncated data, unknown formats — each refused
  with the honest reason, never a half-analysis.
- **No benchmark score claimed**: perception has no benchmark
  category; the 12 unit cases measure the decoder and the
  honest bounds. No object recognition exists — natively or
  otherwise — and every summary says so.
- **Reachable from conversation**: WhatsApp image messages are
  downloaded and analyzed with the native eyes; the honest
  summary joins the caption as the text payload, and the
  normal pipeline (secrets, commands, reasoning) runs on it
  unchanged. Audio remains honestly unsupported.
