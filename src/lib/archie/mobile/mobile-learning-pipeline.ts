// =========================================================
// FRELUX PHASE 8 P4, MOBILE LEARNING PIPELINE
//
// USER CONSENT → SELECT DATA → ARCHIE INGESTION → EXTRACT/
// ANALYZE → STRUCTURE → VALIDATE → EVALUATE → SHOW USER WHAT
// WAS LEARNED → USER CONFIRMATION WHERE REQUIRED → KNOWLEDGE
// SCOPE → HUMAN/OWNER APPROVAL WHERE REQUIRED → VERSIONED
// KNOWLEDGE
//
// Enforced invariants:
//   * Raw mobile data is NEVER verified truth, items are
//     born AI_EXTRACTED (an estimate) and only human
//     verification upgrades evidence state.
//   * The SHOW USER step is mandatory: ARCHIE ingests nothing
//     the user does not get to see summarized.
//   * USER CONFIRMATION is required whenever the scope leaves
//     the user's own data.
//   * HUMAN APPROVAL is required for every scope beyond
//     PRIVATE (and always for global approval).
//   * Stages advance one step at a time; nothing skips.
// =========================================================

import type {
  MobileDataCategory,
  MobileLearning,
  MobileLearningState,
  MobileKnowledgeScope,
  TrustedDevice,
  DeviceDataConsent,
} from "./p4-types";
import { MOBILE_PIPELINE_ORDER } from "./p4-types";
import { mayIngestFrom } from "./consent-categories";
import {
  DEFAULT_MOBILE_SCOPE,
  requiresUserConfirmation,
  evaluateScopeTransition,
} from "./knowledge-scope";

/** Open a mobile learning: consent + selection must already be
 *  validated, this function re-checks both so the pipeline
 *  cannot start on assumption. */
export function startMobileLearning(args: {
  device: TrustedDevice;
  consents: DeviceDataConsent[];
  category: MobileDataCategory;
  selected_count: number;
  now?: string;
}): { ok: boolean; error?: string; learning?: MobileLearning } {
  const gate = mayIngestFrom(args.device, args.consents, args.category);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (args.selected_count <= 0) {
    return {
      ok: false,
      error: "No data selected, silent whole-device ingestion is forbidden",
    };
  }
  const now = args.now ?? new Date().toISOString();
  const learning: MobileLearning = {
    id: crypto.randomUUID(),
    user_id: args.device.user_id,
    device_id: args.device.id,
    category: args.category,
    pipeline_state: "CONSENTED",
    shown_summary: null,
    user_confirmed: false,
    scope: null,
    learned: [],
    flags: [],
    created_date: now,
    updated_date: now,
  };
  return { ok: true, learning };
}

export type MobileAdvance =
  { ok: true; learning: MobileLearning } | { ok: false; error: string };

