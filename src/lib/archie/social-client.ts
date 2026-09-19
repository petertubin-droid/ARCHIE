// =========================================================
// FRELUX ARCHIE EXTENSION, SOCIAL BRAND CENTER CLIENT
//
// Admin-session client for the Owner-only Social Intelligence
// & Brand Center. Tokens NEVER pass through this file: they
// live only in the server-side encrypted vault managed by the
// archie-social-connect edge function. This client deals in
// account METADATA and lifecycle actions only:
//   CONNECT → VIEW PERMISSIONS → SYNC → DISCONNECT → REVOKE
// =========================================================
import { supabase } from "@/lib/supabase";
import type { ConnectionStatus } from "./social-connections";

export interface SocialAccountRow {
  id: string;
  platform: string;
  account_handle: string;
  status: ConnectionStatus;
  scopes: string[];
  owner_explicitly_authorized: boolean;
  token_rotation_due: boolean;
  connected_at: string;
  synced_at: string | null;
}

function toRow(r: Record<string, unknown>): SocialAccountRow {
  return {
    id: String(r.id),
    platform: String(r.platform),
    account_handle: String(r.account_handle),
    status: (r.status as ConnectionStatus) ?? "DISCONNECTED",
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    owner_explicitly_authorized: Boolean(r.owner_explicitly_authorized),
    token_rotation_due: Boolean(r.token_rotation_due),
    connected_at: String(r.connected_at ?? ""),
    synced_at: r.synced_at ? String(r.synced_at) : null,
  };
}

export async function listSocialAccounts(): Promise<SocialAccountRow[]> {
  const { data, error } = await supabase
    .from("frelux_social_accounts")
    .select(
      "id,platform,account_handle,status,scopes,owner_explicitly_authorized,token_rotation_due,connected_at,synced_at",
    )
    .order("connected_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(toRow);
}

async function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token ?? "";
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/archie-social-connect/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** CONNECT, get the platform's official OAuth authorize URL.
 *  The Owner completes authorization on the platform itself. */
export async function getSocialAuthorizeUrl(platform: string): Promise<{
  ok: boolean;
  authorize_url?: string;
  error?: string;
}> {
  const res = await authedFetch(
    `authorize?platform=${encodeURIComponent(platform)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: String(res.body.error ?? `HTTP ${res.status}`) };
  return { ok: true, authorize_url: String(res.body.authorize_url) };
}

/** Complete the official OAuth code exchange, the token goes
 *  straight into the encrypted server-side vault. */
export async function completeSocialConnection(input: {
  platform: string;
  code: string;
  account_handle: string;
  scopes: string[];
  code_verifier?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch("callback", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      redirect_uri: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/archie-social-connect/callback`,
    }),
  });
  if (!res.ok) return { ok: false, error: String(res.body.error ?? `HTTP ${res.status}`) };
  return { ok: true };
}

/** SYNC, refresh account status and last-sync timestamp. */
export async function syncSocialAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_social_accounts")
    .update({ status: "SYNCED", synced_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** DISCONNECT, connection is marked disconnected; the
 *  encrypted token stays vaulted until REVOKE ACCESS (or
 *  reconnection rotates it). */
export async function disconnectSocialAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_social_accounts")
    .update({ status: "DISCONNECTED" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** REVOKE ACCESS, destroys the server-side vault entry and
 *  disconnects the account. */
export async function revokeSocialAccess(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch("revoke", {
    method: "POST",
    body: JSON.stringify({ account_id: id }),
  });
  if (!res.ok) return { ok: false, error: String(res.body.error ?? `HTTP ${res.status}`) };
  return { ok: true };
}

/** ARCHIE insight reports: observed platform data,
 *  recommendations and assumptions stored as SEPARATE labeled
 *  kinds, never merged. */
export interface SocialAnalysisRow {
  id: string;
  platform: string;
  observed_platform_data: string[];
  archie_recommendations: string[];
  archie_assumptions: string[];
  created_date: string;
}

export async function saveSocialAnalysis(input: {
  account_id: string;
  platform: string;
  observed_platform_data: string[];
  archie_recommendations: string[];
  archie_assumptions: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("frelux_social_analyses")
    .insert({
      account_id: input.account_id,
      platform: input.platform,
      observed_platform_data: input.observed_platform_data,
      archie_recommendations: input.archie_recommendations,
      archie_assumptions: input.archie_assumptions,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listSocialAnalyses(): Promise<SocialAnalysisRow[]> {
  const { data, error } = await supabase
    .from("frelux_social_analyses")
    .select(
      "id,platform,observed_platform_data,archie_recommendations,archie_assumptions,created_date",
    )
    .order("created_date", { ascending: false })
    .limit(25);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    platform: String(r.platform),
    observed_platform_data: Array.isArray(r.observed_platform_data)
      ? (r.observed_platform_data as string[])
      : [],
    archie_recommendations: Array.isArray(r.archie_recommendations)
      ? (r.archie_recommendations as string[])
      : [],
    archie_assumptions: Array.isArray(r.archie_assumptions)
      ? (r.archie_assumptions as string[])
      : [],
    created_date: String(r.created_date),
  }));
}
