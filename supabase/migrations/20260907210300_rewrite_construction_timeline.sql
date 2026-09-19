-- Full body rewrite: construction-timeline-how-long-each-phase-takes (construction-guides #4)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Ask three different builders how long a standard 3-bedroom bungalow takes to complete and you will get three very different answers — usually because nobody separated planned duration from realistic duration. Phases overlap, materials arrive late, and the rains in April and October quietly erase weeks of progress.

This guide breaks a typical Nigerian build into its real phases, from site clearing through handover, and shows the honest time range for each stage. You will also see which phases can safely overlap, where delays usually hide, and how to build a schedule that survives contact with reality.

## The Honest Phase Table — a 3-Bedroom Bungalow, Two Scenarios

Working durations for a typical 3-bedroom bungalow (about 180–220 m² floor area) on an accessible urban plot, with steady materials and a normal crew:

| Phase | Dry-season start | Rainy-season start |
|---|---|---|
| Setting out + excavation | 1–2 weeks | 1–2 weeks |
| Foundation + blockwork to DPC | 2–3 weeks | 3–5 weeks |
| Backfill + ground floor slab | 1–2 weeks | 2–3 weeks |
| Superstructure blockwork | 3–5 weeks | 4–6 weeks |
| Lintels + decking (if designed) | 3–4 weeks incl. curing | 4–5 weeks |
| Roofing | 2–3 weeks | 3–4 weeks |
| First fix (electrical/plumbing) | 1–2 weeks | 1–2 weeks |
| Rendering + screeding | 3–5 weeks | 4–7 weeks |
| Frames, second fix, waterproofing | 2–3 weeks | 2–4 weeks |
| Tiling + ceilings | 3–5 weeks | 3–5 weeks |
| Painting + handover | 2–3 weeks | 2–4 weeks |
| **Whole build, structure to handover** | **~7–10 months** | **~9–14 months** |

Two honest notes on the table. First, the ranges already assume the sequence is respected — a build that rushes curing or paints damp walls does not fit *any* calendar; it fits a loop. Second, the rainy-season column is not pessimism, it is two effects: rain days stop work outright (concrete, render, and paint each have zero-rain windows), and humidity stretches every drying interval at exactly the stages that are all drying. (The [construction sequence guide](/learn/complete-guide-building-construction-sequence) explains what each phase contains and why the order is fixed; this guide is about how long each one honestly takes.)

## The Real Timeline Movers — What Actually Eats Weeks

The table above is the *physics* of duration. Five site realities then move the total by months:

**Materials logistics.** The single biggest driver. A site that orders per phase and takes delivery on time runs the calendar; a site that waits for "a better price" on cement runs the price of the delay, which is measured in idle labour weeks. Every phase gate in the schedule should have its materials on the ground *before* the phase starts — late material is the most common cause of the "95% finished for 8 months" building.

**Curing discipline vs calendar pressure.** Concrete earns strength on a fixed curve; the schedule does not negotiate with it. The professional method is to *schedule the waits* — foundation curing overlaps backfill preparation, deck curing overlaps roof-material purchase — so the calendar absorbs the chemistry instead of fighting it. A schedule without planned waits discovers them one stall at a time.

**Crew size and skill.** Blockwork pace varies more between crews than between buildings: a settled, coordinated gang lays noticeably more courses per day than the same number of strangers. When you hear a builder quote durations in "weeks" without stating crew size, the number is decoration — ask for the crew assumption behind it.

**Rain and its two windows.** The rain-free window matters per activity: concrete pours need a dry day and a dry-forecast afternoon; render needs days of shade and no washout; paint needs its full drying interval. In the rainy season the schedule becomes an exercise in *opportunistic work* — outdoor wet trades fill the dry spells, indoor trades (joinery, second fix) fill the rain days.

**The owner's decision speed.** The quiet one. Variations, colour choices, door schedule confirmations — every decision deferred by the owner stalls someone's crew. The standard fix is a decision calendar: every choice the build needs is listed with the phase that needs it, and made *before* that phase starts. Owners who decide late pay the same delay bill as owners who buy late.

## What Can Safely Overlap — and What Must Never

Legitimate overlaps (the professional schedule exploits them):

- **Excavation spoil handling alongside foundation prep** — one crew, one mobilization.
- **Block production/procurement curing during foundation work** — blocks need their own curing week; running it in parallel saves real calendar.
- **Lintel casting while upper blockwork continues** elsewhere on plan.
- **Roof carpentry after deck curing** — timber fitting can begin the moment the calendar, not the shoring, allows.
- **First-fix chasing during superstructure gaps** — services chase walls the day after they are built, ahead of rendering.
- **Window/door procurement during blockwork** — long lead-time items ordered early; delivery still staged.

Forbidden overlaps (each one re-creates work):

- **Backfill against uncured blockwork** — the classic ground-floor crack generator.
- **Loading a deck before its cure date** — soffit cracks that live in the ceiling forever.
- **Rendering and roofing racing on the same face** — render needs the roof's shade to cure; racing it means re-rendering.
- **Painting over fresh screed or render** — the moisture is trapped and bills you within the first humid season, with interest.
- **Tiling over uncured waterproofing** — the membrane test exists *before* the tile because after the tile it costs the tile.

The pattern: overlaps that share *different* resources are free; overlaps that make one trade's output another trade's input out of order are loans at compound interest.

## Building the Schedule That Survives Contact

A realistic Nigerian build schedule has four habits that distinguish it from the optimistic one:

1. **It plans in gates, not dates.** "Waterproofing flood test passed" is a gate; "tile the bathrooms on the 14th" is a date. Gates pass when checks pass; dates pass when the calendar says so, whether or not the wall did.
2. **It carries a weather buffer per season.** A dry-season start builds with ~10% slack; a rainy-season start carries more. A schedule with zero slack is not a schedule, it is a wish with dates.
3. **It sequences purchases with phases** — the material for each phase is bought and delivered before the phase's gate, so the crew never waits on the store.
4. **It publishes the decision calendar** to the owner in week one: every choice the owner owes the build, listed by the phase that needs it, decided early.

Then the schedule gets *tracked*: actual against planned per phase, weekly, in the site book. Slippage caught in week one of a phase costs a day; slippage discovered at the phase's end costs the phase.

## Reading a Contractor's Duration Quote

When a builder quotes "six months to complete", the professional owner hears four unasked questions: crew size per phase (the physics of pace), what the quote's phases *include* (a "completed" building that excludes fencing, driveway, and external work is a different calendar), what weather the plan assumes (dry-season start or not), and what happens at each gate if a check fails (the rework policy). A quote that answers all four is a schedule; a quote that answers none of them is a marketing document with months in it.

And the reverse applies: an owner who demands a fixed completion date on a rain-exposed, cash-flow-irregular programme is asking for the one thing that guarantees rushed stages — and rushed stages is how builds meet the [common construction mistakes](/learn/common-construction-mistakes-and-how-to-prevent) guide halfway. Duration is an output of funding, sequence, and season; it can be predicted, but not dictated.


## Case Study — Two Identical Bungalows, Two Calendars

Two brothers build the same 4-bedroom plan on adjacent plots in the same compound, starting two months apart. The plans are identical; the calendars are not.

**Build A (dry-season start, November):** setting out in harmattan's stable weather, foundation and blockwork run through the dry months with rain-free pours and fast-drying mortar; the deck cures into the first rains *unloaded and shored*; roofing completes before the April storms peak; and by the time the heavy rains arrive, the building is closed and the whole finishing phase runs indoors — render curing in shade, paint drying in still air. Structure-to-roof in roughly five to six months; handover inside a year.

**Build B (rainy-season start, April):** excavation fills with water twice before blinding; every concrete pour waits for a forecast window and some windows do not arrive; blockwork stretches because mortar and blocks both hold moisture in humid air; the deck is cast in June and its curing week becomes two; roofing fights the storms and loses sheets to one of them. Structure-to-roof alone consumes the rain months and runs eight to nine months — and the finishing phase, had it started immediately, would have been painting in the peak humidity, so it waits for the dry season.

Same plan, same crew quality, same budget honesty — a calendar gap of five to seven months, driven entirely by the start month. The lesson is not "wait for November" (life does not always allow it); it is that the start month decides which buffer your schedule needs, and a builder who quotes Build A's calendar for Build B's start date is quoting the wrong building.

## Reading the Two-Scenario Table Backward

One more use of the phase table at the top: read the rainy-season column as the *floor* — the duration below which no honest schedule goes for that start month — and the dry-season column as the target a well-run, well-funded site can hit. A quoted duration shorter than the floor is not a plan, it is a bid; the difference will be recovered later from your curing times, your inspection gates, or your finishes. And a quoted duration far above the ceiling is not prudence, it is idle labour billed monthly — the schedule version of paying attendance instead of output.

## Closing

The honest timeline for a Nigerian bungalow is measured in seasons, not weeks: structure in the dry months if you can start them, finishes in any weather under a closed roof, and gates passing — not dates expiring — as the real progress markers. Plan with gates and buffers, overlap the free pairs and never the forbidden ones, and let the [build-to-roof estimator](/build-to-roof-estimator) align the material calendar with the phase calendar before the first peg goes in.
$body$, updated_at = now()
WHERE slug = 'construction-timeline-how-long-each-phase-takes' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
