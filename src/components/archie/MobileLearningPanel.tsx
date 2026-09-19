// =========================================================
// FRELUX ARCHIE PWA — MOBILE LEARNING PANEL (Phase 8 P4)
//
// The REAL 12-step mobile learning pipeline, driven by the
// Owner on real data — every stage advances one step at a
// time with its required evidence, nothing skips:
//
//   consent → selected → ingested → extracted → structured →
//   validated → evaluated (network quality gate) →
//   SHOWN TO USER (mandatory summary) → user confirmation →
//   scope → human approval where required → versioned.
//
// Only a VERSIONED learning the user explicitly confirmed can
// become a subscriber contribution (traceable origin,
// withdrawable, amendable). Silent whole-device scans are
// refused by assertNoSilentScan before anything starts.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  MOBILE_DATA_CATEGORY_KEYS,
  assertNoSilentScan,
} from "@/lib/archie/mobile/consent-categories";
import {
  type MobileKnowledgeScope,
  MOBILE_PIPELINE_ORDER,
  type MobileLearning,
  type TrustedDevice,
  type DeviceDataConsent,
} from "@/lib/archie/mobile/p4-types";
import {
  advanceMobileLearning,
  startMobileLearning,
  whatWasLearnedSummary,
} from "@/lib/archie/mobile/mobile-learning-pipeline";
import {
  DEFAULT_MOBILE_SCOPE,
  evaluateScopeTransition,
  requiresHumanApproval,
} from "@/lib/archie/mobile/knowledge-scope";
import {
  detectInjection,
  evaluateSubmissions,
  networkVerdict,
  type QualityReport,
} from "@/lib/archie/mobile/learning-network";
import {
  amendContribution,
  createContribution,
  traceOrigin,
  withdrawContribution,
} from "@/lib/archie/mobile/subscriber-contributions";
import type { SubscriberContribution } from "@/lib/archie/mobile/p4-types";
import {
  fetchDataConsents,
  fetchMobileLearnings,
  fetchMyContributions,
  fetchTrustedDevices,
  persistContribution,
  persistMobileLearning,
} from "@/lib/archie/mobile/p4-client";
import { generateFree } from "@/lib/archie/mobile/free-generation";
import { ArchiePanel, ArchieBadge } from "@/components/archie/premium";

const SCOPES: MobileKnowledgeScope[] = [
  "PRIVATE",
  "PROJECT",
  "PROPERTY",
  "REGIONAL",
  "FRELUX_GLOBAL_CANDIDATE",
];

/** Parse the owner's "topic | fact | confidence" lines into
 *  structured learned facts — explicit, visible, editable. */
function parseFacts(raw: string): MobileLearning["learned"] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [topic = "", content = "", conf = ""] = line
        .split("|")
        .map((p) => p.trim());
      const confidence = Number(conf);
      return {
        topic: topic.slice(0, 80),
        content: { fact: content },
        confidence: Number.isFinite(confidence)
          ? Math.min(Math.max(confidence, 0), 1)
          : 0.5,
      };
    });
}

function nextStage(state: MobileLearning["pipeline_state"]) {
  if (state === "REJECTED") return null;
  const idx = MOBILE_PIPELINE_ORDER.indexOf(state);
  if (idx === -1 || idx + 1 >= MOBILE_PIPELINE_ORDER.length) return null;
  return MOBILE_PIPELINE_ORDER[idx + 1];
}

