-- Full body rewrite: complete-guide-building-construction-sequence (construction-guides #1)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Construction has an unforgiving order of operations. Decking before lintels cured, waterproofing after tiling, painting over damp screed — every attempt to skip or reorder a step is repaid later with interest. The sequence is not bureaucracy; it is physics and chemistry wearing hard hats.

This guide lays out the full sequence from land preparation to final finishes, with the reason each stage sits where it does. Once you understand why waterproofing must precede tiling, or why screeding comes after electrical chasing, the whole process stops feeling like a list to memorize and starts making sense on its own.

## The Master Sequence — and the Three Logics Behind It

The build order below is the one Nigerian practice has settled on, and every entry obeys one of three logics:

- **Strength logic:** every load-bearing thing must be strong enough *before* the next load lands on it.
- **Containment logic:** wet trades follow each other so water and curing never fight occupancy or finishes.
- **Access logic:** work happens while it can still be reached — the wall that is easy to plaster today is impossible to reach after the roof is on.

| # | Stage | The logic that places it here |
|---|---|---|
| 1 | Site clearance and setting out | Strength + accuracy: the building's geometry is fixed here |
| 2 | Excavation to foundation | Strength: dig before anything loads the ground |
| 3 | Foundation concrete, blockwork to DPC level | Strength: the base carries everything above |
| 4 | DPC (damp-proof course) and backfilling | Containment: the moisture barrier goes under everything habitable |
| 5 | Superstructure blockwork | Strength: rises on a cured base |
| 6 | Lintels over openings | Strength: carry the courses above doors and windows |
| 7 | Decking / suspended slabs (where designed) | Strength: cast and cured before loading |
| 8 | Roofing | Access + containment: closes the building before wet finishes |
| 9 | Electrical and plumbing first fix (chasing, conduits) | Access: inside walls before they close up |
| 10 | Rendering/screeding, external and internal | Containment: mortar needs shade and a weather-free wall |
| 11 | Window and door frames installed | Access: frames set before finishing covers the reveals |
| 12 | Electrical and plumbing second fix | Access: after wall finishing, before final decoration |
| 13 | Waterproofing wet areas | Containment: membrane before any tile traps it out of reach |
| 14 | Tiling and floor finishes | Containment: hard finishes over completed wet work |
| 15 | Ceiling (POP / suspended) | Access: after the messy trades above have stopped |
| 16 | Painting and final decoration | Containment: last, over dry, stable surfaces |

Read the table once for the order and once for the reasons: no stage is where it is by tradition. Traditions here are just physics that survived.

## Stage-by-Stage: the Why, and What Breaks When It Is Moved

### Setting out and excavation

The building is marked from the drawing onto the ground with profiles and string lines, square-checked at diagonals, then excavated to the foundation depth the design calls for. **What breaks when rushed:** a setting-out error of 150 mm is cheap to fix today and a demolition dispute after the neighbors move in; an under-excavated foundation trench is a settlement crack with a calendar on it.

### Foundation and blockwork to DPC

Blinding, then foundation concrete (the mix the design specifies — never eyeballed), then the block courses from footing to DPC level. **The logic:** everything above is carried here, so the concrete cures before backfill, and the DPC membrane is laid continuously before the ground floor fills against it. **What breaks:** backfilling against green (uncured) blockwork cracks the courses at ground level; a punctured or bridged DPC is a rising-damp sentence for every finish above it — the stain will find the weakest wall and sign it.

### Superstructure, lintels, and decking

Blockwork rises; lintels span every opening; where the design has a suspended floor, formwork, reinforcement, and casting follow — with the cast slab cured to strength before it carries anything, including materials stacks and the masons themselves. **What breaks:** decking loaded early cracks in the soffit where the reinforcement was never given its strength; a lintel cast in the same breath as the courses it carries sags under the load it has not yet earned. (For the lintel/decking material numbers: the [structural calculator](/structural-calculator) sizes them from spans.)

### Roofing

The roof goes on before the finishes begin, and the reason is not rain alone: the roof is the building's shade structure, and rendering, screeding, and coating all need a controlled climate. Mortar cured in direct sun cracks; paint over hot walls skins before it bonds. **What breaks when moved:** finishing before roofing means every coat is applied in a weather system, not a building — and the forecast starts attending your project meetings.

### First fix — conduits and pipes in walls

Electrical chasing and plumbing drops run inside the blockwork, then rendering closes over them. The order matters twice: the chase weakens the wall least before rendering, and the rendering gives the conduit its fire-protective and mechanical cover. **What breaks:** chasing after finishing reopens finished walls and duplicates the plaster work; running cables after POP means surface-mounted everything, which is a different (and cheaper-looking) building.

### Rendering and screeding

Internal and external rendering, floor screeds, all under the roof's shade, all with their curing windows respected before anything loads or coats them. **The logic:** this is the containment stage — wet trades in sequence, each drying before the next, so no moisture is trapped under a finish. **What breaks:** screeding over conduits that were never pressure-tested means the leak is found under the tile; rendering without a cured base gives hairline maps within a season.

### Frames, second fix, waterproofing, tiling

Window and door frames land into finished reveals; second-fix electricals and plumbing follow the wall finishing; wet-area waterproofing goes on the *sound, cured* substrate and cures before a single tile. Then tiling — hard finishes over completed, tested wet work. **The rule from the intro holds:** waterproofing must precede tiling because a membrane behind a tile is a membrane forever; what breaks is found by the neighbour downstairs.

### Ceiling, then paint, then handover

Suspended or POP ceilings close the overhead services, and painting comes last of all — over surfaces that have stopped moving, drying, and being worked on. **What breaks:** paint before POP means repainting the patches where the ceiling work chipped the walls; paint over fresh screed moisture bubbles within the first humid season, and no brand of paint outruns chemistry.

## The Curing Calendar — Where Projects Actually Go Wrong

The single most violated rule in the whole sequence is invisible: **concrete and mortar need time, and the schedule does not negotiate.** Working planning figures: foundation concrete wants about a week before significant loading (design strength at 28 days); lintels and decking similar; render wants days, and the wall under paint wants roughly a month of drying. Hot weather shortens set times but steals curing moisture — damp-cure slabs and render in the dry season, and in the rainy season, add the rain days before you promise anyone a handover date.

The projects that finish late are rarely slow at any stage — they are slow at *repeating* stages: the slab loaded early and re-cracked, the wall painted damp and repainted, the waterproofing tiled over before curing and redone from the tile down. The sequence is not just the order; it is the wait built into the order.

## Sequencing and the Money — Who Waits, Pays

Each stage's materials have a natural buy moment: blocks before blockwork, not "when the price looks good" three phases early — a yard of blocks stacked during foundation work is capital, breakage, and theft exposure for months. Cash-flow follows the sequence: the big material spikes are foundation, decking, and roofing; the labour spikes are blockwork and finishing; and the flat, patient line in between is curing time, which costs nothing and is the only stage that cannot be bought faster with money — only with planning.

A build planned around this sequence buys each phase's materials in its own week and never stores a phase ahead; a build planned around discounts stores money in the weather. For converting your drawing dimensions into each phase's quantities, see [how to estimate materials for each construction phase](/learn/how-to-estimate-materials-each-construction-phase); for the stage-by-stage durations, see the [construction timeline guide](/learn/construction-timeline-how-long-each-phase-takes).


## The Sign-Off Chain — Quality Gates Between Stages

The sequence runs best with an explicit sign-off between stages: each stage has a check that must pass before the next one's materials are even ordered. The gates are cheap — a straightedge, a level, a tape, a torch — and each one protects the stage that follows:

- **After setting out:** diagonals measured equal, profiles immovable. The gate for every line of blockwork that follows.
- **After foundation concrete:** cure time respected, formwork stripped clean, no honeycombing at edges. The gate for backfill.
- **After DPC:** membrane continuous, unbroken, protected during backfill. The gate for floor filling and all habitable work.
- **After blockwork:** courses level and plumb, lintel bearings solid. The gate for decking formwork.
- **After decking:** cure complete before loading; soffit shoring stays until design strength. The gate for roofing stores and masons overhead.
- **After roof:** no leaks at ridges and valleys (test with a hose before finishes close the ceiling). The gate for every wet finish below.
- **After first fix:** conduits and pipes pressure-tested and photographed before rendering closes them. The gate that prevents the most expensive re-opens in the building.
- **After waterproofing:** the flood test — 24–48 hours of ponded water in bathrooms before one tile is set. The gate between a membrane and a mistake.

Write the gates into the project programme, and each trade's payment follows its gate: money moves when checks pass, which is how a sequence enforces itself without arguments.

## Closing

The construction sequence is physics and chemistry wearing hard hats: loads need strength before they land, water needs containment before finishes trap it, and every trade needs its access before the building closes it off. Move a stage and the building will invoice you for the move within a season. Build in order, respect the curing calendar, buy with the sequence — and for the numbers each stage needs, the [smart calculator](/smart-calculator) and [build-to-roof estimator](/build-to-roof-estimator) turn your dimensions into phase-by-phase quantities.
$body$, updated_at = now()
WHERE slug = 'complete-guide-building-construction-sequence' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
