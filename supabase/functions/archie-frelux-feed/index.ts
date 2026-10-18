// =========================================================
// ARCHIE TREE FEED (owner directive 2026-10-18)
//
// THE TREE METHODOLOGY — ARCHIE planted on FRELUX:
//   * POST (owner/admin only) = ROOTS: pulls FRELUX's
//     aggregate business signals (estimation usage, AI
//     feature usage, open knowledge gaps) and stores them as
//     candidate facts in frelux_archie_native_facts, where
//     the native engine loads them on boot. AGGREGATES ONLY —
//     no user ids, no per-user rows, no PII ever.
//   * GET (any authenticated FRELUX user) = OXYGEN: ARCHIE's
//     VALIDATED knowledge flows back out to FRELUX surfaces.
//     Validated facts only — nothing candidate is ever shown.
//
// The branches (web research, Gemini learning) live in the
// native engine's research chain; this function is the
// root-and-release surface of the tree.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import { verifyAuthorityJwt } from "../_shared/archie-ai/security/cross-project-auth.ts";
import {
  buildFeedFacts,
  formatValidatedKnowledge,
  type EstimationUsageRow,
  type FeatureUsageRow,
} from "./feed-core.ts";

const CORS = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { code: "UNAUTHORIZED", message: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");

  // Caller identity: FRELUX session first, cross-project owner
  // JWT as fallback (same pattern as archie-ingestion).
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth } = await caller.auth.getUser();
  let callerId: string | null = auth?.user?.id ?? null;
  if (!callerId) {
    const verified = await verifyAuthorityJwt(callerToken);
    if (verified) callerId = verified.sub;
  }
  if (!callerId) {
    return json(401, { code: "UNAUTHORIZED", message: "Invalid session." });
  }

  const service = createClient(supabaseUrl, serviceKey);

  // -------------------------------------------------------
  // OXYGEN RELEASE: any authenticated FRELUX user reads
  // ARCHIE's validated knowledge (never candidates).
  // -------------------------------------------------------
  if (req.method === "GET") {
    const { data: facts, error } = await service
      .from("frelux_archie_native_facts")
      .select("id,subject,predicate,object,confidence,provenance,status")
      .eq("status", "validated")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) {
      return json(500, { code: "FEED_READ_FAILED", message: "Knowledge read failed." });
    }
    const { data: lastRun } = await service
      .from("frelux_archie_tree_feed_runs")
      .select("ran_at,summary")
      .order("ran_at", { ascending: false })
      .limit(1);
    return json(200, {
      knowledge: formatValidatedKnowledge(facts ?? []),
      last_feed_run: lastRun?.[0] ?? null,
    });
  }

  if (req.method !== "POST") {
    return json(405, { code: "INVALID_METHOD", message: "GET or POST only." });
  }

  // -------------------------------------------------------
  // ROOTS: owner/admin only. Pull aggregate FRELUX signals.
  // -------------------------------------------------------
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();
  if (profile?.role !== "admin") {
    return json(403, {
      code: "UNAUTHORIZED",
      message: "Admin authorization required for the tree feed.",
    });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: usage, error: usageErr } = await service
    .from("estimation_usage_daily")
    .select("usage_date,uses_consumed")
    .gte("usage_date", since);
  if (usageErr) {
    return json(500, { code: "USAGE_READ_FAILED", message: "Usage aggregate read failed." });
  }

  const { data: features, error: featuresErr } = await service.rpc(
    "archie_tree_feature_usage_30d",
  );
  if (featuresErr) {
    // Honest degradation: the aggregate RPC may not exist yet —
    // fall back to a plain aggregate read of ai_feature_usage.
    const { data: fallback, error: fbErr } = await service
      .from("ai_feature_usage")
      .select("feature_key,credits_spent")
      .gte("created_at", since);
    if (fbErr) {
      return json(500, { code: "FEATURE_READ_FAILED", message: "Feature usage read failed." });
    }
    const grouped = new Map<string, { feature_key: string; credits_spent: number; runs: number }>();
    for (const row of fallback ?? []) {
      const key = row.feature_key as string;
      const agg = grouped.get(key) ?? {
        feature_key: key,
        credits_spent: 0,
        runs: 0,
      };
      agg.credits_spent += row.credits_spent as number;
      agg.runs += 1;
      grouped.set(key, agg);
    }
    features = Array.from(grouped.values());
  }

  const { data: gaps, error: gapsErr } = await service
    .from("frelux_archie_knowledge_gaps")
    .select("id,question,times_seen,last_seen")
    .eq("resolved", false)
    .order("times_seen", { ascending: false })
    .limit(10);
  if (gapsErr) {
    return json(500, { code: "GAPS_READ_FAILED", message: "Knowledge gap read failed." });
  }

  const feedFacts = buildFeedFacts(
    (usage ?? []) as EstimationUsageRow[],
    (features ?? []) as FeatureUsageRow[],
    (gaps ?? []).length,
  );

  let factsWritten = 0;
  for (const fact of feedFacts) {
    const { error: upsertErr } = await service
      .from("frelux_archie_native_facts")
      .upsert(fact, { onConflict: "id" });
    if (!upsertErr) factsWritten += 1;
  }

  const summary = `Feed run: ${factsWritten} candidate facts, ${
    (usage ?? []).length
  } usage days, ${((features ?? []) as FeatureUsageRow[]).length} features, ${
    (gaps ?? []).length
  } open gaps. Roots drank; branches have the gap list to research.`;

  const { error: runErr } = await service
    .from("frelux_archie_tree_feed_runs")
    .insert({
      facts_written: factsWritten,
      usage_rows_read: (usage ?? []).length,
      feature_rows_read: ((features ?? []) as FeatureUsageRow[]).length,
      gaps_open: (gaps ?? []).length,
      summary,
    });
  if (runErr) {
    // The facts are the point; the audit row failing must not
    // erase an honest success — report it loudly instead.
    return json(200, {
      ok: true,
      facts_written: factsWritten,
      audit_row: "FAILED",
      gaps: gaps ?? [],
      summary,
    });
  }

  return json(200, {
    ok: true,
    facts_written: factsWritten,
    gaps: gaps ?? [],
    summary,
  });
});
