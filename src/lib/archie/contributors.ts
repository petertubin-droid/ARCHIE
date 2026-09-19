// =========================================================
// FRELUX PHASE 8, ARCHIE CONTRIBUTOR PERMISSIONS
//
// Contributor training WITH permissions: identity, provenance,
// review requirements and scope isolation. A DOMAIN_CONTRIBUTOR
// may submit knowledge inside their allowed domains only :
// and every submission is reviewed before promotion. An
// OBSERVER may never submit. ARCHIE_ADMIN may approve.
// =========================================================

import type {
  ArchieContributor,
  ArchieInputType,
  ArchiePipelineState,
} from "./types";

/** Modalities each role may submit. */
const ROLE_INPUTS: Readonly<
  Record<ArchieContributor["role"], ReadonlySet<ArchieInputType>>
> = {
  ARCHIE_ADMIN: new Set<ArchieInputType>([
    "TEXT",
    "IMAGE",
    "PDF_DOCUMENT",
    "SCANNED_TECHNICAL",
    "ENGINEERING_DRAWING",
    "TABLE_CALCULATION",
    "AUDIO_VOICE",
    "VIDEO_DEMONSTRATION",
    "PROJECT_OUTCOME",
    "SOURCE_CODE",
    "WEB_INTELLIGENCE",
  ]),
  DOMAIN_CONTRIBUTOR: new Set<ArchieInputType>([
    "TEXT",
    "IMAGE",
    "PDF_DOCUMENT",
    "SCANNED_TECHNICAL",
    "ENGINEERING_DRAWING",
    "TABLE_CALCULATION",
    "AUDIO_VOICE",
    "VIDEO_DEMONSTRATION",
    "PROJECT_OUTCOME",
  ]),
  OBSERVER: new Set<ArchieInputType>([]),
};

/** May this contributor submit this modality at all? */
export function canSubmitInput(
  contributor: ArchieContributor,
  inputType: ArchieInputType,
): { ok: boolean; error?: string } {
  if (!contributor.active) {
    return {
      ok: false,
      error: `Contributor "${contributor.display_name}" is not active`,
    };
  }
  if (!ROLE_INPUTS[contributor.role].has(inputType)) {
    return {
      ok: false,
      error: `Role ${contributor.role} may not submit ${inputType} inputs`,
    };
  }
  return { ok: true };
}

/** Scope isolation: contributors are bound to allowed_domains.
 *  ARCHIE_ADMIN has the whole registry (no artificial ceiling,
 *  but review still applies); a DOMAIN_CONTRIBUTOR is isolated. */
export function canSubmitDomain(
  contributor: ArchieContributor,
  domain: string,
): { ok: boolean; error?: string } {
  if (contributor.role === "ARCHIE_ADMIN") return { ok: true };
  if (!contributor.allowed_domains.includes(domain)) {
    return {
      ok: false,
      error: `Scope isolation: "${contributor.display_name}" may not submit to domain "${domain}"`,
    };
  }
  return { ok: true };
}

/** Every non-admin submission is reviewed. Admins reviewing
 *  their own submission is allowed in the foundation (single
 *  admin operator), but the engineering-review bar still
 *  applies to high-risk domains. */
export function requiresReview(contributor: ArchieContributor): boolean {
  return contributor.role !== "ARCHIE_ADMIN" || contributor.must_review;
}

/** Who may operate on ingestion states. */
export function canManageIngestion(
  contributor: ArchieContributor,
  action: "CREATE" | "REVIEW" | "APPROVE" | "REJECT",
): { ok: boolean; error?: string } {
  if (!contributor.active) {
    return { ok: false, error: "Contributor is not active" };
  }
  switch (action) {
    case "CREATE":
      return { ok: true };
    case "REVIEW":
    case "APPROVE":
    case "REJECT":
      if (contributor.role !== "ARCHIE_ADMIN") {
        return {
          ok: false,
          error: `Role ${contributor.role} may not ${action.toLowerCase()} ingestions`,
        };
      }
      return { ok: true };
  }
}

/** Terminal states, no further pipeline movement allowed. */
const TERMINAL: ReadonlySet<ArchiePipelineState> = new Set([
  "APPROVED",
  "REJECTED",
]);

export function isTerminalState(state: ArchiePipelineState): boolean {
  return TERMINAL.has(state);
}
