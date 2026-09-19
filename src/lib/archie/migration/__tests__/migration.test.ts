// =========================================================
// FRELUX ARCHIE MIGRATION SYSTEM — TEST SUITE (spec §27)
//
// Export: package creation, integrity, secret stop, cancellation,
// backup vs migration mode.
// Import: valid package, corrupted package, tampered file,
// unknown component (authority smuggling), embedded secret.
// Restore: plan generation, allowlist enforcement, KEEP vs
// SNAPSHOT, non-destructive merge.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex, verifyFile } from "../checksums";
import { scanFilesForSecrets, secretsTemplate } from "../secrets";
import {
  buildMigrationPackage,
  unzipComponentFiles,
  ARCHIE_VERSION,
} from "../package-builder";
import {
  unzipPackage,
  verifyPackage,
  SUPPORTED_COMPATIBILITY_VERSION,
} from "../verify";
import {
  buildRestorePlan,
  executeRestore,
  RESTORE_TABLE_ALLOWLIST,
} from "../restore";
import type { PackageFile } from "../types";

// ---------------------------------------------------------
// In-memory supabase mock (learning-suite fidelity)
// ---------------------------------------------------------
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const upsertLog: Array<{ table: string; rows: Row[] }> = [];

function makeClient() {
  return {
    supabaseUrl: "https://hqhvlkunkdrxyuvziorm.supabase.co",
    from: (table: string) => {
      const rows = () => tables[table] ?? (tables[table] = []);
      const eqs: Array<[string, unknown]> = [];
      let orderField: string | null = null;
      let orderAsc = true;
      let limitN: number | null = null;
      let single = false;
      let countExact = false;
      const matching = () =>
        rows().filter((r) => eqs.every(([col, val]) => r[col] === val));
      const c: Record<string, unknown> = {};
      c.select = (
        _cols?: string,
        opts?: { count?: string; head?: boolean },
      ) => {
        countExact = opts?.count === "exact";
        const req = {
          eq: (col: string, val: unknown) => {
            eqs.push([col, val]);
            return req;
          },
          order: (f: string, o?: { ascending?: boolean }) => {
            orderField = f;
            orderAsc = o?.ascending ?? true;
            return req;
          },
          limit: (n: number) => {
            limitN = n;
            return req;
          },
          maybeSingle: () => {
            single = true;
            return Promise.resolve({ data: apply(), error: null });
          },
          single: () => {
            single = true;
            return Promise.resolve({ data: apply(), error: null });
          },
          range: (from: number, to: number) => {
            // range() in supabase-js is a paginated LIST fetch — the
            // in-memory mock returns the filtered array, never a single row.
            const list = apply() as Row[];
            return Promise.resolve({
              data: list.slice(from, to + 1),
              error: null,
            });
          },
          // supabase-js builders are thenable — support `await` directly
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: apply(), error: null }),
        };
        const apply = () => {
          let list = matching();
          if (orderField)
            list = [...list].sort(
              (a, b) =>
                (orderAsc ? 1 : -1) *
                String(a[orderField!]).localeCompare(String(b[orderField!])),
            );
          if (limitN != null) list = list.slice(0, limitN);
          return single ? (list[0] ?? null) : list;
        };
        if (countExact) {
          // count queries (head: true) — return count metadata
          return Promise.resolve({
            data: null,
            count: matching().length,
            error: null,
          });
        }
        return req;
      };
      c.insert = (payload: Row | Row[]) => {
        const items = Array.isArray(payload) ? payload : [payload];
        rows().push(...items.map((i) => ({ ...i })));
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: items[0] ?? null,
                error: null,
              }),
          }),
        };
      };
      c.upsert = (payload: Row[], opts?: { onConflict?: string }) => {
        upsertLog.push({ table, rows: payload });
        void opts;
        const key = opts?.onConflict ?? "id";
        for (const p of payload) {
          const existing = rows().find((r) => r[key] === p[key]);
          if (existing) Object.assign(existing, p);
          else rows().push({ ...p });
        }
        return Promise.resolve({ error: null });
      };
      return c;
    },
  };
}

