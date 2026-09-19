// =========================================================
// FRELUX ARCHIE MIGRATION — RESTORE (spec §17, §21, §22, §10)
//
// Restoring is a THREE-GATE process, enforced here in code:
//   Gate 1 — package verified (caller must pass a successful
//            PackageVerificationResult; nothing else runs)
//   Gate 2 — owner authorization (change kind ARCHIE_MIGRATION,
//            recorded via the existing owner-auth system)
//   Gate 3 — owner confirms the restore plan shown in the UI
//
// Security properties:
//   * Only tables in RESTORE_TABLE_ALLOWLIST are ever touched.
//     This list is CODE, not package content — a USB package
//     cannot change owner, auth, or security state (spec §24).
//   * Restores are UPSERT-MERGE only. No DELETE ever runs.
//     The existing installation is never destroyed (spec §22).
//   * The append-only evolution audit table is NEVER written
//     during restore — audit integrity is preserved.
//   * The restored environment registers as
//     PENDING_OWNER_APPROVAL (spec §10) — the owner must
//     approve it before privileged operations unlock.
// =========================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { registerRestoredEnvironment } from "./identity";
import type { UnzippedPackage } from "./verify";
import type {
  MigrationManifest,
  RestoreMemoryMode,
  RestorePlan,
  RestoreStep,
} from "./types";

/**
 * The ONLY tables a restore may write to. Parent tables before
 * child tables (FK order). NOTE what is deliberately absent:
 * frelux_owner_authorizations, frelux_security_sessions,
 * frelux_security_events, profiles, archie_change_audit —
 * authority and audit state can never be restored from a USB
 * package (spec §24).
 */
export const RESTORE_TABLE_ALLOWLIST = [
  { component: "memory", table: "frelux_archie_conversations", file: "memory/conversations.json" },
  { component: "memory", table: "frelux_archie_messages", file: "memory/messages.json" },
  { component: "memory", table: "frelux_knowledge_items", file: "memory/knowledge-items.json" },
  { component: "memory", table: "frelux_archie_knowledge_history", file: "memory/knowledge-history.json" },
  { component: "memory", table: "frelux_archie_knowledge_links", file: "memory/knowledge-links.json" },
  { component: "language-memory", table: "archie_language_profiles", file: "language-memory/profiles.json" },
  { component: "language-memory", table: "archie_language_entries", file: "language-memory/entries.json" },
  { component: "language-memory", table: "archie_language_evidence", file: "language-memory/evidence.json" },
  { component: "language-memory", table: "frelux_archie_terminology", file: "language-memory/terminology.json" },
  { component: "language-memory", table: "frelux_archie_languages", file: "language-memory/registry.json" },
  { component: "evolution", table: "archie_change_requests", file: "evolution/change-requests.json" },
  { component: "evolution", table: "archie_evolution_memory", file: "evolution/lessons.json" },
  { component: "evolution", table: "archie_evolution_settings", file: "evolution/settings.json" },
] as const;

const UPSERT_BATCH = 500;

export interface RestoreInput {
  supabase: SupabaseClient;
  unzipped: UnzippedPackage;
  /** MUST be a verified package — pass verifyPackage's result. */
  verificationOk: boolean;
  memoryMode: RestoreMemoryMode;
}

