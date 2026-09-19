// =========================================================
// FRELUX ARCHIE STAGE 2 — TRUSTED PEOPLE CLIENT
//
// Typed client for the archie-family edge function (spec
// §§25-28). All enforcement is server-side; this client only
// sends the Owner's commands.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export const PEOPLE_PERMISSIONS = [
  "ARCHIE_CHAT",
  "VOICE",
  "CAMERA",
  "IMAGES",
  "FILES",
  "DOCUMENTS",
  "LOCATION",
  "ASSIGNED_PROJECTS",
  "ASSIGNED_PROPERTIES",
  "SHARED_KNOWLEDGE",
  "PERSONAL_KNOWLEDGE",
  "OWNER_DATA",
  "OWNER_DASHBOARD",
  "ARCHIE_ADMINISTRATION",
  "DEVICE_MANAGEMENT",
  "SECURITY",
  "CRYPTO_INTELLIGENCE",
] as const;

export const PEOPLE_RELATIONS = [
  "FAMILY",
  "PARTNER",
  "SIBLING",
  "ARCHITECT",
  "ENGINEER",
  "QUANTITY_SURVEYOR",
  "CONTRACTOR",
  "CONSULTANT",
  "OTHER",
] as const;

export const ACCESS_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Permanent", hours: 0 },
] as const;

export interface ArchiePerson {
  id: string;
  display_name: string;
  relation: string;
  status:
    "PENDING_INVITE" | "PENDING_REQUEST" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  permissions: string[];
  access_expires_at: string | null;
  invited_at: string;
  activated_at: string | null;
  user_id: string | null;
}

export interface ArchieShare {
  person_id: string;
  resource_type: string;
  resource_id: string;
}

interface FamilyResponse<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  note?: string;
  data?: T;
}

async function callFamily<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<FamilyResponse<T>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("archie-family", {
    body,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Family service error." };
  return { ok: true, note: data.note, data };
}

/** Owner creates an invitation. Returns the code ONCE. */
export async function invitePerson(
  displayName: string,
  relation: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      code: string;
      peopleId: string;
      expiresAt: string;
      note: string;
    }
> {
  const res = await callFamily<{
    code: string;
    people_id: string;
    expires_at: string;
  }>({
    action: "invite",
    display_name: displayName,
    relation,
  });
  if (!res.ok) return { ok: false, error: res.error! };
  const d = res.data!;
  return {
    ok: true,
    code: d.code,
    peopleId: d.people_id,
    expiresAt: d.expires_at,
    note: res.note ?? "",
  };
}

/** Owner approves a pending request and configures permissions. */
export async function approvePerson(
  peopleId: string,
  permissions: string[],
  accessHours: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const res = await callFamily({
    action: "approve",
    people_id: peopleId,
    permissions,
    access_hours: accessHours,
  });
  return { ok: res.ok, error: res.error };
}

/** Owner updates permissions / status / expiry. */
export async function updatePerson(
  peopleId: string,
  patch: {
    permissions?: string[];
    status?: string;
    accessHours?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await callFamily({
    action: "update",
    people_id: peopleId,
    ...(patch.permissions !== undefined
      ? { permissions: patch.permissions }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.accessHours !== undefined
      ? { access_hours: patch.accessHours }
      : {}),
  });
  return { ok: res.ok, error: res.error };
}

/** Owner removes a person and all their shares permanently. */
export async function removePerson(
  peopleId: string,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  return callFamily({ action: "remove", people_id: peopleId });
}

/** Owner lists the whole people network + shares. */
export async function listPeople(): Promise<{
  ok: boolean;
  people?: ArchiePerson[];
  shares?: ArchieShare[];
  error?: string;
}> {
  const res = await callFamily<{
    people: ArchiePerson[];
    shares: ArchieShare[];
  }>({
    action: "list",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, people: res.data!.people, shares: res.data!.shares };
}
