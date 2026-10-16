// =========================================================
// ARCHIE WEB RESEARCH — CLIENT
//
// Typed access to the owner-gated archie-research edge
// function: the REAL research register (candidate web
// findings + researched vocabulary) and the owner's
// validation verdicts. The underlying tables are
// service-role-only, so the UI reaches them exclusively
// through the function — no direct table reads.
// =========================================================

import { supabase } from "@/lib/supabase";

/** A candidate web finding with full provenance. */
export interface ResearchFinding {
  id: string;
  query: string;
  title: string | null;
  snippet: string | null;
  url: string | null;
  confidence: number;
  status: "candidate" | "validated" | "uncertain" | string;
  provenanceNote: string | null;
  verifiedBy: string[];
  updatedAt: string;
}

/** A researched vocabulary term (frelux_vocabulary, source=research). */
export interface ResearchedTerm {
  term: string;
  meaning: string | null;
  provenance: string;
  confidence: number;
  timesSeen: number;
  updatedAt: string;
}

export interface ResearchRegister {
  findings: ResearchFinding[];
  vocabulary: ResearchedTerm[];
  vocabularyError?: string;
  counts: {
    total: number;
    candidate: number;
    validated: number;
    uncertain: number;
  };
  checkedAt: string;
}

/** The full research register with honest status counts. */
export async function listResearchRegister(): Promise<ResearchRegister> {
  const { data, error } = await supabase.functions.invoke(
    "archie-research",
    { method: "GET" },
  );
  if (error) throw new Error(error.message);
  const body = data as Omit<ResearchRegister, "vocabularyError"> & {
    vocabulary_error?: string;
    checked_at: string;
  };
  return {
    findings: body.findings ?? [],
    vocabulary: body.vocabulary ?? [],
    vocabularyError: body.vocabulary_error,
    counts: body.counts,
    checkedAt: body.checked_at,
  };
}

/** The owner's verdict on one research finding.
 *  validate = promote to validated with a real verification
 *  event; reject = park as uncertain. Nothing is deleted. */
export async function decideResearchFinding(
  factId: string,
  action: "validate" | "reject",
): Promise<{ ok: true; status: string }> {
  const { data, error } = await supabase.functions.invoke(
    "archie-research",
    { method: "POST", body: { fact_id: factId, action } },
  );
  if (error) throw new Error(error.message);
  const body = data as { ok?: boolean; status?: string; error?: string };
  if (!body?.ok) throw new Error(body?.error ?? "Verdict failed");
  return { ok: true, status: body.status ?? "" };
}
