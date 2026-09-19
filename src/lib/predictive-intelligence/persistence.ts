// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, PERSISTENCE & CACHING (§22)
//
// `project_predictive_analyses` stores the latest analysis per
// project with its input hash. getProjectAnalysis returns the
// cached analysis when the data is UNCHANGED, and recomputes
// (invalidating the cache) the moment any source row changes.
//
// RLS: owner-only. A user can never read another user's analysis
// (§21). All writes go through the user-scoped client.
// =========================================================

import { supabase } from "@/lib/supabase";
import type { ProjectPredictiveAnalysis } from "./types";
import { buildProjectSnapshot } from "./snapshot";
import { analyzeProject } from "./analysis";
import { snapshotInputHash } from "./snapshot-hash";

/** Cache validity window, an analysis older than this is refreshed
 *  even if the input hash matches, so freshness sections stay true. */
export const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 hours

interface StoredAnalysisRow {
  id: string;
  project_id: string;
  input_hash: string;
  result: ProjectPredictiveAnalysis;
  created_at: string;
}

export interface CachedAnalysis {
  analysis: ProjectPredictiveAnalysis;
  fromCache: boolean;
}

/**
 * The main runtime entry point: cached-when-fresh, recomputed-when-
 * changed. Errors from Supabase degrade gracefully to a direct
 * computation (the analysis itself is local + deterministic).
 */
export async function getProjectAnalysis(
  projectId: string,
  opts: { now?: string; forceRecompute?: boolean } = {},
): Promise<CachedAnalysis | null> {
  const snapshot = await buildProjectSnapshot(projectId, { now: opts.now });
  if (!snapshot) return null;

  const inputHash = snapshotInputHash(snapshot);

  if (!opts.forceRecompute) {
    const cached = await tryLoadCache(projectId, inputHash);
    if (cached) return { analysis: cached, fromCache: true };
  }

  const analysis = analyzeProject(snapshot);

  // Fire-and-forget cache write, failure never blocks the user.
  void trySaveCache(projectId, analysis);

  return { analysis, fromCache: false };
}

async function tryLoadCache(
  projectId: string,
  inputHash: string,
): Promise<ProjectPredictiveAnalysis | null> {
  try {
    const { data, error } = await supabase
      .from("project_predictive_analyses")
      .select("id, project_id, input_hash, result, created_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as StoredAnalysisRow;
    if (row.input_hash !== inputHash) return null; // source data changed → invalidate
    const age = Date.now() - new Date(row.created_at).getTime();
    if (!Number.isFinite(age) || age > CACHE_MAX_AGE_MS) return null; // stale by age
    if (!row.result || row.result.projectId !== projectId) return null; // corrupt guard
    return row.result;
  } catch {
    return null;
  }
}

async function trySaveCache(
  projectId: string,
  analysis: ProjectPredictiveAnalysis,
): Promise<void> {
  try {
    const { error } = await supabase.from("project_predictive_analyses").upsert(
      {
        project_id: projectId,
        input_hash: analysis.inputHash,
        result: analysis,
      },
      { onConflict: "project_id" },
    );
    if (error) {
      // Table may not be migrated yet, silent, non-blocking.
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[predictive-intelligence] cache write skipped:",
          error.message,
        );
      }
    }
  } catch {
    // network/offline, the analysis was already computed locally
  }
}
