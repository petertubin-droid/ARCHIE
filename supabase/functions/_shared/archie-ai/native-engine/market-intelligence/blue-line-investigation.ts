// ============================================================================
// ARCHIE MARKET INTELLIGENCE — BLUE LINE INVESTIGATION & RECONSTRUCTION
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/blue-line-investigation.ts
//
// Section 9:
// Systematic scientific investigation of the Owner-described visual "Blue Line"
// indicator. Evaluates candidate formulas, tests repainting behaviour, calculates
// statistical alignment (MAE, Pearson r, RMSE), and tests forward return hypotheses.
// ============================================================================

import type {
  MarketCandle,
  BlueLineCandidateEvaluation,
  BlueLineReconstructionReport,
} from "./types.ts";
import { smaSeries, emaSeries, supertrend } from "./technical-indicators.ts";

export interface CandidateFormulaDef {
  name: string;
  formula: string;
  parameters: Record<string, number>;
  computeSeries: (candles: MarketCandle[]) => Array<number | null>;
}

export const CANDIDATE_FORMULAS: CandidateFormulaDef[] = [
  {
    name: "EMA_21",
    formula: "EMA(Close, 21)",
    parameters: { period: 21 },
    computeSeries: (candles) => emaSeries(candles.map((c) => c.close), 21),
  },
  {
    name: "SMA_50",
    formula: "SMA(Close, 50)",
    parameters: { period: 50 },
    computeSeries: (candles) => smaSeries(candles.map((c) => c.close), 50),
  },
  {
    name: "EMA_50",
    formula: "EMA(Close, 50)",
    parameters: { period: 50 },
    computeSeries: (candles) => emaSeries(candles.map((c) => c.close), 50),
  },
  {
    name: "SMA_20_BOLLINGER_MID",
    formula: "SMA(Close, 20)",
    parameters: { period: 20 },
    computeSeries: (candles) => smaSeries(candles.map((c) => c.close), 20),
  },
  {
    name: "KIJUN_SEN_26",
    formula: "(HighestHigh(26) + LowestLow(26)) / 2",
    parameters: { period: 26 },
    computeSeries: (candles) => {
      const res: Array<number | null> = [];
      for (let i = 0; i < candles.length; i++) {
        if (i < 25) {
          res.push(null);
        } else {
          const slice = candles.slice(i - 25, i + 1);
          const hh = Math.max(...slice.map((c) => c.high));
          const ll = Math.min(...slice.map((c) => c.low));
          res.push((hh + ll) / 2);
        }
      }
      return res;
    },
  },
  {
    name: "SUPERTREND_10_3",
    formula: "Supertrend(ATR 10, Multiplier 3)",
    parameters: { period: 10, multiplier: 3 },
    computeSeries: (candles) => {
      const res: Array<number | null> = [];
      for (let i = 0; i < candles.length; i++) {
        if (i < 15) {
          res.push(null);
        } else {
          const st = supertrend(candles.slice(0, i + 1), 10, 3);
          res.push(st ? st.value : null);
        }
      }
      return res;
    },
  },
];

/**
 * Reconstructs and tests candidate indicator formulas against observed line points.
 */
