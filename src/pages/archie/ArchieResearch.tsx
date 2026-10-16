// =========================================================
// ARCHIE PWA — RESEARCH VIEW (owner directive 2026-09-16)
//
// The owner's live web-research panel. NO THEATER:
//   * Every finding is a REAL stored web-finding with its
//     full provenance (site, category, confidence, timestamp)
//     — served by the owner-gated archie-research function.
//   * Validate promotes a finding to validated knowledge with
//     a REAL owner verification event; Reject parks it as
//     uncertain. Nothing is deleted — every verdict is
//     audited.
//   * Only research facts are touchable: the function's
//     predicate filter keeps owner-taught and seed knowledge
//     out of reach of this panel.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  decideResearchFinding,
  listResearchRegister,
  type ResearchFinding,
  type ResearchedTerm,
} from "@/lib/archie/research-client";

function statusBadge(status: string) {
  if (status === "validated")
    return "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300";
  if (status === "uncertain")
    return "rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300";
  return "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300";
}

function confidenceLabel(c: number) {
  if (c >= 0.6) return "cross-checked";
  if (c >= 0.4) return "single-source";
  return "weak";
}

export default function ArchieResearch() {
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [vocabulary, setVocabulary] = useState<ResearchedTerm[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    candidate: 0,
    validated: 0,
    uncertain: 0,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const reg = await listResearchRegister();
      setFindings(reg.findings);
      setVocabulary(reg.vocabulary);
      setCounts(reg.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research register unavailable");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (id: string, action: "validate" | "reject") => {
      setDecidingId(id);
      setError("");
      try {
        await decideResearchFinding(id, action);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verdict failed");
      } finally {
        setDecidingId(null);
      }
    },
    [load],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-white">Web Research</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every finding ARCHIE stored from live web research — with full
        provenance. Your verdict promotes a finding to validated knowledge or
        parks it as uncertain. Nothing is deleted.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2">
        {(
          [
            ["Total", counts.total],
            ["Candidate", counts.candidate],
            ["Validated", counts.validated],
            ["Uncertain", counts.uncertain],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3 text-center"
          >
            <div className="text-lg font-semibold text-white">{value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {label}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Findings
        </h2>
        {busy && findings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Loading research register…</p>
        ) : findings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No research findings stored yet. Ask ARCHIE to research something in
            chat — candidate findings land here for your review.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      setOpenId((id) => (id === f.id ? null : f.id))
                    }
                  >
                    <span className="block truncate text-sm font-medium text-white">
                      {f.title ?? f.url ?? f.query}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {f.query}
                    </span>
                  </button>
                  <span className={statusBadge(f.status)}>{f.status}</span>
                </div>

                {openId === f.id && (
                  <div className="mt-3 border-t border-slate-700/60 pt-3 text-xs text-slate-300">
                    {f.snippet && <p className="italic text-slate-400">"{f.snippet}"</p>}
                    {f.url && (
                      <p className="mt-2 break-all">
                        Source:{" "}
                        <a
                          className="text-sky-300 underline"
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.url}
                        </a>
                      </p>
                    )}
                    {f.provenanceNote && (
                      <p className="mt-2 text-slate-400">{f.provenanceNote}</p>
                    )}
                    <p className="mt-2">
                      Confidence {Math.round(f.confidence * 100)}% —{" "}
                      {confidenceLabel(f.confidence)}
                    </p>
                    {f.verifiedBy.length > 0 && (
                      <p className="mt-1 text-emerald-300">
                        Verification ledger: {f.verifiedBy.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {f.status === "candidate" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={decidingId === f.id}
                      onClick={() => void decide(f.id, "validate")}
                      className="rounded-md bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      Validate
                    </button>
                    <button
                      disabled={decidingId === f.id}
                      onClick={() => void decide(f.id, "reject")}
                      className="rounded-md bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/30 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Researched vocabulary
        </h2>
        {vocabulary.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No researched terms yet. "Research what X means" in chat stores the
            cross-checked meaning here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vocabulary.map((t) => (
              <li
                key={t.term}
                className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3"
              >
                <span className="text-sm font-medium text-white">{t.term}</span>
                {t.meaning && (
                  <span className="ml-2 text-sm text-slate-300">
                    — {t.meaning}
                  </span>
                )}
                <span className="mt-1 block text-xs text-slate-400">
                  {t.provenance} · confidence {Math.round(t.confidence * 100)}%
                  · seen {t.timesSeen}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
