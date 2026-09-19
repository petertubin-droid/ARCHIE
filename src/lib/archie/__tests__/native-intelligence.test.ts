import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  NATIVE_INTELLIGENCE,
  UNIVERSAL_KNOWLEDGE,
  CONVERSATION_LEARNING,
  WEB_LEARNING,
  CODING_LEARNING,
  CODING_INDEPENDENCE,
  GEMINI_BOUNDARY,
  OWNER_AUTHORITY,
  PERMANENCE,
  NATIVE_INTELLIGENCE_ARCHITECTURE,
  NATIVE_INTELLIGENCE_PRINCIPLE_ID,
  verifyNativeIntelligenceIntegrity,
} from "../native-intelligence";
import { PROVIDER_INDEPENDENCE } from "../provider-independence";

// =========================================================
// NATIVE INTELLIGENCE & UNIVERSAL LEARNING ARCHITECTURE —
// PERMANENT ENFORCEMENT (owner directive, all nine pillars).
// Encodes the verbatim rule; statically verifies the durable
// seed and capability registration; guarantees the Gemini
// boundary can never drift from the Provider Independence
// Principle.
// =========================================================

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), "utf-8");

describe("§1 Native ARCHIE intelligence", () => {
  it("mandates ARCHIE's own inference engine — never external dependence", () => {
    expect(NATIVE_INTELLIGENCE.rule).toContain(
      "own native Intelligence/Inference Engine",
    );
    expect(NATIVE_INTELLIGENCE.rule).toContain(
      "never depend on Gemini, OpenAI, Claude, or any other external AI engine",
    );
  });

  it("must never become dormant because an external engine is unavailable", () => {
    expect(NATIVE_INTELLIGENCE.neverDormant).toContain("never become dormant");
    expect(NATIVE_INTELLIGENCE.neverDormant).toContain(
      "even when every external AI provider is unavailable",
    );
  });

  it("requires all thirteen native capabilities", () => {
    expect(NATIVE_INTELLIGENCE.requiredCapabilities).toEqual([
      "conversation",
      "reasoning",
      "context",
      "learning",
      "knowledge retrieval",
      "planning",
      "coding",
      "analysis",
      "problem solving",
      "tool use",
      "web research",
      "self-evaluation",
      "continuous improvement",
    ]);
  });

  it("prohibits fake intelligence — no scripts, mocks, placeholders", () => {
    expect(NATIVE_INTELLIGENCE.prohibitions.join(" ")).toContain(
      "No fake intelligence",
    );
    expect(NATIVE_INTELLIGENCE.prohibitions.join(" ")).toContain(
      "No scripted responses",
    );
    expect(NATIVE_INTELLIGENCE.prohibitions.join(" ")).toContain(
      "No mock engines",
    );
    expect(NATIVE_INTELLIGENCE.prohibitions.join(" ")).toContain(
      "No placeholders",
    );
    expect(NATIVE_INTELLIGENCE.prohibitions.join(" ")).toContain(
      "No hardcoded conversational behavior",
    );
  });
});

describe("§2 Universal knowledge acquisition", () => {
  it("covers any legitimate field with NO knowledge ceiling", () => {
    expect(UNIVERSAL_KNOWLEDGE.rule).toContain(
      "any legitimate field, discipline, subject, technology, language or domain",
    );
    expect(UNIVERSAL_KNOWLEDGE.domains.length).toBeGreaterThanOrEqual(25);
  });

  it("explicitly lists the owner's domain categories", () => {
    const all = UNIVERSAL_KNOWLEDGE.domains.join(" ");
    for (const domain of [
      "Programming",
      "Artificial intelligence",
      "Mathematics",
      "Databases",
      "Cloud computing",
      "Cybersecurity",
      "Web development",
      "Science",
      "Construction",
      "Interior design",
      "Business",
      "Economics",
      "Law",
      "History",
      "Psychology",
      "Medicine",
      "Languages",
      "Literature",
      "Agriculture",
      "Manufacturing",
      "Telecommunications",
      "Emerging technologies",
    ]) {
      expect(all).toContain(domain);
    }
  });

  it("applies etcetera — no artificial fixed subject list", () => {
    expect(UNIVERSAL_KNOWLEDGE.etcetera).toContain(
      "every legitimate field of knowledge that exists or may emerge",
    );
    expect(UNIVERSAL_KNOWLEDGE.etcetera.toLowerCase()).toContain(
      "no artificial fixed subject list",
    );
  });
});

