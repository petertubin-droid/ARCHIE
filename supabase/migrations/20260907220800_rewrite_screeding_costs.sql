-- Full body rewrite: how-to-estimate-screeding-costs-nigeria (screeding-guides #9)
-- Replaces the phase49 template body (~95% duplicated across the category)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

A screeding quote is really three estimates in one: materials, labour, and the preparation nobody prices until it becomes a variation claim. Comparing quotes without separating these three lines is how a "cheap" job finishes 60% over.

This guide builds a complete screeding cost estimate for Nigerian conditions: current cement and sand pricing per square metre, labour rates by engagement model (daily wage versus per-square-metre), preparation costs that quotes omit, and a comparison framework for evaluating contractor numbers against your own. The arithmetic is simple; the savings come from knowing what to ask.

## The Three Lines — Why Screeding Prices Are Three Different Numbers

**Materials** scale with area, thickness, and mix ([the quantities guide](/learn/how-to-calculate-screeding-material-quantities) computes them per wall). They are *knowable in advance* to within the waste factor, which makes material under-estimation a choice, not a misfortune.

**Labour** scales with area, condition, and the crew's model — and unlike materials, its rate varies by a factor of two across engagement models for the same wall.

**Preparation** scales with what the [assessment](/learn/complete-guide-wall-screeding-professional) finds — and it is the line quotes skip, because it is unknowable until the wall is read. Every unpriced prep hour returns as a "variation" at quote-plus rates.

A screeding estimate that cannot name all three separately is not an estimate; it is a mood. And the comparisons that go wrong go wrong there: the cheapest quote is usually the one that omitted the same preparation the expensive quote priced.

## Line 1 — Materials, Priced Per Square Metre

The material cost per m² follows one honest chain (run it yourself with [the screed calculator](/screed-calculator) or by hand): area × thickness → wet volume → ratio → bags and sand → **waste-adjusted, then priced at delivered rates**.

The worked shape per m², at a standard single coat of 8 mm at 1:4: wet volume ≈ 8 litres; dry-adjusted ≈ 10 litres; cement ≈ 0.06 bag/m² (order-rounded per job, not per metre); sand ≈ 0.008 m³/m² — roughly a full trip of sand per 120–150 m² of wall. At a 12 mm levelling coat, the numbers scale to roughly 0.09 bag/m² and proportionally more sand; a finishing pass at 1:3 on top adds its own, richer bag line.

Pricing honesty in Nigeria: price cement at the **delivered** rate (depot price + transport — the "cheap bag" at the far market is a transport bill wearing a discount), sand per trip shared honestly across the job, and add the line the arithmetic always forgets: **water for the cure** — the 5–7 day misting regime is a real, if small, water cost on sites without a tap. Bonding agent, where the assessment calls for one ([the bonding guide](/learn/best-bonding-agents-wall-screeding)), is a priced line, not a surprise — and on smooth-wall campaigns it is one of the larger ones.

The calibration number to hold: **materials are typically the smaller of the two big lines** — labour, at screeding's skilled rate, generally out-prices cement and sand on most Nigerian jobs. Any quote that is 80% materials has priced its labour somewhere else.

## Line 2 — Labour, by Engagement Model

Two models dominate, with different honest economics:

**Per-m² (piece rate):** the market standard for screeding, quoted per square metre of finished wall. Its honesty depends on the scope sentence: does the rate include preparation, staffs, and the cure, or only the trowel day? A per-m² rate *plus* a separate prep day is the truthful structure on walls that need work; the all-in per-m² rate on a wall nobody has read is a wager.

**Daily wage:** paid for attendance, not output — the honest model for unpredictable or repair-heavy work, and the dishonest one for repetitive large areas, where it quietly prices the same wall at double the per-m² market. The daily rate's second cost is the idle day: a crew waiting on materials or decisions is a wage line with no output line.

The professional structure most owners land on: **per-m² for the measurable body of the work, daily or itemized for the preparation, and a payment gate at acceptance** (the five checks in [the complete guide](/learn/complete-guide-wall-screeding-professional)) — money follows a torch-and-tap-tested wall, not a handover conversation.

## Line 3 — Preparation, the Line That Becomes a Variation

Prep is priced by *condition verdict*, not by area:

| What the assessment finds | Prep work it implies | Cost character |
|---|---|---|
| Clean, open blockwork | Wash + dampen | Small, predictable |
| Drummy patches | Cut back + re-render + its cure | Itemized, per patch — can exceed a day's labour |
| Smooth/sealed surfaces | Hack or bonding bridge ([the guide](/learn/best-bonding-agents-wall-screeding)) | Bonding materials + labour, priced per m² of treated face |
| Deviations >10 mm | Levelling passes + staffs campaign | Extra material volume + skilled labour, priced per wall |
| Damp/moist walls | Drying window, cause fixed first | Calendar cost; can idle the schedule |

The professional move is pricing preparation *after the assessment and before the quote is signed* — the two-hour reading of the walls converts the variation-claim ambush into a written line. Quotes that skip the assessment entirely are not cheaper; they are *unpriced*, and the difference arrives as a claim at the worst possible negotiating moment (mid-wall, crew on site).

## Building the Estimate — a Worked Room

A 3.6 m × 3.0 m bedroom, four walls, two openings, fair blockwork needing one 8 mm screed coat at 1:4:

- **Net area:** ~38 m² (measured per wall, openings deducted)
- **Materials:** ~2.3 bags → 3 delivered, sand ~0.3 trip shared, cure water, no bonding agent (open blockwork) — priced at today's delivered rates, the room's materials are a modest line, dominated by the cement and the trip share.
- **Labour:** 38 m² at the market's per-m² screeding rate — at typical Nigerian rates, this is the room's biggest single line, commonly 1.5–2× the materials.
- **Preparation:** assessment finds one drummy patch (0.4 m²) and standard suction — a half-day prep item for the patch plus washing/dampening; priced itemized rather than folded silently anywhere.
- **The total** is then three clean numbers the owner can check against any quote — and the acceptance gate holds the last tranche.

Scale the same structure to the flat: measure per room, sum per line, add the waste once at the end, price at delivered rates, and the estimate lands within the honest band (±15% is realistic; ±0% is not a feature of Nigerian estimating).

## Comparing Quotes — the Framework

With your own three lines built, quotes become comparable:

1. **Line-match, not total-match.** Does the quote name materials, labour, and prep separately? A total without lines cannot be compared, only hoped.
2. **Check the material line against your arithmetic** ([the quantities guide](/learn/how-to-calculate-screeding-material-quantities)). Over-listed materials = padding or a thicker coat than discussed; under-listed = the shortfall arrives mid-job.
3. **Interrogate the labour model:** per-m² including prep, or per-m² plus prep days? The daily-wage quote needs its idle-day risk priced — by you, since no one else will.
4. **Find the assessment.** A quote without a wall-reading has not priced the prep; treat the difference as a claim you will receive later.
5. **Fix the acceptance gate:** payment schedule tied to the five checks, retention through the first season for exterior work. The cheapest quote without a gate is the most expensive job in the building's ledger.

The 60%-over quote from the intro is always this story: a cheaper total that omitted prep, priced labour for half the walls, and held no gate — while the "expensive" quote had read the same walls and written the same three lines you now know how to build.


## The Calendar Cost — Time Is a Line Item

Two time costs recur in every screeding job and appear in almost no quote:

**The cure window.** The 3–7 day damp cure ([the curing guide](/learn/curing-drying-times-screeded-walls)) is days in which the wall is tended but not worked, and on a multi-room job it is also days the *next* room is not starting (crew economics) or is starting (room-by-room sequencing — the honest solution, and the reason rooms finish in waves rather than all at once). The cure is not optional labour-and-water time; skipping it converts to the redo budget.

**The paint wait.** The polythene-verified drying window after the cure is more calendar — and the painter who starts early is borrowing from the paint budget at compound interest. The estimate that schedules this honestly (room A cures while room B is coated, painter follows two rooms behind the screeder) costs nothing extra; the estimate that pretends all rooms finish together pays idle crew days on one side and trapped moisture on the other.

Priced or not, these windows are real — the difference between the quote that names them and the quote that ignores them is rarely the money; it is whether the schedule that comes with the job is a plan or a wish.

## Negotiation in Practice — the Ten Minutes That Save the Margin

With your three lines built, the site negotiation compresses into three questions the tradesman will recognise as professional:

**"What does the per-m² include?"** — prep, staffs, and cure included makes an all-in rate honest; excluded makes the *prep line* the negotiation, and it is cheaper negotiated before the wall is half-coated.

**"Which walls took the assessment?"** — the answer maps directly onto your prep line; a tradesman who has read the walls quotes with their names, not with a shrug.

**"What are the acceptance checks and the payment gates?"** — the five checks named in the quote ([the complete guide](/learn/complete-guide-wall-screeding-professional)) and the payment split behind them is the difference between a rate and a relationship: the screeder who agrees to a torch-and-tap gate before payment is a screeder whose work survives the gate.

The savings in this guide are not aggressive-negotiation savings; they are *information* savings — the quote that meets an owner holding three honest lines is a quote written carefully, and the careful quote is the cheap one in every currency.

## Closing

Screeding costs are three honest numbers — materials from the quantities chain at delivered rates, labour by engagement model with the idle days priced, preparation from a written assessment — summed once, gated at acceptance, and compared line-by-line against every quote that wants the job. Build your own three lines first; the comparison then takes ten minutes and saves the margin on every wall you ever commission.
$body$, updated_at = now()
WHERE slug = 'how-to-estimate-screeding-costs-nigeria' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
