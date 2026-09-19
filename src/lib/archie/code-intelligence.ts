// =========================================================
// FRELUX PHASE 8, ARCHIE CODE INTELLIGENCE
//
// ARCHIE may inspect AUTHORIZED FRELUX source code and learn
// the application architecture: frontend, backend, database,
// Supabase functions, APIs, calculator engines, auth, PWA,
// integrations, tests, dependencies, deployment configuration
// and documentation.
//
// ARCHIE may understand, explain, analyze and identify bugs,
// vulnerabilities, architectural problems and inconsistencies,
// and may generate implementation plans, code, tests and docs
// WHEN INSTRUCTED.
//
// ARCHIE has NO unrestricted production authority:
// read-only inspection, proposals and isolated-environment
// testing only. Production modification/deployment stays
// separately permission-controlled (engineering review + repo
// gates). These guards are enforced in code, not convention.
// =========================================================

import type { ArchieCodeFinding } from "./types";
import { AuthorizationRegistry } from "./capability-authority";

/** Authorized roots ARCHIE may inspect, nothing else. */
export const AUTHORIZED_CODE_ROOTS: readonly {
  root: string;
  area: ArchieCodeFinding["area"];
  description: string;
}[] = [
  {
    root: "src/pages",
    area: "frontend",
    description: "Application pages and routes",
  },
  { root: "src/components", area: "frontend", description: "UI components" },
  {
    root: "src/lib",
    area: "backend",
    description: "Business logic, engines, services",
  },
  {
    root: "src/lib/estimation",
    area: "backend",
    description: "Deterministic calculation engines",
  },
  { root: "src/App.tsx", area: "frontend", description: "Route table" },
  {
    root: "supabase/functions",
    area: "edge",
    description: "Supabase edge functions (APIs, integrations)",
  },
  {
    root: "supabase/migrations",
    area: "database",
    description: "Database schema and RLS policies",
  },
  { root: "docs", area: "config", description: "Documentation" },
  { root: "package.json", area: "deps", description: "Dependencies" },
  { root: "src/**/__tests__", area: "tests", description: "Test suites" },
  { root: "src/**/*.test.ts", area: "tests", description: "Test files" },
  {
    root: "vite.config.ts",
    area: "build",
    description: "Vite/build configuration",
  },
  {
    root: "tsconfig.json",
    area: "build",
    description: "TypeScript project config",
  },
  {
    root: "tsconfig.app.json",
    area: "build",
    description: "App TypeScript config",
  },
  {
    root: "netlify.toml",
    area: "deployment",
    description: "Deployment & CI/CD configuration",
  },
  {
    root: ".github/workflows",
    area: "deployment",
    description: "GitHub Actions CI/CD",
  },
  {
    root: "public",
    area: "frontend",
    description: "Static assets, PWA & service workers",
  },
  { root: "public/sw.js", area: "pwa", description: "PWA service worker" },
  {
    root: "src/lib/archie/mobile",
    area: "mobile",
    description: "Mobile/app architecture",
  },
  {
    root: "src/lib/engineering",
    area: "backend",
    description: "Engineering standards & review",
  },
  {
    root: "scripts",
    area: "build",
    description: "Build & generation scripts (JS/Python)",
  },
  {
    root: "supabase",
    area: "backend",
    description: "Backend: DB, edge functions, policies",
  },
];

// ---------------------------------------------------------
// Technology registry, extensible by design. ARCHIE is NOT
// artificially restricted to this list: new legitimate
// languages/frameworks/platforms FRELUX adopts can be
// registered, extending ARCHIE's authorized understanding.
// ---------------------------------------------------------
export interface TechnologyDescriptor {
  name: string;
  kind:
    "language" | "framework" | "platform" | "runtime" | "database" | "tooling";
  description: string;
}

