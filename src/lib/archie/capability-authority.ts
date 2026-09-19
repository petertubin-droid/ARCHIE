// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — CAPABILITY vs AUTHORITY (§9)
//
// ARCHIE's intelligence is NOT suppressed. Instead the
// architecture separates what ARCHIE CAN DO (capability —
// bounded only by knowledge and compute) from what ARCHIE IS
// PERMITTED TO DO (authority — bounded ONLY by the Owner's
// recorded authorization).
//
//   CAPABILITY:  discover, analyze, learn, calculate,
//                research, recommend, design, code, test.
//   AUTHORITY:   the Owner's recorded, scoped, expiring
//                permission for a consequential action.
//
// The Owner is the ONLY authority limit. No configuration,
// no learned knowledge, no self-evolution can widen
// authority. This module can never be modified by ARCHIE's
// own change pipeline (listed in evolution/authority.ts
// PROTECTED_SURFACES).
// =========================================================

/** What ARCHIE may do freely — observation & thought. */
export type ArchieCapability =
  | "discover"
  | "crawl"
  | "inspect"
  | "understand"
  | "analyze"
  | "learn"
  | "validate"
  | "reason"
  | "calculate"
  | "research"
  | "recommend"
  | "design"
  | "write_code"
  | "test_code"
  | "propose_change"
  | "patch_draft"
  | "report";

/** What ARCHIE may do only with recorded Owner authority. */
export type ArchieAuthority =
  | "deploy_code"
  | "apply_patch"
  | "modify_production"
  | "modify_own_code"
  | "run_authorized_security_test"
  | "access_authorized_target"
  | "publish_content"
  | "send_external_message"
  | "spend_money"
  | "change_configuration"
  | "grant_api_access";

/** Authority-requiring actions and their authorization shape. */
export interface AuthorizationRecord {
  id: string;
  authority: ArchieAuthority;
  /** What the authorization covers, e.g. a URL, repo path or target scope. */
  scope: string;
  granted_by: "OWNER";
  /** Epoch ms when granted. */
  granted_at: number;
  /** Epoch ms after which the authorization is void. */
  expires_at: number;
  /** Free-form evidence pointer (e.g. an owner session/approval id). */
  evidence: string;
}

/** The authority every capability maps to, or null when the
 *  action is free (pure observation/thought). */
const CAPABILITY_AUTHORITY_MAP: Record<
  ArchieCapability,
  ArchieAuthority | null
> = {
  discover: null,
  crawl: null,
  inspect: null,
  understand: null,
  analyze: null,
  learn: null,
  validate: null,
  reason: null,
  calculate: null,
  research: null,
  recommend: null,
  design: null,
  write_code: null,
  test_code: null,
  propose_change: null,
  patch_draft: null,
  report: null,
};

export const ALL_CAPABILITIES: readonly ArchieCapability[] = Object.keys(
  CAPABILITY_AUTHORITY_MAP,
) as ArchieCapability[];

/** Capabilities are free — ARCHIE may think, learn and
 *  reason without asking. */
export const FREE_CAPABILITIES: readonly ArchieCapability[] =
  ALL_CAPABILITIES.filter((c) => CAPABILITY_AUTHORITY_MAP[c] === null);

/** In-memory authorization registry. Production deployments
 *  mirror this in the archie_global_authorizations table
 *  (owner-only write via RLS); the DB record is the source
 *  of truth, this registry is the runtime cache of OWNER-
 *  granted records. ARCHIE can NEVER insert or update it. */
export class AuthorizationRegistry {
  private records = new Map<string, AuthorizationRecord>();

  /** OWNER-ONLY action (enforced by callers/RLS; ARCHIE never
   *  invokes this). Grants an authority for a scope. */
  grant(
    record: Omit<AuthorizationRecord, "granted_by"> & { granted_by?: "OWNER" },
  ): AuthorizationRecord {
    const full: AuthorizationRecord = { ...record, granted_by: "OWNER" };
    if (full.expires_at <= full.granted_at) {
      throw new Error("Authorization expiry must be after grant time.");
    }
    if (!full.scope.trim()) {
      throw new Error("Authorization must name its scope.");
    }
    this.records.set(full.id, full);
    return full;
  }

  /** OWNER-ONLY action. Revoke an authorization. */
  revoke(id: string): boolean {
    return this.records.delete(id);
  }

