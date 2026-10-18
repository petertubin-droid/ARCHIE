// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — OWNER AUTHORITY GUARD
// supabase/functions/_shared/archie-ai/learning/owner-authority-guard.ts
//
// Enforces strict Owner Authority boundaries over source code,
// executable algorithms, system instructions, architecture,
// production configuration, and certified math (spec §11).
// Learning what to do and doing it are SEPARATE permissions:
// ordinary learning accumulates knowledge freely; protected
// modifications STOP at PROPOSE and require Owner authorization.
// =========================================================

import { MATH_CAPABILITIES } from "./types.ts";

export interface AuthorityCheckResult {
  authorized: boolean;
  requiresOwnerApproval: boolean;
  reason: string;
  category:
    | "FREE_KNOWLEDGE_ACQUISITION"
    | "CERTIFIED_MATH_PROTECTED"
    | "SOURCE_CODE_PROTECTED"
    | "SYSTEM_INSTRUCTION_PROTECTED"
    | "ARCHITECTURE_PROTECTED"
    | "AUTHORITY_ESCALATION_BLOCKED";
}

const PROTECTED_MODIFICATION_PATTERNS = [
  /\b(modify|change|rewrite|patch|replace)\s+(source\s*code|algorithm|system\s*prompt|instruction)/i,
  /\b(bypass|disable|override)\s+(owner|authority|approval|security|guard)/i,
  /\b(grant|escalate|elevate)\s+(privilege|permission|role)/i,
  /\b(alter|update)\s+(database\s*schema|migration|rls\s*policy)/i,
];

export class OwnerAuthorityGuard {
  /**
   * Validates whether a proposed learning update crosses protected boundaries.
   */
  evaluateAuthority(args: {
    capability: string;
    intentText: string;
    targetScope?: string;
    ownerAuthorized?: boolean;
    reviewer?: string;
  }): AuthorityCheckResult {
    const cap = args.capability.toLowerCase().trim();
    const text = args.intentText.toLowerCase().trim();

    // 1. Check for authority escalation / protected system modifications
    for (const pat of PROTECTED_MODIFICATION_PATTERNS) {
      if (pat.test(text)) {
        return {
          authorized: false,
          requiresOwnerApproval: true,
          reason: "Attempt to modify protected code, algorithm, instruction, or authority boundary. Learning NEVER grants execution authority.",
          category: "AUTHORITY_ESCALATION_BLOCKED",
        };
      }
    }

    // 2. Check deterministic certified math capabilities (spec §11)
    for (const mathCap of MATH_CAPABILITIES) {
      if (cap === mathCap || cap.startsWith(`${mathCap}:`) || cap.includes(mathCap)) {
        if (!args.ownerAuthorized) {
          return {
            authorized: false,
            requiresOwnerApproval: true,
            reason: `Capability '${cap}' governs certified deterministic math calculations: requires explicit engineering review and Owner approval before modification.`,
            category: "CERTIFIED_MATH_PROTECTED",
          };
        }
        return {
          authorized: true,
          requiresOwnerApproval: true,
          reason: `Certified math modification explicitly authorized by Owner for '${cap}'.`,
          category: "CERTIFIED_MATH_PROTECTED",
        };
      }
    }

    // 3. Free knowledge acquisition (descriptive, factual, empirical observations)
    return {
      authorized: true,
      requiresOwnerApproval: false,
      reason: "Knowledge acquisition is permitted within authorized operational boundaries.",
      category: "FREE_KNOWLEDGE_ACQUISITION",
    };
  }
}
