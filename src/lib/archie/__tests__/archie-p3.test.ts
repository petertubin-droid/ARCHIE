// =========================================================
// FRELUX PHASE 8 P3 TEST SUITE, ARCHIE INTELLIGENCE LAYER
//
// Covers the Prompt 3 contract:
//  * knowledge graph: links, contradiction detection,
//    evidence-ranked conflict resolution, gap identification,
//    retrieval ranking
//  * tool selection: calculations ALWAYS route to canonical
//    engines; unprovenanced numbers are labeled estimates
//  * professional registry: unverified can NEVER be presented
//    as verified; role/region authority; ARCHIE cannot mint
//    verification
//  * change pipeline: stage order, artifact requirements,
//    human-only review, owner-only authorization, rollback
//    before apply
//  * end-to-end: ingestion candidate → knowledge →
//    link/contradiction → resolution recommendation →
//    change request through the full owner-gated pipeline
// =========================================================
import { describe, it, expect } from "vitest";

function mustAdvance(
  c: Parameters<typeof advanceChange>[0],
  to: Parameters<typeof advanceChange>[1],
  actor: Parameters<typeof advanceChange>[2],
  ev: Parameters<typeof advanceChange>[3] = {},
) {
  const r = advanceChange(c, to, actor, ev);
  if (!r.ok) throw new Error(`pipeline step ${to} failed: ${r.error}`);
  return r.change;
}

import type { KnowledgeNode, KnowledgeLink } from "../knowledge-graph";
import {
  connectKnowledge,
  detectContradictions,
  resolveConflict,
  identifyGaps,
  rankForQuestion,
  regionsOverlap,
} from "../knowledge-graph";
import { selectTool, assertAuthority } from "../tool-router";
import {
  publicBadge,
  mayClaimAuthority,
  verifyProfessional,
  recordAccountability,
} from "../professional-registry";
import type { ProfessionalProfile } from "../professional-registry";
import {
  createChangeRequest,
  advanceChange,
  classifyRisk,
  mayArchieAuthorize,
} from "../change-pipeline";
import { runArchiePipeline } from "../ingest";
import { archieDomains } from "../domains";

function node(args: Partial<KnowledgeNode> & { id: string; topic: string }): KnowledgeNode {
  return {
    domain: "painting_finishes",
    region: null,
    scope: "GLOBAL",
    evidence_state: "USER_CONFIRMED",
    confidence: 0.8,
    content: {},
    version: 1,
    ingested_at: "2026-09-01T00:00:00.000Z",
    status: "ACTIVE",
    ...args,
  };
}

