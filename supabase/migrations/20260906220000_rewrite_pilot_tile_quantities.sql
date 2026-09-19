-- Pilot: full body rewrite of 'how-to-calculate-tile-quantities-any-room'.
-- The phase52/53 template body shared ~95% of its lines with 54 other articles
-- (same sections with topic words swapped). This rewrite gives the article a
-- structure that delivers its title: measurement method, carton coverage,
-- waste factors by pattern, three worked examples, derived adhesive/grout
-- quantities, dry-count verification, ordering rules. Unique intro preserved.
-- Guarded: only runs while the template heading exists, so re-running is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Tile quantity arithmetic is simple — area divided by tile coverage — and yet ordering errors are constant, in both directions. The trap hides in the waste factor: it changes with tile size, pattern, room complexity, and the quality of the tile itself. A flat 10% does not fit every job.

This guide shows the complete calculation: measuring rooms correctly including irregular shapes, converting between tile sizes and coverage per carton, waste factors matched to pattern and layout, and the verification trick of dry-counting complex areas. One careful pass with this method ends the "one carton short on Sunday" experience for good.

## Start With Accurate Room Measurements

Every quantity error traces back to the tape. Measure twice, at floor level and at waist height — rooms are rarely perfectly square, and walls that bow by 3 cm across a 4-metre run quietly change the tile count. Record the larger of the two readings per wall, and measure internally: from finished wall face to finished wall face, not from the blockwork.

For a plain rectangular room, two measurements are enough. For anything more complex, sketch the floor on paper and break it into rectangles first — an L-shaped room becomes two rectangles, a room with a bay window becomes three. Label each rectangle on the sketch with its own length and width; you will add the areas together later.

Two rules protect the estimate at this stage. First, never round measurements down — 3.62 m stays 3.62 m, not 3.6 m, because under-measuring is the one error that always surfaces as a shortage. Second, write the measurements down immediately; the number in your head at the end of the day is always the optimistic one.

## Know What One Carton Actually Covers

Tiles are sold by the carton in Nigeria, not by the piece, and the carton is where the arithmetic starts. Every carton states two numbers on the label: the tile dimensions and the pieces per carton. Multiply them and you get the carton's actual coverage.

The common sizes you will encounter in the market, with their typical carton arrangements:

| Tile size | Area per tile | Pieces per carton (typical) | Coverage per carton |
|---|---|---|---|
| 300 × 300 mm | 0.09 m² | 13 | 1.17 m² |
| 400 × 400 mm | 0.16 m² | 8 | 1.28 m² |
| 300 × 600 mm | 0.18 m² | 8 | 1.44 m² |
| 600 × 600 mm | 0.36 m² | 4 | 1.44 m² |

Treat the "typical" columns as orientation only — manufacturers vary, and a brand change mid-project can change your math. Always read the label of the exact carton you are buying, and if you buy in two batches, check that the pieces-per-carton matches. The label also carries the shade and calibre codes you will need later.

## The Waste Factor: Where Estimates Go Wrong

No tiling job uses exactly its calculated area. Cuts at the perimeter break tiles, breakage happens on site, some tiles come out of the box with chipped corners, and a percentage of every room ends up as small unusable offcuts. The waste factor covers all of this — and it is the number most people guess wrong.

Match the allowance to the pattern, not to habit:

| Layout pattern | Waste allowance |
|---|---|
| Straight grid (stack bond) | 10% |
| Offset / running bond | 10–12% |
| Diagonal (45°) | 15% |
| Herringbone | 15–20% |

Three situations add waste beyond the table. Rooms smaller than 8 m² have proportionally more perimeter per square metre, so add 2–3 points. Large-format tiles (600 × 600 and above) break more on cutting — add another 2 points. And if the tiles are fragile ceramic rather than porcelain, site breakage is higher; ask your tiler to confirm from experience rather than assuming the table is exact.