/** Advance one pipeline stage with its required evidence. */
export function advanceMobileLearning(
  learning: MobileLearning,
  to: MobileLearningState,
  evidence: {
    /** For SELECTED: number of items the user picked. */
    selected_count?: number;
    /** For EXTRACTED..EVALUATED: the structured facts. */
    learned?: MobileLearning["learned"];
    /** For SHOWN_TO_USER: the summary shown to the user. */
    shown_summary?: string;
    /** For USER_CONFIRMED: explicit user confirmation. */
    user_confirmed?: boolean;
    /** For SCOPED: the assigned scope. */
    scope?: MobileKnowledgeScope;
    /** For APPROVED: human approval record id. */
    human_approval_id?: string;
    /** Flags to add (injection detections, duplicates…). */
    flags?: string[];
  } = {},
): MobileAdvance {
  if (to === "REJECTED") {
    return { ok: true, learning: { ...learning, pipeline_state: "REJECTED" } };
  }
  const fromIdx = MOBILE_PIPELINE_ORDER.indexOf(learning.pipeline_state);
  const toIdx = MOBILE_PIPELINE_ORDER.indexOf(to);
  if (toIdx === -1) return { ok: false, error: `Unknown stage "${to}"` };
  if (toIdx !== fromIdx + 1) {
    return {
      ok: false,
      error: `Mobile learning advances one step at a time: ${learning.pipeline_state} → ${to} is forbidden`,
    };
  }
  const t = new Date().toISOString();
  const next = { ...learning, updated_date: t };
  switch (to) {
    case "SELECTED": {
      if (!evidence.selected_count || evidence.selected_count <= 0) {
        return {
          ok: false,
          error: "SELECTED requires explicitly selected items (no silent scan)",
        };
      }
      return { ok: true, learning: { ...next, pipeline_state: to } };
    }
    case "INGESTED":
      return { ok: true, learning: { ...next, pipeline_state: to } };
    case "EXTRACTED":
    case "STRUCTURED":
    case "VALIDATED":
    case "EVALUATED": {
      if (!evidence.learned || evidence.learned.length === 0) {
        return {
          ok: false,
          error: `${to} requires the structured facts produced so far`,
        };
      }
      const flags = [...next.flags, ...(evidence.flags ?? [])];
      return {
        ok: true,
        learning: {
          ...next,
          pipeline_state: to,
          learned: evidence.learned,
          flags,
        },
      };
    }
    case "SHOWN_TO_USER": {
      if (!evidence.shown_summary?.trim()) {
        return {
          ok: false,
          error:
            "SHOW USER WHAT WAS LEARNED is mandatory, a summary is required",
        };
      }
      return {
        ok: true,
        learning: {
          ...next,
          pipeline_state: to,
          shown_summary: evidence.shown_summary,
        },
      };
    }
    case "USER_CONFIRMED": {
      if (
        next.scope &&
        requiresUserConfirmation(next.scope) &&
        evidence.user_confirmed !== true
      ) {
        return {
          ok: false,
          error:
            "This scope requires explicit user confirmation before proceeding",
        };
      }
      return {
        ok: true,
        learning: {
          ...next,
          pipeline_state: to,
          user_confirmed: evidence.user_confirmed === true,
        },
      };
    }
    case "SCOPED": {
      if (!evidence.scope) {
        return {
          ok: false,
          error: "SCOPED requires an explicit scope assignment",
        };
      }
      return {
        ok: true,
        learning: { ...next, pipeline_state: to, scope: evidence.scope },
      };
    }
    case "APPROVED": {
      const scope = next.scope ?? DEFAULT_MOBILE_SCOPE;
      // EVERY scope beyond PRIVATE needs human approval at this
      // stage, no unauthorized global knowledge promotion.
      if (scope !== "PRIVATE" && !evidence.human_approval_id) {
        return {
          ok: false,
          error: `Scope ${scope} requires human/owner approval, ARCHIE never self-approves`,
        };
      }
      return { ok: true, learning: { ...next, pipeline_state: to } };
    }
    case "VERSIONED":
      return { ok: true, learning: { ...next, pipeline_state: to } };
    default:
      return { ok: false, error: "Unreachable" };
  }
}

/** Born evidence state for mobile-learned items, the fixed
 *  starting point. Never USER_CONFIRMED, never VERIFIED. */
export const MOBILE_BORN_EVIDENCE = "AI_EXTRACTED" as const;

/** Validation-compatible summary of what was learned, shown to
 *  the user verbatim. */
export function whatWasLearnedSummary(learning: MobileLearning): string {
  const lines = learning.learned.map(
    (f) =>
      `• ${f.topic}: ${JSON.stringify(f.content)} (confidence ${Math.round(f.confidence * 100)}%)`,
  );
  return [
    "ARCHIE learned the following from your selected data:",
    ...lines,
    "",
    "This is an AI-extracted observation, not verified truth.",
    "You can correct or delete it at any time.",
  ].join("\n");
}

/** Scope-change request from an existing learning (user
 *  control): PRIVATE → contribution requires the explicit
 *  second consent; anything beyond the user's own data
 *  requires human approval. */
export function requestScopeChange(
  learning: MobileLearning,
  to: MobileKnowledgeScope,
  opts: { user_contributes?: boolean; human_approval_id?: string } = {},
): { ok: boolean; error?: string; requires_user_consent?: boolean } {
  const from = learning.scope ?? DEFAULT_MOBILE_SCOPE;
  const result = evaluateScopeTransition(from, to, opts);
  if (!result.allowed) {
    return {
      ok: false,
      error: result.reason,
      requires_user_consent: result.requires_user_consent,
    };
  }
  return { ok: true, requires_user_consent: result.requires_user_consent };
}
