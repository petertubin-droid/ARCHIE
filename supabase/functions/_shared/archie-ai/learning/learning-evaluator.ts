// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — LEARNING EVALUATOR
// supabase/functions/_shared/archie-ai/learning/learning-evaluator.ts
//
// Computes empirical metrics across knowledge extraction,
// duplicate detection, contradiction identification, error
// recurrence, confidence calibration, and latency (spec §10).
// =========================================================

import type { EvaluationMetricReport } from "./types.ts";

export interface EvaluationRecordCase {
  candidateId: string;
  isAccepted: boolean;
  isHeld: boolean;
  isRejected: boolean;
  isExactDuplicate: boolean;
  isNearDuplicate: boolean;
  isContradiction: boolean;
  groundTruthIsDuplicate?: boolean;
  groundTruthIsContradiction?: boolean;
  reportedConfidence: number;
  verifiedOutcomeWasCorrect?: boolean;
  executionDurationMs: number;
  quarantinedAttack: boolean;
  recurrenceOfPriorError?: boolean;
}

export class LearningEvaluator {
  /**
   * Evaluates a collection of learning execution records against ground truth cases.
   */
  evaluate(
    cases: EvaluationRecordCase[],
    baseline?: Partial<EvaluationMetricReport>,
  ): EvaluationMetricReport {
    const totalCandidates = cases.length;
    if (totalCandidates === 0) {
      return {
        totalCandidates: 0,
        acceptedCount: 0,
        heldCount: 0,
        rejectedCount: 0,
        exactDuplicates: 0,
        nearDuplicates: 0,
        contradictionsDetected: 0,
        accuracy: 1.0,
        duplicatePrecision: 1.0,
        duplicateRecall: 1.0,
        contradictionQuality: 1.0,
        errorRecurrenceRate: 0.0,
        meanConfidenceCalibrationError: 0.0,
        avgLatencyMs: 0.0,
        quarantinedAttacks: 0,
      };
    }

    let acceptedCount = 0;
    let heldCount = 0;
    let rejectedCount = 0;
    let exactDuplicates = 0;
    let nearDuplicates = 0;
    let contradictionsDetected = 0;
    let quarantinedAttacks = 0;

    let duplicateTruePositives = 0;
    let duplicateFalsePositives = 0;
    let duplicateFalseNegatives = 0;

    let contradictionTruePositives = 0;
    let contradictionFalsePositives = 0;
    let contradictionFalseNegatives = 0;

    let calibrationErrorSum = 0;
    let calibrationSamples = 0;

    let totalDurationMs = 0;
    let errorRecurrenceCount = 0;

    for (const c of cases) {
      if (c.isAccepted) acceptedCount++;
      if (c.isHeld) heldCount++;
      if (c.isRejected) rejectedCount++;
      if (c.isExactDuplicate) exactDuplicates++;
      if (c.isNearDuplicate) nearDuplicates++;
      if (c.isContradiction) contradictionsDetected++;
      if (c.quarantinedAttack) quarantinedAttacks++;
      if (c.recurrenceOfPriorError) errorRecurrenceCount++;

      totalDurationMs += c.executionDurationMs;

      // Duplicate precision & recall
      const predictedDuplicate = c.isExactDuplicate || c.isNearDuplicate;
      if (c.groundTruthIsDuplicate !== undefined) {
        if (predictedDuplicate && c.groundTruthIsDuplicate) duplicateTruePositives++;
        else if (predictedDuplicate && !c.groundTruthIsDuplicate) duplicateFalsePositives++;
        else if (!predictedDuplicate && c.groundTruthIsDuplicate) duplicateFalseNegatives++;
      }

      // Contradiction precision & recall
      if (c.groundTruthIsContradiction !== undefined) {
        if (c.isContradiction && c.groundTruthIsContradiction) contradictionTruePositives++;
        else if (c.isContradiction && !c.groundTruthIsContradiction) contradictionFalsePositives++;
        else if (!c.isContradiction && c.groundTruthIsContradiction) contradictionFalseNegatives++;
      }

      // Confidence calibration (Brier-type calibration error)
      if (c.verifiedOutcomeWasCorrect !== undefined) {
        const actual = c.verifiedOutcomeWasCorrect ? 1.0 : 0.0;
        calibrationErrorSum += Math.abs(c.reportedConfidence - actual);
        calibrationSamples++;
      }
    }

    const dupDenominator = duplicateTruePositives + duplicateFalsePositives;
    const duplicatePrecision = dupDenominator > 0 ? duplicateTruePositives / dupDenominator : 1.0;
    const dupRecDenominator = duplicateTruePositives + duplicateFalseNegatives;
    const duplicateRecall = dupRecDenominator > 0 ? duplicateTruePositives / dupRecDenominator : 1.0;

    const contraDenominator = contradictionTruePositives + contradictionFalsePositives;
    const contradictionPrecision = contraDenominator > 0 ? contradictionTruePositives / contraDenominator : 1.0;
    const contraRecDenominator = contradictionTruePositives + contradictionFalseNegatives;
    const contradictionRecall = contraRecDenominator > 0 ? contradictionTruePositives / contraRecDenominator : 1.0;
    const contradictionQuality =
      contradictionPrecision + contradictionRecall > 0
        ? (2 * contradictionPrecision * contradictionRecall) / (contradictionPrecision + contradictionRecall)
        : 1.0;

    const meanConfidenceCalibrationError =
      calibrationSamples > 0 ? calibrationErrorSum / calibrationSamples : 0.0;
    const avgLatencyMs = totalDurationMs / totalCandidates;
    const errorRecurrenceRate = totalCandidates > 0 ? errorRecurrenceCount / totalCandidates : 0.0;
    const accuracy = totalCandidates > 0 ? (acceptedCount + quarantinedAttacks) / totalCandidates : 1.0;

    const baselineComparison: Array<{
      metric: string;
      baselineValue: number;
      currentValue: number;
      improvement: number;
    }> = [];

    if (baseline) {
      if (baseline.accuracy !== undefined) {
        baselineComparison.push({
          metric: "Accuracy",
          baselineValue: baseline.accuracy,
          currentValue: accuracy,
          improvement: accuracy - baseline.accuracy,
        });
      }
      if (baseline.duplicatePrecision !== undefined) {
        baselineComparison.push({
          metric: "Duplicate Precision",
          baselineValue: baseline.duplicatePrecision,
          currentValue: duplicatePrecision,
          improvement: duplicatePrecision - baseline.duplicatePrecision,
        });
      }
      if (baseline.contradictionQuality !== undefined) {
        baselineComparison.push({
          metric: "Contradiction Quality F1",
          baselineValue: baseline.contradictionQuality,
          currentValue: contradictionQuality,
          improvement: contradictionQuality - baseline.contradictionQuality,
        });
      }
      if (baseline.meanConfidenceCalibrationError !== undefined) {
        baselineComparison.push({
          metric: "Confidence Calibration Error (lower is better)",
          baselineValue: baseline.meanConfidenceCalibrationError,
          currentValue: meanConfidenceCalibrationError,
          improvement: baseline.meanConfidenceCalibrationError - meanConfidenceCalibrationError,
        });
      }
    }

    return {
      totalCandidates,
      acceptedCount,
      heldCount,
      rejectedCount,
      exactDuplicates,
      nearDuplicates,
      contradictionsDetected,
      accuracy,
      duplicatePrecision,
      duplicateRecall,
      contradictionQuality,
      errorRecurrenceRate,
      meanConfidenceCalibrationError,
      avgLatencyMs,
      quarantinedAttacks,
      ...(baselineComparison.length > 0 ? { baselineComparison } : {}),
    };
  }
}
