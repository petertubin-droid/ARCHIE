import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  VERIFICATION_STATES,
  STATE_STYLES,
  type EvidenceHealth,
} from "@/lib/archie/evidence-truth-client";

// =========================================================
// EVIDENCE & TRUTH ENGINE — STATE-CONTRACT MIRROR
//
// The Evidence & Truth admin surface is a MIRROR of the
// server-side engine (supabase/functions/_shared/evidence).
// This contract keeps the mirror honest: every verification
// state the engine can emit must be represented in the
// frontend (filter + badge styles), and the health dashboard
// fields must cover every column the archie_evidence_health()
// RPC actually returns. If the engine adds a state and the
// mirror is not updated, THIS test fails loudly — the admin
// page must never silently hide a state ARCHIE produces.
// =========================================================

const ENGINE_TYPES = readFileSync(
  "supabase/functions/_shared/evidence/types.ts",
  "utf8",
);
const ENGINE_SERVICE = readFileSync(
  "supabase/functions/_shared/evidence/service.ts",
  "utf8",
);
const ENGINE_EVALUATE = readFileSync(
  "supabase/functions/_shared/evidence/evaluate.ts",
  "utf8",
);
const HEALTH_RPC_MIGRATION = readFileSync(
  "supabase/migrations/20260920120000_archie_evidence_truth_engine.sql",
  "utf8",
);

/** Extract the VerificationState union members from the
 *  engine's type definitions. */
function engineStates(): string[] {
  const match = ENGINE_TYPES.match(
    /export type VerificationState =\s*\|\s*"([^"]+)"([^;]+);/,
  );
  expect(match).toBeTruthy();
  const body = `"${match![1]}"${match![2]}`;
  return Array.from(body.matchAll(/"([^"]+)"/g), (m) => m[1]);
}

describe("Evidence & Truth state-contract mirror", () => {
  it("frontend VERIFICATION_STATES mirrors every state the engine can emit", () => {
    const backend = engineStates();
    expect(backend.length).toBeGreaterThanOrEqual(8);
    for (const state of backend) {
      expect(VERIFICATION_STATES).toContain(state as never);
    }
    // no invented frontend states either (exact mirror)
    expect(VERIFICATION_STATES.length).toBe(backend.length);
  });

  it("every verification state has a badge style (no unstyled state rows)", () => {
    for (const state of VERIFICATION_STATES) {
      expect(STATE_STYLES[state]).toBeTruthy();
    }
  });

  it("the engine still enforces the anti-hallucination guarantees (source present)", () => {
    // strict verifier exists (no false verification, Test 13)
    expect(ENGINE_EVALUATE).toMatch(/canVerify/);
    // unsupported claims can never reach VERIFIED silently
    expect(ENGINE_EVALUATE).toMatch(/verification refused/);
    // user-provided never silently converts to verified fact
    expect(ENGINE_EVALUATE).toMatch(/never silently converted/i);
    // hallucinated-source refusal lives in the service
    expect(ENGINE_SERVICE).toMatch(
      /refused: the referenced source row does not exist/,
    );
  });

  it("EvidenceHealth mirrors every column the archie_evidence_health RPC returns", () => {
    const rpcMatch = HEALTH_RPC_MIGRATION.match(
      /create or replace function public\.archie_evidence_health\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/i,
    );
    expect(rpcMatch).toBeTruthy();
    const sql = rpcMatch![1];
    // every dashboard field the RPC emits: '<name>', (SELECT …)
    const rpcFields = Array.from(
      sql.matchAll(/'([a-z_]+)',\s*\(SELECT/g),
      (m) => m[1],
    );
    expect(rpcFields.length).toBeGreaterThanOrEqual(20);
    // compile-check the client type mirrors the RPC shape
    const health: EvidenceHealth = {
      total_claims: 0,
      verified_claims: 0,
      supported_claims: 0,
      inferred_claims: 0,
      user_provided_claims: 0,
      conflicted_claims: 0,
      outdated_claims: 0,
      unverified_claims: 0,
      unknown_claims: 0,
      evidence_records: 0,
      evidence_sources: 0,
      provenance_records: 0,
      claim_evidence_links: 0,
      conflicts_total: 0,
      conflicts_unresolved: 0,
      claims_without_evidence: 0,
      orphaned_evidence: 0,
      inferred_marked_as_facts: 0,
      user_provided_marked_verified: 0,
      claims_missing_retrieved_at: 0,
      stale_claims: 0,
      conflicts_without_explanation: 0,
      sample_claims_without_evidence: [],
    };
    for (const field of rpcFields) {
      expect(field in health).toBe(true);
    }
  });
});
