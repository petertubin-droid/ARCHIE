// =========================================================
// FRELUX ARCHIE STAGE 2 — TERMINOBOOK ADMIN CLIENT (§16)
//
// Client helpers for the TerminologyBook admin surface:
// CRUD over frelux_archie_terminology (admin-only writes,
// enforced by RLS via public.is_admin()). The chat's
// archie-core injects VERIFIED terms only (LEARN → VERIFY →
// VERSION → USE), so verification is always a deliberate
// human action here — never automatic.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "REJECTED";

export interface TerminologyRow {
  id: string;
  domain: string;
  language_code: string;
  canonical_term: string;
  regional_term: string;
  meaning_note: string | null;
  verification_status: VerificationStatus;
  version: number;
  provenance: Record<string, unknown>;
  created_date: string;
  updated_date: string;
}

export interface TerminologyDraft {
  domain: string;
  language_code: string;
  canonical_term: string;
  regional_term: string;
  meaning_note?: string | null;
}

// Common ARCHIE knowledge domains for the dropdown.
export const TERMINOLOGY_DOMAINS = [
  "construction",
  "materials",
  "labour",
  "estimation",
  "property",
  "planning",
  "regulations",
  "general",
] as const;

/**
 * List terminology with optional filters. Admin sees all rows;
 * non-admins only see VERIFIED (RLS handles it transparently).
 */
export async function listTerminology(filter?: {
  language_code?: string;
  domain?: string;
  verification_status?: VerificationStatus;
  search?: string;
}): Promise<TerminologyRow[]> {
  const supabase = await getSupabase();
  let q = supabase
    .from("frelux_archie_terminology")
    .select(
      "id, domain, language_code, canonical_term, regional_term, meaning_note, verification_status, version, provenance, created_date, updated_date",
    )
    .order("language_code")
    .order("domain")
    .order("canonical_term")
    .limit(500);
  if (filter?.language_code) q = q.eq("language_code", filter.language_code);
  if (filter?.domain) q = q.eq("domain", filter.domain);
  if (filter?.verification_status)
    q = q.eq("verification_status", filter.verification_status);
  if (filter?.search) q = q.ilike("canonical_term", `%${filter.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load terminology: ${error.message}`);
  return (data ?? []) as TerminologyRow[];
}

/** Validate a draft before it reaches the DB (honest errors). */
export function validateTerminologyDraft(
  draft: TerminologyDraft,
): { ok: true } | { ok: false; error: string } {
  const domain = draft.domain?.trim();
  const code = draft.language_code?.trim();
  const canonical = draft.canonical_term?.trim();
  const regional = draft.regional_term?.trim();
  if (!domain) return { ok: false, error: "Domain is required." };
  if (!/^[a-z0-9_-]{2,40}$/.test(domain))
    return {
      ok: false,
      error: "Domain must be lowercase letters/digits (2–40 chars).",
    };
  if (!code || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(code))
    return { ok: false, error: "Language code must be like yo, ig, ha, pcm." };
  if (!canonical) return { ok: false, error: "Canonical term is required." };
  if (!regional)
    return { ok: false, error: "Regional term is required." };
  if (canonical.length > 120 || regional.length > 120)
    return { ok: false, error: "Terms must be 120 characters or fewer." };
  return { ok: true };
}

/** Create a terminology entry (starts UNVERIFIED, provenance recorded). */
export async function createTerminology(
  draft: TerminologyDraft,
): Promise<TerminologyRow> {
  const check = validateTerminologyDraft(draft);
  if (!check.ok) throw new Error(check.error);
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_terminology")
    .insert({
      domain: draft.domain.trim(),
      language_code: draft.language_code.trim(),
      canonical_term: draft.canonical_term.trim(),
      regional_term: draft.regional_term.trim(),
      meaning_note: draft.meaning_note?.trim() || null,
      verification_status: "UNVERIFIED",
      provenance: {
        source: "terminologybook_admin",
        action: "create",
      },
    })
    .select()
    .single();
  if (error) throw new Error(`Could not create entry: ${error.message}`);
  return data as TerminologyRow;
}

/** Update the text fields of an entry (never verification status). */
export async function updateTerminology(
  id: string,
  patch: Partial<Pick<TerminologyDraft, "domain" | "language_code" | "canonical_term" | "regional_term" | "meaning_note">>,
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_terminology")
    .update({ ...patch, updated_date: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not update entry: ${error.message}`);
}

/**
 * Deliberate verification action: VERIFIED (usable in chat)
 * or REJECTED. Only from this admin surface — never automatic.
 */
export async function setVerification(
  id: string,
  status: VerificationStatus,
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_terminology")
    .update({
      verification_status: status,
      provenance: { source: "terminologybook_admin", action: status === "VERIFIED" ? "verify" : "reject" },
      updated_date: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update verification: ${error.message}`);
}

export async function deleteTerminology(id: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_terminology")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Could not delete entry: ${error.message}`);
}

// ---------------------------------------------------------
// Starter set: common Nigerian construction terms seeded as
// UNVERIFIED for admin review (never auto-verified).
// ---------------------------------------------------------
export const STARTER_TERMS: TerminologyDraft[] = [
  // Nigerian construction Pidgin (standard site usage)
  { domain: "materials", language_code: "pcm", canonical_term: "concrete block", regional_term: "block", meaning_note: "Sandcrete hollow block (6\"/9\")" },
  { domain: "materials", language_code: "pcm", canonical_term: "reinforcement bar", regional_term: "iron rod", meaning_note: "Rebar, usually 12mm–16mm" },
  { domain: "materials", language_code: "pcm", canonical_term: "cement bag", regional_term: "bag of cement", meaning_note: "50kg bag, the common retail unit" },
  { domain: "materials", language_code: "pcm", canonical_term: "roofing sheet", regional_term: "roofing sheet", meaning_note: "Long-span aluminium or stone-coated" },
  { domain: "labour", language_code: "pcm", canonical_term: "mason", regional_term: "bricklayer", meaning_note: "Block-laying and concreting artisan" },
  { domain: "labour", language_code: "pcm", canonical_term: "site supervisor", regional_term: "site engineer", meaning_note: "Common local usage for the foreman/supervisor" },
  { domain: "construction", language_code: "pcm", canonical_term: "concrete casting", regional_term: "casting", meaning_note: "Pouring concrete, e.g. 'we dey cast deck'" },
  // Unambiguous standard-form entries; verify before use
  { domain: "materials", language_code: "yo", canonical_term: "cement", regional_term: "síméntì", meaning_note: "Loanword" },
  { domain: "construction", language_code: "yo", canonical_term: "roof", regional_term: "orí ilé", meaning_note: "" },
  { domain: "construction", language_code: "ig", canonical_term: "foundation", regional_term: "ntọala", meaning_note: "" },
  { domain: "construction", language_code: "ha", canonical_term: "cement", regional_term: "siminti", meaning_note: "Loanword" },
];

/** Seed the starter set (skips exact duplicates; all UNVERIFIED). */
export async function seedStarterTerms(): Promise<{ added: number; skipped: number }> {
  const existing = await listTerminology();
  const seen = new Set(
    existing.map((r) => `${r.language_code}:${r.canonical_term.toLowerCase()}`),
  );
  const fresh = STARTER_TERMS.filter(
    (t) => !seen.has(`${t.language_code}:${t.canonical_term.toLowerCase()}`),
  );
  for (const t of fresh) await createTerminology(t);
  return { added: fresh.length, skipped: STARTER_TERMS.length - fresh.length };
}
