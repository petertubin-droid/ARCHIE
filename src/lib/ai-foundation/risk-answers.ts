// =========================================================
// FRELUX AI FOUNDATION, RISK QUESTION ANSWERING (Phase 4 §20)
//
// The Copilot's risk-question surface: deterministic retrieval
// over the project's ACTUAL predictive analysis. No AI call is
// made to answer a risk question, the deterministic answer and
// the pre-computed AI context come from the predictive-intelligence
// module, and the optional AI summary may only relay them.
//
// Flow:
//   user question → classifyRiskQuestion (deterministic intent)
//     → matched?  → getProjectAnalysis (cached, §22)
//                  → answerRiskQuestion (retrieval, never invention)
//                  → buildPredictiveContextForAi (for optional summary)
//     → no match? → null (the Copilot falls through to its
//                  normal interpretation path, §20)
// =========================================================

import {
  classifyRiskQuestion,
  answerRiskQuestion,
  buildPredictiveContextForAi,
  getProjectAnalysis,
} from "@/lib/predictive-intelligence";

export interface RiskAnswerResult {
  question: string;
  matched: true;
  /** Deterministic, evidence-anchored answer. */
  answer: string;
  /** Pre-computed context an AI summary may relay verbatim :
   *  the AI is forbidden from adding facts beyond this. */
  aiContext: string;
  /** Analysis came from cache vs fresh computation (§22). */
  fromCache: boolean;
}

export interface RiskAnswerUnavailable {
  question: string;
  matched: true;
  /** Honest reason, project missing, not visible, or analysis failed. */
  unavailableReason: "project_not_found" | "analysis_failed";
}

export type RiskAnswer = RiskAnswerResult | RiskAnswerUnavailable | null;

/**
 * Answer a project risk question from the actual project records.
 * Returns null when the question is not a risk question, callers
 * fall through to their normal flow. NEVER fabricates.
 */
export async function answerProjectRiskQuestion(
  projectId: string,
  question: string,
): Promise<RiskAnswer> {
  const kind = classifyRiskQuestion(question);
  if (!kind) return null;

  let analysis;
  let fromCache = false;
  try {
    const result = await getProjectAnalysis(projectId);
    if (!result) {
      return {
        question,
        matched: true,
        unavailableReason: "project_not_found",
      };
    }
    analysis = result.analysis;
    fromCache = result.fromCache;
  } catch {
    return { question, matched: true, unavailableReason: "analysis_failed" };
  }

  const deterministic = answerRiskQuestion(kind, analysis);
  return {
    question,
    matched: true,
    answer: deterministic.answer,
    aiContext: buildPredictiveContextForAi(analysis),
    fromCache,
  };
}