One habit keeps the waste factor honest: it is calculated on the room area, applied before converting to cartons, and rounded up to whole cartons at the end. Rounding up mid-calculation double-counts.

## Worked Example 1: Rectangular Bedroom

A bedroom measures 3.6 m × 3.3 m. You have chosen 400 × 400 ceramic tiles, 8 pieces per carton.

**Step 1 — room area.** 3.6 × 3.3 = **11.88 m²**

**Step 2 — apply waste.** Straight grid layout, standard room: 10%.
11.88 × 1.10 = **13.07 m²** of tile needed.

**Step 3 — convert to tiles.** Each tile covers 0.16 m².
13.07 ÷ 0.16 = 81.7 tiles → round up to **82 tiles**.

**Step 4 — convert to cartons.** 82 ÷ 8 = 10.25 → round up to **11 cartons**.

**Sanity check.** 11 cartons × 1.28 m² = 14.08 m² against 13.07 m² needed — about 1 m² of spare, which is roughly one carton's worth of genuine contingency for a room this size. That spare is not waste; it is the tiles you will want in year three when the hot-water pipe leaks and one tile has to come up.

## Worked Example 2: L-Shaped Living Room

An open-plan living room forms an L: the main area is 4.8 m × 3.9 m, and the leg of the L is 2.1 m × 1.8 m. The chosen tile is 600 × 600 porcelain, 4 pieces per carton, laid straight.

**Step 1 — split and measure.** Main area: 4.8 × 3.9 = 18.72 m². Leg: 2.1 × 1.8 = 3.78 m². Total: **22.5 m²**.

**Step 2 — waste.** Large-format tile in a modest-sized room: 10% + 2 for the 600 × 600 format = 12%.
22.5 × 1.12 = **25.2 m²**.

**Step 3 — tiles.** 25.2 ÷ 0.36 = 70 → **70 tiles**.

**Step 4 — cartons.** 70 ÷ 4 = 17.5 → **18 cartons**.

Note where the extra 2% earned its keep: porcelain in 600 × 600 is the most break-happy combination on the market when cut by an angle grinder on site. The client who orders exactly 17 cartons on this job is statistically likely to be buying one more — at whatever price the market demands on the day the tiler runs out.

## Worked Example 3: Wall Tiles and Skirting

Floor area is only part of the order. Wall tiles in wet areas and skirting around the room follow the same method with one twist — you measure height runs, not floor area.

For bathroom walls, measure each wall's length and the intended tile height, then subtract openings. A wall 2.4 m long tiled to 2.1 m height is 5.04 m²; a door (0.9 × 2.0 = 1.8 m²) and a window (1.2 × 1.0 = 1.2 m²) on that wall reduce it to 2.04 m². Do this per wall, sum the results, then apply the waste factor — 15% for walls rather than 10%, because vertical cutting produces more offcuts than floor work.

Skirting is measured as a length, not an area. Run the tape around the room's perimeter, subtract door openings, and divide by the skirting tile's length (a 400 mm skirting tile covers 0.4 m of run per piece). Order skirting at a 5% waste allowance; cuts here are simple.

## Don't Forget Adhesive, Grout and Accessories

The tiles are the headline, but the tiler arrives with a list of everything else, and each of them is calculated from the same area figures you just produced.

**Adhesive.** Consumption depends on the notch size of the trowel, which follows the tile format. As a planning figure, a 20 kg bag of quality cement-based adhesive covers roughly 4–5 m² for a 400 × 400 tile with a 10 mm notch. For our bedroom example (13.07 m² after waste), that is 3 bags; for the living room (25.2 m²), 6 bags. Under-sized trowels and uneven substrates both push consumption up, so if the screed is rough, add a bag.

**Grout.** Grout demand depends on joint width and tile thickness. For joints of 3 mm on a 400 × 400 tile, a 5 kg bag covers roughly 40 m² of floor; wider joints on rustic tiles can cut that coverage by half. Joints deserve their own guide — for the full selection and application method, see [our grout selection and application guide](/learn/tile-grout-selection-and-application).

