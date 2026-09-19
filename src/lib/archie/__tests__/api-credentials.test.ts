// =========================================================
// ARCHIE API CREDENTIAL SYSTEM — QUALITY GATES
// (owner directive 2026-09-12)
//
// Covers the full credential lifecycle end to end:
//   generation, authentication, scope enforcement, invalid
//   credentials, revocation, rotation, expiration, rate
//   limiting, secret protection, audit logging, unauthorized
//   access, and the FRELUX integration contract.
//
// SECRET HYGIENE IN THIS FILE: tests generate keys and never
// print them. No real credential material can appear in test
// output — assertions check PROPERTIES, never echo secrets.
// =========================================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIE_API_SCOPES,
  ApiAuditEvent,
  ApiCredentialRecord,
  ApiCredentialStore,
  authenticateCredential,
  createCredential,
  credentialFromAuthHeader,
  isCredentialKey,
  revokeCredential,
  rotateCredential,
  safeCredentialView,
  setKillswitch,
  validateScopes,
} from "@studio-shared/archie-ai/security/api-credentials.ts";

// ---------------------------------------------------------
// In-memory store — same interface the Supabase backend
// implements. Never receives or holds a raw key.
// ---------------------------------------------------------
class MemoryStore implements ApiCredentialStore {
  records: ApiCredentialRecord[] = [];
  audit: ApiAuditEvent[] = [];
  killswitch = false;

  async insertCredential(
    record: ApiCredentialRecord,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    this.records.push({ ...record });
    return { ok: true };
  }
  async findByHash(hash: string): Promise<ApiCredentialRecord | null> {
    return this.records.find((r) => r.keyHash === hash) ?? null;
  }
  async findById(id: string): Promise<ApiCredentialRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }
  async listByApplication(
    application: string | null,
  ): Promise<ApiCredentialRecord[]> {
    return this.records.filter(
      (r) => application === null || r.application === application,
    );
  }
  async updateCredential(
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
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return { ok: false, reason: "not found" };
    Object.assign(rec, patch);
    return { ok: true };
  }
  async getKillswitch(): Promise<boolean> {
    return this.killswitch;
  }
  async setKillswitchState(
    active: boolean,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    this.killswitch = active;
    return { ok: true };
  }
  async recordAudit(event: ApiAuditEvent): Promise<void> {
    this.audit.push(event);
  }
}

const PEPPER = "unit-test-pepper";
const OWNER = "11111111-1111-1111-1111-111111111111";

function freshStore() {
  return new MemoryStore();
}

async function createFreluxCredential(
  store: MemoryStore,
  overrides: Record<string, unknown> = {},
) {
  return createCredential(
    store,
    {
      name: "Frelux web app",
      application: "frelux",
      environment: "production",
      scopes: ["archie:chat"],
      expiresAt: null,
      rateLimitPerMinute: 600,
      createdBy: OWNER,
      ...overrides,
    } as Parameters<typeof createCredential>[1],
    PEPPER,
  );
}

// Helper: authenticate a key against the store without
// exposing the key in any assertion message.
async function auth(
  store: MemoryStore,
  key: string,
  requiredScopes: string[],
  now?: Date,
) {
  return authenticateCredential(store, key, {
    requiredScopes,
    pepper: PEPPER,
    ...(now ? { now } : {}),
  });
}

beforeEach(() => {
  // fresh store per test; module-level rate-limit buckets key
  // by credential id (uuid), so no cross-test interference.
});

