// =========================================================
// ARCHIE LEGAL & PRIVACY CLIENT (real controls)
//
// © 2026 FRENZY. All rights reserved.
//
// Typed client for the archie-legal edge function: legal
// documents, governance, privacy consents, memory & data
// rights. Every call maps to a REAL operation on the
// backend — no local-only stand-ins.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export interface LegalDocSummary {
  doc_key: string;
  title: string;
  version: number;
  effective_date: string | null;
  published_at: string | null;
}

export interface LegalDocFull extends LegalDocSummary {
  id: string;
  body: string;
}

export interface GovernanceRule {
  rule_key: string;
  category: "permitted" | "prohibited" | "authority";
  statement: string;
}

export interface PrivacyConsent {
  consent_key: string;
  granted: boolean | null;
  value: Record<string, unknown> | null;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface MemoryFact {
  id: string;
  subject: string;
  predicate: string;
  object: unknown;
  confidence: number;
  status: string;
  provenance: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RightsRequest {
  id: string;
  kind: string;
  status: string;
  result_note: string | null;
  requested_at: string;
  completed_at: string | null;
}

async function invokeLegal<T>(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("archie-legal", {
    body,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: String(data.error) };
  return { ok: true, data: data as T };
}

// ---------------- public corpus ----------------
export async function fetchLegalDocs() {
  return invokeLegal<{
    documents: LegalDocSummary[];
    disclosure: string;
    copyright: string;
  }>({ action: "docs" });
}

export async function fetchLegalDoc(key: string) {
  return invokeLegal<{ document: LegalDocFull; copyright: string }>({
    action: "doc",
    key,
  });
}

export async function fetchGovernance() {
  return invokeLegal<{ rules: GovernanceRule[] }>({ action: "governance" });
}

// ---------------- consents ----------------
export async function fetchConsents() {
  return invokeLegal<{ consents: PrivacyConsent[] }>({ action: "consent_get" });
}

export async function setConsent(
  consent_key: string,
  granted: boolean,
  value?: Record<string, unknown>,
) {
  return invokeLegal<{ ok: boolean; pruned_facts: number }>({
    action: "consent_set",
    consent_key,
    granted,
    value: value ?? null,
    source: "pwa",
  });
}

// ---------------- memory & data rights ----------------
export async function searchMemory(q: string) {
  return invokeLegal<{ facts: MemoryFact[]; pruned: number }>({
    action: "memory_search",
    q,
  });
}

export async function correctMemory(id: string, object: unknown) {
  return invokeLegal<{ ok: boolean }>({
    action: "memory_correct",
    id,
    object,
  });
}

export async function deleteMemory(id: string) {
  return invokeLegal<{ ok: boolean }>({ action: "memory_delete", id });
}

export async function deleteMemorySubject(subject: string) {
  return invokeLegal<{ ok: boolean; deleted: number }>({
    action: "memory_delete_subject",
    subject,
  });
}

export async function clearConversations() {
  return invokeLegal<{
    deleted_conversations: number;
    deleted_messages: number;
  }>({ action: "clear_conversations" });
}

export async function exportMyData() {
  return invokeLegal<{ export: unknown }>({ action: "memory_export" });
}

export async function requestDeletion(
  kind:
    | "delete_account"
    | "delete_memory_category"
    | "clear_conversations"
    | "export",
  detail?: Record<string, unknown>,
) {
  return invokeLegal<{ ok: boolean; note?: string }>({
    action: "request_deletion",
    kind,
    detail: detail ?? {},
  });
}

export async function myRightsRequests() {
  return invokeLegal<{ requests: RightsRequest[] }>({ action: "my_requests" });
}

// ---------------- admin (document management) ----------------
export interface AdminLegalDoc {
  id: string;
  doc_key: string;
  version: number;
  title: string;
  status: "draft" | "approved" | "published" | "archived";
  effective_date: string | null;
  created_at: string;
}

export async function adminAllDocuments() {
  return invokeLegal<{
    documents: AdminLegalDoc[];
    keys: string[];
    copyright: string;
  }>({ action: "all_documents" });
}

export async function adminSaveDraft(key: string, title: string, body: string) {
  return invokeLegal<{ ok: boolean; version_id: string; version: number }>({
    action: "save_draft",
    key,
    title,
    body,
  });
}

export async function adminApprove(id: string) {
  return invokeLegal<{ ok: boolean }>({ action: "approve", id });
}

export async function adminPublish(id: string, effective_date?: string) {
  return invokeLegal<{ ok: boolean; effective_date: string }>({
    action: "publish",
    id,
    effective_date,
  });
}

export async function adminHistory(key: string) {
  return invokeLegal<{
    versions: AdminLegalDoc[];
    events: {
      id: string;
      version: number;
      event: string;
      actor: string | null;
      created_at: string;
    }[];
  }>({ action: "history", key });
}
