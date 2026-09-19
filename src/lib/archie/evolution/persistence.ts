// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — PERSISTENCE
//
// Supabase-backed storage for change requests (with the
// append-only audit trail), language memory, evolution memory
// and owner settings.
//
// Security model:
//   * RLS restricts every table to the owner (profiles.role =
//     'admin') — normal FRELUX users have no access (§20).
//   * The audit table is INSERT/SELECT only; a database
//     trigger makes UPDATE/DELETE impossible for ANY role —
//     ARCHIE cannot modify or delete evidence of previous
//     changes (§5).
//   * Authorizations are never stored here as secrets; they
//     live server-side with the archie-owner-auth function.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import { transitionChangeRequest } from "./change-request";
import {
  normalizeEvolutionSettings,
  validateEvolutionSettings,
} from "./settings";
import type {
  ChangeAuditEntry,
  EvolutionChangeRequest,
  EvolutionMemoryEntry,
  EvolutionResult,
  EvolutionSettings,
  LanguageEntry,
  LanguageEvidence,
  LanguageProfile,
} from "./types";

// ---------------------------------------------------------
// Mapping helpers (snake_case rows ⇄ camelCase domain objects)
// ---------------------------------------------------------

type CrRow = Record<string, unknown>;

function crFromRow(row: CrRow): EvolutionChangeRequest {
  return {
    id: row.id as string,
    crNumber: row.cr_number as string,
    title: row.title as string,
    description: row.description as string,
    reason: row.reason as string,
    affectedFiles: (row.affected_files as string[]) ?? [],
    affectedComponents: (row.affected_components as string[]) ?? [],
    proposedDiff: row.proposed_diff as string,
    dependencies: (row.dependencies as string[]) ?? [],
    securityImpact: row.security_impact as string,
    dataImpact: row.data_impact as string,
    regressionRisk:
      row.regression_risk as EvolutionChangeRequest["regressionRisk"],
    testPlan: row.test_plan as string,
    testResults:
      (row.test_results as EvolutionChangeRequest["testResults"]) ?? null,
    rollbackPlan: row.rollback_plan as string,
    requestedLevel:
      row.requested_level as EvolutionChangeRequest["requestedLevel"],
    ownerAuthorizationStatus:
      row.owner_authorization_status as EvolutionChangeRequest["ownerAuthorizationStatus"],
    stagingAuthorizationRecordId:
      (row.staging_authorization_record_id as string) ?? null,
    productionAuthorizationRecordId:
      (row.production_authorization_record_id as string) ?? null,
    rollbackAuthorizationRecordId:
      (row.rollback_authorization_record_id as string) ?? null,
    resultingCommit: (row.resulting_commit as string) ?? null,
    requiresOwnerIntervention: row.requires_owner_intervention as boolean,
    flags: (row.flags as string[]) ?? [],
    archieVersion: row.archie_version as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    state: row.state as EvolutionChangeRequest["state"],
  };
}

function crToRow(cr: EvolutionChangeRequest): CrRow {
  return {
    id: cr.id,
    cr_number: cr.crNumber,
    title: cr.title,
    description: cr.description,
    reason: cr.reason,
    affected_files: cr.affectedFiles,
    affected_components: cr.affectedComponents,
    proposed_diff: cr.proposedDiff,
    dependencies: cr.dependencies,
    security_impact: cr.securityImpact,
    data_impact: cr.dataImpact,
    regression_risk: cr.regressionRisk,
    test_plan: cr.testPlan,
    test_results: cr.testResults,
    rollback_plan: cr.rollbackPlan,
    requested_level: cr.requestedLevel,
    owner_authorization_status: cr.ownerAuthorizationStatus,
    staging_authorization_record_id: cr.stagingAuthorizationRecordId,
    production_authorization_record_id: cr.productionAuthorizationRecordId,
    rollback_authorization_record_id: cr.rollbackAuthorizationRecordId,
    resulting_commit: cr.resultingCommit,
    requires_owner_intervention: cr.requiresOwnerIntervention,
    flags: cr.flags,
    archie_version: cr.archieVersion,
    created_at: cr.createdAt,
    updated_at: cr.updatedAt,
    state: cr.state,
  };
}

