// =========================================================
// FRELUX ARCHIE MIGRATION — STATE COLLECTORS (spec §4, §17)
//
// Collects ARCHIE's portable state from the live Supabase
// database. Everything here is a REAL read of REAL tables:
//   * memory           — ARCHIE chat memory + knowledge items
//   * language-memory  — validated language knowledge
//   * evolution        — change requests, audit, lessons
//   * configuration    — non-secret settings + secret template
//   * database         — schema version + connection TEMPLATE
//                         (never a database dump — spec §17)
//   * docker/docs      — real repo container definitions, only
//                        in MIGRATE mode, only with connectivity
//
// Failures are honest: a table that cannot be read is recorded
// as an EXCLUDED component with the reason. No fake files.
// =========================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackageComponent, PackageFile } from "./types";
import { EXPORTABLE_CONFIG_KEYS, secretsTemplate } from "./secrets";

const BATCH = 1000;

export interface CollectorContext {
  supabase: SupabaseClient;
  appVersion: string;
  archieVersion: string;
  databaseProjectRef: string;
  mode: "BACKUP" | "MIGRATE";
  onProgress: (detail: string, fraction: number | null) => void;
  isCancelled: () => boolean;
}

export interface CollectedComponents {
  components: PackageComponent[];
  excluded: Array<{ id: PackageComponent["id"]; reason: string }>;
  tableCounts: Record<string, number>;
}

class CancelledError extends Error {
  constructor() {
    super("Migration cancelled by owner.");
  }
}

