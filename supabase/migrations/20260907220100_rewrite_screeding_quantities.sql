-- Full body rewrite: how-to-calculate-screeding-material-quantities (screeding-guides #2)
-- Replaces the phase49 template body (~95% duplicated across the category)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Screeding estimates fail in both directions: leftover bags of cement hardening in the corner of the site, or a half-screeded wall and a supplier closed for the weekend. The arithmetic takes ten minutes — wall area, coat thickness, mix ratio, and a waste factor that reflects real conditions rather than optimism.

This guide walks the calculation with worked examples for a typical room: how to measure area around doors and windows, choosing thickness per coat, converting to cement and sand quantities, and pricing the result against current market rates so you can sanity-check any contractor's material list in minutes.

## The Formula — Four Numbers, In Order

Every screeding quantity estimate is the same four-step chain, whatever the wall:

1. **Net area** (m²) = wall length × height, minus openings.
2. **Wet volume** (litres or m³) = net area × coat thickness. (A 10 mm coat over 1 m² is 10 litres of finished screed.)
3. **Mix volume** = wet volume ÷ (1 + waste-adjacent bulking — see Step 3; in practice we compute *dry* inputs directly from the wet volume and ratio).
4. **Materials** = mix volume split by the ratio into cement and sand, each with a waste allowance.

The only judgment calls are thickness (Step 2) and waste (Step 4) — everything else is multiplication. Do it in writing, per wall, and the ten minutes pays for itself the first weekend it saves.

## Step 1 — Measure the Net Area Honestly

Take one wall of a typical Nigerian bedroom: 4.2 m long × 3.0 m high, with a door 0.9 × 2.1 m and a window 1.2 × 1.2 m.

- **Gross area:** 4.2 × 3.0 = 12.6 m²
- **Openings:** door 0.9 × 2.1 = 1.89 m²; window 1.2 × 1.2 = 1.44 m² → 3.33 m²
- **Net screeded area:** 12.6 − 3.33 = **9.27 m²**

Two honesty notes that separate estimates from wishes. First, **measure; never scale from memory** — a metre guessed per wall compounds into a bag of cement per room. Second, **reveal edges count as area**: the wall returns into window and door reveals are small but they are screeded too, and four reveals per window quietly add half a square metre that pure flat-area arithmetic forgets. (On the other side of the truth, if the wall has deep deviations, the *levelling* screed is thicker locally — which is Step 2's business.)

For a whole room, repeat per wall — do not multiply one wall × 4; rooms have doors, corners, and differences, and the estimate is only as good as its weakest wall's measurement.

## Step 2 — Choose Thickness Per Coat (Where the Volume Really Comes From)

Thickness is the number the arithmetic is most sensitive to — double the thickness and you double the bill — so it must be *chosen*, not drifted into:

| Coat | Typical thickness | Job |
|---|---|---|
| Levelling/render base (on rough blockwork) | 10–15 mm | Bridges block ripple; fills to the staffs |
| Normal screed coat (fair wall) | 6–10 mm | The standard one-coat finish |
| Finishing/steel-float coat | 3–5 mm | Hard, tight, paint-ready skin |

For the worked example, assume a typical fair-but-rough blockwork wall taking **one levelling screed at 12 mm average**. The honest average is found by the straightedge: if the wall's hollows are up to 15 mm and its high spots nearly touch, an average of 12 mm will rule off true — an estimate built on "nominal 10 mm" runs short exactly where the wall is worst.

**Wet volume** = 9.27 m² × 0.012 m = 0.111 m³ ≈ **111 litres** of finished screed for this wall.

## Step 3 — Split by the Mix Ratio

A 1:4 cement-to-sand screed (the standard base-coat ratio; [the ratios guide](/learn/cement-sand-ratio-screeding-explained) covers choosing 1:3 to 1:5) splits the *dry* material inputs per volume of finished mix. In practice, with the voids in sand compacting as the mix is worked, a working site conversion is:

**Cement for the wall** — the site-ready method: a 50 kg bag of cement yields roughly **0.035 m³ (35 litres)** of mixed paste-and-fines contribution per bag at screed consistency. Wet volume 111 litres at 1:4 means the cement fraction is 1/5 of the compacted volume:

- Compacted total ≈ 111 litres ÷ 0.8 (bulking/compaction of sand) ≈ 139 litres dry-equivalent
- Cement fraction (1 part of 5) ≈ 28 litres ≈ **0.8 bags**
- Sand fraction (4 parts of 5) ≈ 111 litres ≈ **0.11 m³** — roughly 5–6 double head-pans or a bit over one medium-size trip shared across several walls

**So the one-wall answer at 1:4 and 12 mm: roughly 1 bag of cement (rounded from 0.8) and about 0.11 m³ of sand.** A 4-wall bedroom at similar openings: multiply the *net areas* (they differ per wall), and the room lands at roughly 3–3.5 bags and half a trip of sand for a single 12 mm levelling coat.

**If instead** the wall is fair and takes a single 8 mm coat at 1:4: wet volume 74 litres → about 0.55 bags → the same bedroom runs about 2–2.5 bags all-in. Thickness and wall condition move the bill by more than any discount you will ever negotiate on cement.

## Step 4 — The Waste Factor That Reflects Real Conditions

The waste allowance for screeding is behaviour, not padding:

- **5% on a straightforward, staff-guided job** — splash, cut losses at corners, batch residues.
- **10% where walls are uneven** (thicker local fills), **where access is awkward** (mixing far from the wall, multiple re-pours), or **where the crew is unfamiliar** with gauged batches.
- **Add the reveals and touch-up reserve** — the half-bag that finishes sills, corners, and the spots the straightedge finds on the final pass.

Apply waste to the *rounded-up* material numbers, not the raw decimals: this wall needs 0.8 bags → order **1 bag**; the room needs 3.2 → order 3.5–4 — and the same rule prices the water for the cure, the bonding agent the assessment called for, and the labour at your market's per-m² rate. Leftover cement is a loss, but a half-screeded wall on a Saturday is a bigger one — the estimate's job is to make the *first* delivery the only one.

## Step 5 — Price It Against Today's Market

Materials priced at current market rates: cement (per bag, at your local depot's *delivered* price), sand (per trip — a small job shares a trip; price the fraction), plus the consumables the arithmetic forgets: water for mixing *and* curing (the 3–7 day cure misting is a real water line), a bonding agent if Stage 0 called for one, and the labour line — screeding is priced per m² in most Nigerian markets, so the net area from Step 1 *is* the labour quote basis.

The sanity-check that makes you immune to padded lists: a contractor's material list for a screeding job should reconcile against Steps 1–4 within the waste factors above. A list double your arithmetic needs a question, not a signature — either the wall condition justifies it (ask which walls, and check with a straightedge) or the list is padding. Ten minutes of multiplication is the cheapest negotiating position on site — and it works both ways: it catches the padded list, and it catches your own forgotten water-curing line, which is the honest cost that padded lists and optimistic owners both leave out of the same conversation.

## The Estimator's Short Form — One Card, Any Wall

For the wall in your hand, run: **Area × thickness → litres; ÷ 0.8 → dry; × cement fraction of the ratio ÷ 35 → bags; round up + waste; sand = the sand fraction in m³.** For the whole-project version of this arithmetic — walls, floors, and the full finishing bill — the [screed calculator](/screed-calculator) runs it with current parameters, and [the screeding costs guide](/learn/how-to-estimate-screeding-costs-nigeria) extends the quantities into a complete priced estimate.


## The Estimating Traps — Where Honest Arithmetic Goes Wrong

The four-move chain is simple; the traps are behavioural:

**The thickness drift.** The plan said 10 mm; the wall's hollows said 15; the finished job averaged 12 — and the materials ran 20% past the estimate. The fix is in Step 2: thickness comes from the straightedge *before* the order, not from the average discovered mid-job.

**The opening amnesia.** Doors, windows, and *reveal edges* netted honestly in Step 1, then re-added mentally later "to be safe" — double-counting the same deduction in opposite directions. Net once, in writing, and let waste cover the rest.

**The sand-volume illusion.** Sand bulks: a head-pan count of loose sand is not the same volume compacted into a screed. The 0.8 compaction factor in Step 3 handles it arithmetically; eyeballing "looks like enough sand" handles it emotionally, and the second trip charge handles the shortfall.

**The multi-bag rounding.** Rounding 0.8 → 1 bag per wall is honest reserve; rounding every intermediate number up through the chain (area, thickness, ratio, bags) compounds into a 30% over-order whose leftover cement sets in the corner. Round once, at the end, at the material line.

The pattern is one discipline: **write the chain, round at the end, trust the waste factor you chose for your site's real behaviour.** The arithmetic is honest exactly as long as it is on paper.

## Closing

Screeding quantities are four honest numbers in a chain — net area from measurement, thickness from the wall's condition, ratio from the coat's job, waste from the site's behaviour — rounded up once, at the end, not at every step. Estimate per wall in writing, price with a delivered-price market check, and the arithmetic protects you in both directions: no hardening leftover bags, no half-screeded walls, and no contractor list that survives without explaining itself. And keep the worked card from this guide — area, thickness, ratio, waste — pinned with the site book: the next wall you estimate takes five minutes, and the fifth wall takes three, and that is the entire difference between a site that knows its numbers and a site that negotiates its feelings at the depot.
$body$, updated_at = now()
WHERE slug = 'how-to-calculate-screeding-material-quantities' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