  /** Is an authority valid for a scope right now? */
  has(authority: ArchieAuthority, scope: string, now = Date.now()): boolean {
    for (const r of this.records.values()) {
      if (
        r.authority === authority &&
        r.granted_by === "OWNER" &&
        r.expires_at > now &&
        scopeMatches(r.scope, scope)
      ) {
        return true;
      }
    }
    return false;
  }

  listValid(now = Date.now()): AuthorizationRecord[] {
    return [...this.records.values()].filter((r) => r.expires_at > now);
  }
}

/** Scope matching: exact, or prefix with trailing wildcard. */
export function scopeMatches(
  grantedScope: string,
  requestedScope: string,
): boolean {
  if (grantedScope === requestedScope) return true;
  if (grantedScope.endsWith("*")) {
    const prefix = grantedScope.slice(0, -1);
    return requestedScope.startsWith(prefix);
  }
  return false;
}

/**
 * The single decision point: can ARCHIE perform this action?
 *
 *  - A pure capability → always ALLOWED (thinking is free).
 *  - An authority-requiring action → ALLOWED only when a
 *    valid OWNER authorization covers it.
 *  - ARCHIE itself can NEVER grant, approve or renew
 *    authority; this function never returns ALLOWED based on
 *    any ARCHIE-side input.
 */
export type AuthorityDecision =
  | {
      allowed: true;
      basis: "CAPABILITY_FREE" | "OWNER_AUTHORIZED";
      authorizationId?: string;
    }
  | { allowed: false; required: ArchieAuthority; reason: string };

export function checkAuthority(
  action: {
    capability?: ArchieCapability;
    authority?: ArchieAuthority;
    scope?: string;
  },
  registry: AuthorizationRegistry,
  now = Date.now(),
): AuthorityDecision {
  // A capability-only action is free.
  if (action.capability && !action.authority) {
    return { allowed: true, basis: "CAPABILITY_FREE" };
  }

  if (!action.authority) {
    return {
      allowed: false,
      required: "apply_patch",
      reason: "Action names neither a capability nor an authority.",
    };
  }

  const scope = action.scope ?? "";
  for (const r of registry.listValid(now)) {
    if (r.authority === action.authority && scopeMatches(r.scope, scope)) {
      return {
        allowed: true,
        basis: "OWNER_AUTHORIZED",
        authorizationId: r.id,
      };
    }
  }

  return {
    allowed: false,
    required: action.authority,
    reason:
      `Owner authorization required for "${action.authority}" on scope "${scope}". ` +
      "ARCHIE may prepare, propose and test — but not execute — until the Owner grants it.",
  };
}

/** The production-change pipeline for ARCHIE's own code.
 *  ARCHIE can never approve its own production changes:
 *  every deploy gate requires the OWNER actor. */
export type ProductionChangeStage =
  | "OBSERVED"
  | "ANALYZED"
  | "PROPOSED"
  | "OWNER_APPROVED_1"
  | "STAGED"
  | "TESTED"
  | "OWNER_APPROVED_2"
  | "DEPLOYED";

const PRODUCTION_PIPELINE: readonly ProductionChangeStage[] = [
  "OBSERVED",
  "ANALYZED",
  "PROPOSED",
  "OWNER_APPROVED_1",
  "STAGED",
  "TESTED",
  "OWNER_APPROVED_2",
  "DEPLOYED",
];

export function nextProductionStage(
  from: ProductionChangeStage,
  actor: "ARCHIE" | "OWNER",
): { ok: true; to: ProductionChangeStage } | { ok: false; error: string } {
  const idx = PRODUCTION_PIPELINE.indexOf(from);
  if (idx === -1 || idx === PRODUCTION_PIPELINE.length - 1) {
    return { ok: false, error: `No next stage from "${from}".` };
  }
  const next = PRODUCTION_PIPELINE[idx + 1];
  // Owner approvals are the only stages ARCHIE cannot perform.
  if (next === "OWNER_APPROVED_1" || next === "OWNER_APPROVED_2") {
    if (actor !== "OWNER") {
      return {
        ok: false,
        error: `Stage ${next} is an OWNER gate. ARCHIE cannot approve its own production changes.`,
      };
    }
  }
  return { ok: true, to: next };
}

/** Can ARCHIE ever reach DEPLOYED without the owner? No. */
export function ownerGatesRequired(): readonly ProductionChangeStage[] {
  return PRODUCTION_PIPELINE.filter(
    (s) => s === "OWNER_APPROVED_1" || s === "OWNER_APPROVED_2",
  );
}