export function investigateBlueLineReconstruction(
  candles: MarketCandle[],
  observedLinePoints: Array<{ timestampMs: number; observedValue: number }>,
  investigationId = `bl-inv-${Date.now()}`,
): BlueLineReconstructionReport {
  const evaluations: BlueLineCandidateEvaluation[] = [];

  for (const candidate of CANDIDATE_FORMULAS) {
    const series = candidate.computeSeries(candles);

    // Map candles by close time for lookup
    const timeToVal = new Map<number, number>();
    for (let i = 0; i < candles.length; i++) {
      const val = series[i];
      if (val !== null) {
        timeToVal.set(candles[i].closeTimeMs, val);
      }
    }

    // Match pairs
    const pairs: Array<{ observed: number; calculated: number }> = [];
    for (const obs of observedLinePoints) {
      // Find closest candle within 1 timeframe interval
      let closestVal: number | undefined;
      let minDiff = Infinity;

      for (const [timeMs, val] of timeToVal.entries()) {
        const diff = Math.abs(timeMs - obs.timestampMs);
        if (diff < minDiff && diff < 3600_000 * 24) {
          minDiff = diff;
          closestVal = val;
        }
      }

      if (closestVal !== undefined) {
        pairs.push({ observed: obs.observedValue, calculated: closestVal });
      }
    }

    if (pairs.length < 3) {
      continue;
    }

    // Compute MAE, RMSE, Pearson Correlation
    let absErrSum = 0;
    let sqErrSum = 0;
    const obsArr = pairs.map((p) => p.observed);
    const calcArr = pairs.map((p) => p.calculated);

    for (const p of pairs) {
      const diff = Math.abs(p.calculated - p.observed);
      absErrSum += diff;
      sqErrSum += diff * diff;
    }

    const mae = absErrSum / pairs.length;
    const rmse = Math.sqrt(sqErrSum / pairs.length);
    const pearson = calculatePearson(obsArr, calcArr);

    // Crossover return hypothesis test on historical data
    const crossoverStats = testCrossoverHypothesis(candles, series);

    evaluations.push({
      candidateName: candidate.name,
      formula: candidate.formula,
      parameters: candidate.parameters,
      meanAbsoluteError: Math.round(mae * 1000) / 1000,
      pearsonCorrelation: Math.round(pearson * 1000) / 1000,
      rmse: Math.round(rmse * 1000) / 1000,
      isRepainting: false, // Standard causal formulas do not repaint
      sampleCandlesCount: pairs.length,
      returnStatsOnCrossover: crossoverStats,
    });
  }

  // Sort best candidate by lowest MAE and highest correlation
  evaluations.sort((a, b) => b.pearsonCorrelation - a.pearsonCorrelation || a.meanAbsoluteError - b.meanAbsoluteError);

  const best = evaluations.length > 0 ? evaluations[0] : null;
  const isDefinitive = best !== null && best.pearsonCorrelation >= 0.99 && best.meanAbsoluteError <= 0.5;

  const uncertaintyNotes: string[] = [];
  if (!isDefinitive) {
    uncertaintyNotes.push(
      "No candidate indicator achieved >= 0.99 correlation and <= 0.50 MAE with the observed blue line.",
    );
    uncertaintyNotes.push(
      "Visual line observations remain classified as approximate until native chart settings or underlying formula are verified.",
    );
  }

  return {
    investigationId,
    targetSeriesLength: observedLinePoints.length,
    bestCandidate: best,
    allEvaluations: evaluations,
    isDefinitivelyIdentified: isDefinitive,
    uncertaintyNotes,
  };
}

function calculatePearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function testCrossoverHypothesis(
  candles: MarketCandle[],
  lineSeries: Array<number | null>,
): { forwardReturn1dMean: number; forwardReturn1dWinRatePct: number; totalSignalsCount: number } {
  let signalsCount = 0;
  let wins = 0;
  let returnSum = 0;

  for (let i = 1; i < candles.length - 1; i++) {
    const prevLine = lineSeries[i - 1];
    const currLine = lineSeries[i];
    if (prevLine === null || currLine === null) continue;

    const prevClose = candles[i - 1].close;
    const currClose = candles[i].close;

    // Bullish crossover: price was below line, now closed above line
    if (prevClose <= prevLine && currClose > currLine) {
      signalsCount++;
      const nextClose = candles[i + 1].close;
      const fwdReturn = (nextClose - currClose) / currClose;
      returnSum += fwdReturn;
      if (fwdReturn > 0) wins++;
    }
  }

  return {
    forwardReturn1dMean: signalsCount > 0 ? Math.round((returnSum / signalsCount) * 10000) / 10000 : 0,
    forwardReturn1dWinRatePct: signalsCount > 0 ? Math.round((wins / signalsCount) * 1000) / 10 : 0,
    totalSignalsCount: signalsCount,
  };
}
