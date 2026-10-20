// =========================================================
// FRELUX ARCHIE STAGE 1 — STATUS CENTER
//
// Live system status from the real archie-status function.
// No fake states: while loading it shows a loading state, on
// failure an honest disconnected state.
// =========================================================

import { useSystemStatus } from "@/hooks/useSystemStatus";
import type { ArchieSystemStatus } from "@/lib/archie/stage1-client";
import { ArchieSkeleton } from "@/components/archie/premium";

function Dot({ state }: { state: string }) {
  const online =
    state === "ONLINE" ||
    state === "OPERATIONAL" ||
    state === "CONNECTED" ||
    state === "READY" ||
    state === "NORMAL" ||
    state === "ACTIVE" ||
    state === "TRUSTED" ||
    state === "SAVED";
  const color = online
    ? "bg-emerald-400 archie-dot-pulse"
    : state === "PROCESSING" || state === "EMPTY" || state === "WARNING"
      ? "bg-amber-400"
      : "bg-slate-500";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden
    />
  );
}

export function StatusTile({
  label,
  state,
  detail,
}: {
  label: string;
  state: string;
  detail?: string;
}) {
  return (
    <div className="archie-panel rounded-lg p-3 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center gap-2">
        <Dot state={state} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </span>
      </div>
      <p className="archie-stat-value mt-1 text-sm font-semibold">{state}</p>
      {detail && <p className="mt-0.5 text-[11px] text-slate-400">{detail}</p>}
    </div>
  );
}

export default function StatusCenter() {
  const { data, isLoading, isError } = useSystemStatus();

  if (isLoading) {
    return (
      <section
        aria-label="ARCHIE status center"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <ArchieSkeleton key={i} className="h-[68px]" />
        ))}
      </section>
    );
  }

  if (isError || !data) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200"
      >
        Status unavailable — ARCHIE could not reach the status service right
        now.
      </div>
    );
  }

  const s = data as ArchieSystemStatus;
  return (
    <section
      aria-label="ARCHIE status center"
      aria-live="polite"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <StatusTile
        label="ARCHIE Core"
        state={s.archie_core.state}
        detail={s.archie_core.note}
      />
      <StatusTile
        label="Knowledge Core"
        state={s.knowledge_core.state}
        detail={`${s.knowledge_core.knowledge_items} items · ${s.knowledge_core.domains} domains`}
      />
      <StatusTile
        label="Learning"
        state={s.learning.state}
        detail={
          s.learning.awaiting_approval > 0
            ? `${s.learning.awaiting_approval} awaiting approval`
            : "nothing awaiting approval"
        }
      />
      <StatusTile
        label="FRELUX Connection"
        state={s.frelux_connection.state}
        detail={`${s.frelux_connection.estimates} estimates`}
      />
      <StatusTile
        label="Internal Agents"
        state={s.internal_agents.active > 0 ? "ACTIVE" : "IDLE"}
        detail={`${s.internal_agents.active} active · ${s.internal_agents.total} total`}
      />
      <StatusTile
        label="Trusted Devices"
        state={s.devices.trusted > 0 ? "TRUSTED" : "NONE"}
        detail={`${s.devices.trusted} trusted · ${s.devices.pending} pending`}
      />
      <StatusTile
        label="Active Projects"
        state={s.frelux_connection.estimates > 0 ? "ACTIVE" : "NONE"}
        detail={`${s.frelux_connection.estimates} project estimate(s)`}
      />
      <StatusTile
        label="Ears (Audio Intelligence)"
        state={s.ears?.state ?? "UNKNOWN"}
        detail={s.ears?.note ?? "No ears report"}
      />
      <StatusTile
        label="Security"
        state={s.security.state}
        detail={`${s.security.audit_events} audit events`}
      />
      <StatusTile
        label="Conversations"
        state={s.conversations > 0 ? "SAVED" : "EMPTY"}
        detail={`${s.conversations} conversation(s)`}
      />
      {s.lexicon && (
        <StatusTile
          label="Lexicon Engine"
          state={s.lexicon.state}
          detail={
            s.lexicon.note
              ? s.lexicon.note
              : `${s.lexicon.words} words · ${s.lexicon.senses_verified} verified / ${s.lexicon.senses_unverified} unverified senses`
          }
        />
      )}
    </section>
  );
}