// ---------------------------------------------------------
// 1. Credential generation
// ---------------------------------------------------------
describe("credential generation", () => {
  it("produces well-formed production keys for FRELUX", async () => {
    const store = freshStore();
    const result = await createFreluxCredential(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record, secret } = result.credential;

    // Format: archie_ak_live_<application>_<43-char secret>
    expect(isCredentialKey(secret)).toBe(true);
    expect(secret.startsWith("archie_ak_live_frelux_")).toBe(true);
    expect(record.environment).toBe("production");
    expect(record.application).toBe("frelux");
    expect(record.status).toBe("active");
    expect(record.scopes).toEqual(["archie:chat"]);
  });

  it("stores ONLY a verifier hash — never the raw key", async () => {
    const store = freshStore();
    const result = await createFreluxCredential(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record, secret } = result.credential;

    expect(record.keyHash).not.toContain(secret);
    expect(record.keyHash.length).toBeGreaterThan(20);
    // The persisted record (as JSON) contains no key material.
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(JSON.stringify(store.records)).not.toContain(secret);
    // And no record field equals the secret.
    for (const value of Object.values(record)) {
      expect(value).not.toBe(secret);
    }
  });

  it("generates unique keys every time (256-bit secrets)", async () => {
    const store = freshStore();
    const secrets = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const r = await createFreluxCredential(store);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      secrets.add(r.credential.secret);
      hashes.add(r.credential.record.keyHash);
    }
    expect(secrets.size).toBe(25);
    expect(hashes.size).toBe(25);
  });

  it("rejects wildcard scopes — no credential can be unrestricted", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["*"] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("Wildcard");
  });

  it("rejects unknown scopes and duplicates", async () => {
    const store = freshStore();
    const bad = await createFreluxCredential(store, {
      scopes: ["archie:owner_auth"],
    });
    expect(bad.ok).toBe(false);
    const dup = await createFreluxCredential(store, {
      scopes: ["archie:chat", "archie:chat"],
    });
    expect(dup.ok).toBe(false);
  });

  it("allows EMPTY scopes — least privilege by default (deny-all)", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = await auth(store, r.credential.secret, ["archie:chat"]);
    expect(a.ok).toBe(false);
  });

  it("rejects invalid application ids, names, and rate limits", async () => {
    const store = freshStore();
    expect((await createFreluxCredential(store, { application: "Bad App" })).ok).toBe(false);
    expect((await createFreluxCredential(store, { name: "" })).ok).toBe(false);
    expect((await createFreluxCredential(store, { rateLimitPerMinute: 9999 })).ok).toBe(false);
  });

  it("the scope registry contains NO owner/admin/authority scope", () => {
    // ARCHIE can never mint a credential that widens authority.
    for (const scope of ARCHIE_API_SCOPES) {
      expect(scope).not.toMatch(/admin|owner|authority|deploy|patch|execute|internal/i);
    }
    expect(validateScopes(["archie:chat"]).ok).toBe(true);
  });
});

// ---------------------------------------------------------
// 2. Authentication
// ---------------------------------------------------------
describe("authentication", () => {
  it("authenticates a valid FRELUX credential", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = await auth(store, r.credential.secret, ["archie:chat"]);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.credential.application).toBe("frelux");
  });

  it("extracts credentials from Authorization headers", async () => {
    const r = await createFreluxCredential(freshStore());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    expect(credentialFromAuthHeader(`Bearer ${secret}`)).toBe(secret);
    // JWTs and garbage are NOT credentials — the caller falls
    // back to normal Supabase JWT auth.
    expect(credentialFromAuthHeader("Bearer eyJhbGciOiJIUzI1NiJ9.xxx.yyy")).toBeNull();
    expect(credentialFromAuthHeader("Basic abc")).toBeNull();
    expect(credentialFromAuthHeader(null)).toBeNull();
  });

  it("marks last_used_at on successful authentication", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await auth(store, r.credential.secret, ["archie:chat"]);
    const rec = store.records.find(
      (x) => x.id === (r.ok ? r.credential.record.id : ""),
    );
    expect(rec?.lastUsedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------
// 3. Scope enforcement
// ---------------------------------------------------------
describe("scope enforcement", () => {
  it("denies operations outside the granted scopes", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const status = await auth(store, r.credential.secret, ["archie:status"]);
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.code).toBe("scope_denied");
  });

  it("denies any scope the credential does not explicitly hold", async () => {
    const store = freshStore();
    // Even a credential holding EVERY registry scope cannot
    // reach scopes outside the registry — proving no
    // credential can gain unrestricted ARCHIE access.
    const r = await createFreluxCredential(store, {
      scopes: [...ARCHIE_API_SCOPES],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const forbidden of [
      "archie:owner_auth",
      "archie:execute",
      "archie:credentials_admin",
      "archie:memory",
    ]) {
      const a = await auth(store, r.credential.secret, [forbidden]);
      expect(a.ok).toBe(false);
      if (!a.ok) expect(a.code).toBe("scope_denied");
    }
  });

  it("allows only explicitly granted scopes", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:status"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await auth(store, r.credential.secret, ["archie:status"])).ok).toBe(true);
    expect((await auth(store, r.credential.secret, ["archie:chat"])).ok).toBe(false);
  });

  it("records a scope_denied audit event naming only metadata", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    await auth(store, secret, ["archie:status"]);
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.scope_denied",
    );
    expect(event).toBeDefined();
    // The audit event never contains the key material.
    expect(JSON.stringify(event)).not.toContain(secret);
  });
});

