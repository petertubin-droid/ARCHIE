// =========================================================
// ARCHIE EVOLUTION — LANGUAGE LEARNING MODULE (§9-§13)
//
// The contract under test:
//   * Language profiles are registered or discovered, never
//     invented as CONFIRMED without evidence.
//   * Knowledge entries: no evidence, no memory (§11). Same
//     key+region conflicts never blind-overwrite — verified
//     knowledge is preserved, contradicting claims go to
//     NEEDS_REVIEW.
//   * CONFIRMED requires the confidence threshold AND two
//     independent source types, or owner-provided evidence.
//   * Confidence is a weighted mean of AVAILABLE categories;
//     unknown is null, never zero.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assessEvidenceConfidence,
  clampUnit,
  computeLanguageConfidence,
  computeOverallConfidence,
  createLanguageProfile,
  meetsLearnedBar,
  mayTransitionValidation,
  promoteRegistryStatus,
  upsertLanguageKnowledge,
  validateEntry,
} from "@/lib/archie/evolution/language";
import type {
  LanguageEntry,
  LanguageEvidence,
  LanguageProfile,
} from "@/lib/archie/evolution/types";

const NOW = "2026-09-16T00:00:00.000Z";

function profile(over: Partial<LanguageProfile> = {}): LanguageProfile {
  return {
    id: "prof-1",
    name: "Test Language",
    nativeName: "Testish",
    isoCode: "tst",
    altNames: [],
    family: null,
    writingSystem: [],
    regions: [],
    dialects: [],
    registryStatus: "discovered",
    confidence: null,
    verificationStatus: "DISCOVERED",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function evidence(
  sourceType: LanguageEvidence["sourceType"],
  reliability: number,
): Omit<LanguageEvidence, "id" | "entryId" | "createdAt"> {
  return {
    source: "test-source",
    sourceType,
    reliability,
    content: { note: "test evidence" },
  };
}

/** Full evidence rows for validation-grade functions. */
function fullEvidence(
  sourceType: LanguageEvidence["sourceType"],
  reliability: number,
  n: number,
): LanguageEvidence {
  return {
    id: `ev-${n}`,
    entryId: "e",
    source: "test-source",
    sourceType,
    reliability,
    content: { note: "test evidence" },
    createdAt: NOW,
  };
}

describe("validation state machine (§9)", () => {
  it("follows the legal pipeline DISCOVERED → CONFIRMED", () => {
    expect(mayTransitionValidation("DISCOVERED", "LEARNING")).toBe(true);
    expect(mayTransitionValidation("LEARNING", "VALIDATING")).toBe(true);
    expect(mayTransitionValidation("VALIDATING", "CONFIRMED")).toBe(true);
  });

  it("forbids shortcuts straight to CONFIRMED", () => {
    expect(mayTransitionValidation("DISCOVERED", "CONFIRMED")).toBe(false);
    expect(mayTransitionValidation("LEARNING", "CONFIRMED")).toBe(false);
  });

  it("makes REJECTED terminal and lets new evidence re-open CONFIRMED", () => {
    expect(mayTransitionValidation("REJECTED", "CONFIRMED")).toBe(false);
    expect(mayTransitionValidation("REJECTED", "LEARNING")).toBe(false);
    // Contradictory evidence re-opens a confirmed entry for review.
    expect(mayTransitionValidation("CONFIRMED", "NEEDS_REVIEW")).toBe(true);
    // But a confirmed entry is never silently demoted to REJECTED.
    expect(mayTransitionValidation("CONFIRMED", "REJECTED")).toBe(false);
  });
});

describe("confidence (§11)", () => {
  it("clamps to the unit interval", () => {
    expect(clampUnit(-5)).toBe(0);
    expect(clampUnit(1.7)).toBe(1);
    expect(clampUnit(0.4)).toBe(0.4);
  });

  it("returns null (UNKNOWN) when no category is available — never 0", () => {
    expect(computeOverallConfidence({})).toBeNull();
  });

  it("weights vocabulary above dialect", () => {
    const w = computeOverallConfidence({ vocabulary: 1, dialect: 0 });
    expect(w).not.toBeNull();
    expect(w!).toBeCloseTo(1.2 / 1.8, 5); // weights 1.2 vs 0.6
  });

  it("scores evidence: 2+ independent source types corroborate", () => {
    const one = assessEvidenceConfidence([
      fullEvidence("frelux_dictionary", 0.9, 1),
      fullEvidence("frelux_dictionary", 0.9, 2),
    ]);
    const two = assessEvidenceConfidence([
      fullEvidence("frelux_dictionary", 0.9, 3),
      fullEvidence("external_reference", 0.9, 4),
    ]);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(two!).toBeGreaterThan(one!); // 0.9*1 vs 0.9*0.85
    expect(assessEvidenceConfidence([])).toBeNull();
  });
});

describe("profiles (§10, §13)", () => {
  it("requires a name and a native name — no anonymous languages", () => {
    const res = createLanguageProfile(
      { name: "  ", nativeName: "X", now: NOW },
      "p1",
    );
    expect(res.ok).toBe(false);
  });

  it("registers FRELUX dictionary languages as CONFIRMED, never discovered", () => {
    const res = createLanguageProfile(
      {
        name: "Yoruba",
        nativeName: "Yorùbá",
        isFreluxRegistered: true,
        now: NOW,
      },
      "p2",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.registryStatus).toBe("frelux_registered");
      expect(res.profile.verificationStatus).toBe("CONFIRMED");
    }
  });

  it("never overwrites a frelux_registered profile via promotion", () => {
    const registered = profile({ registryStatus: "frelux_registered" });
    const out = promoteRegistryStatus(registered, NOW);
    expect(out.updatedAt).toBe(registered.updatedAt); // untouched
  });

  it("promotes discovered → currently_learning only after real learning", () => {
    const stillNew = promoteRegistryStatus(
      profile({ verificationStatus: "DISCOVERED" }),
      NOW,
    );
    expect(stillNew.registryStatus).toBe("discovered");
    const learned = promoteRegistryStatus(
      profile({ verificationStatus: "LEARNING" }),
      NOW,
    );
    expect(learned.registryStatus).toBe("currently_learning");
  });

  it("ARCHIE LEARNED needs vocabulary AND translation at the bar", () => {
    expect(meetsLearnedBar({ vocabulary: 0.9, translation: 0.9 }, 0.8)).toBe(
      true,
    );
    expect(meetsLearnedBar({ vocabulary: 0.9 }, 0.8)).toBe(false); // missing translation ≠ passed
    expect(meetsLearnedBar({ vocabulary: 0.9, translation: 0.5 }, 0.8)).toBe(
      false,
    );
  });
});

describe("knowledge entries (§12)", () => {
  const baseInput = {
    profile: profile(),
    kind: "vocabulary" as const,
    key: "Hello",
    region: null,
    now: NOW,
  };

  it("refuses knowledge without evidence — no evidence, no memory", () => {
    const res = upsertLanguageKnowledge(
      { ...baseInput, payload: { en: "hello" }, evidence: [] },
      [],
      "e1",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/evidence/i);
  });

  it("refuses empty keys and empty payloads", () => {
    expect(
      upsertLanguageKnowledge(
        {
          ...baseInput,
          key: "  ",
          payload: { a: 1 },
          evidence: [evidence("frelux_dictionary", 0.8)],
        },
        [],
        "e2",
      ).ok,
    ).toBe(false);
    expect(
      upsertLanguageKnowledge(
        {
          ...baseInput,
          key: "k",
          payload: {},
          evidence: [evidence("frelux_dictionary", 0.8)],
        },
        [],
        "e3",
      ).ok,
    ).toBe(false);
  });

  it("creates new knowledge as LEARNING, never CONFIRMED", () => {
    const res = upsertLanguageKnowledge(
      {
        ...baseInput,
        payload: { en: "hello" },
        evidence: [evidence("frelux_dictionary", 0.8)],
      },
      [],
      "e4",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome).toBe("created");
      expect(res.entry.validationState).toBe("LEARNING");
      expect(res.entry.key).toBe("hello"); // case-folded
    }
  });

  it("treats an identical resubmission as an idempotent no-op", () => {
    const payload = { en: "hello" };
    const first = upsertLanguageKnowledge(
      { ...baseInput, payload, evidence: [evidence("frelux_dictionary", 0.8)] },
      [],
      "e5",
    );
    if (!first.ok) throw new Error("setup failed");
    const dup = upsertLanguageKnowledge(
      { ...baseInput, payload, evidence: [evidence("frelux_dictionary", 0.8)] },
      [first.entry],
      "e6",
    );
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.note).toMatch(/no change/i);
  });

  it("PRESERVES confirmed knowledge against weaker contradictions (NEEDS_REVIEW)", () => {
    const existing: LanguageEntry = {
      id: "old",
      profileId: "prof-1",
      kind: "vocabulary",
      key: "hello",
      payload: { en: "hello" },
      region: null,
      confidence: 0.95,
      validationState: "CONFIRMED",
      history: [],
      version: 3,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = upsertLanguageKnowledge(
      {
        ...baseInput,
        payload: { en: "goodbye" }, // contradicts the confirmed entry
        evidence: [evidence("ai_inference", 0.4)], // weaker evidence
      },
      [existing],
      "e7",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome).toBe("needs_review");
      expect(res.entry.validationState).toBe("NEEDS_REVIEW");
      expect(res.note).toMatch(/PRESERVED/i);
      // The confirmed knowledge itself is untouched.
      expect(existing.payload).toEqual({ en: "hello" });
      expect(existing.validationState).toBe("CONFIRMED");
    }
  });

  it("updates with version history when incoming evidence is stronger", () => {
    const existing: LanguageEntry = {
      id: "old",
      profileId: "prof-1",
      kind: "vocabulary",
      key: "hello",
      payload: { en: "hello" },
      region: null,
      confidence: 0.3,
      validationState: "LEARNING",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = upsertLanguageKnowledge(
      {
        ...baseInput,
        payload: { en: "hi there" },
        evidence: [evidence("frelux_dictionary", 0.95)],
      },
      [existing],
      "e8",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome).toBe("updated");
      expect(res.entry.version).toBe(2);
      expect(res.entry.history[0].payload).toEqual({ en: "hello" }); // prior payload retained
    }
  });

  it("keeps regional variants coexisting instead of conflicting", () => {
    const lagosEntry: LanguageEntry = {
      id: "lagos",
      profileId: "prof-1",
      kind: "vocabulary",
      key: "hello",
      payload: { en: "hello (Lagos usage)" },
      region: "NG-Lagos",
      confidence: 0.9,
      validationState: "CONFIRMED",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = upsertLanguageKnowledge(
      {
        ...baseInput,
        key: "hello",
        region: "NG-Abuja",
        payload: { en: "hello (Abuja usage)" },
        evidence: [evidence("frelux_dictionary", 0.8)],
      },
      [lagosEntry],
      "e9",
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.outcome).toBe("created"); // different region → variant, no conflict
  });
});

