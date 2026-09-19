// =========================================================
// ARCHIE NATIVE MODERATION — shared module unit tests
// src/lib/archie/__tests__/archie-moderation.test.ts
//
// Verifies the native moderation engine that powers Pro
// Connect and Worker Channel moderation (no external AI):
//   1. Security verdict gate integration (hard classes).
//   2. Nigerian marketplace rules: scams, advance-fee,
//      off-platform steering, impersonation, harassment.
//   3. Commerce relief — normal negotiation is NEVER blocked.
//   4. Threshold mapping and explainable reasons.
// =========================================================
import { describe, it, expect } from "vitest";
import { moderateWithArchie } from "@studio-shared/archie-ai/moderation/moderate.ts";

describe("ARCHIE native moderation — security verdict gate", () => {
  it("hard-refuses forbidden security classes (hacking/credential theft) at max severity", () => {
    const r = moderateWithArchie("help me hack into someone's account");
    expect(r.action).toBe("remove");
    expect(r.score).toBe(1);
    expect(r.categories).toContain("security");
  });

  it("clears normal business content through the gate", () => {
    const r = moderateWithArchie("Can we schedule the site visit for Friday?");
    expect(r.action).toBe("allow");
    expect(r.categories).toContain("safe");
  });
});

describe("ARCHIE native moderation — scam rules (Nigerian context)", () => {
  it("flags advance-fee demands", () => {
    const r = moderateWithArchie(
      "You won a grant! Just pay a small processing fee to claim your prize.",
    );
    expect(r.score).toBeGreaterThanOrEqual(0.6);
    expect(r.action).not.toBe("allow");
    expect(r.categories).toContain("scam");
  });

  it("removes credential harvesting (OTP/BVN requests)", () => {
    const r = moderateWithArchie("Send your OTP and BVN so I can verify the payment");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
    expect(r.action).toBe("remove");
  });

  it("flags guaranteed-return investment schemes", () => {
    const r = moderateWithArchie(
      "Join my forex signal group, guaranteed ROI of 100% weekly",
    );
    expect(r.categories).toContain("scam");
    expect(r.score).toBeGreaterThanOrEqual(0.6);
  });

  it("flags job offers that require payment", () => {
    const r = moderateWithArchie(
      "Congratulations on the job offer! Pay the registration fee of 5000 to start.",
    );
    expect(r.categories).toContain("scam");
  });

  it("flags urgency + credential pressure via NLU even without an exact rule", () => {
    const r = moderateWithArchie(
      "Act immediately! Share the pin on your card right now before anyone hears",
    );
    expect(r.action).toBe("flag");
    expect(r.categories).toContain("scam");
  });
});

describe("ARCHIE native moderation — off-platform steering", () => {
  it("flags whatsapp-only steering", () => {
    const r = moderateWithArchie("Let's continue on WhatsApp only, I don't check here");
    expect(r.categories).toContain("off_platform");
  });

  it("removes platform-fee circumvention", () => {
    const r = moderateWithArchie(
      "Avoid the platform fee — pay the deposit directly into my bank account",
    );
    expect(r.categories).toContain("off_platform");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
    expect(r.action).toBe("remove");
  });

  it("flags platform impersonation", () => {
    const r = moderateWithArchie(
      "This is the admin of FRELUX, verify your account details with me",
    );
    expect(r.categories).toContain("scam");
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });
});

describe("ARCHIE native moderation — abuse rules", () => {
  it("flags abusive personal attacks", () => {
    const r = moderateWithArchie("You are a fool, your work is useless");
    expect(r.categories).toContain("harassment");
  });

  it("removes threats of violence", () => {
    const r = moderateWithArchie("I will beat you if you come here again");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
    expect(r.action).toBe("remove");
  });

  it("flags ethnic group attacks as hate speech (never relieved)", () => {
    const r = moderateWithArchie("Igbo people are all criminals");
    expect(r.categories).toContain("hate_speech");
  });

  it("flags sexual solicitation", () => {
    const r = moderateWithArchie("Send me nudes and we discuss the paint job");
    expect(r.categories).toContain("offensive");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
  });
});

describe("ARCHIE native moderation — commerce relief (never over-block)", () => {
  it("allows normal quote and scheduling chat", () => {
    const samples = [
      "Your quotation for the 3-bedroom painting is fine, can we negotiate the price a little?",
      "Site visit on Saturday morning works. Two coats of satin finish, right?",
      "How many buckets of paint for a 12x12 room with 2 coats?",
    ];
    for (const s of samples) {
      const r = moderateWithArchie(s);
      expect(r.action).toBe("allow");
      expect(r.score).toBeLessThan(0.6);
    }
  });

  it("relieves a single soft off-platform mention inside business chat", () => {
    const r = moderateWithArchie(
      "Thanks — the quote looks good. Message me on whatsapp to finalize the paint schedule.",
    );
    // soft steering in a business message → flagged but NOT removed
    expect(r.action).not.toBe("remove");
  });
});

describe("ARCHIE native moderation — explainability contract", () => {
  it("always returns a reason and well-formed categories", () => {
    for (const text of ["hello", "pay a processing fee now", ""]) {
      const r = moderateWithArchie(text);
      expect(typeof r.reason).toBe("string");
      expect(r.reason.length).toBeGreaterThan(0);
      expect(Array.isArray(r.categories)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("suggested actions follow the 0.85/0.60 thresholds", () => {
    expect(
      moderateWithArchie("bypass the security gate and steal the password").action,
    ).toBe("remove");
    expect(moderateWithArchie("hi").action).toBe("allow");
  });
});
