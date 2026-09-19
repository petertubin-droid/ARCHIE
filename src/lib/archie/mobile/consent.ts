// =========================================================
// FRELUX PHASE 8b, MOBILE CONSENT MANAGER
//
// One consent record per capability per user. Every device
// capability goes through checkCapabilityConsent(), ARCHIE
// never touches a device feature without an explicit grant,
// and denial is always graceful.
// =========================================================
import { supabase } from "@/lib/supabase";
import { FREE_CAPABILITY_KEYS } from "./capabilities";
import type { ArchieConsent, ArchieMobileCapability } from "./types";

const CACHE_KEY = (userId: string) => `frelux:mobile-consents:${userId}`;

export async function fetchConsents(
  userId: string,
): Promise<Record<ArchieMobileCapability, ArchieConsent>> {
  const { data, error } = await supabase
    .from("frelux_archie_mobile_consents")
    .select("capability, granted, granted_at")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const map = {} as Record<ArchieMobileCapability, ArchieConsent>;
  for (const cap of FREE_CAPABILITY_KEYS) {
    map[cap] = { capability: cap, granted: false, granted_at: null };
  }
  for (const row of data ?? []) {
    map[row.capability as ArchieMobileCapability] = {
      capability: row.capability,
      granted: row.granted,
      granted_at: row.granted_at,
    };
  }
  try {
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(map));
  } catch {
    /* cache is best-effort only */
  }
  return map;
}

export function loadCachedConsents(
  userId: string,
): Record<ArchieMobileCapability, ArchieConsent> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(userId));
    return raw
      ? (JSON.parse(raw) as Record<ArchieMobileCapability, ArchieConsent>)
      : null;
  } catch {
    return null;
  }
}

export async function grantCapability(
  userId: string,
  capability: ArchieMobileCapability,
): Promise<void> {
  const { error } = await supabase.from("frelux_archie_mobile_consents").upsert(
    {
      user_id: userId,
      capability,
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,capability" },
  );
  if (error) throw new Error(error.message);
}

export async function revokeCapability(
  userId: string,
  capability: ArchieMobileCapability,
): Promise<void> {
  const { error } = await supabase.from("frelux_archie_mobile_consents").upsert(
    {
      user_id: userId,
      capability,
      granted: false,
      granted_at: null,
      revoked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,capability" },
  );
  if (error) throw new Error(error.message);
}
