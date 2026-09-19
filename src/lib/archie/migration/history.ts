// =========================================================
// FRELUX ARCHIE MIGRATION — HISTORY (spec §23)
//
// Every migration operation writes an audit record to
// archie_migration_history: who authorized, what package,
// source/destination environments, verification result,
// components restored/excluded, errors, final status.
//
// The table is owner-only (RLS, FORCE) — like the evolution
// audit trail it is evidence, not configuration.
// =========================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MigrationHistoryRecord,
  MigrationMode,
  MigrationStatus,
} from "./types";

export interface RecordMigrationInput {
  supabase: SupabaseClient;
  packageId: string;
  mode: MigrationMode | "RESTORE";
  status: MigrationStatus;
  sourceEnvironment: string;
  destinationEnvironment: string;
  archieVersion: string;
  /** id of the owner-authorization record approving the operation. */
  ownerAuthorizationRecordId: string | null;
  /** Lifecycle events appended during the operation. */
  events?: string[];
  verificationResult?: string | null;
  restorationResult?: string | null;
  componentsIncluded?: string[];
  componentsExcluded?: string[];
  errors?: string[];
}

/** Append one audit record. Returns the created record id. */
export async function recordMigration(
  input: RecordMigrationInput,
): Promise<string> {
  const { supabase } = input;
  const { data, error } = await supabase
    .from("archie_migration_history")
    .insert({
      package_id: input.packageId,
      mode: input.mode,
      status: input.status,
      source_environment: input.sourceEnvironment,
      destination_environment: input.destinationEnvironment,
      archie_version: input.archieVersion,
      owner_authorization_record_id: input.ownerAuthorizationRecordId,
      events: input.events ?? [],
      verification_result: input.verificationResult ?? null,
      restoration_result: input.restorationResult ?? null,
      components_included: input.componentsIncluded ?? [],
      components_excluded: input.componentsExcluded ?? [],
      errors: input.errors ?? [],
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `Could not record migration history: ${error?.message ?? "unknown error"}`,
    );
  }
  return (data as { id: string }).id;
}

/** Read the owner's migration history, newest first. */
export async function fetchMigrationHistory(
  supabase: SupabaseClient,
  limit = 50,
): Promise<MigrationHistoryRecord[]> {
  const { data, error } = await supabase
    .from("archie_migration_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRecord);
}

export function rowToRecord(
  row: Record<string, unknown>,
): MigrationHistoryRecord {
  return {
    id: row.id as string,
    packageId: row.package_id as string,
    mode: row.mode as MigrationHistoryRecord["mode"],
    status: row.status as MigrationStatus,
    sourceEnvironment: row.source_environment as string,
    destinationEnvironment: row.destination_environment as string,
    archieVersion: row.archie_version as string,
    ownerAuthorizationRecordId:
      (row.owner_authorization_record_id as string | null) ?? null,
    createdAt: (row.created_at ??
      row.created_date ??
      new Date().toISOString()) as string,
    events: (row.events as string[]) ?? [],
    componentsIncluded: (row.components_included as string[]) ?? [],
    componentsExcluded: (row.components_excluded as string[]) ?? [],
    verificationResult: (row.verification_result as string | null) ?? null,
    restorationResult: (row.restoration_result as string | null) ?? null,
    errors: (row.errors as string[]) ?? [],
  };
}