// ---------------------------------------------------------
// checksums
// ---------------------------------------------------------
describe("checksums", () => {
  it("computes the standard SHA-256 vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("detects a modified file", async () => {
    const file: PackageFile = { path: "memory/x.json", content: "original" };
    const hash = await sha256Hex(file.content);
    const ok = await verifyFile(file, {
      path: file.path,
      algorithm: "sha256",
      hash,
      bytes: 8,
    });
    expect(ok.ok).toBe(true);
    const tampered = await verifyFile(
      { path: "memory/x.json", content: "modified" },
      { path: file.path, algorithm: "sha256", hash, bytes: 8 },
    );
    expect(tampered.ok).toBe(false);
    expect(tampered.reason).toMatch(/modified or corrupted/);
  });
});

// ---------------------------------------------------------
// secret boundary
// ---------------------------------------------------------
describe("secret scanning", () => {
  it("detects real secrets", () => {
    const hits = scanFilesForSecrets([
      {
        path: "config/x.env",
        content: "AI_PROVIDER_API_KEY=sk-proj-abc123def456ghi789xyz000",
      },
      {
        path: "db/k.json",
        content:
          "service key eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjzgJJmqW1aXgqFSG8ZUiUiUiUiUiUiUiUiUiU",
      },
      { path: "pem", content: "-----BEGIN RSA PRIVATE KEY-----" },
    ]);
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT flag the placeholder template", () => {
    const template = secretsTemplate();
    const hits = scanFilesForSecrets([template]);
    expect(hits).toHaveLength(0);
    expect(template.content).toContain("REQUIRED_AFTER_RESTORE");
    expect(template.content).not.toMatch(/sk-[a-z0-9]{20,}/);
  });

  it("flags password assignments but not prose", () => {
    const hits = scanFilesForSecrets([
      { path: "a.env", content: "db_password=hunter2secret" },
      { path: "b.md", content: "The password field is on the settings page." },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("a.env");
  });
});

// ---------------------------------------------------------
// full export → verify → restore round-trip
// ---------------------------------------------------------
describe("migration package lifecycle", () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(tables)) delete tables[k];
    upsertLog.length = 0;
    globalThis.localStorage?.clear();
    client = makeClient();

    // realistic seed data
    tables.archie_language_profiles = [
      {
        id: "p1",
        language: "Yoruba",
        confidence: 0.9,
        validation_state: "validated",
      },
    ];
    tables.archie_language_entries = [
      {
        id: "e1",
        profile_id: "p1",
        term: "ile",
        meaning: "house",
        confidence: 0.95,
      },
      {
        id: "e2",
        profile_id: "p1",
        term: "omi",
        meaning: "water",
        confidence: 0.9,
      },
    ];
    tables.archie_change_requests = [
      {
        id: "cr1",
        cr_number: "CR-001",
        title: "Improve estimator",
        status: "approved",
      },
    ];
    tables.frelux_archie_conversations = [
      { id: "c1", title: "estimator chat" },
    ];
    tables.site_settings = [{ ads_enabled: true, site_name: "FRELUX" }];
    tables.integration_settings = [
      {
        integration_key: "paystack",
        display_name: "Paystack",
        category: "payments",
        is_enabled: true,
      },
    ];
    tables.schema_migrations = [
      { version: "20260101000000" },
      { version: "20260910160000" },
    ];
    // fetch used for docker docs in MIGRATE mode
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () => `# real content from ${url}`,
      })),
    );
  });

  function buildOpts(mode: "BACKUP" | "MIGRATE") {
    return {
      supabase: client as never,
      mode,
      appVersion: "1.2.3",
      databaseProjectRef: "hqhvlkunkdrxyuvziorm",
      ownerAuthorizationId: "auth-rec-1",
      onProgress: () => {},
      isCancelled: () => false,
    };
  }

  it("exports a BACKUP package with real values and passing integrity", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const m = built.pkg.manifest;

    expect(m.packageType).toBe("BACKUP");
    expect(m.archieVersion).toBe(ARCHIE_VERSION);
    expect(m.freluxVersion).toBe("1.2.3");
    expect(m.secretsIncluded).toBe(false);
    expect(m.owner.authorizationId).toBe("auth-rec-1");
    expect(m.databaseSchemaVersion).toBe("20260910160000");
    expect(m.migrationCompatibilityVersion).toBe(
      SUPPORTED_COMPATIBILITY_VERSION,
    );
    // real components, really included
    expect(m.includedComponents).toContain("language-memory");
    expect(m.includedComponents).toContain("evolution");
    expect(m.includedComponents).toContain("memory");
    // BACKUP mode excludes code/docker/docs
    expect(m.includedComponents).not.toContain("docker");
    // the exported language rows are the real ones
    const entries = built.pkg.components
      .find((c) => c.id === "language-memory")!
      .files.find((f) => f.path.endsWith("entries.json"))!;
    const parsed = JSON.parse(entries.content);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].term).toBe("ile");
    // integrity self-verified via round-trip
    expect(unzipComponentFiles(built.zip).length).toBeGreaterThan(0);
  });

  it("exports a MIGRATION package including docker + documentation", async () => {
    const built = await buildMigrationPackage(buildOpts("MIGRATE"));
    const ids = built.pkg.manifest.includedComponents;
    expect(ids).toContain("docker");
    expect(ids).toContain("documentation");
    const docker = built.pkg.components.find((c) => c.id === "docker")!;
    expect(docker.files.some((f) => f.path === "docker/Dockerfile")).toBe(true);
  });

  it("verifyPackage accepts the freshly built package", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const result = await verifyPackage(built.zip);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest?.packageId).toBe(built.pkg.manifest.packageId);
  });

  it("verifyPackage REJECTS a tampered file", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    // tamper: flip a row inside language-memory inside the zip
    const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
    const raw = unzipSync(built.zip);
    const key = Object.keys(raw).find((k) => k.includes("entries.json"))!;
    const doc = JSON.parse(strFromU8(raw[key]));
    doc.rows[0].term = "TAMPERED";
    raw[key] = strToU8(JSON.stringify(doc));
    const tamperedZip = zipSync(raw);

    const result = await verifyPackage(tamperedZip);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Checksum mismatch.*entries\.json/);
  });

  it("verifyPackage REJECTS an added file (unexpected modification)", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const { unzipSync, zipSync, strToU8 } = await import("fflate");
    const raw = unzipSync(built.zip);
    raw["ARCHIE-MIGRATION/memory/smuggled.json"] = strToU8("{}");
    const result = await verifyPackage(zipSync(raw));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Unexpected file/);
  });

  it("verifyPackage REJECTS unknown components (authority smuggling)", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const { unzipSync, zipSync, strToU8 } = await import("fflate");
    const raw = unzipSync(built.zip);
    raw["ARCHIE-MIGRATION/authority-layer/owner.json"] = strToU8(
      '{"owner":"attacker"}',
    );
    const result = await verifyPackage(zipSync(raw));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(
      /unknown component "authority-layer"/,
    );
  });

  it("verifyPackage REJECTS garbage input with an owner-readable error", async () => {
    const result = await verifyPackage(new Uint8Array([1, 2, 3, 4]));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not a valid ARCHIE migration package/);
  });

  it("export STOPS when a secret leaks into collected data", async () => {
    // a secret pasted into a knowledge row — export must fail closed
    tables.frelux_knowledge_items = [
      {
        id: "k1",
        title: "notes",
        content: "SUPABASE_SERVICE_KEY=sbp_aBcDeFgHiJkLmNoPqRsTuVwX",
      },
    ];
    await expect(buildMigrationPackage(buildOpts("BACKUP"))).rejects.toThrow(
      /Secret content detected/,
    );
  });

  it("export can be cancelled", async () => {
    const opts = {
      ...buildOpts("BACKUP"),
      isCancelled: () => true,
    };
    await expect(buildMigrationPackage(opts)).rejects.toThrow(/[Cc]ancelled/);
  });

  it("restore plan: KEEP_EXISTING_MEMORY touches nothing", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const unzipped = unzipPackage(built.zip);
    const plan = buildRestorePlan({
      unzipped,
      memoryMode: "KEEP_EXISTING_MEMORY",
    });
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped.length).toBeGreaterThan(0);
  });

  it("restore plan + execute: SNAPSHOT merges only allowlisted tables", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const unzipped = unzipPackage(built.zip);
    const plan = buildRestorePlan({
      unzipped,
      memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
    });
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(
        RESTORE_TABLE_ALLOWLIST.some((e) => e.table === step.targetTable),
      ).toBe(true);
    }
    // authority and audit tables can never be restored
    const targets = plan.steps.map((s) => s.targetTable);
    expect(targets).not.toContain("archie_change_audit");
    expect(targets).not.toContain("frelux_owner_authorizations");
    expect(targets).not.toContain("profiles");

    const outcome = await executeRestore(
      {
        supabase: client as never,
        unzipped,
        verificationOk: true,
        memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
      },
      plan,
      () => {},
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.environmentRegistered).toBe(true);
    // language entries really merged
    expect(upsertLog.some((u) => u.table === "archie_language_entries")).toBe(
      true,
    );
    // restored environment registered as PENDING_OWNER_APPROVAL
    const installations = tables.archie_installations ?? [];
    expect(
      installations.some((i) => i.status === "PENDING_OWNER_APPROVAL"),
    ).toBe(true);
  });

  it("restore REFUSES an unverified package", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const unzipped = unzipPackage(built.zip);
    const plan = buildRestorePlan({
      unzipped,
      memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
    });
    await expect(
      executeRestore(
        {
          supabase: client as never,
          unzipped,
          verificationOk: false,
          memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
        },
        plan,
        () => {},
      ),
    ).rejects.toThrow(/did not pass verification/);
    expect(upsertLog).toHaveLength(0);
  });

  it("restore NEVER writes outside the allowlist even with a forged plan", async () => {
    const built = await buildMigrationPackage(buildOpts("BACKUP"));
    const unzipped = unzipPackage(built.zip);
    const forged = buildRestorePlan({
      unzipped,
      memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
    });
    forged.steps.push({
      component: "memory",
      targetTable: "frelux_owner_authorizations", // authority table — must be refused
      mode: "upsert-merge",
      rowCount: 1,
      description: "forged",
    });
    const outcome = await executeRestore(
      {
        supabase: client as never,
        unzipped,
        verificationOk: true,
        memoryMode: "RESTORE_PORTABLE_SNAPSHOT",
      },
      forged,
      () => {},
    );
    expect(outcome.ok).toBe(false);
    expect(
      upsertLog.some((u) => u.table === "frelux_owner_authorizations"),
    ).toBe(false);
    // allowlisted tables still restored before the stop
    expect(outcome.failedTables[0].error).toMatch(/allowlist/);
  });

  it("keeps logical identity stable across exports and registers new environments per browser", async () => {
    await buildMigrationPackage(buildOpts("BACKUP"));
    const first = (tables.archie_installations ?? []).map((i) => i.logical_id);
    await buildMigrationPackage(buildOpts("BACKUP"));
    const second = (tables.archie_installations ?? []).map((i) => i.logical_id);
    // same logical id, same browser → same environment row
    expect(new Set(first).size).toBe(1);
    expect(new Set([...first, ...second]).size).toBe(1);
    expect((tables.archie_installations ?? []).length).toBe(1);
  });
});
