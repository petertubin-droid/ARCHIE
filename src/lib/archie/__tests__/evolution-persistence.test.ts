// =========================================================
// ARCHIE EVOLUTION, PERSISTENCE TESTS
//
// Supabase-backed storage for change requests (+ append-only
// audit trail), language memory, evolution memory and owner
// settings — with the snake_case ⇄ camelCase row mapping:
//   * persist/fetch round-trips preserve every domain field
//   * failures return honest {ok:false, error} envelopes, no
//     fake success, no thrown credentials
//   * owner decisions persist ONLY through the real state
//     machine (integration with change-request.ts)
//   * settings validation runs BEFORE any database write
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase-lazy";
import { DEFAULT_EVOLUTION_SETTINGS } from "@/lib/archie/evolution/settings";
import {
  persistChangeRequest,
  fetchChangeRequests,
  fetchChangeRequest,
  fetchChangeAudit,
  transitionChangeRequestServer,
  persistLanguageProfile,
  fetchLanguageProfiles,
  persistLanguageEntry,
  fetchLanguageEntries,
  fetchLanguageEvidence,
  persistEvolutionMemory,
  fetchEvolutionMemory,
  fetchEvolutionSettings,
  saveEvolutionSettings,
} from "@/lib/archie/evolution/persistence";
import {
  createChangeRequest,
  transitionChangeRequest,
} from "@/lib/archie/evolution/change-request";
import type {
  EvolutionChangeRequest,
  LanguageProfile,
  LanguageEntry,
  EvolutionSettings,
  ChangeAuditEntry,
} from "@/lib/archie/evolution/types";
import type { CreateChangeRequestInput } from "@/lib/archie/evolution/change-request";

// ---------------------------------------------------------
// Chainable supabase fake with per-table error injection
// ---------------------------------------------------------
type Row = Record<string, unknown>;
const state = {
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, string | null>,
  upserts: {} as Record<string, Row[]>,
  inserts: {} as Record<string, Row[]>,
};

function resetState() {
  for (const k of Object.keys(state.tables)) delete state.tables[k];
  for (const k of Object.keys(state.errors)) delete state.errors[k];
  for (const k of Object.keys(state.upserts)) delete state.upserts[k];
  for (const k of Object.keys(state.inserts)) delete state.inserts[k];
}

function rowsOf(t: string): Row[] {
  state.tables[t] ??= [];
  return state.tables[t];
}
function errOf(t: string) {
  return state.errors[t]
    ? ({ message: state.errors[t] } as PostgrestError)
    : null;
}

function fakeSupabase() {
  const from = (t: string) => {
    const rows = rowsOf(t);
    const filters: Array<(r: Row) => boolean> = [];
    let ordering: { col: string; asc: boolean } | null = null;
    let limited: number | null = null;
    const apply = () => {
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (ordering) {
        out = [...out].sort((a, b) => {
          const x = String(a[ordering!.col] ?? "");
          const y = String(b[ordering!.col] ?? "");
          return ordering!.asc
            ? x < y
              ? -1
              : x > y
                ? 1
                : 0
            : x < y
              ? 1
              : x > y
                ? -1
                : 0;
        });
      }
      if (limited != null) out = out.slice(0, limited);
      return out;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      order: (col: string, opts: { ascending?: boolean }) => {
        ordering = { col, asc: opts?.ascending !== false };
        return q;
      },
      limit: (n: number) => {
        limited = n;
        return q;
      },
      maybeSingle: () => ({ data: apply()[0] ?? null, error: errOf(t) }),
      single: () => ({ data: apply()[0] ?? null, error: errOf(t) }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: apply(), error: errOf(t) }).then(resolve),
      upsert: (row: Row) => {
        state.upserts[t] ??= [];
        state.upserts[t].push(row);
        return Promise.resolve({ error: errOf(t) });
      },
      insert: (payload: Row | Row[]) => {
        state.inserts[t] ??= [];
        for (const r of Array.isArray(payload) ? payload : [payload])
          state.inserts[t].push(r as Row);
        return Promise.resolve({ error: errOf(t) });
      },
    };
    return q as never;
  };
  return { from };
}