const BASE_TECHNOLOGIES: TechnologyDescriptor[] = [
  {
    name: "TypeScript",
    kind: "language",
    description: "Primary application language",
  },
  {
    name: "JavaScript",
    kind: "language",
    description: "Scripts, config, service workers",
  },
  {
    name: "Python",
    kind: "language",
    description: "Automation & generation scripts",
  },
  {
    name: "SQL",
    kind: "language",
    description: "Database schema, policies, queries",
  },
  { name: "HTML", kind: "language", description: "Markup & SEO structure" },
  { name: "CSS", kind: "language", description: "Styling, theming, dark mode" },
  { name: "React", kind: "framework", description: "UI framework" },
  { name: "Vite", kind: "tooling", description: "Build system & config" },
  {
    name: "Supabase",
    kind: "database",
    description: "Postgres, auth, storage, edge functions",
  },
  {
    name: "PWA",
    kind: "platform",
    description: "Service workers, offline, installable web",
  },
  { name: "Android", kind: "platform", description: "Mobile app development" },
  { name: "iOS", kind: "platform", description: "Mobile app development" },
  { name: "Desktop", kind: "platform", description: "Desktop app development" },
  { name: "GitHub Actions", kind: "tooling", description: "CI/CD" },
  { name: "Netlify", kind: "platform", description: "Hosting & deployment" },
  { name: "Vitest", kind: "tooling", description: "Testing framework" },
  { name: "Deno", kind: "runtime", description: "Edge function runtime" },
];

/** Live registry, extensible, so ARCHIE grows with FRELUX. */
const registeredTechnologies: TechnologyDescriptor[] = [...BASE_TECHNOLOGIES];

/** Register a NEW legitimate technology ARCHIE may understand.
 *  This EXTENDS the registry, it cannot remove the base set
 *  or bypass the code authority model. */
export function registerTechnology(tech: TechnologyDescriptor): {
  ok: boolean;
  error?: string;
} {
  if (!tech.name.trim())
    return { ok: false, error: "A technology requires a name" };
  if (
    registeredTechnologies.some(
      (t) => t.name.toLowerCase() === tech.name.trim().toLowerCase(),
    )
  ) {
    return {
      ok: false,
      error: `Technology "${tech.name}" is already registered`,
    };
  }
  registeredTechnologies.push({ ...tech, name: tech.name.trim() });
  return { ok: true };
}

/** The current authorized technology surface. */
export function listTechnologies(): readonly TechnologyDescriptor[] {
  return registeredTechnologies;
}

/** Roots ARCHIE must NEVER touch, secrets, credentials, env. */
export const FORBIDDEN_CODE_ROOTS: readonly string[] = [
  ".env",
  ".env.local",
  "secrets",
  "credentials",
  "auth/migrations",
  "supabase/config",
];