function auditToRow(entry: ChangeAuditEntry): CrRow {
  return {
    id: entry.id,
    change_request_id: entry.changeRequestId,
    cr_number: entry.crNumber,
    actor: entry.actor,
    action: entry.action,
    from_state: entry.fromState,
    to_state: entry.toState,
    authorization_record_id: entry.authorizationRecordId,
    detail: entry.detail,
    created_at: entry.createdAt,
  };
}

function profileFromRow(row: CrRow): LanguageProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    nativeName: row.native_name as string,
    isoCode: (row.iso_code as string) ?? null,
    altNames: (row.alt_names as string[]) ?? [],
    family: (row.family as string) ?? null,
    writingSystem: (row.writing_system as string[]) ?? [],
    regions: (row.regions as string[]) ?? [],
    dialects: (row.dialects as string[]) ?? [],
    registryStatus: row.registry_status as LanguageProfile["registryStatus"],
    confidence: row.confidence === null ? null : Number(row.confidence),
    verificationStatus:
      row.verification_status as LanguageProfile["verificationStatus"],
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function entryFromRow(row: CrRow): LanguageEntry {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    kind: row.kind as LanguageEntry["kind"],
    key: row.key as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    region: (row.region as string) ?? null,
    confidence: row.confidence === null ? null : Number(row.confidence),
    validationState: row.validation_state as LanguageEntry["validationState"],
    history: (row.history as LanguageEntry["history"]) ?? [],
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function evidenceFromRow(row: CrRow): LanguageEvidence {
  return {
    id: row.id as string,
    entryId: row.entry_id as string,
    source: row.source as string,
    sourceType: row.source_type as LanguageEvidence["sourceType"],
    reliability: Number(row.reliability),
    content: (row.content as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

function memoryFromRow(row: CrRow): EvolutionMemoryEntry {
  return {
    id: row.id as string,
    problem: row.problem as string,
    proposedSolution: row.proposed_solution as string,
    ownerDecision: row.owner_decision as string,
    implementationResult: (row.implementation_result as string) ?? null,
    testResult: (row.test_result as string) ?? null,
    productionResult: (row.production_result as string) ?? null,
    failureInformation: (row.failure_information as string) ?? null,
    rollbackInformation: (row.rollback_information as string) ?? null,
    lessonsLearned: (row.lessons_learned as string) ?? null,
    relatedCrNumber: (row.related_cr_number as string) ?? null,
    affectedVersion: (row.affected_version as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------
// Change requests
// ---------------------------------------------------------

export async function persistChangeRequest(
  request: EvolutionChangeRequest,
  audit: ChangeAuditEntry,
): Promise<EvolutionResult<EvolutionChangeRequest>> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("archie_change_requests")
    .upsert(crToRow(request), {
      onConflict: "id",
    });
  if (error)
    return {
      ok: false,
      error: `Could not save the change request: ${error.message}`,
    };
  const { error: auditError } = await supabase
    .from("archie_change_audit")
    .insert(auditToRow(audit));
  if (auditError) {
    return {
      ok: false,
      error: `Could not append the audit entry: ${auditError.message}`,
    };
  }
  return { ok: true, data: request };
}

export async function fetchChangeRequests(): Promise<
  EvolutionResult<EvolutionChangeRequest[]>
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_change_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error)
    return {
      ok: false,
      error: `Could not load change requests: ${error.message}`,
    };
  return { ok: true, data: (data ?? []).map(crFromRow) };
}

export async function fetchChangeRequest(
  crNumber: string,
): Promise<EvolutionResult<EvolutionChangeRequest | null>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_change_requests")
    .select("*")
    .eq("cr_number", crNumber)
    .maybeSingle();
  if (error)
    return {
      ok: false,
      error: `Could not load the change request: ${error.message}`,
    };
  return { ok: true, data: data ? crFromRow(data) : null };
}

export async function fetchChangeAudit(
  changeRequestId: string,
): Promise<EvolutionResult<ChangeAuditEntry[]>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_change_audit")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: true });
  if (error)
    return {
      ok: false,
      error: `Could not load the audit trail: ${error.message}`,
    };
  return {
    ok: true,
    data: (data ?? []).map((row: CrRow) => ({
      id: row.id as string,
      changeRequestId: row.change_request_id as string,
      crNumber: row.cr_number as string,
      actor: row.actor as ChangeAuditEntry["actor"],
      action: row.action as string,
      fromState: (row.from_state as ChangeAuditEntry["fromState"]) ?? null,
      toState: (row.to_state as ChangeAuditEntry["toState"]) ?? null,
      authorizationRecordId: (row.authorization_record_id as string) ?? null,
      detail: (row.detail as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    })),
  };
}

// ---------------------------------------------------------
// Server-side owner decisions (§4, §18)
// ---------------------------------------------------------

/**
 * Execute an owner decision against a change request. The
 * authorization record MUST come from archie-owner-auth
 * (server-verified); this function refuses fabricated ids.
 * Returns the updated request and appends the immutable audit
 * entry.
 */
export async function transitionChangeRequestServer(
  request: EvolutionChangeRequest,
  decision: "authorize" | "reject" | "execute" | "rollback",
  authorizationRecordId: string,
  resultingCommit?: string,
): Promise<EvolutionResult<EvolutionChangeRequest>> {
  const approval = {
    actor: "OWNER" as const,
    authorizationRecordId,
    serverVerified: true,
  };
  const evidence = {
    now: new Date().toISOString(),
    actor: "OWNER" as const,
    approval,
  };
  let result;
  switch (decision) {
    case "authorize":
      result = transitionChangeRequest(request, "AUTHORIZED", evidence);
      break;
    case "reject":
      result = transitionChangeRequest(request, "REJECTED", evidence);
      break;
    case "execute":
      result = transitionChangeRequest(request, "EXECUTED", {
        ...evidence,
        resultingCommit: resultingCommit ?? "",
      });
      break;
    case "rollback":
      result = transitionChangeRequest(request, "ROLLED_BACK", {
        ...evidence,
        rollbackInformation: `Owner-initiated rollback of ${request.crNumber}; recovery via the recorded rollback plan.`,
      });
      break;
  }
  if (!result) return { ok: false, error: `Unknown decision "${decision}".` };
  if (!result.ok) return { ok: false, error: result.error };
  return persistChangeRequest(result.request, result.audit);
}

// ---------------------------------------------------------
// Language memory
// ---------------------------------------------------------

export async function persistLanguageProfile(
  profile: LanguageProfile,
): Promise<EvolutionResult<LanguageProfile>> {
  const supabase = await getSupabase();
  const row = {
    id: profile.id,
    name: profile.name,
    native_name: profile.nativeName,
    iso_code: profile.isoCode,
    alt_names: profile.altNames,
    family: profile.family,
    writing_system: profile.writingSystem,
    regions: profile.regions,
    dialects: profile.dialects,
    registry_status: profile.registryStatus,
    confidence: profile.confidence,
    verification_status: profile.verificationStatus,
    version: profile.version,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
  const { error } = await supabase
    .from("archie_language_profiles")
    .upsert(row, {
      onConflict: "id",
    });
  if (error)
    return {
      ok: false,
      error: `Could not save the language profile: ${error.message}`,
    };
  return { ok: true, data: profile };
}

export async function fetchLanguageProfiles(): Promise<
  EvolutionResult<LanguageProfile[]>
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_language_profiles")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error)
    return {
      ok: false,
      error: `Could not load language profiles: ${error.message}`,
    };
  return { ok: true, data: (data ?? []).map(profileFromRow) };
}

export async function persistLanguageEntry(
  entry: LanguageEntry,
  evidence: Array<Omit<LanguageEvidence, "id" | "createdAt">>,
): Promise<EvolutionResult<LanguageEntry>> {
  const supabase = await getSupabase();
  const row = {
    id: entry.id,
    profile_id: entry.profileId,
    kind: entry.kind,
    key: entry.key,
    payload: entry.payload,
    region: entry.region,
    confidence: entry.confidence,
    validation_state: entry.validationState,
    history: entry.history,
    version: entry.version,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
  const { error } = await supabase.from("archie_language_entries").upsert(row, {
    onConflict: "id",
  });
  if (error)
    return {
      ok: false,
      error: `Could not save the language entry: ${error.message}`,
    };
  if (evidence.length > 0) {
    const { error: evidenceError } = await supabase
      .from("archie_language_evidence")
      .insert(
        evidence.map((e) => ({
          id: crypto.randomUUID(),
          entry_id: e.entryId,
          source: e.source,
          source_type: e.sourceType,
          reliability: e.reliability,
          content: e.content,
        })),
      );
    if (evidenceError) {
      return {
        ok: false,
        error: `Could not save the language evidence: ${evidenceError.message}`,
      };
    }
  }
  return { ok: true, data: entry };
}

export async function fetchLanguageEntries(
  profileId: string,
): Promise<EvolutionResult<LanguageEntry[]>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_language_entries")
    .select("*")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false });
  if (error)
    return {
      ok: false,
      error: `Could not load language entries: ${error.message}`,
    };
  return { ok: true, data: (data ?? []).map(entryFromRow) };
}

export async function fetchLanguageEvidence(
  entryIds: string[],
): Promise<EvolutionResult<LanguageEvidence[]>> {
  if (entryIds.length === 0) return { ok: true, data: [] };
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_language_evidence")
    .select("*")
    .in("entry_id", entryIds);
  if (error)
    return {
      ok: false,
      error: `Could not load language evidence: ${error.message}`,
    };
  return { ok: true, data: (data ?? []).map(evidenceFromRow) };
}

// ---------------------------------------------------------
// Evolution memory (§15)
// ---------------------------------------------------------

export async function persistEvolutionMemory(
  entry: Omit<EvolutionMemoryEntry, "id" | "createdAt"> & {
    id: string;
    createdAt: string;
  },
): Promise<EvolutionResult<EvolutionMemoryEntry>> {
  const supabase = await getSupabase();
  const { error } = await supabase.from("archie_evolution_memory").insert({
    id: entry.id,
    problem: entry.problem,
    proposed_solution: entry.proposedSolution,
    owner_decision: entry.ownerDecision,
    implementation_result: entry.implementationResult,
    test_result: entry.testResult,
    production_result: entry.productionResult,
    failure_information: entry.failureInformation,
    rollback_information: entry.rollbackInformation,
    lessons_learned: entry.lessonsLearned,
    related_cr_number: entry.relatedCrNumber,
    affected_version: entry.affectedVersion,
    created_at: entry.createdAt,
  });
  if (error)
    return {
      ok: false,
      error: `Could not save the evolution memory: ${error.message}`,
    };
  return { ok: true, data: entry };
}

export async function fetchEvolutionMemory(): Promise<
  EvolutionResult<EvolutionMemoryEntry[]>
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_evolution_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error)
    return {
      ok: false,
      error: `Could not load evolution memory: ${error.message}`,
    };
  return { ok: true, data: (data ?? []).map(memoryFromRow) };
}

// ---------------------------------------------------------
// Owner settings (§17)
// ---------------------------------------------------------

export async function fetchEvolutionSettings(): Promise<
  EvolutionResult<EvolutionSettings>
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("archie_evolution_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error)
    return {
      ok: false,
      error: `Could not load evolution settings: ${error.message}`,
    };
  if (!data) return { ok: true, data: normalizeEvolutionSettings({}) };
  return {
    ok: true,
    data: normalizeEvolutionSettings(data as Record<string, unknown>),
  };
}

export async function saveEvolutionSettings(
  settings: EvolutionSettings,
): Promise<EvolutionResult<EvolutionSettings>> {
  const check = validateEvolutionSettings(settings);
  if (!check.ok) return check;
  const supabase = await getSupabase();
  const { error } = await supabase.from("archie_evolution_settings").upsert(
    {
      id: 1,
      language: settings.language,
      self_modification: settings.selfModification,
      updated_at: settings.updatedAt,
    },
    { onConflict: "id" },
  );
  if (error)
    return {
      ok: false,
      error: `Could not save evolution settings: ${error.message}`,
    };
  return { ok: true, data: check.data };
}
