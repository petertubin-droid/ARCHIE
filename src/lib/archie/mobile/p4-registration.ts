// =========================================================
// FRELUX PHASE 8 P4 — TRUSTED DEVICE REGISTRATION FLOW
//
// The activation layer for the P4 architecture: ties the
// pure lifecycle logic (trusted-devices.ts) to the RLS-shaped
// persistence client (p4-client.ts). Nothing here invents
// policy — every transition is decided by the pure functions
// and persisted verbatim.
//
// Device identity: the app key (getDeviceKey, random 128-bit
// in localStorage) — NEVER IMEI/hardware serials. The device
// token is generated locally, kept ONLY on this device
// (localStorage); the server stores its SHA-256 digest, so a
// database leak reveals nothing usable.
// =========================================================

import { supabase } from "@/lib/supabase";
import { getDeviceKey } from "@/lib/archie/stage1-client";
import {
  activateDevice,
  detectSuspiciousActivity,
  enrollDevice,
  grantDeviceCategory,
  logoutAllDevices,
  mayArchieInteract,
  revokeDevice,
  revokeDeviceCategory,
  rotateDeviceToken,
  stolenDeviceResponse,
  suspendDevice,
} from "./trusted-devices";
import {
  fetchTrustedDevices,
  persistDataConsent,
  recordP4SecurityEvent,
  upsertTrustedDevice,
} from "./p4-client";
import {
  FORBIDDEN_DEVICE_CATEGORIES,
  type DeviceDataConsent,
  type MobileDataCategory,
  type TrustedDevice,
} from "./p4-types";

const P4_TOKEN_STORAGE = "frelux.p4.device-token";

async function requireUser(): Promise<{ id: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  return user;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The device token lives ONLY on this device. The database
 *  sees its digest, never the token. */
function getThisDeviceToken(): string {
  try {
    const existing = localStorage.getItem(P4_TOKEN_STORAGE);
    if (existing) return existing;
    const token = mintToken();
    localStorage.setItem(P4_TOKEN_STORAGE, token);
    return token;
  } catch {
    // storage unavailable: ephemeral token (re-enroll needed per session)
    return mintToken();
  }
}

/** MINT A FRESH token and replace the stored one — rotation
 *  must invalidate the old token, never re-derive it. */
function rotateThisDeviceToken(): string {
  const token = mintToken();
  try {
    localStorage.setItem(P4_TOKEN_STORAGE, token);
  } catch {
    // storage unavailable: the new token is ephemeral
  }
  return token;
}

/** Identity by app key + user, hashed. Never IMEI. */
async function thisDeviceFingerprint(userId: string): Promise<string> {
  return sha256Hex(`appkey:${getDeviceKey()}:user:${userId}`);
}

export interface P4FlowResult {
  ok: boolean;
  error?: string;
  device?: TrustedDevice;
}

// ---------------------------------------------------------
// Enrollment & lifecycle
// ---------------------------------------------------------

/** Phase 1: enroll this device (NOT yet authorized for ARCHIE
 *  interaction — explicit activation is required). */
export async function enrollThisP4Device(
  deviceName: string,
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const token = getThisDeviceToken();
  try {
    const device = enrollDevice({
      user_id: user.id,
      device_name: deviceName,
      fingerprint: await thisDeviceFingerprint(user.id),
      token_digest: await sha256Hex(token),
    });
    const res = await upsertTrustedDevice(device);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, device };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Phase 2: the owner explicitly authorizes a device. */
export async function activateP4Device(
  deviceId: string,
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const res = activateDevice(device, user.id);
  if (!res.ok) return { ok: false, error: res.error ?? "Activation refused." };
  const saved = await upsertTrustedDevice(res.device!);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, device: res.device };
}

export async function suspendP4Device(
  deviceId: string,
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const suspended = suspendDevice(device);
  const saved = await upsertTrustedDevice(suspended);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, device: suspended };
}

/** Terminal revocation (lost/stolen/disowned). */
export async function revokeP4Device(
  deviceId: string,
  opts?: { stolen?: boolean },
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const outcome = opts?.stolen ? stolenDeviceResponse(device) : { device: revokeDevice(device), actions: [] };
  const saved = await upsertTrustedDevice(outcome.device);
  if (!saved.ok) return { ok: false, error: saved.error };
  await recordP4SecurityEvent(user.id, {
    kind: "TRUSTED_DEVICE_REVOKED",
    severity: "critical",
    message: `Device "${device.device_name}" revoked${opts?.stolen ? " (stolen-device workflow: sessions revoked, caches cleared)" : ""}.`,
  });
  return { ok: true, device: outcome.device };
}

