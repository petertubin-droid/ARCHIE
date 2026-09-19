// =========================================================
// ARCHIE CODE INTELLIGENCE — CLIENT
//
// Real, typed access to ARCHIE's live code-intelligence
// tables (applied in production via migration 20260911220000):
//   * archie_code_findings    — audited findings with owner
//                               dispositions
//   * archie_calculation_traces — provenance traces
//   * archie_patch_proposals — approval-gated patches
//
// Owner-only data (RLS: admin). Every action here is a REAL
// database transition — no local state tricks, no mocks.
// =========================================================

import { supabase } from "@/lib/supabase";

// ---- findings ----------------------------------------------------

export type FindingType =
  | "PLACEHOLDER"
  | "HARDCODED_VALUE"
  | "MOCK_RESULT"
  | "FAKE_CALCULATION"
  | "DISCONNECTED_FUNCTION"
  | "INCORRECT_FORMULA"
  | "DUPLICATED_RULE"
  | "UNCONFIGURED_RULE"
  | "BROKEN_EDGE_FUNCTION"
  | "UNVERIFIED_PROVENANCE";

export type FindingStatus =
  "OPEN" | "OWNER_REVIEW" | "CONFIRMED_INTENTIONAL" | "RESOLVED";

export interface CodeFinding {
  id: string;
  layer: string;
  type: FindingType;
  location: string;
  evidence: string;
  proposed_fix: string | null;
  status: FindingStatus;
  created_date: string;
  updated_date: string;
}

export async function listCodeFindings(): Promise<CodeFinding[]> {
  const { data, error } = await supabase
    .from("archie_code_findings")
    .select("*")
    .order("updated_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CodeFinding[];
}

/** Owner disposition of a finding — a real status transition. */
export async function setFindingStatus(
  id: string,
  status: FindingStatus,
): Promise<void> {
  const { error } = await supabase
    .from("archie_code_findings")
    .update({ status, updated_date: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- calculation traces ----------------------------------------

export interface CalculationTrace {
  id: string;
  calculator: string;
  steps: Array<Record<string, unknown>>;
  valid: boolean;
  verdict: Record<string, unknown>;
  traced_at: string;
}

export async function listCalculationTraces(
  limit = 50,
): Promise<CalculationTrace[]> {
  const { data, error } = await supabase
    .from("archie_calculation_traces")
    .select("*")
    .order("traced_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CalculationTrace[];
}

// ---- patch proposals -------------------------------------------

export type PatchStatus =
  | "DRAFT"
  | "TESTED"
  | "AWAITING_OWNER_APPROVAL"
  | "APPROVED"
  | "APPLIED"
  | "REJECTED";

export interface PatchProposal {
  id: string;
  fixes: Array<Record<string, unknown>>;
  description: string;
  status: PatchStatus;
  test_evidence: Array<Record<string, unknown>>;
  approval_id: string | null;
  created_date: string;
  updated_date: string;
}

export async function listPatchProposals(): Promise<PatchProposal[]> {
  const { data, error } = await supabase
    .from("archie_patch_proposals")
    .select("*")
    .order("updated_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PatchProposal[];
}

/**
 * OWNER decision on a patch proposal. This is an Owner
 * Authority action: only reachable from an owner session (RLS
 * admin), and the database itself enforces that TESTED or later
 * statuses require real test evidence — ARCHIE cannot push an
 * untested patch to APPROVED even with a direct write.
 */
export async function decidePatchProposal(
  id: string,
  decision: "APPROVED" | "REJECTED",
  approvalId: string,
): Promise<void> {
  if (decision === "APPROVED" && !approvalId.trim()) {
    throw new Error("An approval reference is required to approve a patch.");
  }
  const { error } = await supabase
    .from("archie_patch_proposals")
    .update({
      status: decision,
      approval_id: decision === "APPROVED" ? approvalId.trim() : null,
      updated_date: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