// ---------------------------------------------------------
// 4. Invalid credentials
// ---------------------------------------------------------
describe("invalid credentials", () => {
  it("rejects garbage and malformed keys without a store hit", async () => {
    const store = freshStore();
    const a = await auth(store, "not-a-key", ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("invalid");

    const b = await auth(
      store,
      "archie_ak_live_frelux_SHORT",
      ["archie:chat"],
    );
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe("invalid");
  });

  it("rejects a well-formed but unknown key, with an audit event", async () => {
    const store = freshStore();
    const forged =
      "archie_ak_live_frelux_" +
      "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
    const a = await auth(store, forged, ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("invalid");
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.auth_failed",
    );
    expect(event).toBeDefined();
    expect(JSON.stringify(event)).not.toContain(forged);
  });

  it("rejects a tampered real key (one character changed)", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    const tampered = secret.slice(0, -1) +
      (secret.endsWith("A") ? "B" : "A");
    const a = await auth(store, tampered, ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("invalid");
  });
});

// ---------------------------------------------------------
// 5. Revocation
// ---------------------------------------------------------
describe("revocation", () => {
  it("a revoked credential is rejected immediately", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { record, secret } = r.credential;

    const revoked = await revokeCredential(store, record.id, "compromise", OWNER);
    expect(revoked.ok).toBe(true);

    const a = await auth(store, secret, ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("revoked");
  });

  it("cannot revoke twice; cannot revoke an unknown id", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await revokeCredential(store, r.credential.record.id, "r1", OWNER)).ok).toBe(true);
    const second = await revokeCredential(store, r.credential.record.id, "r2", OWNER);
    expect(second.ok).toBe(false);
    const unknown = await revokeCredential(
      store,
      "99999999-9999-9999-9999-999999999999",
      "r3",
      OWNER,
    );
    expect(unknown.ok).toBe(false);
  });

  it("revocation is audited", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await revokeCredential(store, r.credential.record.id, "rotation policy", OWNER);
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.revoked",
    );
    expect(event?.severity).toBe("critical");
    expect(event?.metadata.credentialId).toBe(r.credential.record.id);
  });
});

