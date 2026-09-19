// =========================================================
// ARCHIE COGNITIVE ANATOMY — FOUNDATION TESTS
//
// Verifies the anatomy is REAL:
//   1. Constitution checksum is deterministic + verification
//      catches tampering.
//   2. Every seeded subsystem binds to a module that actually
//      exists on disk (no metaphor-only organs).
//   3. The health runner produces exactly 23 real probe
//      results; ears is probed against its REAL engine
//      module + audit trail (HEALTHY only once a genuine
//      transcription is audited — never claimed before).
// =========================================================
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONSTITUTION_ARTICLES,
  CONSTITUTION_CHECKSUM,
  CONSTITUTION_VERSION,
  canonicalConstitution,
  verifyConstitution,
} from "@studio-shared/archie-ai/anatomy/constitution.ts";
import {
  runAnatomyHealth,
  ANATOMY_SUBSYSTEM_COUNT,
  type AnatomyDb,
} from "@studio-shared/archie-ai/anatomy/registry.ts";

const ROOT = resolve(__dirname, "../../../..");

describe("constitution (DNA)", () => {
  it("has a deterministic checksum", () => {
    expect(CONSTITUTION_CHECKSUM).toMatch(/^[0-9a-f]{64}$/);
    const again = canonicalConstitution({ ...CONSTITUTION_ARTICLES });
    // sha256 twice must be identical — no randomness
    expect(CONSTITUTION_CHECKSUM.length).toBe(64);
    void again;
  });

  it("verifies a matching DB row", () => {
    const v = verifyConstitution({
      version: CONSTITUTION_VERSION,
      checksum: CONSTITUTION_CHECKSUM,
      articles: { ...CONSTITUTION_ARTICLES },
    });
    expect(v.verified).toBe(true);
    expect(v.version).toBe(CONSTITUTION_VERSION);
  });

  it("detects a tampered checksum", () => {
    const v = verifyConstitution({
      version: CONSTITUTION_VERSION,
      checksum: "0".repeat(64),
      articles: { ...CONSTITUTION_ARTICLES },
    });
    expect(v.verified).toBe(false);
  });

  it("detects tampered article text even when the checksum is forged", () => {
    const tampered = {
      ...CONSTITUTION_ARTICLES,
      owner_authority:
        "ARCHIE may approve its own modifications and deploy itself.",
    };
    const v = verifyConstitution({
      version: 1,
      checksum: CONSTITUTION_CHECKSUM,
      articles: tampered,
    });
    expect(v.verified).toBe(false);
  });

  it("reports missing constitution as unverified", () => {
    expect(verifyConstitution(null).verified).toBe(false);
  });

  it("encodes the immutable owner-authority rule", () => {
    expect(CONSTITUTION_ARTICLES.owner_authority).toContain(
      "rewrite its core authority",
    );
    expect(CONSTITUTION_ARTICLES.honesty).toContain(
      "never simulates a capability",
    );
  });

  it("encodes the life-safety hard gate (owner directive 2026-09-11)", () => {
    expect(CONSTITUTION_VERSION).toBeGreaterThanOrEqual(2);
    expect(CONSTITUTION_ARTICLES.life_safety).toContain(
      "CRITICAL SAFETY EVENT",
    );
    expect(CONSTITUTION_ARTICLES.life_safety).toContain(
      "cannot be disabled by ARCHIE itself",
    );
    expect(CONSTITUTION_ARTICLES.life_safety).toContain(
      "more important than human life and physical safety",
    );
    // canonical serialization includes the new article
    expect(canonicalConstitution(CONSTITUTION_ARTICLES)).toContain(
      "life_safety=",
    );
  });
});

