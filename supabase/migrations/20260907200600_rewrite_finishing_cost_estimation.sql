-- Full body rewrite: cost-estimation-wall-finishing-projects (finishing-guides #7)
-- Replaces the phase52/53 template body (~95% duplicated across 55 articles)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Wall finishing quotes in Nigeria vary by a factor of three for the same job, and the cheapest quote rarely stays cheapest. Some contractors price without preparation, some skip primer, some quote per coat instead of per job — and the differences only surface after work begins.

This guide shows how to build a wall finishing estimate from first principles: measuring area correctly, pricing materials per square metre, accounting for labour models, and comparing quotes line by line so you can see what each one silently omits. Estimating this way takes twenty minutes and removes the guesswork from a notoriously variable trade.

## Step 1 — Measure the Area Honestly

The estimate is only as good as the measurement, and the standard error is measuring everything as if it were flat wall.

- **Gross wall area** = perimeter × height, room by room. Measure each wall separately — rooms are rarely square.
- **Subtract openings**: doors and windows. But only the glazing-and-frame area; reveals (the jambs and sills inside an opening) take material and are usually *added back* as metres of edge work, because they consume coating disproportionately.
- **Height matters more than people expect**: high ceilings add area faster than floor plans suggest, and anything above normal reach adds scaffolding time to labour, not just area to materials.
- **Do not forget ceilings** if they are in scope — the ceiling is often the largest single "wall" in the room, plus a different (often white) paint.

The honest number you need: net wall area per room, net ceiling area, total metres of internal and external corners and reveals, and the reach/scaffolding question for anything above about 2.4 m.

## Measuring Honestly — the Four Standard Errors

Most estimate drift starts at the tape, not the market. The four errors that recur:

**Treating openings as free.** Doors and windows subtract area, but their reveals (the jambs, heads, and sills) add edge metres that consume coating and time disproportionately — a metre of reveal work takes several times the minutes of a metre of flat wall. Count reveals separately, as metres of edge work.

**Ignoring height changes.** Above about 2.4 m, work slows: steps or staging appear, coats are applied overhead, and fatigue does to the afternoon what the morning did not. The area did not change; the labour per metre did.

**Averaging rooms.** The living room's 45 m² at skim route and the bedroom's 36 m² at putty route are different jobs with different unit economics. "Six rooms, average room" produces the most confidently wrong estimates in the trade.

**Forgetting the ceilings** — or assuming they match the walls in paint. Ceilings are often the largest surface in the room, typically take a different (white) product, and almost always take putty: overhead pinholes are the ones everyone lies down and stares at.

## Step 2 — Build the Materials Line from the System

Materials follow directly from the system the wall needs (see [types of wall finishes](/learn/types-of-wall-finishes-skim-coat-putty-paint) for choosing). Per square metre of wall, a full build-up consumes:

| Layer | Consumption driver | Planning figure |
|---|---|---|
| Skim (cement-based) | Thickness ~3 mm, two passes | Under 0.01 m³ of mix per m² — roughly a bag of cement serves a few tens of m² with plaster sand |
| Skim (gypsum, bagged) | ~1–1.5 kg per m² per mm of thickness | A 40 kg bag covers roughly 25–35 m² at skim thickness |
| Putty | Thin scrapes, 2 passes | A 20 kg tub covers a large room's pinholes — small money, never skip it |
| Primer | First coat on fresh skim | Roughly 10–12 m² per litre |
| Emulsion | Two coats | Roughly 10–14 m² per litre per coat — two coats over primer |

These are planning figures, not gospel — coverage varies with surface suction, application, and product. The point of building the estimate bottom-up is that you know exactly which numbers to adjust when a coverage rate surprises you. For an automated version that prices current quantities against your own measurements, use the [finishing estimator](/finish-estimator) and the [paint calculator](/paint-calculator).

**One budget rule:** buy primer for the full wall area, always. The line most often silently deleted from cheap quotes is the one whose absence cannot be seen on completion day — and shows up as peeling within a season.

## Step 3 — Cost Labour Correctly

Labour in Nigerian finishing is priced in three common models, and quotes are incomparable until you know which one you are looking at:

1. **Per square metre (rate per m²).** The cleanest model for large, well-defined jobs — but confirm what the rate *includes*: skim only? skim + sand + putty + prime + paint? Scaffolding?
2. **Per day (labourer-days).** Flexible for unpredictable work; dangerous for you unless someone competent controls the pace.
3. **Job-and-finish (total for the room/project).** Simple to compare, but only comparable if the scope in writing is identical.

What drives labour cost up honestly: wall condition (every mm of deviation adds skim time), height (scaffolding, slower work), detail density (reveals, corners, fittings), and sanding quantity. Two identical rooms can carry meaningfully different labour if one is sound plaster and the other is rippled.

## Step 4 — Put the Estimate Together

A complete wall finishing estimate has five lines, and each must appear in every quote you compare:

1. **Preparation** — cleaning, crack repair, hollow-patch re-plastering (the invisible stage; the classic omission)
2. **Levelling** — skim or alternative, plus sanding consumables
3. **Filling** — putty
4. **Sealing** — primer
5. **Decoration** — paint coats, plus edge/corner labour

Add contingency of roughly 10 to 15% for the stages that surprise: re-plastering reveals, and material coverage worse than planning figures. That percentage is not pessimism — it is the standard experience of finishing in old or hand-built stock.

## A Worked Estimate — Two-Bedroom Flat, Room by Room

The method earns its keep on real geometry. Take a modest two-bedroom flat with these rooms (dimensions in metres, wall areas net of openings, ceilings included):

| Room | Net walls m² | Ceiling m² | Assessment finding | Route |
|---|---|---|---|---|
| Living | 45.6 | 17.3 | 3–4 mm ripple | Skim + putty + prime + 2 coats |
| Bedroom 1 | 36.0 | 12.0 | Sound, ≤2 mm | Putty + prime + 2 coats |
| Bedroom 2 | 33.0 | 11.0 | One hollow patch, 300 mm | Patch re-plaster, then skim route |
| Kitchen | 28.0 | 10.0 | Grease near cooker | Degrease + wet-zone system |
| Bath | 22.0 | 6.0 | Sound, tiles to 1.8 m | Cement-based, remaining walls |
| Passage + store | 30.0 | 9.0 | Sound | Putty route |

**The measurement discipline that matters:** each line came from its own straightedge-and-torch assessment, not from "same as the living room". The living room's skim route costs roughly double the bedrooms' putty route per square metre — a difference that disappears entirely if the estimate is built by multiplying a single room rate by six rooms.

**Assembling the numbers (planning figures, verify current prices):** total skim-route area ≈ 106 m² (living, bedroom 2 after patch, passage if desired), putty-route area ≈ 82 m², wet-zone walls ≈ 50 m². Gypsum skim at ~1 kg/m²/mm over ~3 mm: about 320 kg plus repair margin — call it nine 40 kg bags. Putty: three 20 kg tubs. Primer at ~11 m²/L over ~180 m² of dry-zone wall plus ~65 m² ceiling: about 22 L. Topcoat at ~12 m²/L per coat over ~245 m², two coats: roughly 40 L plus ceiling white if separate. Add the degreaser for the kitchen, the wet-zone primer, and a 10–15% contingency line.

**The honest output:** an estimate whose lines each carry a reason — and a total that a builder can defend to a client, adjust when one wall surprises, and use to compare quotes like-for-like. Run the same flat through the [finishing estimator](/finish-estimator) and the labour and material lines price against current market figures rather than my planning approximations.

## Anatomy of a Wall Finishing Quote — Read the Five Lines

Every legitimate finishing quote reduces to five lines, and the cheapest quotes are cheap because specific lines are missing:

1. **Preparation** — cleaning, crack repair, hollow-patch re-plastering, degreasing. *Missing from cheap quotes because preparation is invisible on completion day.*
2. **Levelling** — skim or alternative, plus sanding labour and consumables. *Often re-labelled "smoothing" and done in one thick pass.*
3. **Filling** — putty. *The first line to be "included in the paint" (i.e., skipped).*
4. **Sealing** — primer. *The second line to be "included in the paint" (i.e., skipped).*
5. **Decoration** — paint coats, brand and grade named, plus edge labour.

When a quote arrives, write the five lines down the side of the paper and place each quote item into a line. Anything that cannot be placed — "finishing, all-in" — is a line the quote is not admitting to. The pattern is consistent across markets: preparation, putty, and primer are the invisible stages, so they are where "cheap" is manufactured. A quote is honest when the invisible stages are present and priced; it is not honest because it is short.

Two specific comparison traps:

- **"Per coat" pricing** hides the number of coats. Two quotes at N X per coat are not comparable if one assumes two coats and the other three. Always convert to per-job.
- **"Materials by client" arrangements** move the risk of under-quantity to you. If the labourer buys nothing, they estimate nothing — and the mid-job shortage is your errand and your dispute.

## Step 5 — Compare Quotes Line by Line

Put three quotes side by side against the five-line structure. Typical findings:

- **The cheapest quote** is usually preparation-free and primer-free. It is not cheaper; it is later. Repainting a failed room costs more than the difference.
- **Per-coat pricing** looks low per coat and multiplies silently — count the coats, not the coat price.
- **Quotes without measured areas** are opinions. A contractor who never measured your walls has estimated nothing.
- **The "same paint" question** — confirm brand and grade in writing; the same colour name exists at several price points.

Ask each bidder the same three questions: *What wall condition did you assume? What exactly does your rate include? What would you charge extra for, if you find X?* The answers reorganize the price list more honestly than the totals do.

## Closing

A wall finishing estimate you can trust is measured honestly, built from the system the walls actually need, priced across five visible lines, and compared quote-to-quote on those lines — not on totals. Twenty minutes of first-principles work eliminates the factor-of-three guesswork. Size and price your own project with the [finishing estimator](/finish-estimator); for the application sequence behind these costs, see the [complete guide to interior wall finishing](/learn/complete-guide-interior-wall-finishing).
$body$, updated_at = now()
WHERE slug = 'cost-estimation-wall-finishing-projects' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