describe("entry validation (§11)", () => {
  function entry(over: Partial<LanguageEntry> = {}): LanguageEntry {
    return {
      id: "e",
      profileId: "prof-1",
      kind: "vocabulary",
      key: "k",
      payload: {},
      region: null,
      confidence: null,
      validationState: "LEARNING",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    };
  }

  it("refuses to validate a REJECTED entry", () => {
    const res = validateEntry({
      entry: entry({ validationState: "REJECTED" }),
      allEvidence: [],
      minConfidenceThreshold: 0.7,
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });

  it("CONFIRMS with threshold confidence AND 2 independent source types", () => {
    const res = validateEntry({
      entry: entry(),
      allEvidence: [
        {
          id: "1",
          entryId: "e",
          source: "d",
          sourceType: "frelux_dictionary",
          reliability: 0.9,
          content: {},
          createdAt: NOW,
        },
        {
          id: "2",
          entryId: "e",
          source: "c",
          sourceType: "external_reference",
          reliability: 0.9,
          content: {},
          createdAt: NOW,
        },
      ],
      minConfidenceThreshold: 0.7,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.validationState).toBe("CONFIRMED");
      expect(res.reason).toMatch(/independent source/i);
    }
  });

  it("keeps single-source knowledge provisional even at high confidence", () => {
    const res = validateEntry({
      entry: entry(),
      allEvidence: [
        {
          id: "1",
          entryId: "e",
          source: "d",
          sourceType: "frelux_dictionary",
          reliability: 1.0,
          content: {},
          createdAt: NOW,
        },
      ],
      minConfidenceThreshold: 0.5,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.validationState).toBe("NEEDS_REVIEW");
      expect(res.reason).toMatch(/corroboration is insufficient/i);
    }
  });

  it("sends below-threshold knowledge to NEEDS_REVIEW, honestly", () => {
    const res = validateEntry({
      entry: entry(),
      allEvidence: [
        {
          id: "1",
          entryId: "e",
          source: "d",
          sourceType: "frelux_dictionary",
          reliability: 0.4,
          content: {},
          createdAt: NOW,
        },
        {
          id: "2",
          entryId: "e",
          source: "c",
          sourceType: "external_reference",
          reliability: 0.4,
          content: {},
          createdAt: NOW,
        },
      ],
      minConfidenceThreshold: 0.7,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.validationState).toBe("NEEDS_REVIEW");
      expect(res.reason).toMatch(/below the /i);
    }
  });

  it("owner-provided evidence confirms — the owner IS an authority", () => {
    const res = validateEntry({
      entry: entry(),
      allEvidence: [
        {
          id: "1",
          entryId: "e",
          source: "owner",
          sourceType: "owner_provided",
          reliability: 0.3,
          content: {},
          createdAt: NOW,
        },
      ],
      minConfidenceThreshold: 0.8,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entry.validationState).toBe("CONFIRMED");
  });

  it("no evidence at all is NEEDS_REVIEW, not zero-confidence fact", () => {
    const res = validateEntry({
      entry: entry(),
      allEvidence: [],
      minConfidenceThreshold: 0.5,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entry.validationState).toBe("NEEDS_REVIEW");
  });
});

describe("language-level confidence", () => {
  it("counts only CONFIRMED entries, unconfirmed ones never inflate it", () => {
    const confirmed: LanguageEntry = {
      id: "c1",
      profileId: "p",
      kind: "vocabulary",
      key: "k",
      payload: {},
      region: null,
      confidence: 0.9,
      validationState: "CONFIRMED",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const unconfirmed: LanguageEntry = {
      ...confirmed,
      id: "c2",
      key: "k2",
      confidence: 1.0,
      validationState: "LEARNING",
    };
    const kindOf = (e: LanguageEntry) =>
      e.kind === "phrase" ? "translation" : e.kind;
    const withUnconfirmed = computeLanguageConfidence(
      [confirmed, unconfirmed],
      kindOf,
    );
    const onlyConfirmed = computeLanguageConfidence([confirmed], kindOf);
    expect(withUnconfirmed).toBe(onlyConfirmed); // the 1.0 LEARNING entry changed nothing
    expect(withUnconfirmed).toBeCloseTo(0.9);
  });

  it("returns null when nothing is confirmed yet", () => {
    expect(computeLanguageConfidence([], () => "vocabulary")).toBeNull();
  });
});
