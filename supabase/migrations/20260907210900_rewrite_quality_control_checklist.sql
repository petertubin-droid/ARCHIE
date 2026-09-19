-- Full body rewrite: construction-quality-control-inspection-checklist (construction-guides #10)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Most expensive construction defects are invisible the day they are created. A weak mix poured into a column looks identical to a good one until the load arrives years later. That is why quality control lives in inspections — small, disciplined checks at the moments when a mistake can still be corrected cheaply.

This guide gives you a stage-by-stage inspection checklist you can run yourself or hand to your site engineer: what to verify before concrete is poured, during blockwork, at decking, at roofing, and at finishing. Each item takes minutes and answers one question — does this stage meet standard, yes or no.

## How to Use This Checklist — the Three Rules

Before the items, the method, because a checklist without a method is a suggestion:

1. **Every check happens at its moment, not after it.** "Steel before the pour" means before — concrete poured is concrete paid for, and an unverified pour is a dispute in a spreadsheet. The moment each check is due is written into the checklist itself.
2. **Every result is written down, dated, and signed.** The site book (a plain exercise book that lives on site) is the system: gate passed or failed, who checked, what was done about it. An inspection that is not recorded did not happen, as far as the project, the insurer, or any later dispute is concerned.
3. **A failed check stops the next stage.** This is the whole leverage of quality control: the schedule may only proceed past a passed gate. The site that "will fix it as we go" is scheduling the fix's discovery for the most expensive possible moment — usually after the next layer has closed it in.

## Stage 1 — Setting Out and Excavation

*The moment: before excavation, and again after digging, before blinding.*

- [ ] Corner pegs match the approved drawing dimensions, measured tape-to-tape.
- [ ] Diagonals equal — the rectangle is square, not approximately square.
- [ ] Profiles set back from the trenches and immovable (they hold the lines for the whole build).
- [ ] Trench depth per the design, bottom cleaned of loose spoil and standing water.
- [ ] Trench bottom inspected against the soil the design assumed — if the soil at depth differs from the report, stop and call the engineer.

**The catch this stage exists for:** a 100 mm setting-out error is a five-minute fix at pegs and a boundary dispute at roofline; an under-dug or over-dug trench changes the concrete bill and the foundation's behaviour together.

## Stage 2 — Foundation Concrete and Blockwork to DPC

*The moment: mix checks during every pour; DPC check before backfill, always.*

- [ ] Batching by counted pans per the specified ratio (1:2:4 or per design) — no eye-balled loads, no comfort water.
- [ ] Concrete delivered, placed, and compacted in the pour's window — no retempering with water to revive a stiffening mix.
- [ ] Foundations and blockwork cured to the calendar before backfilling (about a week for loading, per the design's schedule).
- [ ] DPC membrane continuous across all wall tops, joints lapped per the manufacturer, no punctures, edges protected.
- [ ] Backfill placed in compacted layers against cured walls, membrane protected with blinding on both sides.

**The catch:** the DPC check is ten minutes and the single most-skipped item in Nigerian building — every repainted rising-damp stain in the country is this checkbox, unchecked.

## Stage 3 — Superstructure Blockwork

*The moment: every few courses, not at the end of the lift.*

- [ ] Blocks cured a week minimum before laying (a fresh block shrinks in the wall and drags the joints apart).
- [ ] Courses level and walls plumb — checked with line and spirit level each few courses, corners both ways.
- [ ] Joints full and struck, not buttered flush with gaps behind.
- [ ] Openings true to the door/window schedule — widths and heights, because lintels are ordered against the schedule, not against the wall that resulted.
- [ ] Wall ties and intersection bonding as the drawing shows; first-fix conduits and pipe drops in place before walls outgrow them.
- [ ] Lintel bearings solid — each end sits on the blockwork length the drawing specifies.

**The catch:** a two-millimetre joint error per course is a thirty-millimetre lean by fifteen courses — and a lintel that no longer bears as drawn.

## Stage 4 — Decking (Suspended Slabs)

*The moment: steel and formwork checked BEFORE the pour; curing calendar checked after it.*

- [ ] Formwork tight (pencil-test gaps pass slurry), propped per the design's spacing, deck level and beams true.
- [ ] Reinforcement per the bar schedule: bar sizes, spacings, laps, chairs keeping bottom steel off the formwork, cover blocks maintaining edge cover.
- [ ] Penetrations and openings already formed — holes are designed before casting, never chiselled after (see the [multi-storey structural guide](/learn/structural-considerations-multi-story-buildings)).
- [ ] Pour executed in continuous sections; cube samples taken if the supervision plan requires them; no water added on site for workability.
- [ ] Curing calendar respected — damp-cured in heat, shoring left until the design's strike date, **no materials stored on the young deck**.

**The catch:** the pre-pour steel check is the cheapest inspection in the entire project relative to what it protects — the same steel will never be visible again, and its schedule is the only proof it ever happened. Photograph it into the site book.

## Stage 5 — Roofing

*The moment: structure complete before sheeting; hose test before the final payment on the roofing line.*

- [ ] Wall plates level and anchored; trusses/rafters per the design spacing, braced both directions.
- [ ] Pitch and sheet laps per the manufacturer's written instructions — not per the crew's habit.
- [ ] Ridge, hip, and valley cappings closed; flashings at every wall or penetration junction.
- [ ] Fixings per schedule at every sheet — a storm tests the skipped screw first.
- [ ] The hose test passed: water poured at the ridge and along every junction, with a watcher inside. Dry ceiling = payment released.

**The catch:** a month of sunshine certifies nothing; five minutes of water tells the truth. Roofing paid before the hose test is roofing paid on trust the weather will later audit.

## Stage 6 — Finishing Phase

*The moment: each coat's check before the next coat; waterproofing test before any tile.*

- [ ] Render and screed cured before coating, hollow-free (the tap test), no map-cracking from single thick passes.
- [ ] Walls dry before priming — the polythene-tape test overnight in any suspect wall.
- [ ] Waterproofing flood-tested 24–48 hours (ponded water, level marked, watched) before the first tile is set.
- [ ] Tiling per layout, falls to outlets in wet areas, waste factors applied honestly (the [tile calculator](/tile-calculator) prices the honest factors).
- [ ] Paint: primer present (the edge-sand test in a discreet corner), two full topcoats, uniform sheen under daylight, edges cut clean; the raking-torch pass silent (see [finishing quality standards](/learn/finishing-quality-standards-what-to-look-for) for the full room protocol).

**The catch:** every finishing check is a *before* check — putty before primer locks in pinholes, tile before flood-test locks in the membrane's only chance to be tested, paint over damp walls locks in the moisture with interest.

## The Handover Gate — the Final Walk-Through

*The moment: after full cure, before the final balance.*

The finishing-phase checks above, run room by room as a formal walk-through: daylight pass (sheen and colour), torch pass (ripples, pinholes, clouds), straightedge pass (flatness tolerance), edge pass (corners, skirting lines, fittings), tape test (one discreet adhesion check per room), and every finding taped, photographed, and listed in a written snag list — **the final payment follows the list, not the handshake.** Hold a small retention for a few weeks: finishing defects are *timed* — the first humid season and the first evening bulbs are the honest inspectors, and the retention keeps the finisher's interest alive until they have reported.

## If You Hire Supervision — What to Hand Over

This checklist works handed directly to a clerk-of-works or site engineer as their brief, and that is the strongest way to run it: the professional version adds the checks that need training (cube handling, bar-bending verification, slump discipline) around this same gate structure. What the owner keeps, even with supervision hired, is the site book habit and the payment rule — money follows passed gates. Supervision makes the checks professional; the payment structure makes them non-negotiable.


## The Five Tools the Whole Checklist Runs On

The entire checklist runs on five purchases that fit in one bag, and their total cost is less than re-laying one wall:

- **The tape (5–8 m)** — diagonals, openings, bearings, schedules. Every "per the drawing" check is a tape check.
- **The spirit level (600–1200 mm) and mason's line** — plumb and level every few courses; the line makes the whole crew's work consistent, not just the corners'.
- **The ratio sheet** — pan counts per mix, laminated at the mixer. Batching discipline is reading, not talent.
- **The torch** — raking light on renders, screeds, and paint; the lie detector of the finishing phase (per [the finishing tools guide](/learn/finishing-tools-every-contractor-should-own)).
- **The site book and a hose** — the record and the roof test. The book converts inspections into evidence; the water converts roofing claims into facts.

Nothing on this list is exotic, and that is the point: quality control is not a laboratory, it is a habit with a toolkit that costs less than the cheapest stage it protects.

## Closing

Quality control is not a product you buy; it is a calendar of small, dated yes-or-no moments: square diagonals, counted pans, cured blocks, level courses, photographed steel, hosed roofs, flood-tested membranes, torch-checked walls — each one minutes at its moment, each one protecting a stage whose failure arrives years later, wearing someone else's name on the invoice. Print the checklist, date the book, let no stage pass its gate unverified. For the stages' sequence and the mistakes this checklist exists to catch, see [the construction sequence guide](/learn/complete-guide-building-construction-sequence) and [common construction mistakes](/learn/common-construction-mistakes-and-how-to-prevent).
$body$, updated_at = now()
WHERE slug = 'construction-quality-control-inspection-checklist' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
