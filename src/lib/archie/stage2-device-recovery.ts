// =========================================================
// FRELUX ARCHIE STAGE 2 — LOST-DEVICE RECOVERY
//
// One guided Owner action for a lost/stolen device (spec §24):
//   1. revoke the device row (instant)
//   2. revoke EVERY other session — the lost phone's session
//      dies, its cached data becomes ciphertext without access
//   3. audit the recovery into the Owner's ARCHIE stream
//   4. return the re-enrollment steps for the replacement
//      device — protected data is restored from vault backups
//      (the phone is never the only copy).
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import { revokeAllOtherSessions } from "@/lib/archie/mobile/device-sessions";
import { recordAuditEvent } from "@/lib/archie/stage1-client";

export interface RecoveryResult {
  ok: boolean;
  revokedSessions: number;
  steps: string[];
}

export async function recoverLostDevice(
  deviceId: string,
  deviceLabel: string,
): Promise<RecoveryResult> {
  const supabase = await getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Sign in first.");

  // 1) Revoke the device row (RLS scopes this to the Owner).
  const { error: devErr } = await supabase
    .from("frelux_archie_devices")
    .update({ status: "REVOKED" })
    .eq("id", deviceId);
  if (devErr) throw new Error(devErr.message);

  // 2) Kill every OTHER session — includes the lost device.
  const revokedSessions = await revokeAllOtherSessions(user.id);

  // 3) Audit the recovery.
  await recordAuditEvent("archie.device.recovery", "WARNING", {
    device_id: deviceId,
    device_label: deviceLabel,
    revoked_sessions: revokedSessions,
    note: "Lost-device recovery: device revoked + all other sessions revoked.",
  });

  return {
    ok: true,
    revokedSessions,
    steps: [
      `Device "${deviceLabel}" revoked and ${revokedSessions} other session(s) terminated.`,
      "On the replacement device: sign in — it registers as PENDING.",
      "Return here and tap Trust to activate the replacement.",
      "Protected data is restored from vault backups — the lost phone was never the only copy.",
    ],
  };
}
