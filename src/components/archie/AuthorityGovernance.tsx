// =========================================================
// ARCHIE AUTHORITY & GOVERNANCE PANEL (PWA)
//
// © 2026 FRENZY. All rights reserved.
//
// REAL activation of ARCHIE's authority modules: every list,
// workflow and rule below is rendered live from the actual
// policy exports (authority-boundary, code-command,
// api-governance). Nothing here is a copy of text stored in
// the page — if the modules change, this panel changes.
// =========================================================

import { useState } from "react";
import { ARCHIE_CAN, ARCHIE_DOES_NOT } from "@/lib/archie/authority-boundary";
import {
  CODE_COMMAND_WORKFLOW,
  NOT_AUTHORIZATION,
  isAuthorization,
} from "@/lib/archie/code-command";
import {
  OWNER_ADMIN_CONFIGURED_FIELDS,
  API_ENFORCEMENT,
  canSubscriberAlterLimits,
} from "@/lib/archie/api-governance";
import { ArchieSectionTitle } from "@/components/archie/premium";

export default function AuthorityGovernance() {
  const [claim, setClaim] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);

  return (
    <div>
      <ArchieSectionTitle>Authority & governance</ArchieSectionTitle>
      <p className="mb-3 text-[11px] text-slate-500">
        The live authority boundary, rendered from ARCHIE's own policy modules.
        Owner Authority is final over every protected system.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg archie-panel p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            ARCHIE may
          </p>
          <ul className="space-y-1">
            {ARCHIE_CAN.map((c) => (
              <li key={c} className="text-[11px] text-slate-300">
                <span className="mr-1 text-emerald-400" aria-hidden>
                  ✓
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg archie-panel p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            ARCHIE never
          </p>
          <ul className="space-y-1">
            {ARCHIE_DOES_NOT.map((c) => (
              <li key={c} className="text-[11px] text-slate-300">
                <span className="mr-1 text-red-400" aria-hidden>
                  ✗
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-lg archie-panel p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Protected-change workflow (Owner-gated)
        </p>
        <ol className="flex flex-wrap gap-1.5">
          {CODE_COMMAND_WORKFLOW.map((stage, i) => {
            const gate = stage === "OWNER AUTHORIZATION";
            return (
              <li key={stage}>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    gate
                      ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40"
                      : "bg-white/[0.05] text-slate-400"
                  }`}
                >
                  {i + 1}. {stage}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">
          Try it — what authorizes a protected change? The verifier is the real{" "}
          <code className="text-slate-400">isAuthorization</code> function:
        </p>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder={
              'e.g. "a detected bug" or "the Owners explicit command"'
            }
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            aria-label="Authorization claim"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const result = isAuthorization(claim);
                setVerdict(
                  result.authorized
                    ? "Authorized: the authenticated Owner's explicit command."
                    : (result.error ?? "Not authorization."),
                );
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const result = isAuthorization(claim);
              setVerdict(
                result.authorized
                  ? "Authorized: the authenticated Owner's explicit command."
                  : (result.error ?? "Not authorization."),
              );
            }}
            className="shrink-0 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
          >
            Verify
          </button>
        </div>
        {verdict && (
          <p className="mt-1.5 text-[11px] text-slate-400" role="status">
            {verdict}
          </p>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          Never authorization: {NOT_AUTHORIZATION.join(" · ")}.
        </p>
      </div>

      <div className="mt-3 rounded-lg archie-panel p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Subscriber API governance
        </p>
        <p className="text-[11px] text-slate-300">
          {OWNER_ADMIN_CONFIGURED_FIELDS.length} fields — endpoints, quotas,
          capabilities and scopes — are configurable only by Owner/Admin. A
          subscriber can alter their own limits:{" "}
          <span className="font-semibold text-red-300">
            {canSubscriberAlterLimits() ? "yes" : "never"}
          </span>
          . Enforcement is {API_ENFORCEMENT}.
        </p>
      </div>
    </div>
  );
}