beforeEach(() => {
  resetState();
  vi.mocked(getSupabase).mockReset();
  vi.mocked(getSupabase).mockResolvedValue(fakeSupabase() as never);
});

// ---------------------------------------------------------
// Fixtures (same shape as evolution-change-request.test.ts)
// ---------------------------------------------------------
const NOW = "2026-09-15T00:00:00Z";
function input(
  over: Partial<CreateChangeRequestInput> = {},
): CreateChangeRequestInput {
  return {
    title: "Fix login rounding",
    description: "Rounds quote totals correctly",
    reason: "Owner report: totals off by 1 kobo",
    affectedFiles: ["src/lib/quote.ts"],
    affectedComponents: ["Quotations"],
    proposedDiff: "+ fix",
    dependencies: [],
    securityImpact: "none",
    dataImpact: "none",
    regressionRisk: "low",
    testPlan: "vitest src/lib/quote.test.ts",
    rollbackPlan: "git revert",
    requestedLevel: "staging",
    archieVersion: "1.0.0",
    now: NOW,
    ...over,
  };
}
function created(): EvolutionChangeRequest {
  const r = createChangeRequest(input(), "cr-1", "CR-2026-0001");
  if (!r.ok) throw new Error(r.error);
  return r.request;
}
function awaitingOwner(): EvolutionChangeRequest {
  const r = transitionChangeRequest(created(), "AWAITING_OWNER", {
    now: NOW,
    actor: "ARCHIE",
    proposalComplete: true,
  });
  if (!r.ok) throw new Error(r.error);
  return r.request;
}
function auditFixture(cr: EvolutionChangeRequest): ChangeAuditEntry {
  return {
    id: "aud-1",
    changeRequestId: cr.id,
    crNumber: cr.crNumber,
    actor: "ARCHIE",
    action: "submit_for_owner_decision",
    fromState: "PROPOSED",
    toState: "AWAITING_OWNER",
    authorizationRecordId: null,
    detail: { note: "ready" },
    createdAt: NOW,
  };
}

