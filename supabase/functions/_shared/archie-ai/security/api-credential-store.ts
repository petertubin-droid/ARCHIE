// =========================================================
// ARCHIE API CREDENTIALS — SUPABASE STORAGE BACKEND
//
// The ONLY code that touches the credential tables. Service
// role only; the tables carry RLS FORCED with no policies so
// no client can reach them directly.
//
// Shared by archie-credentials (owner management) and
// archie-chat (API-credential channel) — one implementation,
// no duplicate authority surface.
// =========================================================

import type {
  ApiAuditEvent,
  ApiCredentialRecord,
  ApiCredentialStore,
  CredentialEnvironment,
} from "./api-credentials.ts";

export const UNKNOWN_OWNER = "00000000-0000-0000-0000-000000000000";

interface RestResult<T> {
  data: T | null;
  error: string | null;
}

function makeService(
  supabaseUrl: string,
  serviceRole: string,
): <T>(path: string, init?: RequestInit) => Promise<RestResult<T>> {
  // Normalize the join: SUPABASE_URL may or may not carry a
  // trailing slash (platform-injected env varies) — a missing
  // separator produced "supabase.corest/v1/..." DNS failures.
  const base = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;

  return async function service<T>(
    path: string,
    init?: RequestInit,
  ): Promise<RestResult<T>> {
    const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // The Supabase API gateway requires an apikey header on
        // every request (same convention as supabase-js, which
        // always sends both).
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        data: null,
        error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
      };
    }
    return { data: body as T, error: null };
  };
}

function rowToRecord(row: Record<string, unknown>): ApiCredentialRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    application: String(row.application),
    environment: row.environment as CredentialEnvironment,
    keyPrefix: String(row.key_prefix),
    keyHash: String(row.key_hash),
    scopes: (row.scopes as string[]) ?? [],
    rateLimitPerMinute: Number(row.rate_limit_per_minute ?? 60),
    status: row.status as ApiCredentialRecord["status"],
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    expiresAt: (row.expires_at as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    revokedReason: (row.revoked_reason as string | null) ?? null,
    rotatedTo: (row.rotated_to as string | null) ?? null,
    rotatedAt: (row.rotated_at as string | null) ?? null,
    rotatedFrom: (row.rotated_from as string | null) ?? null,
  };
}

function recordToRow(record: ApiCredentialRecord): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    application: record.application,
    environment: record.environment,
    key_prefix: record.keyPrefix,
    key_hash: record.keyHash,
    scopes: record.scopes,
    rate_limit_per_minute: record.rateLimitPerMinute,
    status: record.status,
    created_by: record.createdBy,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    last_used_at: record.lastUsedAt,
    revoked_at: record.revokedAt,
    revoked_reason: record.revokedReason,
    rotated_to: record.rotatedTo,
    rotated_at: record.rotatedAt,
    rotated_from: record.rotatedFrom,
  };
}

export function createSupabaseCredentialStore(
  supabaseUrl: string,
  serviceRole: string,
): ApiCredentialStore {
  const service = makeService(supabaseUrl, serviceRole);

  // Single-owner business model (same convention as
  // archie-owner-auth): system-level audit events with no
  // acting user are attributed to the owner account, because
  // frelux_security_events requires a real user id.
  let cachedOwnerId: string | null = null;
  async function resolveOwnerId(): Promise<string> {
    if (cachedOwnerId) return cachedOwnerId;
    // Owner convention is public.profiles.role = 'admin'
    // (public.is_admin() is the SQL helper wrapping it).
    const { data } = await service<{ id: string }[]>(
      "rest/v1/profiles?role=eq.admin&select=id&order=created_at.asc&limit=1",
    );
    cachedOwnerId = data?.[0]?.id ?? UNKNOWN_OWNER;
    return cachedOwnerId;
  }

  return {
    async insertCredential(record) {
      const { error } = await service("rest/v1/frelux_archie_api_credentials", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(recordToRow(record)),
      });
      return error ? { ok: false, reason: error } : { ok: true };
    },

    async findByHash(hash) {
      const { data } = await service<Record<string, unknown>[]>(
        `rest/v1/frelux_archie_api_credentials?key_hash=eq.${encodeURIComponent(
          hash,
        )}&select=*`,
      );
      return data && data.length > 0 ? rowToRecord(data[0]) : null;
    },

    async findById(id) {
      const { data } = await service<Record<string, unknown>[]>(
        `rest/v1/frelux_archie_api_credentials?id=eq.${encodeURIComponent(
          id,
        )}&select=*`,
      );
      return data && data.length > 0 ? rowToRecord(data[0]) : null;
    },

    async listByApplication(application) {
      const base =
        "rest/v1/frelux_archie_api_credentials?select=*&order=created_at.desc";
      const { data } = await service<Record<string, unknown>[]>(
        application
          ? `${base}&application=eq.${encodeURIComponent(application)}`
          : base,
      );
      return (data ?? []).map(rowToRecord);
    },

    async updateCredential(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.revokedAt !== undefined) row.revoked_at = patch.revokedAt;
      if (patch.revokedReason !== undefined) {
        row.revoked_reason = patch.revokedReason;
      }
      if (patch.rotatedTo !== undefined) row.rotated_to = patch.rotatedTo;
      if (patch.rotatedAt !== undefined) row.rotated_at = patch.rotatedAt;
      if (patch.lastUsedAt !== undefined) row.last_used_at = patch.lastUsedAt;
      if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
      const { error } = await service(
        `rest/v1/frelux_archie_api_credentials?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(row),
        },
      );
      return error ? { ok: false, reason: error } : { ok: true };
    },

    async getKillswitch() {
      const { data, error } = await service<{ global_killswitch: boolean }[]>(
        "rest/v1/frelux_archie_api_global_state?id=eq.1&select=global_killswitch",
      );
      // Fail CLOSED: the killswitch is an emergency brake. If its
      // state cannot be verified, treat it as ENGAGED — a DB
      // hiccup must never silently release the brake.
      if (error || !Array.isArray(data)) return true;
      return data[0]?.global_killswitch === true;
    },

    async setKillswitchState(active, updatedBy) {
      const { error } = await service(
        "rest/v1/frelux_archie_api_global_state?id=eq.1",
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            global_killswitch: active,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy,
          }),
        },
      );
      return error ? { ok: false, reason: error } : { ok: true };
    },

    async recordAudit(event: ApiAuditEvent) {
      const ownerId =
        event.ownerId === UNKNOWN_OWNER
          ? await resolveOwnerId()
          : event.ownerId;
      // FIX 28 (remediation batch 9, Level 6 security audit,
      // 2026-09-13): when no real owner account could be
      // resolved, the old code inserted the UNKNOWN_OWNER
      // sentinel itself as user_id — a fake uuid that violates
      // the auth.users FK, so the audit event was silently
      // lost (the insert error was never inspected). Post
      // migration 20260913030000, persist such events
      // honestly as SYSTEM events (user_id NULL) instead of
      // impersonating a nonexistent user.
      const userId =
        ownerId === UNKNOWN_OWNER ? null : (ownerId as string | null);
      await service("rest/v1/frelux_security_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          kind: event.kind,
          severity: event.severity,
          message: event.message,
          metadata: event.metadata,
        }),
      });
    },
  };
}