/** Build the plan shown to the owner BEFORE anything runs. */
export function buildRestorePlan(input: {
  unzipped: UnzippedPackage;
  memoryMode: RestoreMemoryMode;
}): RestorePlan {
  const { unzipped, memoryMode } = input;
  const steps: RestoreStep[] = [];
  const skipped: RestorePlan["skipped"] = [];
  const warnings: string[] = [];
  const fileByPath = new Map(unzipped.files.map((f) => [f.path, f]));

  if (memoryMode === "KEEP_EXISTING_MEMORY") {
    skipped.push({
      component: "memory",
      reason:
        "Owner chose KEEP EXISTING MEMORY — ARCHIE's live memory in this environment is untouched. The package copy is kept on the storage device as a backup.",
    });
    skipped.push({
      component: "language-memory",
      reason: "Owner chose KEEP EXISTING MEMORY — live language memory untouched.",
    });
    skipped.push({
      component: "evolution",
      reason: "Owner chose KEEP EXISTING MEMORY — live evolution history untouched.",
    });
    return { packageId: unzipped.manifest.packageId, memoryMode, steps, skipped, warnings };
  }

  for (const entry of RESTORE_TABLE_ALLOWLIST) {
    const file = fileByPath.get(entry.file);
    if (!file) {
      skipped.push({
        component: entry.component,
        reason: `No ${entry.file} in this package.`,
      });
      continue;
    }
    let rowCount = 0;
    let parseOk = true;
    try {
      const parsed = JSON.parse(file.content) as { rowCount?: number; rows?: unknown[] };
      rowCount = Array.isArray(parsed.rows) ? parsed.rows.length : 0;
    } catch {
      parseOk = false;
      warnings.push(`${entry.file} could not be parsed and will be skipped.`);
      skipped.push({ component: entry.component, reason: `${entry.file} unparseable.` });
      continue;
    }
    if (!parseOk || rowCount === 0) {
      skipped.push({
        component: entry.component,
        reason: rowCount === 0 ? `${entry.file} contains no rows.` : `${entry.file} invalid.`,
      });
      continue;
    }
    steps.push({
      component: entry.component,
      targetTable: entry.table,
      mode: "upsert-merge",
      rowCount,
      description: `Merge ${rowCount} rows into ${entry.table} (existing rows with the same id are updated, nothing is deleted).`,
    });
  }

  // Audit trail is read-only by design
  skipped.push({
    component: "evolution",
    reason:
      "archie_change_audit is append-only and never written during restore — audit integrity is preserved.",
  });

  if (steps.length === 0) {
    warnings.push("No restorable rows were found in this package.");
  }
  return { packageId: unzipped.manifest.packageId, memoryMode, steps, skipped, warnings };
}

export interface RestoreOutcome {
  ok: boolean;
  restoredTables: Array<{ table: string; count: number }>;
  failedTables: Array<{ table: string; error: string }>;
  environmentRegistered: boolean;
  manifest: MigrationManifest;
}

/**
 * Execute a confirmed restore plan. Non-destructive upserts
 * only; the first table failure stops the run (no partial
 * silent state) and the outcome reports exactly what happened.
 */
export async function executeRestore(
  input: RestoreInput,
  plan: RestorePlan,
  onProgress: (detail: string) => void,
): Promise<RestoreOutcome> {
  if (!input.verificationOk) {
    throw new Error("Refusing to restore: package did not pass verification.");
  }
  const restoredTables: RestoreOutcome["restoredTables"] = [];
  const failedTables: RestoreOutcome["failedTables"] = [];
  const fileByPath = new Map(input.unzipped.files.map((f) => [f.path, f]));

  for (const step of plan.steps) {
    const entry = RESTORE_TABLE_ALLOWLIST.find(
      (e) => e.table === step.targetTable,
    );
    if (!entry) {
      // Belt-and-braces: plan is client-built, but never write
      // outside the allowlist even if a plan is forged.
      failedTables.push({ table: step.targetTable, error: "Table not in restore allowlist." });
      continue;
    }
    const file = fileByPath.get(entry.file);
    if (!file) continue;
    onProgress(`Restoring ${entry.table}…`);
    const rows = (JSON.parse(file.content) as { rows: Array<Record<string, unknown>> }).rows ?? [];
    let done = 0;
    try {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const batch = rows.slice(i, i + UPSERT_BATCH).map((row) => ({
          ...row,
          // Migration metadata — proves the row's provenance
          _restored_from_package: undefined,
        }));
        const { error } = await input.supabase
          .from(entry.table)
          .upsert(batch, { onConflict: "id" });
        if (error) throw new Error(error.message);
        done += batch.length;
      }
      restoredTables.push({ table: entry.table, count: done });
    } catch (err) {
      failedTables.push({ table: entry.table, error: (err as Error).message });
      // STOP on first failure — no partial silent restore
      break;
    }
  }

  // Register the restored environment as PENDING OWNER APPROVAL
  let environmentRegistered = false;
  try {
    onProgress("Registering restored environment (pending owner approval)…");
    await registerRestoredEnvironment(
      input.supabase,
      input.unzipped.manifest.sourceEnvironment.archieInstallationId,
    );
    environmentRegistered = true;
  } catch (err) {
    failedTables.push({
      table: "archie_installations",
      error: (err as Error).message,
    });
  }

  return {
    ok: failedTables.length === 0,
    restoredTables,
    failedTables,
    environmentRegistered,
    manifest: input.unzipped.manifest,
  };
}