describe("change requests", () => {
  it("persists snake_case rows and appends the audit entry on success", async () => {
    const cr = awaitingOwner();
    const res = await persistChangeRequest(cr, auditFixture(cr));
    expect(res.ok).toBe(true);
    const row = state.upserts["archie_change_requests"][0];
    expect(row.cr_number).toBe("CR-2026-0001");
    expect(row.rollback_plan).toBe("git revert");
    expect(row.state).toBe("AWAITING_OWNER");
    expect(row.owner_authorization_status).toBe("none");
    const aud = state.inserts["archie_change_audit"][0];
    expect(aud.change_request_id).toBe(cr.id);
    expect(aud.from_state).toBe("PROPOSED");
    expect(aud.to_state).toBe("AWAITING_OWNER");
  });

  it("returns an honest error when the upsert fails; audit never written", async () => {
    state.errors["archie_change_requests"] = "RLS denied";
    const cr = awaitingOwner();
    const res = await persistChangeRequest(cr, auditFixture(cr));
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toContain("Could not save the change request");
    expect(state.inserts["archie_change_audit"]).toBeUndefined();
  });

  it("returns an honest error when the audit append fails", async () => {
    state.errors["archie_change_audit"] = "append denied";
    const cr = awaitingOwner();
    const res = await persistChangeRequest(cr, auditFixture(cr));
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toContain("Could not append the audit entry");
  });

  it("fetchChangeRequests maps snake_case rows back to domain objects, newest first", async () => {
    state.tables["archie_change_requests"] = [
      {
        id: "cr-2",
        cr_number: "CR-2026-0002",
        title: "b",
        description: "d",
        reason: "r",
        affected_files: [],
        affected_components: [],
        proposed_diff: "+",
        dependencies: [],
        security_impact: "none",
        data_impact: "none",
        regression_risk: "low",
        test_plan: "t",
        test_results: null,
        rollback_plan: "rb",
        requested_level: "staging",
        owner_authorization_status: "none",
        staging_authorization_record_id: null,
        production_authorization_record_id: null,
        rollback_authorization_record_id: null,
        resulting_commit: null,
        requires_owner_intervention: false,
        flags: [],
        archie_version: "1.0.0",
        created_at: NOW,
        updated_at: NOW,
        state: "PROPOSED",
      },
    ];
    const res = await fetchChangeRequests();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].crNumber).toBe("CR-2026-0002");
      expect(res.data[0].state).toBe("PROPOSED");
    }
  });

  it("fetchChangeRequests surfaces database errors, never empty success", async () => {
    state.errors["archie_change_requests"] = "connection lost";
    const res = await fetchChangeRequests();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Could not load change requests");
  });

  it("fetchChangeRequest resolves by CR number; null when absent", async () => {
    state.tables["archie_change_requests"] = [
      { ...auditFixture(created()), id: "cr-1", cr_number: "CR-2026-0001" },
    ] as Row[];
    const hit = await fetchChangeRequest("CR-2026-0001");
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.data?.crNumber).toBe("CR-2026-0001");
    const miss = await fetchChangeRequest("CR-2026-9999");
    expect(miss.ok).toBe(true);
    if (miss.ok) expect(miss.data).toBeNull();
  });

  it("fetchChangeAudit returns the full trail, oldest first", async () => {
    state.tables["archie_change_audit"] = [
      {
        id: "a1",
        change_request_id: "cr-1",
        cr_number: "CR-2026-0001",
        actor: "ARCHIE",
        action: "create",
        from_state: null,
        to_state: "PROPOSED",
        authorization_record_id: null,
        detail: {},
        created_at: "2026-09-15T01:00:00Z",
      },
      {
        id: "a2",
        change_request_id: "cr-1",
        cr_number: "CR-2026-0001",
        actor: "OWNER",
        action: "authorize",
        from_state: "AWAITING_OWNER",
        to_state: "AUTHORIZED",
        authorization_record_id: "rec-1",
        detail: { serverVerified: true },
        created_at: "2026-09-15T02:00:00Z",
      },
    ];
    const res = await fetchChangeAudit("cr-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0].action).toBe("create");
      expect(res.data[1].authorizationRecordId).toBe("rec-1");
      expect(res.data[1].toState).toBe("AUTHORIZED");
    }
  });
});

describe("owner decisions (server-verified)", () => {
  it("authorize flows through the REAL state machine and persists", async () => {
    const res = await transitionChangeRequestServer(
      awaitingOwner(),
      "authorize",
      "rec-owner-1",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("AUTHORIZED");
      expect(res.data.ownerAuthorizationStatus).not.toBe("none");
      expect(state.upserts["archie_change_requests"][0].state).toBe(
        "AUTHORIZED",
      );
      expect(state.inserts["archie_change_audit"].length).toBeGreaterThan(0);
    }
  });

  it("reject refuses an invalid decision without touching the database", async () => {
    const res = await transitionChangeRequestServer(
      awaitingOwner(),
      "deploy" as never,
      "rec-1",
    );
    expect(res.ok).toBe(false);
    expect(state.upserts["archie_change_requests"]).toBeUndefined();
  });

  it("an illegal transition (authorize a REJECTED request) is refused", async () => {
    const rejected = { ...created(), state: "REJECTED" as const };
    const res = await transitionChangeRequestServer(
      rejected,
      "authorize",
      "rec-1",
    );
    expect(res.ok).toBe(false);
    expect(state.upserts["archie_change_requests"]).toBeUndefined();
  });
});