export default function MobileLearningPanel() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [consents, setConsents] = useState<DeviceDataConsent[]>([]);
  const [learnings, setLearnings] = useState<MobileLearning[]>([]);
  const [contributions, setContributions] = useState<SubscriberContribution[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // start form
  const [deviceId, setDeviceId] = useState("");
  const [category, setCategory] = useState<string>(
    MOBILE_DATA_CATEGORY_KEYS[0],
  );
  const [selectedCount, setSelectedCount] = useState(1);

  // per-learning evidence inputs
  const [factsText, setFactsText] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [scopeChoice, setScopeChoice] =
    useState<MobileKnowledgeScope>(DEFAULT_MOBILE_SCOPE);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const [d, c, l, contribs] = await Promise.all([
        fetchTrustedDevices(user.id),
        fetchDataConsents(user.id),
        fetchMobileLearnings(user.id),
        fetchMyContributions(user.id),
      ]);
      setDevices(d);
      setConsents(c);
      setLearnings(l);
      setContributions(contribs);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load P4 data.");
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setNotice("");
    setError("");
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      setError("Pick a trusted device first.");
      return;
    }
    // Anti-silent-scan: unknown/forbidden categories refuse here.
    const scan = assertNoSilentScan([category]);
    if (!scan.ok) {
      setError(
        `Refused: ${scan.refused.join(", ")} (${scan.flags.join("; ")})`,
      );
      return;
    }
    const res = startMobileLearning({
      device,
      consents,
      category: category as MobileLearning["category"],
      selected_count: selectedCount,
    });
    if (!res.ok || !res.learning) {
      setError(res.error ?? "Could not start the learning.");
      return;
    }
    const persist = await persistMobileLearning(res.learning);
    if (!persist.ok) {
      setError(persist.error);
      return;
    }
    setNotice("Learning started in CONSENTED — advance one stage at a time.");
    setFactsText("");
    setApprovalId("");
    setQualityReport(null);
    await load();
  }

  async function advance(
    learning: MobileLearning,
    to: NonNullable<ReturnType<typeof nextStage>>,
  ) {
    setError("");
    setNotice("");
    if (!to) return;
    const evidence: Parameters<typeof advanceMobileLearning>[2] = {};

    if (to === "SELECTED") {
      evidence.selected_count = selectedCount;
    }
    if (["EXTRACTED", "STRUCTURED", "VALIDATED", "EVALUATED"].includes(to)) {
      const facts = parseFacts(factsText);
      if (facts.length === 0) {
        setError(
          `Enter at least one fact for ${to} (topic | fact | confidence).`,
        );
        return;
      }
      // Injection surface scan: findings become honest flags.
      const flags: string[] = [];
      for (const f of facts) {
        flags.push(...detectInjection(f.content));
      }
      evidence.learned = facts;
      evidence.flags = flags;
      if (to === "EVALUATED") {
        // Network quality gate — informs, never decides alone.
        const report = evaluateSubmissions(facts[0].topic, [
          {
            contribution_id: learning.id,
            contributor_id: learning.user_id,
            topic: facts[0].topic,
            domain: "construction",
            region: null,
            content: facts[0].content,
            evidence_state: "AI_EXTRACTED",
            confidence: facts[0].confidence,
            created_at: new Date().toISOString(),
          },
        ]);
        setQualityReport(report);
        evidence.flags = [...flags, ...report.flags];
      }
    }
    if (to === "SHOWN_TO_USER") {
      // The summary is DISPLAYED verbatim — the user sees it.
      evidence.shown_summary = whatWasLearnedSummary(learning);
      setNotice(evidence.shown_summary);
    }
    if (to === "USER_CONFIRMED") {
      const target = learning.scope ?? scopeChoice;
      const transition = evaluateScopeTransition(
        learning.scope ?? "PRIVATE",
        target,
        { user_contributes: true },
      );
      if (transition.requires_user_consent && !confirmChecked) {
        setError("This scope needs your explicit confirmation — tick the box.");
        return;
      }
      evidence.user_confirmed = true;
    }
    if (to === "SCOPED") {
      const transition = evaluateScopeTransition("PRIVATE", scopeChoice, {
        user_contributes: true,
      });
      if (!transition.allowed) {
        setError(transition.reason);
        return;
      }
      evidence.scope = scopeChoice;
    }
    if (to === "APPROVED") {
      const scope = learning.scope ?? scopeChoice;
      if (requiresHumanApproval(scope)) {
        if (!approvalId.trim()) {
          setError(
            `Scope ${scope} requires human/owner approval — enter the approval record id.`,
          );
          return;
        }
        evidence.human_approval_id = approvalId.trim();
      }
    }

    const res = advanceMobileLearning(learning, to, evidence);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const persist = await persistMobileLearning(res.learning);
    if (!persist.ok) {
      setError(persist.error);
      return;
    }
    if (to !== "SHOWN_TO_USER") setNotice(`Advanced to ${to}.`);
    await load();
  }

  async function rejectLearning(learning: MobileLearning) {
    const res = advanceMobileLearning(learning, "REJECTED");
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await persistMobileLearning(res.learning);
    setNotice("Learning rejected — nothing was learned from it.");
    await load();
  }

  async function contribute(learning: MobileLearning) {
    setError("");
    setNotice("");
    const res = createContribution({
      learning,
      country_region: "NG",
    });
    if (!res.ok || !res.contribution) {
      setError(res.error ?? "Contribution refused.");
      return;
    }
    const persist = await persistContribution(res.contribution);
    if (!persist.ok) {
      setError(persist.error);
      return;
    }
    setNotice(
      "Contributed with full origin trace. You can withdraw or amend it below at any time.",
    );
    await load();
  }

  async function withdraw(contribution: SubscriberContribution) {
    const res = withdrawContribution(contribution);
    await persistContribution(res.contribution);
    setNotice(
      `Contribution withdrawn. Derived knowledge action: ${res.derived_knowledge_action}.`,
    );
    await load();
  }

  async function amend(contribution: SubscriberContribution) {
    const corrected = window.prompt(
      "Corrected region (e.g. NG) — leave empty to keep",
    );
    if (corrected === null) return;
    const updated = amendContribution(contribution, {
      country_region: corrected.trim() || contribution.country_region,
    });
    await persistContribution(updated);
    setNotice("Contribution amended — the correction is versioned.");
    await load();
  }

  return (
    <ArchiePanel className="p-4">
      <h3 className="font-semibold">Mobile Learning — Phase 8 P4 pipeline</h3>
      <p className="mt-1 text-xs text-slate-400">
        Consent-first, one stage at a time, mandatory show-user step, human
        approval beyond PRIVATE. Silent scans are refused.
      </p>

      {(notice || error) && (
        <div className="mt-2">
          <ArchieBadge tone={error ? "warning" : "accent"}>
            {error || notice}
          </ArchieBadge>
        </div>
      )}
      {qualityReport && (
        <pre className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-slate-950/60 p-2 text-[10px] text-slate-300">
          {`Network quality gate: ${networkVerdict(qualityReport)}`}
        </pre>
      )}

      {/* ---- start form ---- */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label="Trusted device"
          className="rounded-md border bg-background px-2 py-1"
        >
          <option value="">Device…</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.device_name ?? d.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Data category"
          className="rounded-md border bg-background px-2 py-1"
        >
          {MOBILE_DATA_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={selectedCount}
          onChange={(e) => setSelectedCount(Number(e.target.value) || 1)}
          aria-label="Selected item count"
          className="rounded-md border bg-background px-2 py-1"
        />
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50"
        >
          Start learning
        </button>
      </div>

      {/* ---- learnings ---- */}
      <div className="mt-3 space-y-2">
        {learnings.length === 0 && (
          <p className="text-xs text-slate-400">No mobile learnings yet.</p>
        )}
        {learnings.map((l) => {
          const to = nextStage(l.pipeline_state);
          // Contributions trace back through provenance
          // (device + topic), not a learning id column.
          const origin =
            contributions.find(
              (c) =>
                !c.withdrawn &&
                c.provenance.device_id === l.device_id &&
                c.topic === l.learned[0]?.topic,
            ) ?? null;
          return (
            <div
              key={l.id}
              className="rounded-lg border border-border p-2 text-xs"
              data-testid={`p4-learning-${l.pipeline_state}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{l.category}</span>
                <ArchieBadge
                  tone={l.pipeline_state === "REJECTED" ? "warning" : "neutral"}
                >
                  {l.pipeline_state}
                </ArchieBadge>
                {l.scope && (
                  <span className="text-slate-400">scope: {l.scope}</span>
                )}
                {l.flags.length > 0 && (
                  <span className="text-amber-400">
                    {l.flags.length} flag(s)
                  </span>
                )}
              </div>

              {l.shown_summary && (
                <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950/40 p-2 text-[10px] text-slate-300">
                  {l.shown_summary}
                </pre>
              )}

              {to && (
                <div className="mt-2 space-y-1">
                  {to === "SELECTED" && (
                    <input
                      type="number"
                      min={1}
                      value={selectedCount}
                      onChange={(e) =>
                        setSelectedCount(Number(e.target.value) || 1)
                      }
                      aria-label="Selected item count"
                      className="w-full rounded-md border bg-background px-2 py-1"
                    />
                  )}
                  {[
                    "EXTRACTED",
                    "STRUCTURED",
                    "VALIDATED",
                    "EVALUATED",
                  ].includes(to) && (
                    <textarea
                      value={factsText}
                      onChange={(e) => setFactsText(e.target.value)}
                      placeholder="topic | fact | confidence — one per line"
                      aria-label="Learned facts"
                      className="h-16 w-full rounded-md border bg-background px-2 py-1"
                    />
                  )}
                  {to === "USER_CONFIRMED" && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={confirmChecked}
                        onChange={(e) => setConfirmChecked(e.target.checked)}
                      />
                      I confirm what was learned is correct
                    </label>
                  )}
                  {to === "SCOPED" && (
                    <select
                      value={scopeChoice}
                      onChange={(e) =>
                        setScopeChoice(e.target.value as MobileKnowledgeScope)
                      }
                      aria-label="Knowledge scope"
                      className="w-full rounded-md border bg-background px-2 py-1"
                    >
                      {SCOPES.map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                          {requiresHumanApproval(sc) ? " (needs approval)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {to === "APPROVED" &&
                    requiresHumanApproval(l.scope ?? scopeChoice) && (
                      <input
                        value={approvalId}
                        onChange={(e) => setApprovalId(e.target.value)}
                        placeholder="Human approval record id"
                        aria-label="Human approval record id"
                        className="w-full rounded-md border bg-background px-2 py-1"
                      />
                    )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void advance(l, to)}
                      disabled={busy}
                      className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Advance → {to}
                    </button>
                    <button
                      type="button"
                      onClick={() => void rejectLearning(l)}
                      className="rounded-md border border-border px-2 py-1"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {l.pipeline_state === "VERSIONED" &&
                !origin &&
                (l.scope === "FRELUX_GLOBAL_CANDIDATE" ? (
                  <button
                    type="button"
                    onClick={() => void contribute(l)}
                    className="mt-2 rounded-md border border-border px-2 py-1"
                  >
                    Contribute to FRELUX (traceable)
                  </button>
                ) : (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Contributions require FRELUX_GLOBAL_CANDIDATE scope — this
                    learning stays {l.scope}.
                  </p>
                ))}
              {origin && (
                <div className="mt-2 space-y-1">
                  <pre className="overflow-x-auto rounded bg-slate-950/40 p-2 text-[10px] text-slate-300">
                    {JSON.stringify(traceOrigin(origin), null, 0)}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void withdraw(origin)}
                      className="rounded-md border border-border px-2 py-1"
                    >
                      Withdraw
                    </button>
                    <button
                      type="button"
                      onClick={() => void amend(origin)}
                      className="rounded-md border border-border px-2 py-1"
                    >
                      Amend
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <FreeGenerationCard />
    </ArchiePanel>
  );
}

// ---------------------------------------------------------
// Free on-device generation — deterministic templates, no
// paid service, no cloud AI. Cloud generation is a separate
// PAID capability, off by default and never silently used.
// ---------------------------------------------------------
function FreeGenerationCard() {
  const [kind, setKind] = useState<"SUMMARY" | "TASK_LIST" | "MATERIAL_LIST">(
    "TASK_LIST",
  );
  const [title, setTitle] = useState("My site tasks");
  const [lines, setLines] = useState("Pour slab\nOrder rebar");
  const [output, setOutput] = useState("");

  function generate() {
    const items = lines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const data =
      kind === "TASK_LIST"
        ? { tasks: items }
        : kind === "MATERIAL_LIST"
          ? { materials: items }
          : Object.fromEntries(
              lines
                .split("\n")
                .map((l) => l.split("|").map((p) => p.trim()))
                .filter((p) => p[0])
                .map(([k, v]) => [k, v]),
            );
    const res = generateFree({ kind, title, data });
    setOutput(res.text);
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-3 text-xs">
      <h4 className="font-semibold">Free on-device generation</h4>
      <p className="mt-1 text-[10px] text-slate-400">
        Deterministic templates compose text from FRELUX data — free path, no
        cloud AI, ever.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          aria-label="Generation kind"
          className="rounded-md border bg-background px-2 py-1"
        >
          <option value="SUMMARY">Summary</option>
          <option value="TASK_LIST">Task list</option>
          <option value="MATERIAL_LIST">Material list</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Generation title"
          className="rounded-md border bg-background px-2 py-1"
          placeholder="Title"
        />
      </div>
      <textarea
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        className="mt-2 h-16 w-full rounded-md border bg-background px-2 py-1"
        aria-label="Generation input lines"
        placeholder={
          kind === "SUMMARY" ? "key | value per line" : "one item per line"
        }
      />
      <button
        type="button"
        onClick={generate}
        className="mt-2 rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground"
      >
        Generate on-device
      </button>
      {output && (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950/40 p-2 text-[10px] text-slate-300">
          {output}
        </pre>
      )}
    </div>
  );
}
