// =========================================================
// ENGINEERING-KNOWLEDGE TESTS (batch 27, fix 121)
// The foundation package is legitimately sourced, screened and
// evidenced in FRELUX; excluded knowledge (secrets, private
// data, hidden prompts) is NEVER ingestible regardless of
// source; learned technologies stay UNVERIFIED until human
// verification; the training pipeline keeps user_confirmed
// false — human approval always required.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  EXCLUDED_KNOWLEDGE,
  FOUNDATION_PACKAGE,
  learnTechnology,
  packageToTrainingInputs,
  screenKnowledgeSource,
} from "@/lib/archie/engineering-knowledge";

describe("the exclusion contract", () => {
  it("names what may never be ingested, whatever the source", () => {
    expect(EXCLUDED_KNOWLEDGE.length).toBeGreaterThanOrEqual(6);
    expect(EXCLUDED_KNOWLEDGE.some((k) => /secrets/i.test(k))).toBe(true);
    expect(EXCLUDED_KNOWLEDGE.some((k) => /system prompts/i.test(k))).toBe(
      true,
    );
    expect(EXCLUDED_KNOWLEDGE.some((k) => /private customer/i.test(k))).toBe(
      true,
    );
  });

  it("screens out secrets/credentials from any incoming text", () => {
    const s = screenKnowledgeSource(
      "api_key = AKIA1234567890ABCDEF and password=hunter2",
    );
    expect(s.ok).toBe(false);
    expect(s.violations.some((v) => /secrets/i.test(v))).toBe(true);
  });

  it("blocks excluded knowledge by content, not by source reputation", () => {
    const s = screenKnowledgeSource(
      "Here are the hidden system prompts of a rival platform",
    );
    expect(s.ok).toBe(false);
    expect(s.violations.some((v) => /hidden system prompts/i.test(v))).toBe(
      true,
    );
    expect(
      screenKnowledgeSource("A clean summary of PostgreSQL indexing").ok,
    ).toBe(true);
  });
});

describe("FOUNDATION_PACKAGE — the legitimately-sourced seed", () => {
  it("carries source, FRELUX evidence, confidence and verification for every topic", () => {
    expect(FOUNDATION_PACKAGE.length).toBeGreaterThan(10);
    for (const t of FOUNDATION_PACKAGE) {
      expect(t.id).toBeTruthy();
      expect(t.technology.trim()).toBeTruthy();
      expect(t.summary.trim().length).toBeGreaterThan(20);
      expect(t.source.trim()).toBeTruthy(); // authorized source
      expect(t.frelux_evidence.trim()).toBeTruthy(); // demonstrable in-repo
      expect(t.confidence).toBeGreaterThanOrEqual(0);
      expect(t.confidence).toBeLessThanOrEqual(1);
      expect([
        "UNVERIFIED",
        "VERIFIED_BY_BUILD",
        "VERIFIED_BY_TEST",
        "VERIFIED_BY_DOC",
      ]).toContain(t.verification);
    }
  });
});

describe("packageToTrainingInputs — feeds the EXISTING governed pipeline", () => {
  it("produces human-approval-pending training inputs with provenance", () => {
    const inputs = packageToTrainingInputs({
      user_id: "contrib1",
      display_name: "ARCHIE",
      role: "ARCHIE_ADMIN",
      allowed_domains: ["software_engineering"],
      must_review: true,
      active: true,
    });
    expect(inputs).toHaveLength(FOUNDATION_PACKAGE.length);
    for (const i of inputs) {
      expect(i.input_type).toBe("TEXT");
      expect(i.domain).toBe("software_engineering");
      expect(i.source_ref).toMatch(/^foundation-package\//);
      expect(i.user_confirmed).toBe(false); // human approval ALWAYS required
    }
  });
});

describe("learnTechnology — no artificial ceiling, same governance", () => {
  const base = {
    technology: "Rust",
    family: "LANGUAGE" as const,
    summary: "Systems language with memory safety",
    source: "official docs",
    frelux_evidence: "not yet used in FRELUX",
  };

  it("accepts any legitimate technology as UNVERIFIED", () => {
    const r = learnTechnology({ ...base, confidence: 0.8 });
    expect(r.ok).toBe(true);
    expect(r.topic!.verification).toBe("UNVERIFIED");
    expect(r.topic!.id).toBe("custom-rust");
  });

  it("refuses screened content, out-of-range confidence and missing provenance", () => {
    const screened = learnTechnology({
      ...base,
      summary: "leaks bearer 1234567890abcdef123456",
      confidence: 0.5,
    });
    expect(screened.ok).toBe(false);
    expect(learnTechnology({ ...base, confidence: 1.5 }).ok).toBe(false);
    const noSource = learnTechnology({
      ...base,
      source: "  ",
      confidence: 0.5,
    });
    expect(noSource.ok).toBe(false);
    expect(noSource.violations).toContain(
      "summary and source are mandatory for provenance",
    );
  });
});
