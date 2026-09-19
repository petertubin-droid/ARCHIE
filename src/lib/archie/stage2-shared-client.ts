// =========================================================
// FRELUX ARCHIE STAGE 2 — SHARED-WITH-ME CLIENT
//
// The read path for invited family members / trusted people
// (spec §28). Isolation is enforced SERVER-SIDE by the
// SECURITY DEFINER RPCs (they check person status, expiry and
// the exact permission on every call) and by the RLS policy
// that lets a person see ONLY their own person record. This
// client only reads — it never decides access itself.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

/** The signed-in user's own person record (RLS: person sees own record). */
export interface MyPersonhood {
  id: string;
  display_name: string;
  relation: string;
  status:
    "ACTIVE" | "REVOKED" | "PENDING_INVITE" | "PENDING_REQUEST" | "SUSPENDED";
  permissions: string[];
  access_expires_at: string | null;
}

export interface SharedConversation {
  id: string;
  title: string;
  created_date: string;
}

export interface SharedKnowledgeItem {
  id: string;
  topic: string;
  capability: string;
  version: number;
}

export async function fetchMyPersonhood(): Promise<MyPersonhood | null> {
  const supabase = await getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("frelux_archie_people")
    .select(
      "id, display_name, relation, status, permissions, access_expires_at",
    )
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyPersonhood) ?? null;
}

export async function fetchSharedConversations(): Promise<
  SharedConversation[]
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(
    "frelux_archie_shared_conversations",
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as SharedConversation[];
}

export async function fetchSharedKnowledge(): Promise<SharedKnowledgeItem[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("frelux_archie_shared_knowledge");
  if (error) throw new Error(error.message);
  return (data ?? []) as SharedKnowledgeItem[];
}
