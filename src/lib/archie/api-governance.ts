// =========================================================
// FRELUX ARCHIE EXTENSION, API SUBSCRIBER LIMIT GOVERNANCE
//
// Subscriber API keys operate ONLY within the permissions
// configured by the FRELUX Owner/Admin. Only authorized
// Owner/Admin controls may configure: endpoints,
// capabilities, AI features, calculator access, rate limits,
// daily/monthly quotas, usage limits, multimodal access, web
// intelligence, market intelligence, project/property
// capabilities, subscription entitlements, expiration, scopes
// and permissions, and environment access.
//
// Subscribers must NEVER be able to increase, alter or bypass
// their own limits. All enforcement occurs SERVER-SIDE
// (see the frelix-api edge function, quotas, rate limits and
// capabilities are read from the service-role key row, never
// from client state).
//
// ARCHIE must not grant subscribers additional permissions
// unless the Owner's authorization system explicitly permits
// it.
// =========================================================

export type GovernanceActor = "OWNER" | "ADMIN" | "ARCHIE" | "SUBSCRIBER";

/** The full set of subscriber-API fields ONLY Owner/Admin
 *  controls may configure. */
export const OWNER_ADMIN_CONFIGURED_FIELDS: readonly string[] = [
  "endpoints",
  "capabilities",
  "ai_features",
  "calculator_access",
  "rate_limits",
  "daily_quota",
  "monthly_quota",
  "usage_limits",
  "multimodal_access",
  "web_intelligence",
  "market_intelligence",
  "project_property_capabilities",
  "subscription_entitlements",
  "expiration",
  "scopes_and_permissions",
  "environment_access",
];

/** Who may configure subscriber API limits. */
export function mayConfigureApiLimits(
  actor: GovernanceActor,
  archieExplicitlyAuthorizedByOwner = false,
): { ok: boolean; error?: string } {
  if (actor === "OWNER" || actor === "ADMIN") return { ok: true };
  if (actor === "ARCHIE" && archieExplicitlyAuthorizedByOwner) {
    return { ok: true };
  }
  if (actor === "ARCHIE") {
    return {
      ok: false,
      error: "ARCHIE may not alter subscriber limits without the Owner's explicit authorization",
    };
  }
  return {
    ok: false,
    error: "Subscribers can never increase, alter or bypass their own limits",
  };
}

/** Can a subscriber ever modify their own limits? */
export function canSubscriberAlterLimits(): false {
  return false;
}

/** All enforcement is server-side: the client can request,
 *  but the service-role key row is the single source of
 *  truth. This is how the frelix-api edge function already
 *  works, quotas, rate limits and capabilities are read and
 *  enforced per request from the database, never from
 *  client-supplied state. */
export const API_ENFORCEMENT = "server-side (service-role key row is the single source of truth)" as const;

/** RLS governance note, mirrored in the migration: subscribers
 *  can READ their own key metadata; every WRITE (including
 *  quota, permission and status changes) is admin/service-
 *  role only. The prior owner-all write policy was removed :
 *  it allowed a subscriber to raise their own quotas. */
export const API_KEYS_RLS_MODEL = {
  subscriber_select_own_metadata: true,
  subscriber_write: false,
  admin_configure: true,
  service_role_issues_keys: true,
  rationale:
    "A FOR-ALL owner policy on frelux_api_keys let subscribers update their own rate_limit_per_minute, daily_quota, monthly_quota and permissions. It is replaced by SELECT-only for owners; all writes are admin/service-role.",
} as const;
