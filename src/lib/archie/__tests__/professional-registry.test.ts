// =========================================================
// PROFESSIONAL-REGISTRY TESTS (batch 27, fix 116)
// Verification badges are structured truth (unverified can
// never render as verified); authority claims need VERIFIED +
// active + role coverage + regional scope; only a HUMAN can
// mint verification — ARCHIE never can.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  mayClaimAuthority,
  publicBadge,
  recordAccountability,
  ROLE_DOMAIN_AUTHORITY,
  verifyProfessional,
  type ProfessionalProfile,
} from "@/lib/archie/professional-registry";

function profile(over: Partial<ProfessionalProfile> = {}): ProfessionalProfile {
  return {
    id: "prof1",
    role: "STRUCTURAL_ENGINEER",
    display_name: "Ada Obi",
    verification_state: "VERIFIED",
    verified_by: "human-verifier",
    verified_at: "2026-09-01T00:00:00Z",
    credential_refs: ["COREN-12345"],
    regional_scope: ["NG", "GLOBAL"],
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("publicBadge — the only sanctioned display path", () => {
  it("renders verified only for active verified profiles, with the verification date", () => {
    const b = publicBadge(profile());
    expect(b.verified).toBe(true);
    expect(b.detail).toContain("2026-09-01");
  });

  it("never shows an unverified profile as verified", () => {
    expect(
      publicBadge(profile({ verification_state: "PENDING_REVIEW" })).verified,
    ).toBe(false);
    expect(publicBadge(profile({ active: false })).verified).toBe(false); // verified but inactive
    const revoked = publicBadge(profile({ verification_state: "REVOKED" }));
    expect(revoked.verified).toBe(false);
    expect(revoked.label).toContain("revoked");
  });
});

describe("mayClaimAuthority — evidence-based authority only", () => {
  it("allows verified, active, role-covered, region-covered claims", () => {
    const r = mayClaimAuthority(profile(), {
      domain: "structural",
      region: "NG",
    });
    expect(r).toMatchObject({ allowed: true });
  });

  it("refuses unverified/inactive profiles and uncovered domains/regions", () => {
    expect(
      mayClaimAuthority(profile({ active: false }), { domain: "structural" })
        .allowed,
    ).toBe(false);
    expect(mayClaimAuthority(profile(), { domain: "electrical" }).allowed).toBe(
      false,
    );
    expect(
      mayClaimAuthority(profile(), { domain: "structural", region: "KE" })
        .allowed,
    ).toBe(false);
  });

  it("binds role authority to the registry's domain map", () => {
    expect(ROLE_DOMAIN_AUTHORITY.STRUCTURAL_ENGINEER).toContain("foundation");
    expect(ROLE_DOMAIN_AUTHORITY.TRADESPERSON).toEqual([]); // no domain authority
    expect(ROLE_DOMAIN_AUTHORITY.QUANTITY_SURVEYOR).toContain("costing");
  });
});

describe("verifyProfessional — only a human mints verification", () => {
  it("refuses ARCHIE as verifier and empty humans", () => {
    expect(
      verifyProfessional(profile({ verification_state: "PENDING_REVIEW" }), {
        to: "VERIFIED",
        verified_by: "ARCHIE",
        credential_refs: ["x"],
      }).ok,
    ).toBe(false);
    expect(
      verifyProfessional(profile({ verification_state: "PENDING_REVIEW" }), {
        to: "VERIFIED",
        verified_by: "  ",
        credential_refs: ["x"],
      }).ok,
    ).toBe(false);
  });

  it("requires credential references for verification", () => {
    expect(
      verifyProfessional(profile({ verification_state: "PENDING_REVIEW" }), {
        to: "VERIFIED",
        verified_by: "reviewer",
        credential_refs: [],
      }).ok,
    ).toBe(false);
  });

  it("mints verification for a human verifier with credentials, and revocation clears the claim", () => {
    const v = verifyProfessional(
      profile({ verification_state: "PENDING_REVIEW" }),
      {
        to: "VERIFIED",
        verified_by: "reviewer",
        credential_refs: ["COREN-1"],
        now: "2026-09-15T00:00:00Z",
      },
    );
    expect(v.ok).toBe(true);
    expect(v.profile!.verification_state).toBe("VERIFIED");
    expect(v.profile!.verified_at).toBe("2026-09-15T00:00:00Z");
    const r = verifyProfessional(profile(), {
      to: "REVOKED",
      verified_by: "reviewer",
      credential_refs: [],
    });
    expect(r.profile!.verification_state).toBe("REVOKED");
  });

  it("refuses states other than VERIFIED/REVOKED", () => {
    expect(
      verifyProfessional(profile(), {
        to: "PENDING_REVIEW" as never,
        verified_by: "x",
        credential_refs: [],
      }).ok,
    ).toBe(false);
  });
});

describe("recordAccountability", () => {
  it("writes a structured audit entry", () => {
    const e = recordAccountability(
      { id: "prof1" },
      "VERIFY",
      "reviewer",
      "credential check",
      "2026-09-15T00:00:00Z",
    );
    expect(e).toEqual({
      professional_id: "prof1",
      action: "VERIFY",
      actor: "reviewer",
      at: "2026-09-15T00:00:00Z",
      detail: "credential check",
    });
  });
});
