// =========================================================
// ARCHIE API CREDENTIAL SYSTEM — SECURITY CORE
// (owner directive 2026-09-12)
//
// Production credential management for explicitly authorized
// applications (FRELUX first, future applications after).
//
// ARCHITECTURE (no new authority system — this module lives
// inside the existing ARCHIE security surface and inherits its
// rules):
//
//   * RAW KEYS ARE NEVER STORED. Only a verifier hash
//     (SHA-256, or HMAC-SHA256 when a server-side pepper is
//     configured) is persisted. The full key is returned to
//     the owner ONCE at creation and never again.
//   * LEAST PRIVILEGE: a credential grants ONLY the scopes
//     explicitly listed at creation. There is no wildcard —
//     '*' and 'archie:*' are REJECTED. Scope names encode
//     ordinary API capabilities only; there is NO scope that
//     grants owner, admin, or authority operations, so no
//     credential can ever widen ARCHIE's authority boundary.
//   * AUTHENTICATION IS ONE INDEXED LOOKUP by verifier hash —
//     the store never sees the raw key and cannot leak it.
//   * EMERGENCY KILLSWITCH: a single owner-controlled flag
//     rejects every credential immediately, overriding
//     status and scope checks.
//   * AUDIT: creation, use, failure, revocation, rotation and
//     killswitch events flow to the EXISTING security audit
//     system (frelux_security_events). Brute-force audit
//     flooding is itself rate-limited.
//   * RATE LIMITING: per-credential token bucket, plus the
//     caller-side limit chosen by the edge function.
//   * SECRET HYGIENE: this module never logs. Error results
//     carry machine-readable CODES, never the key material.
//     List views use safeCredentialView() which cannot emit
//     key_hash or secret material by construction.
//
// This file is listed in PROTECTED_SURFACES
// (src/lib/archie/evolution/authority.ts): ARCHIE's own
// change pipeline can never modify it.
// =========================================================

import { checkRateLimit } from "../../rate-limit.ts";

// ---------------------------------------------------------
// Scope registry — the ONLY scopes a credential may hold.
// Fixed vocabulary. Least privilege by default (empty).
// ---------------------------------------------------------

export const ARCHIE_API_SCOPES = [
  "archie:chat",
  "archie:calculate",
  "archie:research",
  "archie:status",
] as const;

