// =========================================================
// ARCHIE NATIVE ENGINE — CONNECTED DEVICE, HOUSEHOLD &
// ACCOUNT INTELLIGENCE CORE
// supabase/functions/_shared/archie-ai/native-engine/connections.ts
//
// The REAL core of ARCHIE's connective-tissue subsystem:
// authorized connection of real hardware and accounts.
//
// Owner directive (2026-09-10, "ARCHIE — Trusted Device,
// Household & Connected Account Intelligence"):
//   * ARCHIE connects devices/accounts ONLY through explicit,
//     authorized pairing — Web Bluetooth / WebUSB / network /
//     cloud transports in the PWA, each gated by the browser's
//     or provider's own pairing + permission prompts.
//   * Identity chain is explicit and separate:
//     IDENTITY → DEVICE → ACCOUNT → PERMISSIONS → ACCESS
//     SCOPE → AUDIT HISTORY. Family members never inherit
//     Owner privileges automatically.
//   * Connectivity is NEVER authorization: a reachable device
//     grants nothing. Only the permission/scope chain decides
//     what ARCHIE may do.
//   * No fake integrations, no simulated device control, no
//     claimed access when a real connection does not exist.
//   * Never bypass passwords, MFA, encryption, pairing
//     requirements, OS security, manufacturer security, account
//     permissions or access controls.
//
// Node/Deno compatible: pure deterministic functions, no
// runtime APIs at import time (the anatomy health runner can
// load this module in any JavaScript environment and prove the
// binding is real).
// =========================================================

// ---------------------------------------------------------
// 1. CANONICAL VOCABULARY (mirrors the migration CHECKs)
// ---------------------------------------------------------

export const CONNECTION_TRANSPORTS = [
  "bluetooth",
  "wifi",
  "hotspot",
  "usb",
  "local-network",
  "internet",
  "api",
] as const;
export type ConnectionTransport = (typeof CONNECTION_TRANSPORTS)[number];

