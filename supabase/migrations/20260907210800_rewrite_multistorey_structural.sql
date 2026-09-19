-- Full body rewrite: structural-considerations-multi-story-buildings (construction-guides #9)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Going from a single-storey bungalow to a two- or three-storey building is not simply "more of everything." Loads that a 225mm wall carries comfortably at ground level start behaving very differently at the second and third floor, and mistakes that are cosmetic in a bungalow become structural — and dangerous — in a duplex or higher block.

This guide covers what changes as you build upward: soil bearing capacity, column and beam sizing, concrete mix grades, wall thickness choices, and the points where an engineer's sign-off stops being a formality and starts being essential.

## What Actually Changes With Height

The physics of going upward is one sentence: **the loads collect.** A ground-floor wall in a bungalow carries its own weight plus a roof; a ground-floor column in a three-storey block carries three floors, three sets of finishes and occupants, and a roof — all through the same footprint of concrete at the bottom that carried one floor's worth before. Everything in this guide is a consequence of that sentence:

- The **foundation** answers to the total, not the ground floor — the same soil must carry roughly three times the bungalow's load.
- The **vertical structure** (columns and load-bearing walls) works hardest at the bottom, which is why lower-ground columns are bigger and ground-floor walls are thicker.
- The **horizontal structure** (beams, decks) now carries upper walls whose weight lands mid-span — a partition above a beam is a load the beam must be told about.
- The **stability system** — what stops the building acting like a stack of cards in wind — becomes a designed element, not a free bonus of masonry's thickness.

## The Ground Floor — Soil, Foundation, and the Sentence You Cannot Appeal

Everything above is negotiated with the soil first. A bungalow forgives an optimistic assumption about bearing capacity; a three-storey block audits it permanently:

- **The soil test is not optional above one floor.** The bearing capacity decides the foundation type — and if the plot is clay, reclaimed fill, or near a water course, the foundation answer may be piles or a raft, decided by a geotechnical report, not by the mason's confidence. The test is the cheapest line in the entire multi-storey budget; the alternative is the most expensive conversation in Nigerian construction.
- **The foundation type follows the answer.** Strip footings may carry a bungalow anywhere; a duplex on good soil wants wide strip or pad-and-column foundations; poor soil or high water tables move the answer to raft or piles. This sequencing is why the engineer's drawing precedes the excavation (see [the build process guide](/learn/foundation-to-roof-understanding-build-process)).
- **Settlement is differential or nothing.** Buildings tolerate settling as a whole; they crack when one corner settles 30 mm and the other settles 5. The foundation design's real job is uniform behaviour under a non-uniform building.

## Columns and Beams — Where the Load Path Lives

In a multi-storey building, the frame (columns + beams + decks) is the skeleton, and the masonry is mostly curtain and partition:

- **Columns** are sized by the load they collect and the height they stand — and the bottom-floor columns of a three-storey block are materially bigger than its top-floor ones. They are also the one element where "it looks strong enough" is banned: size, reinforcement, and ties come from the engineer's schedule, and the site's job is to build the schedule, not vote on it.
- **Beams** carry decks, upper walls that land mid-span, stair openings' edges — and the pattern the bungalow never sees: the upper floor plan does not have to match the lower one, which means upper loads can arrive anywhere. This is why the two plans are designed *together*.
- **The connections are the structure.** Column-to-beam junctions and beam-to-column bearings are where earthquakes and storm-wind energy go first even in stable geographies; the lapping and anchorage details on the drawing are the building's insurance policy, invisible forever and decisive always.

## Concrete Grades — Mixes That Carry Floors

The concrete answer to height is grade: the 1:2:4 that comfortably foots a bungalow is the *floor* of acceptability for a multi-storey frame, and engineered designs routinely specify higher grades for columns and decks (with the design controlling water/cement ratio and often specifying cure regimes, not just ratios). What does not change is the batching discipline — height raises the *cost* of every shortcut (see [common construction mistakes](/learn/common-construction-mistakes-and-how-to-prevent)): a pan-guessed mix in a bungalow footing is a latent defect; the same guess in a second-floor column is a category error. On a multi-storey frame, batch by count, cure by calendar, and test as the engineer's supervision plan requires — cubes, slump, whatever is specified, because the schedule's honest answer to "how do we know the deck is strong enough?" is a record, not a shrug.

## Walls — Load-Bearing Blocks vs Partitions, and the Height Penalty

Two separate decisions, often confused:

- **Which walls carry.** In a framed multi-storey building, the frame carries; walls fill. In a load-bearing masonry design (common up to two storeys), the walls *are* the structure, and then their thickness, block quality, and mortar matter to the building's survival — a 225 mm wall carries two storeys on good blockwork; a 150 mm wall does not volunteer for it. The design says which walls are which; the site builds the answer; and the difference is discoverable in a collapse, so the drawing wins.
- **The height penalty on slenderness.** Taller walls between floors want the same thickness the bungalow used — and where storey heights grow (lobbies, double-volume spaces), walls and columns both need the slenderness check. Stability also comes from the *layout*: walls that interconnect in both directions stiffen the whole block; a plan of long corridors and isolated partitions is a stack of cards until the frame ties it.

## Stairs, Core Openings, and the Whack-a-Mole of Holes

Every hole in a structural element is a design decision: stair openings cut decks (their edges want trimmer beams; the deck beside the hole behaves differently), service chases chase columns (a chase in a column is a structural amputation, full stop), and lift or duct shafts concentrate all the penetrations in one place. The rule the drawings enforce: **holes are located before casting, never after** — the opening designed-in is engineered; the opening chiselled-in later is the structure guessing about itself.

## The Engineer Line — Where Sign-Off Becomes Non-Negotiable

The honest list, without drama: a bungalow can be built on experience and standard details in most cases. A duplex can, on good soil, with care. At **two floors and above — and at one floor the moment the soil report, the frame, or the span table looks unusual — the engineer stops being a formality.** The sign-off list for a multi-storey block: the geotechnical report read and answered, the structural drawings complete (foundation, frame, decks, stairs, details), the reinforcement schedule on site during casting, the supervision at the decisive moments (steel before the pour, pour technique, curing), and the records — cube tests, site book gate dates, photographs of steel before concrete closes it. That paper trail is not bureaucracy; it is the building's medical record, and it is also what an insurer, a lender, or a court will ask for.


## A Worked Comparison — The Same Plot, Twice

Take one 15 m × 30 m plot in a Lagos suburb, sandy-clay soil, and build it twice: once as a bungalow, once as a two-storey block on the same footprint. The structural ledger of the second building:

**The ground asks more.** The bungalow's strip footings settle happily on decent soil; the two-storey block's columns collect roughly double-to-triple the load through the same footprint — the soil report (which the bungalow never needed) now decides between wider pads, a raft, or piles. The report costs a few tens of thousands; the wrong foundation choice costs the building.

**The frame exists.** The bungalow's walls *were* the structure; the block's skeleton is now columns and beams — sized, drawn, reinforced per schedule. The masonry below becomes partitions, which is why upper-floor plans can differ from lower ones, and why the "same plot" now buys a design discipline the first building never met.

**The details bite.** The bungalow's door-header errors are cosmetic; the block's are structural. The bungalow's over-watered mortar is a latent defect; the block's is a second-floor column understrength by a fraction — invisible, permanent, and load-bearing. Same mistakes, multiplied by consequences.

**The records matter.** The bungalow needed a site book; the block needs a *file*: soil report, structural drawings, bar schedules, cube tests, gate photos. Not for ceremony — for the day a lender, a buyer, or an insurer asks the building to prove itself.

The honest summary of the comparison: building upward multiplies the load, the consequences, and the paperwork together — and the paperwork is the cheapest of the three.

## Closing

Building upward means loads collecting: soil tested before it is trusted, foundations designed to the total, frames drawn and built to schedules, mixes batched and cured to grades, holes designed before casting — and an engineer in the loop from the soil test to the last pour. For the quantities a frame this serious consumes, run the [structural calculator](/structural-calculator) on your spans and the [build-to-roof estimator](/build-to-roof-estimator) on the whole programme; and if the building you are planning is two floors or more, the first material on the schedule is the engineer's drawing. One calibration for the budget that follows: on a multi-storey block, the structural line items — soil test, design, steel, the extra concrete of frame and foundation — are not overhead on top of "a bigger bungalow"; they are the building. The finishes that follow will get the attention and the arguments, but the frame is where the building's fate was decided, and it was decided quietly, by whoever did or did not read the schedule at the column before the pour. Every rule in this guide reduces to that image: the drawing read at the moment it matters, the cube tested while it can still be tested, and the soil believed only after it has proved itself — because upward is the one direction in which a building cannot afford to learn from its mistakes.
$body$, updated_at = now()
WHERE slug = 'structural-considerations-multi-story-buildings' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
