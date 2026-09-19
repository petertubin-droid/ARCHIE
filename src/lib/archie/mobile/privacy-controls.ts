// =========================================================
// FRELUX PHASE 8 P4, PRIVACY CONTROLS
//
// FRELUX clearly distinguishes USER DATA from FRELUX
// KNOWLEDGE. One subscriber's personal information is never
// exposed to another subscriber. These are the user's
// controls over their own data, every decision function is
// evidence-based and auditable:
//
//   view / correct / withdraw / revoke device / revoke
//   permissions / delete eligible personal data / change
//   knowledge scope
//
// Deletion eligibility: personal data (PRIVATE scope) and
// not-yet-promoted candidates are deletable. Knowledge
// already human-approved as FRELUX GLOBAL is technical
// knowledge, the contributor identity is dissociated and
// the item is flagged for review, because silently deleting
// reviewed knowledge would rewrite history.
// =========================================================

import type {
  SubscriberContribution,
  MobileLearning,
  MobileKnowledgeScope,
  TrustedDevice,
} from "./p4-types";
import { revokeDevice } from "./trusted-devices";
import {
  evaluateScopeTransition,
  DEFAULT_MOBILE_SCOPE,
} from "./knowledge-scope";

/** Isolation guard for viewing: a user can only ever see
 *  their own data. Admins see knowledge, not personal data
 *  (contributions are evaluated as candidates, and the
 *  admin surface shows content + provenance, not other
 *  users' raw files). */
export function mayViewLearnedData(
  requester_user_id: string,
  item_user_id: string,
): boolean {
  return requester_user_id === item_user_id;
}

/** Cross-user, cross-project and cross-region leakage check
 *  for any retrieval: an item answers only within its scope. */
export function mayServeKnowledgeToUser(args: {
  requester_user_id: string;
  item_owner_user_id: string;
  item_scope: MobileKnowledgeScope;
  item_project_ref?: string | null;
  item_property_ref?: string | null;
  item_region?: string | null;
  requester_project_refs?: readonly string[];
  requester_property_refs?: readonly string[];
  requester_region?: string | null;
}): { ok: boolean; reason: string } {
  const s = args;
  if (s.item_scope === "PRIVATE") {
    if (s.requester_user_id !== s.item_owner_user_id) {
      return { ok: false, reason: "PRIVATE knowledge is only the owner's" };
    }
    return { ok: true, reason: "Owner viewing their private knowledge" };
  }
  if (s.item_scope === "PROJECT") {
    if (!(s.requester_project_refs ?? []).includes(s.item_project_ref ?? "")) {
      return { ok: false, reason: "PROJECT knowledge serves only authorized project members" };
    }
    return { ok: true, reason: "Authorized project member" };
  }
  if (s.item_scope === "PROPERTY") {
    if (!(s.requester_property_refs ?? []).includes(s.item_property_ref ?? "")) {
      return { ok: false, reason: "PROPERTY knowledge serves only the authorized property context" };
    }
    return { ok: true, reason: "Authorized property context" };
  }
  if (s.item_scope === "REGIONAL") {
    if (s.item_region && s.requester_region && s.item_region !== s.requester_region) {
      return { ok: false, reason: "REGIONAL knowledge does not cross regions" };
    }
    return { ok: true, reason: "Within the verified regional context" };
  }
  // FRELUX_GLOBAL_CANDIDATE never serves as knowledge to
  // users, it is evaluation-pool material only.
  if (s.item_scope === "FRELUX_GLOBAL_CANDIDATE") {
    if (s.requester_user_id === s.item_owner_user_id) {
      return { ok: true, reason: "Contributor viewing their own candidate" };
    }
    return { ok: false, reason: "Global candidates are not knowledge yet, evaluation pool only" };
  }
  return { ok: true, reason: "Approved global knowledge" };
}

/** Deletion eligibility: PRIVATE data and non-promoted
 *  candidates are deletable; approved global knowledge is
 *  dissociated + flagged instead. */
export function deleteEligibility(
  item: MobileLearning | SubscriberContribution,
  requester_user_id: string,
): {
  eligible: boolean;
  action: "DELETE" | "DISSOCIATE_AND_FLAG";
  reason: string;
} {
  const owner = item.user_id;
  if (requester_user_id !== owner) {
    return {
      eligible: false,
      action: "DELETE",
      reason: "Only the owner can request deletion of their personal data",
    };
  }
  const scope =
    "scope" in item && item.scope ? item.scope : DEFAULT_MOBILE_SCOPE;
  if (scope === "FRELUX_GLOBAL_APPROVED") {
    return {
      eligible: false,
      action: "DISSOCIATE_AND_FLAG",
      reason:
        "Already human-approved global knowledge: personal identity is removed and the item is flagged for human review (history is not silently rewritten)",
    };
  }
  return {
    eligible: true,
    action: "DELETE",
    reason: "Personal data / not-yet-promoted candidate, fully deletable",
  };
}

/** Scope change request: narrowing always allowed; widening
 *  goes through the knowledge-scope transition matrix. */
export function requestScopeChange(
  item: SubscriberContribution | MobileLearning,
  to: MobileKnowledgeScope,
  requester_user_id: string,
  opts: { user_contributes?: boolean; human_approval_id?: string } = {},
): { ok: boolean; error?: string; requires_user_consent?: boolean } {
  const owner = item.user_id;
  if (requester_user_id !== owner) {
    return { ok: false, error: "Only the owner can change the scope of their data" };
  }
  const from =
    ("scope" in item && item.scope ? item.scope : DEFAULT_MOBILE_SCOPE) ??
    DEFAULT_MOBILE_SCOPE;
  const result = evaluateScopeTransition(from, to, opts);
  if (!result.allowed) {
    return { ok: false, error: result.reason, requires_user_consent: result.requires_user_consent };
  }
  return { ok: true, requires_user_consent: result.requires_user_consent };
}

/** Revoke a device as a privacy control, the device loses
 *  every permission immediately (terminal, as in
 *  trusted-devices). */
export function revokeDeviceAsPrivacyControl(
  device: TrustedDevice,
  requester_user_id: string,
): { ok: boolean; error?: string; device?: TrustedDevice } {
  if (device.user_id !== requester_user_id) {
    return { ok: false, error: "Only the owner can revoke their device" };
  }
  return { ok: true, device: revokeDevice(device) };
}
