-- Full body rewrite: how-to-plan-your-build-to-roof-project (construction-guides #7)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

The difference between a build that reaches roofing in twelve months and one that crawls for three years is rarely money alone — it is planning. Clients who map their cash flow to construction stages finish; clients who buy materials as money appears tend to stall at lintel level and never quite restart smoothly.

This guide shows how to plan a build-to-roof project end to end: defining scope, sequencing purchases against stages, choosing contractor engagement models, scheduling around the rainy season, and keeping a contingency that absorbs shocks without derailing the whole plan.

## Step 1 — Define the Scope in One Written Sentence

"Build to roof" is Nigerian shorthand, but your project needs its own definition in writing, because every later decision (money, contracts, inspections) hangs off it. The standard scope: **foundation, blockwork, lintels, decking where designed, roof sheeting complete, and services first-fixed — the closed, weather-tight box.** Explicitly excluded: rendering, screeding, all finishes, and usually external works (fencing, driveway, soakaway depending on the plot plan).

Write the exclusations down as deliberately as the inclusions — the "but I thought the quote included plaster" dispute is a scope sentence that was never written. The build-to-roof line is where the sequence's economics naturally pause: structure is permanent and patient; finishes are consumable and exposed. (The [foundation-to-roof guide](/learn/foundation-to-roof-understanding-build-process) explains what each stage of this scope contains and inspects.)

## Step 2 — Map the Money to the Phases

The programme's costs arrive as peaks, not a slope: **foundation** (excavation, concrete, blocks to DPC) is the first real spike; **decking** (formwork, steel, a continuous pour, and its curing) is the biggest; **roofing** (timber, sheets, flashings) is the last major spike; between the peaks the spend flattens to labour-and-cement lines. Planning is mapping your income to those peaks *in advance*, so no peak meets an empty account.

The practical tool is a phase-funding table: each phase's estimated cost (run the [build-to-roof estimator](/build-to-roof-estimator) on your drawing for real numbers), the month it falls due under your chosen start season, and the funding source against it — savings tranche, contributions, loan drawdown. A phase funded by "we'll see" is a phase that introduces itself again later.

Two funding rules that separate finishers from stallers: **fund each phase fully before it starts** — a phase begun on partial money is borrowed trouble, because half-completed concrete is worse than unstarted concrete — and **never fund a peak by borrowing from a later phase's materials**; the sequence collects that loan with interest at the worst possible moment.

## Step 3 — Sequence Purchases Against Stages

With money mapped, the purchasing calendar follows the sequence (the full method is in [the materials estimation guide](/learn/how-to-estimate-materials-each-construction-phase)). The build-to-roof-specific version:

- **Before excavation:** setting-out materials, the soil test, the engineer's drawing. The cheapest phase; the one that decides all the others.
- **Foundation phase:** blinding, reinforcement, foundation concrete, DPC membrane — and the block order placed so the blocks *cure in the yard* during the foundation work.
- **Superstructure:** blocks delivered per lift, lintel materials before the openings close, first-fix conduits and pipes before the walls outgrow them.
- **Decking:** the big, coordinated order — formwork, props, steel, and enough cement for one continuous pour per section, timed so nothing arrives before the formwork can receive it.
- **Roofing:** timber, sheets (one batch, one colour, per roof face), fixings and flashings — ordered at blockwork's end so the deck's curing week is the timber's delivery week.

The discipline in one sentence: **materials on the ground before each phase's crew, never three phases before.** Storage is cost; delivery timing is savings.

## Step 4 — Choose the Contractor Engagement Model

Three honest models for a build-to-roof programme, each matching a different kind of owner:

- **Owner-managed with hired gangs** (per-day or piece-rate): maximum control, minimum overhead — and the owner is the project manager, like it or not. Works when the owner can be on site, hold the phase gates (the six checks in the mistakes guide), and make decisions weekly.
- **Main contractor, job-and-finish to roof:** the schedule risk transfers to the contractor, in exchange for a premium and the crucial caveat that "finish to roof" must be defined to the last item — decking included or not, first-fix included or not — in writing, priced against a written scope.
- **Managed hybrid:** a site engineer or clerk-of-works supervising gangs on the owner's behalf. The professional version of owner-management; the supervision line is the cheapest quality insurance in the programme.

Whichever model, keep the **stage-gate payment structure**: mobilization covers materials only, then payments follow the gates — foundation passed, DPC inspected, deck cured and struck, roof hosed and dry. Money that follows gates never has to be chased; money paid ahead of gates schedules its own supervision.

## Step 5 — Schedule Around the Season

The rainy season (roughly April–October) is not a stop sign; it is a constraint set. The planning moves:

- **Start structure in the dry months if the option exists** — November–March turns the whole calendar in your favour, per the [construction timeline guide](/learn/construction-timeline-how-long-each-phase-takes).
- **If starting in the rains**, front-load the indoor-independent work: keep concrete pours forecast-dependent and let the schedule carry a weather buffer (more slack per phase, not fewer phases).
- **Place the roof before the peak rains, whatever else slips.** A closed roof converts the rainy season from a threat into a work environment for everything after it; a roofless build in October is a swimming pool with walls.
- **Plan the deck pour for a forecast window** and hold the pour a day early rather than a day late — a storm on a young slab is not a delay, it is a repair.

## Step 6 — Contingency and the Absorption Capacity

A build-to-roof plan without contingency is not a plan; it is a forecast with confidence issues. The honest structure: **10–15% of the structural programme**, held as a separate line, released only by named events — over-dig at foundation, steel price movement before the decking order, a storm event, a gate that fails and re-opens a phase. Contingency is not "extra tiles money"; it is the programme's shock absorber, and spending it on scope upgrades (the parapet you "always wanted") converts the absorber into a spring.

The absorption rule: when a shock consumes contingency, the *schedule* absorbs the remainder — the plan flexes dates before it flexes stages. Never the reverse: a schedule that compresses stages (curing, gates) to protect dates is building the failure into the walls (see [common construction mistakes](/learn/common-construction-mistakes-and-how-to-prevent)).

## The Plan on One Page

The finished plan fits on one page, and its existence is the difference the intro promised: scope sentence, phase-funding table, purchasing calendar, engagement model with gate payments, start season with weather buffers, contingency with named release events, and the six inspection gates with dates to be filled as they pass. Clients who carry this page finish at roofing in planned time; clients who carry only enthusiasm carry it to lintel level, where it stalls — not from lack of money, but from lack of mapping.


## The Owner's Weekly Hour — the Plan's Enforcement Rhythm

A plan on paper enforces nothing; a plan attached to a weekly hour enforces everything. The owner's minimum viable involvement in a build-to-roof programme is one hour a week, structured: walk the site against the phase (is the work where the calendar says it is?), check the gate (did this week's inspection pass and get dated in the site book?), verify the delivery (did the week's materials arrive and reconcile with the store?), and make the next decision early (whatever the *next* phase needs from you — schedule confirmation, payment, approval — decide it this week, not on the day it blocks a crew).

That hour is the difference between the two clients in the intro: the one whose money "appears" buys materials against stalls, and the stall is discovered in the middle of a phase; the one who runs the weekly hour discovers the *next* phase's gap while the current phase is still moving. Cash flow shocks and material shortages both obey the same law — they are cheap seven days out and expensive today.

## Three Shocks, Three Responses — How the Plan Flexes

The contingency rule (Step 6) becomes concrete with the three shocks that actually arrive on Nigerian build-to-roof programmes, and the *correct* response for each — because the wrong response to a shock is how a plan becomes a stall:

| Shock | The flexible response | The stall response (avoid) |
|---|---|---|
| A material price jump (cement, steel) | Re-sequence: pull forward phases whose materials are stable; use the contingency line for the affected order only | Stop buying entirely "until prices calm down" — the crew ages on site and every phase behind it slips |
| A cash-flow gap between tranches | Downshift to a lower-burn phase (blockwork continues; the decking order waits for its funding) with a dated restart | Start the decking on partial money — a half-funded pour is the single most expensive mistake in the programme |
| A failed gate (rework found) | Fix immediately, re-dated in the site book, schedule absorbs it via the buffer | Build past it — the defect compounds under everything after, and the schedule is lying from that day forward |

## Closing

Plan the build to roof as a programme, not a series of purchases: scope in one sentence, money mapped to phase peaks, materials sequenced behind the stages, engagement model chosen with gate payments, season scheduled around, contingency held for named shocks — and the site book recording every gate. Start the numbers with the [build-to-roof estimator](/build-to-roof-estimator), and for the finishing programme that follows the roof, the [finish estimator](/finish-estimator) picks up exactly where this plan hands over. One final calibration: when someone shows you a build that "just went smoothly", ask to see their one-page plan — finishers always have one, and the page is usually creased from folding, dated in the corners, and updated in pen. The plan is not the paperwork of the project; it is the project, written down a season early.
$body$, updated_at = now()
WHERE slug = 'how-to-plan-your-build-to-roof-project' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