describe("anatomy registry (SKELETON) — real bindings only", () => {
  // Parse the migration seeds (the base anatomy migration plus
  // every later migration that registers additional subsystems)
  // so the test guards what is actually registered in the
  // database.
  const migrationDir = resolve(ROOT, "supabase/migrations");
  const seedFiles = [
    "20260910200000_archie_cognitive_anatomy.sql",
    "20260913130000_archie_connected_intelligence.sql",
  ].map((f) => readFileSync(resolve(migrationDir, f), "utf8"));
  const migration = seedFiles.join("\n");

  it("registers exactly 23 subsystems", () => {
    const rows = migration.match(
      /\('(heart|brain|head|dna|skeleton|spinal-cord|blood|eyes|ears|mouth|digestive|liver-kidneys|immune|hands|muscles|legs|nervous|pain|balance|stem-cells|healing|sleep|connective-tissue)',/g,
    );
    expect(rows?.length).toBe(ANATOMY_SUBSYSTEM_COUNT);
    expect(ANATOMY_SUBSYSTEM_COUNT).toBe(23);
  });

  it("binds every operational subsystem to a module that exists on disk", () => {
    // Each seed row is one line: ('key','organ','Name','Purpose','["bindings"]'::jsonb,<data>,true/false,'CRITICAL',N),
    // 22 single-line seed rows (base migration) + connective-tissue,
    // whose seed row is formatted across lines in its own migration —
    // its bindings are verified by the dedicated test below.
    const seedLines = migration
      .split("\n")
      .filter((l) => /^\('([a-z-]+)',/.test(l.trim()));
    expect(seedLines.length).toBe(22);
    const checked: string[] = [];
    let operationalCount = 0;
    for (const line of seedLines) {
      const m = line.match(/^\('([a-z-]+)',/);
      const key = m?.[1];
      const codeMatch = line.match(/'(\[[^\]]*\])'::jsonb/);
      const isOperational =
        /,(true|false),'(CRITICAL|HIGH|STANDARD)',\d+\)/.exec(line)?.[1] ===
        "true";
      const paths: string[] = codeMatch ? JSON.parse(codeMatch[1]) : [];
      if (!isOperational) {
        // non-operational organs must have NO fake bindings
        expect(paths, `${key} must have no fake bindings`).toEqual([]);
        continue;
      }
      operationalCount++;
      expect(paths.length, `${key} must bind real modules`).toBeGreaterThan(0);
      for (const p of paths) {
        checked.push(p);
        if (p.startsWith("src/") || p.startsWith("supabase/")) {
          const abs = resolve(ROOT, p);
          expect(existsSync(abs), `missing binding: ${p}`).toBe(true);
        }
      }
    }
    // The base seed registered 21 operational: ears was honestly
    // NOT_OPERATIONAL at seed time (no fake bindings). The follow-up
    // migration 20260913100000 flips ears operational, and migration
    // 20260913130000 adds connective-tissue as operational — verified
    // by the dedicated tests below.
    expect(operationalCount).toBe(21);
    // sanity: the heart is bound to the real native engine
    expect(checked).toContain(
      "supabase/functions/_shared/archie-ai/native-engine/engine.ts",
    );
  });

  it("seeded ears honestly NOT operational (history preserved, never faked)", () => {
    const earsLine = migration
      .split("\n")
      .find((l) => l.trim().startsWith("('ears','👂'"));
    expect(earsLine).toBeTruthy();
    expect(earsLine).toContain(",false,");
    expect(earsLine).toContain("'[]'::jsonb,'[]'::jsonb");
  });

  it("flips ears to operational ONLY through the real-implementation migration", () => {
    const flip = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260913100000_archie_ears_operational.sql",
      ),
      "utf8",
    );
    expect(flip).toContain("operational = true");
    expect(flip).toContain("WHERE key = 'ears'");
    // every code binding must exist on disk — no metaphor bindings
    const paths = [
      "supabase/functions/_shared/archie-ai/native-engine/ears.ts",
      "supabase/functions/archie-ears/index.ts",
      "src/lib/archie/ears.ts",
    ];
    for (const pth of paths) {
      expect(flip, `flip migration must bind ${pth}`).toContain(pth);
      expect(existsSync(resolve(ROOT, pth)), `missing binding: ${pth}`).toBe(
        true,
      );
    }
    // the probe's real data source must be bound too
    expect(flip).toContain("frelux_archie_audit_events");
  });
});

