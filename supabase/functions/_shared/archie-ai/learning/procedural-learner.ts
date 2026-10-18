// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — PROCEDURAL LEARNER
// supabase/functions/_shared/archie-ai/learning/procedural-learner.ts
//
// Extracts, versions, and validates reusable task procedures
// and operational workflows based on verified execution (spec §4.4).
// Rejects illusory skills requiring non-existent tools or permissions.
// =========================================================

import type { ProceduralSkill, ProceduralStep } from "./types.ts";

export interface ProcedureValidationResult {
  valid: boolean;
  warnings: string[];
  missingPrerequisites: string[];
}

export class ProceduralSkillLearner {
  private skills = new Map<string, ProceduralSkill>();
  private knownTools: ReadonlySet<string>;

  constructor(
    knownTools: string[] = [
      "code_analysis",
      "web_research",
      "memory_search",
      "calculator",
      "file_read",
      "file_write",
      "database_query",
      "security_scan",
    ],
  ) {
    this.knownTools = new Set(knownTools.map((t) => t.toLowerCase()));
  }

  list(): ProceduralSkill[] {
    return Array.from(this.skills.values());
  }

  get(skillId: string): ProceduralSkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Registers a newly formulated procedural skill after validating prerequisites and tool availability.
   */
  registerSkill(skillInput: Omit<ProceduralSkill, "version" | "verifiedSuccessCount" | "failureCount" | "createdAt" | "updatedAt">): {
    skill?: ProceduralSkill;
    validation: ProcedureValidationResult;
  } {
    const warnings: string[] = [];
    const missingPrerequisites: string[] = [];

    // 1. Verify steps integrity
    if (!skillInput.steps || skillInput.steps.length === 0) {
      warnings.push("A procedural skill must contain at least one explicit step.");
      return { validation: { valid: false, warnings, missingPrerequisites } };
    }

    // 2. Tool availability check (spec §4.4: prevent illusion of non-existent capability)
    for (const step of skillInput.steps) {
      if (step.toolRequired) {
        const normTool = step.toolRequired.toLowerCase().trim();
        if (!this.knownTools.has(normTool)) {
          warnings.push(`Step ${step.stepNumber} requires unavailable tool '${step.toolRequired}'.`);
        }
      }
      if (!step.action || !step.expectedOutcome) {
        warnings.push(`Step ${step.stepNumber} must specify both action and expected outcome.`);
      }
    }

    const valid = warnings.length === 0;
    if (!valid) {
      return { validation: { valid: false, warnings, missingPrerequisites } };
    }

    const now = new Date().toISOString();
    const existing = this.skills.get(skillInput.id);
    const version = existing ? existing.version + 1 : 1;

    const skill: ProceduralSkill = {
      ...skillInput,
      version,
      verifiedSuccessCount: existing ? existing.verifiedSuccessCount : 0,
      failureCount: existing ? existing.failureCount : 0,
      status: "DRAFT",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.skills.set(skill.id, skill);
    return { skill, validation: { valid: true, warnings: [], missingPrerequisites: [] } };
  }

  /**
   * Records execution outcome for a procedural skill.
   */
  recordSkillOutcome(skillId: string, outcome: "SUCCESS" | "FAILURE"): ProceduralSkill | undefined {
    const skill = this.skills.get(skillId);
    if (!skill) return undefined;

    if (outcome === "SUCCESS") {
      skill.verifiedSuccessCount += 1;
      if (skill.verifiedSuccessCount >= 2 && skill.failureCount === 0) {
        skill.status = "VERIFIED";
      }
    } else {
      skill.failureCount += 1;
      if (skill.failureCount > skill.verifiedSuccessCount) {
        skill.status = "DRAFT";
      }
    }

    skill.updatedAt = new Date().toISOString();
    return skill;
  }
}