**Accessories.** Spacers (one bag per small room per format), trims for exposed edges, waterproof tape for wet-area joints, and a silicone tube per wet room. None of these individually costs much; all of them together are what the hardware run on day two is for.

For rooms with complex shapes — curves, columns, awkward columns of cut tiles around doorways — our [tile calculator](/tile-calculator) handles the geometry faster than paper, and cross-checking its output against this manual method is exactly how the two tools are meant to be used together.

## The Dry-Count Verification Trick

Before finalising any order for a complex room, do what professional tilers do: mark the starting point, set out the first rows with actual tiles on the dry floor, and count. Dry-laying the centre rows reveals everything the arithmetic hides — where the cuts land, whether the border tiles on opposite walls will match in width, and whether the pattern you imagined survives the room's actual dimensions.

The dry count also catches the classic layout error: starting from a wall that is not square, so the "straight" grid runs progressively out of alignment across the room. Two minutes with a chalk line and the 3-4-5 triangle method finds the true reference line, and the cut pattern at the perimeter evens out.

For the ordering decision itself, the dry count converts your calculated number into a counted one. If the two disagree by more than half a carton, find out why before buying — usually a measurement transcription error, occasionally a genuinely non-rectangular room.

## Ordering Rules That Save Regret

Four rules separate a smooth project from a stressful one:

1. **Buy the shade and calibre codes you inspected.** Tiles from different production batches differ slightly in colour and size. Match the codes on the label of every carton, and if the supplier cannot match them, walk away or accept the difference knowingly — across a floor, a half-tone shade shift reads as a visible band, not a charming variation.
2. **Buy your spare carton at the same time.** The batch-matching rule makes "we'll buy more later" a gamble with the whole room's appearance. One extra carton, stored flat and dry, is cheap insurance.
3. **Count on delivery day, in the supplier's presence.** Check cartons against the invoice, check each label against the others, and open two or three cartons to inspect for transit breakage before the truck leaves. Post-delivery claims for breakage are nearly impossible to win.
4. **Store correctly before use.** Cartons flat, off the ground, away from rain and direct sun. Tiles stacked on edge warp; cartons stored on damp floors wick moisture into the boxes.

## Quick Reference Checklist

- Measure internally, at two heights, recording the larger figure per wall
- Sketch complex rooms and split them into rectangles
- Read the carton label: tile dimensions and pieces per carton
- Carton coverage = pieces × area per tile — verify with the label's own figures
- Waste: 10% straight, 15% diagonal, 15–20% herringbone, +2–3 for small or large-format rooms
- Apply waste to room area, round up to whole cartons at the final step only
- Walls: measure height runs per wall, subtract openings, 15% waste
- Skirting: perimeter length ÷ tile length, 5% waste
- Adhesive: area ÷ 4–5 m² per 20 kg bag (format-dependent)
- Dry-count complex rooms before ordering
- Match shade and calibre codes; buy one spare carton; count on delivery day

## Conclusion

Tile quantity estimation rewards method over memory: measure the true dimensions, know what one carton of your specific tile covers, apply the waste factor that matches your pattern, and round up once at the end. The arithmetic takes ten minutes, and the two worked examples here — a bedroom and an L-shaped living room — can be adapted to any room by substituting your own measurements at each step.

The payoff is more than avoiding a Sunday shortage. Correct quantities mean one purchase at the right price instead of panic top-ups, one batch across the whole floor, and a spare carton in storage for the day you genuinely need it. Put the numbers through our [tile calculator](/tile-calculator) to cross-check your hand calculation, and keep the checklist above on your phone for the trip to the market.
$body$, updated_at = now()
WHERE slug = 'how-to-calculate-tile-quantities-any-room'
  AND status = 'published'
  AND content LIKE '%## Understanding the Fundamentals%';
