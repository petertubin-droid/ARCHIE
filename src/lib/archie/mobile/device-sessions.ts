// =========================================================
// FRELUX PHASE 8b, DEVICE SESSIONS & STOLEN-PHONE DEFENSE
//
// Every device the user signs in on registers a session row.
// From any device the user can:
//   * revoke a single session (a stolen phone)
//   * revoke ALL other sessions instantly
// A revoked session is checked on app open: the client signs
// the user out and clears local protected caches. The phone
// is never the only copy of protected data, ciphertext lives
// in the private archie-protected bucket, and decryption needs
// the user's passphrase, which is never stored.
//
// This complements (never replaces) Android's native
// anti-theft mechanisms.
// =========================================================
import { supabase } from "@/lib/supabase";
import { clearLocalProtectedCache, LOCAL_CACHE_PREFIX } from "./vault";
import { recordSecurityEvent } from "./security-events";
import type { ArchieSession } from "./types";

/** Stable, non-covert fingerprint: plain device characteristics. */
export function computeDeviceFingerprint(): string {
  const nav =
    typeof navigator !== "undefined"
      ? navigator
      : ({ userAgent: "unknown" } as Navigator);
  const screen_ =
    typeof screen !== "undefined"
      ? screen
      : { width: 0, height: 0, colorDepth: 0 };
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
  const raw = [
    nav.userAgent,
    (nav as Navigator & { platform?: string }).platform ?? "",
    screen_.width,
    screen_.height,
    screen_.colorDepth ?? 0,
    tz,
  ].join("|");
  // djb2, stable, non-cryptographic is fine (identifier, not secret)
  let h = 5381;
  for (let i = 0; i < raw.length; i++)
    h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `fp-${h.toString(16)}-${raw.length}`;
}

export async function registerCurrentSession(
  userId: string,
  deviceLabel: string,
): Promise<ArchieSession> {
  const fingerprint = computeDeviceFingerprint();
  const { data: existing } = await supabase
    .from("frelux_security_sessions")
    .select("id, fingerprint, revoked")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing && !existing.revoked) {
    const { data, error } = await supabase
      .from("frelux_security_sessions")
      .update({
        last_seen: new Date().toISOString(),
        current: true,
        device_label: deviceLabel,
      })
      .eq("id", existing.id)
      .select(
        "id, device_label, fingerprint, current, revoked, revoked_at, last_seen, created_date",
      )
      .single();
    if (error) throw new Error(error.message);
    return data as ArchieSession;
  }

  if (existing?.revoked) {
    // Same device re-registering after a revocation, the user
    // deliberately signed back in on this device.
    await recordSecurityEvent(userId, {
      kind: "RECOVERY_COMPLETED",
      severity: "warning",
      message: `Device "${deviceLabel}" signed back in after a previous revocation. If this was not you, revoke all sessions now.`,
    });
  } else {
    await recordSecurityEvent(userId, {
      kind: "NEW_DEVICE",
      severity: "info",
      message: `New device registered: "${deviceLabel}". If this was not you, revoke it in Security.`,
    });
  }

  const { data, error } = await supabase
    .from("frelux_security_sessions")
    .insert({
      user_id: userId,
      device_label: deviceLabel,
      fingerprint,
      current: true,
    })
    .select(
      "id, device_label, fingerprint, current, revoked, revoked_at, last_seen, created_date",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as ArchieSession;
}

export async function fetchSessions(userId: string): Promise<ArchieSession[]> {
  const { data, error } = await supabase
    .from("frelux_security_sessions")
    .select(
      "id, device_label, fingerprint, current, revoked, revoked_at, last_seen, created_date",
    )
    .eq("user_id", userId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieSession[];
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("frelux_security_sessions")
    .update({
      revoked: true,
      revoked_at: new Date().toISOString(),
      current: false,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await recordSecurityEvent(userId, {
    kind: "SESSION_REVOKED",
    severity: "warning",
    message:
      "A device session was revoked. That device will be signed out and its local protected cache cleared.",
  });
}

export async function revokeAllOtherSessions(userId: string): Promise<number> {
  const fp = computeDeviceFingerprint();
  const { data, error } = await supabase
    .from("frelux_security_sessions")
    .update({
      revoked: true,
      revoked_at: new Date().toISOString(),
      current: false,
    })
    .eq("user_id", userId)
    .eq("revoked", false)
    .neq("fingerprint", fp)
    .select("id");
  if (error) throw new Error(error.message);
  await recordSecurityEvent(userId, {
    kind: "ALL_SESSIONS_REVOKED",
    severity: "critical",
    message:
      "All other device sessions were revoked. If your phone was stolen, its cached data is now ciphertext without access.",
  });
  return data?.length ?? 0;
}

/**
 * Stolen-phone check, call on app open. If THIS device's session
 * was revoked remotely, sign out and clear every local protected
 * cache immediately.
 */
export async function validateCurrentSession(
  userId: string,
): Promise<{ valid: boolean; revoked: boolean }> {
  const fp = computeDeviceFingerprint();
  const { data } = await supabase
    .from("frelux_security_sessions")
    .select("revoked")
    .eq("user_id", userId)
    .eq("fingerprint", fp)
    .order("created_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { valid: true, revoked: false };
  if (data.revoked) {
    await clearLocalProtectedCache();
    try {
      await supabase.auth.signOut();
    } catch {
      /* already signed out */
    }
    return { valid: false, revoked: true };
  }
  return { valid: true, revoked: false };
}

export { LOCAL_CACHE_PREFIX };