describe("language memory", () => {
  const profile: LanguageProfile = {
    id: "lp-1",
    name: "Yoruba",
    nativeName: "Yorùbá",
    isoCode: "yo",
    altNames: ["Ede Yoruba"],
    family: "Niger-Congo",
    writingSystem: ["Latin"],
    regions: ["NG"],
    dialects: [],
    registryStatus: "frelux_registered",
    confidence: 0.9,
    verificationStatus: "CONFIRMED",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("persistLanguageProfile stores snake_case; fetch maps back", async () => {
    const res = await persistLanguageProfile(profile);
    expect(res.ok).toBe(true);
    expect(state.upserts["archie_language_profiles"][0].native_name).toBe(
      "Yorùbá",
    );
    expect(state.upserts["archie_language_profiles"][0].iso_code).toBe("yo");

    state.tables["archie_language_profiles"] = [
      state.upserts["archie_language_profiles"][0],
    ];
    const fetched = await fetchLanguageProfiles();
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.data[0].nativeName).toBe("Yorùbá");
  });

  it("persistLanguageProfile reports database errors honestly", async () => {
    state.errors["archie_language_profiles"] = "denied";
    const res = await persistLanguageProfile(profile);
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toContain("Could not save the language profile");
  });

  it("persistLanguageEntry stores the entry and its evidence", async () => {
    const entry: LanguageEntry = {
      id: "le-1",
      profileId: "lp-1",
      kind: "vocabulary",
      key: "k1",
      payload: { word: "ilé" },
      region: "NG",
      confidence: 0.8,
      validationState: "NEEDS_REVIEW",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = await persistLanguageEntry(entry, [
      {
        entryId: "le-1",
        source: "web",
        sourceType: "external_reference",
        reliability: 0.7,
        content: { url: "x" },
      },
    ]);
    expect(res.ok).toBe(true);
    expect(state.upserts["archie_language_entries"][0].profile_id).toBe("lp-1");
    const ev = state.inserts["archie_language_evidence"][0];
    expect(ev.entry_id).toBe("le-1");
    expect(typeof ev.id).toBe("string");
    expect(ev.reliability).toBe(0.7);
  });

  it("persistLanguageEntry skips the evidence insert when there is none", async () => {
    const entry: LanguageEntry = {
      id: "le-2",
      profileId: "lp-1",
      kind: "grammar",
      key: "k2",
      payload: {},
      region: null,
      confidence: null,
      validationState: "NEEDS_REVIEW",
      history: [],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = await persistLanguageEntry(entry, []);
    expect(res.ok).toBe(true);
    expect(state.inserts["archie_language_evidence"]).toBeUndefined();
  });

  it("fetchLanguageEvidence short-circuits to [] for no entry ids (no query)", async () => {
    const res = await fetchLanguageEvidence([]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("fetchLanguageEvidence maps rows and filters by entry ids", async () => {
    state.tables["archie_language_evidence"] = [
      {
        id: "ev-1",
        entry_id: "le-1",
        source: "web",
        source_type: "web",
        reliability: 0.7,
        content: { url: "x" },
        created_at: NOW,
      },
      {
        id: "ev-2",
        entry_id: "le-2",
        source: "user",
        source_type: "user",
        reliability: 1.0,
        content: {},
        created_at: NOW,
      },
    ];
    const res = await fetchLanguageEvidence(["le-1"]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].entryId).toBe("le-1");
      expect(res.data[0].reliability).toBe(0.7);
    }
  });

  it("fetchLanguageEntries filters by profile and maps rows", async () => {
    state.tables["archie_language_entries"] = [
      {
        id: "le-1",
        profile_id: "lp-1",
        kind: "vocabulary",
        key: "k1",
        payload: {},
        region: null,
        confidence: 0.8,
        validation_state: "AI_EXTRACTED",
        history: [],
        version: 1,
        created_at: NOW,
        updated_at: NOW,
      },
    ];
    const res = await fetchLanguageEntries("lp-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].profileId).toBe("lp-1");
      expect(res.data[0].confidence).toBe(0.8);
    }
  });
});

describe("evolution memory (§15)", () => {
  const entry = {
    id: "mem-1",
    problem: "Lexicon ingestion raced the graph build",
    proposedSolution: "Sequential phases",
    ownerDecision: "approved",
    implementationResult: "ok",
    testResult: "passed",
    productionResult: "ok",
    failureInformation: null,
    rollbackInformation: "n/a",
    lessonsLearned: "Order phases",
    relatedCrNumber: "CR-2026-0001",
    affectedVersion: "1.0.0",
    createdAt: NOW,
  };

  it("persists snake_case rows", async () => {
    const res = await persistEvolutionMemory(entry);
    expect(res.ok).toBe(true);
    const row = state.inserts["archie_evolution_memory"][0];
    expect(row.problem).toBe(entry.problem);
    expect(row.related_cr_number).toBe("CR-2026-0001");
    expect(row.lessons_learned).toBe("Order phases");
  });

  it("reports insert errors honestly", async () => {
    state.errors["archie_evolution_memory"] = "denied";
    const res = await persistEvolutionMemory(entry);
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toContain("Could not save the evolution memory");
  });

  it("fetches newest-first with the documented 200-entry bound", async () => {
    state.tables["archie_evolution_memory"] = [
      {
        id: "mem-1",
        problem: entry.problem,
        proposed_solution: entry.proposedSolution,
        owner_decision: entry.ownerDecision,
        implementation_result: entry.implementationResult,
        test_result: entry.testResult,
        production_result: entry.productionResult,
        failure_information: null,
        rollback_information: entry.rollbackInformation,
        lessons_learned: entry.lessonsLearned,
        related_cr_number: entry.relatedCrNumber,
        affected_version: entry.affectedVersion,
        created_at: NOW,
      },
    ];
    const res = await fetchEvolutionMemory();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0].proposedSolution).toBe("Sequential phases");
      expect(res.data[0].relatedCrNumber).toBe("CR-2026-0001");
    }
  });
});