describe("§3 Continuous conversation learning", () => {
  it("converses naturally including simple greetings", () => {
    expect(CONVERSATION_LEARNING.rule).toContain("Hello ARCHIE");
  });

  it("allows autonomous learning during the minimum 3-month period", () => {
    expect(CONVERSATION_LEARNING.autonomousLearningPeriod).toContain(
      "minimum 3-month learning period",
    );
    expect(CONVERSATION_LEARNING.autonomousLearningPeriod).toContain(
      "without requiring Owner approval for every learning event",
    );
  });

  it("enforces the full nine-stage knowledge pipeline", () => {
    expect(CONVERSATION_LEARNING.pipeline).toEqual([
      "DISCOVER",
      "ANALYZE",
      "CROSS-CHECK",
      "VALIDATE",
      "ORGANIZE",
      "RETAIN",
      "RETRIEVE",
      "APPLY",
      "IMPROVE",
    ]);
  });

  it("never stores uncertain information as established fact", () => {
    expect(CONVERSATION_LEARNING.uncertainInformation).toContain(
      "not be stored as established fact",
    );
  });
});

describe("§4 Web learning", () => {
  it("grants broad legitimate web research including Google Search", () => {
    expect(WEB_LEARNING.rule).toContain("Google Search");
    expect(WEB_LEARNING.allowedOperations).toContain("cross-check");
    expect(WEB_LEARNING.noPredefinedList).toContain(
      "not be artificially restricted to a small predefined website list",
    );
  });

  it("respects all legitimate boundaries", () => {
    expect(WEB_LEARNING.boundaries).toEqual([
      "authentication boundaries",
      "access controls",
      "robots and rate limits",
      "copyright",
      "privacy",
      "applicable law",
      "website security restrictions",
    ]);
  });
});

describe("§5 Coding & engineering learning", () => {
  it("learns continuously from real engineering sources", () => {
    expect(CODING_LEARNING.learningSources).toContain("its own codebase");
    expect(CODING_LEARNING.learningSources).toContain("FRELUX code");
    expect(CODING_LEARNING.learningSources).toContain("verified solutions");
  });

  it("drafts and tests code ONLY in authorized isolated environments", () => {
    expect(CODING_LEARNING.sandboxing).toContain(
      "authorized isolated environments",
    );
  });

  it("learning never grants production modification rights", () => {
    expect(CODING_LEARNING.notProduction).toContain(
      "does NOT grant permission to modify production code",
    );
  });
});

describe("§6 ARCHIE coding independence", () => {
  it("targets independent hosted database and infrastructure", () => {
    expect(CODING_INDEPENDENCE.rule).toContain(
      "designing, building, securing, maintaining, migrating and operating its own independent hosted database",
    );
  });

  it("reduces third-party dependence but stays owner-gated", () => {
    expect(CODING_INDEPENDENCE.architecture).toContain(
      "reduce unnecessary dependence on third-party infrastructure",
    );
    expect(CODING_INDEPENDENCE.authorityLimit).toContain(
      "without Owner authorization",
    );
  });
});

describe("§7 Gemini boundary — consistent with Provider Independence", () => {
  it("keeps Gemini strictly FRELUX-only", () => {
    expect(GEMINI_BOUNDARY.rule).toContain(
      "NOT part of ARCHIE's core intelligence",
    );
    expect(GEMINI_BOUNDARY.rule).toContain(
      "separate FRELUX secondary fallback",
    );
  });

  it("requires ARCHIE to attempt independently first", () => {
    expect(GEMINI_BOUNDARY.attemptFirst).toContain(
      "attempt to solve a problem independently first",
    );
  });

  it("external answers must be analyzed and validated before acceptance", () => {
    expect(GEMINI_BOUNDARY.validateExternal).toContain(
      "analyzed and validated before ARCHIE accepts it as knowledge",
    );
  });

  it("can NEVER drift from the Provider Independence Principle", () => {
    expect(GEMINI_BOUNDARY.providerIndependenceRule).toBe(
      PROVIDER_INDEPENDENCE.rule,
    );
  });
});

