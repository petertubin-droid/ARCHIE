// =========================================================
// FRELUX PHASE 8 P3, PROFESSIONAL ECOSYSTEM REGISTRY
//
// Readiness for future connections with architects, engineers,
// quantity surveyors, contractors, tradespeople, suppliers,
// inspectors and property professionals.
//
// Core discipline, enforced in code: AN UNVERIFIED PROFESSIONAL
// CAN NEVER BE REPRESENTED AS VERIFIED. The badge object carries
// a hard boolean, not a string the UI could render loosely.
//
// Every profile carries: identity, verification state (with
// verifier provenance), regional scope, permissions, and an
// accountability audit trail. ARCHIE may reason ABOUT a
// professional's public data but may never mint verification.
// =========================================================

export type ProfessionalRole =
  | "ARCHITECT"
  | "STRUCTURAL_ENGINEER"
  | "CIVIL_ENGINEER"
  | "ELECTRICAL_ENGINEER"
  | "QUANTITY_SURVEYOR"
  | "CONTRACTOR"
  | "TRADESPERSON"
  | "SUPPLIER"
  | "INSPECTOR"
  | "PROPERTY_PROFESSIONAL";

export type VerificationState =
  | "UNVERIFIED"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REVOKED";

export interface ProfessionalProfile {
  id: string;
  role: ProfessionalRole;
  display_name: string;
  verification_state: VerificationState;
  /** Who verified and when, required for VERIFIED. */
  verified_by?: string | null;
  verified_at?: string | null;
  /** Credential references (license no., association id…) :
   *  references only, never the credentials themselves. */
  credential_refs: string[];
  /** Regional scope this professional may act in. */
  regional_scope: string[];
  active: boolean;
  created_at: string;
}

export interface VerificationBadge {
  /** Structured truth, the UI renders this boolean, and it is
   *  impossible for an unverified profile to yield true. */
  verified: boolean;
  /** Short label. For non-verified profiles it NEVER contains
   *  the word "Verified" on its own. */
  label: string;
  detail: string;
}

/** Public badge, the ONLY sanctioned way to display a
 *  professional's verification status. */
export function publicBadge(p: ProfessionalProfile): VerificationBadge {
  if (p.verification_state === "VERIFIED" && p.active) {
    return {
      verified: true,
      label: "Verified",
      detail: `Credentials verified by FRELUX${p.verified_at ? ` on ${p.verified_at.slice(0, 10)}` : ""}`,
    };
  }
  if (p.verification_state === "REVOKED") {
    return {
      verified: false,
      label: "Verification revoked",
      detail: "This profile's verification has been revoked",
    };
  }
  if (p.verification_state === "PENDING_REVIEW") {
    return {
      verified: false,
      label: "Unverified: pending review",
      detail: "This profile has not completed FRELUX verification",
    };
  }
  return {
    verified: false,
    label: "Unverified",
    detail: "This profile has not been verified by FRELUX",
  };
}

/** Which domains each professional role may claim authority in. */
export const ROLE_DOMAIN_AUTHORITY: Readonly<
  Record<ProfessionalRole, readonly string[]>
> = {
  ARCHITECT: ["architecture"],
  STRUCTURAL_ENGINEER: ["structural", "foundation", "safety"],
  CIVIL_ENGINEER: ["construction", "structural", "foundation"],
  ELECTRICAL_ENGINEER: ["electrical"],
  QUANTITY_SURVEYOR: ["quantity_surveying", "costing", "procurement"],
  CONTRACTOR: ["construction", "project_planning"],
  TRADESPERSON: [],
  SUPPLIER: ["procurement"],
  INSPECTOR: ["safety", "regional_practices"],
  PROPERTY_PROFESSIONAL: ["property"],
};

/** The result of asking whether a professional may claim
 *  authority in a domain/region. Always evidence-based. */
export type AuthorityClaim =
  | { allowed: true; basis: string }
  | { allowed: false; reason: string };

/** May this professional be presented as an authority for a
 *  domain and region? Requires: VERIFIED + active + role covers
 *  the domain + region within their verified regional scope. */
export function mayClaimAuthority(
  p: ProfessionalProfile,
  args: { domain: string; region?: string | null },
): AuthorityClaim {
  if (p.verification_state !== "VERIFIED" || !p.active) {
    return {
      allowed: false,
      reason: "Profile is not an active verified professional",
    };
  }
  const domains = ROLE_DOMAIN_AUTHORITY[p.role];
  if (!domains.includes(args.domain)) {
    return {
      allowed: false,
      reason: `Role ${p.role} does not cover domain "${args.domain}"`,
    };
  }
  if (!p.regional_scope.includes(args.region ?? "GLOBAL")) {
    return {
      allowed: false,
      reason: `Region "${args.region ?? "GLOBAL"}" is outside this professional's verified regional scope`,
    };
  }
  return {
    allowed: true,
    basis: `Verified ${p.role} with regional scope covering ${args.region ?? "GLOBAL"}`,
  };
}

/** Verify (or revoke) a professional. Only a HUMAN verifier can
 *  mint verification, ARCHIE passes `verified_by: "ARCHIE"` at
 *  its peril; the function refuses it explicitly. */
export function verifyProfessional(
  p: ProfessionalProfile,
  verification: {
    to: VerificationState;
    verified_by: string;
    credential_refs: string[];
    now?: string;
  },
): { ok: boolean; error?: string; profile?: ProfessionalProfile } {
  if (verification.to !== "VERIFIED" && verification.to !== "REVOKED") {
    return {
      ok: false,
      error: "Only VERIFIED or REVOKED may be set through this path",
    };
  }
  if (verification.to === "VERIFIED") {
    if (verification.verified_by === "ARCHIE") {
      return {
        ok: false,
        error: "ARCHIE may never mint professional verification",
      };
    }
    if (verification.verified_by.trim() === "") {
      return { ok: false, error: "A human verifier is required" };
    }
    if (verification.credential_refs.length === 0) {
      return {
        ok: false,
        error: "At least one credential reference is required for verification",
      };
    }
  }
  return {
    ok: true,
    profile: {
      ...p,
      verification_state: verification.to,
      verified_by: verification.verified_by,
      verified_at: verification.to === "VERIFIED"
        ? (verification.now ?? new Date().toISOString())
        : p.verified_at,
      credential_refs:
        verification.to === "VERIFIED"
          ? verification.credential_refs
          : p.credential_refs,
    },
  };
}

/** Accountability: a structured audit entry for any
 *  professional-related action ARCHIE or the system takes. */
export interface AccountabilityEntry {
  professional_id: string;
  action: string;
  actor: string;
  at: string;
  detail: string;
}

export function recordAccountability(
  p: Pick<ProfessionalProfile, "id">,
  action: string,
  actor: string,
  detail: string,
  now = new Date().toISOString(),
): AccountabilityEntry {
  return {
    professional_id: p.id,
    action,
    actor,
    at: now,
    detail,
  };
}
