// =========================================================
// FRELUX ARCHIE MIGRATION — INSTALLATION IDENTITY (spec §9)
//
// ARCHIE's identity is a LOGICAL id stored server-side, NOT a
// hardware id. The identity:
//   * survives moving phone → PC → VPS → cloud
//   * registers every environment that runs ARCHIE
//   * lets ARCHIE recognize a restored installation as the same
//     logical ARCHIE while treating the new machine as a NEW
//     trusted-execution-environment pending owner approval.
//
// Server table: archie_installations (owner-only RLS).
// The physical browser keeps only its own environment id in
// localStorage — losing the phone does not lose ARCHIE.
// =========================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export const ENVIRONMENT_STORAGE_KEY = "archie.installation.environment";

export interface ArchieInstallation {
  id: string;
  logicalId: string;
  environmentLabel: string;
  platform: string;
  status: "ACTIVE" | "PENDING_OWNER_APPROVAL" | "REVOKED";
  registeredAt: string;
}

interface InstallationRow {
  id: string;
  logical_id: string;
  environment_label: string;
  platform: string;
  status: string;
  registered_at: string;
}

function rowToInstallation(row: InstallationRow): ArchieInstallation {
  return {
    id: row.id,
    logicalId: row.logical_id,
    environmentLabel: row.environment_label,
    platform: row.platform,
    status: row.status as ArchieInstallation["status"],
    registeredAt: row.registered_at,
  };
}

function describeBrowserEnvironment(): {
  platform: string;
  label: string;
} {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const platform = isMobile ? "mobile-browser" : "desktop-browser";
  // Coarse, honest label — no tracking-grade fingerprinting
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  return { platform, label: `${platform} (${os})` };
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC4122 v4 fallback
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Get or create THIS browser's environment registration under
 * ARCHIE's logical identity. Creates the logical identity on
 * first use.
 */
export async function getOrCreateInstallation(
  supabase: SupabaseClient,
): Promise<ArchieInstallation> {
  const { platform, label } = describeBrowserEnvironment();

  let envId: string | null = null;
  try {
    envId = globalThis.localStorage?.getItem(ENVIRONMENT_STORAGE_KEY) ?? null;
  } catch {
    envId = null;
  }

  if (envId) {
    const { data } = await supabase
      .from("archie_installations")
      .select("id, logical_id, environment_label, platform, status, registered_at")
      .eq("id", envId)
      .maybeSingle();
    if (data) return rowToInstallation(data as InstallationRow);
    // Stale local id (server row deleted) → re-register below.
  }

  // Find an existing logical identity for the owner (first
  // installation in the owner's account).
  const { data: existing } = await supabase
    .from("archie_installations")
    .select("id, logical_id, environment_label, platform, status, registered_at")
    .order("registered_at", { ascending: true })
    .limit(1);
  const logicalId = existing?.[0]
    ? (existing[0] as InstallationRow).logical_id
    : uuid();

  const newEnvId = uuid();
  const { data: created, error } = await supabase
    .from("archie_installations")
    .insert({
      id: newEnvId,
      logical_id: logicalId,
      environment_label: label,
      platform,
      status: "ACTIVE",
    })
    .select("id, logical_id, environment_label, platform, status, registered_at")
    .single();
  if (error || !created) {
    throw new Error(
      error?.message ?? "Could not register this environment for ARCHIE.",
    );
  }
  try {
    globalThis.localStorage?.setItem(ENVIRONMENT_STORAGE_KEY, newEnvId);
  } catch {
    /* private mode — identity still server-side */
  }
  return rowToInstallation(created as InstallationRow);
}

/**
 * Register a RESTORED environment from a migration package:
 * same logical identity, NEW environment row, explicitly
 * UNTRUSTED until the owner approves it (spec §10).
 */
export async function registerRestoredEnvironment(
  supabase: SupabaseClient,
  logicalId: string,
): Promise<ArchieInstallation> {
  const { platform, label } = describeBrowserEnvironment();
  const newEnvId = uuid();
  const { data: created, error } = await supabase
    .from("archie_installations")
    .insert({
      id: newEnvId,
      logical_id: logicalId,
      environment_label: `${label} — restored from migration package`,
      platform,
      status: "PENDING_OWNER_APPROVAL",
    })
    .select("id, logical_id, environment_label, platform, status, registered_at")
    .single();
  if (error || !created) {
    throw new Error(
      error?.message ?? "Could not register the restored environment.",
    );
  }
  try {
    globalThis.localStorage?.setItem(ENVIRONMENT_STORAGE_KEY, newEnvId);
  } catch {
    /* ignore */
  }
  return rowToInstallation(created as InstallationRow);
}