describe("Phase 8 P3: knowledge graph", () => {
  it("connects knowledge with typed relations and provenance", () => {
    const a = node({ id: "a", topic: "paint coverage" });
    const b = node({ id: "b", topic: "paint coverage" });
    const r = connectKnowledge(a, b, "SUPPORTS", {
      created_by: "admin-1",
      reason: "Both describe the same measured coverage",
    });
    expect(r.ok).toBe(true);
    expect((r.link as KnowledgeLink).relation).toBe("SUPPORTS");
    expect((r.link as KnowledgeLink).created_by).toBe("admin-1");
  });

  it("refuses self-links, rolled-back links, and invalid SUPERSEDES", () => {
    const a = node({ id: "a", topic: "x" });
    expect(connectKnowledge(a, a, "RELATED_TO", { created_by: "u", reason: "r" }).ok).toBe(false);
    const dead = node({ id: "d", topic: "x", status: "ROLLED_BACK" });
    expect(connectKnowledge(a, dead, "SUPPORTS", { created_by: "u", reason: "r" }).ok).toBe(false);
    const older = node({ id: "o", topic: "x", ingested_at: "2026-08-01T00:00:00.000Z" });
    // newer superseding older is fine, older superseding newer is not
    expect(connectKnowledge(a, older, "SUPERSEDES", { created_by: "u", reason: "r" }).ok).toBe(true);
    expect(connectKnowledge(older, a, "SUPERSEDES", { created_by: "u", reason: "r" }).ok).toBe(false);
  });

  it("detects numeric contradictions only for same topic/domain/region", () => {
    const a = node({ id: "a", topic: "paint coverage", region: "Lagos", content: { litres_per_m2: 0.11 } });
    const b = node({ id: "b", topic: "paint coverage", region: "Lagos", content: { litres_per_m2: 0.16 } });
    const c = node({ id: "c", topic: "paint coverage", region: "Lagos", content: { litres_per_m2: 0.11005 }, ingested_at: "2026-09-02T00:00:00.000Z" });
    const d = node({ id: "d", topic: "other topic", region: "Lagos", content: { litres_per_m2: 5 } });
    const e = node({
      id: "e",
      topic: "paint coverage",
      region: "Kenya",
      content: { litres_per_m2: 0.2 },
    });
    const records = detectContradictions([a, b, c, d, e]);
    // b (0.16) contradicts both a and c (both ~0.11, within tolerance
    // of each other); d is a different topic; e is a different region.
    expect(records).toHaveLength(2);
    expect(records.map((r) => [r.item_a_id, r.item_b_id])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(records[0].status).toBe("OPEN");
    // tolerance: near-identical values do not contradict (a-c pair absent)
  });

  it("treats different regions as regional difference, not contradiction", () => {
    const a = node({ id: "a", topic: "block price", region: "Lagos", content: { price: 450 } });
    const b = node({ id: "b", topic: "block price", region: "Abuja", content: { price: 520 } });
    expect(detectContradictions([a, b])).toHaveLength(0);
    expect(regionsOverlap("Lagos", null)).toBe(true);
    expect(regionsOverlap("Lagos", "Abuja")).toBe(false);
  });

  it("resolves conflicts by evidence rank, then confidence, then recency", () => {
    const ai = node({
      id: "ai",
      topic: "paint coverage",
      evidence_state: "AI_EXTRACTED",
      confidence: 0.9,
      content: { litres_per_m2: 0.11 },
      ingested_at: "2026-09-05T00:00:00.000Z",
    });
    const outcome = node({
      id: "outcome",
      topic: "paint coverage",
      evidence_state: "ACTUAL_OUTCOME",
      confidence: 0.5,
      content: { litres_per_m2: 0.13 },
      ingested_at: "2026-08-01T00:00:00.000Z",
    });
    const resolution = resolveConflict([ai, outcome])!;
    expect(resolution.winner_id).toBe("outcome");
    expect(resolution.loser_ids).toEqual(["ai"]);
    expect(resolution.requires_human_decision).toBe(true);
    // ACTUAL_OUTCOME always wins, even against newer, more confident AI
  });

  it("identifies coverage, verification and confidence gaps", () => {
    const items = [
      node({ id: "a", topic: "x", domain: "architecture", evidence_state: "USER_CONFIRMED", confidence: 0.9 }),
      node({ id: "b", topic: "y", domain: "roofing", evidence_state: "AI_EXTRACTED", confidence: 0.2 }),
      node({ id: "c", topic: "z", domain: "costing", evidence_state: "AI_EXTRACTED", confidence: 0.3 }),
      node({ id: "d", topic: "w", domain: "costing", evidence_state: "AI_RECOMMENDATION", confidence: 0.4 }),
    ];
    const domains = [{ key: "architecture" }, { key: "roofing" }, { key: "costing" }, { key: "plumbing" }];
    const gaps = identifyGaps(items, domains);
    expect(gaps).toContainEqual(
      expect.objectContaining({ domain: "plumbing", gap_type: "COVERAGE" }),
    );
    expect(gaps).toContainEqual(
      expect.objectContaining({ domain: "roofing", gap_type: "VERIFICATION" }),
    );
    expect(gaps).toContainEqual(
      expect.objectContaining({ domain: "roofing", gap_type: "CONFIDENCE" }),
    );
    // architecture: verified + confident → no gap
    expect(gaps.filter((g) => g.domain === "architecture")).toHaveLength(0);
  });

  it("ranks retrieval by evidence, confidence and region fit", () => {
    const strong = node({
      id: "strong",
      topic: "paint coverage",
      region: "Lagos",
      evidence_state: "SYSTEM_VERIFIED",
      confidence: 0.95,
      ingested_at: "2026-09-05T00:00:00.000Z",
    });
    const weak = node({
      id: "weak",
      topic: "paint coverage",
      region: "Kano",
      evidence_state: "AI_EXTRACTED",
      confidence: 0.3,
      ingested_at: "2026-01-01T00:00:00.000Z",
    });
    const ranked = rankForQuestion({ domain: "painting_finishes", region: "Lagos" }, [weak, strong]);
    expect(ranked[0].node.id).toBe("strong");
    expect(ranked[1].node.id).toBe("weak");
  });
});

describe("Phase 8 P3: tool selection (deterministic authority)", () => {
  it("routes calculation questions to canonical engines", () => {
    const r = selectTool("How many litres of paint do I need for a 4x5m room?");
    expect(r.intent).toBe("CALCULATION");
    expect(r.must_use_deterministic_engine).toBe(true);
    expect(r.capability?.key).toBe("painting");
    expect(r.capability?.engine_id).toBe("painting_wall_area");
  });

  it("routes roof questions to the roof geometry engine", () => {
    const r = selectTool("Calculate the timber quantities for my roof rafters");
    expect(r.capability?.engine_id).toBe("roof_geometry");
    expect(r.must_use_deterministic_engine).toBe(true);
  });

  it("routes market/price questions to data capabilities, not engines", () => {
    const r = selectTool("What is the current price of cement in the market?");
    expect(r.intent).toBe("PROJECT_DATA");
    expect(r.capability?.key).toBe("market_intelligence");
    expect(r.capability?.deterministic).toBe(false);
  });

  it("lets general questions use governed knowledge", () => {
    const r = selectTool("What is the difference between screeding and POP ceiling?");
    expect(r.intent).toBe("GENERAL_KNOWLEDGE");
    expect(r.must_use_deterministic_engine).toBe(false);
  });

  it("refuses to present unprovenanced numbers as final results", () => {
    const verdict = assertAuthority({
      text: "You need 25 litres of paint",
      numeric_values: { litres: 25 },
    });
    expect(verdict.presentation).toBe("AI_ESTIMATE");
    expect(verdict.verified).toBe(false);
    if (verdict.presentation === "AI_ESTIMATE") {
      expect(verdict.requires_engineering_review).toBe(true);
    }
  });

  it("refuses to present unregistered engines as authoritative", () => {
    const verdict = assertAuthority({
      text: "result",
      engine_id: "archie_improvised_math",
      numeric_values: { litres: 25 },
    });
    expect(verdict.presentation).toBe("AI_ESTIMATE");
  });

  it("accepts registered engine results as deterministic", () => {
    const verdict = assertAuthority({
      text: "result",
      engine_id: "build_to_roof",
      numeric_values: { blocks: 3200 },
    });
    expect(verdict.presentation).toBe("DETERMINISTIC_RESULT");
    expect(verdict.verified).toBe(true);
  });
});

describe("Phase 8 P3: professional ecosystem", () => {
  const base: ProfessionalProfile = {
    id: "p1",
    role: "ARCHITECT",
    display_name: "Ada Architects",
    verification_state: "UNVERIFIED",
    credential_refs: [],
    regional_scope: ["Lagos"],
    active: true,
    created_at: "2026-09-01T00:00:00.000Z",
  };

  it("NEVER presents an unverified professional as verified", () => {
    for (const state of ["UNVERIFIED", "PENDING_REVIEW", "REVOKED"] as const) {
      const badge = publicBadge({ ...base, verification_state: state });
      expect(badge.verified).toBe(false);
    }
    const badge = publicBadge(base);
    expect(badge.verified).toBe(false);
    expect(badge.label).not.toBe("Verified");
  });

  it("presents verified professionals as verified", () => {
    const badge = publicBadge({
      ...base,
      verification_state: "VERIFIED",
      verified_by: "human-verifier",
      verified_at: "2026-09-01T00:00:00.000Z",
    });
    expect(badge.verified).toBe(true);
    expect(badge.label).toBe("Verified");
  });

  it("blocks authority claims for unverified or out-of-scope professionals", () => {
    const denied = mayClaimAuthority(base, { domain: "architecture", region: "Lagos" });
    expect(denied.allowed).toBe(false);
    const verified = { ...base, verification_state: "VERIFIED" as const, verified_by: "v", verified_at: "2026-09-01T00:00:00.000Z" };
    const wrongDomain = mayClaimAuthority(verified, { domain: "structural", region: "Lagos" });
    expect(wrongDomain.allowed).toBe(false);
    const wrongRegion = mayClaimAuthority(verified, { domain: "architecture", region: "Abuja" });
    expect(wrongRegion.allowed).toBe(false);
    const ok = mayClaimAuthority(verified, { domain: "architecture", region: "Lagos" });
    expect(ok.allowed).toBe(true);
  });

  it("refuses to let ARCHIE mint verification", () => {
    const r = verifyProfessional(base, {
      to: "VERIFIED",
      verified_by: "ARCHIE",
      credential_refs: ["NIA-123"],
    });
    expect(r.ok).toBe(false);
  });

  it("requires credentials and a human verifier for verification", () => {
    expect(
      verifyProfessional(base, { to: "VERIFIED", verified_by: "admin", credential_refs: [] }).ok,
    ).toBe(false);
    const ok = verifyProfessional(base, {
      to: "VERIFIED",
      verified_by: "admin-1",
      credential_refs: ["NIA-123"],
    });
    expect(ok.ok).toBe(true);
    expect(ok.profile?.verification_state).toBe("VERIFIED");
  });

  it("records accountability entries with provenance", () => {
    const e = recordAccountability({ id: "p1" }, "PROFILE_VIEWED", "ARCHIE", "Consulted during estimate");
    expect(e.professional_id).toBe("p1");
    expect(e.actor).toBe("ARCHIE");
    expect(e.at).toBeTruthy();
  });
});

describe("Phase 8 P3: owner-gated change pipeline", () => {
  it("walks the full pipeline: REQUEST → APPLY with all artifacts", () => {
    let c = createChangeRequest({
      title: "Add gallery export button",
      areas: ["frontend"],
      created_by: "ARCHIE",
    });
    expect(c.stage).toBe("REQUEST");
    expect(c.requires_engineering_review).toBe(false);

    c = mustAdvance(c, "UNDERSTAND", "ARCHIE", {
      understanding_summary: "Owner wants an export button on the gallery page",
    });
    c = mustAdvance(c, "PLAN", "ARCHIE", { plan: "Add button + handler + test" });
    c = mustAdvance(c, "IMPLEMENT", "ARCHIE", { implementation_summary: "Implemented GalleryExportButton" });
    c = mustAdvance(c, "TEST", "ARCHIE", { test_evidence: "vitest: 41 passed, tsc clean, build green" });
    c = mustAdvance(c, "REVIEW", "CONTRIBUTOR", { review_signoff_by: "CONTRIBUTOR" });
    c = mustAdvance(c, "OWNER_AUTHORIZATION", "OWNER", {
      rollback_plan: "git revert of the feature commit; no schema changes",
    });
    const final = mustAdvance(c, "APPLY", "OWNER");
    expect(final.stage).toBe("APPLY");
  });

  it("refuses to skip stages", () => {
    const c = createChangeRequest({ title: "x", areas: ["frontend"], created_by: "ARCHIE" });
    const r = advanceChange(c, "PLAN", "ARCHIE", { plan: "p" });
    expect(r.ok).toBe(false);
  });

  it("requires artifacts at every stage", () => {
    const c = createChangeRequest({ title: "x", areas: ["frontend"], created_by: "ARCHIE" });
    expect(advanceChange(c, "UNDERSTAND", "ARCHIE", {}).ok).toBe(false);
    expect(advanceChange(c, "UNDERSTAND", "ARCHIE", { understanding_summary: "u" }).ok).toBe(true);
  });

  it("blocks ARCHIE from signing reviews of deterministic changes", () => {
    let c = createChangeRequest({ title: "Change paint coverage formula", areas: ["deterministic-math", "engine"], created_by: "ARCHIE" });
    expect(c.requires_engineering_review).toBe(true);
    expect(c.flags).toContain("ENGINEERING_REVIEW_REQUIRED");
    c = mustAdvance(c, "UNDERSTAND", "ARCHIE", { understanding_summary: "u" });
    c = mustAdvance(c, "PLAN", "ARCHIE", { plan: "p" });
    c = mustAdvance(c, "IMPLEMENT", "ARCHIE", { implementation_summary: "i" });
    c = mustAdvance(c, "TEST", "ARCHIE", { test_evidence: "t" });
    // ARCHIE cannot sign:
    expect(advanceChange(c, "REVIEW", "ARCHIE", { review_signoff_by: "ARCHIE" }).ok).toBe(false);
    // A plain contributor cannot sign an engineering-review change either:
    expect(advanceChange(c, "REVIEW", "CONTRIBUTOR", { review_signoff_by: "CONTRIBUTOR" }).ok).toBe(false);
    // An engineer can:
    const reviewed = advanceChange(c, "REVIEW", "ENGINEER", { review_signoff_by: "ENGINEER" });
    expect(reviewed.ok).toBe(true);
  });

  it("owner authorization and apply are OWNER-only and rollback-gated", () => {
    let c = createChangeRequest({ title: "x", areas: ["frontend"], created_by: "ARCHIE" });
    c = mustAdvance(c, "UNDERSTAND", "ARCHIE", { understanding_summary: "u" });
    c = mustAdvance(c, "PLAN", "ARCHIE", { plan: "p" });
    c = mustAdvance(c, "IMPLEMENT", "ARCHIE", { implementation_summary: "i" });
    c = mustAdvance(c, "TEST", "ARCHIE", { test_evidence: "t" });
    c = mustAdvance(c, "REVIEW", "OWNER", { review_signoff_by: "OWNER" });
    // Non-owner cannot authorize:
    expect(advanceChange(c, "OWNER_AUTHORIZATION", "ARCHIE", { rollback_plan: "r" }).ok).toBe(false);
    // Owner must provide a rollback plan:
    expect(advanceChange(c, "OWNER_AUTHORIZATION", "OWNER", {}).ok).toBe(false);
    c = mustAdvance(c, "OWNER_AUTHORIZATION", "OWNER", { rollback_plan: "revert commit" });
    // Non-owner cannot apply:
    expect(advanceChange(c, "APPLY", "ARCHIE").ok).toBe(false);
    expect(advanceChange(c, "APPLY", "ENGINEER").ok).toBe(false);
    expect(advanceChange(c, "APPLY", "OWNER").ok).toBe(true);
    // Fixed authority model:
    expect(mayArchieAuthorize()).toBe(false);
  });

  it("classifies risk via areas and protected capabilities", () => {
    expect(classifyRisk(["frontend"], ["painting"]).requires_engineering_review).toBe(true);
    expect(classifyRisk(["frontend"], ["ui-copy"]).requires_engineering_review).toBe(false);
    expect(classifyRisk(["structural"], []).requires_engineering_review).toBe(true);
  });
});

describe("Phase 8 P3: end-to-end intelligence lifecycle", () => {
  it("ingestion → knowledge → contradiction → resolution → owner-gated change", () => {
    // 1. A contributor feeds ARCHIE a measured coverage fact.
    const input = {
      input_type: "TEXT" as const,
      title: "Measured paint coverage",
      domain: "painting_finishes",
      text: "We measured 0.11 litres per m2 on this project.",
      contributor: {
        user_id: "u1",
        display_name: "Site Engineer",
        role: "DOMAIN_CONTRIBUTOR" as const,
        allowed_domains: ["painting_finishes"],
        must_review: true,
        active: true,
      },
      user_confirmed: true,
    };
    const extraction = {
      summary: "Measured coverage from site",
      facts: [
        {
          topic: "paint coverage",
          content: { litres_per_m2: 0.11 },
          knowledge_type: "FACT" as const,
          confidence: 0.9,
          evidence: ["site measurement"],
        },
      ],
      warnings: [],
    };
    const pipeline = runArchiePipeline(input, extraction);
    expect(pipeline.state).toBe("AWAITING_APPROVAL");
    expect(pipeline.candidates).toHaveLength(1);
    // Never auto-promoted past approval:
    expect(pipeline.state).not.toBe("APPROVED");

    // 2. After human approval, it becomes knowledge; graph work follows.
    const approved = pipeline.candidates[0];
    const newNode = node({
      id: approved.topic,
      topic: approved.topic,
      content: approved.content,
      evidence_state: "USER_CONFIRMED",
      confidence: approved.confidence,
      region: null,
      ingested_at: "2026-09-07T00:00:00.000Z",
    });
    const oldAi = node({
      id: "old",
      topic: "paint coverage",
      evidence_state: "AI_EXTRACTED",
      confidence: 0.6,
      content: { litres_per_m2: 0.2 },
      ingested_at: "2026-08-01T00:00:00.000Z",
    });
    const contradictions = detectContradictions([newNode, oldAi]);
    expect(contradictions).toHaveLength(1);

    // 3. Resolution recommends the human-confirmed measurement.
    const resolution = resolveConflict([newNode, oldAi])!;
    expect(resolution.winner_id).toBe("paint coverage");

    // 4. If the owner then wants the coverage constant updated in the
    //    engine, it can only go through the owner-gated pipeline.
    let c = createChangeRequest({
      title: "Update measured paint coverage reference",
      areas: ["deterministic-math", "engine"],
      created_by: "ARCHIE",
    });
    expect(c.requires_engineering_review).toBe(true);
    c = mustAdvance(c, "UNDERSTAND", "ARCHIE", {
      understanding_summary: "Update engine reference from measured data",
    });
    c = mustAdvance(c, "PLAN", "ARCHIE", { plan: "Adjust engine default + parity tests" });
    c = mustAdvance(c, "IMPLEMENT", "ARCHIE", { implementation_summary: "Done in isolation" });
    c = mustAdvance(c, "TEST", "ARCHIE", { test_evidence: "parity suite green" });
    c = mustAdvance(c, "REVIEW", "ENGINEER", { review_signoff_by: "ENGINEER" });
    c = mustAdvance(c, "OWNER_AUTHORIZATION", "OWNER", { rollback_plan: "revert migration" });
    expect(advanceChange(c, "APPLY", "ARCHIE").ok).toBe(false);
    expect(advanceChange(c, "APPLY", "OWNER").ok).toBe(true);

    // 5. Domain registry intact across all phases.
    expect(archieDomains.exists("architecture")).toBe(true);
    expect(archieDomains.getCore().key).toBe("architecture");
  });
});
