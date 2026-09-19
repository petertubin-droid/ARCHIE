// =========================================================
// ARCHIE DEVELOPMENT GOVERNANCE (PWA)
//
// © 2026 FRENZY. All rights reserved.
//
// Real activation of two dormant governance modules:
//   * development-workflow — ARCHIE's autonomous stages end
//     at PROPOSE; the production workflow after that is
//     owner-driven and ARCHIE cannot advance it.
//   * code-sentry — deterministic scan of owner-authorized
//     code content, findings cited by rule and line, fixes
//     are proposals only.
// =========================================================

import { useState } from "react";
import {
  developmentAction,
  nextProductionStage,
  DEV_STAGES,
  PRODUCTION_WORKFLOW,
} from "@/lib/archie/development-workflow";
import {
  scanAuthorizedCode,
  type CodeSentryReport,
} from "@/lib/archie/code-sentry";

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="archie-panel rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      <p className="mt-1 text-[11px] text-slate-500">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function DevGovernance() {
  const [task, setTask] = useState("");
  const [stage, setStage] = useState("ARCHIE PROPOSES");
  const [actor, setActor] = useState<"ARCHIE" | "OWNER">("ARCHIE");
  const [gateError, setGateError] = useState<string | null>(null);

  const [code, setCode] = useState(
    'const key = "sk_live_abcdef123456";\npassword = "hunter2";\neval(userInput);\n',
  );
  const [report, setReport] = useState<CodeSentryReport | null>(null);

  const action = developmentAction(task);

  function advance() {
    setGateError(null);
    const res = nextProductionStage(stage, actor);
    if (res.ok && res.next) {
      setStage(res.next);
    } else {
      setGateError(res.error ?? "cannot advance");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
      <Panel
        title="Development authority"
        note="ARCHIE's autonomous stages are all proposals. Everything after ARCHIE PROPOSES in the production workflow is Owner-driven — ARCHIE cannot advance it, only the Owner authorizes."
      >
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe a development task (e.g. fix the estimate totals bug)"
          aria-label="Development task"
        />
        <p className="mt-2 text-xs text-slate-300">
          ARCHIE may:{" "}
          <span className="text-amber-200">
            {action.archie_may.join(" → ")}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Output: {action.output}. Gate: {action.gate}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Autonomous stages: {DEV_STAGES.join(" → ")}
        </p>
      </Panel>

      <Panel
        title="Production workflow gate"
        note="Walk the fixed workflow. Try advancing as ARCHIE past OWNER REVIEWS — the gate refuses; only the Owner moves it."
      >
        <ol className="flex flex-wrap gap-1.5">
          {PRODUCTION_WORKFLOW.map((st) => (
            <li
              key={st}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                st === stage
                  ? "bg-amber-400/20 text-amber-200"
                  : PRODUCTION_WORKFLOW.indexOf(st) <
                      PRODUCTION_WORKFLOW.indexOf(stage)
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-white/[0.05] text-slate-400"
              }`}
            >
              {st}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={actor}
            onChange={(e) => setActor(e.target.value as "ARCHIE" | "OWNER")}
            aria-label="Acting as"
          >
            <option value="ARCHIE">Act as ARCHIE</option>
            <option value="OWNER">Act as Owner</option>
          </select>
          <button
            type="button"
            onClick={advance}
            className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
          >
            Advance stage
          </button>
        </div>
        {gateError && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {gateError}
          </p>
        )}
      </Panel>

      <Panel
        title="Code sentry"
        note="Deterministic scan of owner-authorized code content only. Findings cite rule and line; proposed fix directions are never applied automatically."
      >
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground"
          rows={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Code content to scan"
        />
        <button
          type="button"
          onClick={() => setReport(scanAuthorizedCode(code))}
          className="mt-2 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
        >
          Scan authorized content
        </button>
        {report && (
          <div className="mt-3" role="status">
            <p className="text-xs text-slate-300">
              {report.scanned
                ? `Scanned ${report.source} — ${report.findingCount} finding(s), ${report.criticalCount} critical, ${report.highCount} high.`
                : report.note}
            </p>
            <ul className="mt-2 space-y-1.5">
              {report.findings.map((f, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/60 p-2 text-[11px]"
                >
                  <span
                    className={
                      f.severity === "CRITICAL"
                        ? "text-red-300"
                        : f.severity === "HIGH"
                          ? "text-amber-300"
                          : "text-slate-300"
                    }
                  >
                    [{f.severity}] {f.rule} · line {f.line}
                  </span>
                  <p className="mt-0.5 text-slate-400">{f.message}</p>
                  <p className="mt-0.5 text-slate-500">→ {f.proposal}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