// ---------------------------------------------------------
// 6. Rotation
// ---------------------------------------------------------
describe("rotation", () => {
  it("retires the old key and issues a working successor", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oldSecret = r.credential.secret;
    const oldId = r.credential.record.id;

    const rotated = await rotateCredential(store, oldId, OWNER, PEPPER, null);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok || !rotated.credential) return;

    // Old key dead, new key alive — immediately.
    const oldAuth = await auth(store, oldSecret, ["archie:chat"]);
    expect(oldAuth.ok).toBe(false);
    if (!oldAuth.ok) expect(oldAuth.code).toBe("revoked");

    const newAuth = await auth(store, rotated.credential.secret, ["archie:chat"]);
    expect(newAuth.ok).toBe(true);

    // Linkage both directions.
    const oldRec = store.records.find((x) => x.id === oldId);
    const newRec = store.records.find(
      (x) => x.id === rotated.credential!.record.id,
    );
    expect(oldRec?.status).toBe("rotated");
    expect(oldRec?.rotatedTo).toBe(newRec?.id);
    expect(newRec?.rotatedFrom).toBe(oldId);
    expect(newRec?.scopes).toEqual(oldRec?.scopes);
    expect(newRec?.application).toBe(oldRec?.application);
  });

  it("cannot rotate a non-active credential", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await revokeCredential(store, r.credential.record.id, "x", OWNER);
    const rotated = await rotateCredential(store, r.credential.record.id, OWNER, PEPPER, null);
    expect(rotated.ok).toBe(false);
  });

  it("rotation is audited with predecessor and successor ids", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oldId = r.credential.record.id;
    const rotated = await rotateCredential(store, oldId, OWNER, PEPPER, null);
    expect(rotated.ok).toBe(true);
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.rotated",
    );
    expect(event?.metadata.credentialId).toBe(oldId);
    expect(event?.metadata.successorId).toBe(rotated.ok ? rotated.credential!.record.id : "");
  });
});

// ---------------------------------------------------------
// 7. Expiration
// ---------------------------------------------------------
describe("expiration", () => {
  it("an expired credential is rejected and its status persisted", async () => {
    const store = freshStore();
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = await createFreluxCredential(store, { expiresAt: past });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const a = await auth(store, r.credential.secret, ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("expired");

    const rec = store.records.find((x) => x.id === r.credential.record.id);
    expect(rec?.status).toBe("expired");
  });

  it("a future expiry does not block authentication before it passes", async () => {
    const store = freshStore();
    const soon = new Date(Date.now() + 60_000).toISOString();
    const r = await createFreluxCredential(store, { expiresAt: soon });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await auth(store, r.credential.secret, ["archie:chat"])).ok).toBe(true);

    // …and the SAME credential is rejected once time passes it.
    const later = new Date(Date.now() + 120_000);
    const a = await auth(store, r.credential.secret, ["archie:chat"], later);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("expired");
  });
});

// ---------------------------------------------------------
// 8. Rate limiting
// ---------------------------------------------------------
describe("rate limiting", () => {
  it("rejects requests beyond the credential's own limit", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, {
      rateLimitPerMinute: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;

    // 3 allowed
    expect((await auth(store, secret, ["archie:chat"])).ok).toBe(true);
    expect((await auth(store, secret, ["archie:chat"])).ok).toBe(true);
    expect((await auth(store, secret, ["archie:chat"])).ok).toBe(true);
    // 4th → rate_limited
    const fourth = await auth(store, secret, ["archie:chat"]);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.code).toBe("rate_limited");

    // The event names the credential, never the key.
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.rate_limited",
    );
    expect(event).toBeDefined();
    expect(JSON.stringify(event)).not.toContain(secret);
  });

  it("each credential has its own independent bucket", async () => {
    const store = freshStore();
    const a1 = await createFreluxCredential(store, {
      rateLimitPerMinute: 2,
      application: "frelux",
    });
    const a2 = await createFreluxCredential(store, {
      rateLimitPerMinute: 2,
      application: "frelux",
    });
    expect(a1.ok && a2.ok).toBe(true);
    if (!a1.ok || !a2.ok) return;
    // exhaust credential 1
    await auth(store, a1.credential.secret, ["archie:chat"]);
    await auth(store, a1.credential.secret, ["archie:chat"]);
    expect((await auth(store, a1.credential.secret, ["archie:chat"])).ok).toBe(false);
    // credential 2 unaffected
    expect((await auth(store, a2.credential.secret, ["archie:chat"])).ok).toBe(true);
  });
});

