// =========================================================
// FRELUX PHASE 8 P4, TRUSTED DEVICE ARCHITECTURE
//
// A device must be EXPLICITLY ENROLLED and AUTHORIZED before
// ARCHIE can interact with it. Every device carries its own
// identity, token (digest only), permission set, security
// status and revocation state. Multiple devices are never
// treated as one unrestricted device.
//
// Pure lifecycle logic. Persistence lives in p4-client; the
// stolen-phone workflow ties into the Phase 8b session
// revocation + secure vault (the phone is never the only
// copy of protected data).
// =========================================================

import type {
  TrustedDevice,
  DeviceSecurityStatus,
  MobileDataCategory,
} from "./p4-types";

/** Enroll a device. Two-phase: enrollment alone is NOT
 *  authorization, the user must explicitly activate before
 *  ARCHIE may interact. */
export function enrollDevice(args: {
  user_id: string;
  device_name: string;
  fingerprint: string;
  token_digest: string;
  now?: string;
}): TrustedDevice {
  const name = args.device_name.trim();
  if (!name) throw new Error("A device requires a user-chosen name");
  if (!args.fingerprint) throw new Error("A device requires a fingerprint");
  if (!args.token_digest) throw new Error("A device requires a token digest");
  const now = args.now ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: args.user_id,
    device_name: name,
    fingerprint: args.fingerprint,
    enrollment_state: "ENROLLED",
    security_status: "TRUSTED",
    token_digest: args.token_digest,
    token_rotated_at: now,
    permission_set: [],
    enrolled_at: now,
    last_seen: now,
    revoked_at: null,
  };
}

/** Explicit user authorization, the second phase. Only the
 *  owner of the device (same user) can activate it. */
export function activateDevice(
  device: TrustedDevice,
  actor_user_id: string,
): { ok: boolean; error?: string; device?: TrustedDevice } {
  if (device.user_id !== actor_user_id) {
    return { ok: false, error: "Only the device owner can authorize a device" };
  }
  if (device.enrollment_state === "REVOKED") {
    return {
      ok: false,
      error: "A revoked device cannot be reactivated, enroll a new device",
    };
  }
  if (device.enrollment_state !== "ENROLLED") {
    return {
      ok: false,
      error: `Device is ${device.enrollment_state}, not awaiting activation`,
    };
  }
  return { ok: true, device: { ...device, enrollment_state: "ACTIVE" } };
}

/** THE interaction gate: ARCHIE may touch a device only when
 *  it is ACTIVE, TRUSTED and not revoked. */
export function mayArchieInteract(device: TrustedDevice): boolean {
  return (
    device.enrollment_state === "ACTIVE" &&
    device.security_status === "TRUSTED" &&
    device.revoked_at === null
  );
}

/** Token check: digest match + not revoked. The raw token is
 *  never stored, only its digest, a stolen token is checked
 *  against the CURRENT digest (rotation invalidates old). */
export function verifyDeviceToken(
  device: TrustedDevice,
  token_digest: string,
): { ok: boolean; error?: string } {
  if (!mayArchieInteract(device)) {
    return {
      ok: false,
      error: "Device is not authorized for ARCHIE interaction",
    };
  }
  if (token_digest !== device.token_digest) {
    return {
      ok: false,
      error: "Token does not match the current device token (rotated or stale)",
    };
  }
  return { ok: true };
}

/** Token rotation: invalidate the old token by replacing the
 *  digest. Rotation is the response to suspected compromise. */
export function rotateDeviceToken(
  device: TrustedDevice,
  new_token_digest: string,
  now?: string,
): TrustedDevice {
  if (!new_token_digest) throw new Error("A new token digest is required");
  return {
    ...device,
    token_digest: new_token_digest,
    token_rotated_at: now ?? new Date().toISOString(),
  };
}

/** Revoke a device (lost/stolen/disowned). Terminal, a new
 *  enrollment is required to use the hardware again. */
export function revokeDevice(
  device: TrustedDevice,
  now?: string,
): TrustedDevice {
  const t = now ?? new Date().toISOString();
  return {
    ...device,
    enrollment_state: "REVOKED",
    security_status: "UNTRUSTED",
    permission_set: [],
    revoked_at: t,
  };
}

/** Suspend a suspicious device pending user review. */
export function suspendDevice(device: TrustedDevice): TrustedDevice {
  return {
    ...device,
    enrollment_state: "SUSPENDED",
    security_status: "SUSPICIOUS",
  };
}

/** Suspicious-session detection: evidence-based signals raise
 *  the security status. Never a silent judgement, the flags
 *  are surfaced to the user as security alerts. */
