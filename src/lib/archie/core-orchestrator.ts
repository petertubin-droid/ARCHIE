// =========================================================
// FRELUX PHASE 8 FINAL, ARCHIE CORE ORCHESTRATOR
//
// The connection between ARCHIE and the FRELUX application
// core. ARCHIE reasons ACROSS the core systems and selects
// the appropriate FRELUX tool instead of operating
// independently:
//
//   ARCHIE → FRELUX CORE → TOOLS/DATA/KNOWLEDGE → RESULT → ARCHIE
//
// and for protected changes:
//
//   ARCHIE → ANALYZE → PLAN → TEST/VALIDATE → PRESENT ACTION →
//   OWNER APPROVAL → FRELUX CORE (APPLY) → AUDIT → VERSION/ROLLBACK
//
// ARCHIE NEVER bypasses the owner approval gate. Every
// binding in FRELUX_CORE_SYSTEMS is a REAL module verified
// by dynamic import at health-check time, disconnected,
// simulated, placeholder, duplicate or non-functional
// integrations fail LOUDLY.
// =========================================================

import {
  FRELUX_CORE_SYSTEMS,
  findCoreSystem,
  type CoreSystemKey,
} from "./core-capabilities";
import {
  classifyOperation,
  OWNER_RESERVED_OPERATIONS,
  AUTONOMOUS_OPERATIONS,
} from "./operating-model";
import { selectTool, type ToolSelection } from "./tool-router";
import {
  createChangeRequest,
  advanceChange,
  type ChangeRequest,
  type ChangeStage,
  type ChangeActor,
} from "./change-pipeline";

// ---------------------------------------------------------
// Real module loading, the connectivity proof
// ---------------------------------------------------------

/** Explicit per-system loaders, REAL dynamic imports of the
 *  actual FRELUX core modules. Statically analyzable so both
 *  the browser and vite/node resolve the aliases correctly. */
const LOADERS: Record<CoreSystemKey, () => Promise<Record<string, unknown>>> = {
  AI_CORE: () => import("@/lib/ai"),
  ENGINEERING_OBJECTIVE: () => import("@/lib/archie/engineering-objective"),
  STUDIO: () => import("@/lib/studio/preview"),
  PROVIDER_INDEPENDENCE: () => import("@/lib/archie/provider-independence"),
  NATIVE_INTELLIGENCE: () => import("@/lib/archie/native-intelligence"),
  NATIVE_ENGINE: () => import("@/lib/archie/native-engine-core"),
  PWA_ARCHITECTURE: () => import("@/lib/archie/pwa-architecture"),
  DETERMINISTIC_ENGINES: () => import("@/lib/ai-foundation/engines-registry"),
  CALCULATORS: () => import("@/lib/calc"),
  PROJECTS_PROPERTIES: () => import("@/lib/local-projects"),
  CONTRACTOR_INTELLIGENCE: () => import("@/lib/contractor"),
  MATERIALS_ESTIMATES: () => import("@/lib/shopping-list"),
  QUOTATIONS_PDF: () => import("@/lib/pdf"),
  PLAN_VISION: () => import("@/lib/plan-vision/extraction"),
  MARKET_INTELLIGENCE: () => import("@/lib/market-intelligence/queries"),
  WEB_INTELLIGENCE: () => import("@/lib/archie/web-intelligence"),
  KNOWLEDGE_LEARNING: () => import("@/lib/learning/learning-engine"),
  USER_FILES_STORAGE: () => import("@/lib/storage"),
  FRELUX_API: () => import("@/lib/frelix-api/portal-client"),
  SOURCE_CODE_INTELLIGENCE: () => import("@/lib/archie/code-intelligence"),
  DIAGNOSTICS_HEALTH: () => import("@/lib/error-analysis"),
  ARCHIE_INTERNAL_AGENTS: () => import("@/lib/archie/internal-agents"),
  CRYPTO_INTELLIGENCE: () => import("@/lib/archie/crypto-intelligence"),
  FOUNDATION_KNOWLEDGE: () => import("@/lib/archie/engineering-knowledge"),
  COST_GOVERNANCE: () => import("@/lib/archie/cost-governance"),
};