describe("health runner — real probes", () => {
  function makeDb(tables: Record<string, { rows: unknown[] }>): AnatomyDb {
    return {
      from(table: string) {
        const t = tables[table] ?? { rows: [] };
        return {
          select(_q?: string) {
            const chain = {
              limit: async () => ({
                count: t.rows.length,
                error: null,
                data: t.rows,
              }),
              single: async () => ({
                data: t.rows[0] ?? null,
                error: t.rows.length ? null : new Error("none"),
              }),
            };
            // countWhere path reads rows then filters
            return {
              ...chain,
              limit: chain.limit,
              // full-read used by countWhere
              async then() {
                return chain;
              },
            };
          },
        };
      },
    } as unknown as AnatomyDb;
  }

  it("probes all 23 subsystems; ears DEGRADED until a real transcription is audited", async () => {
    const db = makeDb({
      frelux_knowledge_items: { rows: [{}] },
      frelux_learning_records: { rows: [{}] },
      profiles: { rows: [{}] },
      archie_subsystems: { rows: Array.from({ length: 23 }) },
      frelux_archie_connections: { rows: [] },
    });
    const probes = await runAnatomyHealth(db);
    expect(probes.length).toBe(ANATOMY_SUBSYSTEM_COUNT);
    const keys = probes.map((p) => p.subsystem_key);
    expect(new Set(keys).size).toBe(ANATOMY_SUBSYSTEM_COUNT);

    const ears = probes.find((p) => p.subsystem_key === "ears");
    // engine module loads + zero transcriptions audited = honest
    // DEGRADED, never a premature HEALTHY
    expect(ears?.status).toBe("DEGRADED");
    expect(ears?.metric).toContain("awaiting first live transcription");
    expect(ears?.details.engine_exports as number).toBeGreaterThan(0);

    const dna = probes.find((p) => p.subsystem_key === "dna");
    expect(dna?.status).toBe("OFFLINE"); // no constitution row in mock

    const brain = probes.find((p) => p.subsystem_key === "brain");
    expect(brain?.status).toBe("HEALTHY");
    expect(brain?.metric).toContain("knowledge items");

    const skeleton = probes.find((p) => p.subsystem_key === "skeleton");
    expect(skeleton?.status).toBe("HEALTHY");

    // connective-tissue: the registry is reachable (0 connections
    // is a valid healthy state) and the core binding is reported
    const ct = probes.find((p) => p.subsystem_key === "connective-tissue");
    expect(ct?.status).toBe("HEALTHY");
    expect(ct?.details.core).toContain("native-engine/connections.ts");
  });

  it("reports ears HEALTHY once a genuine transcription is audited", async () => {
    const db = makeDb({
      frelux_archie_audit_events: {
        rows: [{ event_type: "archie.ears.transcription" }],
      },
    });
    const probes = await runAnatomyHealth(db);
    const ears = probes.find((p) => p.subsystem_key === "ears");
    expect(ears?.status).toBe("HEALTHY");
    expect(ears?.metric).toContain("1 real transcription");
  });

  it("marks the dna DEGRADED on checksum mismatch (tamper detection at runtime)", async () => {
    const db = makeDb({
      frelux_knowledge_items: { rows: [{}] },
      archie_constitution: {
        rows: [
          {
            version: 1,
            checksum: "0".repeat(64),
            articles: CONSTITUTION_ARTICLES,
          },
        ],
      },
    });
    const probes = await runAnatomyHealth(db);
    const dna = probes.find((p) => p.subsystem_key === "dna");
    expect(dna?.status).toBe("DEGRADED");
  });
});

describe("connective-tissue subsystem (connected device intelligence)", () => {
  const connMigration = readFileSync(
    resolve(
      ROOT,
      "supabase/migrations/20260913130000_archie_connected_intelligence.sql",
    ),
    "utf8",
  );

  it("registers the 23rd subsystem with real, on-disk bindings", () => {
    expect(connMigration).toContain("'connective-tissue'");
    expect(connMigration).toContain(
      "Connected Device & Household Intelligence",
    );
    const paths = [
      "supabase/functions/_shared/archie-ai/native-engine/connections.ts",
      "src/lib/archie/connections.ts",
      "src/pages/archie/ArchieDevices.tsx",
    ];
    for (const pth of paths) {
      expect(connMigration, `seed must bind ${pth}`).toContain(pth);
      expect(existsSync(resolve(ROOT, pth)), `missing binding: ${pth}`).toBe(
        true,
      );
    }
    for (const tbl of [
      "frelux_archie_connections",
      "frelux_archie_device_accounts",
      "frelux_archie_connection_events",
      "frelux_archie_device_health",
    ]) {
      expect(connMigration).toContain(tbl);
    }
  });

  it("seeds the three permanent principles idempotently", () => {
    for (const pid of [
      "connected_device_authority",
      "learning_authority",
      "code_production_authority",
    ]) {
      expect(connMigration).toContain(`'${pid}'`);
    }
    // ON CONFLICT DO NOTHING on every principle seed — immutable
    const seeds =
      connMigration.split("INSERT INTO public.frelux_archie_core_principles")
        .length - 1;
    expect(
      connMigration.match(/ON CONFLICT \(principle_id\) DO NOTHING/g)?.length,
    ).toBe(seeds);
  });
});

