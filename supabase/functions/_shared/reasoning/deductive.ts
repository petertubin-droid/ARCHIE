// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — DEDUCTIVE REASONING
// Spec §3.B: Deductive Reasoning
// =========================================================

import type {
  DeductiveDeduction,
  DeductiveRule,
  ReasoningPremise,
} from "./types.ts";

export interface DeductiveResult {
  valid: boolean;
  sound: boolean;
  conclusions: string[];
  deductions: DeductiveDeduction[];
  steps: DeductiveDeduction[];
  [index: number]: DeductiveDeduction;
  length: number;
}

export function evaluateDeductiveInference(
  premises: ReasoningPremise[],
  rules: any[],
): any {
  const deductions: DeductiveDeduction[] = [];
  const premiseMap = new Map<string, ReasoningPremise>();
  for (const p of premises) {
    premiseMap.set(p.id, p);
  }

  for (const rule of rules) {
    const antecedentClean = (rule.antecedent || "").toLowerCase().trim();
    const consequentClean = (rule.consequent || "").trim();

    const matchingPremises = premises.filter((p) =>
      p.statement.toLowerCase().includes(antecedentClean),
    );

    if (matchingPremises.length > 0) {
      const usedIds = matchingPremises.map((p) => p.id);
      const assumptions = matchingPremises
        .filter((p) => p.state === "ASSUMPTION")
        .map((p) => p.statement);
      const isSound = matchingPremises.every((p) => p.state === "FACT" || (p as any).epistemicStatus === "ESTABLISHED_FACT");

      deductions.push({
        conclusion: consequentClean,
        ruleId: rule.id || "rule-1",
        premiseIds: usedIds,
        assumptionsUsed: assumptions,
        isSound,
        isValid: true,
      });
    }
  }

  const conclusions = deductions.map((d) => d.conclusion);
  const sound = deductions.length > 0 ? deductions.every((d) => d.isSound) : true;
  const valid = deductions.length > 0 ? deductions.every((d) => d.isValid) : true;

  const result: any = deductions;
  result.valid = valid;
  result.sound = sound;
  result.conclusions = conclusions;
  result.deductions = deductions;
  result.steps = deductions;

  return result;
}

export function checkDeductiveConsistency(
  premises: ReasoningPremise[],
): {
  isConsistent: boolean;
  consistent: boolean;
  conflicts: string[];
  contradictions: string[];
} {
  const conflicts: string[] = [];

  for (let i = 0; i < premises.length; i++) {
    for (let j = i + 1; j < premises.length; j++) {
      const a = premises[i].statement.toLowerCase();
      const b = premises[j].statement.toLowerCase();

      // Check direct assertion vs negation
      const aNegated = /\b(?:not|no|never|cannot|isn't|is not)\b/i.test(a);
      const bNegated = /\b(?:not|no|never|cannot|isn't|is not)\b/i.test(b);
      if (aNegated !== bNegated) {
        const normalizeNegation = (value: string): string => value
          .replace(/\bis not\b/gi, "is")
          .replace(/\bare not\b/gi, "are")
          .replace(/\bwas not\b/gi, "was")
          .replace(/\bwere not\b/gi, "were")
          .replace(/\bcannot\b/gi, "can")
          .replace(/\bcan not\b/gi, "can")
          .replace(/\bisn't\b/gi, "is")
          .replace(/\baren't\b/gi, "are")
          .replace(/\bwasn't\b/gi, "was")
          .replace(/\bweren't\b/gi, "were")
          .replace(/\bnot\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        const cleanA = normalizeNegation(a);
        const cleanB = normalizeNegation(b);
        if (cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
          conflicts.push(`Direct contradiction between premise ${premises[i].id} and ${premises[j].id}: "${premises[i].statement}" vs "${premises[j].statement}"`);
          continue;
        }
      }

      if (
        (a.includes("is required") && b.includes("is not required")) ||
        (a.includes("must exceed") && b.includes("cannot exceed"))
      ) {
        conflicts.push(`Direct contradiction between premise ${premises[i].id} and ${premises[j].id}: "${premises[i].statement}" vs "${premises[j].statement}"`);
      }
    }
  }

  const isConsistent = conflicts.length === 0;
  return {
    isConsistent,
    consistent: isConsistent,
    conflicts,
    contradictions: conflicts,
  };
}
