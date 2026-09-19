// =========================================================
// FRELUX ARCHIE STAGE 2 — KNOWLEDGE VAULT CLIENT
//
// Owner controls for the Knowledge Core: inspect full
// provenance, edit (creates a new version — the old state is
// snapshotted server-side by trigger), change scope, roll
// back to any prior version. Every change requires an explicit
// change reason; nothing is edited silently (spec: inspect /
// edit / scope / version, human-in-the-loop §4).
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export interface KnowledgeItem {
  id: string;
  record_id: string;
  capability: string;
  scope: "GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER";
  scope_key: string | null;
  topic: string;
  content: Record<string, unknown>;
  evidence_state: string;
  confidence: number | null;
  version: number;
  status: string;
  change_reason: string | null;
  approved_by: string | null;
  approved_date: string | null;
  created_date: string;
  updated_date: string;
}

export interface KnowledgeHistoryEntry {
  id: string;
  item_id: string;
  version: number;
  topic: string;
  capability: string;
  scope: string;
  scope_key: string | null;
  evidence_state: string;
  confidence: number | null;
  change_reason: string | null;
  captured_at: string;
}

export const KNOWLEDGE_SCOPES = [
  { key: "GLOBAL", label: "Global", note: "Applies everywhere." },
  { key: "REGIONAL", label: "Regional", note: "Scoped to a region key." },
  { key: "PROJECT", label: "Project", note: "Scoped to one project." },
  { key: "PROPERTY", label: "Property", note: "Scoped to one property." },
  { key: "USER", label: "User", note: "Scoped to one user." },
] as const;

export async function listKnowledgeItems(
  limit = 100,
): Promise<KnowledgeItem[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_knowledge_items")
    .select(
      "id, record_id, capability, scope, scope_key, topic, content, evidence_state, confidence, version, status, change_reason, approved_by, approved_date, created_date, updated_date",
    )
    .order("updated_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeItem[];
}

export async function listKnowledgeHistory(
  itemId: string,
): Promise<KnowledgeHistoryEntry[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_knowledge_history")
    .select(
      "id, item_id, version, topic, capability, scope, scope_key, evidence_state, confidence, change_reason, captured_at",
    )
    .eq("item_id", itemId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeHistoryEntry[];
}

export interface KnowledgePatch {
  topic?: string;
  capability?: string;
  scope?: KnowledgeItem["scope"];
  scope_key?: string | null;
  content?: Record<string, unknown>;
}

/**
 * Save a change as a NEW VERSION. The trigger snapshots the
 * current state into history first; the item's version
 * increments and the change reason is stored on the row.
 */
export async function updateKnowledgeItem(
  itemId: string,
  patch: KnowledgePatch,
  reason: string,
): Promise<KnowledgeItem> {
  const trimmed = reason.trim();
  if (!trimmed)
    throw new Error(
      "A change reason is required — nothing is edited silently.",
    );
  const supabase = await getSupabase();
  const { data: current } = await supabase
    .from("frelux_knowledge_items")
    .select("version")
    .eq("id", itemId)
    .single();
  if (!current) throw new Error("Knowledge item not found.");

  const { data, error } = await supabase
    .from("frelux_knowledge_items")
    .update({
      ...patch,
      version: current.version + 1,
      change_reason: trimmed,
      updated_date: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select(
      "id, record_id, capability, scope, scope_key, topic, content, evidence_state, confidence, version, status, change_reason, approved_by, approved_date, created_date, updated_date",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as KnowledgeItem;
}

/**
 * Roll back to a prior version. The prior state is captured from
 * history, applied as a NEW version (so the rollback itself is
 * also versioned), and the reason records which version was
 * restored.
 */
export async function rollbackKnowledgeItem(
  itemId: string,
  toVersion: number,
): Promise<KnowledgeItem> {
  const supabase = await getSupabase();
  const { data: prior } = await supabase
    .from("frelux_archie_knowledge_history")
    .select(
      "version, topic, capability, scope, scope_key, content, evidence_state, confidence",
    )
    .eq("item_id", itemId)
    .eq("version", toVersion)
    .maybeSingle();
  if (!prior) throw new Error(`Version ${toVersion} not found in history.`);

  const { data: current } = await supabase
    .from("frelux_knowledge_items")
    .select("version")
    .eq("id", itemId)
    .single();
  if (!current) throw new Error("Knowledge item not found.");

  const { data, error } = await supabase
    .from("frelux_knowledge_items")
    .update({
      topic: prior.topic,
      capability: prior.capability,
      scope: prior.scope,
      scope_key: prior.scope_key,
      content: prior.content,
      evidence_state: prior.evidence_state,
      confidence: prior.confidence,
      version: current.version + 1,
      change_reason: `Owner rollback to version ${toVersion}.`,
      updated_date: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select(
      "id, record_id, capability, scope, scope_key, topic, content, evidence_state, confidence, version, status, change_reason, approved_by, approved_date, created_date, updated_date",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as KnowledgeItem;
}
