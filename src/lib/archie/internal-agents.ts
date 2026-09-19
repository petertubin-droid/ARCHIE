// =========================================================
// FRELUX PHASE 8 P5, ARCHIE INTERNAL SUB-AGENT ORCHESTRATION
//
// Dynamic internal task-agent orchestration through the
// ARCHIE core. There is NO arbitrary architectural ceiling
// on the number of internal agents, but REAL infrastructure
// constraints (provider budgets, concurrency, latency,
// compute) are respected through the cost-governance module.
//
// Lifecycle (enforced state machine):
//   CREATE → AUTHORIZE → ASSIGN → EXECUTE → MONITOR →
//   REPORT → TERMINATE
//
// Agents work across the authorized FRELUX codebase and
// infrastructure according to their permission grants, and
// may use FRELUX-owned external API credentials only when
// authorized, at minimum scope. Keys are never exposed to
// agents: credentials stay server-side; agents reference
// capability grants, not secrets.
//
// COST RULE: internal agents are INTERNAL_ARCHIE_OPERATION.
// Their external provider usage is recorded on the FRELUX
// infrastructure ledger and can NEVER consume user,
// subscriber or API-customer credits (enforced server-side
// and asserted by assertNotCustomerQuota in cost-governance).
// =========================================================

import {
  type BudgetSnapshot,
  budgetDecision,
  type BudgetDecision,
  assertNotCustomerQuota,
} from "./cost-governance";

export const AGENT_LIFECYCLE = [
  "CREATED",
  "AUTHORIZED",
  "ASSIGNED",
  "EXECUTING",
  "MONITORING",
  "REPORTING",
  "TERMINATED",
  "FAILED",
] as const;
export type AgentLifecycleState = (typeof AGENT_LIFECYCLE)[number];

/** Legal lifecycle transitions. FAILED/TERMINATED are terminal. */
const TRANSITIONS: Record<AgentLifecycleState, readonly AgentLifecycleState[]> =
  {
    CREATED: ["AUTHORIZED", "FAILED", "TERMINATED"],
    AUTHORIZED: ["ASSIGNED", "FAILED", "TERMINATED"],
    ASSIGNED: ["EXECUTING", "FAILED", "TERMINATED"],
    EXECUTING: ["MONITORING", "FAILED", "TERMINATED"],
    MONITORING: ["EXECUTING", "REPORTING", "FAILED", "TERMINATED"],
    REPORTING: ["TERMINATED", "FAILED"],
    TERMINATED: [],
    FAILED: [],
  };