/** Paginated, cancellation-aware table read. Returns ALL rows RLS allows. */
export async function readTable(
  ctx: CollectorContext,
  table: string,
  label: string,
  tableIndex: number,
  tableTotal: number,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    if (ctx.isCancelled()) throw new CancelledError();
    const { data, error } = await ctx.supabase
      .from(table)
      .select("*")
      .range(offset, offset + BATCH - 1);
    if (error) throw new Error(`Table ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as Array<Record<string, unknown>>));
    ctx.onProgress(
      `Collecting ${label}: ${rows.length} rows`,
      (tableIndex +
        Math.min(offset + data.length, 1) / (offset + data.length)) /
        tableTotal,
    );
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return rows;
}

async function collectTables(
  ctx: CollectorContext,
  id: PackageComponent["id"],
  tables: Array<{ table: string; label: string; file: string }>,
  counts: Record<string, number>,
  excluded: CollectedComponents["excluded"],
): Promise<PackageComponent[]> {
  const components: PackageComponent[] = [];
  const files: PackageFile[] = [];
  const summaries: string[] = [];
  let anyOk = false;

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    try {
      const rows = await readTable(ctx, t.table, t.label, i, tables.length);
      counts[t.table] = rows.length;
      files.push({
        path: `${id}/${t.file}`,
        content: JSON.stringify(
          { table: t.table, rowCount: rows.length, rows },
          null,
          2,
        ),
      });
      summaries.push(`${rows.length} rows from ${t.table}`);
      anyOk = true;
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      counts[t.table] = -1;
      summaries.push(`UNAVAILABLE: ${t.table} (${(err as Error).message})`);
      files.push({
        path: `${id}/${t.file}`,
        content: JSON.stringify(
          {
            table: t.table,
            rowCount: 0,
            error: (err as Error).message,
            rows: [],
          },
          null,
          2,
        ),
      });
    }
  }
  if (!anyOk) {
    excluded.push({ id, reason: summaries.join("; ") });
    return [];
  }
  components.push({
    id,
    files,
    summary: summaries.join(" · "),
  });
  return components;
}

export async function collectAll(
  ctx: CollectorContext,
): Promise<CollectedComponents> {
  const components: PackageComponent[] = [];
  const excluded: CollectedComponents["excluded"] = [];
  const counts: Record<string, number> = {};

  // -------------------------------------------------------
  // memory — ARCHIE chat memory + knowledge items
  // -------------------------------------------------------
  const memory = await collectTables(
    ctx,
    "memory",
    [
      {
        table: "frelux_archie_conversations",
        label: "ARCHIE conversations",
        file: "conversations.json",
      },
      {
        table: "frelux_archie_messages",
        label: "ARCHIE messages",
        file: "messages.json",
      },
      {
        table: "frelux_knowledge_items",
        label: "knowledge items",
        file: "knowledge-items.json",
      },
      {
        table: "frelux_archie_knowledge_history",
        label: "knowledge history",
        file: "knowledge-history.json",
      },
      {
        table: "frelux_archie_knowledge_links",
        label: "knowledge links",
        file: "knowledge-links.json",
      },
    ],
    counts,
    excluded,
  );
  components.push(...memory);

  // -------------------------------------------------------
  // language-memory — validated language knowledge
  // -------------------------------------------------------
  const language = await collectTables(
    ctx,
    "language-memory",
    [
      {
        table: "archie_language_profiles",
        label: "language profiles",
        file: "profiles.json",
      },
      {
        table: "archie_language_entries",
        label: "vocabulary & grammar entries",
        file: "entries.json",
      },
      {
        table: "archie_language_evidence",
        label: "language evidence",
        file: "evidence.json",
      },
      {
        table: "frelux_archie_terminology",
        label: "terminology",
        file: "terminology.json",
      },
      {
        table: "frelux_archie_languages",
        label: "language registry",
        file: "registry.json",
      },
    ],
    counts,
    excluded,
  );
  components.push(...language);

  // -------------------------------------------------------
  // evolution — change requests + audit + lessons
  // -------------------------------------------------------
  const evolution = await collectTables(
    ctx,
    "evolution",
    [
      {
        table: "archie_change_requests",
        label: "change requests",
        file: "change-requests.json",
      },
      {
        table: "archie_change_audit",
        label: "audit trail",
        file: "audit.json",
      },
      {
        table: "archie_evolution_memory",
        label: "evolution lessons",
        file: "lessons.json",
      },
      {
        table: "archie_evolution_settings",
        label: "evolution settings",
        file: "settings.json",
      },
    ],
    counts,
    excluded,
  );
  components.push(...evolution);

  // -------------------------------------------------------
  // application — real runtime version metadata
  // -------------------------------------------------------
  components.push({
    id: "application",
    files: [
      {
        path: "application/version.json",
        content: JSON.stringify(
          {
            archie_version: ctx.archieVersion,
            frelux_version: ctx.appVersion,
            platform: "frelux-pwa",
            runtime: "browser PWA + Supabase backend",
            exported_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      },
    ],
    summary: `ARCHIE ${ctx.archieVersion} · FRELUX ${ctx.appVersion}`,
  });

  // -------------------------------------------------------
  // configuration — non-secret settings ONLY (spec §5)
  // -------------------------------------------------------
  const { data: settings, error: settingsErr } = await ctx.supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const exportable: Record<string, unknown> = {};
  if (settingsErr) {
    excluded.push({
      id: "configuration",
      reason: `site_settings: ${settingsErr.message}`,
    });
  } else if (settings) {
    for (const key of EXPORTABLE_CONFIG_KEYS) {
      if (key in settings)
        exportable[key] = settings[key as keyof typeof settings];
    }
    // Integration config: key names + enabled state, values REDACTED
    const { data: integrations } = await ctx.supabase
      .from("integration_settings")
      .select("integration_key, display_name, category, is_enabled")
      .order("integration_key");
    const integrationTemplates = (integrations ?? []).map((i) => ({
      integration_key: i.integration_key,
      display_name: i.display_name,
      category: i.category,
      is_enabled: i.is_enabled,
      config: SECRET_REDACTED_NOTE,
    }));
    const template = secretsTemplate();
    components.push({
      id: "configuration",
      files: [
        {
          path: "configuration/settings.json",
          content: JSON.stringify(
            {
              note: "Only non-secret configuration is exported (spec §5). Secret-bearing keys are excluded.",
              settings: exportable,
              integration_templates: integrationTemplates,
            },
            null,
            2,
          ),
        },
        template,
      ],
      summary: `${Object.keys(exportable).length} settings · ${integrationTemplates.length} integration templates (values redacted)`,
    });
  }

  // -------------------------------------------------------
  // database — schema version + connection TEMPLATE (§17)
  // NEVER a dump of the production database.
  // -------------------------------------------------------
  const { data: migrations, error: migErr } = await ctx.supabase
    .from("schema_migrations")
    .select("version")
    .order("version", { ascending: true });
  const schemaVersion = migrations?.length
    ? migrations[migrations.length - 1].version
    : null;
  components.push({
    id: "database",
    files: [
      {
        path: "database/schema.json",
        content: JSON.stringify(
          {
            provider: "supabase",
            project_ref: ctx.databaseProjectRef,
            schema_version: schemaVersion,
            migration_list_error: migErr ? migErr.message : null,
            applied_migrations: migrations?.map((m) => m.version) ?? [],
            note:
              (migErr
                ? `WARNING: schema_migrations could not be read (${migErr.message}) — schema_version and applied_migrations may be stale. `
                : "") +
              "Portable state in this package references this schema. The production database is never duplicated or destroyed (spec §17). At restore time the owner chooses KEEP EXISTING MEMORY or RESTORE PORTABLE MEMORY SNAPSHOT.",
            connection_template: {
              SUPABASE_URL: "REQUIRED_AFTER_RESTORE",
              SUPABASE_ANON_KEY: "REQUIRED_AFTER_RESTORE",
            },
          },
          null,
          2,
        ),
      },
    ],
    summary: schemaVersion
      ? `schema at migration ${schemaVersion} (${migrations?.length ?? 0} applied)`
      : "schema version unavailable (tracking table not readable)",
  });

  // -------------------------------------------------------
  // docker + documentation — MIGRATE mode, connectivity only
  // -------------------------------------------------------
  if (ctx.mode === "MIGRATE") {
    const docker = await fetchRealDockerDefinitions(ctx);
    if (docker) components.push(docker.component);
    else
      excluded.push({
        id: "docker",
        reason:
          "Container definitions require connectivity to fetch from the FRELUX repository. Export without connectivity excludes them — re-export online for a code-bearing package.",
      });
    const docs = await buildDocumentation(ctx, schemaVersion);
    if (docs) components.push(docs);
    else
      excluded.push({
        id: "documentation",
        reason: "Could not fetch repository metadata.",
      });
  }

  return { components, excluded, tableCounts: counts };
}

const SECRET_REDACTED_NOTE =
  "REQUIRED_AFTER_RESTORE — integration secrets are never packaged (spec §5)";

interface DockerFile {
  repoPath: string;
  rawUrl: string;
  packagePath: string;
}

const DOCKER_FILES: DockerFile[] = [
  {
    repoPath: "Dockerfile",
    rawUrl:
      "https://raw.githubusercontent.com/petertubin-droid/frelux/main/Dockerfile",
    packagePath: "docker/Dockerfile",
  },
  {
    repoPath: "docker-compose.yml",
    rawUrl:
      "https://raw.githubusercontent.com/petertubin-droid/frelux/main/docker-compose.yml",
    packagePath: "docker/docker-compose.yml",
  },
];

/**
 * Fetch the REAL container definitions from the FRELUX repo.
 * The PWA cannot contain its own source; this fetches the
 * live, published files. Requires connectivity — excluded
 * honestly otherwise (spec §25).
 */
async function fetchRealDockerDefinitions(
  _ctx: CollectorContext,
): Promise<{ component: PackageComponent } | null> {
  const files: PackageFile[] = [];
  const summaries: string[] = [];
  for (const f of DOCKER_FILES) {
    try {
      const res = await fetch(f.rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      files.push({ path: f.packagePath, content });
      summaries.push(`${f.repoPath} (${content.length} bytes)`);
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      summaries.push(`UNAVAILABLE: ${f.repoPath} (${(err as Error).message})`);
    }
  }
  if (files.length === 0) return null;
  return {
    component: {
      id: "docker",
      files,
      summary: summaries.join(" · "),
    },
  };
}

/**
 * Machine-readable restore requirements + owner-facing guide,
 * generated from REAL manifest values (spec §14).
 */
async function buildDocumentation(
  ctx: CollectorContext,
  schemaVersion: string | null,
): Promise<PackageComponent | null> {
  const requirements = {
    format: "archie-migration-restore-requirements/1",
    checks: [
      {
        id: "os",
        requirement: "Linux, macOS or Windows (WSL2 for Docker workflows)",
      },
      { id: "cpu", requirement: "x86_64 or ARM64" },
      { id: "ram", requirement: ">= 2 GB free (4 GB recommended)" },
      { id: "storage", requirement: ">= 500 MB free for ARCHIE environment" },
      {
        id: "runtime",
        requirement:
          "Node.js 20+ for PWA build; Docker 24+ for containerized run",
      },
      {
        id: "database",
        requirement:
          "Supabase project (existing project ref " +
          ctx.databaseProjectRef +
          " or a new one)",
      },
      {
        id: "schema",
        requirement: `Apply migrations up to schema version ${schemaVersion ?? "latest"}`,
      },
    ],
    steps: [
      "verify-package",
      "compatibility-check",
      "owner-authorization",
      "restore",
      "secrets-reauthorization",
      "trusted-device-registration",
      "health-check",
    ],
    notes: [
      "The package never executes code by itself (spec §21).",
      "Secrets are re-authorized on the new environment; the package carries templates only.",
      "A restored environment registers as PENDING_OWNER_APPROVAL and must be approved by the owner (spec §10).",
    ],
  };
  const guide = `# ARCHIE Migration Package — Restore Guide

This package contains ARCHIE's portable software state
(ARCHIE ${ctx.archieVersion}, FRELUX ${ctx.appVersion}).

## What is inside
- \`memory/\` — ARCHIE chat memory and knowledge items
- \`language-memory/\` — validated language knowledge (vocabulary, grammar, phrases, evidence)
- \`evolution/\` — evolution history: change requests, audit trail, lessons
- \`configuration/\` — non-secret settings + secrets TEMPLATE
- \`database/\` — schema version + connection template (no DB dump)
- \`docker/\` — real container definitions from the FRELUX repository
- \`checksums/checksums.json\` — SHA-256 integrity for every file
- \`manifest.json\` — package identity and integrity metadata

## Restoring on a PC/server
1. Verify the package (checksums) before anything else.
2. Check the requirements in \`documentation/requirements.json\`.
3. Obtain owner authorization — migration is privileged.
4. Restore ARCHIE state; choose KEEP EXISTING MEMORY or RESTORE PORTABLE SNAPSHOT.
5. Fill in \`configuration/secrets-template.env\` — secrets are NEVER in this package.
6. Register the machine as a trusted device; the owner must approve it.
7. Run health checks.

## What this package is NOT
- It is not a database dump (the production Supabase is untouched).
- It contains no secrets, no API keys, no owner authority.
- It does not contain the AI model — the model/API stays external.

Generated ${new Date().toISOString()} by ARCHIE Portable Continuity & Migration.
`;
  return {
    id: "documentation",
    files: [
      {
        path: "documentation/requirements.json",
        content: JSON.stringify(requirements, null, 2),
      },
      { path: "documentation/RESTORE_GUIDE.md", content: guide },
    ],
    summary: "restore requirements + owner guide",
  };
}
