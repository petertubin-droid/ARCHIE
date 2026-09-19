// =========================================================
// FRELUX PHASE 8 FINAL, THE 80/20 OPERATING MODEL
//
//   ARCHIE = broad operational intelligence & orchestration.
//   OWNER   = final authority and approval.
//
// The "80/20" split is RESPONSIBILITY and OPERATIONAL
// AUTONOMY, not a percentage of database or system
// permissions. ARCHIE may independently perform the
// permitted low-risk operations below; the Owner retains
// final authority over the protected list, always, with no
// exception path, no override and no time-based privilege
// decay.
// =========================================================

/** Operations ARCHIE may perform independently (the 80). */
export const AUTONOMOUS_OPERATIONS: readonly string[] = [
  "analysis",
  "reasoning",
  "retrieval",
  "planning",
  "recommendations",
  "tool selection",
  "learning",
  "content generation",
  "diagnostics",
  "system health inspection",
  "knowledge graph analysis",
  "estimate explanation",
  "read-only source code inspection",
  "market intelligence retrieval",
  "web intelligence retrieval (eligible sources)",
  "project data analysis (authorized)",
];

/** Operations the Owner retains final authority over (the
 *  20). Each maps to the Phase 8 P3 change pipeline and/or
 *  the Phase 8b server-side owner authorization. */
export const OWNER_RESERVED_OPERATIONS: readonly string[] = [
  "production code changes",
  "deployment",
  "deterministic calculation/formula changes",
  "structural, foundation and other high-risk engineering logic",
  "safety-critical rules",
  "security architecture",
  "credentials and secrets",
  "privileged permissions",
  "destructive database/system operations",
  "global knowledge promotion",
  "major system configuration",
  "irreversible or high-impact actions",
];

export type AuthorityVerdict = "ARCHIE_MAY_ACT" | "OWNER_APPROVAL_REQUIRED";

export interface OperationClassification {
  verdict: AuthorityVerdict;
  operation: string;
  rationale: string;
  /** The concrete gate that enforces it. */
  gate: "none (autonomous operation)" | "p3-change-pipeline" | "owner-auth (server-side)" | "governance promotion";
}

const OWNER_PATTERNS: ReadonlyArray<{ rx: RegExp; gate: OperationClassification["gate"] }> = [
  { rx: /production (code|deploy)/i, gate: "p3-change-pipeline" },
  { rx: /deploy(ment)?/i, gate: "p3-change-pipeline" },
  { rx: /deterministic (formula|math|calculation|engine)|formula (logic|change)|calculation\/(formula|engine)/i, gate: "p3-change-pipeline" },
  { rx: /deterministic[- ](math|logic|calculation|formula)/i, gate: "p3-change-pipeline" },
  { rx: /structural|foundation|load[- ]bearing/i, gate: "p3-change-pipeline" },
  { rx: /safety([- ]critical)? rules?/i, gate: "p3-change-pipeline" },
  { rx: /security (architecture|config)/i, gate: "owner-auth (server-side)" },
  { rx: /credential|secret|password|api[_ -]?key/i, gate: "owner-auth (server-side)" },
  { rx: /privileged (permission|role|access)/i, gate: "owner-auth (server-side)" },
  { rx: /destructive|drop table|delete all|truncate|wipe/i, gate: "owner-auth (server-side)" },
  { rx: /global knowledge promotion|promote.{0,40}global/i, gate: "governance promotion" },
  { rx: /major (system )?configuration/i, gate: "owner-auth (server-side)" },
  { rx: /irreversible|high[- ]impact/i, gate: "owner-auth (server-side)" },
];

/** Classify an operation request. Owner-reserved patterns are
 *  matched FIRST, an operation that is both autonomous and
 *  protected is treated as protected, always. */
export function classifyOperation(operation: string): OperationClassification {
  const op = operation.trim();
  const hit = OWNER_PATTERNS.find((p) => p.rx.test(op));
  if (hit) {
    return {
      verdict: "OWNER_APPROVAL_REQUIRED",
      operation: op,
      rationale: `"${op}" touches an Owner-reserved area. ARCHIE may analyze, plan, test and present, the Owner approves and applies.`,
      gate: hit.gate,
    };
  }
  const autonomous = AUTONOMOUS_OPERATIONS.find((a) =>
    op.toLowerCase().includes(a.split(" ")[0]),
  );
  return {
    verdict: "ARCHIE_MAY_ACT",
    operation: op,
    rationale: autonomous
      ? `"${op}" is a permitted autonomous operation, ARCHIE acts within its authorized scope.`
      : `"${op}" is not an Owner-reserved operation; ARCHIE operates within its authorized scope and standard guards.`,
    gate: "none (autonomous operation)",
  };
}

/** Map change areas (Phase 8 P3 vocabulary) onto the operating
 *  model: any owner-gated area forces OWNER_APPROVAL_REQUIRED. */
export function areasRequireOwner(areas: readonly string[]): boolean {
  return areas.some((a) =>
    OWNER_RESERVED_OPERATIONS.some((o) =>
      a.toLowerCase().includes(o.split(" ")[0].replace(/\/.*/, "")),
    ),
  );
}

/** The operating model, stated once, referenced everywhere. */
export const OPERATING_MODEL = {
  archie_role: "Broad operational intelligence and orchestration.",
  owner_role: "Final authority and approval over protected actions.",
  model: "80/20 = responsibility split, NOT a permission percentage.",
  archie_never_bypasses_owner_gate: true,
  knowledge_nequals_authority: true,
  learned_knowledge_is_not_authoritative: true,
  archie_cannot_self_approve: true,
} as const;