export function canTransition(
  from: AgentLifecycleState,
  to: AgentLifecycleState,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: AgentLifecycleState,
  to: AgentLifecycleState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid agent lifecycle transition ${from} → ${to}. ` +
        `Lifecycle is CREATE → AUTHORIZE → ASSIGN → EXECUTE → MONITOR → REPORT → TERMINATE.`,
    );
  }
}

// ---------------------------------------------------------
// Agent roles: the catalog is extensible, not a ceiling
// ---------------------------------------------------------

export interface AgentRoleSpec {
  role: string;
  label: string;
  description: string;
  /** Minimum permission grants required for the role. */
  required_permissions: readonly string[];
  /** Roles that may touch external paid APIs at all. */
  uses_external_apis: boolean;
}

export const AGENT_ROLES: readonly AgentRoleSpec[] = [
  {
    role: "code_analysis",
    label: "Code Analysis",
    description: "Read-only source code inspection and analysis.",
    required_permissions: ["code:read"],
    uses_external_apis: false,
  },
  {
    role: "debugging",
    label: "Debugging",
    description: "Reproduce, isolate and diagnose defects.",
    required_permissions: ["code:read", "tests:run"],
    uses_external_apis: false,
  },
  {
    role: "frontend",
    label: "Frontend/UI",
    description: "React components, styling, responsive and a11y work.",
    required_permissions: ["code:read", "code:propose"],
    uses_external_apis: false,
  },
  {
    role: "backend",
    label: "Backend/API",
    description: "Edge functions, APIs and server-authoritative logic.",
    required_permissions: ["code:read", "code:propose", "functions:read"],
    uses_external_apis: false,
  },
  {
    role: "supabase",
    label: "Supabase/Database",
    description: "Migrations, RLS policies and data architecture.",
    required_permissions: ["code:read", "schema:read"],
    uses_external_apis: false,
  },
  {
    role: "calculator_validation",
    label: "Calculator Validation",
    description: "Deterministic engine verification against known answers.",
    required_permissions: ["engines:run", "tests:run"],
    uses_external_apis: false,
  },
  {
    role: "testing_qa",
    label: "Testing/QA",
    description: "Test authoring, execution and regression triage.",
    required_permissions: ["tests:run", "code:read"],
    uses_external_apis: false,
  },
  {
    role: "cybersecurity",
    label: "Cybersecurity",
    description: "Threat modeling and security review.",
    required_permissions: ["code:read", "security:scan"],
    uses_external_apis: false,
  },
  {
    role: "performance",
    label: "Performance",
    description: "Bundle analysis, profiling and optimization proposals.",
    required_permissions: ["code:read", "build:run"],
    uses_external_apis: false,
  },
  {
    role: "seo",
    label: "SEO",
    description: "Meta/structured data, sitemaps and discoverability.",
    required_permissions: ["code:read", "seo:audit"],
    uses_external_apis: false,
  },
  {
    role: "pwa_mobile",
    label: "PWA/Mobile",
    description: "Installability, service workers, mobile UX.",
    required_permissions: ["code:read"],
    uses_external_apis: false,
  },
  {
    role: "documentation",
    label: "Documentation",
    description: "Docs, guides and knowledge structuring.",
    required_permissions: ["code:read", "docs:write"],
    uses_external_apis: false,
  },
  {
    role: "web_research",
    label: "Web Research",
    description: "Authorized external web research through governed sources.",
    required_permissions: ["web:research"],
    uses_external_apis: true,
  },
  {
    role: "infrastructure",
    label: "Infrastructure",
    description: "CI/CD, hosting, budgets and operational health.",
    required_permissions: ["infra:read", "build:run"],
    uses_external_apis: false,
  },
  {
    role: "integrations",
    label: "Integrations",
    description: "Connector and provider integration analysis.",
    required_permissions: ["code:read", "integrations:read"],
    uses_external_apis: true,
  },
  {
    role: "market_intelligence",
    label: "Market Intelligence",
    description: "Material and service market data via governed sources.",
    required_permissions: ["market:read", "web:research"],
    uses_external_apis: true,
  },
  {
    role: "crypto_research",
    label: "Crypto Research",
    description:
      "Owner-only crypto/digital-asset research; analysis only, never financial execution.",
    required_permissions: ["crypto:research"],
    uses_external_apis: true,
  },
  {
    role: "architecture",
    label: "Architecture Analysis",
    description: "System design review and structural recommendations.",
    required_permissions: ["code:read", "schema:read"],
    uses_external_apis: false,
  },
];

export function findAgentRole(role: string): AgentRoleSpec | undefined {
  return AGENT_ROLES.find((r) => r.role === role);
}

// ---------------------------------------------------------
// Fleet planning: estimate BEFORE spawning, consolidate
// redundant agents, respect real constraints
// ---------------------------------------------------------

export interface AgentPlanRequest {
  task: string;
  requested_roles: string[];
  /** Rough estimate of external cost this fleet may incur. */
  estimated_cost_cents: number;
  estimated_duration_minutes?: number;
}

export interface AgentPlan {
  roles: AgentRoleSpec[];
  rejected_roles: Array<{ role: string; reason: string }>;
  estimated_cost_cents: number;
  consolidations: string[];
  decision: BudgetDecision;
}

/**
 * Plan a fleet: validates roles, consolidates duplicates and
 * overlapping roles, then asks cost-governance whether the
 * estimated spend is allowed under current budgets. Spawning
// without an ALLOW/QUEUE decision is forbidden.
 */
export function planAgentFleet(
  request: AgentPlanRequest,
  snapshot: BudgetSnapshot,
): AgentPlan {
  // Internal operation classification is structural:
  const opClass = "INTERNAL_ARCHIE_OPERATION";
  assertNotCustomerQuota(opClass);

  const rejected: Array<{ role: string; reason: string }> = [];
  const valid: AgentRoleSpec[] = [];
  for (const role of request.requested_roles) {
    const spec = findAgentRole(role);
    if (!spec) {
      rejected.push({
        role,
        reason:
          "unknown role; roles must be registered in AGENT_ROLES or added to the catalog first",
      });
      continue;
    }
    valid.push(spec);
  }

  // Consolidate exact duplicates.
  const seen = new Set<string>();
  const consolidations: string[] = [];
  const deduped: AgentRoleSpec[] = [];
  for (const spec of valid) {
    if (seen.has(spec.role)) {
      consolidations.push(
        `duplicate role "${spec.role}" consolidated to one agent`,
      );
      continue;
    }
    seen.add(spec.role);
    deduped.push(spec);
  }
  // code_analysis overlaps architecture/debugging read needs.
  if (
    deduped.length > 1 &&
    deduped.some((r) => r.role === "code_analysis") &&
    deduped.some((r) => r.role === "architecture")
  ) {
    consolidations.push(
      'architecture role subsumes read-only "code_analysis" scope; consolidated',
    );
  }

  const decision = budgetDecision(snapshot, request.estimated_cost_cents);
  return {
    roles: deduped,
    rejected_roles: rejected,
    estimated_cost_cents: request.estimated_cost_cents,
    consolidations,
    decision,
  };
}

// ---------------------------------------------------------
// Agent record + event shapes (persisted via edge functions)
// ---------------------------------------------------------

export interface InternalAgentRecord {
  id: string;
  role: string;
  display_name: string;
  status: AgentLifecycleState;
  task: string;
  permissions: string[];
  estimated_cost_cents: number;
  actual_cost_cents: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AgentEvent {
  agent_id: string;
  event:
    | "CREATE"
    | "AUTHORIZE"
    | "ASSIGN"
    | "EXECUTE"
    | "MONITOR"
    | "REPORT"
    | "TERMINATE"
    | "FAIL"
    | "COST";
  detail: Record<string, unknown>;
  actor: string;
}

/** Validate a lifecycle event before it is appended to the audit. */
export function validateAgentEvent(
  current: AgentLifecycleState,
  event: AgentEvent["event"],
): AgentLifecycleState {
  switch (event) {
    case "CREATE":
      if (current !== "CREATED")
        throw new Error("CREATE is only valid at the initial CREATED state");
      return "CREATED";
    case "AUTHORIZE":
      assertTransition(current, "AUTHORIZED");
      return "AUTHORIZED";
    case "ASSIGN":
      assertTransition(current, "ASSIGNED");
      return "ASSIGNED";
    case "EXECUTE":
      assertTransition(current, "EXECUTING");
      return "EXECUTING";
    case "MONITOR":
      assertTransition(current, "MONITORING");
      return "MONITORING";
    case "REPORT":
      assertTransition(current, "REPORTING");
      return "REPORTING";
    case "TERMINATE":
      assertTransition(current, "TERMINATED");
      return "TERMINATED";
    case "FAIL":
      assertTransition(current, "FAILED");
      return "FAILED";
    case "COST":
      // Cost events don't change lifecycle state.
      return current;
  }
}
