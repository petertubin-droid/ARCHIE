// =========================================================
// ARCHIE WHATSAPP ASSISTANT CLIENT (real admin controls)
//
// © 2026 FRENZY. All rights reserved.
//
// Typed client for the archie-whatsapp edge function: the
// Admin Control Center's WhatsApp Assistant section. Every
// call maps to a REAL backend operation on the communication
// layer — no local-only stand-ins, no faked status.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

export interface WaSettings {
  enabled: boolean;
  owner_learning_mode: boolean;
  retention_days: number;
  updated_at: string;
}

export interface WaConfigPresence {
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  internalKeyConfigured: boolean;
  graphVersion: string;
}

export interface WaAccount {
  id: string;
  wa_id: string; // masked (last 4 digits) — full numbers never leave the server
  display_name: string | null;
  role: "owner" | "authorized" | "family" | "customer";
  status: "pending" | "active" | "revoked";
  learning_mode: boolean;
  memory_permission: boolean;
  last_message_at: string | null;
  created_at: string;
}

export interface WaStatus {
  settings: WaSettings;
  config: WaConfigPresence;
  accounts: WaAccount[];
  messages7d: number;
  sendErrors7d: number;
  lastInboundAt: string | null;
  lastWebhookEventAt: string | null;
}

export interface WaTestResult {
  connected: boolean;
  reason?: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
}

export interface WaMessageLog {
  id: string;
  direction: "in" | "out";
  media_type: string;
  body: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface WaReminder {
  id: string;
  kind: "reminder" | "task";
  note: string;
  due_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

async function invokeWa<T>(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("archie-whatsapp", {
    body,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: String(data.error) };
  return { ok: true, data: data as T };
}

export function fetchWaStatus() {
  return invokeWa<WaStatus>({ action: "status" });
}

export function saveWaSettings(
  enabled: boolean,
  ownerLearningMode: boolean,
  retentionDays: number,
) {
  return invokeWa<Record<string, never>>({
    action: "settings_save",
    enabled,
    ownerLearningMode,
    retentionDays,
  });
}

export function addWaAccount(
  waId: string,
  displayName: string,
  role: WaAccount["role"],
  userId?: string,
) {
  return invokeWa<Record<string, never>>({
    action: "account_add",
    waId,
    displayName,
    role,
    userId,
  });
}

export function updateWaAccount(
  id: string,
  patch: {
    status?: WaAccount["status"];
    learningMode?: boolean;
    memoryPermission?: boolean;
    displayName?: string;
  },
) {
  return invokeWa<Record<string, never>>({
    action: "account_update",
    id,
    ...patch,
  });
}

export function revokeWaAccount(id: string) {
  return invokeWa<Record<string, never>>({ action: "account_revoke", id });
}

export function deleteWaAccount(id: string) {
  return invokeWa<Record<string, never>>({ action: "account_delete", id });
}

export function fetchWaMessages(limit = 50) {
  return invokeWa<{ messages: WaMessageLog[] }>({
    action: "messages",
    limit,
  });
}

export function fetchWaReminders() {
  return invokeWa<{ reminders: WaReminder[] }>({ action: "reminders" });
}

export function testWaConnection() {
  return invokeWa<WaTestResult>({ action: "test_connection" });
}

export function disconnectWa() {
  return invokeWa<{ note: string }>({ action: "disconnect" });
}