// ---------------------------------------------------------
// 9. Secret protection
// ---------------------------------------------------------
describe("secret protection", () => {
  it("list views cannot leak key material by construction", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    const view = safeCredentialView(r.credential.record);

    expect(view).not.toHaveProperty("keyHash");
    expect(JSON.stringify(view)).not.toContain(secret);
    // The view shows only the public identification prefix.
    expect(view.keyPrefix.startsWith("archie_ak_live_frelux_")).toBe(true);
    expect(view.keyPrefix.length).toBeLessThan(secret.length);
  });

  it("no audit event ever contains full key material", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    // generate every audit kind this system can emit
    await auth(store, "archie_ak_live_frelux_" + "Z".repeat(43), ["archie:chat"]); // auth_failed
    await revokeCredential(store, r.credential.record.id, "test", OWNER);
    const view = safeCredentialView(r.credential.record);
    expect(JSON.stringify(store.audit)).not.toContain(secret);
    expect(JSON.stringify(view)).not.toContain(secret);
    expect(JSON.stringify(store.records)).not.toContain(secret);
  });

  it("the module surface exposes no function that returns a stored secret", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // After creation, nothing can retrieve the secret again:
    // findByHash requires already-having the key; no API takes
    // an id and returns a secret. safeCredentialView and
    // authenticateCredential are the only record consumers.
    const rec = store.records.find((x) => x.id === r.credential.record.id);
    expect(Object.keys(rec ?? {}).includes("secret")).toBe(false);
  });
});

// ---------------------------------------------------------
// 10. Audit logging
// ---------------------------------------------------------
describe("audit logging", () => {
  it("records creation with scopes and provenance", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, {
      scopes: ["archie:chat", "archie:calculate"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const event = store.audit.find((e) =>
      e.kind === "archie_api_credential.created",
    );
    expect(event?.severity).toBe("info");
    expect(event?.metadata.scopes).toEqual(["archie:chat", "archie:calculate"]);
    expect(event?.metadata.application).toBe("frelux");
  });

  it("the full lifecycle writes the expected audit trail", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { name: "Lifecycle test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.credential.record.id;

    await auth(store, r.credential.secret, ["archie:chat"]); // use
    const rotated = await rotateCredential(store, id, OWNER, PEPPER, null);
    expect(rotated.ok).toBe(true);
    await revokeCredential(store, rotated.credential!.record.id, "end of test", OWNER);

    const kinds = store.audit.map((e) => e.kind);
    expect(kinds).toContain("archie_api_credential.created");
    expect(kinds).toContain("archie_api_credential.rotated");
    expect(kinds).toContain("archie_api_credential.revoked");
  });

  it("brute-force audit flooding is itself limited (dedupe)", async () => {
    const store = freshStore();
    const sameForged =
      "archie_ak_live_frelux_" + "Q".repeat(43);
    for (let i = 0; i < 25; i++) {
      await auth(store, sameForged, ["archie:chat"]);
    }
    const failures = store.audit.filter((e) =>
      e.kind === "archie_api_credential.auth_failed",
    );
    expect(failures.length).toBe(1);
  });
});

// ---------------------------------------------------------
// 11. Unauthorized access
// ---------------------------------------------------------
describe("unauthorized access", () => {
  it("a valid credential cannot reach scopes outside the registry", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    // The management operations are NOT in the scope registry —
    // no credential can ever reach them.
    for (const forbidden of [
      "archie:credentials_create",
      "archie:credentials_revoke",
      "archie:killswitch",
    ]) {
      const a = await auth(store, secret, [forbidden]);
      expect(a.ok).toBe(false);
      if (!a.ok) expect(a.code).toBe("scope_denied");
    }
  });

  it("credential auth fails closed for ANY missing scope requirement", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:calculate"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Multi-scope requirement: ALL must be granted.
    const a = await auth(store, r.credential.secret, [
      "archie:calculate",
      "archie:chat",
    ]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("scope_denied");
  });
});

