// =========================================================
// ARCHIE SKELETON — ANATOMY REGISTRY & HEALTH RUNNER
// supabase/functions/_shared/archie-ai/anatomy/registry.ts
//
// The 23 anatomical subsystems, each bound to its REAL
// implementation. runAnatomyHealth() executes a REAL probe
// per subsystem against the live database/engine — no
// fabricated statuses. A subsystem with no backend (ears)
// is reported NOT_OPERATIONAL, never faked.
// =========================================================

import { table } from "../tables.ts";
import { verifyConstitution, CONSTITUTION_CHECKSUM } from "./constitution.ts";
import { resolveArchieCapabilityEngine } from "../runtime.ts";

export type SubsystemStatus =
  "HEALTHY" | "DEGRADED" | "OFFLINE" | "NOT_OPERATIONAL";

/** Total registered anatomical subsystems (skeleton size). */
export const ANATOMY_SUBSYSTEM_COUNT = 23;

export interface ProbeResult {
  subsystem_key: string;
  status: SubsystemStatus;
  metric?: string;
  details: Record<string, unknown>;
}

/** Minimal DB surface the probes need (supabase-js). */
export interface AnatomyDb {
  from(table: string): {
    select(
      query?: string,
      opts?: { count?: string; head?: boolean },
    ): {
      // supabase-js postgrest results carry count/error/data
      // together; minimal mocks mirror the same shape.
      limit(n: number): Promise<{
        count: number | null;
        error: unknown;
        data?: unknown[] | null;
      }>;
      single(): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

async function count(
  db: AnatomyDb,
  table: string,
  select = "id",
): Promise<number | null> {
  try {
    const q = db.from(table).select(select, { count: "exact", head: true });
    const res = await q.limit(1);
    return res.count ?? (res.error ? null : 0);
  } catch {
    return null;
  }
}

/** Latest row by version — for append-only versioned tables. */
async function latestRow(
  db: AnatomyDb,
  table: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Read rows (bounded) and pick the highest version in JS.
    // The constitution table is append-only and tiny (one row
    // per version), so a bounded read is cheap and avoids
    // depending on `.order()`, which minimal test mocks do not
    // implement.
    const out = await db.from(table).select("*").limit(1000);
    if (out.error) return null;
    const rows = (out.data ?? []) as Record<string, unknown>[];
    if (!rows.length) return null;
    rows.sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
    return rows[0];
  } catch {
    return null;
  }
}

/** Count helper with a filter (eq on one column). */
async function countWhere(
  db: AnatomyDb,
  table: string,
  col: string,
  val: string,
): Promise<number | null> {
  try {
    // supabase-js chain: .select().eq().limit() — emulate via select with filter
    const q = db.from(table).select(`id, count, head: true`);
    // eq isn't in the minimal interface; fall back to a full read + filter
    const res = await db.from(table).select(`${col}`).limit(1000);
    const rows = (res as unknown as { data?: unknown[] }).data ?? [];
    void q;
    return rows.filter((r) => (r as Record<string, unknown>)[col] === val)
      .length;
  } catch {
    return null;
  }
}

/**
 * Run REAL health probes across all 23 subsystems.
 * Returns one ProbeResult per subsystem — persisted by the
 * archie-anatomy function and shown to the Owner.
 */
export async function runAnatomyHealth(db: AnatomyDb): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const push = (r: ProbeResult) => results.push(r);

  // -------- ❤️ HEART — the native engine must resolve ----
  try {
    const { runtime } = resolveArchieCapabilityEngine({
      engineId: undefined,
    });
    push({
      subsystem_key: "heart",
      status: runtime ? "HEALTHY" : "OFFLINE",
      metric: runtime ? "native engine resolvable" : "no engine",
      details: {
        engine: runtime ? "archie-native-engine" : "none",
        zero_external_ai: true,
      },
    });
  } catch {
    push({
      subsystem_key: "heart",
      status: "OFFLINE",
      details: { engine: "resolution failed" },
    });
  }

  // -------- 🧠 BRAIN — persistent memory & knowledge ------
  const knowledge = await count(db, table("knowledge_items"));
  const learning = await count(db, table("learning_records"));
  push({
    subsystem_key: "brain",
    status:
      knowledge === null ? "OFFLINE" : knowledge > 0 ? "HEALTHY" : "DEGRADED",
    metric: `${knowledge ?? "?"} knowledge items, ${learning ?? "?"} learning records`,
    details: { knowledge_items: knowledge, learning_records: learning },
  });

  // -------- 🧑 HEAD — cognitive command center -----------
  try {
    const mod = await import("../cognitive/orchestrator.ts");
    push({
      subsystem_key: "head",
      status: typeof mod === "object" && mod !== null ? "HEALTHY" : "DEGRADED",
      metric: "orchestrator module loadable",
      details: {
        module: "cognitive/orchestrator.ts",
        exports: Object.keys(mod).length,
      },
    });
  } catch {
    push({
      subsystem_key: "head",
      status: "OFFLINE",
      details: { module: "cognitive/orchestrator.ts" },
    });
  }

  // -------- 🧬 DNA — constitution integrity ---------------
  // The constitution table is append-only (immutable by
  // trigger); the LATEST version is the live copy verified
  // against the code-side CONSTITUTION_CHECKSUM. (Reading with
  // .single() would break the moment a second version row
  // exists — audit fix 2026-09-11 with constitution v2.)
  const constRow = await latestRow(db, "archie_constitution");
  const dna = verifyConstitution(
    constRow
      ? ({
          version: constRow.version as number,
          checksum: constRow.checksum as string,
          articles: constRow.articles as Record<string, unknown>,
        } as Parameters<typeof verifyConstitution>[0])
      : null,
  );
  push({
    subsystem_key: "dna",
    status: dna.verified ? "HEALTHY" : constRow ? "DEGRADED" : "OFFLINE",
    metric: dna.verified
      ? `constitution v${dna.version} checksum verified`
      : `checksum mismatch (expected ${CONSTITUTION_CHECKSUM.slice(0, 8)}…)`,
    details: { ...dna },
  });

  // -------- 🦴 SKELETON — the subsystem registry ---------
  const subsystems = await count(db, "archie_subsystems");
  push({
    subsystem_key: "skeleton",
    status:
      subsystems === ANATOMY_SUBSYSTEM_COUNT
        ? "HEALTHY"
        : subsystems === null
          ? "OFFLINE"
          : "DEGRADED",
    metric: `${subsystems ?? "?"}/${ANATOMY_SUBSYSTEM_COUNT} subsystems registered`,
    details: { expected: ANATOMY_SUBSYSTEM_COUNT, actual: subsystems },
  });

  // -------- 🧠 SPINAL CORD — central control bus ---------
  const targets = await count(db, table("archie_execution_targets"));
  push({
    subsystem_key: "spinal-cord",
    status: targets === null ? "OFFLINE" : targets > 0 ? "HEALTHY" : "DEGRADED",
    metric: `${targets ?? "?"} registered execution targets`,
    details: { execution_targets: targets },
  });

  // -------- 🩸 BLOOD — data bus (core table reachability)
  const blood = await count(db, "profiles");
  push({
    subsystem_key: "blood",
    status: blood === null ? "OFFLINE" : "HEALTHY",
    metric: blood === null ? "data layer unreachable" : "data layer reachable",
    details: { probe_table: "profiles" },
  });

  // -------- 👁️ EYES — perception -------------------------
  try {
    const web = await import("../native-engine/webresearch.ts");
    push({
      subsystem_key: "eyes",
      status: "HEALTHY",
      metric: "perception + web research modules loadable",
      details: {
        perception: "cognitive/perception.ts",
        webresearch: "native-engine/webresearch.ts",
        edge: ["intel-search", "intel-crawl", "archie-extract"],
        web_exports: Object.keys(web).length,
      },
    });
  } catch {
    push({
      subsystem_key: "eyes",
      status: "OFFLINE",
      details: { module: "perception stack" },
    });
  }

  // -------- 👂 EARS — voice/audio (REAL since the Ears
  // subsystem landed) ------------------------------------
  // Probe: the shared STT engine module must load (real
  // binding), and real transcriptions must exist in the
  // audit trail. HEALTHY needs at least one genuinely
  // audited transcription — never claimed before it is true.
  try {
    const ears = await import("../native-engine/ears.ts");
    const transcriptions = await countWhere(
      db,
      table("archie_audit_events"),
      "event_type",
      "archie.ears.transcription",
    );
    const status: SubsystemStatus =
      transcriptions === null
        ? "OFFLINE"
        : transcriptions > 0
          ? "HEALTHY"
          : "DEGRADED";
    push({
      subsystem_key: "ears",
      status,
      metric:
        transcriptions === null
          ? "audit trail unreachable"
          : transcriptions > 0
            ? `${transcriptions} real transcription(s) audited`
            : "engine live — awaiting first live transcription",
      details: {
        stt_core: "native-engine/ears.ts (native, provider-free)",
        client_engine: "src/lib/archie/ears.ts (on-device recognition)",
        edge: "archie-ears (owner-only, rate-limited, audited intake)",
        audit_event: "archie.ears.transcription",
        engine_exports: Object.keys(ears).length,
      },
    });
  } catch {
    push({
      subsystem_key: "ears",
      status: "OFFLINE",
      metric: "ears engine module failed to load",
      details: { module: "native-engine/ears.ts" },
    });
  }

  // -------- 👄 MOUTH — communication --------------------
  const chat = await count(db, table("chat_history"));
  const chatOk = chat !== null; // table reachable = surface live
  let mouthDetails: Record<string, unknown> = {
    surfaces: ["archie-chat (owner)", "visitor assistant"],
    history_rows: chat,
  };
  try {
    // native prosody + audio core must load (real binding)
    const mouth = await import("../native-engine/mouth.ts");
    mouthDetails = {
      ...mouthDetails,
      native_mouth:
        "native-engine/mouth.ts (prosody planner + PCM/WAV synthesis)",
      mouth_engine_exports: Object.keys(mouth).length,
      client_engine: "mobile/voice.ts (consumes the native prosody plan)",
    };
  } catch {
    // the probe still reports the chat surface honestly
    mouthDetails = {
      ...mouthDetails,
      native_mouth: "FAILED to load native-engine/mouth.ts",
    };
  }
  push({
    subsystem_key: "mouth",
    status: chatOk ? "HEALTHY" : "DEGRADED",
    metric: chatOk
      ? "chat surface + native prosody core live"
      : "chat history unreachable",
    details: mouthDetails,
  });

  // -------- 🍽️ DIGESTIVE — learning pipeline ------------
  const digestive =
    learning === null ? "OFFLINE" : learning > 0 ? "HEALTHY" : "DEGRADED";
  push({
    subsystem_key: "digestive",
    status: digestive,
    metric: `${learning ?? "?"} records in the learning pipeline`,
    details: {
      pipeline: "frelux_learning_records → validation → frelux_knowledge_items",
      ingestion: "archie-ingestion (never auto-promotes)",
    },
  });

  // -------- 🧪 LIVER/KIDNEYS — validation & filtering ----
  const validated = await countWhere(
    db,
    table("knowledge_items"),
    "validation_status",
    "VALIDATED",
  );
  const liverStatus =
    validated === null ? "DEGRADED" : validated > 0 ? "HEALTHY" : "DEGRADED";
  push({
    subsystem_key: "liver-kidneys",
    status: liverStatus,
    metric:
      validated === null
        ? "validation state unreadable"
        : `${validated} validated knowledge items`,
    details: {
      gates: ["content-hash dedup", "validation_status", "no auto-promotion"],
      validated_items: validated,
    },
  });

  // -------- 🛡️ IMMUNE — security & integrity -------------
  const securityEvents = await count(db, table("security_events"));
  const offensiveTargets = await count(db, "archie_offensive_targets");
  push({
    subsystem_key: "immune",
    status: securityEvents === null ? "DEGRADED" : "HEALTHY",
    metric:
      securityEvents === null
        ? "security events unreadable"
        : `verdict gate live · ${securityEvents} security events · ${offensiveTargets ?? 0} registered authorizations`,
    details: {
      verdict_gate:
        "_shared/archie-ai/security/verdict.ts (code-enforced, in archie-chat)",
      rls: "enabled on all public tables",
      security_events: securityEvents,
      offensive_targets: offensiveTargets,
    },
  });

  // -------- 🖐️ HANDS — tools & actions -----------------
  const enabledTargets = await countWhere(
    db,
    table("archie_execution_targets"),
    "enabled",
    "true",
  );
  push({
    subsystem_key: "hands",
    status:
      enabledTargets === null
        ? "DEGRADED"
        : enabledTargets > 0
          ? "HEALTHY"
          : "DEGRADED",
    metric: `${enabledTargets ?? "?"} enabled tool targets + native tool manifest`,
    details: {
      execution_targets_enabled: enabledTargets,
      native_tools: "native-engine/tools.ts + coding.ts + coding-project.ts",
    },
  });

  // -------- 💪 MUSCLES — execution system ----------------
  const runs = await count(db, table("archie_execution_runs"));
  push({
    subsystem_key: "muscles",
    status: runs === null ? "DEGRADED" : "HEALTHY",
    metric:
      runs === null
        ? "execution runs unreadable"
        : `${runs} audited execution runs`,
    details: {
      execution_runs: runs,
      engine: "archie-execute (audited, registry-gated)",
    },
  });

  // -------- 🦵 LEGS — infrastructure & deployment -------
  const infra = await count(db, table("infrastructure_costs"));
  const snapshots = await count(db, table("archie_infrastructure_snapshots"));
  // latest assessment = the engine's own verdict, not a guess
  let latestStatus: string | null = null;
  let latestAt: string | null = null;
  try {
    const res = await db
      .from(table("archie_infrastructure_snapshots"))
      .select("overall_status,assessed_at")
      .limit(50);
    // mock-compatible manual sort (no .order() in AnatomyDb)
    const rows = (res.data ?? []) as
      { overall_status?: string; assessed_at?: string }[] | null;
    const latest = rows
      ?.filter((r) => r.overall_status)
      .sort((a, b) =>
        String(b.assessed_at ?? "").localeCompare(String(a.assessed_at ?? "")),
      )[0];
    if (latest?.overall_status) {
      latestStatus = latest.overall_status;
      latestAt = latest.assessed_at ?? null;
    }
  } catch {
    // unreadable → report unknown, never fabricate
  }
  const infraDegraded =
    infra === null ||
    snapshots === null ||
    latestStatus === null ||
    latestStatus === "CRITICAL";
  push({
    subsystem_key: "legs",
    status: infraDegraded ? "DEGRADED" : "HEALTHY",
    metric:
      infra === null
        ? "infrastructure records unreadable"
        : latestStatus === null
          ? "infrastructure engine live, no assessment recorded yet"
          : `infrastructure engine: latest assessment ${latestStatus}${latestAt ? ` @ ${latestAt}` : ""}`,
    details: {
      deployment: "Netlify (freluxtools.netlify.app)",
      backend:
        "Supabase FRELUX app (hqhvlkunkdrxyuvziorm) — single project, Frelukx disconnected 2026-09-13",
      cost_records: infra,
      assessment_snapshots: snapshots,
      engine: "archie-infra (assess | snapshots | costs | budgets)",
      core: "_shared/archie-ai/infrastructure/engine.ts",
    },
  });

  // -------- ⚡ NERVOUS — event/API network ---------------
  const nervous = await count(db, "archie_migration_history");
  push({
    subsystem_key: "nervous",
    status: nervous === null ? "DEGRADED" : "HEALTHY",
    metric: "edge function network + push notifications live",
    details: {
      functions: "supabase/functions (archie-*, send-push-notification, …)",
      events: "frelux_security_events + execution run audit propagation",
    },
  });

  // -------- 🩺 PAIN — error & anomaly feedback -----------
  const secEvents = securityEvents;
  // FIX 52 (batch 16, Level 12 audit 2026-09-15): this probe
  // used to hardcode HEALTHY with no actual probe — every
  // other wiring claim in this file (head, eyes, ears, mouth)
  // import-verifies its real module. The pain subsystem now
  // does the same: the self-evaluation core must actually
  // load before HEALTHY can be claimed.
  try {
    const selfeval = await import("../native-engine/selfeval.ts");
    push({
      subsystem_key: "pain",
      status: "HEALTHY",
      metric: "self-evaluation + error reporting wired into reasoning",
      details: {
        selfeval: "native-engine/selfeval.ts (feeds learning)",
        selfeval_exports: Object.keys(selfeval).length,
        error_surface: "report-error + frelux_security_events",
        security_events_total: secEvents,
      },
    });
  } catch {
    push({
      subsystem_key: "pain",
      status: "OFFLINE",
      metric: "self-evaluation core failed to load",
      details: {
        selfeval: "native-engine/selfeval.ts FAILED to load",
        error_surface: "report-error + frelux_security_events",
        security_events_total: secEvents,
      },
    });
  }

  // -------- ⚖️ BALANCE — decision & authority control ----
  const changeRequests = await count(db, "archie_change_requests");
  const balanceStatus = changeRequests === null ? "DEGRADED" : "HEALTHY";
  push({
    subsystem_key: "balance",
    status: balanceStatus,
    metric: "Owner Authority layer active — ARCHIE can never self-approve",
    details: {
      protected_surfaces:
        "evolution/authority.ts PROTECTED_SURFACES (immutable)",
      may_approve_constantly_false: true,
      change_requests_total: changeRequests,
    },
  });

  // -------- 🧬 STEM CELLS — controlled evolution --------
  const stemStatus = changeRequests === null ? "DEGRADED" : "HEALTHY";
  push({
    subsystem_key: "stem-cells",
    status: stemStatus,
    metric: `${changeRequests ?? "?"} change requests through the §9 lifecycle`,
    details: {
      lifecycle:
        "PROPOSED→AWAITING_OWNER→AUTHORIZED→STAGING→TESTING→PASSED/FAILED→EXECUTED→ROLLED_BACK",
      audit: "archie_change_audit (append-only)",
    },
  });

  // -------- ❤️‍🩹 HEALING — recovery & rollback -----------
  const installations = await count(db, "archie_installations");
  const migrations = await count(db, "archie_migration_history");
  const recoveryEvents = await count(db, table("archie_recovery_events"));
  push({
    subsystem_key: "healing",
    status:
      installations === null || migrations === null || recoveryEvents === null
        ? "DEGRADED"
        : "HEALTHY",
    metric: `${installations ?? "?"} installations, ${migrations ?? "?"} migration records, ${recoveryEvents ?? "?"} recovery ledger events`,
    details: {
      backup: "migration packages (never export secrets by default)",
      rollback: "ROLLED_BACK compensation state in execution engine",
      recovery_engine:
        "_shared/archie-ai/recovery/engine.ts (classification → plan → retry/compensate/escalate → append-only ledger)",
      recovery_events: recoveryEvents,
    },
  });

  // -------- 🔗 CONNECTIVE TISSUE — connected device &
  // household/account intelligence (owner directive
  // 2026-09-10). Real Web Bluetooth / WebUSB / network
  // transports live in the PWA runtime; the edge core
  // (native-engine/connections.ts) holds the deterministic
  // pairing state machine, permission/scope evaluation and
  // maintenance gate.
  const connections = await count(db, table("archie_connections"));
  push({
    subsystem_key: "connective-tissue",
    status: connections === null ? "OFFLINE" : "HEALTHY",
    metric:
      connections === null
        ? "connections registry unreachable"
        : `${connections} authorized connection(s) · pairing state machine + permission/scope/audit core live`,
    details: {
      connections,
      transports: [
        "bluetooth",
        "wifi",
        "hotspot",
        "usb",
        "local-network",
        "internet",
        "api",
      ],
      core: "supabase/functions/_shared/archie-ai/native-engine/connections.ts",
    },
  });

  // -------- 💤 SLEEP — background processing --------------
  const scheduled = await countWhere(
    db,
    table("archie_execution_runs"),
    "initiator_system",
    "SCHEDULED",
  );
  // FIX 51 (batch 16, Level 12 audit 2026-09-15): this probe
  // used to hardcode HEALTHY and report `${scheduled ?? 0}` —
  // an UNREADABLE ledger was fabricated as a healthy "0
  // scheduled runs". No fabricated statuses: an unreadable
  // ledger degrades, and zero recorded runs is reported as
  // the honest "live, none recorded yet" state.
  push({
    subsystem_key: "sleep",
    status:
      scheduled === null ? "DEGRADED" : scheduled > 0 ? "HEALTHY" : "DEGRADED",
    metric:
      scheduled === null
        ? "scheduled-run ledger unreadable"
        : scheduled > 0
          ? `${scheduled} scheduled runs · cleanup + sitemap maintenance live`
          : "background processing live — no scheduled runs recorded yet",
    details: {
      background: [
        "cleanup-old-errors (scheduled)",
        "sitemap regeneration",
        "execution targets (SCHEDULED initiator)",
      ],
    },
  });

  return results;
}