/** May ARCHIE inspect this path at all? */
export function canInspectPath(path: string): { ok: boolean; error?: string } {
  const normalized = path.replace(/^\.?\//, "");
  for (const forbidden of FORBIDDEN_CODE_ROOTS) {
    if (
      normalized.startsWith(forbidden) ||
      normalized.includes(`/${forbidden}`)
    ) {
      return {
        ok: false,
        error: `Path "${path}" is outside ARCHIE's authorized code scope`,
      };
    }
  }
  const authorized = AUTHORIZED_CODE_ROOTS.some(({ root }) => {
    if (root.includes("*")) {
      const rx = new RegExp(
        "^" +
          root
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*") +
          "($|/)",
      );
      return rx.test(normalized);
    }
    return normalized === root || normalized.startsWith(`${root}/`);
  });
  if (!authorized) {
    return {
      ok: false,
      error: `Path "${path}" is outside ARCHIE's authorized code scope`,
    };
  }
  return { ok: true };
}

/** The authority model, fixed, not configurable by ARCHIE. */
export const ARCHIE_CODE_AUTHORITY = {
  mayInspect: true,
  mayExplain: true,
  mayAnalyze: true,
  mayGenerateCode: true, // when instructed, as proposals
  mayRunTests: true, // isolated environment only
  mayModifyProduction: false, // hard-false, never flipped
  mayDeploy: false, // hard-false, never flipped
} as const;

/** Can ARCHIE apply a code change to production? Always no. */
export function mayApplyToProduction(): false {
  return false; // Production modification requires the human repo gates
}

/** A code finding is ALWAYS a recommendation, this constructor
 *  makes it impossible to create an actionable finding. */
export function makeCodeFinding(
  finding: Omit<ArchieCodeFinding, "requires_engineering_review">,
): ArchieCodeFinding {
  return { ...finding, requires_engineering_review: true };
}

/** Validate findings returned by an analysis pass. */
export function validateCodeFindings(findings: ArchieCodeFinding[]): {
  ok: ArchieCodeFinding[];
  rejected: string[];
} {
  const ok: ArchieCodeFinding[] = [];
  const rejected: string[] = [];
  for (const f of findings) {
    const pathOk = f.path ? canInspectPath(f.path).ok : true;
    if (!pathOk || !f.requires_engineering_review) {
      rejected.push(f.summary.slice(0, 80));
      continue;
    }
    ok.push(f);
  }
  return { ok, rejected };
}

/** Code knowledge contributions enter as candidates through the
 *  standard pipeline: AI_RECOMMENDATION evidence state, always
 *  requiring engineering review. */
export function codeKnowledgeRequirements() {
  return {
    evidence_state: "AI_RECOMMENDATION" as const,
    requires_engineering_review: true,
    may_auto_promote: false,
  };
}

// =========================================================
// DEEP FRELUX CODE INTELLIGENCE — AUDIT & PATCH LAYER
// (session 2026-09-09 extension)
// =========================================================

// ---------------------------------------------------------
// Codebase layers — the inventory ARCHIE maintains
// ---------------------------------------------------------

export const FRELUX_CODEBASE_LAYERS = [
  "calculators",
  "measurement_engine",
  "material_rules",
  "quantity_formulas",
  "pricing",
  "waste_rules",
  "unit_conversions",
  "database_logic",
  "edge_functions",
  "apis",
  "frontend_logic",
  "backend_logic",
  "validation",
  "admin_configuration",
  "ai_integrations",
  "build_to_roof",
  "image_estimation",
  "pdf_generation",
  "shared_utilities",
] as const;

export type FreluxLayer = (typeof FRELUX_CODEBASE_LAYERS)[number];

/** Provenance of a number or rule. */
export type CalculationProvenance =
  | "REAL_DETERMINISTIC_CODE"
  | "DATABASE_CONFIG"
  | "VERIFIED_RULE"
  | "OWNER_TRADE_PRACTICE"
  | "EXTERNAL_DATA"
  | "AI_INFERENCE"
  | "HARDCODED_FALLBACK"
  | "PLACEHOLDER";

/** Provenance a result may NOT be silently accepted from. */
export const UNACCEPTABLE_PROVENANCE: ReadonlySet<CalculationProvenance> =
  new Set(["HARDCODED_FALLBACK", "PLACEHOLDER"]);

/** Provenance that is acceptable but must be disclosed. */
export const DISCLOSED_PROVENANCE: ReadonlySet<CalculationProvenance> = new Set(
  ["AI_INFERENCE", "EXTERNAL_DATA", "OWNER_TRADE_PRACTICE"],
);

// ---------------------------------------------------------
// Calculation trace — the full nine-step chain
// ---------------------------------------------------------

export const TRACE_STEPS = [
  "USER_INPUT",
  "VALIDATION",
  "MEASUREMENT",
  "RULES",
  "FORMULA",
  "MATERIAL_QUANTITY",
  "WASTE",
  "ROUNDING",
  "RESULT",
] as const;

export type TraceStep = (typeof TRACE_STEPS)[number];

export interface TraceStepRecord {
  step: TraceStep;
  /** Where the step's logic lives (file:line or config table). */
  location: string;
  provenance: CalculationProvenance;
  /** What was actually observed there. Required. */
  evidence: string;
}

export type TraceVerdict =
  | {
      valid: true;
      notes: string[];
      disclosures: string[];
    }
  | {
      valid: false;
      reason: string;
      step: TraceStep;
      ownerReviewRequired?: boolean;
    };

/**
 * Validate a calculation trace. A trace is functional only
 * when every step exists, carries evidence, and its
 * provenance is honest:
 *  - PLACEHOLDER / HARDCODED_FALLBACK at any step → invalid.
 *  - AI_INFERENCE / EXTERNAL_DATA / OWNER_TRADE_PRACTICE
 *    → valid but MUST be disclosed to the user.
 *  - An unknown rule is never invented — the trace is
 *    returned invalid with ownerReviewRequired.
 */
export function validateTrace(steps: TraceStepRecord[]): TraceVerdict {
  const seen = new Map<TraceStep, TraceStepRecord>();
  for (const s of steps) {
    if (!s.evidence.trim())
      return {
        valid: false,
        reason:
          "Trace step has no evidence — ARCHIE does not accept unverified steps.",
        step: s.step,
        ownerReviewRequired: true,
      };
    if (seen.has(s.step))
      return {
        valid: false,
        reason: `Duplicate trace step ${s.step}.`,
        step: s.step,
      };
    seen.set(s.step, s);
  }
  for (const step of TRACE_STEPS) {
    const rec = seen.get(step);
    if (!rec)
      return {
        valid: false,
        reason: `Trace is missing the ${step} step — a UI number alone proves nothing.`,
        step,
        ownerReviewRequired: true,
      };
    if (UNACCEPTABLE_PROVENANCE.has(rec.provenance))
      return {
        valid: false,
        reason: `${step} relies on ${rec.provenance} (${rec.location}). Replace with structured, testable logic or flag for owner review.`,
        step,
        ownerReviewRequired: true,
      };
  }
  const disclosures: string[] = [];
  const notes: string[] = [];
  for (const step of TRACE_STEPS) {
    const rec = seen.get(step)!;
    if (DISCLOSED_PROVENANCE.has(rec.provenance))
      disclosures.push(`${step}: ${rec.provenance} — disclosed to the user.`);
    notes.push(`${step}: ${rec.provenance} @ ${rec.location}`);
  }
  return { valid: true, notes, disclosures };
}

// ---------------------------------------------------------
// Code audit findings — evidence-gated, never fabricated
// ---------------------------------------------------------

export type CodeFindingType =
  | "PLACEHOLDER"
  | "HARDCODED_VALUE"
  | "MOCK_RESULT"
  | "FAKE_CALCULATION"
  | "DISCONNECTED_FUNCTION"
  | "INCORRECT_FORMULA"
  | "DUPLICATED_RULE"
  | "UNCONFIGURED_RULE"
  | "BROKEN_EDGE_FUNCTION"
  | "UNVERIFIED_PROVENANCE";

export type CodeFindingStatus =
  | "OPEN"
  | "OWNER_REVIEW" // unknown rule — owner must decide
  | "CONFIRMED_INTENTIONAL" // owner confirmed it is correct
  | "RESOLVED"; // fixed, with patch evidence

export interface CodeFinding {
  id: string;
  layer: FreluxLayer;
  type: CodeFindingType;
  /** file:line or table/function reference. */
  location: string;
  /** What was actually observed. Required — no fake findings. */
  evidence: string;
  /** What to change; omitted when the rule is unknown. */
  proposedFix?: string;
  status: CodeFindingStatus;
  /** How a RESOLVED finding was resolved, with real evidence. */
  resolution?: string;
  createdAt: string;
}

/** Record a code finding. Evidence is mandatory. */
export function recordCodeFinding(
  input: Omit<CodeFinding, "id" | "createdAt" | "status"> & {
    id?: string;
    status?: CodeFindingStatus;
    now?: string;
  },
): { ok: true; finding: CodeFinding } | { ok: false; error: string } {
  if (!input.location.trim())
    return { ok: false, error: "Finding location is required." };
  if (!input.evidence.trim())
    return {
      ok: false,
      error:
        "No evidence attached. ARCHIE does not record code findings without real observations.",
    };
  const status: CodeFindingStatus =
    input.status ??
    (input.type === "UNCONFIGURED_RULE" || !input.proposedFix
      ? "OWNER_REVIEW"
      : "OPEN");
  return {
    ok: true,
    finding: {
      ...input,
      id: input.id ?? `codefind_${Date.now().toString(36)}`,
      status,
      createdAt: input.now ?? new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------
// Patch proposals — prepared and tested, never applied
// to production without recorded owner approval
// ---------------------------------------------------------

export type PatchStatus =
  | "DRAFT" // being written
  | "TESTED" // tests pass, evidence recorded
  | "AWAITING_OWNER_APPROVAL" // ready, gated
  | "APPROVED" // owner approved (registry-backed)
  | "APPLIED" // applied to the repo (never silently to prod)
  | "REJECTED";

export interface PatchProposal {
  id: string;
  /** What it fixes, referencing finding ids. */
  fixes: string[];
  description: string;
  status: PatchStatus;
  /** Test evidence required before AWAITING_OWNER_APPROVAL. */
  testEvidence: string[];
  /** Authorization record id backing an approval. */
  approvalId?: string;
  createdAt: string;
}

/** Propose a patch for a set of findings. */
export function proposePatch(
  fixes: string[],
  description: string,
  now = new Date().toISOString(),
): { ok: true; patch: PatchProposal } | { ok: false; error: string } {
  if (fixes.length === 0)
    return {
      ok: false,
      error: "A patch must reference the findings it fixes.",
    };
  if (!description.trim())
    return { ok: false, error: "Patch description is required." };
  return {
    ok: true,
    patch: {
      id: `patch_${Date.now().toString(36)}`,
      fixes,
      description,
      status: "DRAFT",
      testEvidence: [],
      createdAt: now,
    },
  };
}

/** Record real test evidence and move to the approval gate.
 *  NO FAKE SUCCESS: empty or missing test evidence refuses. */
export function testPatch(
  patch: PatchProposal,
  testEvidence: string[],
): { ok: true; patch: PatchProposal } | { ok: false; error: string } {
  if (patch.status !== "DRAFT")
    return { ok: false, error: `Patch is ${patch.status}, not DRAFT.` };
  const ev = testEvidence.map((e) => e.trim()).filter(Boolean);
  if (ev.length === 0)
    return {
      ok: false,
      error:
        "Test evidence is required before a patch can await approval — untested code is not success.",
    };
  patch.testEvidence = ev;
  patch.status = "AWAITING_OWNER_APPROVAL";
  return { ok: true, patch };
}

/** Approve a patch — only with a live owner authorization for
 *  applying patches. ARCHIE itself can NEVER call this with
 *  its own authority; the registry decides. */
export function approvePatch(
  patch: PatchProposal,
  registry: AuthorizationRegistry,
  now = Date.now(),
): { ok: true; patch: PatchProposal } | { ok: false; error: string } {
  if (patch.status !== "AWAITING_OWNER_APPROVAL")
    return {
      ok: false,
      error: `Patch is ${patch.status}. Only tested patches awaiting approval can be approved.`,
    };
  if (!registry.has("apply_patch", patch.id, now))
    return {
      ok: false,
      error:
        "No recorded owner authorization for this patch. ARCHIE cannot approve its own changes — the Owner approves.",
    };
  patch.status = "APPROVED";
  return { ok: true, patch };
}

/** Apply an approved patch. Production deploys remain subject
 *  to the normal deploy pipeline (deploy_code authority). */
export function applyPatch(
  patch: PatchProposal,
): { ok: true; patch: PatchProposal } | { ok: false; error: string } {
  if (patch.status !== "APPROVED")
    return {
      ok: false,
      error: `Patch is ${patch.status}. Production changes require explicit owner approval first.`,
    };
  patch.status = "APPLIED";
  return { ok: true, patch };
}

// ---------------------------------------------------------
// AUDIT BASELINE — REAL findings from ARCHIE's actual scan
// of the FRELUX codebase (session 2026-09-09). Every entry
// carries file:line evidence. This list is updated as layers
// are audited; entries are never fabricated.
// ---------------------------------------------------------

export const FRELUX_AUDIT_BASELINE: readonly CodeFinding[] = [
  {
    id: "cf_paint_placeholder_step",
    layer: "quantity_formulas",
    type: "PLACEHOLDER",
    location: "src/lib/estimation/painting-engine.ts:594",
    evidence:
      "theoreticalCeilingLitres = ceilingQtyBuckets * 20; // placeholder, recalculated with actual packSizeLitres in Step 11",
    proposedFix:
      "Trace Step 11 to confirm the placeholder is always overwritten before the result is returned; if any path returns it, restructure the interim computation.",
    status: "RESOLVED",
    createdAt: "2026-09-09T00:00:00.000Z",
    resolution:
      "Trace verified 2026-09-09: Step 11 overwrites the variable in every reachable path under the same `room.include_ceiling` guard (area-based and per-room branches). The dead interim assignment was removed (comment documents the audit resolution). Evidence: 511 estimation+calc tests pass, typecheck clean.",
  },
  {
    id: "cf_calc_hardcoded_fallbacks",
    layer: "material_rules",
    type: "HARDCODED_VALUE",
    location: "src/lib/calc.ts:386",
    evidence:
      "comment: 'Use DB-driven override if provided, otherwise fall back to hardcoded factor' — surface-condition and color-condition factors have baked-in fallback constants when DB config is absent",
    proposedFix:
      "Migrate fallback factors to the admin configuration tables (estimation-config pattern) so every surface/color factor is database-driven; keep code fallback only as a documented owner-confirmed trade practice.",
    status: "RESOLVED",
    createdAt: "2026-09-09T00:00:00.000Z",
    resolution:
      "Intended rule KNOWN (documented industry-standard factors). Structured implementation added: resolveSurfaceFactor/resolveMinCoats with validated precedence per-condition DB override → scalar DB override → documented default; invalid configured values fall back safely. CalcConfig extended with surfaceFactorOverrides/minCoatsOverrides. Evidence: 10 new resolver tests, 78 calc tests, typecheck clean.",
  },
  {
    id: "cf_paint_material_cost_string",
    layer: "pricing",
    type: "UNVERIFIED_PROVENANCE",
    location: "src/lib/estimation/painting-engine.ts:124",
    evidence:
      'material_cost: string; // "₦XX,XXX" or "Not configured" — a money amount is modelled as a preformatted string',
    proposedFix:
      "Model money as a numeric value with currency, and format at the presentation layer. Requires owner decision on display contract.",
    status: "RESOLVED",
    createdAt: "2026-09-09T00:00:00.000Z",
    resolution:
      "Owner approved (2026-09-09). RoomCustomerSummary and PaintEngineCustomerSummary now carry material_cost as number | null (null = not configured) plus material_cost_formatted for display; UI renders the formatted value and tests on the numeric field. Evidence: 436 estimation + copilot tests pass, typecheck clean.",
  },
  {
    id: "cf_dual_paint_engines",
    layer: "material_rules",
    type: "DUPLICATED_RULE",
    location:
      "src/lib/estimation/paint-engine.ts vs src/lib/estimation/painting-engine.ts",
    evidence:
      "Two live paint estimation engines: paint-engine (used by PaintCalculator.tsx and admin AdminPaintEngineTest.tsx) and painting-engine (used by PaintingEstimator.tsx, which imports normalizeCoverage from paint-engine)",
    proposedFix:
      "Consolidate shared estimation rules into the central paint-engine as the single source of truth; keep the room-based engine as an orchestration layer over it.",
    status: "RESOLVED",
    createdAt: "2026-09-09T00:00:00.000Z",
    resolution:
      "Owner approved merge (2026-09-09). painting-engine no longer defines ANY shared rule: getPackSizeLitres, getRoundingRule, getStandardHeight and getCeilingQuantityBuckets are imported from and re-exported by the central paint-engine (identical semantics verified — including the standard-height fallback chain). painting-engine is now a room-based orchestration layer; the two calculators cannot disagree on a shared rule. Evidence: 436 estimation + copilot tests pass, typecheck clean.",
  },
];

/** Layers whose engines audited CLEAN in the 2026-09-09 scan:
 *  they explicitly source all business values from admin
 *  configuration. Clean means no placeholder found in the
 *  scan — not that the layer needs no future audit. */
export const AUDITED_CLEAN_EVIDENCE: readonly {
  layer: FreluxLayer;
  location: string;
  evidence: string;
}[] = [
  {
    layer: "pricing",
    location: "src/lib/measurement/cost-integration.ts:22",
    evidence:
      "comment: 'The engine does NOT hardcode prices. All prices come from the database'",
  },
  {
    layer: "material_rules",
    location: "src/lib/estimation/tyrolene-engine.ts:17",
    evidence:
      "comment: 'All business values come from database configuration (never hardcoded)'",
  },
  {
    layer: "quantity_formulas",
    location: "src/lib/estimation/paint-engine.ts:17",
    evidence:
      "comment: 'All values come from admin configuration (nothing hardcoded)'",
  },
];

/** Every Edge Function directory has an entry point — no
 *  orphaned/broken function skeletons were found in the
 *  2026-09-09 scan (the _shared directory is a library, not
 *  a function). */
export const EDGE_FUNCTION_SCAN_RESULT = {
  scannedAt: "2026-09-09",
  entryPoints: 53,
  missing: [] as string[],
  note: "_shared is a library directory without index.ts by design; deployment verification per-function is future work (needs live function status).",
} as const;
