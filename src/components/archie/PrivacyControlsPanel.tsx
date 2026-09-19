// =========================================================
// FRELUX ARCHIE PWA — PRIVACY CONTROLS PANEL (Phase 8 P4)
//
// Real owner-facing privacy rights over mobile-learned data:
//   * view isolation — a user only ever sees their own data
//   * deletion eligibility — approved global knowledge is
//     dissociated + flagged, never silently rewritten
//   * scope-change requests through the transition matrix
//   * device revocation as a privacy control (terminal)
//   * serving rules — an item answers only within its scope
// =========================================================

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  type MobileKnowledgeScope,
  type MobileLearning,
  type TrustedDevice,
} from "@/lib/archie/mobile/p4-types";
import {
  deleteEligibility,
  mayServeKnowledgeToUser,
  requestScopeChange,
  revokeDeviceAsPrivacyControl,
} from "@/lib/archie/mobile/privacy-controls";
import {
  deleteMobileLearning,
  fetchMobileLearnings,
  fetchTrustedDevices,
  persistMobileLearning,
  upsertTrustedDevice,
} from "@/lib/archie/mobile/p4-client";
import { ArchieBadge, ArchiePanel } from "@/components/archie/premium";

const ALL_SCOPES: MobileKnowledgeScope[] = [
  "PRIVATE",
  "PROJECT",
  "PROPERTY",
  "REGIONAL",
  "FRELUX_GLOBAL_CANDIDATE",
  "FRELUX_GLOBAL_APPROVED",
];

export default function PrivacyControlsPanel() {
  const { user } = useAuth();
  const [learnings, setLearnings] = useState<MobileLearning[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Serving-rule explainer state (mayServeKnowledgeToUser)
  const [scopeSim, setScopeSim] = useState<MobileKnowledgeScope>("PROJECT");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const [l, d] = await Promise.all([
        fetchMobileLearnings(user.id),
        fetchTrustedDevices(user.id),
      ]);
      setLearnings(l);
      setDevices(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your data.");
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeLearning(learning: MobileLearning) {
    if (!user?.id) return;
    setError("");
    setNotice("");
    // Eligibility is decided by privacy-controls, not the UI.
    const verdict = deleteEligibility(learning, user.id);
    if (!verdict.eligible) {
      setNotice(verdict.reason);
      return;
    }
    const res = await deleteMobileLearning(user.id, learning.id);
    if (!res.ok) {
      setError(res.error ?? "Deletion failed.");
      return;
    }
    setNotice(verdict.reason);
    await load();
  }

  async function changeScope(
    learning: MobileLearning,
    to: MobileKnowledgeScope,
  ) {
    if (!user?.id) return;
    setError("");
    setNotice("");
    const res = requestScopeChange(learning, to, user.id, {
      user_contributes: true,
    });
    if (!res.ok) {
      setError(res.error ?? "Scope change refused.");
      return;
    }
    await persistMobileLearning({ ...learning, scope: to });
    setNotice(`Scope set to ${to}.`);
    await load();
  }

  async function revokeDevice(device: TrustedDevice) {
    if (!user?.id) return;
    setError("");
    setNotice("");
    const res = revokeDeviceAsPrivacyControl(device, user.id);
    if (!res.ok || !res.device) {
      setError(res.error ?? "Revocation refused.");
      return;
    }
    const persist = await upsertTrustedDevice(res.device);
    if (!persist.ok) {
      setError(persist.error);
      return;
    }
    setNotice(
      `${device.device_name} revoked — every permission dropped immediately (terminal).`,
    );
    await load();
  }

  const serving = user
    ? mayServeKnowledgeToUser({
        requester_user_id: user.id,
        item_owner_user_id: user.id,
        item_scope: scopeSim,
        item_project_ref: "proj-1",
        item_property_ref: "prop-1",
        item_region: "NG",
        requester_project_refs: ["proj-1"],
        requester_property_refs: ["prop-1"],
        requester_region: "NG",
      })
    : null;

  return (
    <ArchiePanel className="p-4">
      <h3 className="font-semibold">
        P4 privacy controls — mobile-learned data
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        View isolation, real deletion, scope changes through the transition
        matrix, and device revocation as a privacy control.
      </p>

      {(notice || error) && (
        <div className="mt-2">
          <ArchieBadge tone={error ? "warning" : "accent"}>
            {error || notice}
          </ArchieBadge>
        </div>
      )}

      {/* ---- learned data + deletion/scope ---- */}
      <div className="mt-3 space-y-2">
        {learnings.length === 0 && (
          <p className="text-xs text-slate-400">
            No mobile-learned data yet — nothing to manage.
          </p>
        )}
        {learnings.map((l) => {
          const verdict = user ? deleteEligibility(l, user.id) : null;
          return (
            <div
              key={l.id}
              className="rounded-lg border border-border p-2 text-xs"
              data-testid={`privacy-learning-${l.pipeline_state}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{l.category}</span>
                <ArchieBadge tone="neutral">{l.pipeline_state}</ArchieBadge>
                {l.scope && (
                  <span className="text-slate-400">scope: {l.scope}</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={l.scope ?? ""}
                  onChange={(e) =>
                    void changeScope(l, e.target.value as MobileKnowledgeScope)
                  }
                  aria-label={`Scope for ${l.category}`}
                  className="rounded-md border bg-background px-2 py-1"
                >
                  <option value="">Change scope…</option>
                  {ALL_SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void removeLearning(l)}
                  disabled={busy || !verdict?.eligible}
                  className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
              {verdict && !verdict.eligible && (
                <p className="mt-1 text-[10px] text-amber-400">
                  {verdict.reason}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- device revocation ---- */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Revoke a device (privacy control)
        </h4>
        <div className="mt-2 space-y-1">
          {devices.length === 0 && (
            <p className="text-xs text-slate-400">No trusted devices.</p>
          )}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{d.device_name}</span>
              <span className="flex items-center gap-2">
                <ArchieBadge
                  tone={
                    d.enrollment_state === "REVOKED" ? "warning" : "positive"
                  }
                >
                  {d.enrollment_state}
                </ArchieBadge>
                {d.enrollment_state !== "REVOKED" && (
                  <button
                    type="button"
                    onClick={() => void revokeDevice(d)}
                    className="rounded-md border border-border px-2 py-1"
                  >
                    Revoke
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- serving rules ---- */}
      <div className="mt-4 rounded-lg border border-border p-3 text-xs">
        <h4 className="font-semibold">Serving rules — who can retrieve what</h4>
        <p className="mt-1 text-[10px] text-slate-400">
          An item answers only within its scope. This is the live rule, not
          marketing copy:
        </p>
        <select
          value={scopeSim}
          onChange={(e) => setScopeSim(e.target.value as MobileKnowledgeScope)}
          aria-label="Scope to simulate"
          className="mt-2 w-full rounded-md border bg-background px-2 py-1"
        >
          {ALL_SCOPES.map((sc) => (
            <option key={sc} value={sc}>
              {sc}
            </option>
          ))}
        </select>
        {serving && (
          <div className="mt-2 flex items-center gap-2">
            <ArchieBadge tone={serving.ok ? "positive" : "warning"}>
              {serving.ok ? "SERVES" : "REFUSES"}
            </ArchieBadge>
            <span className="text-[10px] text-slate-400">{serving.reason}</span>
          </div>
        )}
      </div>
    </ArchiePanel>
  );
}
