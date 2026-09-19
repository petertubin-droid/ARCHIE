import { describe, expect, it, vi, beforeEach } from "vitest";
// =========================================================
// P4 REGISTRATION FLOW TESTS — the activation layer that
// ties pure lifecycle logic to the persistence client.
// Mocked: supabase auth, p4-client persistence, app key.
// Real: the entire pure lifecycle (trusted-devices.ts).
// Locked here:
//   * enrollment stores the token DIGEST (SHA-256), never the
//     token; fingerprint derives from the app key (never IMEI)
//   * two-phase: enrollment is not authorization
//   * the stolen-device workflow suspends+revokes and records
//     a critical security event
//   * forbidden categories are hard-refused AND the attempt is
//     recorded as a security signal
//   * logout-everywhere revokes all devices with one event
//   * suspicious signals auto-suspend with the reasons in the
//     security feed
// =========================================================

const USER = "user-1";
type AuthResult = { data: { user: { id: string } | null } };
const authUser = vi.fn(async (): Promise<AuthResult> => ({
  data: { user: { id: USER } },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: () => authUser() } },
}));

vi.mock("@/lib/archie/stage1-client", () => ({
  getDeviceKey: () => "app-key-abc",
}));

const upserts: unknown[] = [];
const events: unknown[] = [];
let storedDevices: unknown[] = [];

vi.mock("@/lib/archie/mobile/p4-client", () => ({
  upsertTrustedDevice: async (device: unknown) => {
    upserts.push(device);
    storedDevices = storedDevices.some((d) => (d as { id: string }).id === (device as { id: string }).id)
      ? storedDevices.map((d) =>
          (d as { id: string }).id === (device as { id: string }).id ? device : d,
        )
      : [...storedDevices, device];
    return { ok: true };
  },
  fetchTrustedDevices: async () => storedDevices,
  persistDataConsent: async () => ({ ok: true }),
  recordP4SecurityEvent: async (
    userId: string,
    event: Record<string, unknown>,
  ) => {
    events.push({ userId, ...event });
  },
}));

import {
  enrollThisP4Device,
  activateP4Device,
  revokeP4Device,
  rotateP4DeviceToken,
  logoutEverywhere,
  grantP4Category,
  revokeP4Category,
  setP4Consent,
  checkP4DeviceSignals,
  p4InteractionAllowed,
} from "@/lib/archie/mobile/p4-registration";
import type { TrustedDevice } from "@/lib/archie/mobile/p4-types";

beforeEach(() => {
  upserts.length = 0;
  events.length = 0;
  storedDevices = [];
  localStorage.clear();
});

async function enrolled(): Promise<TrustedDevice> {
  const res = await enrollThisP4Device("My phone");
  expect(res.ok).toBe(true);
  return res.device!;
}

describe("enrollment", () => {
  it("enrolls as ENROLLED (not authorized) with a SHA-256 token digest and app-key fingerprint", async () => {
    const d = await enrolled();
    expect(d.enrollment_state).toBe("ENROLLED");
    expect(p4InteractionAllowed(d)).toBe(false);
    // digest is a 64-char hex SHA-256 — never the raw token
    expect(d.token_digest).toMatch(/^[0-9a-f]{64}$/);
    // fingerprint derives from the app key + user, never IMEI
    expect(d.fingerprint).not.toMatch(/imei|serial/i);
    expect(d.permission_set).toEqual([]);
  });

  it("refuses to enroll when not signed in", async () => {
    authUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await enrollThisP4Device("X");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/signed in/i);
  });

  it("refuses an empty device name", async () => {
    const res = await enrollThisP4Device("   ");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name/i);
  });
});

describe("activation & rotation", () => {
  it("two-phase activation authorizes the device for ARCHIE interaction", async () => {
    const d = await enrolled();
    const res = await activateP4Device(d.id);
    expect(res.ok).toBe(true);
    expect(res.device!.enrollment_state).toBe("ACTIVE");
    expect(p4InteractionAllowed(res.device!)).toBe(true);
  });

  it("a device owned by ANOTHER user cannot be activated", async () => {
    const d = await enrolled();
    (d as { user_id: string }).user_id = "someone-else";
    const res = await activateP4Device(d.id);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only the device owner/i);
  });

  it("token rotation replaces the digest and records an event", async () => {
    const d = await enrolled();
    const before = d.token_digest;
    const res = await rotateP4DeviceToken(d.id);
    expect(res.ok).toBe(true);
    expect(res.device!.token_digest).not.toBe(before);
    expect(res.device!.token_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(events.some((e) => (e as { kind: string }).kind === "DEVICE_TOKEN_ROTATED")).toBe(true);
  });
});

