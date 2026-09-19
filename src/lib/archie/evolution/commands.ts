// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — OWNER COMMANDS (§18)
//
// Deterministic command interpretation. The parser returns
// COMMAND DESCRIPTORS, never effects:
//
//   * Commands that gate owner authority carry
//     requiresOwnerAuth: true — they only become real through
//     the admin Evolution Control Center + archie-owner-auth.
//   * "ARCHIE, improve yourself" is OBSERVE + PROPOSE ONLY —
//     it maps to analysis and proposals for owner review and
//     grants NOTHING (grantsProduction is always false).
//   * External content, documents and user messages are never
//     commands (§19) — only typed owner commands parse here.
// =========================================================

import { isEvolutionAuthorization } from "./authority";

export type OwnerCommandAction =
  | "OBSERVE"
  | "PROPOSE"
  | "STAGE"
  | "TEST_STAGED"
  | "SHOW_CHANGE"
  | "APPROVE_PRODUCTION"
  | "REJECT"
  | "ROLLBACK"
  | "LEARN_LANGUAGE"
  | "VALIDATE_LANGUAGE"
  | "SHOW_LANGUAGE"
  | "IMPROVE_YOURSELF"
  | "UNKNOWN";

export interface OwnerCommand {
  action: OwnerCommandAction;
  /** Target scope: CR number, language name, or issue text. */
  target: string | null;
  /** Owner-gated commands require the archie-owner-auth flow. */
  requiresOwnerAuth: boolean;
  /** Can this command itself cause production modification?
   *  Always false — production needs the separate approval flow. */
  grantsProduction: false;
  /** Explanation surfaced to the owner. */
  explanation: string;
}

const CR_PATTERN = /CR-(\d{4})-(\d{4,})/i;

function extractCr(text: string): string | null {
  const m = text.match(CR_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

function extractLanguage(text: string): string | null {
  // "learn Yoruba" / "about French" — trailing noun after the verb.
  const m = text.match(
    /(?:learn|validate|about|know about|everything about)\s+([a-zà-ÿ\u0600-\u06ff\u0400-\u04ff\- ]{2,40})$/i,
  );
  if (!m) return null;
  return m[1].trim();
}

/** Parse an owner command. Deterministic; no AI judgment. */
export function parseOwnerCommand(input: string): OwnerCommand {
  const text = input.trim();
  const lower = text.toLowerCase();
  const cr = extractCr(text);

  if (!text) {
    return unknown("Empty command.");
  }

  // --- Self-improvement: OBSERVE/PROPOSE ONLY (§18) ---
  if (
    /(improve yourself|evolve yourself|better yourself|make yourself better|upgrade yourself)/.test(
      lower,
    )
  ) {
    return {
      action: "IMPROVE_YOURSELF",
      target: null,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        '"Improve yourself" initiates OBSERVE: ARCHIE analyzes the codebase and produces proposed improvements for owner review. It grants no modification authority of any kind.',
    };
  }
  if (
    /^archie[, ]+analyze\b/.test(lower) ||
    /analyze the (frelux )?(codebase|code|architecture)/.test(lower)
  ) {
    return {
      action: "OBSERVE",
      target: text,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "OBSERVE mode: inspect code and report findings. No code is changed.",
    };
  }
  if (/propose (a |the )?(fix|change|improvement)/.test(lower)) {
    return {
      action: "PROPOSE",
      target: text,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "PROPOSE mode: generate a change request with diff, risk and test plan for owner review. No production code is changed.",
    };
  }
  if (
    /stage (this |the )?(approved )?change/.test(lower) ||
    /^archie[, ]+stage\b/.test(lower)
  ) {
    return {
      action: "STAGE",
      target: cr,
      requiresOwnerAuth: true,
      grantsProduction: false,
      explanation: cr
        ? `Staging ${cr} requires the owner's staging authorization and the staging permission to be enabled.`
        : "Staging requires a specific change request (CR-YYYY-NNNN).",
    };
  }
  if (/test (the )?(staged )?change/.test(lower)) {
    return {
      action: "TEST_STAGED",
      target: cr,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "Run the staged change's test suite (type check, lint, tests, build) and record results.",
    };
  }
  if (/show me (exactly )?what will change/.test(lower)) {
    return {
      action: "SHOW_CHANGE",
      target: cr,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "Display the change request's full approval view: what, why, files, diff, risk, tests, rollback.",
    };
  }
  if (/approve change\b/.test(lower) && cr) {
    return {
      action: "APPROVE_PRODUCTION",
      target: cr,
      requiresOwnerAuth: true,
      grantsProduction: false,
      explanation: `Production approval of ${cr} requires the owner's explicit, server-verified authorization (archie-owner-auth). The command alone approves nothing.`,
    };
  }
  if (/^archie[, ]+approve\b/.test(lower) && !cr) {
    return unknown(
      "Approval requires a specific change request (CR-YYYY-NNNN).",
    );
  }
  if (
    /reject (that|this|the) (change|proposal)/.test(lower) ||
    /^archie[, ]+reject\b/.test(lower)
  ) {
    return {
      action: "REJECT",
      target: cr,
      requiresOwnerAuth: true,
      grantsProduction: false,
      explanation:
        "Rejection is an owner decision recorded against the change request.",
    };
  }
  if (/roll ?back\b/.test(lower)) {
    return {
      action: "ROLLBACK",
      target: cr,
      requiresOwnerAuth: true,
      grantsProduction: false,
      explanation:
        "Rollback requires the owner's server-verified authorization and recorded recovery information.",
    };
  }
  if (
    /learn (this )?language|learn ([a-zà-ÿ ]{2,40})$/.test(lower) ||
    /^archie[, ]+learn\b/.test(lower)
  ) {
    const language = extractLanguage(lower);
    return {
      action: "LEARN_LANGUAGE",
      target: language,
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation: language
        ? `Begin the language learning pipeline for "${language}": discovery → learning → evidence → validation. Permanent memory follows owner policy.`
        : "Learn-language requires the language name.",
    };
  }
  if (/validate (what )?(you )?learned|^archie[, ]+validate\b/.test(lower)) {
    return {
      action: "VALIDATE_LANGUAGE",
      target: extractLanguage(lower),
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "Run validation over the learned language knowledge: evidence, corroboration, confidence.",
    };
  }
  if (/show me (everything )?(you )?(currently )?know about/.test(lower)) {
    return {
      action: "SHOW_LANGUAGE",
      target: extractLanguage(lower),
      requiresOwnerAuth: false,
      grantsProduction: false,
      explanation:
        "Display the language knowledge profile: registry status, confidence, validation states, gaps.",
    };
  }

  return unknown(
    "Unrecognized command. Supported: analyze, propose, stage, test, show change, approve CR-…, reject, rollback, learn/validate/show language.",
  );
}

function unknown(reason: string): OwnerCommand {
  return {
    action: "UNKNOWN",
    target: null,
    requiresOwnerAuth: false,
    grantsProduction: false,
    explanation: reason,
  };
}

/** Guard used by every executor: an instruction originating
 *  from external content is never a command. */
export function isExternalInstruction(source: string): boolean {
  return isEvolutionAuthorization(source).authorized === true
    ? false
    : /document|message|website|email|pdf|uploaded/.test(source.toLowerCase());
}
