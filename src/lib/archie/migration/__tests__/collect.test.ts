// =========================================================
// ARCHIE MIGRATION — STATE COLLECTORS (spec §4, §17)
//
// The contract under test:
//   * collectAll reads REAL tables; a table that cannot be
//     read is recorded as EXCLUDED / UNAVAILABLE with the
//     reason — never faked as empty success.
//   * Configuration exports ONLY non-secret keys (spec §5);
//     integration values are redacted to the template note.
//   * The database component is a schema version + connection
//     TEMPLATE, never a database dump (spec §17).
//   * Cancellation is honored between pages.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAll, readTable } from "../collect";
import type { CollectorContext } from "../collect";

type Row = Record<string, unknown>;

// ---------------------------------------------------------
// Chainable supabase mock covering every query shape the
// collectors use: range, limit+maybeSingle, order.
// ---------------------------------------------------------
function makeClient(
  tables: Record<string, Row[]>,
  failTables = new Set<string>(),
) {
  const client = {
    from: (table: string) => {
      const rows = () => tables[table] ?? [];
      const fail = () => failTables.has(table);
      const builder: Record<string, unknown> = {};
      const finishRange = (offset: number, end: number) => {
        if (fail()) {
          return Promise.resolve({
            data: null,
            error: { message: `mock failure reading ${table}` },
          });
        }
        const slice = rows().slice(offset, end + 1);
        return Promise.resolve({ data: slice, error: null });
      };
      builder.select = () => {
        const req: Record<string, unknown> = {
          range: (a: number, b: number) => finishRange(a, b),
          limit: () => req,
          maybeSingle: () =>
            fail()
              ? Promise.resolve({
                  data: null,
                  error: { message: `mock failure reading ${table}` },
                })
              : Promise.resolve({ data: rows()[0] ?? null, error: null }),
          order: () =>
            fail()
              ? Promise.resolve({
                  data: null,
                  error: { message: `mock failure reading ${table}` },
                })
              : Promise.resolve({ data: rows(), error: null }),
        };
        return req;
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

function ctx(
  client: SupabaseClient,
  over: Partial<CollectorContext> = {},
): CollectorContext {
  return {
    supabase: client,
    appVersion: "1.0.0-test",
    archieVersion: "4.2.0-test",
    databaseProjectRef: "proj-ref-123",
    mode: "BACKUP",
    onProgress: vi.fn(),
    isCancelled: () => false,
    ...over,
  };
}

describe("readTable", () => {
  it("reads ALL rows across pagination boundaries", async () => {
    const big: Row[] = Array.from({ length: 1001 }, (_, i) => ({ i }));
    const client = makeClient({ big_table: big });
    const rows = await readTable(ctx(client), "big_table", "Big", 0, 1);
    expect(rows.length).toBe(1001);
    expect(rows[1000]).toEqual({ i: 1000 });
  });

  it("throws an honest error when the table cannot be read", async () => {
    const client = makeClient({ x: [] }, new Set(["x"]));
    await expect(readTable(ctx(client), "x", "X", 0, 1)).rejects.toThrow(
      /mock failure reading x/,
    );
  });

  it("honours owner cancellation between pages", async () => {
    const client = makeClient({
      big: Array.from({ length: 1001 }, () => ({})),
    });
    const c = ctx(client, { isCancelled: () => true });
    await expect(readTable(c, "big", "Big", 0, 1)).rejects.toThrow(
      /cancelled by owner/i,
    );
  });
});

describe("collectAll", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function happyTables(): Record<string, Row[]> {
    return {
      frelux_archie_conversations: [{ id: "c1", title: "t" }],
      frelux_archie_messages: [{ id: "m1" }],
      frelux_knowledge_items: [{ id: "k1" }],
      frelux_archie_knowledge_history: [],
      frelux_archie_knowledge_links: [],
      archie_language_profiles: [{ id: "lp1" }],
      archie_language_entries: [{ id: "le1" }],
      archie_language_evidence: [],
      frelux_archie_terminology: [{ id: "t1" }],
      frelux_archie_languages: [{ id: "l1" }],
      archie_change_requests: [{ id: "cr1" }],
      archie_change_audit: [{ id: "a1" }],
      archie_evolution_memory: [],
      archie_evolution_settings: [{ id: "s1" }],
      site_settings: [
        {
          site_name: "FRELUX",
          seo_title: "FRELUX Tools",
          adsense_publisher_id: "pub-SECRETISH",
          contact_email: "team@frelux.test",
          hero_headline: "Build with certainty",
        },
      ],
      integration_settings: [
        {
          integration_key: "openai",
          display_name: "OpenAI",
          category: "ai",
          is_enabled: true,
          config: { api_key: "sk-DO-NOT-PACKAGE-ME" },
        },
      ],
      schema_migrations: [
        { version: "20260101000000" },
        { version: "20260908000000" },
        { version: "20260910170000" },
      ],
    };
  }

  it("collects every component from readable tables and counts rows", async () => {
    const result = await collectAll(ctx(makeClient(happyTables())));
    const ids = result.components.map((c) => c.id);
    for (const expected of [
      "memory",
      "language-memory",
      "evolution",
      "application",
      "configuration",
      "database",
    ]) {
      expect(ids).toContain(expected);
    }
    expect(result.excluded.length).toBe(0);
    expect(result.tableCounts.frelux_archie_conversations).toBe(1);
    expect(result.tableCounts.frelux_knowledge_items).toBe(1);

    const memory = result.components.find((c) => c.id === "memory")!;
    const conv = memory.files.find(
      (f) => f.path === "memory/conversations.json",
    )!;
    const parsed = JSON.parse(conv.content) as {
      table: string;
      rowCount: number;
      rows: Row[];
    };
    expect(parsed.table).toBe("frelux_archie_conversations");
    expect(parsed.rowCount).toBe(1);
  });

  it("exports ONLY non-secret configuration and REDACTS integration values (spec §5)", async () => {
    const result = await collectAll(ctx(makeClient(happyTables())));
    const config = result.components.find((c) => c.id === "configuration")!;
    const settingsFile = config.files.find(
      (f) => f.path === "configuration/settings.json",
    )!;
    const parsed = JSON.parse(settingsFile.content) as {
      settings: Record<string, unknown>;
      integration_templates: Array<Record<string, unknown>>;
    };
    expect(parsed.settings.site_name).toBe("FRELUX");
    expect(parsed.settings.contact_email).toBe("team@frelux.test");
    // The non-exportable secret-bearing key is absent entirely.
    expect(parsed.settings).not.toHaveProperty("adsense_publisher_id");
    // Integration rows keep names/enabled state, but the config
    // value is the redaction note — never the real key.
    expect(parsed.integration_templates.length).toBe(1);
    expect(parsed.integration_templates[0].integration_key).toBe("openai");
    expect(String(parsed.integration_templates[0].config)).toMatch(
      /REQUIRED_AFTER_RESTORE/,
    );
    // The secrets template file is included and mentions
    // REQUIRED_AFTER_RESTORE placeholders, not real values.
    const template = config.files.find(
      (f) => f.path === "configuration/secrets-template.env",
    )!;
    expect(template.content).toMatch(/REQUIRED_AFTER_RESTORE/);
    expect(template.content).not.toMatch(/sk-/);
  });

  it("records the schema version and a connection TEMPLATE, never a dump (spec §17)", async () => {
    const result = await collectAll(ctx(makeClient(happyTables())));
    const db = result.components.find((c) => c.id === "database")!;
    const schema = JSON.parse(db.files[0].content) as {
      schema_version: string;
      applied_migrations: string[];
      connection_template: Record<string, string>;
      note: string;
    };
    expect(schema.schema_version).toBe("20260910170000");
    expect(schema.applied_migrations.length).toBe(3);
    expect(schema.connection_template.SUPABASE_URL).toBe(
      "REQUIRED_AFTER_RESTORE",
    );
    expect(schema.note).toMatch(/never duplicated or destroyed/i);
  });

  it("excludes a component HONESTLY when every one of its tables fails", async () => {
    const tables = happyTables();
    const client = makeClient(
      tables,
      new Set([
        "frelux_archie_conversations",
        "frelux_archie_messages",
        "frelux_knowledge_items",
        "frelux_archie_knowledge_history",
        "frelux_archie_knowledge_links",
      ]),
    );
    const result = await collectAll(ctx(client));
    expect(result.components.map((c) => c.id)).not.toContain("memory");
    const excluded = result.excluded.find((e) => e.id === "memory");
    expect(excluded).toBeDefined();
    expect(excluded!.reason).toMatch(
      /UNAVAILABLE: frelux_archie_conversations/,
    );
    expect(result.tableCounts.frelux_archie_conversations).toBe(-1); // failed marker
  });

  it("keeps a partially-readable component with UNAVAILABLE summaries", async () => {
    const client = makeClient(
      happyTables(),
      new Set(["frelux_knowledge_items"]),
    );
    const result = await collectAll(ctx(client));
    const memory = result.components.find((c) => c.id === "memory")!;
    expect(memory.summary).toMatch(/UNAVAILABLE: frelux_knowledge_items/);
    // The readable sibling tables are still packaged.
    expect(memory.summary).toMatch(/1 rows from frelux_archie_conversations/);
  });

  it("excludes configuration honestly when site_settings cannot be read", async () => {
    const client = makeClient(happyTables(), new Set(["site_settings"]));
    const result = await collectAll(ctx(client));
    expect(result.components.map((c) => c.id)).not.toContain("configuration");
    expect(result.excluded.find((e) => e.id === "configuration")).toBeDefined();
  });

  it("BACKUP mode never fetches docker/docs; MIGRATE mode without connectivity excludes them honestly", async () => {
    const backup = await collectAll(ctx(makeClient(happyTables())));
    expect(backup.components.map((c) => c.id)).not.toContain("docker");
    expect(backup.components.map((c) => c.id)).not.toContain("documentation");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const migrate = await collectAll(
      ctx(makeClient(happyTables()), { mode: "MIGRATE" }),
    );
    const excludedIds = migrate.excluded.map((e) => e.id);
    // Docker definitions honestly require connectivity...
    expect(excludedIds).toContain("docker");
    expect(migrate.excluded.find((e) => e.id === "docker")!.reason).toMatch(
      /connectivity/i,
    );
    // ...while the restore documentation (requirements + guide)
    // builds locally and is still packaged.
    expect(migrate.components.map((c) => c.id)).toContain("documentation");
    const docs = migrate.components.find((c) => c.id === "documentation")!;
    expect(docs.files.map((f) => f.path)).toContain(
      "documentation/RESTORE_GUIDE.md",
    );
  });
});
