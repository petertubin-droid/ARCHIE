import { describe, expect, it } from "vitest";
// =========================================================
// FORENSIC PASS §15 — TRUSTED DEVICE LIFECYCLE (P4)
// The pure device-security layer (mobile/trusted-devices.ts)
// had ZERO direct tests. Its persistence layer (p4-client.ts)
// is being activated into the ArchieDevices UI — these tests
// lock the security invariants BEFORE wiring, so activation
// cannot silently weaken them:
//   * two-phase enrollment: enrolled ≠ authorized
//   * only the device owner can activate; revocation terminal
//   * ARCHIE interaction needs ACTIVE + TRUSTED + not revoked
//   * token digests: rotation invalidates the old digest
//   * permissions require an active device and never carry
//     over to replacement hardware
//   * suspicious-activity detection is evidence-based
//   * stolen-device response is revocation + honest actions
// =========================================================

import {
  enrollDevice,
  activateDevice,
  mayArchieInteract,
  verifyDeviceToken,
  rotateDeviceToken,
  revokeDevice,
  suspendDevice,
  detectSuspiciousActivity,
  grantDeviceCategory,
  revokeDeviceCategory,
  stolenDeviceResponse,
  replacementDeviceRecovery,
  logoutAllDevices,
} from "@/lib/archie/mobile/trusted-devices";
import type { TrustedDevice } from "@/lib/archie/mobile/p4-types";

const OWNER = "user-1";

function activeDevice(name = "Pixel 9"): TrustedDevice {
  return activateDevice(
    enrollDevice({
      user_id: OWNER,
      device_name: name,
      fingerprint: "fp-abc",
      token_digest: "digest-v1",
    }),
    OWNER,
  ).device!;
}

describe("two-phase enrollment", () => {
  it("enrollment alone is NOT authorization — ARCHIE may not interact yet", () => {
    const d = enrollDevice({
      user_id: OWNER,
      device_name: "Work phone",
      fingerprint: "fp",
      token_digest: "digest",
    });
    expect(d.enrollment_state).toBe("ENROLLED");
    expect(mayArchieInteract(d)).toBe(false);
  });

  it("only the device owner can activate", () => {
    const d = enrollDevice({
      user_id: OWNER,
      device_name: "My phone",
      fingerprint: "fp",
      token_digest: "digest",
    });
    expect(activateDevice(d, "attacker-77").ok).toBe(false);
    expect(activateDevice(d, OWNER).ok).toBe(true);
  });

  it("enrollment validation refuses empty name / missing fingerprint / missing digest", () => {
    expect(() =>
      enrollDevice({ user_id: OWNER, device_name: "  ", fingerprint: "fp", token_digest: "d" }),
    ).toThrow(/name/i);
    expect(() =>
      enrollDevice({ user_id: OWNER, device_name: "X", fingerprint: "", token_digest: "d" }),
    ).toThrow(/fingerprint/i);
    expect(() =>
      enrollDevice({ user_id: OWNER, device_name: "X", fingerprint: "fp", token_digest: "" }),
    ).toThrow(/digest/i);
  });

  it("the interaction gate is the full conjunction: ACTIVE + TRUSTED + never revoked", () => {
    const active = activeDevice();
    expect(mayArchieInteract(active)).toBe(true);
    const suspended = suspendDevice(active);
    expect(mayArchieInteract(suspended)).toBe(false);
    const revoked = revokeDevice(active);
    expect(mayArchieInteract(revoked)).toBe(false);
    const reactivated = activateDevice(revoked, OWNER);
    expect(reactivated.ok).toBe(false);
    expect(reactivated.error).toMatch(/cannot be reactivated/);
  });
});