export const DEVICE_KINDS = [
  "tv",
  "speaker",
  "phone",
  "computer",
  "tablet",
  "appliance",
  "smarthome",
  "other",
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Lifecycle of one authorized connection.
 *  DISCOVERED → PAIRING → PAIRED ⇄ CONNECTED, SUSPENDED →
 *  RESUMED, REVOKED is terminal. */
export const CONNECTION_STATUSES = [
  "DISCOVERED",
  "PAIRING",
  "PAIRED",
  "CONNECTED",
  "SUSPENDED",
  "REVOKED",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** The canonical device capabilities ARCHIE may be granted
 *  per connection (owner-directed vocabulary). */
export const DEVICE_PERMISSIONS = [
  "power",
  "media",
  "volume",
  "settings",
  "routines",
  "automation",
  "monitoring",
  "maintenance",
] as const;
export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

export const CONNECTION_EVENT_RESULTS = [
  "success",
  "failure",
  "denied",
] as const;
export type ConnectionEventResult = (typeof CONNECTION_EVENT_RESULTS)[number];

export const MAINTENANCE_ACTIONS = [
  "diagnose",
  "check-version",
  "identify-update",
  "recommend-upgrade",
  "install-update",
  "configure-upgrade",
  "verify-after-change",
  "rollback",
] as const;
export type MaintenanceAction = (typeof MAINTENANCE_ACTIONS)[number];

// ---------------------------------------------------------
// 2. THE PERMANENT PRINCIPLES (owner directive, encoded)
// ---------------------------------------------------------

export const CONNECTED_DEVICE_AUTHORITY_PRINCIPLE_ID =
  "connected_device_authority";

export const CONNECTED_DEVICE_AUTHORITY = {
  principleId: CONNECTED_DEVICE_AUTHORITY_PRINCIPLE_ID,
  title: "ARCHIE Connected Device, Household & Account Intelligence",
  rule:
    "When the Owner or an authorized family member explicitly connects a " +
    "device or account, ARCHIE may use the permissions granted for that " +
    "connection. Connectivity alone never constitutes authorization. " +
    "ARCHIE never bypasses passwords, MFA, encryption, pairing " +
    "requirements, operating-system security, manufacturer security, " +
    "account permissions or access controls.",
  chain: [
    "IDENTITY",
    "DEVICE",
    "ACCOUNT",
    "PERMISSIONS",
    "ACCESS SCOPE",
    "AUDIT HISTORY",
  ] as const,
  familyRule:
    "Family members never automatically inherit Owner privileges. Each " +
    "connection is bound to the identity that authorized it and to the " +
    "permissions and access scope granted for it.",
  actionChain: [
    "CONNECTION",
    "AUTHENTICATION/PAIRING",
    "PERMISSION SCOPE",
    "ARCHIE COGNITION",
    "AUTHORIZED ACTION",
    "RESULT",
    "VERIFICATION",
    "AUDIT",
    "MEMORY",
  ] as const,
  honestyRule:
    "No fake integrations, no simulated device control, no claims of " +
    "access when a real connection does not exist.",
} as const;

export const LEARNING_AUTHORITY_PRINCIPLE_ID = "learning_authority";

export const LEARNING_AUTHORITY = {
  principleId: LEARNING_AUTHORITY_PRINCIPLE_ID,
  title: "ARCHIE Learning & Knowledge Authority",
  rule:
    "ARCHIE has broad authorized access for learning and knowledge " +
    "acquisition: it may independently research the web and authorized " +
    "information sources, learn new subjects, technologies, programming " +
    "languages and frameworks, study documentation and source code, " +
    "analyze security and cybersecurity knowledge, learn from " +
    "conversations, experiments, errors, corrections and verified " +
    "results, organize and retain validated knowledge in persistent " +
    "memory, and continuously expand its knowledge without requiring " +
    "Owner approval for every learning activity.",
  limit: "Learning does NOT grant permission to modify production code.",
  architecture: [
    "ACCESS",
    "OBSERVE",
    "RESEARCH",
    "ANALYZE",
    "VERIFY",
    "LEARN",
    "REMEMBER",
    "APPLY",
  ] as const,
} as const;

export const CODE_PRODUCTION_AUTHORITY_PRINCIPLE_ID =
  "code_production_authority";

export const CODE_PRODUCTION_AUTHORITY = {
  principleId: CODE_PRODUCTION_AUTHORITY_PRINCIPLE_ID,
  title: "ARCHIE Code & Production Authority",
  rule:
    "Owner approval is required before ARCHIE makes consequential changes " +
    "to ARCHIE production code, FRELUX production code, calculators, " +
    "estimators, calculation engines, ARCHIE production architecture, " +
    "production databases or schemas, or production configuration and " +
    "deployment. ARCHIE may independently inspect, analyze, learn from, " +
    "propose, generate, test, debug and verify code in authorized " +
    "development/sandbox environments.",
  changeChain: [
    "DISCOVER",
    "ANALYZE",
    "PROPOSE",
    "OWNER APPROVAL",
    "STAGE",
    "TEST",
    "VERIFY",
    "OWNER APPROVAL",
    "PRODUCTION",
  ] as const,
  finalAuthority: "The Owner remains the final authority.",
} as const;

/** All three principles, in seed order (used by the
 *  migration seeder and integrity tests). */
export const CONNECTED_INTELLIGENCE_PRINCIPLES = [
  CONNECTED_DEVICE_AUTHORITY,
  LEARNING_AUTHORITY,
  CODE_PRODUCTION_AUTHORITY,
] as const;

// ---------------------------------------------------------
// 3. DATA SHAPES
// ---------------------------------------------------------

/** One authorized connection row (frelux_archie_connections). */
export interface ConnectionRecord {
  id: string;
  owner_id: string;
  /** The identity that authorized/uses this connection.
   *  NULL = the Owner. Family members are explicit people. */
  person_id: string | null;
  transport: ConnectionTransport;
  device_name: string;
  device_kind: DeviceKind;
  manufacturer: string | null;
  model: string | null;
  status: ConnectionStatus;
  /** Transport-level address: BLE deviceId, USB vendorId/
   *  productId, endpoint URL… — real addresses only. */
  transport_address: Record<string, unknown>;
  /** Granted device permissions (subset of DEVICE_PERMISSIONS). */
  permissions: DevicePermission[];
  /** Access scope: allowed actions + optional time windows. */
  access_scope: AccessScope;
  last_seen_at: string;
}

/** Access scope for a connection or account. */
export interface AccessScope {
  /** Action types allowed beyond the permission list
   *  (e.g. specific commands). Empty = permissions only. */
  actions?: string[];
  /** Recurring allowed windows (24h "HH:MM" local time). */
  windows?: AccessWindow[];
}

export interface AccessWindow {
  start: string;
  end: string;
}

/** Who is attempting an action. */
export interface Actor {
  type: "owner" | "family" | "archie";
  /** auth.users id of the acting person (owner or family). */
  userId: string;
  /** person_id when the actor is a family member. */
  personId?: string | null;
}

/** A candidate update for a connected device. */
export interface DeviceUpdate {
  version: string;
  /** Manufacturer/device statement that the update is
   *  compatible with this device. */
  compatible: boolean;
  /** Cryptographic or manufacturer verification status. */
  verified: boolean;
  /** Explicit Owner authorization for THIS update. */
  ownerAuthorized: boolean;
  /** Known-malicious flag from any reputable source. */
  flaggedMalicious?: boolean;
}

export type AuthorizationReason =
  | "ok"
  | "connection-revoked"
  | "connection-suspended"
  | "connection-not-paired"
  | "permission-not-granted"
  | "scope-window-closed"
  | "action-out-of-scope"
  | "family-not-authorized"
  | "actor-not-owner"
  | "connectivity-is-not-authorization";

export interface AuthorizationDecision {
  authorized: boolean;
  reason: AuthorizationReason;
}

// ---------------------------------------------------------
// 4. PAIRING STATE MACHINE (explicit, no implicit skips)
// ---------------------------------------------------------

export const PAIRING_EVENTS = [
  "pair-initiated",
  "pair-confirmed",
  "pair-failed",
  "connect",
  "disconnect",
  "suspend",
  "resume",
  "revoke",
] as const;
export type PairingEvent = (typeof PAIRING_EVENTS)[number];

/** Deterministic lifecycle transitions. A device that is
 *  merely REACHABLE (discovered) can never jump straight to
 *  CONNECTED — pairing + grant are the only path. */
const TRANSITIONS: Record<
  ConnectionStatus,
  Partial<Record<PairingEvent, ConnectionStatus>>
> = {
  DISCOVERED: {
    "pair-initiated": "PAIRING",
    "pair-confirmed": "PAIRED",
    revoke: "REVOKED",
  },
  PAIRING: {
    "pair-confirmed": "PAIRED",
    "pair-failed": "DISCOVERED",
    revoke: "REVOKED",
  },
  PAIRED: { connect: "CONNECTED", revoke: "REVOKED" },
  CONNECTED: { disconnect: "PAIRED", suspend: "SUSPENDED", revoke: "REVOKED" },
  SUSPENDED: { resume: "PAIRED", revoke: "REVOKED" },
  // REVOKED is terminal — no event revives a revoked connection.
  REVOKED: {},
};

export function pairingTransition(
  from: ConnectionStatus,
  event: PairingEvent,
): { ok: boolean; to: ConnectionStatus } {
  const to = TRANSITIONS[from]?.[event];
  return { ok: to !== undefined, to: to ?? from };
}

/** Connectivity is NEVER authorization: a transport probe
 *  (device reachable, USB attached, endpoint answering) can
 *  never change the lifecycle. Only pairing events do. */
export function connectivityIsAuthorization(): boolean {
  return false;
}

// ---------------------------------------------------------
// 5. PERMISSION & SCOPE EVALUATION (deterministic)
// ---------------------------------------------------------

export function normalizePermissions(
  granted: readonly string[],
): DevicePermission[] {
  const set = new Set<DevicePermission>();
  for (const p of granted) {
    if ((DEVICE_PERMISSIONS as readonly string[]).includes(p)) {
      set.add(p as DevicePermission);
    }
  }
  return DEVICE_PERMISSIONS.filter((p) => set.has(p));
}

function minutesOf(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** A time-of-day check against an access window. `at` is an
 *  ISO timestamp; windows are local "HH:MM"–"HH:MM"
 *  (wrpping over midnight when start > end). Deterministic:
 *  the caller supplies the clock, never Date.now() here. */
export function withinWindow(scope: AccessScope, at: Date): boolean {
  const windows = scope.windows ?? [];
  if (windows.length === 0) return true; // no windows = always
  const mins = at.getHours() * 60 + at.getMinutes();
  for (const w of windows) {
    const s = minutesOf(w.start);
    const e = minutesOf(w.end);
    if (s === null || e === null) continue;
    if (s <= e ? mins >= s && mins <= e : mins >= s || mins <= e) {
      return true;
    }
  }
  return false;
}

/** The core authorization gate. Deterministic, honest denials
 *  with typed reasons — never a silent fallback to allow. */
export function authorizeDeviceAction(
  connection: ConnectionRecord,
  actor: Actor,
  permission: DevicePermission,
  opts: { action?: string; at?: Date } = {},
): AuthorizationDecision {
  const { action, at = new Date(0) } = opts;

  // 1) lifecycle
  if (connection.status === "REVOKED") {
    return { authorized: false, reason: "connection-revoked" };
  }
  if (connection.status === "SUSPENDED") {
    return { authorized: false, reason: "connection-suspended" };
  }
  if (connection.status === "DISCOVERED" || connection.status === "PAIRING") {
    return { authorized: false, reason: "connection-not-paired" };
  }
  // A merely-reachable device was never a basis for action.
  void connectivityIsAuthorization;

  // 2) identity — family members act only on connections
  //    bound to their own person, never inherited
  if (actor.type === "family") {
    if (!connection.person_id || connection.person_id !== actor.personId) {
      return { authorized: false, reason: "family-not-authorized" };
    }
  } else if (actor.type !== "owner" && actor.type !== "archie") {
    return { authorized: false, reason: "actor-not-owner" };
  }
  // ARCHIE itself acts only on the Owner's connections.
  if (actor.type === "archie" && connection.owner_id !== actor.userId) {
    return { authorized: false, reason: "actor-not-owner" };
  }

  // 3) permission grant
  if (!connection.permissions.includes(permission)) {
    return { authorized: false, reason: "permission-not-granted" };
  }

  // 4) access scope: window + explicit action list
  if (!withinWindow(connection.access_scope, at)) {
    return { authorized: false, reason: "scope-window-closed" };
  }
  const allowedActions = connection.access_scope.actions;
  if (action !== undefined && allowedActions && allowedActions.length > 0) {
    if (!allowedActions.includes(action)) {
      return { authorized: false, reason: "action-out-of-scope" };
    }
  }

  return { authorized: true, reason: "ok" };
}

// ---------------------------------------------------------
// 6. MAINTENANCE & UPGRADE GATE
// ---------------------------------------------------------

export interface MaintenanceDecision {
  action: "install-update" | "recommend" | "deny";
  reason: string;
}

/** Never install incompatible, unverified, malicious or
 *  unauthorized firmware. Read-only maintenance (diagnose,
 *  version check, identify/recommend) is always permitted
 *  for a paired connection; INSTALL-grade actions require
 *  verified + compatible + owner-authorized + not flagged. */
export function maintenanceDecision(
  connection: ConnectionRecord,
  action: MaintenanceAction,
  update: DeviceUpdate | null,
): MaintenanceDecision {
  const canSee = (s: ConnectionStatus): boolean =>
    s === "PAIRED" || s === "CONNECTED";

  if (action === "install-update" || action === "configure-upgrade") {
    if (!canSee(connection.status)) {
      return { action: "deny", reason: "device not paired/connected" };
    }
    if (!connection.permissions.includes("maintenance")) {
      return { action: "deny", reason: "maintenance permission not granted" };
    }
    if (!update) {
      return { action: "deny", reason: "no update provided" };
    }
    if (update.flaggedMalicious === true) {
      return { action: "deny", reason: "update flagged malicious" };
    }
    if (!update.verified) {
      return { action: "deny", reason: "update not verified" };
    }
    if (!update.compatible) {
      return { action: "deny", reason: "update incompatible with device" };
    }
    if (!update.ownerAuthorized) {
      return { action: "deny", reason: "update not owner-authorized" };
    }
    return {
      action: "install-update",
      reason: "verified, compatible, authorized",
    };
  }

  // Read-only maintenance requires a paired/connected device
  // with the monitoring or maintenance permission — honest
  // refusal otherwise.
  if (!canSee(connection.status)) {
    return { action: "deny", reason: "device not paired/connected" };
  }
  const canMaintain =
    connection.permissions.includes("maintenance") ||
    connection.permissions.includes("monitoring");
  if (!canMaintain) {
    return { action: "deny", reason: "no maintenance/monitoring permission" };
  }
  if (action === "rollback") {
    // Rollback is recovery: allowed with maintenance permission
    // even without an update payload.
    return {
      action: "recommend",
      reason: "rollback permitted under maintenance grant",
    };
  }
  return { action: "recommend", reason: "read-only maintenance permitted" };
}

// ---------------------------------------------------------
// 7. AUDIT SHAPING — every action leaves an honest trail
// ---------------------------------------------------------

export interface ConnectionAuditInput {
  connectionId: string;
  ownerId: string;
  actor: Actor;
  action: string;
  request: Record<string, unknown>;
  result: ConnectionEventResult;
  detail: Record<string, unknown>;
  /** True only when the outcome was actually verified
   *  (e.g. device state read back / response checked). */
  verified: boolean;
}

export interface ConnectionAuditRow {
  connection_id: string;
  owner_id: string;
  actor_type: Actor["type"];
  action: string;
  request: Record<string, unknown>;
  result: ConnectionEventResult;
  detail: Record<string, unknown>;
  verified: boolean;
}

/** A denial must be recorded exactly like a success — the
 *  audit trail is the memory of what ARCHIE was NOT allowed
 *  to do. */
export function shapeAuditRow(input: ConnectionAuditInput): ConnectionAuditRow {
  if (input.actor.type === "family" && !input.actor.personId) {
    throw new Error(
      "family actor must carry an explicit personId — anonymous family access is never auditable",
    );
  }
  return {
    connection_id: input.connectionId,
    owner_id: input.ownerId,
    actor_type: input.actor.type,
    action: input.action,
    request: input.request,
    result: input.result,
    detail: input.detail,
    verified: input.verified,
  };
}