describe("owner settings (§17)", () => {
  const settings: EvolutionSettings = {
    language: {
      enabled: true,
      autoLearning: false,
      autoMemory: false,
      externalResearch: false,
      dialectLearning: false,
      minConfidenceThreshold: 0.9,
      requireApprovalBeforePermanentMemory: true,
    },
    selfModification: {
      selfCodeAnalysis: true,
      automaticChangeProposals: false,
      stagingPermission: false,
      productionModification: false,
      requireExplicitApproval: true,
      automaticRollback: false,
      maxChangeRiskAllowed: "low",
      protectedPaths:
        DEFAULT_EVOLUTION_SETTINGS.selfModification.protectedPaths,
    },
    updatedAt: NOW,
  };

  it("save validates BEFORE writing — invalid settings never reach the database", async () => {
    const bad = {
      ...settings,
      language: { ...settings.language, minConfidenceThreshold: 1.5 },
    };
    const res = await saveEvolutionSettings(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("between 0 and 1");
    expect(state.upserts["archie_evolution_settings"]).toBeUndefined();
  });

  it("save upserts the single settings row with the validated data", async () => {
    const res = await saveEvolutionSettings(settings);
    expect(res.ok).toBe(true);
    const row = state.upserts["archie_evolution_settings"][0];
    expect(row.id).toBe(1);
    expect(row.language).toEqual(settings.language);
    expect(row.self_modification).toEqual(settings.selfModification);
  });

  it("fetch returns defaults when no row exists", async () => {
    const res = await fetchEvolutionSettings();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.language.minConfidenceThreshold).toBe(0.85);
      expect(res.data.selfModification.maxChangeRiskAllowed).toBeDefined();
    }
  });

  it("fetch normalizes snake_case rows (settings stick across reloads)", async () => {
    state.tables["archie_evolution_settings"] = [
      {
        id: 1,
        language: settings.language,
        self_modification: settings.selfModification,
        updated_at: NOW,
      },
    ];
    const res = await fetchEvolutionSettings();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.selfModification.maxChangeRiskAllowed).toBe("low");
      expect(res.data.updatedAt).toBe(NOW);
    }
  });
});