/** Rotation invalidates the OLD token digest immediately. */
export async function rotateP4DeviceToken(
  deviceId: string,
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const newToken = rotateThisDeviceToken();
  const rotated = rotateDeviceToken(device, await sha256Hex(newToken));
  const saved = await upsertTrustedDevice(rotated);
  if (!saved.ok) return { ok: false, error: saved.error };
  await recordP4SecurityEvent(user.id, {
    kind: "DEVICE_TOKEN_ROTATED",
    severity: "info",
    message: `Token rotated for device "${device.device_name}". Old token is dead.`,
  });
  return { ok: true, device: rotated };
}

export async function logoutEverywhere(): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const { devices, revoked } = logoutAllDevices(list);
  for (const d of devices) {
    const saved = await upsertTrustedDevice(d);
    if (!saved.ok) return { ok: false, error: saved.error };
  }
  if (revoked > 0) {
    await recordP4SecurityEvent(user.id, {
      kind: "TRUSTED_DEVICE_REVOKED",
      severity: "warning",
      message: `Logout everywhere: ${revoked} device(s) revoked.`,
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------
// Granular per-device permissions & consents
// ---------------------------------------------------------

export async function grantP4Category(
  deviceId: string,
  category: MobileDataCategory,
): Promise<P4FlowResult> {
  // Hard refusal for categories that do not exist as
  // capabilities anywhere in the system — the attempt itself
  // is a security signal.
  if (FORBIDDEN_DEVICE_CATEGORIES.has(category)) {
    const user = await requireUser();
    if (!("error" in user)) {
      await recordP4SecurityEvent(user.id, {
        kind: "FORBIDDEN_CONSENT_REQUESTED",
        severity: "critical",
        message: `Blocked request for forbidden capability "${category}".`,
      });
    }
    return { ok: false, error: `"${category}" is not a capability that exists.` };
  }
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const res = grantDeviceCategory(device, category);
  if (!res.ok) return { ok: false, error: res.error ?? "Grant refused." };
  const saved = await upsertTrustedDevice(res.device!);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, device: res.device };
}

export async function revokeP4Category(
  deviceId: string,
  category: MobileDataCategory,
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const updated = revokeDeviceCategory(device, category);
  const saved = await upsertTrustedDevice(updated);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, device: updated };
}

/** Record a granular (device, category) data consent. */
export async function setP4Consent(args: {
  deviceId: string;
  category: MobileDataCategory;
  granted: boolean;
  explanation: string;
}): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const consent: DeviceDataConsent = {
    user_id: user.id,
    device_id: args.deviceId,
    category: args.category,
    granted: args.granted,
    explanation_shown: args.explanation,
    granted_at: new Date().toISOString(),
    revoked_at: args.granted ? null : new Date().toISOString(),
  };
  const res = await persistDataConsent(consent);
  if (!res.ok) return { ok: false, error: res.error };
  if (!args.granted) {
    await recordP4SecurityEvent(user.id, {
      kind: "DATA_CONSENT_REVOKED",
      severity: "info",
      message: `Consent revoked: ${args.category} on device ${args.deviceId}.`,
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------
// Listing & signals
// ---------------------------------------------------------

export async function listMyP4Devices(): Promise<
  { ok: true; devices: TrustedDevice[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const devices = await fetchTrustedDevices(user.id);
  return { ok: true, devices };
}

/** Run evidence-based suspicious-activity detection over the
 *  client-visible signals and persist the verdict. */
export async function checkP4DeviceSignals(
  deviceId: string,
  signals: Parameters<typeof detectSuspiciousActivity>[1],
): Promise<P4FlowResult> {
  const user = await requireUser();
  if ("error" in user) return { ok: false, error: user.error };
  const list = await fetchTrustedDevices(user.id);
  const device = list.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "Device not found." };
  const verdict = detectSuspiciousActivity(device, signals);
  if (verdict.suspicious) {
    const updated = suspendDevice(device);
    await upsertTrustedDevice(updated);
    await recordP4SecurityEvent(user.id, {
      kind: "SUSPICIOUS_DEVICE_DETECTED",
      severity: "warning",
      message: `Suspicious activity on "${device.device_name}": ${verdict.reasons.join("; ")}. Device suspended pending review.`,
    });
    return { ok: true, device: updated };
  }
  return { ok: true, device };
}

/** The interaction gate surfaced to the UI. */
export function p4InteractionAllowed(device: TrustedDevice): boolean {
  return mayArchieInteract(device);
}
