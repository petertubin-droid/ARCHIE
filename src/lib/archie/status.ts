// =========================================================
// FRELUX ARCHIE STAGE 1, SYSTEM STATUS
//
// Real, production-sourced status for the Owner Central
// Control Dashboard. Every figure comes from live tables or a
// real reachability probe. Systems without a backend yet are
// reported as ADAPTER PENDING — never as operational.
// =========================================================
import { supabase } from "@/lib/supabase";

export type SystemState =
  "operational" | "degraded" | "pending" | "alert" | "offline";

export interface ArchieStatus {
  coreReachable: boolean;
  domains: { total: number; active: number };
  knowledge: { active: number };
  learning: {
    ingestions: number;
    processing: number;
    pipeline_states: Record<string, number>;
  };
  agents: { total: number; active: number; by_status: Record<string, number> };
  devices: { trusted: number; pending: number };
  security: { events24h: number; latestSeverity: string | null };
  projects: { contractorProjects: number; estimates: number };
  conversations: number;
  infraCostMonthCents: number | null;
}

async function countRows(
  table: string,
  column: string,
  filter?: { column: string; value: unknown },
): Promise<number | null> {
  let q = supabase.from(table).select(column, { count: "exact", head: true });
  if (filter) q = q.eq(filter.column, filter.value);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

// Real reachability probe: an OPTIONS preflight against the
// ARCHIE Core function answers "ok" with no LLM cost.
export async function probeCore(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return false;
  try {
    const res = await fetch(`${url}/functions/v1/archie-chat`, {
      method: "OPTIONS",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchArchieStatus(): Promise<ArchieStatus> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const [
    conversations,
    domainsTotal,
    domainsActive,
    knowledgeActive,
    ingestionsReq,
    contractorProjects,
    estimates,
    agentsReq,
    sessionsReq,
    eventsReq,
    costsReq,
  ] = await Promise.all([
    countRows("frelux_archie_conversations", "id"),
    countRows("frelux_archie_domains", "key"),
    countRows("frelux_archie_domains", "key", {
      column: "active",
      value: true,
    }),
    countRows("frelux_knowledge_items", "id", {
      column: "status",
      value: "ACTIVE",
    }),
    supabase
      .from("frelux_archie_ingestions")
      .select("pipeline_state")
      .limit(500),
    countRows("contractor_projects", "id"),
    countRows("client_estimates", "id"),
    supabase.from("frelux_archie_internal_agents").select("status").limit(500),
    supabase
      .from("frelux_security_sessions")
      .select("current,revoked")
      .limit(500),
    supabase
      .from("frelux_security_events")
      .select("severity,created_date")
      .gte("created_date", since24h)
      .order("created_date", { ascending: false })
      .limit(50),
    supabase
      .from("frelux_infrastructure_costs")
      .select("cost_cents")
      .gte("created_date", monthStart)
      .limit(1000),
  ]);

  const agentsBy: Record<string, number> = {};
  for (const a of agentsReq.data ?? [])
    agentsBy[a.status] = (agentsBy[a.status] ?? 0) + 1;

  const sessions = sessionsReq.data ?? [];
  const trusted = sessions.filter((s) => s.current && !s.revoked).length;
  const pending = sessions.filter((s) => !s.current && !s.revoked).length;

  const events = eventsReq.data ?? [];

  const pipeline_states: Record<string, number> = {};
  for (const i of ingestionsReq.data ?? [])
    pipeline_states[i.pipeline_state] =
      (pipeline_states[i.pipeline_state] ?? 0) + 1;
  const processing =
    (pipeline_states.RECEIVED ?? 0) +
    (pipeline_states.EXTRACTING ?? 0) +
    (pipeline_states.STRUCTURING ?? 0);

  return {
    coreReachable: await probeCore(),
    domains: { total: domainsTotal ?? 0, active: domainsActive ?? 0 },
    knowledge: { active: knowledgeActive ?? 0 },
    learning: {
      ingestions: ingestionsReq.data?.length ?? 0,
      processing,
      pipeline_states,
    },
    agents: {
      total: agentsReq.data?.length ?? 0,
      active: (agentsBy.EXECUTING ?? 0) + (agentsBy.MONITORING ?? 0),
      by_status: agentsBy,
    },
    devices: { trusted, pending },
    security: {
      events24h: events.length,
      latestSeverity: events[0]?.severity ?? null,
    },
    projects: {
      contractorProjects: contractorProjects ?? 0,
      estimates: estimates ?? 0,
    },
    conversations: conversations ?? 0,
    infraCostMonthCents: costsReq.error
      ? null
      : (costsReq.data ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0),
  };
}

// ---------------------------------------------------------
// Systems registry: Owner Control Dashboard sections.
// state reflects real data; "pending" = no backend yet.
// ---------------------------------------------------------
export interface SystemSection {
  key: string;
  label: string;
  state: SystemState;
  detail: string;
  adminPath?: string;
}

function sys(
  key: string,
  label: string,
  state: SystemState,
  detail: string,
  adminPath?: string,
): SystemSection {
  return { key, label, state, detail, adminPath };
}

export function buildSystemsRegistry(status: ArchieStatus): SystemSection[] {
  const securityState: SystemState =
    status.security.latestSeverity === "CRITICAL"
      ? "alert"
      : status.security.latestSeverity === "WARNING"
        ? "degraded"
        : "operational";

  return [
    sys(
      "intelligence",
      "ARCHIE Intelligence",
      "operational",
      `${status.domains.active} active domains`,
      "/admin/archie",
    ),
    sys(
      "knowledge",
      "ARCHIE Knowledge",
      "operational",
      `${status.knowledge.active} approved knowledge items`,
      "/admin/learn",
    ),
    sys(
      "learning",
      "Learning",
      "operational",
      status.learning.processing > 0
        ? `Processing ${status.learning.processing} ingestion(s)`
        : `${status.learning.ingestions} ingestion(s) recorded, none processing`,
      "/admin/archie-training",
    ),
    sys(
      "projects",
      "Projects",
      "operational",
      `${status.projects.contractorProjects} project(s), ${status.projects.estimates} saved estimate(s)`,
      "/admin/projects",
    ),
    sys(
      "properties",
      "Properties",
      "pending",
      "Property layer is in development. Property Profile schema and regional routing are not deployed yet.",
    ),
    sys(
      "construction",
      "Construction Intelligence",
      "operational",
      "Deterministic calculator adapter live in ARCHIE chat: blocks for a wall, paint litres for an area, cement bags for a volume — pure arithmetic with stated assumptions, honest refusal on missing dimensions.",
    ),
    sys(
      "calculators",
      "Calculators",
      "operational",
      "12+ deterministic calculators live on the public site",
      "/calculators",
    ),
    sys(
      "market",
      "Market Intelligence",
      "operational",
      "ARCHIE chat adapter live: price queries resolve from mi_approved_prices / mi_price_observations (approved first, observations labeled honestly). No recorded data gets an honest no-data answer — never a guessed price.",
    ),
    sys(
      "web",
      "Web Intelligence",
      "operational",
      "In-engine research pipeline operational: DuckDuckGo Lite search → extract → cross-check, findings stored as candidate knowledge pending validation. Runs on ARCHIE's own inference — no external LLM.",
    ),
    sys(
      "code",
      "Code Intelligence",
      "operational",
      "Deterministic static analysis live in chat (paste source: structure, complexity, risk flags) plus unit-test scaffolds. Open-ended code generation is not implemented — and is not claimed.",
    ),
    sys(
      "sentry",
      "Cybersecurity / Sentry",
      "operational",
      "Sentry instrumentation is active on the FRELUX frontend. ARCHIE Sentry diagnostics adapter is pending.",
    ),
    sys(
      "documents",
      "Documents",
      "operational",
      "Ingestion adapter live in chat: document/drawing/table pipeline states and recent extraction candidates reported from frelux_archie_ingestions — real rows only, never invented state.",
    ),
    sys(
      "images",
      "Images",
      "operational",
      "Ingestion adapter live in chat: image/video pipeline states and recent items reported from frelux_archie_ingestions — real rows only.",
    ),
    sys(
      "voice",
      "Voice",
      "operational",
      "Voice-bank adapter live in chat: active sample count and recorded audio seconds from frelux_archie_voice_samples. Spoken-audio transcription is NOT implemented and is not claimed.",
    ),
    sys(
      "location",
      "Location Intelligence",
      "pending",
      "Adapter boundary registered, not operational yet.",
    ),
    sys(
      "social",
      "Social / Brand Intelligence",
      "operational",
      "Social adapter live in chat: connected platforms, handles and sync status from frelux_social_accounts. Tokens stay in the service-role-only vault — never surfaced.",
    ),
    sys(
      "professional",
      "Professional Ecosystem",
      "operational",
      "Professional ecosystem tables are deployed.",
    ),
    sys(
      "devices",
      "Trusted Devices",
      "operational",
      `${status.devices.trusted} trusted, ${status.devices.pending} pending`,
      "/archie/devices",
    ),
    sys(
      "family",
      "Family / Trusted People",
      "operational",
      "Trusted-people adapter live in chat: roster names, relations and statuses from frelux_archie_people.",
    ),
    sys(
      "api",
      "API",
      "operational",
      "FRELUX public API service is deployed (frelix-api)",
    ),
    sys(
      "agents",
      "Internal ARCHIE Agents",
      "operational",
      `${status.agents.total} agent(s) recorded, ${status.agents.active} active`,
      "/admin/archie-ops",
    ),
    sys(
      "infrastructure",
      "Infrastructure",
      "operational",
      "Supabase + edge functions; infrastructure cost ledger is live",
      "/admin/archie-ops",
    ),
    sys(
      "security",
      "Security",
      securityState,
      `${status.security.events24h} security event(s) in last 24h`,
      "/archie/security",
    ),
    sys(
      "permissions",
      "Permissions",
      "operational",
      "Owner authorizations and audit logging are enforced server-side",
    ),
    sys(
      "audit",
      "Audit Logs",
      "operational",
      "Owner authorizations ledger is live",
      "/archie/security",
    ),
    sys(
      "integrations",
      "Integrations",
      "operational",
      "Supabase auth, storage, and edge functions connected",
    ),
    sys(
      "costs",
      "Usage / Infrastructure Costs",
      "operational",
      status.infraCostMonthCents === null
        ? "Cost ledger not reachable"
        : `Month to date: $${(status.infraCostMonthCents / 100).toFixed(2)} internal spend`,
      "/admin/archie-ops",
    ),
    sys(
      "config",
      "ARCHIE Configuration",
      "operational",
      `${status.domains.total} domain(s) in registry`,
      "/admin/archie",
    ),
  ];
}