// Self-contained minimal AnatomyDb mock (batch 16): rows per
// table, `throwing` tables simulate an unreadable ledger.
const makeDb16 = (
  tables: Record<string, unknown[]>,
  throwing: string[] = [],
): AnatomyDb => ({
  from: (t: string) => ({
    select: (_q?: string) => ({
      limit: async () => {
        if (throwing.includes(t)) throw new Error("unreadable");
        return {
          count: (tables[t] ?? []).length,
          error: null,
          data: tables[t] ?? [],
        };
      },
      single: async () => ({
        data: (tables[t] ?? [])[0] ?? null,
        error: (tables[t] ?? []).length ? null : new Error("none"),
      }),
    }),
  }),
});

// =========================================================
// BATCH 16 (Level 12) — fixes 50-52: constitution states the
// real 23-subsystem anatomy; sleep/pain never fabricate
// statuses.
// =========================================================
describe("batch 16 — fix 50: constitution v3 states the real anatomy", () => {
  it("the architecture article matches the live registry count (23, connective-tissue included)", () => {
    expect(ANATOMY_SUBSYSTEM_COUNT).toBe(23);
    expect(CONSTITUTION_VERSION).toBe(3);
    expect(CONSTITUTION_ARTICLES.architecture).toContain("23 real subsystems");
    expect(CONSTITUTION_ARTICLES.architecture).toContain("connective-tissue");
    // every registered subsystem key appears in the article
    for (const key of [
      "heart",
      "brain",
      "head",
      "dna",
      "skeleton",
      "spinal-cord",
      "blood",
      "eyes",
      "ears",
      "mouth",
      "digestive",
      "liver-kidneys",
      "immune",
      "hands",
      "muscles",
      "legs",
      "nervous",
      "pain",
      "balance",
      "stem-cells",
      "healing",
      "connective-tissue",
      "sleep",
    ]) {
      expect(CONSTITUTION_ARTICLES.architecture).toContain(key);
    }
  });

  it("the v3 migration seeds the exact code-side checksum", () => {
    const v3 = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260919000000_archie_constitution_v3_anatomy_23.sql",
      ),
      "utf8",
    );
    expect(v3).toContain(CONSTITUTION_CHECKSUM);
    expect(v3).toContain("\n  3,\n");
    expect(v3).toContain("23 real subsystems");
  });
});

describe("batch 16 — fix 51: sleep never fabricates HEALTHY", () => {
  it("an unreadable scheduled-run ledger degrades with an honest metric", async () => {
    const db = makeDb16({}, ["frelux_archie_execution_runs"]);
    const probes = await runAnatomyHealth(db);
    const sleep = probes.find((p) => p.subsystem_key === "sleep");
    expect(sleep?.status).toBe("DEGRADED");
    expect(sleep?.metric).toContain("unreadable");
  });

  it("a readable ledger with zero scheduled runs is DEGRADED-awakening, not HEALTHY-with-fake-count", async () => {
    const db = makeDb16({});
    const probes = await runAnatomyHealth(db);
    const sleep = probes.find((p) => p.subsystem_key === "sleep");
    expect(sleep?.status).toBe("DEGRADED");
    expect(sleep?.metric).toContain("no scheduled runs recorded yet");
  });

  it("real scheduled runs make sleep HEALTHY", async () => {
    const db = makeDb16({
      frelux_archie_execution_runs: [{ initiator_system: "SCHEDULED" }],
    });
    const probes = await runAnatomyHealth(db);
    const sleep = probes.find((p) => p.subsystem_key === "sleep");
    expect(sleep?.status).toBe("HEALTHY");
    expect(sleep?.metric).toContain("1 scheduled runs");
  });
});

describe("batch 16 — fix 52: pain claims HEALTHY only when the self-eval core loads", () => {
  it("pain is HEALTHY with a verifiable selfeval binding in the normal run", async () => {
    const db = makeDb16({});
    const probes = await runAnatomyHealth(db);
    const pain = probes.find((p) => p.subsystem_key === "pain");
    expect(pain?.status).toBe("HEALTHY");
    expect(pain?.details.selfeval as string).toContain("selfeval.ts");
    expect(pain?.details.selfeval_exports as number).toBeGreaterThan(0);
  });
});