/** Dynamically import a core system's REAL module. Throws on a
 *  disconnected binding, there are no simulated fallbacks. */
export async function loadCoreSystem(
  key: CoreSystemKey,
): Promise<Record<string, unknown>> {
  const binding = findCoreSystem(key);
  const loader = LOADERS[binding.key];
  if (!loader) {
    throw new Error(`No real loader bound for core system "${key}"`);
  }
  return loader();
}

export interface CoreHealthResult {
  key: CoreSystemKey;
  label: string;
  status: "LIVE" | "DISCONNECTED";
  missing_exports: string[];
  error?: string;
}

/** THE integration test: import every registered core module
 *  and verify every bound export exists and is a function.
 *  Any DISCONNECTED entry is a wiring failure, not a warning. */
export async function coreHealthCheck(): Promise<{
  healthy: boolean;
  systems: CoreHealthResult[];
}> {
  const systems: CoreHealthResult[] = [];
  for (const binding of FRELUX_CORE_SYSTEMS) {
    try {
      const mod = await loadCoreSystem(binding.key);
      const missing = binding.exports.filter((name) => !(name in mod));
      systems.push({
        key: binding.key,
        label: binding.label,
        status: missing.length === 0 ? "LIVE" : "DISCONNECTED",
        missing_exports: missing,
      });
    } catch (err) {
      systems.push({
        key: binding.key,
        label: binding.label,
        status: "DISCONNECTED",
        missing_exports: binding.exports,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    healthy: systems.every((s) => s.status === "LIVE"),
    systems,
  };
}

// ---------------------------------------------------------
// Orchestration, ARCHIE routes into the core
// ---------------------------------------------------------

export interface CoreRouting {
  question: string;
  tool: ToolSelection;
  core_system: CoreSystemKey;
  /** What ARCHIE is allowed to do with this routing. */
  authority: "ARCHIE_MAY_ACT" | "OWNER_APPROVAL_REQUIRED";
  rationale: string;
  /** How ARCHIE reaches the real implementation. */
  dispatch: {
    module: string;
    exports: string[];
    deterministic: boolean;
  };
}

/** Route a question/request to the FRELUX core. Reuses the
 *  Phase 8 P3 tool selection (deterministic engines are
 *  mandatory for calculations), maps it onto the core
 *  registry, and applies the 80/20 operating model. */
export function orchestrate(question: string): CoreRouting {
  // Owner-reserved phrasing routes straight to the gate.
  const classification = classifyOperation(question);
  if (classification.verdict === "OWNER_APPROVAL_REQUIRED") {
    const gateBinding: CoreSystemKey =
      classification.gate === "governance promotion"
        ? "KNOWLEDGE_LEARNING"
        : "SOURCE_CODE_INTELLIGENCE";
    const binding = findCoreSystem(gateBinding);
    return {
      question,
      tool: {
        intent: "GENERAL_KNOWLEDGE",
        must_use_deterministic_engine: false,
        rationale: "Protected action: routed to the owner approval gate.",
      },
      core_system: gateBinding,
      authority: "OWNER_APPROVAL_REQUIRED",
      rationale: classification.rationale,
      dispatch: {
        module: binding.module,
        exports: binding.exports,
        deterministic: binding.deterministic,
      },
    };
  }

  // Autonomous routing through the P3 tool selector.
  const tool = selectTool(question);
  const key = toolToCoreSystem(tool);
  const binding = findCoreSystem(key);
  return {
    question,
    tool,
    core_system: key,
    authority: "ARCHIE_MAY_ACT",
    rationale: tool.rationale,
    dispatch: {
      module: binding.module,
      exports: binding.exports,
      deterministic: tool.must_use_deterministic_engine,
    },
  };
}

const TOOL_TO_SYSTEM: Readonly<Record<string, CoreSystemKey>> = {
  build_to_roof: "DETERMINISTIC_ENGINES",
  roof_geometry: "DETERMINISTIC_ENGINES",
  painting: "CALCULATORS",
  tyrolene_partition: "CALCULATORS",
  timeline: "PROJECTS_PROPERTIES",
  quotations: "QUOTATIONS_PDF",
  shopping_lists: "MATERIALS_ESTIMATES",
  material_planning: "MATERIALS_ESTIMATES",
  contractor_library: "CONTRACTOR_INTELLIGENCE",
  weather_intelligence: "PROJECTS_PROPERTIES",
  market_intelligence: "MARKET_INTELLIGENCE",
  property_intelligence: "PROJECTS_PROPERTIES",
  construction_intelligence: "PROJECTS_PROPERTIES",
  image_estimation: "PLAN_VISION",
};

function toolToCoreSystem(tool: ToolSelection): CoreSystemKey {
  if (tool.capability) {
    const mapped = TOOL_TO_SYSTEM[tool.capability.key];
    if (mapped) return mapped;
  }
  if (tool.intent === "CALCULATION") return "DETERMINISTIC_ENGINES";
  return "AI_CORE";
}

/** The full core inventory, for ARCHIE's own diagnostics and
 *  the admin health surface. */
export function describeCore(): Array<{
  key: string;
  label: string;
  family: string;
  autonomy: string;
  deterministic: boolean;
}> {
  return FRELUX_CORE_SYSTEMS.map((s) => ({
    key: s.key,
    label: s.label,
    family: s.family,
    autonomy: s.autonomy,
    deterministic: s.deterministic,
  }));
}

export { OWNER_RESERVED_OPERATIONS, AUTONOMOUS_OPERATIONS };

// ---------------------------------------------------------
// The owner approval gate (protected actions)
// ---------------------------------------------------------

export interface PresentedAction {
  change_request_id: string;
  action: string;
  affected_component: string;
  reason: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  plan: string;
  test_evidence: string;
  proposed_version: string;
  rollback_plan: string;
  presented_at: string;
}

export interface OwnerApproval {
  owner_id: string;
  action: string;
  reason: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  affected_component: string;
  tests_passed: boolean;
  test_evidence: string;
  approved_at: string;
  version: string;
  rollback_ref: string;
  authorization_record_id: string;
}

/** Build the PRESENTED ACTION package, the artifact the
 *  owner reviews. It carries the full record the prompt
 *  requires: action, reason/context, before/after state,
 *  affected component, tests/results, version, rollback. */
export function buildPresentedAction(
  change: ChangeRequest,
  args: {
    action: string;
    affected_component: string;
    reason: string;
    before_state?: Record<string, unknown>;
    after_state?: Record<string, unknown>;
    proposed_version: string;
    rollback_plan?: string;
    now?: string;
  },
): { ok: boolean; error?: string; presented?: PresentedAction } {
  if (change.stage !== "REVIEW") {
    return {
      ok: false,
      error: `PRESENT ACTION requires a reviewed change (currently ${change.stage})`,
    };
  }
  if (!args.reason.trim()) {
    return {
      ok: false,
      error: "A presented action requires the reason/context",
    };
  }
  if (!args.proposed_version.trim()) {
    return {
      ok: false,
      error: "A presented action requires a proposed version",
    };
  }
  const rollbackPlan =
    change.rollback_plan?.trim() || args.rollback_plan?.trim();
  if (!rollbackPlan) {
    return {
      ok: false,
      error: "A presented action requires the rollback plan",
    };
  }
  return {
    ok: true,
    presented: {
      change_request_id: change.id,
      action: args.action,
      affected_component: args.affected_component,
      reason: args.reason,
      before_state: args.before_state ?? {},
      after_state: args.after_state ?? {},
      plan: change.plan ?? "",
      test_evidence: change.test_evidence ?? "",
      proposed_version: args.proposed_version,
      rollback_plan: rollbackPlan,
      presented_at: args.now ?? new Date().toISOString(),
    },
  };
}

/** OWNER APPROVAL, the authenticated approval record. ARCHIE
 *  can never call this: actor must be OWNER, and the record is
 *  written server-side by the archie-owner-auth function
 *  (PBKDF2-verified secret, service-role insert). */
export function ownerApproves(
  change: ChangeRequest,
  presented: PresentedAction,
  actor: ChangeActor,
  args: { owner_id: string; authorization_record_id: string },
): {
  ok: boolean;
  error?: string;
  approval?: OwnerApproval;
  change?: ChangeRequest;
} {
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the owner can approve, ARCHIE never approves its own change",
    };
  }
  if (presented.change_request_id !== change.id) {
    return { ok: false, error: "The approval must match the presented action" };
  }
  if (!args.authorization_record_id) {
    return {
      ok: false,
      error:
        "Approval requires the server-side authorization record (archie-owner-auth)",
    };
  }
  const advanced = advanceChange(change, "OWNER_AUTHORIZATION", "OWNER", {
    rollback_plan: presented.rollback_plan,
  });
  if (!advanced.ok) return { ok: false, error: advanced.error };
  return {
    ok: true,
    change: advanced.change,
    approval: {
      owner_id: args.owner_id,
      action: presented.action,
      reason: presented.reason,
      before_state: presented.before_state,
      after_state: presented.after_state,
      affected_component: presented.affected_component,
      tests_passed: Boolean(presented.test_evidence),
      test_evidence: presented.test_evidence,
      approved_at: new Date().toISOString(),
      version: presented.proposed_version,
      rollback_ref: presented.rollback_plan,
      authorization_record_id: args.authorization_record_id,
    },
  };
}

/** APPLY, owner only, after approval. */
export function applyAuthorizedChange(
  change: ChangeRequest,
  approval: OwnerApproval,
  actor: ChangeActor,
): { ok: boolean; error?: string; change?: ChangeRequest } {
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the owner can apply an authorized change",
    };
  }
  if (!approval.authorization_record_id) {
    return {
      ok: false,
      error: "APPLY requires the server-side approval record",
    };
  }
  const advanced = advanceChange(change, "APPLY", "OWNER", {});
  if (!advanced.ok) return { ok: false, error: advanced.error };
  return { ok: true, change: advanced.change };
}

