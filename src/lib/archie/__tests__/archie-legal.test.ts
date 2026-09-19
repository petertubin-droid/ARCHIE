// =========================================================
// ARCHIE LEGAL, PRIVACY, IP & GOVERNANCE — CORPUS TESTS
//
// © 2026 FRENZY. All rights reserved.
//
// Verifies the legal corpus is real and honest: all 10
// documents exist, cover their mandated topics, carry the
// FRENZY copyright, make NO fabricated legal claims, the
// jurisdiction is configurable, governance encodes Owner
// Authority, and the document lifecycle enforces
// approval-gated publication.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  SEED_LEGAL_DOCUMENTS,
  GOVERNANCE_RULES,
  LEGAL_DOC_KEYS,
  LEGAL_TRANSITIONS,
  canTransition,
  JURISDICTION_CONFIG,
  COPYRIGHT_NOTICE,
  PWA_DISCLOSURE_SUMMARY,
} from "@studio-shared/archie-ai/legal/documents.ts";

const byKey = (key: string) =>
  SEED_LEGAL_DOCUMENTS.find((d) => d.key === key)?.body ?? "";

describe("ARCHIE legal corpus — completeness", () => {
  it("contains exactly the 10 managed documents", () => {
    expect(SEED_LEGAL_DOCUMENTS).toHaveLength(10);
    expect(LEGAL_DOC_KEYS).toHaveLength(10);
    expect(SEED_LEGAL_DOCUMENTS.map((d) => d.key).sort()).toEqual(
      [...LEGAL_DOC_KEYS].sort(),
    );
  });

  it("has unique keys, titles and non-empty bodies", () => {
    const keys = SEED_LEGAL_DOCUMENTS.map((d) => d.key);
    const titles = SEED_LEGAL_DOCUMENTS.map((d) => d.title);
    expect(new Set(keys).size).toBe(10);
    expect(new Set(titles).size).toBe(10);
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      expect(doc.body.length).toBeGreaterThan(200);
      expect(doc.title).toBeTruthy();
    }
  });

  it("carries the FRENZY copyright notice in every document", () => {
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      expect(doc.body).toContain(COPYRIGHT_NOTICE);
    }
    expect(COPYRIGHT_NOTICE).toBe("© 2026 FRENZY. All rights reserved.");
  });

  it("never claims ownership of third-party material", () => {
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      expect(doc.body).toMatch(/third[- ]party/i);
    }
    expect(byKey("ip_notice")).toMatch(/do(es)? not claim ownership/i);
  });
});

describe("ARCHIE legal corpus — mandated coverage", () => {
  it("Terms of Service covers every required section", () => {
    const tos = byKey("terms_of_service");
    for (const section of [
      "Service description",
      "Accounts",
      "AI limitations",
      "Memory and personalization",
      "Web research",
      "Coding capabilities",
      "Connected devices",
      "Connected accounts",
      "Automation",
      "Cybersecurity",
      "Third-party integrations",
      "Prohibited use",
      "Intellectual property",
      "Availability",
      "Suspension and termination",
      "Liability limitations",
      "Disputes",
      "Changes",
    ]) {
      expect(tos).toContain(section);
    }
    // Jurisdiction-specific language is configurable, not hardcoded.
    expect(tos).toContain("[GOVERNING LAW");
  });

  it("Privacy Policy covers every data category", () => {
    const privacy = byKey("privacy_policy");
    for (const item of [
      "Account information",
      "Conversations",
      "Memory",
      "Voice/audio",
      "Device information",
      "Authentication information",
      "Connected-account information",
      "Usage and activity data",
      "Diagnostics",
      "Security information",
      "Payment/subscription information",
      "Web research interactions",
      "Preferences and personalization",
    ]) {
      expect(privacy).toContain(item);
    }
    // Nigerian data protection is configurable, not asserted as a registration.
    expect(privacy).toContain("Nigeria Data Protection");
  });

  it("Memory & Data Rights Policy lists every real control", () => {
    const rights = byKey("memory_data_rights_policy");
    for (const control of [
      "View",
      "Search",
      "Correct",
      "Delete individual memories",
      "Delete categories",
      "Clear conversation memory",
      "Export",
      "Request account/data deletion",
      "Control memory retention",
      "Control personalization",
    ]) {
      expect(rights).toContain(control);
    }
    // Isolation guarantees are explicit.
    expect(rights).toMatch(/never leaks into another user's account/i);
    expect(rights).toMatch(/separately from ordinary user data/i);
  });

  it("Connected Device Policy requires explicit authorization", () => {
    const policy = byKey("connected_device_account_policy");
    expect(policy).toContain("Explicit authorization required");
    expect(policy).toContain("scoped");
    expect(policy).toContain("revoked");
    expect(policy).toContain("logged");
    expect(policy).toContain("confirmation");
    expect(policy).toMatch(/cannot bypass passwords, MFA/i);
    // Nearby devices are NOT auto-authorized.
    expect(policy).toMatch(/NOT automatically authorized/i);
  });

  it("AI Disclosure states AI transparency honestly", () => {
    const d = byKey("ai_disclosure");
    for (const point of [
      "artificial intelligence system",
      "can make mistakes",
      "verification",
      "confidence-scored",
      "not automatically treated as truth",
      "human verification",
      "Owner authorization",
    ]) {
      expect(d.toLowerCase()).toContain(point.toLowerCase());
    }
    expect(d).toContain("does not claim consciousness");
    expect(PWA_DISCLOSURE_SUMMARY).toContain("ARCHIE is an AI");
  });

  it("Security policy limits offensive execution to authorized systems", () => {
    const s = byKey("security_responsible_use_policy");
    expect(s).toMatch(/limited to/i);
    expect(s).toMatch(/controlled laboratory/i);
    expect(s).toMatch(/CTF/i);
    expect(s).toMatch(/explicit written permission/i);
    expect(s).toMatch(/cannot grant itself permissions/i);
  });

  it("Cookie policy discloses real storage use without inventing tracking", () => {
    const c = byKey("cookie_policy");
    expect(c).toContain("Authentication storage");
    expect(c).toContain("PWA cache");
    expect(c).toMatch(/does not implement advertising or cross-site tracking/i);
    expect(c).toMatch(/is NEVER cached/i);
  });

  it("Third-party disclosure separates ARCHIE from third parties", () => {
    const t = byKey("third_party_disclosure");
    expect(t).toMatch(/does not control third-party services/i);
    for (const cat of [
      "APIs and web services",
      "Cloud infrastructure",
      "AI providers",
      "Authentication providers",
      "Payment providers",
      "Social platforms",
      "Device platforms",
      "Open-source software",
    ]) {
      expect(t).toContain(cat);
    }
  });

  it("every document disclaims legal advice", () => {
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      expect(doc.body).toContain("not legal advice");
    }
  });
});