export function detectSuspiciousActivity(
  device: TrustedDevice,
  signals: {
    token_verification_failures?: number;
    new_region?: string | null;
    known_regions?: readonly string[];
    rapid_reenrollments?: number;
    time_since_rotation_hours?: number;
  },
): {
  suspicious: boolean;
  security_status: DeviceSecurityStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if ((signals.token_verification_failures ?? 0) >= 3) {
    reasons.push("3+ token verification failures (possible stolen token)");
  }
  if (
    signals.new_region &&
    (signals.known_regions ?? []).length > 0 &&
    !signals.known_regions!.includes(signals.new_region)
  ) {
    reasons.push(`Sign-in from a new region (${signals.new_region})`);
  }
  if ((signals.rapid_reenrollments ?? 0) >= 3) {
    reasons.push(
      "3+ rapid enrollments in a short window (possible impersonation)",
    );
  }
  if ((signals.time_since_rotation_hours ?? 0) > 24 * 90) {
    reasons.push("Device token has not been rotated for over 90 days");
  }
  // FIX 59: a security status NEVER downgrades. The old code
  // reported TRUSTED for any device with no new signals — even
  // a device already flagged SUSPICIOUS (e.g. suspended pending
  // review). A verdict that resurrects trust on an already
  // flagged device is a lie any consumer (UI badge, audit log,
  // future persistence) would faithfully repeat. The current
  // non-trusted status is evidence in its own right.
  if (device.security_status === "UNTRUSTED") {
    reasons.push("Device was already marked untrusted");
  } else if (device.security_status === "SUSPICIOUS") {
    reasons.push(
      "Device was already flagged suspicious (suspension or prior detection stands until reviewed)",
    );
  }
  return {
    suspicious: reasons.length > 0,
    security_status: reasons.length > 0 ? "SUSPICIOUS" : "TRUSTED",
    reasons,
  };
}

/** Grant a data category to a device (narrowing/granular per
 *  device). Requires ACTIVE + TRUSTED. */
export function grantDeviceCategory(
  device: TrustedDevice,
  category: MobileDataCategory,
): { ok: boolean; error?: string; device?: TrustedDevice } {
  if (!mayArchieInteract(device)) {
    return {
      ok: false,
      error: "Only active trusted devices can hold permissions",
    };
  }
  if (device.permission_set.includes(category)) {
    return { ok: true, device };
  }
  return {
    ok: true,
    device: { ...device, permission_set: [...device.permission_set, category] },
  };
}

/** Revoke one category from a device. */
export function revokeDeviceCategory(
  device: TrustedDevice,
  category: MobileDataCategory,
): TrustedDevice {
  return {
    ...device,
    permission_set: device.permission_set.filter((c) => c !== category),
  };
}

/** The stolen-device workflow decision: revoke the device,
 *  revoke all its sessions, clear local caches via the 8b
 *  stolen-phone path, and alert. The vault stays safe :
 *  protected data is AES-GCM ciphertext needing the user's
 *  passphrase, which the thief does not have. */
export function stolenDeviceResponse(device: TrustedDevice): {
  device: TrustedDevice;
  actions: string[];
} {
  const revoked = revokeDevice(device);
  return {
    device: revoked,
    actions: [
      "revoke trusted device (terminal)",
      "revoke all sessions for this device (Phase 8b session revocation)",
      "clear local protected caches on next app open (Phase 8b validateCurrentSession)",
      "record a critical security event and notify the user",
      "protected vault data remains ciphertext, passphrase not present on the device",
    ],
  };
}

/** Replacement-device recovery: a NEW enrollment on new
 *  hardware; recovery of protected data comes from the cloud
 *  vault (authenticated + passphrase), never from the stolen
 *  phone. */
export function replacementDeviceRecovery(args: {
  user_id: string;
  device_name: string;
  fingerprint: string;
  token_digest: string;
}): { device: TrustedDevice; actions: string[] } {
  const device = enrollDevice(args);
  return {
    device,
    actions: [
      "enroll the replacement device (fresh identity + token)",
      "user activates it explicitly (two-phase enrollment)",
      "re-grant data categories one by one (permissions do NOT carry over)",
      "recover protected data from the cloud vault via authenticated recovery (Phase 8b vault)",
    ],
  };
}

export function logoutAllDevices(devices: TrustedDevice[]): {
  devices: TrustedDevice[];
  revoked: number;
} {
  const out = devices.map((d) => revokeDevice(d));
  return { devices: out, revoked: devices.length };
}
