// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — ERROR LEARNER
// supabase/functions/_shared/archie-ai/learning/error-learner.ts
//
// Identifies root causes of errors, evaluates corrections,
// detects affected downstream dependencies, preserves
// correction history, and generates preventative rules (spec §4.5).
// =========================================================

import type { ErrorCorrectionRecord, ErrorRootCause, ExtractedKnowledgeItem } from "./types.ts";

export interface ErrorAnalysisInput {
  taskDescription: string;
  originalClaimId: string;
  errorMessage?: string;
  userCorrectionText?: string;
  evidence?: string[];
  dependentItems?: ExtractedKnowledgeItem[];
}

export class ErrorCorrectionLearner {
  private corrections: ErrorCorrectionRecord[] = [];

  list(): ErrorCorrectionRecord[] {
    return [...this.corrections];
  }

  get(id: string): ErrorCorrectionRecord | undefined {
    return this.corrections.find((c) => c.id === id);
  }

  /**
   * Classifies root cause using deterministic taxonomy signatures.
   */
  classifyCause(task: string, error?: string): { rootCause: ErrorRootCause; analysis: string; preventativeAction: string } {
    const combined = `${task} ${error ?? ""}`.toLowerCase();

    if (/off by \d+%|deviat|underestimat|overestimat|inaccurate estimate/i.test(combined)) {
      return {
        rootCause: "CALIBRATION",
        analysis: "Observed outcome deviated quantitatively from predicted or estimated values.",
        preventativeAction: "Recalibrate estimation parameters with observed empirical variance.",
      };
    }

    if (/timeout|too slow|latency exceeded|took too long|budget exhausted/i.test(combined)) {
      return {
        rootCause: "PERFORMANCE",
        analysis: "Execution exceeded allocated computational or temporal budget.",
        preventativeAction: "Reduce batch size, pre-filter candidates, or enforce earlier termination checkpoints.",
      };
    }

    if (/typo|malform|garble|invalid json|unparseable|syntax error/i.test(combined)) {
      return {
        rootCause: "INPUT_INTEGRITY",
        analysis: "Malformed or unvalidated input arrived at the processing engine.",
        preventativeAction: "Enforce schema validation and input normalization prior to extraction.",
      };
    }

    if (/unauthorized|forbidden|permission denied|boundary violation|owner approval/i.test(combined)) {
      return {
        rootCause: "BOUNDARY_VIOLATION",
        analysis: "Attempted action exceeded authorized operating scope or Owner approval limits.",
        preventativeAction: "Enforce Owner Authority gate prior to execution dispatch.",
      };
    }

    if (/outdated|stale|expired|price changed|deprecated/i.test(combined)) {
      return {
        rootCause: "STALE_KNOWLEDGE",
        analysis: "Knowledge item has expired or environmental facts have changed since recording.",
        preventativeAction: "Re-verify and refresh from authoritative sources with updated timestamp.",
      };
    }

    if (/conflict|contradict|incompatible facts|mutually exclusive/i.test(combined)) {
      return {
        rootCause: "CONTRADICTORY_EVIDENCE",
        analysis: "Mutually exclusive claims exist across knowledge records.",
        preventativeAction: "Flag records for human or independent evidence arbitration.",
      };
    }

    if (/crash|exception|null pointer|failed to fetch/i.test(combined)) {
      return {
        rootCause: "EXECUTION_FAILURE",
        analysis: "Runtime exception occurred during operation execution.",
        preventativeAction: "Wrap in try-catch with graceful fallback to honest unknown.",
      };
    }

    return {
      rootCause: "UNKNOWN_NEEDS_OWNER_DIAGNOSIS",
      analysis: "Failure signature did not match known deterministic taxonomy; requires Owner review.",
      preventativeAction: "Isolate failure trace and park affected knowledge as uncertain.",
    };
  }

  /**
   * Processes a correction, maps affected dependencies, and records an auditable lesson.
   */
  processCorrection(input: ErrorAnalysisInput): {
    record: ErrorCorrectionRecord;
    affectedDependenciesCount: number;
    updatedDependentItems: ExtractedKnowledgeItem[];
  } {
    const { rootCause, analysis, preventativeAction } = this.classifyCause(
      input.taskDescription,
      input.errorMessage,
    );

    // Identify and update dependent knowledge records
    const affectedDependentIds: string[] = [];
    const updatedDependentItems: ExtractedKnowledgeItem[] = [];

    for (const dep of input.dependentItems ?? []) {
      if (
        dep.id === input.originalClaimId ||
        (dep.dependencies ?? []).includes(input.originalClaimId)
      ) {
        affectedDependentIds.push(dep.id);
        // Mark dependent knowledge as uncertain to prevent error propagation (spec §4.5 & §15)
        const updated: ExtractedKnowledgeItem = {
          ...dep,
          evidenceState: "UNCERTAIN",
          confidence: Math.min(dep.confidence, 0.35),
          provenance: {
            ...dep.provenance,
            lastCorrectionFlag: `Affected by correction on ${input.originalClaimId}`,
          },
        };
        updatedDependentItems.push(updated);
      }
    }

    const record: ErrorCorrectionRecord = {
      id: `err_corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalClaimOrProcedureId: input.originalClaimId,
      rootCause,
      causeAnalysis: analysis,
      correction: input.userCorrectionText ?? "Flagged for re-evaluation against verified ground truth",
      evidence: input.evidence ?? [],
      affectedDependentIds,
      preventativeAction,
      recurrenceTested: false,
      correctedAt: new Date().toISOString(),
    };

    this.corrections.push(record);

    return {
      record,
      affectedDependenciesCount: affectedDependentIds.length,
      updatedDependentItems,
    };
  }
}
