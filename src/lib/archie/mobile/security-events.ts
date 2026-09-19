// =========================================================
// FRELUX PHASE 8b, SECURITY EVENTS / NOTIFICATIONS
//
// The security feed the user sees in ARCHIE Mobile → Security.
// Device notifications (Notification API) are shown only when
// the NOTIFICATIONS capability is consented AND the platform
// permission is granted, never silently.
// =========================================================
import { supabase } from "@/lib/supabase";
import type { SecurityEvent, SecurityEventKind } from "./types";

export async function recordSecurityEvent(
  userId: string,
  event: {
    kind: SecurityEventKind;
    severity: SecurityEvent["severity"];
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("frelux_security_events").insert({
    user_id: userId,
    kind: event.kind,
    severity: event.severity,
    message: event.message,
    metadata: event.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function fetchSecurityEvents(
  userId: string,
  limit = 30,
): Promise<SecurityEvent[]> {
  const { data, error } = await supabase
    .from("frelux_security_events")
    .select("id, kind, severity, message, metadata, read, created_date")
    .eq("user_id", userId)
    .order("created_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SecurityEvent[];
}

export async function markSecurityEventsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("frelux_security_events")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw new Error(error.message);
}

/**
 * Show a system notification. Requires BOTH the user's app-level
 * consent and the platform permission, normal Android model,
 * no bypass.
 */
export async function notifyUserDevice(
  title: string,
  body: string,
): Promise<{ shown: boolean; reason?: string }> {
  if (typeof Notification === "undefined") {
    return {
      shown: false,
      reason: "Notifications are not supported on this device.",
    };
  }
  if (Notification.permission !== "granted") {
    return { shown: false, reason: "Notification permission is not granted." };
  }
  try {
    new Notification(title, { body });
    return { shown: true };
  } catch {
    return { shown: false, reason: "The notification could not be shown." };
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}
