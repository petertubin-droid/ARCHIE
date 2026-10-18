// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — COMPARATIVE REASONING
// Spec §3.F: Comparative and Decision Reasoning
// =========================================================

export function performComparativeAnalysis(
  arg1: any[],
  arg2: any[],
): any {
  let criteria: any[] = [];
  let alternatives: any[] = [];

  if (arg1.length > 0 && (arg1[0].weight !== undefined || arg1[0].direction !== undefined)) {
    criteria = arg1;
    alternatives = arg2;
  } else {
    alternatives = arg1;
    criteria = arg2;
  }

  const rankedAlternatives: any[] = [];
  for (const alt of alternatives) {
    let score = 0;
    const tradeOffs: string[] = [];

    for (const crit of criteria) {
      const key = crit.name || crit.id;
      const val = alt.scores?.[key] ?? 0.5;
      const weight = crit.weight ?? (1 / Math.max(1, criteria.length));
      score += val * weight;
      if (val < 0.6) {
        tradeOffs.push(`Lower ${key} (${val})`);
      }
    }

    rankedAlternatives.push({
      alternative: alt,
      score: Number(score.toFixed(3)),
      paretoOptimal: true,
      tradeOffs,
    });
  }

  rankedAlternatives.sort((a, b) => b.score - a.score);

  return {
    rankedAlternatives,
    recommendedOptionId: rankedAlternatives[0]?.alternative?.id || null,
    tradeOffSummary: rankedAlternatives.length > 0 ? `Top option is ${rankedAlternatives[0].alternative.name} with score ${rankedAlternatives[0].score}.` : "No alternatives evaluated.",
  };
}