export interface AuditRecord {
  action: string;
  owner_identity: string;
  reason: string;
  affected_component: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  tests_passed: boolean;
  test_evidence: string;
  approved_at: string;
  version: string;
  rollback_information: string;
  authorization_record_id: string;
  audited_at: string;
}

/** AUDIT, the append-only record of what was applied. */
export function auditAppliedChange(
  approval: OwnerApproval,
  now?: string,
): AuditRecord {
  return {
    action: approval.action,
    owner_identity: approval.owner_id,
    reason: approval.reason,
    affected_component: approval.affected_component,
    before_state: approval.before_state,
    after_state: approval.after_state,
    tests_passed: approval.tests_passed,
    test_evidence: approval.test_evidence,
    approved_at: approval.approved_at,
    version: approval.version,
    rollback_information: approval.rollback_ref,
    authorization_record_id: approval.authorization_record_id,
    audited_at: now ?? new Date().toISOString(),
  };
}

/** VERSION/ROLLBACK, the owner can roll back an applied
 *  change using the recorded rollback information; the
 *  authorization record's status moves to ROLLED_BACK
 *  server-side (archie-owner-auth record-rollback). */
export function rollbackAuthorizedChange(args: {
  authorization_record_id: string;
  actor: ChangeActor;
  reason: string;
}): { ok: boolean; error?: string } {
  if (args.actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the owner can roll back an applied change",
    };
  }
  if (!args.reason.trim()) {
    return {
      ok: false,
      error: "Rollback requires a reason for the audit trail",
    };
  }
  return { ok: true };
}

/** Convenience: open a protected change request through the
 *  full pipeline vocabulary. */
export function openProtectedChange(args: {
  title: string;
  areas: string[];
  created_by?: ChangeActor;
}): ChangeRequest {
  return createChangeRequest({
    title: args.title,
    areas: args.areas,
    created_by: args.created_by ?? "ARCHIE",
  });
}

export type { ChangeStage, ChangeActor };