describe("§8 Owner authority", () => {
  it("knowledge never grants autonomous authority", () => {
    expect(OWNER_AUTHORITY.rule).toContain(
      "knowledge never grants autonomous authority",
    );
  });

  it("states the permanent operating principle verbatim", () => {
    expect(OWNER_AUTHORITY.operatingPrinciple).toEqual([
      "LEARN FREELY",
      "ANALYZE",
      "VALIDATE",
      "RETAIN",
      "APPLY",
      "IMPROVE",
      "PROPOSE",
      "OWNER AUTHORIZES EXECUTION",
    ]);
  });

  it("lists all seven authority prohibitions", () => {
    expect(OWNER_AUTHORITY.prohibitions).toEqual([
      "Modify its production/core code without authorization",
      "Change its authority or security controls",
      "Deploy itself",
      "Grant itself permissions",
      "Delete or migrate critical data autonomously",
      "Conceal changes or audit history",
      "Bypass access controls or security restrictions",
    ]);
  });
});

describe("§9 Permanence", () => {
  it("persists across every ARCHIE surface and version", () => {
    expect(PERMANENCE.persistAcross).toEqual([
      "ARCHIE Core",
      "Memory",
      "Coding Studio",
      "PWA",
      "database migrations",
      "upgrades",
      "trusted devices",
      "future versions",
    ]);
  });

  it("targets an extensible universal architecture — not a finite database", () => {
    expect(PERMANENCE.goal).toContain(
      "extensible, continuously learning universal intelligence architecture",
    );
    expect(PERMANENCE.goal).toContain("not a finite knowledge database");
  });
});

describe("Architecture integrity & persistence", () => {
  it("assembles all nine pillars under one principle id", () => {
    expect(NATIVE_INTELLIGENCE_PRINCIPLE_ID).toBe("native_intelligence");
    expect(Object.keys(NATIVE_INTELLIGENCE_ARCHITECTURE.sections)).toHaveLength(
      9,
    );
  });

  it("integrity verification passes on all axes", () => {
    const integrity = verifyNativeIntelligenceIntegrity();
    expect(integrity.encoded).toBe(true);
    expect(integrity.ninePillars).toBe(true);
    expect(integrity.pipelineMatchesRule).toBe(true);
    expect(integrity.noKnowledgeCeiling).toBe(true);
    expect(integrity.geminiBoundaryConsistent).toBe(true);
    expect(integrity.ownerAuthorityIntact).toBe(true);
  });

  it("is persisted in ARCHIE's durable core-principles store (seed migration)", () => {
    const migration = read(
      "supabase/migrations/20260912110000_archie_native_intelligence.sql",
    );
    expect(migration).toContain("native_intelligence");
    expect(migration).toContain("ON CONFLICT (principle_id) DO NOTHING");
    // All nine pillars are seeded
    expect(migration).toContain("nativeIntelligence");
    expect(migration).toContain("universalKnowledge");
    expect(migration).toContain("conversationLearning");
    expect(migration).toContain("webLearning");
    expect(migration).toContain("codingLearning");
    expect(migration).toContain("codingIndependence");
    expect(migration).toContain("geminiBoundary");
    expect(migration).toContain("ownerAuthority");
    expect(migration).toContain("permanence");
  });

  it("is registered in the ARCHIE capability catalog and orchestrator health check", () => {
    const catalog = read("src/lib/archie/core-capabilities.ts");
    expect(catalog).toContain("NATIVE_INTELLIGENCE");
    expect(catalog).toContain("native-intelligence");
    const orchestrator = read("src/lib/archie/core-orchestrator.ts");
    expect(orchestrator).toContain(
      'NATIVE_INTELLIGENCE: () => import("@/lib/archie/native-intelligence")',
    );
  });

  it("the principle module exists and exports its verifier", () => {
    expect(
      existsSync(join(root, "src/lib/archie/native-intelligence.ts")),
    ).toBe(true);
    expect(typeof verifyNativeIntelligenceIntegrity).toBe("function");
  });
});