describe("ARCHIE legal corpus — no fabricated legal claims", () => {
  const FABRICATIONS = [
    "is a registered trademark",
    "is a registered company",
    "certified by",
    "ISO certified",
    "GDPR certified",
    "licensed by the Nigerian government",
    "approved by the regulator",
    "patent pending",
    "patented",
  ];

  it("contains no fabricated registrations, licences or certifications", () => {
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      const lower = doc.body.toLowerCase();
      for (const claim of FABRICATIONS) {
        expect(lower).not.toContain(claim.toLowerCase());
      }
    }
  });

  it("does not imply control over third-party services", () => {
    for (const doc of SEED_LEGAL_DOCUMENTS) {
      expect(doc.body).not.toMatch(
        /controls? (Google|OpenAI|Anthropic|Stripe)/i,
      );
    }
  });

  it("keeps jurisdiction configurable for counsel review", () => {
    expect(JURISDICTION_CONFIG.primaryJurisdiction).toBe("Nigeria");
    expect(JURISDICTION_CONFIG.governingLawPlaceholder).toMatch(
      /^\[GOVERNING LAW/,
    );
    expect(JURISDICTION_CONFIG.applicableFramework).toContain(
      "Nigeria Data Protection",
    );
  });
});

describe("ARCHIE governance — Owner Authority model", () => {
  it("encodes exactly the owner-directed rule set", () => {
    const permitted = GOVERNANCE_RULES.filter(
      (r) => r.category === "permitted",
    );
    const prohibited = GOVERNANCE_RULES.filter(
      (r) => r.category === "prohibited",
    );
    const authority = GOVERNANCE_RULES.filter(
      (r) => r.category === "authority",
    );
    expect(permitted.map((r) => r.rule_key)).toEqual([
      "learn",
      "research",
      "analyze",
      "plan",
      "propose",
      "code_sandbox",
      "test",
      "identify_vulnerabilities",
      "authorized_operations",
    ]);
    expect(prohibited.map((r) => r.rule_key)).toEqual([
      "no_self_permission",
      "no_archie_prod_changes",
      "no_frelux_prod_changes",
      "no_deploy",
      "no_architecture_changes",
      "no_critical_config",
      "no_security_bypass",
      "no_owner_override",
    ]);
    expect(authority.map((r) => r.rule_key)).toEqual(["owner_final_authority"]);
  });

  it("preserves the change pipeline and Owner final authority", () => {
    const final = GOVERNANCE_RULES.find(
      (r) => r.rule_key === "owner_final_authority",
    );
    expect(final?.statement).toMatch(/change pipeline/i);
    expect(final?.statement).toMatch(/final authority/i);
  });
});

describe("ARCHIE legal document lifecycle", () => {
  it("requires draft → approve → publish with archive-on-republish", () => {
    expect(LEGAL_TRANSITIONS.draft).toEqual(["approved"]);
    expect(LEGAL_TRANSITIONS.approved).toEqual(["published"]);
    expect(LEGAL_TRANSITIONS.published).toEqual(["archived"]);
    expect(LEGAL_TRANSITIONS.archived).toEqual([]);
  });

  it("rejects invalid transitions (no publish without approval)", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
    expect(canTransition("published", "published")).toBe(false);
    expect(canTransition("archived", "published")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
  });
});