describe("revocation", () => {
  it("the stolen-device workflow revokes terminally and records a CRITICAL event", async () => {
    const d = await enrolled();
    const res = await revokeP4Device(d.id, { stolen: true });
    expect(res.ok).toBe(true);
    expect(res.device!.enrollment_state).toBe("REVOKED");
    expect(p4InteractionAllowed(res.device!)).toBe(false);
    const ev = events.find((e) => (e as { kind: string }).kind === "TRUSTED_DEVICE_REVOKED");
    expect((ev as { severity: string }).severity).toBe("critical");
    // a revoked device cannot be reactivated
    const again = await activateP4Device(d.id);
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/cannot be reactivated/i);
  });

  it("logout everywhere revokes every device with a single event", async () => {
    await enrolled();
    await enrollThisP4Device("Second phone");
    const res = await logoutEverywhere();
    expect(res.ok).toBe(true);
    const all = storedDevices as TrustedDevice[];
    expect(all.length).toBe(2);
    expect(all.every((d) => d.enrollment_state === "REVOKED")).toBe(true);
    const ev = events.find((e) => (e as { message: string }).message.includes("2 device"));
    expect(ev).toBeTruthy();
  });
});

describe("permissions & consents", () => {
  it("grants a real category to an ACTIVE device", async () => {
    const d = await enrolled();
    await activateP4Device(d.id);
    const res = await grantP4Category(d.id, "MEASUREMENTS");
    expect(res.ok).toBe(true);
    expect(res.device!.permission_set).toEqual(["MEASUREMENTS"]);
    const rev = await revokeP4Category(d.id, "MEASUREMENTS");
    expect(rev.device!.permission_set).toEqual([]);
  });

  it("forbidden categories are hard-refused AND recorded as a security signal", async () => {
    const d = await enrolled();
    await activateP4Device(d.id);
    const res = await grantP4Category(d.id, "SILENT_MICROPHONE" as never);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a capability/i);
    expect((d as unknown as { permission_set: string[] }).permission_set).toEqual([]);
    const ev = events.find((e) => (e as { kind: string }).kind === "FORBIDDEN_CONSENT_REQUESTED");
    expect((ev as { severity: string }).severity).toBe("critical");
  });

  it("consent revocation records an info event", async () => {
    const d = await enrolled();
    const res = await setP4Consent({
      deviceId: d.id,
      category: "PHOTOGRAPHS",
      granted: false,
      explanation: "You withdrew photo access.",
    });
    expect(res.ok).toBe(true);
    expect(events.some((e) => (e as { kind: string }).kind === "DATA_CONSENT_REVOKED")).toBe(true);
  });
});

describe("suspicious-activity auto-response", () => {
  it("3+ token failures suspend the device and surface the reasons", async () => {
    const d = await enrolled();
    await activateP4Device(d.id);
    const res = await checkP4DeviceSignals(d.id, { token_verification_failures: 3 });
    expect(res.ok).toBe(true);
    expect(res.device!.enrollment_state).toBe("SUSPENDED");
    expect(res.device!.security_status).toBe("SUSPICIOUS");
    expect(p4InteractionAllowed(res.device!)).toBe(false);
    const ev = events.find((e) => (e as { kind: string }).kind === "SUSPICIOUS_DEVICE_DETECTED");
    expect((ev as { message: string }).message).toMatch(/stolen token/);
  });

  it("clean signals leave the device untouched", async () => {
    const d = await enrolled();
    await activateP4Device(d.id);
    const res = await checkP4DeviceSignals(d.id, { token_verification_failures: 1 });
    expect(res.ok).toBe(true);
    expect(res.device!.enrollment_state).toBe("ACTIVE");
    expect(events.length).toBe(0);
  });
});