export type ArchieApiScope = (typeof ARCHIE_API_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(ARCHIE_API_SCOPES);

export const DEFAULT_SCOPES: readonly string[] = [];

/** Validate a requested scope list. Wildcards and unknown
 *  scopes are rejected — a credential can never silently
 *  gain unlisted permissions. */
export function validateScopes(
  scopes: readonly string[],
): { ok: true; scopes: ArchieApiScope[] } | { ok: false; reason: string } {
  if (!Array.isArray(scopes)) {
    return { ok: false, reason: "Scopes must be an array." };
  }
  const seen = new Set<string>();
  for (const s of scopes) {
    if (typeof s !== "string" || s.trim() !== s || s.length === 0) {
      return { ok: false, reason: "Invalid scope entry." };
    }
    if (s === "*" || s.includes("*")) {
      return {
        ok: false,
        reason: "Wildcard scopes are forbidden — list each scope explicitly.",
      };
    }
    if (!SCOPE_SET.has(s)) {
      return {
        ok: false,
        reason: `Unknown scope. Available scopes: ${ARCHIE_API_SCOPES.join(", ")}.`,
      };
    }
    if (seen.has(s)) {
      return { ok: false, reason: "Duplicate scope entry." };
    }
    seen.add(s);
  }
  return { ok: true, scopes: [...seen] as ArchieApiScope[] };
}

// ---------------------------------------------------------
// Key format
//
//   archie_ak_<envTag>_<application>_<43-char base64url secret>
//
// envTag maps production→live, staging→test, development→dev.
// The display prefix (stored, non-secret) is the key up to and
// including the first 8 characters of the random section.
// ---------------------------------------------------------

export type CredentialEnvironment = "production" | "staging" | "development";

const ENV_TAG: Record<CredentialEnvironment, string> = {
  production: "live",
  staging: "test",
  development: "dev",
};

const ENV_BY_TAG: Record<string, CredentialEnvironment> = {
  live: "production",
  test: "staging",
  dev: "development",
};

/** 32 random bytes, base64url — 256 bits of entropy. */
export function generateSecretSection(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Does this look like an ARCHIE API credential? Used to route
 *  between credential auth and normal Supabase JWT auth. */
export function isCredentialKey(value: string): boolean {
  return /^archie_ak_(live|test|dev)_[a-z0-9][a-z0-9-]{1,23}_[A-Za-z0-9_-]{43}$/.test(
    value,
  );
}

function buildKey(
  env: CredentialEnvironment,
  application: string,
  secret: string,
): string {
  return `archie_ak_${ENV_TAG[env]}_${application}_${secret}`;
}

/** Parse the environment from a well-formed key (never fails —
 *  callers pre-check with isCredentialKey). */
export function environmentFromKey(key: string): CredentialEnvironment | null {
  const m = /^archie_ak_(live|test|dev)_/.exec(key);
  return m ? ENV_BY_TAG[m[1]] : null;
}

// ---------------------------------------------------------
// Verifier hash — SHA-256, or HMAC-SHA256 when a pepper is
// configured (protects against database-only compromise).
// The hash is base64 and is the ONLY thing persisted.
// ---------------------------------------------------------

async function hashKey(key: string, pepper: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(key);
  const digest = await (async () => {
    if (pepper) {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(pepper),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      return crypto.subtle.sign("HMAC", cryptoKey, data);
    }
    return crypto.subtle.digest("SHA-256", data);
  })();
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---------------------------------------------------------
// Credential record (persisted metadata — no secret)
// ---------------------------------------------------------

export type CredentialStatus = "active" | "revoked" | "expired" | "rotated";

export interface ApiCredentialRecord {
  id: string;
  name: string;
  application: string;
  environment: CredentialEnvironment;
  keyPrefix: string;
  /** Verifier hash — never the raw key. Never shown in any view. */
  keyHash: string;
  scopes: string[];
  rateLimitPerMinute: number;
  status: CredentialStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  rotatedTo: string | null;
  rotatedAt: string | null;
  rotatedFrom: string | null;
}

/** List-safe view: cannot leak key material by construction. */
export function safeCredentialView(r: ApiCredentialRecord) {
  return {
    id: r.id,
    name: r.name,
    application: r.application,
    environment: r.environment,
    keyPrefix: r.keyPrefix,
    scopes: r.scopes,
    rateLimitPerMinute: r.rateLimitPerMinute,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
    revokedReason: r.revokedReason,
    rotatedAt: r.rotatedAt,
  };
}

// ---------------------------------------------------------
// Audit — flows into the EXISTING security events system.
// Types only; never carries key material. Field names carry
// only ids, prefixes and machine-readable codes.
// ---------------------------------------------------------

export type AuditSeverity = "info" | "warning" | "critical";

export interface ApiAuditEvent {
  /** The acting owner user id (management) — for auth events
   *  the credential's created_by owner, so the owner sees
   *  abuse against THEIR applications. */
  ownerId: string;
  kind: string;
  severity: AuditSeverity;
  message: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------
// Storage contract — implemented by the edge function over
// the credentials tables (service role), and by an
// in-memory store in tests. The store NEVER receives the raw
// key outside insertCredential's hashed form.
// ---------------------------------------------------------

export interface ApiCredentialStore {
  insertCredential(
    record: ApiCredentialRecord,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  findByHash(
    hash: string,
  ): Promise<ApiCredentialRecord | null>;
  findById(id: string): Promise<ApiCredentialRecord | null>;
  listByApplication(
    application: string | null,
  ): Promise<ApiCredentialRecord[]>;
  updateCredential(
    id: string,
    patch: Partial<
      Pick<
        ApiCredentialRecord,
        | "status"
        | "revokedAt"
        | "revokedReason"
        | "rotatedTo"
        | "rotatedAt"
        | "lastUsedAt"
        | "expiresAt"
      >
    >,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  getKillswitch(): Promise<boolean>;
  /** Emergency global revocation — flip the single
   *  killswitch row. Rejects ALL credentials immediately
   *  when true. */
  setKillswitchState(
    active: boolean,
    updatedBy: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  recordAudit(event: ApiAuditEvent): Promise<void>;
}

// ---------------------------------------------------------
// Audit flood protection — brute-force attempts must not
// flood the audit table. At most one audit row per
// (kind, key prefix) per AUDIT_DEDUPE_MS.
// ---------------------------------------------------------

const AUDIT_DEDUPE_MS = 60_000;
const auditDedupe = new Map<string, number>();

async function auditDeduped(store: ApiCredentialStore, event: ApiAuditEvent, dedupeKey: string | null): Promise<void> {
  if (dedupeKey !== null) {
    const now = Date.now();
    const last = auditDedupe.get(dedupeKey) ?? 0;
    if (now - last < AUDIT_DEDUPE_MS) return;
    auditDedupe.set(dedupeKey, now);
    if (auditDedupe.size > 1000) auditDedupe.clear();
  }
  await store.recordAudit(event);
}

// ---------------------------------------------------------
// Credential creation
// ---------------------------------------------------------

export interface CreateCredentialInput {
  name: string;
  application: string;
  environment: CredentialEnvironment;
  scopes: string[];
  /** Days until expiry. null = no expiry. */
  expiresAt: string | null;
  rateLimitPerMinute: number;
  createdBy: string;
  rotatedFrom?: string;
}

export interface CreatedCredential {
  record: ApiCredentialRecord;
  /** The complete API key. Shown ONCE. Never persisted. */
  secret: string;
}

export async function createCredential(
  store: ApiCredentialStore,
  input: CreateCredentialInput,
  pepper: string,
): Promise<
  { ok: true; credential: CreatedCredential }
  | { ok: false; reason: string }
> {
  // ---- validate inputs (least privilege, no silent grants)
  const name = input.name?.trim();
  if (!name || name.length > 80) {
    return { ok: false, reason: "Credential name is required (max 80 chars)." };
  }
  const application = input.application?.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(application ?? "")) {
    return {
      ok: false,
      reason:
        "Application id required: lowercase letters/digits/hyphens, 2-24 chars.",
    };
  }
  if (!(input.environment in ENV_TAG)) {
    return { ok: false, reason: "Invalid environment." };
  }
  const scopeCheck = validateScopes(input.scopes);
  if (!scopeCheck.ok) return scopeCheck;
  if (
    !Number.isInteger(input.rateLimitPerMinute) ||
    input.rateLimitPerMinute < 1 ||
    input.rateLimitPerMinute > 600
  ) {
    return { ok: false, reason: "Rate limit must be 1-600 requests/minute." };
  }

  // ---- generate key + verifier
  const secretSection = generateSecretSection();
  const secret = buildKey(input.environment, application!, secretSection);
  const keyHash = await hashKey(secret, pepper);
  const keyPrefix = `${secret.slice(0, keyPrefixLen(secret))}`;

  const record: ApiCredentialRecord = {
    id: crypto.randomUUID(),
    name,
    application: application!,
    environment: input.environment,
    keyPrefix,
    keyHash,
    scopes: scopeCheck.scopes,
    rateLimitPerMinute: input.rateLimitPerMinute,
    status: "active",
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    revokedReason: null,
    rotatedTo: null,
    rotatedAt: null,
    rotatedFrom: input.rotatedFrom ?? null,
  };

  const inserted = await store.insertCredential(record);
  if (!inserted.ok) return inserted;

  await auditDeduped(
    store,
    {
      ownerId: input.createdBy,
      kind: "archie_api_credential.created",
      severity: "info",
      message: `API credential "${name}" created for application "${application}" (${input.environment}).`,
      metadata: {
        credentialId: record.id,
        application,
        environment: input.environment,
        scopes: record.scopes,
        expiresAt: record.expiresAt,
      },
    },
    null,
  );

  // The ONE place the full secret exists — returned to the
  // caller (owner) exactly once.
  return { ok: true, credential: { record, secret } };
}

function keyPrefixLen(secret: string): number {
  // up to and including the first 8 chars of the random section
  const m = /^[^_]+_[^_]+_[^_]+_([A-Za-z0-9_-]{8})/.exec(secret);
  return m ? m.index + m[0].length : 24;
}

// ---------------------------------------------------------
// Authentication — the single verification path every
// API consumer goes through.
// ---------------------------------------------------------

export type AuthFailureCode =
  | "invalid"
  | "revoked"
  | "expired"
  | "killswitch"
  | "scope_denied"
  | "rate_limited";

export interface AuthSuccess {
  ok: true;
  credential: ApiCredentialRecord;
}

export interface AuthFailure {
  ok: false;
  code: AuthFailureCode;
  /** Human-safe message WITHOUT key material. Safe to return
   *  to a client and safe to log. */
  message: string;
}

export interface AuthenticateOptions {
  /** Every required scope must be in the credential's grant. */
  requiredScopes: string[];
  pepper: string;
  now?: Date;
}

export async function authenticateCredential(
  store: ApiCredentialStore,
  presentedKey: string,
  opts: AuthenticateOptions,
): Promise<AuthSuccess | AuthFailure> {
  const now = opts.now ?? new Date();

  // 0. Format gate — cheap reject, no store round trip.
  if (typeof presentedKey !== "string" || !isCredentialKey(presentedKey)) {
    return {
      ok: false,
      code: "invalid",
      message: "Invalid API credential.",
    };
  }

  // Anti-enumeration: invalid and valid attempts produce the
  // same observable shape; no timing detail beyond hashing.
  const keyHash = await hashKey(presentedKey, opts.pepper);

  // 1. Emergency killswitch overrides everything.
  if (await store.getKillswitch()) {
    await auditDeduped(
      store,
      {
        ownerId: "00000000-0000-0000-0000-000000000000",
        kind: "archie_api_credential.killswitch_denied",
        severity: "critical",
        message:
          "API credential rejected: emergency global killswitch is ACTIVE.",
        metadata: { keyPrefix: presentedKey.slice(0, 24) },
      },
      `killswitch:${presentedKey.slice(0, 24)}`,
    );
    return {
      ok: false,
      code: "killswitch",
      message:
        "All API credentials are currently disabled by the owner (emergency killswitch).",
    };
  }

  // 2. Single indexed lookup by verifier hash.
  const record = await store.findByHash(keyHash);
  if (!record) {
    await auditDeduped(
      store,
      {
        ownerId: "00000000-0000-0000-0000-000000000000",
        kind: "archie_api_credential.auth_failed",
        severity: "warning",
        message: "Authentication failed: unknown API credential presented.",
        metadata: { keyPrefix: presentedKey.slice(0, 24) },
      },
      `auth_failed:${presentedKey.slice(0, 24)}`,
    );
    return {
      ok: false,
      code: "invalid",
      message: "Invalid API credential.",
    };
  }

  // 3. Status checks. A revoked/rotated key still being
  // presented is a security signal (stale deployment or
  // compromised copy) — audit it, deduped against hammering.
  if (record.status === "revoked" || record.status === "rotated") {
    await auditDeduped(
      store,
      {
        ownerId: record.createdBy ?? "00000000-0000-0000-0000-000000000000",
        kind: "archie_api_credential.revoked_denied",
        severity: "warning",
        message: `Authentication failed: ${
          record.status === "rotated" ? "rotated" : "revoked"
        } API credential presented (id: ${record.id}).`,
        metadata: { keyPrefix: presentedKey.slice(0, 24), status: record.status },
      },
      `revoked:${record.id}:${new Date().toISOString().slice(0, 10)}`,
    );
    return {
      ok: false,
      code: "revoked",
      message: "This API credential has been revoked.",
    };
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
    // Persist the derived status once (idempotent).
    await store
      .updateCredential(record.id, { status: "expired" })
      .catch(() => undefined);
    await auditDeduped(
      store,
      {
        ownerId: record.createdBy,
        kind: "archie_api_credential.expired",
        severity: "info",
        message: `API credential "${record.name}" expired and is now rejected.`,
        metadata: { credentialId: record.id, application: record.application },
      },
      `expired:${record.id}`,
    );
    return {
      ok: false,
      code: "expired",
      message: "This API credential has expired.",
    };
  }

  // 4. Scope enforcement — least privilege, all required
  //    scopes must be explicitly granted.
  const granted = new Set(record.scopes);
  const missing = opts.requiredScopes.filter((s) => !granted.has(s));
  if (missing.length > 0) {
    await auditDeduped(
      store,
      {
        ownerId: record.createdBy,
        kind: "archie_api_credential.scope_denied",
        severity: "warning",
        message: `API credential "${record.name}" used for an operation outside its granted scopes.`,
        metadata: {
          credentialId: record.id,
          application: record.application,
          requiredScopes: opts.requiredScopes,
          grantedScopes: record.scopes,
        },
      },
      `scope_denied:${record.id}:${opts.requiredScopes.join(",")}`,
    );
    return {
      ok: false,
      code: "scope_denied",
      message: "This API credential does not include the required scope.",
    };
  }

  // 5. Per-credential rate limit (token bucket, per isolate,
  //    same mechanism as the rest of the edge surface).
  const rl = checkRateLimit(`archie-api-cred:${record.id}`, {
    maxRequests: record.rateLimitPerMinute,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    await auditDeduped(
      store,
      {
        ownerId: record.createdBy,
        kind: "archie_api_credential.rate_limited",
        severity: "warning",
        message: `API credential "${record.name}" exceeded its rate limit.`,
        metadata: {
          credentialId: record.id,
          application: record.application,
          limitPerMinute: record.rateLimitPerMinute,
        },
      },
      `rate_limited:${record.id}`,
    );
    return {
      ok: false,
      code: "rate_limited",
      message: "Rate limit exceeded for this API credential.",
    };
  }

  // 6. Record use (auditable, throttled to one write/minute
  //    per credential to avoid write amplification).
  const lastUsed = record.lastUsedAt
    ? new Date(record.lastUsedAt).getTime()
    : 0;
  if (now.getTime() - lastUsed > 60_000) {
    await store
      .updateCredential(record.id, { lastUsedAt: now.toISOString() })
      .catch(() => undefined);
  }

  return { ok: true, credential: record };
}

/** Extract a credential from an Authorization header value.
 *  Returns null for anything that is not a well-formed ARCHIE
 *  credential (so callers fall back to Supabase JWT auth). */
export function credentialFromAuthHeader(
  authHeader: string | null,
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return isCredentialKey(token) ? token : null;
}

// ---------------------------------------------------------
// Management operations (owner-gated in the edge function)
// ---------------------------------------------------------

export async function revokeCredential(
  store: ApiCredentialStore,
  id: string,
  reason: string,
  revokedBy: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const record = await store.findById(id);
  if (!record) return { ok: false, reason: "Credential not found." };
  if (record.status !== "active") {
    return { ok: false, reason: `Credential is already ${record.status}.` };
  }
  const now = new Date().toISOString();
  const updated = await store.updateCredential(id, {
    status: "revoked",
    revokedAt: now,
    revokedReason: reason || "revoked by owner",
  });
  if (!updated.ok) return updated;
  await auditDeduped(
    store,
    {
      ownerId: revokedBy,
      kind: "archie_api_credential.revoked",
      severity: "critical",
      message: `API credential "${record.name}" (${record.application}/${record.environment}) revoked.`,
      metadata: {
        credentialId: id,
        application: record.application,
        reason: reason || "revoked by owner",
      },
    },
    null,
  );
  return { ok: true };
}

export interface RotationResult {
  ok: boolean;
  reason?: string;
  credential?: CreatedCredential;
}

/** Rotate: the old credential is marked 'rotated' and linked
 *  to its successor; a fresh credential with the SAME
 *  application/environment/scopes is created and the new secret
 *  is shown ONCE. */
export async function rotateCredential(
  store: ApiCredentialStore,
  id: string,
  rotatedBy: string,
  pepper: string,
  expiresAt: string | null,
): Promise<RotationResult> {
  const old = await store.findById(id);
  if (!old) return { ok: false, reason: "Credential not found." };
  if (old.status !== "active") {
    return { ok: false, reason: `Credential is ${old.status}, not active.` };
  }
  const now = new Date().toISOString();

  // Create the successor first (linked to its predecessor).
  const created = await createCredential(
    store,
    {
      name: `${old.name} (rotated ${now.slice(0, 10)})`,
      application: old.application,
      environment: old.environment,
      scopes: old.scopes,
      expiresAt: expiresAt ?? old.expiresAt,
      rateLimitPerMinute: old.rateLimitPerMinute,
      createdBy: rotatedBy,
      rotatedFrom: old.id,
    },
    pepper,
  );
  if (!created.ok) return created;

  // Mark the predecessor rotated, pointing at the successor.
  const updated = await store.updateCredential(id, {
    status: "rotated",
    rotatedTo: created.credential.record.id,
    rotatedAt: now,
  });
  if (!updated.ok) {
    // Successor exists but predecessor stays active — the old
    // key keeps working until the owner re-rotates. Fail loud.
    return {
      ok: false,
      reason: `Successor created (${created.credential.record.id}) but the old credential could not be retired: ${updated.reason}.`,
    };
  }

  await auditDeduped(
    store,
    {
      ownerId: rotatedBy,
      kind: "archie_api_credential.rotated",
      severity: "critical",
      message: `API credential "${old.name}" rotated — old key retired, successor issued.`,
      metadata: {
        credentialId: id,
        successorId: created.credential.record.id,
        application: old.application,
      },
    },
    null,
  );

  return { ok: true, credential: created.credential };
}

/** Emergency global revocation — flips the single killswitch
 *  row. Every credential authentication is rejected
 *  immediately, regardless of status or scope. */
export async function setKillswitch(
  store: ApiCredentialStore,
  active: boolean,
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await store.setKillswitchState(active, updatedBy);
  if (!result.ok) return result;
  await auditDeduped(
    store,
    {
      ownerId: updatedBy,
      kind: active
        ? "archie_api_credential.killswitch_enabled"
        : "archie_api_credential.killswitch_disabled",
      severity: "critical",
      message: active
        ? "EMERGENCY: global API credential killswitch ENABLED — all credentials rejected."
        : "Global API credential killswitch disabled — normal credential evaluation restored.",
      metadata: { updatedBy },
    },
    null,
  );
  return { ok: true };
}