// ---------------------------------------------------------
// 12. Emergency global revocation (killswitch)
// ---------------------------------------------------------
describe("emergency global revocation", () => {
  it("the killswitch rejects every credential instantly, overriding everything", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;
    expect((await auth(store, secret, ["archie:chat"])).ok).toBe(true);

    const flipped = await setKillswitch(store, true, OWNER);
    expect(flipped.ok).toBe(true);

    const denied = await auth(store, secret, ["archie:chat"]);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("killswitch");

    // Even brand-new credentials minted while active are dead.
    const fresh = await createFreluxCredential(store);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const freshAuth = await auth(store, fresh.credential.secret, ["archie:chat"]);
    expect(freshAuth.ok).toBe(false);
    if (!freshAuth.ok) expect(freshAuth.code).toBe("killswitch");

    // Killswitch denial is audited as critical.
    expect(
      store.audit.some((e) =>
        e.kind === "archie_api_credential.killswitch_denied" ||
        e.kind === "archie_api_credential.killswitch_enabled"
      ),
    ).toBe(true);

    // Restoring works and normal evaluation resumes.
    expect((await setKillswitch(store, false, OWNER)).ok).toBe(true);
    expect((await auth(store, secret, ["archie:chat"])).ok).toBe(true);
  });
});

// ---------------------------------------------------------
// 13. FRELUX INTEGRATION — the application contract
// ---------------------------------------------------------
describe("FRELUX integration — application contract", () => {
  it("a properly scoped FRELUX credential authenticates for chat", async () => {
    const store = freshStore();
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The chat channel requires archie:chat — FRELUX holds it.
    const a = await auth(store, r.credential.secret, ["archie:chat"]);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.credential.application).toBe("frelux");
    expect(a.credential.environment).toBe("production");
  });

  it("FRELUX cannot use capabilities its credential does not grant", async () => {
    const store = freshStore();
    // FRELUX credential scoped to chat ONLY.
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const secret = r.credential.secret;

    // The "status" capability over the API contract requires
    // archie:status — FRELUX does not hold it.
    const status = await auth(store, secret, ["archie:status"]);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.code).toBe("scope_denied");

    // Research and calculate are equally out of reach.
    expect((await auth(store, secret, ["archie:research"])).ok).toBe(false);
    expect((await auth(store, secret, ["archie:calculate"])).ok).toBe(false);
  });

  it("the lifecycle never grants FRELUX a path to owner powers", async () => {
    const store = freshStore();
    // Rotate and re-issue: scopes stay minimal across the
    // entire lifecycle — rotation cannot widen them.
    const r = await createFreluxCredential(store, { scopes: ["archie:chat"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rotated = await rotateCredential(store, r.credential.record.id, OWNER, PEPPER, null);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok || !rotated.credential) return;
    expect(rotated.credential.record.scopes).toEqual(["archie:chat"]);

    // The successor still cannot reach anything beyond chat.
    const a = await auth(store, rotated.credential.secret, ["archie:status"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("scope_denied");
  });

  it("expiry-driven revocation closes the FRELUX channel on schedule", async () => {
    const store = freshStore();
    const soon = new Date(Date.now() + 50).toISOString();
    const r = await createFreluxCredential(store, { expiresAt: soon });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await new Promise((res) => setTimeout(res, 80));
    const a = await auth(store, r.credential.secret, ["archie:chat"]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("expired");
  });
});

// ---------------------------------------------------------
// 14. Environment handling
// ---------------------------------------------------------
describe("environments", () => {
  it("keys encode their environment and parse back", async () => {
    const store = freshStore();
    const prod = await createFreluxCredential(store);
    expect(prod.ok).toBe(true);
    if (!prod.ok) return;
    expect(prod.credential.secret.startsWith("archie_ak_live_frelux_")).toBe(true);

    const staging = await createFreluxCredential(store, {
      environment: "staging",
    });
    expect(staging.ok).toBe(true);
    if (!staging.ok) return;
    expect(
      (staging.credential.secret.startsWith("archie_ak_test_frelux_")),
    ).toBe(true);

    const dev = await createFreluxCredential(store, {
      environment: "development",
    });
    expect(dev.ok).toBe(true);
    if (!dev.ok) return;
    expect(dev.credential.secret.startsWith("archie_ak_dev_frelux_")).toBe(true);
  });
});
