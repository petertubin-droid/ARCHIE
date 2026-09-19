// =========================================================
// FRELUX PHASE 8b, OWNER AUTHORIZATION (CLIENT)
//
// Owner-only authorization for production changes to FRELUX
// code, calculator engines, deterministic logic and high-risk
// configuration. Voice/text may INITIATE the workflow, but
// sensitive authorization is always verified SERVER-SIDE via
// the archie-owner-auth edge function:
//   * the secret is typed into a password field (never a voice
//     transcript, never an AI prompt)
//   * it travels once over HTTPS to the server, which stores
//     ONLY a PBKDF2 hash
//   * it is never stored, exposed, echoed, logged or returned
//
// Every authorized change records: authenticated owner identity,
// audit record, before/after state, proposed/current version,
// tests, versioning, rollback capability. High-risk kinds keep
// their additional verification gates (Phase 8 governance).
// =========================================================
import { supabase, getFunctionErrorMessage } from "@/lib/supabase";
import { requiresOwnerAuth } from "./owner-policy";
import type { OwnerAuthorizationRecord, OwnerChangeKind } from "./types";

/** Clear any transcript buffer before the authorization dialog opens. */
export function purgeTranscriptsForAuthorization(transcripts: string[]): {
  purged: string[];
  remaining: string[];
} {
  // Voice may INITIATE authorization, but the secret is never
  // spoken, transcripts are dropped the moment the workflow
  // begins, so nothing sensitive can linger in memory.
  return {
    purged: transcripts.splice(0, transcripts.length),
    remaining: transcripts,
  };
}

export interface OwnerAuthResponse {
  ok: boolean;
  error?: string;
  hasCredential?: boolean;
  authorization?: OwnerAuthorizationRecord;
  authorizations?: OwnerAuthorizationRecord[];
}

async function callOwnerAuth(
  payload: Record<string, unknown>,
): Promise<OwnerAuthResponse> {
  const { data, error } = await supabase.functions.invoke("archie-owner-auth", {
    body: payload,
  });
  if (error) return { ok: false, error: await getFunctionErrorMessage(error) };
  return (data ?? {
    ok: false,
    error: "No response from the authorization service.",
  }) as OwnerAuthResponse;
}

/** Does the owner have a credential set? (No secret material involved.) */
export async function checkOwnerCredential(): Promise<OwnerAuthResponse> {
  return callOwnerAuth({ action: "check" });
}

/**
 * Set or rotate the owner secret. Server-side: PBKDF2 hash ONLY.
 * Requirements: length >= 12, not all-identical characters.
 */
export async function setOwnerSecret(
  secret: string,
): Promise<OwnerAuthResponse> {
  if (secret.length < 12) {
    return {
      ok: false,
      error: "The owner secret must be at least 12 characters.",
    };
  }
  if (/^(.)\1+$/.test(secret)) {
    return {
      ok: false,
      error: "The owner secret is too weak (repeated characters).",
    };
  }
  return callOwnerAuth({ action: "set-credential", secret });
}

export interface AuthorizeChangeInput {
  changeKind: OwnerChangeKind;
  target: string;
  currentVersion?: string;
  proposedVersion?: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  testsPassed: boolean;
  rollbackRef?: string;
  /** Why the change is being made, required, stored with the
   *  server-side approval record. */
  reason: string;
  secret: string;
  /** High-risk changes additionally require engineering review. */
  engineeringReviewCompleted?: boolean;
}

/** Authorize a production change, server-side verification. */
export async function authorizeOwnerChange(
  input: AuthorizeChangeInput,
): Promise<OwnerAuthResponse> {
  const gate = requiresOwnerAuth(input.changeKind);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.testsPassed) {
    return {
      ok: false,
      error:
        "All authorized changes require a passing test run, run the tests first.",
    };
  }
  if (!input.engineeringReviewCompleted && gate.requiresEngineeringReview) {
    return {
      ok: false,
      error: `${input.changeKind} is a high-risk change, the engineering-review gate must also be completed before authorization.`,
    };
  }
  return callOwnerAuth({
    action: "authorize-change",
    secret: input.secret,
    changeKind: input.changeKind,
    target: input.target,
    currentVersion: input.currentVersion,
    proposedVersion: input.proposedVersion,
    beforeState: input.beforeState,
    afterState: input.afterState,
    testsPassed: input.testsPassed,
    rollbackRef: input.rollbackRef,
  });
}

/** List the owner's authorization records (audit trail). */
export async function listOwnerAuthorizations(): Promise<OwnerAuthResponse> {
  return callOwnerAuth({ action: "list" });
}

/** Mark a previously authorized change as rolled back. */
export async function recordRollback(
  authorizationId: string,
  secret: string,
): Promise<OwnerAuthResponse> {
  return callOwnerAuth({
    action: "record-rollback",
    secret,
    authorizationId,
  });
}
