// =========================================================
// FRELUX ARCHIE STAGE 2 — SHARED WITH YOU
//
// What an invited family member / trusted person sees after
// redeeming an invitation: their status, permissions, expiry,
// and exactly what the Owner shared with them — nothing else.
// Server-side isolation (RLS + SECURITY DEFINER RPCs) decides
// every byte; this page only renders what those return.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  fetchMyPersonhood,
  fetchSharedConversations,
  fetchSharedKnowledge,
  type MyPersonhood,
  type SharedConversation,
  type SharedKnowledgeItem,
} from "@/lib/archie/stage2-shared-client";

function formatDate(iso: string | null): string {
  if (!iso) return "no expiry — permanent access";
  return new Date(iso).toLocaleString();
}

export default function ArchieShared() {
  const [me, setMe] = useState<MyPersonhood | null>(null);
  const [conversations, setConversations] = useState<SharedConversation[]>([]);
  const [knowledge, setKnowledge] = useState<SharedKnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const personhood = await fetchMyPersonhood();
      setMe(personhood);
      if (personhood?.status === "ACTIVE") {
        const [conv, know] = await Promise.all([
          fetchSharedConversations(),
          fetchSharedKnowledge(),
        ]);
        setConversations(conv);
        setKnowledge(know);
      } else {
        setConversations([]);
        setKnowledge([]);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="archie-fade-up mx-auto max-w-4xl px-4 py-4 md:py-6">
      <h1 className="archie-title-gradient text-lg font-semibold md:text-xl">
        Shared with you
      </h1>
      <p className="text-xs text-slate-400">
        What the Owner has shared with you through ARCHIE. The Owner controls
        every permission and can revoke access at any time.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-amber-300">
          {error}
        </p>
      )}
      {loading && <p className="mt-4 text-xs text-slate-500">Loading…</p>}

      {!loading && !error && !me && (
        <div
          data-testid="no-access"
          className="mt-4 rounded-lg archie-panel p-4"
        >
          <p className="text-sm text-slate-300">No ARCHIE access yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            This account has not been invited into an Owner's ARCHIE network.
            Ask the Owner to generate an invitation code for you.
          </p>
        </div>
      )}

      {me && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg archie-panel p-4">
            <p className="text-sm text-slate-200">
              {me.display_name}{" "}
              <span className="text-[11px] text-slate-500">
                ({me.relation.replace(/_/g, " ")})
              </span>
            </p>
            {me.status === "ACTIVE" && (
              <p className="mt-1 text-xs text-emerald-300">
                Active — access until {formatDate(me.access_expires_at)}.
              </p>
            )}
            {me.status === "PENDING_REQUEST" && (
              <p
                data-testid="pending-state"
                className="mt-1 text-xs text-amber-300"
              >
                Waiting for the Owner to review your request and configure your
                permissions. Nothing is granted yet.
              </p>
            )}
            {me.status === "PENDING_INVITE" && (
              <p className="mt-1 text-xs text-amber-300">
                Your invitation has not been redeemed yet.
              </p>
            )}
            {me.status === "SUSPENDED" && (
              <p className="mt-1 text-xs text-amber-300">
                Your access is suspended by the Owner.
              </p>
            )}
            {me.status === "REVOKED" && (
              <p className="mt-1 text-xs text-red-300">
                Your access has been revoked by the Owner.
              </p>
            )}
            {me.status === "ACTIVE" && me.permissions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {me.permissions.map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    {p.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          {me.status === "ACTIVE" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg archie-panel p-4">
                <p className="text-sm font-medium text-slate-200">
                  Shared conversations
                </p>
                {conversations.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    None shared with you yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {conversations.map((c) => (
                      <li
                        key={c.id}
                        className="truncate text-xs text-slate-300"
                      >
                        {c.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg archie-panel p-4">
                <p className="text-sm font-medium text-slate-200">
                  Shared knowledge
                </p>
                {knowledge.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    None shared with you yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {knowledge.map((k) => (
                      <li
                        key={k.id}
                        className="truncate text-xs text-slate-300"
                      >
                        {k.topic}{" "}
                        <span className="text-[10px] text-slate-500">
                          {k.capability} · v{k.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
