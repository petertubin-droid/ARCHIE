// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — OWNER AUTHORITY
// Spec §8: Owner Authority and Protected Operations
// =========================================================

import type {
  OwnerAuthorityStage,
  ProtectedSystemCheck,
} from "./types.ts";

export function classifyOperationalStage(commandOrIntent: string): any {
  const text = commandOrIntent.toLowerCase();

  if (/\b(?:deploy|release|ship|publish to prod)\b/i.test(text)) {
    return "RELEASE_DEPLOYMENT";
  }
  if (/\b(?:migrate|migration|alter table|drop table|apply schema)\b/i.test(text)) {
    return "PRODUCTION_MIGRATION";
  }
  if (/\b(?:change production|edit prod|update live|modify prod)\b/i.test(text)) {
    return "CHANGE_PRODUCTION";
  }
  if (/\b(?:patch|diff|create patch|prepare pr|prepare a patch)\b/i.test(text)) {
    return "PATCH_PREPARATION";
  }
  if (/\b(?:design|spec|architecture)\b/i.test(text) && !/\bwhat if|analyze|calculate\b/i.test(text)) {
    return "DESIGN";
  }
  if (/\b(?:modify|edit|write|save|update)\b/i.test(text) && !/\bwhat if|analyze\b/i.test(text)) {
    return "MODIFY_LOCAL";
  }

  return "ANALYSIS";
}

export function checkOwnerAuthority(
  commandOrTarget: string,
  stageOrApproved?: any,
  ownerApproved = false,
): any {
  let stage: string = "";
  let isApproved = false;

  if (typeof stageOrApproved === "string") {
    stage = stageOrApproved;
    isApproved = Boolean(ownerApproved);
  } else if (typeof stageOrApproved === "boolean") {
    stage = classifyOperationalStage(commandOrTarget);
    isApproved = stageOrApproved;
  } else {
    stage = classifyOperationalStage(commandOrTarget);
    isApproved = false;
  }

  const isProtected = stage === "RELEASE_DEPLOYMENT" || stage === "PRODUCTION_MIGRATION" || stage === "CHANGE_PRODUCTION";
  const allowed = !isProtected || isApproved;
  const reason = isProtected
    ? `Operation '${stage}' modifies protected production systems and requires explicit Owner approval.`
    : `Operation '${stage}' is analytical and autonomous.`;

  return {
    target: commandOrTarget,
    stage,
    isProtected,
    requiresOwnerApproval: isProtected,
    isAllowedAutonomously: !isProtected,
    allowed,
    reason,
    rationale: reason,
  };
}
