-- Full body rewrite: cement-sand-ratio-screeding-explained (screeding-guides #3)
-- Replaces the phase49 template body (~95% duplicated across the category)
-- with a structure that delivers the article's title. Unique intro preserved.
-- Guarded on the template heading '## Understanding the Fundamentals'; re-run is a no-op.
UPDATE learn_articles SET content = $body$
## Introduction

Mix ratios are where screeding either gains its strength or quietly loses it. The difference between 1:3, 1:4 and 1:5 cement-to-sand is invisible in the bucket and obvious on the wall a year later — as cracking, dusting, or a surface so weak the sandpaper wins too easily.

This guide explains screed mix design from first principles: what the ratio actually controls, why richer is not automatically better, the ratios suited to base coats versus finishing coats, gauging by volume instead of guesswork on real sites, and the water discipline that separates strong mix from weak despite identical cement content.

## What the Ratio Actually Controls — the Chemistry in One Paragraph

A cement-sand screed is sand grains glued together by hydrated cement paste. The ratio controls **paste-to-sand**: enough paste to coat every grain and fill the voids between them, with a small surplus — but no more. Lean mixes (1:5, 1:6) leave grains under-coated and voids unfilled; the result dusts and wears. Rich mixes (1:2, 1:3) surround the sand with surplus paste — strong, but *shrink-happy*: neat cement paste shrinks as it hydrates, and surplus paste means surplus shrinkage, which arrives as map cracking across the surface exactly where the mix was richest. The professional target is the *minimum paste that fully coats and fills* — which is why, contrary to instinct, "more cement" past that point buys you cracks instead of strength.

## Why Richer Is Not Automatically Better — the Failure Modes

The intuition "add cement, get stronger" is half true and wholly expensive:

- **Surplus paste shrinks.** The cracks of an over-rich screed are not "the wall settling" — they are the paste's own chemical shrinkage concentrated at the surface, and they show as hairline mapping within weeks, especially in harmattan's drying air.
- **Rich surfaces cure-harden at different rates** through the thickness, adding differential-shrinkage stress the coat did not need.
- **The cost curve is deceptive.** Going 1:4 → 1:3 raises cement per square metre by a third — bought for strength that the paste was already providing, and paid for in crack risk instead.

Lean is equally honest about its failures: under-batched or over-extended mixes (1:5 stretched toward 1:6 by generous sand shovels) give surfaces that dust under a palm, cannot hold a burnish, and refuse paint adhesion at the thumb-test. The ratio's job is to sit in the honest middle — per coat, per job.

## The Ratios by Coat — a Working Table

| Ratio (cement:sand) | Best use | Why it fits |
|---|---|---|
| 1:3 | Finishing/steel-float coat; hard-wearing surfaces | Max surface hardness, tight burnish — thin coats where shrinkage is controlled by thickness |
| 1:4 | The standard base/levelling coat | Full coating with workable paste; the professional default |
| 1:5 | Large-area levelling on sound, fair walls; economy coats | Workable and lean; acceptable where surface wear is light and a finishing coat follows |
| 1:6 and leaner | Not recommended for screeding | Paste cannot coat and fill — dusting and weak surfaces |

Two matching rules complete the table. **Match ratio to thickness:** rich mixes belong in *thin* finishing coats (3–5 mm), where shrinkage has no depth to exploit; bulk levelling passes (12 mm+) are safest at 1:4–1:5. **Match ratio to sand:** the ratios assume clean, well-graded plaster sand — the finer and dirtier the sand, the more paste its grains demand, and a site stretching to 1:5 with silty sand is manufacturing dust regardless of the arithmetic.

## Gauging by Volume — the Head-Pan Discipline

Nigerian sites batch by head-pan, and the discipline is *counting*, not colour:

- **The unit is a level head-pan.** Heaped cement on one batch and heaped sand on the next is a different ratio every 20 minutes. Strike each pan level.
- **Count per batch, per mixer load.** A 1:4 batch is 1 pan cement : 4 pans sand — and if the mixer takes a half-size load, it takes a half-count, not an eyeball.
- **Colour is a symptom, not a gauge.** A consistent grey means consistent batching *only if* the sand is consistent; a change of sand supply changes the colour at an unchanged ratio and fools every eye trained on the previous heap.
- **Write the ratio where it is mixed.** Chalk it on the board; the labourer who arrives after lunch is not the one you briefed at breakfast.

For the quantities behind the counts — how many bags a wall at a given ratio consumes — [the quantities guide](/learn/how-to-calculate-screeding-material-quantities) walks the arithmetic; the [screed calculator](/screed-calculator) runs it with current parameters.

## The Water Discipline — the Strongest Ratio's Weakest Link

The ratio is cement:sand; the strength is decided by *water*. Cement hydrates with roughly a quarter of its weight in water — everything beyond the workable minimum is **voids**: added water evaporates and leaves air where paste should be. The same 1:4 mix, batched identically, is a strong coat in one crew's hands and a dusty failure in another's, purely on the water bottle.

The professional markers of correct water: the squeeze test (a handful holds as a damp, coherent block without slumping or crumbing dry), the float response (beds and closes under the float without tearing or "boiling"), and the wall's behaviour (fresh screed does not sag in its thickness band). **Retempering is the silent killer:** the bucket stiffening toward lunch gets "a little water" to bring it back — but the cement's hydration clock does not restart; the revived batch is a weak patch in the middle of the wall, and its dusting patch will find you within the season. Mix smaller batches within their working life and throw the stiff remnant away; the quarter-bag you bin is cheaper than the square metre you re-do.

## Reading a Weak Wall — Diagnosis by Ratio History

When a screeded surface fails, the mix history usually tells you which discipline broke:

- **Dusting under the thumb, sand grains rolling loose** → paste-starved: a lean ratio stretched leaner, or sand too silty/fine for the batch. The wall was under-batched.
- **Hairline map cracking on an otherwise hard surface** → paste surplus and rapid drying: an over-rich finishing pass, or correct 1:3 cured in direct sun with no misting. The wall was over-batched or under-cured.
- **Soft patches in the middle of an otherwise sound wall** → retempered batches or water-guessing between crews. The wall was inconsistently batched.
- **Blisters and hollow spots with the mix itself sound** → not a ratio failure at all: bond failure from skipped prep or uncontrolled suction (see [the bonding agents guide](/learn/best-bonding-agents-wall-screeding) and [the complete screeding workflow](/learn/complete-guide-wall-screeding-professional)).

The diagnosis matters because the fix differs: a dusted lean wall wants a hard 1:3 finishing coat over a keyed surface; a shrink-cracked rich wall wants the cracks filled and the *next* coat rationed, not enriched.


## The Mixing Order — Small Mechanics With Big Consequences

Even a correct ratio loses strength to *how* it is mixed:

- **Sand first, then cement, dry-blended to one even colour** — then water. Cement added to water makes balls that never disperse properly; the dry blend is what makes "1:4" mean 1:4 in every shovelful rather than rich here and lean there.
- **Water in stages, to the squeeze test** — the mix's target consistency arrives on the *second or third* addition, not the first splash. Crews that fill the mixer half with water are retempering from the first minute.
- **Machine-mixed, minimum time, full discharge** — mixers blend in minutes; hand-blending on the ground is a colour gamble on a windy day. And every mixer is emptied between batches: the half-load left in the drum becomes the first (foreign-ratio) portion of the next.
- **One sand source per job** where possible — a change of sand mid-wall changes water demand and colour together, and the joint line between the two supplies cures into a visible band on the painted wall.

None of this costs money; all of it costs *attention*, and a year later the wall displays the attention or the absence of it, one square metre at a time.

## Field QA — Three Tests That Keep the Ratio Honest

On a running job, three field tests catch a drifting mix before the wall wears the proof:

1. **The squeeze test, every batch** — a handful compressed once holds as a damp, coherent block. Crumbly = lean or dry; slumps = wet. Thirty seconds, and it replaces the mixer operator's guesswork with a standard.
2. **The burnish test, first wall of the day** — the finishing pass takes a tight steel-float polish. A 1:3 finish that will not burnish, or a 1:4 base that powders immediately under the float, is a ratio protest: recount the pans before the second batch.
3. **The chip test, after cure** — a discreet corner of the cured coat, picked with a trowel point, should resist; grains rolling out under a thumb without effort are the dusting signature of a stretched mix — and a warning for every wall the same crew batched that day.

Run the three tests and the site is calibrating itself: the ratio on the board stays the ratio in the wall, batch after batch, and the year-later wall looks like the arithmetic that made it.

## Closing

The ratio controls paste: enough to coat and fill, never a surplus to shrink and crack — 1:3 for thin, hard finishing; 1:4 as the professional base default; 1:5 only where the wall is fair, the coat is bulk, and a finish follows. Gauge by counted, level head-pans; treat water as the third number in the ratio; refuse the retemper; and cure what you have batched. The wall a year later is the arithmetic you did today, worn visibly — make it count: the level head-pan, the counted batch, the squeeze test, the refused retemper, and the misted cure are five habits that cost nothing and decide everything, on every wall from the first bedroom to the last estate fence-line. That is the whole secret of the "premium rate" walls: not richer mixes, but rationed ones, batched by people who know what the numbers are for.
$body$, updated_at = now()
WHERE slug = 'cement-sand-ratio-screeding-explained' AND status = 'published' AND content LIKE '%## Understanding the Fundamentals%';
