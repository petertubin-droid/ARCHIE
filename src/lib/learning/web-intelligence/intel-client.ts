// =========================================================
// FRELUX PHASE 6.5 ALPHA, INTELLIGENCE CLIENT (Admin browser)
//
// Admin CRUD for approved external sources, crawl triggering,
// search discovery, and dashboard reads. All privileged
// crawling runs server-side in edge functions; no API keys
// ever reach this file or the frontend.
// =========================================================
import { supabase } from "@/lib/supabase";
import type { IntelligenceSource, CrawlRun } from "./types";

export interface SourceDraft {
  name: string;
  base_url: string;
  source_type: string;
  country: string;
  region?: string | null;
  language?: string;
  purpose?: string | null;
  allowed_paths: string[];
  crawl_frequency: string;
  max_pages: number;
  enabled: boolean;
  is_price_source: boolean;
  is_product_source: boolean;
  is_knowledge_source: boolean;
  learning_eligible: boolean;
  reliability: string;
  notes?: string | null;
}

// ---------------------------------------------------------
// Source registry CRUD (RLS: admin-only on the server)
// ---------------------------------------------------------
export async function listSources(): Promise<IntelligenceSource[]> {
  const { data, error } = await supabase
    .from("frelux_intelligence_sources")
    .select("*")
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as IntelligenceSource[];
}

export async function createSource(
  draft: SourceDraft,
): Promise<{ ok: boolean; error?: string }> {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase.from("frelux_intelligence_sources").insert({
    ...draft,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateSource(
  id: string,
  patch: Partial<SourceDraft>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_intelligence_sources")
    .update({ ...patch, updated_date: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Disabling a source blocks all crawling (server refuses disabled sources). */
export async function disableSource(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return updateSource(id, { enabled: false });
}

export async function enableSource(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return updateSource(id, { enabled: true });
}

export async function removeSource(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_intelligence_sources")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------
// Crawl control (privileged work happens in the edge function)
// ---------------------------------------------------------
export async function triggerCrawl(
  sourceId: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    message?: string;
    error?: string;
  }>("intel-crawl", { body: { sourceId, mode: "CRAWL" } });
  if (error) return { ok: false, error: error.message };
  return { ok: data?.ok ?? false, message: data?.message, error: data?.error };
}

export async function testSource(
  sourceId: string,
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    resolvedIp?: string;
    robotsStatus?: unknown;
    homepage?: unknown;
    error?: string;
  }>("intel-crawl", { body: { sourceId, mode: "TEST" } });
  if (error) return { ok: false, error: error.message };
  return {
    ok: data?.ok ?? false,
    result: data as unknown as Record<string, unknown>,
    error: data?.error,
  };
}

// ---------------------------------------------------------
// Search discovery (provider-abstracted; evidence candidates)
// ---------------------------------------------------------
export async function searchWeb(
  query: string,
): Promise<{
  ok: boolean;
  results?: Array<{
    title: string;
    url: string;
    snippet: string;
    provider: string;
    retrieved_at: string;
  }>;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    results?: Array<{
      title: string;
      url: string;
      snippet: string;
      provider: string;
      retrieved_at: string;
    }>;
    error?: string;
  }>("intel-search", { body: { query } });
  if (error) return { ok: false, error: error.message };
  return { ok: data?.ok ?? false, results: data?.results, error: data?.error };
}

// ---------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------
export async function listCrawlRuns(limit = 20): Promise<CrawlRun[]> {
  const { data, error } = await supabase
    .from("frelux_crawl_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CrawlRun[];
}

export async function listPriceObservations(limit = 100) {
  const { data, error } = await supabase
    .from("frelux_price_observations")
    .select("*")
    .order("retrieved_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function listExtractedProducts(limit = 100) {
  const { data, error } = await supabase
    .from("frelux_extracted_products")
    .select("*")
    .order("retrieved_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Search provider registry CRUD. */
export async function listSearchProviders() {
  const { data, error } = await supabase
    .from("frelux_search_providers")
    .select("*")
    .order("created_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function createSearchProvider(
  name: string,
  adapter: string,
  notes?: string,
) {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase.from("frelux_search_providers").insert({
    name,
    adapter,
    notes: notes ?? null,
    created_by: user?.id ?? null,
  });
  return { ok: !error, error: error?.message };
}

/** Trigger one verification pass on a crawled learning record :
 *  reuses the EXISTING Phase 6.5 review workflow. */
export async function advanceWebRecordToCandidate(
  recordId: string,
  reason: string,
) {
  const { advanceRecord } = await import("@/lib/learning/learning-client");
  return advanceRecord(recordId, "CANDIDATE", reason);
}
