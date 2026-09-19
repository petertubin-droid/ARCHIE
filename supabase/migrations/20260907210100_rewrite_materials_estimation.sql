-- Full body rewrite: how-to-estimate-materials-each-construction-phase (construction-guides #2)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Ordering materials by guesswork produces one of two outcomes: a yard full of unused blocks bleeding money, or a stalled site waiting on the next bag of cement. Both cost more than the thirty minutes a proper quantity estimate takes.

This guide works through the main construction phases one at a time — foundation, blockwork, lintel and decking, roofing, and finishing — and shows how to convert your drawing dimensions into realistic quantities, with waste allowances that match how materials actually behave on Nigerian sites.

## The Method That Runs Through Every Phase

Every phase's estimate follows the same four moves, and the moves never change:

1. **Measure from the drawing, not from memory.** Wall lengths, heights, openings, spans — written down per element, not "about X".
2. **Convert geometry to volume or area** with the phase's unit: concrete in cubic metres, blocks in numbers, render in square metres, paint in litres.
3. **Apply the mix or coverage ratio** to convert to materials: a 1:2:4 concrete is roughly 6.4 bags of cement and double-headed pans of sand and granite per cubic metre (verify against your actual supply — head-pan volumes vary, which is why the [smart calculator](/smart-calculator) computes from first principles rather than folklore).
4. **Add the honest waste allowance.** Not padding — physics: blocks break in handling, mortar dries in the wheelbarrow, cement multiplies nothing.

The phases differ only in their ratios and their waste behaviour. Master the four moves once and every phase becomes arithmetic instead of anxiety.

## Phase 1 — Foundation

**What you measure:** the foundation trench geometry from the drawing — total trench length, width, and depth for the footing; the blinding thickness underneath; the block courses from footing to DPC if blockwork is counted in this phase.

**The conversions:** trench volume = length × width × depth. Blinding (usually a lean 1:4 or 1:6 mix) fills the bottom; the footing concrete (the design's mix — commonly 1:2:4 for ordinary residential footings) fills the rest. Add the DPC-level blockwork: number of blocks = wall area ÷ block face area, with the mortar as a separate small concrete estimate.

**The waste behaviour:** excavation is never as clean as the drawing — allow for over-dig and for filling the overrun with blinding. Blocks at ground level suffer the worst handling of the project; 5% breakage is realistic, not pessimistic.

**The classic error:** estimating footing concrete without measuring the *actual* dug trench. The drawing says 600 mm wide; the labourer digging by hand delivers 750 mm in places — and the concrete bill follows the hole, not the drawing. Measure after excavation.

## Phase 2 — Blockwork

**What you measure:** every wall's length × height, minus doors and windows (from the door/window schedule, not guessed), split into external and internal walls — they are often different block sizes.

**The conversions:** blocks = net wall area ÷ (block length × block height). In Nigerian practice a 450 × 225 mm (9-inch) face is standard for externals and 450 × 150 for internal partitions, but *read your blocks*: nominal sizes vary slightly by manufacturer, and the estimate should use the block on the ground, not the block in the textbook. Mortar follows the joint volume at the specified mix.

**The waste behaviour:** the longer and higher the lift, the more breakage — allow 5%, and remember that cut blocks at openings, corners, and ends consume extra units that a pure area division hides. Lintel bearings want extra blocks and solid fill.

**The classic error:** forgetting that wall height includes beam courses at deck level and the gable courses at roof level — both are blockwork, both get missed in "per-floor" estimates.

## Phase 3 — Lintels and Decking

**What you measure:** every opening's span plus its bearings (rule of thumb: bearing 150–300 mm each side), and for suspended floors, the slab area, thickness, beam depths, and formwork underside area.

**The conversions:** lintel volume = span+ × bearings × width × depth; decking concrete = area × slab thickness, plus beam volumes. Reinforcement is a tonnage estimate from the design — bars spaced per the drawings. Formwork is a square-metre estimate (soffit plus sides) with props counted per bay. The [structural calculator](/structural-calculator) runs these conversions from span to steel.

**The waste behaviour:** concrete here is the least forgiving of sloppy batching — every extra wheelbarrow of water added for "workability" weakens the element you will never see again. Reinforcement offcuts of 1 m and below are near-unavoidable; plan the cutting schedule so offcuts from one bar serve the next stirrup instead of the scrap pile.

**The classic error:** treating decking concrete as "just a big floor" — a suspended slab carries its own formwork, propping, curing, and a different mix discipline, and underestimating any of them stalls the site at its most expensive moment.

## Phase 4 — Roofing

**What you measure:** the roof plan area, the pitch (which multiplies the true area — a pitched roof's sheet area exceeds its plan area by the pitch factor), the ridge, hip, and valley lengths for caps, and the rafter/king-post timber lengths from the section drawing.

**The conversions:** sheets = true roof area ÷ effective sheet width (the *covered* width after laps, not the bought width — always the effective figure), rounded up per roof face because a sheet runs full length per slope. Timber: rafters counted from spacing along the wall plate; purlins from sheet fixing spacings. Caps, ridges, and flashings by linear metre.

**The waste behaviour:** sheets cut at hips and valleys are scrap-plus-offcut; allow one to two sheets per complicated roof. Timber offcuts from rafter cuts serve as purlin infills when planned, firewood when not.

**The classic error:** estimating roofing from the building's floor area. The plan area × pitch factor is the roof's real surface, and a "we're one bundle short" at roof height is a two-day stall.

## Phase 5 — Finishing

**What you measure:** floor areas per finish type, wall areas net of openings (render outside, plaster and paint inside), ceiling areas, and the wet-room areas for waterproofing and tiles.

**The conversions:** render and screed by area × thickness at the mix ratio; paint by area ÷ coverage per litre × coats (the [paint calculator](/paint-calculator) runs it with practical spreading rates, not brochure rates); tiles by area ÷ tile size × the honest waste factor — straight runs want ~10%, diagonal and patterned layouts ~15% (the [tile calculator](/tile-calculator) applies them correctly); POP or suspended ceiling by area plus perimeter trim.

**The waste behaviour:** finishing is the highest-waste phase on the project — mixed-but-unused mortar, tile cuts, paint left in cut buckets — and the most theft-prone, because finishes are consumable and portable. Phase buying (below) is the control.

**The classic error:** estimating finishes from the blockwork wall areas — after chasing, rendering, and openings, the finisher's wall is a different number, and the estimator who skips this stage's fresh measurement orders the paint for a building that no longer exists on paper.


## A Worked Mini-Example — One External Wall Lift

The four moves on one real element: a 9 m external wall, 3 m high, 225 mm block, with one 900 × 2100 mm door.

**Measure:** gross area 27 m²; opening 1.89 m²; net 25.1 m².

**Convert:** at a 450 × 225 mm face, each block covers 0.101 m² → 25.1 ÷ 0.101 ≈ 249 blocks.

**Ratio:** the mortar for the joints at a typical 1:6 mix works out to roughly a bag and a half of cement for this lift (plus a small sand allowance) — computed from joint volume, not from "a bag per course" folklore.

**Waste:** 5% handling on the blocks → 12 blocks; mortar allowance for spill and cut-unit filling → round the cement to 2 bags.

The honest order for one wall lift: 261 blocks, 2 bags of cement, and a scheduled sand quantity — numbers a supplier can deliver against and a storekeeper can receive, instead of "send blocks for the back wall". Run every element of the drawing through those four moves and the phase totals assemble themselves; run them through the [smart calculator](/smart-calculator) and the ratios and waste allowances arrive consistently rather than by mood.

## Waste Allowances — the Honest Table

| Phase | Realistic allowance | What drives it |
|---|---|---|
| Foundation blocks & concrete | 5% blocks; excavation over-dig | Handling, hand-dug tolerance |
| Superstructure blocks | 5% | Breakage, cuts at openings |
| Lintel/decking concrete | 3–5% | Batching spill, formwork irregularity |
| Roofing sheets | 1–2 sheets + 5% timber | Hip/valley cuts, lap planning |
| Render/screed | 5–10% | Mixed-batch losses, thickness variation |
| Tiles | 10% straight, 15% diagonal/pattern | Cuts, breakage, batch matching |
| Paint | Calculated by coats, not padded | Ordering by coverage, not fear |

The pattern: waste is behaviour, not a flat percentage. A tight, supervised site runs at the bottom of each range; a loose site pays the top — and a "zero waste" estimate is a mid-project store run wearing a spreadsheet costume.

## Phase Buying — the Cash-Flow Sequencing

Quantities feed *when* to buy as much as *what* to buy. Each phase's materials arrive in its own week: blocks for the next lift, not the whole house at foundation stage (a block yard stacked for three months is breakage, damp-stain, and theft exposure — and capital doing nothing). The exceptions are the bulk-price items you have dry storage for: cement on pallets under cover is buyable ahead; cement on open ground is not buyable at any discount. The build-to-roof estimator prices the whole first-phase programme at once for exactly this planning purpose — the sequence decides the schedule, the quantities decide the order, and the two together decide the cash flow. (See [how to plan your build-to-roof project](/learn/how-to-plan-your-build-to-roof-project) for the phase-by-phase buying calendar.)

## Closing

Material estimating is four moves — measure, convert, ratio, waste — run once per phase with the phase's own numbers. Do it from the drawing for each phase fresh, add the honest allowance, and buy with the sequence. The calculators do the arithmetic: [smart calculator](/smart-calculator) for concrete and blocks, [structural calculator](/structural-calculator) for lintels and decks, [paint calculator](/paint-calculator) and [tile calculator](/tile-calculator) for finishes, and the [build-to-roof estimator](/build-to-roof-estimator) for the whole programme at once.
$body$, updated_at = now()
WHERE slug = 'how-to-estimate-materials-each-construction-phase' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