describe("token digests", () => {
  it("a matching digest on an active device verifies", () => {
    const d = activeDevice();
    expect(verifyDeviceToken(d, "digest-v1").ok).toBe(true);
    expect(verifyDeviceToken(d, "wrong-digest").ok).toBe(false);
  });

  it("rotation invalidates the OLD digest — a stolen token dies at rotation", () => {
    const d = activeDevice();
    const rotated = rotateDeviceToken(d, "digest-v2");
    expect(verifyDeviceToken(rotated, "digest-v1").ok).toBe(false);
    expect(verifyDeviceToken(rotated, "digest-v2").ok).toBe(true);
  });

  it("verification is refused outright for non-interactive devices", () => {
    const suspended = suspendDevice(activeDevice());
    const res = verifyDeviceToken(suspended, "digest-v1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not authorized/i);
  });
});

describe("granular permissions", () => {
  it("granting requires an active trusted device", () => {
    const suspended = suspendDevice(activeDevice());
    expect(grantDeviceCategory(suspended, "PHOTOGRAPHS").ok).toBe(false);
  });

  it("grant is idempotent and revoke removes exactly that category", () => {
    const d = activeDevice();
    const g1 = grantDeviceCategory(d, "PHOTOGRAPHS").device!;
    expect(g1.permission_set).toEqual(["PHOTOGRAPHS"]);
    const g2 = grantDeviceCategory(g1, "PHOTOGRAPHS").device!;
    expect(g2.permission_set).toEqual(["PHOTOGRAPHS"]);
    const g3 = grantDeviceCategory(g2, "MEASUREMENTS").device!;
    expect(g3.permission_set).toEqual(["PHOTOGRAPHS", "MEASUREMENTS"]);
    const r = revokeDeviceCategory(g3, "PHOTOGRAPHS");
    expect(r.permission_set).toEqual(["MEASUREMENTS"]);
  });

  it("revoking the device clears the permission set entirely", () => {
    const d = grantDeviceCategory(activeDevice(), "PHOTOGRAPHS").device!;
    const revoked = revokeDevice(d);
    expect(revoked.permission_set).toEqual([]);
  });
});

describe("suspicious activity and the stolen-device workflow", () => {
  it("evidence-based detection: 3+ token failures, new region, stale rotation", () => {
    const d = activeDevice();
    expect(detectSuspiciousActivity(d, { token_verification_failures: 2 }).suspicious).toBe(false);
    const flagged = detectSuspiciousActivity(d, {
      token_verification_failures: 3,
      new_region: "Lagos",
      known_regions: ["Berlin"],
    });
    expect(flagged.suspicious).toBe(true);
    expect(flagged.security_status).toBe("SUSPICIOUS");
    expect(flagged.reasons.join(" ")).toMatch(/stolen token/);
    expect(flagged.reasons.join(" ")).toMatch(/new region/);
    const stale = detectSuspiciousActivity(d, {
      time_since_rotation_hours: 24 * 91,
    });
    expect(stale.suspicious).toBe(true);
  });

  it("clean signals leave the device trusted", () => {
    const d = activeDevice();
    const res = detectSuspiciousActivity(d, {
      token_verification_failures: 1,
      new_region: "Berlin",
      known_regions: ["Berlin"],
    });
    expect(res.suspicious).toBe(false);
    expect(res.security_status).toBe("TRUSTED");
  });

  it("the stolen-device response revokes terminally with honest, real actions", () => {
    const d = grantDeviceCategory(activeDevice(), "PHOTOGRAPHS").device!;
    const res = stolenDeviceResponse(d);
    expect(res.device.enrollment_state).toBe("REVOKED");
    expect(res.device.permission_set).toEqual([]);
    expect(mayArchieInteract(res.device)).toBe(false);
    // the workflow must mention session revocation AND that the
    // vault stays ciphertext (the phone is never the only copy)
    const actions = res.actions.join(" ").toLowerCase();
    expect(actions).toMatch(/revoke all sessions/);
    expect(actions).toMatch(/ciphertext/);
  });

  it("replacement recovery: permissions never carry over to new hardware", () => {
    const stolen = grantDeviceCategory(activeDevice(), "PHOTOGRAPHS").device!;
    const res = replacementDeviceRecovery({
      user_id: OWNER,
      device_name: "New phone",
      fingerprint: "fp-new",
      token_digest: "digest-new",
    });
    expect(res.device.id).not.toBe(stolen.id);
    expect(res.device.permission_set).toEqual([]);
    expect(res.device.enrollment_state).toBe("ENROLLED");
    expect(mayArchieInteract(res.device)).toBe(false);
    const actions = res.actions.join(" ").toLowerCase();
    expect(actions).toMatch(/do not carry over|never carry over/);
  });

  it("logout-all revokes every device and reports the count", () => {
    const devices = [activeDevice("A"), activeDevice("B"), suspendDevice(activeDevice("C"))];
    const res = logoutAllDevices(devices);
    expect(res.revoked).toBe(3);
    expect(res.devices.every((d) => d.enrollment_state === "REVOKED")).toBe(true);
    expect(res.devices.every((d) => !mayArchieInteract(d))).toBe(true);
  });
});
